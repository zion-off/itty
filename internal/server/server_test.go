package server

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/gorilla/websocket"

	"github.com/zion/itty/internal/clock"
	"github.com/zion/itty/internal/ratelimit"
	"github.com/zion/itty/internal/terminal"
)

type fakeSession struct {
	toClient   chan []byte
	fromClient chan []byte
	mu         sync.Mutex
	sizes      []terminal.Size
	closed     chan struct{}
	closeOnce  sync.Once
}

func newFakeSession() *fakeSession {
	return &fakeSession{toClient: make(chan []byte, 8), fromClient: make(chan []byte, 8), closed: make(chan struct{})}
}

func (f *fakeSession) Read(p []byte) (int, error) {
	select {
	case b := <-f.toClient:
		return copy(p, b), nil
	case <-f.closed:
		return 0, io.EOF
	}
}

func (f *fakeSession) Write(p []byte) (int, error) {
	f.fromClient <- append([]byte(nil), p...)
	return len(p), nil
}

func (f *fakeSession) Resize(s terminal.Size) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sizes = append(f.sizes, s)
	return nil
}

func (f *fakeSession) Close() error {
	f.closeOnce.Do(func() { close(f.closed) })
	return nil
}

func (f *fakeSession) Wait() (int, error) { <-f.closed; return 0, nil }

type fakeLauncher struct {
	session *fakeSession
	started chan terminal.Size
}

func (l *fakeLauncher) Start(_ context.Context, size terminal.Size) (terminal.Session, error) {
	l.started <- size
	return l.session, nil
}

type fakeAuth struct {
	tickets          map[string]bool
	enrollmentActive bool
	loginErr         error
}

func (a *fakeAuth) BeginLogin() (*protocol.CredentialAssertion, string, error) {
	return &protocol.CredentialAssertion{}, "chal", nil
}

func (a *fakeAuth) FinishLogin(string, *http.Request) (string, error) {
	if a.loginErr != nil {
		return "", a.loginErr
	}
	a.tickets["t1"] = true
	return "t1", nil
}

func (a *fakeAuth) RedeemTicket(t string) bool {
	ok := a.tickets[t]
	delete(a.tickets, t)
	return ok
}

func (a *fakeAuth) EnrollmentActive() bool { return a.enrollmentActive }

func (a *fakeAuth) BeginEnrollment(string) (*protocol.CredentialCreation, string, error) {
	return &protocol.CredentialCreation{}, "enr", nil
}

func (a *fakeAuth) FinishEnrollment(string, *http.Request) error { return nil }

type env struct {
	ts      *httptest.Server
	base    string
	launch  *fakeLauncher
	auth    *fakeAuth
	limiter *ratelimit.FailureLimiter
}

func setup(t *testing.T) env {
	t.Helper()
	l := &fakeLauncher{session: newFakeSession(), started: make(chan terminal.Size, 1)}
	a := &fakeAuth{tickets: map[string]bool{"good": true}}
	lim := ratelimit.NewFailureLimiter(clock.System{}, 3, time.Minute)
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	ts := httptest.NewServer(New(Deps{Hostname: "localhost", Launcher: l, Auth: a, Limiter: lim, Log: log}))
	t.Cleanup(ts.Close)
	return env{ts: ts, base: strings.Replace(ts.URL, "127.0.0.1", "localhost", 1), launch: l, auth: a, limiter: lim}
}

func dial(ts *httptest.Server, origin, ticket string) (*websocket.Conn, *http.Response, error) {
	h := http.Header{}
	if origin != "" {
		h.Set("Origin", origin)
	}
	return websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(strings.Replace(ts.URL, "127.0.0.1", "localhost", 1), "http")+"/ws?ticket="+ticket, h)
}

func TestWebsocketBridgesTerminal(t *testing.T) {
	e := setup(t)
	l := e.launch
	conn, _, err := dial(e.ts, "http://localhost:8080", "good")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	if err := conn.WriteJSON(map[string]any{"type": "resize", "cols": 90, "rows": 30}); err != nil {
		t.Fatal(err)
	}
	if got := <-l.started; got != (terminal.Size{Cols: 90, Rows: 30}) {
		t.Fatalf("started with %+v", got)
	}

	if err := conn.WriteMessage(websocket.BinaryMessage, []byte("ls\r")); err != nil {
		t.Fatal(err)
	}
	if got := string(<-l.session.fromClient); got != "ls\r" {
		t.Fatalf("terminal received %q", got)
	}

	l.session.toClient <- []byte("output")
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	typ, data, err := conn.ReadMessage()
	if err != nil || typ != websocket.BinaryMessage || string(data) != "output" {
		t.Fatalf("got %d %q %v", typ, data, err)
	}

	if err := conn.WriteJSON(map[string]any{"type": "resize", "cols": 100, "rows": 40}); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(2 * time.Second)
	for {
		l.session.mu.Lock()
		n := len(l.session.sizes)
		l.session.mu.Unlock()
		if n == 1 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("resize never applied")
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestClosingWebsocketEndsSession(t *testing.T) {
	e := setup(t)
	l := e.launch
	conn, _, err := dial(e.ts, "http://localhost", "good")
	if err != nil {
		t.Fatal(err)
	}
	_ = conn.WriteJSON(map[string]any{"type": "resize", "cols": 80, "rows": 24})
	<-l.started
	conn.Close()
	select {
	case <-l.session.closed:
	case <-time.After(2 * time.Second):
		t.Fatal("session was not closed after websocket closed")
	}
}

func TestWebsocketRejectsForeignOrigin(t *testing.T) {
	e := setup(t)
	l := e.launch
	for _, origin := range []string{"", "http://evil.example.com"} {
		if _, resp, err := dial(e.ts, origin, "good"); err == nil || resp == nil || resp.StatusCode != http.StatusForbidden {
			t.Fatalf("origin %q: expected 403, got err=%v resp=%v", origin, err, resp)
		}
	}
	select {
	case <-l.started:
		t.Fatal("terminal started for a rejected origin")
	default:
	}
}

func TestWebsocketRejectsBadTicketAndConsumesGoodOne(t *testing.T) {
	e := setup(t)
	if _, resp, err := dial(e.ts, "http://localhost", "bad"); err == nil || resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("bad ticket: err=%v resp=%v", err, resp)
	}
	if _, resp, err := dial(e.ts, "http://localhost", ""); err == nil || resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("missing ticket: err=%v resp=%v", err, resp)
	}
	conn, _, err := dial(e.ts, "http://localhost", "good")
	if err != nil {
		t.Fatal(err)
	}
	conn.Close()
	if _, resp, err := dial(e.ts, "http://localhost", "good"); err == nil || resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("ticket reuse: err=%v resp=%v", err, resp)
	}
}

