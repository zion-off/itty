package auth

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/fxamacker/cbor/v2"

	"github.com/zion/itty/internal/clock"
)

const (
	testHost   = "itty.example.com"
	testOrigin = "https://itty.example.com"
)

var b64 = base64.RawURLEncoding

type softKey struct {
	priv  *ecdsa.PrivateKey
	id    []byte
	count uint32
}

func newSoftKey(t *testing.T) *softKey {
	t.Helper()
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	id := make([]byte, 32)
	_, _ = rand.Read(id)
	return &softKey{priv: priv, id: id}
}

func (k *softKey) authData(flags byte, attested bool) []byte {
	rpHash := sha256.Sum256([]byte(testHost))
	var buf bytes.Buffer
	buf.Write(rpHash[:])
	buf.WriteByte(flags)
	_ = binary.Write(&buf, binary.BigEndian, k.count)
	if attested {
		buf.Write(make([]byte, 16))
		_ = binary.Write(&buf, binary.BigEndian, uint16(len(k.id)))
		buf.Write(k.id)
		x := k.priv.X.FillBytes(make([]byte, 32))
		y := k.priv.Y.FillBytes(make([]byte, 32))
		cose, _ := cbor.Marshal(map[int]any{1: 2, 3: -7, -1: 1, -2: x, -3: y})
		buf.Write(cose)
	}
	return buf.Bytes()
}

func clientData(kind, challenge, origin string) []byte {
	raw, _ := json.Marshal(map[string]any{"type": kind, "challenge": challenge, "origin": origin})
	return raw
}

func jsonRequest(t *testing.T, body any) *http.Request {
	t.Helper()
	raw, _ := json.Marshal(body)
	r := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(raw))
	r.Header.Set("Content-Type", "application/json")
	return r
}

func (k *softKey) registrationRequest(t *testing.T, challenge string) *http.Request {
	att, _ := cbor.Marshal(map[string]any{"fmt": "none", "attStmt": map[string]any{}, "authData": k.authData(0x45, true)})
	return jsonRequest(t, map[string]any{
		"id": b64.EncodeToString(k.id), "rawId": b64.EncodeToString(k.id), "type": "public-key",
		"response": map[string]any{
			"clientDataJSON":    b64.EncodeToString(clientData("webauthn.create", challenge, testOrigin)),
			"attestationObject": b64.EncodeToString(att),
		},
	})
}

func (k *softKey) assertionRequest(t *testing.T, challenge, origin string) *http.Request {
	k.count++
	auth := k.authData(0x05, false)
	cd := clientData("webauthn.get", challenge, origin)
	cdHash := sha256.Sum256(cd)
	digest := sha256.Sum256(append(append([]byte{}, auth...), cdHash[:]...))
	sig, err := ecdsa.SignASN1(rand.Reader, k.priv, digest[:])
	if err != nil {
		t.Fatal(err)
	}
	return jsonRequest(t, map[string]any{
		"id": b64.EncodeToString(k.id), "rawId": b64.EncodeToString(k.id), "type": "public-key",
		"response": map[string]any{
			"clientDataJSON":    b64.EncodeToString(cd),
			"authenticatorData": b64.EncodeToString(auth),
			"signature":         b64.EncodeToString(sig),
			"userHandle":        b64.EncodeToString(operatorID),
		},
	})
}

type fixture struct {
	svc   *Service
	links *FileEnrollmentLinks
	clock *clock.Fake
}

func newFixture(t *testing.T) fixture {
	t.Helper()
	c := &clock.Fake{T: time.Now()}
	dir := t.TempDir()
	wa, err := NewWebAuthn(testHost, []string{testOrigin})
	if err != nil {
		t.Fatal(err)
	}
	links := NewFileEnrollmentLinks(filepath.Join(dir, "enroll.json"), c, discardLog())
	svc := NewService(wa, NewFileCredentialStore(filepath.Join(dir, "creds.json"), discardLog()),
		NewMemoryOneTimeStore(c), links, DefaultLifetimes(), discardLog())
	return fixture{svc: svc, links: links, clock: c}
}

