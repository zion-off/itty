package auth

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
)

const (
	kindChallenge  = "challenge"
	kindEnrollment = "enrollment"
	kindTicket     = "ticket"
)

var (
	ErrNoCredentials = errors.New("no passkey is enrolled")
	ErrInvalid       = errors.New("invalid or expired value")
)

type Lifetimes struct {
	Challenge time.Duration
	Ticket    time.Duration
}

func DefaultLifetimes() Lifetimes {
	return Lifetimes{Challenge: 2 * time.Minute, Ticket: 15 * time.Second}
}

type Service struct {
	wa        *webauthn.WebAuthn
	creds     CredentialStore
	once      OneTimeStore
	links     EnrollmentLinks
	lifetimes Lifetimes
	log       *slog.Logger
}

func NewService(wa *webauthn.WebAuthn, creds CredentialStore, once OneTimeStore, links EnrollmentLinks, lt Lifetimes, log *slog.Logger) *Service {
	return &Service{wa: wa, creds: creds, once: once, links: links, lifetimes: lt, log: log}
}

func NewWebAuthn(hostname string, origins []string) (*webauthn.WebAuthn, error) {
	return webauthn.New(&webauthn.Config{
		RPDisplayName: "itty",
		RPID:          hostname,
		RPOrigins:     origins,
		AuthenticatorSelection: protocol.AuthenticatorSelection{
			ResidentKey:      protocol.ResidentKeyRequirementPreferred,
			UserVerification: protocol.VerificationRequired,
		},
	})
}

type operator struct {
	creds []webauthn.Credential
}

var operatorID = []byte("itty-operator")

func (o operator) WebAuthnID() []byte                         { return operatorID }
func (o operator) WebAuthnName() string                       { return "operator" }
func (o operator) WebAuthnDisplayName() string                { return "itty operator" }
func (o operator) WebAuthnCredentials() []webauthn.Credential { return o.creds }

func (s *Service) operator() (operator, error) {
	creds, err := s.creds.List()
	if err != nil {
		return operator{}, err
	}
	return operator{creds: creds}, nil
}

type sessionEnvelope struct {
	Session webauthn.SessionData `json:"session"`
	Token   string               `json:"token,omitempty"`
}

func (s *Service) BeginLogin() (*protocol.CredentialAssertion, string, error) {
	op, err := s.operator()
	if err != nil {
		return nil, "", err
	}
	if len(op.creds) == 0 {
		return nil, "", ErrNoCredentials
	}
	assertion, session, err := s.wa.BeginLogin(op, webauthn.WithUserVerification(protocol.VerificationRequired))
	if err != nil {
		return nil, "", fmt.Errorf("begin login: %w", err)
	}
	id, err := s.stash(kindChallenge, sessionEnvelope{Session: *session}, s.lifetimes.Challenge)
	if err != nil {
		return nil, "", err
	}
	return assertion, id, nil
}

func (s *Service) FinishLogin(challengeID string, r *http.Request) (string, error) {
	env, err := s.unstash(kindChallenge, challengeID)
	if err != nil {
		return "", err
	}
	op, err := s.operator()
	if err != nil {
		return "", err
	}
	cred, err := s.wa.FinishLogin(op, env.Session, r)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	if err := s.creds.Update(*cred); err != nil {
		return "", fmt.Errorf("update credential counter: %w", err)
	}
	ticket, err := randomID()
	if err != nil {
		return "", err
	}
	s.once.Put(kindTicket, ticket, nil, s.lifetimes.Ticket)
	return ticket, nil
}

func (s *Service) RedeemTicket(ticket string) bool {
	_, ok := s.once.Take(kindTicket, ticket)
	return ok
}

func (s *Service) EnrollmentActive() bool { return s.links.Active() }

func (s *Service) BeginEnrollment(token string) (*protocol.CredentialCreation, string, error) {
	if !s.links.Valid(token) {
		return nil, "", ErrInvalid
	}
	op, err := s.operator()
	if err != nil {
		return nil, "", err
	}
	creation, session, err := s.wa.BeginRegistration(op,
		webauthn.WithExclusions(webauthn.Credentials(op.creds).CredentialDescriptors()),
		webauthn.WithAuthenticatorSelection(protocol.AuthenticatorSelection{
			ResidentKey:      protocol.ResidentKeyRequirementPreferred,
			UserVerification: protocol.VerificationRequired,
		}))
	if err != nil {
		return nil, "", fmt.Errorf("begin registration: %w", err)
	}
	id, err := s.stash(kindEnrollment, sessionEnvelope{Session: *session, Token: token}, s.lifetimes.Challenge)
	if err != nil {
		return nil, "", err
	}
	return creation, id, nil
}

func (s *Service) FinishEnrollment(challengeID string, r *http.Request) error {
	env, err := s.unstash(kindEnrollment, challengeID)
	if err != nil {
		return err
	}
	if !s.links.Valid(env.Token) {
		return ErrInvalid
	}
	op, err := s.operator()
	if err != nil {
		return err
	}
	cred, err := s.wa.FinishRegistration(op, env.Session, r)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	if !s.links.Consume(env.Token) {
		return ErrInvalid
	}
	return s.creds.Add(*cred)
}

func (s *Service) stash(kind string, env sessionEnvelope, ttl time.Duration) (string, error) {
	raw, err := json.Marshal(env)
	if err != nil {
		return "", err
	}
	id, err := randomID()
	if err != nil {
		return "", err
	}
	s.once.Put(kind, id, raw, ttl)
	return id, nil
}

func (s *Service) unstash(kind, id string) (sessionEnvelope, error) {
	raw, ok := s.once.Take(kind, id)
	if !ok {
		return sessionEnvelope{}, ErrInvalid
	}
	var env sessionEnvelope
	if err := json.NewDecoder(bytes.NewReader(raw)).Decode(&env); err != nil {
		return sessionEnvelope{}, err
	}
	return env, nil
}

func randomID() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate random id: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
