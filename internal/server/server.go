package server

import (
	"context"
	"log/slog"
	"net"
	"net/http"

	"github.com/go-webauthn/webauthn/protocol"

	"github.com/zion/itty/internal/ratelimit"
	"github.com/zion/itty/internal/terminal"
	"github.com/zion/itty/web"
)

type Authenticator interface {
	BeginLogin() (*protocol.CredentialAssertion, string, error)
	FinishLogin(challengeID string, r *http.Request) (string, error)
	RedeemTicket(ticket string) bool
	EnrollmentActive() bool
	BeginEnrollment(token string) (*protocol.CredentialCreation, string, error)
	FinishEnrollment(challengeID string, r *http.Request) error
}

type PrefixSource interface {
	Prefix(ctx context.Context) (string, error)
}

type CertStatus interface {
	DaysRemaining() (int, error)
}

type Deps struct {
	Hostname string
	Launcher terminal.Launcher
	Auth     Authenticator
	Limiter  ratelimit.Limiter
	Certs    CertStatus
	Prefix   PrefixSource
	Log      *slog.Logger
}

type Server struct {
	Deps
}

func New(d Deps) http.Handler {
	s := &Server{Deps: d}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /auth/challenge", s.handleChallenge)
	mux.HandleFunc("POST /auth/verify", s.handleVerify)
	mux.HandleFunc("GET /enroll", s.handleEnrollPage)
	mux.HandleFunc("POST /enroll/begin", s.handleEnrollBegin)
	mux.HandleFunc("POST /enroll/finish", s.handleEnrollFinish)
	mux.HandleFunc("GET /status", s.handleStatus)
	mux.HandleFunc("GET /ws", s.handleWebsocket)
	mux.Handle("GET /", http.FileServerFS(web.Files()))
	return s.requireHostname(mux)
}

func (s *Server) requireHostname(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if hostOf(r.Host) != s.Hostname {
			s.Log.Warn("request rejected for unexpected host", "host", r.Host, "remote", r.RemoteAddr)
			dropConnection(w)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func dropConnection(w http.ResponseWriter) {
	if h, ok := w.(http.Hijacker); ok {
		if conn, _, err := h.Hijack(); err == nil {
			_ = conn.Close()
			return
		}
	}
	http.Error(w, "", http.StatusNotFound)
}

func hostOf(hostport string) string {
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		return h
	}
	return hostport
}

func sourceKey(r *http.Request) string {
	if h, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return h
	}
	return r.RemoteAddr
}

func (s *Server) handleStatus(w http.ResponseWriter, _ *http.Request) {
	status := map[string]int{}
	if s.Certs != nil {
		if days, err := s.Certs.DaysRemaining(); err != nil {
			s.Log.Error("certificate expiry lookup failed", "error", err)
		} else {
			status["cert_days_remaining"] = days
		}
	}
	writeJSON(w, status)
}