func (f fixture) enroll(t *testing.T, k *softKey) {
	t.Helper()
	token, err := f.links.Create(time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	creation, id, err := f.svc.BeginEnrollment(token)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.svc.FinishEnrollment(id, k.registrationRequest(t, creation.Response.Challenge.String())); err != nil {
		t.Fatalf("finish enrollment: %v", err)
	}
}

func (f fixture) beginLogin(t *testing.T) (string, string) {
	t.Helper()
	assertion, id, err := f.svc.BeginLogin()
	if err != nil {
		t.Fatal(err)
	}
	return assertion.Response.Challenge.String(), id
}

func TestLoginRequiresEnrolledPasskey(t *testing.T) {
	f := newFixture(t)
	if _, _, err := f.svc.BeginLogin(); err != ErrNoCredentials {
		t.Fatalf("err = %v", err)
	}
}

func TestEnrollThenLoginIssuesSingleUseTicket(t *testing.T) {
	f := newFixture(t)
	k := newSoftKey(t)
	f.enroll(t, k)
	if f.svc.EnrollmentActive() {
		t.Fatal("enrollment link should be consumed")
	}

	challenge, id := f.beginLogin(t)
	ticket, err := f.svc.FinishLogin(id, k.assertionRequest(t, challenge, testOrigin))
	if err != nil {
		t.Fatalf("login: %v", err)
	}
	if !f.svc.RedeemTicket(ticket) {
		t.Fatal("ticket should be valid once")
	}
	if f.svc.RedeemTicket(ticket) {
		t.Fatal("ticket must be single-use")
	}
}

func TestTicketExpires(t *testing.T) {
	f := newFixture(t)
	k := newSoftKey(t)
	f.enroll(t, k)
	challenge, id := f.beginLogin(t)
	ticket, _ := f.svc.FinishLogin(id, k.assertionRequest(t, challenge, testOrigin))
	f.clock.Advance(DefaultLifetimes().Ticket)
	if f.svc.RedeemTicket(ticket) {
		t.Fatal("expired ticket accepted")
	}
}

func TestChallengeIsSingleUse(t *testing.T) {
	f := newFixture(t)
	k := newSoftKey(t)
	f.enroll(t, k)
	challenge, id := f.beginLogin(t)
	req := func() *http.Request { return k.assertionRequest(t, challenge, testOrigin) }
	if _, err := f.svc.FinishLogin(id, req()); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.FinishLogin(id, req()); err == nil {
		t.Fatal("replayed challenge accepted")
	}
}

func TestLoginRejectsWrongOriginAndWrongKey(t *testing.T) {
	f := newFixture(t)
	k := newSoftKey(t)
	f.enroll(t, k)

	challenge, id := f.beginLogin(t)
	if _, err := f.svc.FinishLogin(id, k.assertionRequest(t, challenge, "https://evil.example.com")); err == nil {
		t.Fatal("wrong origin accepted")
	}

	challenge, id = f.beginLogin(t)
	imposter := newSoftKey(t)
	imposter.id = k.id
	if _, err := f.svc.FinishLogin(id, imposter.assertionRequest(t, challenge, testOrigin)); err == nil {
		t.Fatal("assertion signed by another key accepted")
	}
}

func TestChallengeExpires(t *testing.T) {
	f := newFixture(t)
	k := newSoftKey(t)
	f.enroll(t, k)
	challenge, id := f.beginLogin(t)
	f.clock.Advance(DefaultLifetimes().Challenge)
	if _, err := f.svc.FinishLogin(id, k.assertionRequest(t, challenge, testOrigin)); err == nil {
		t.Fatal("expired challenge accepted")
	}
}

func TestEnrollmentRequiresValidLink(t *testing.T) {
	f := newFixture(t)
	if _, _, err := f.svc.BeginEnrollment("guess"); err == nil {
		t.Fatal("enrollment began without a link")
	}
}