func TestOriginRejectionDoesNotConsumeTicket(t *testing.T) {
	e := setup(t)
	_, _, _ = dial(e.ts, "http://evil.example.com", "good")
	if !e.auth.tickets["good"] {
		t.Fatal("ticket consumed by a rejected request")
	}
}

func TestRequestsForOtherHostsGetNoResponse(t *testing.T) {
	e := setup(t)
	req, _ := http.NewRequest("GET", e.base+"/", nil)
	req.Host = "203.0.113.5"
	if resp, err := http.DefaultClient.Do(req); err == nil {
		resp.Body.Close()
		t.Fatalf("expected the connection to be dropped, got %d", resp.StatusCode)
	}
}

func TestEnrollmentIsNotFoundUnlessActive(t *testing.T) {
	e := setup(t)
	for _, path := range []string{"/enroll"} {
		resp, _ := http.Get(e.base + path)
		resp.Body.Close()
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("GET %s = %d", path, resp.StatusCode)
		}
	}
	for _, path := range []string{"/enroll/begin", "/enroll/finish"} {
		resp, _ := http.Post(e.base+path, "application/json", strings.NewReader(`{}`))
		resp.Body.Close()
		if resp.StatusCode != http.StatusNotFound {
			t.Fatalf("POST %s = %d", path, resp.StatusCode)
		}
	}
	e.auth.enrollmentActive = true
	resp, _ := http.Get(e.base + "/enroll")
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("active enrollment page = %d", resp.StatusCode)
	}
}

func TestRepeatedFailedLoginsAreRateLimited(t *testing.T) {
	e := setup(t)
	e.auth.loginErr = errors.New("bad signature")
	post := func() int {
		resp, err := http.Post(e.base+"/auth/verify?id=x", "application/json", strings.NewReader(`{}`))
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp.StatusCode
	}
	for i := 0; i < 3; i++ {
		if got := post(); got != http.StatusUnauthorized {
			t.Fatalf("attempt %d = %d", i, got)
		}
	}
	if got := post(); got != http.StatusTooManyRequests {
		t.Fatalf("4th attempt = %d, want 429", got)
	}
	e.auth.loginErr = nil
	if got := post(); got != http.StatusTooManyRequests {
		t.Fatalf("limit must also block a valid attempt, got %d", got)
	}
}

func TestLoginReturnsTicket(t *testing.T) {
	e := setup(t)
	resp, err := http.Post(e.base+"/auth/verify?id=x", "application/json", strings.NewReader(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 || !strings.Contains(string(body), `"ticket":"t1"`) {
		t.Fatalf("%d %s", resp.StatusCode, body)
	}
}

func TestServesClient(t *testing.T) {
	e := setup(t)
	resp, err := http.Get(e.base + "/")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 || !strings.Contains(string(body), "xterm") {
		t.Fatalf("unexpected response %d %s", resp.StatusCode, body)
	}
}

func TestParseResizeRejectsInvalid(t *testing.T) {
	for _, in := range []string{`{}`, `{"type":"resize","cols":0,"rows":10}`, `nope`} {
		if _, err := parseResize([]byte(in)); err == nil {
			t.Fatalf("expected error for %s", in)
		}
	}
}

type fakeCerts struct{ days int }

func (f fakeCerts) DaysRemaining() (int, error) { return f.days, nil }

func TestStatusReportsCertificateDays(t *testing.T) {
	e := setup(t)
	body := func(h http.Handler) string {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest("GET", "http://localhost/status", nil)
		h.ServeHTTP(rec, req)
		return strings.TrimSpace(rec.Body.String())
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	withCerts := New(Deps{Hostname: "localhost", Launcher: e.launch, Auth: e.auth, Limiter: e.limiter, Certs: fakeCerts{days: 9}, Log: log})
	if got := body(withCerts); got != `{"cert_days_remaining":9}` {
		t.Fatalf("got %s", got)
	}
	withoutCerts := New(Deps{Hostname: "localhost", Launcher: e.launch, Auth: e.auth, Limiter: e.limiter, Log: log})
	if got := body(withoutCerts); got != `{}` {
		t.Fatalf("got %s", got)
	}
}
