package server

import (
	"context"
	"encoding/json"
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

type startedSession struct {
	name    string
	size    terminal.Size
	session *fakeSession
}

type fakeLauncher struct {
	started chan startedSession
}

func (l *fakeLauncher) Start(_ context.Context, name string, size terminal.Size) (terminal.Session, error) {
	s := newFakeSession()
	l.started <- startedSession{name: name, size: size, session: s}
	return s, nil
}

type fakeLister struct {
	mu    sync.Mutex
	names []string
}

func (f *fakeLister) List(context.Context) ([]string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.names...), nil
}

func (f *fakeLister) set(names ...string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.names = names
}

type fakeStore struct {
	mu    sync.Mutex
	value string
	saved []string
}

func (f *fakeStore) Load() (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.value, nil
}

func (f *fakeStore) Save(name string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.value = name
	f.saved = append(f.saved, name)
	return nil
}

func (f *fakeStore) last() string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.value
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
	lister  *fakeLister
	store   *fakeStore
	auth    *fakeAuth
	limiter *ratelimit.FailureLimiter
}

func setup(t *testing.T) env {
	t.Helper()
	l := &fakeLauncher{started: make(chan startedSession, 8)}
	lister := &fakeLister{names: []string{"itty"}}
	store := &fakeStore{}
	a := &fakeAuth{tickets: map[string]bool{"good": true}}
	lim := ratelimit.NewFailureLimiter(clock.System{}, 3, time.Minute)
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	ts := httptest.NewServer(New(Deps{Hostname: "localhost", Launcher: l, Sessions: lister, LastSession: store, DefaultSession: "itty", Auth: a, Limiter: lim, Log: log}))
	t.Cleanup(ts.Close)
	return env{ts: ts, base: strings.Replace(ts.URL, "127.0.0.1", "localhost", 1), launch: l, lister: lister, store: store, auth: a, limiter: lim}
}

func dial(ts *httptest.Server, origin, ticket string) (*websocket.Conn, *http.Response, error) {
	h := http.Header{}
	if origin != "" {
		h.Set("Origin", origin)
	}
	return websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(strings.Replace(ts.URL, "127.0.0.1", "localhost", 1), "http")+"/ws?ticket="+ticket, h)
}

func waitStarted(t *testing.T, l *fakeLauncher) startedSession {
	t.Helper()
	select {
	case s := <-l.started:
		return s
	case <-time.After(2 * time.Second):
		t.Fatal("no terminal session was started")
		return startedSession{}
	}
}

func noStart(t *testing.T, l *fakeLauncher) {
	t.Helper()
	select {
	case s := <-l.started:
		t.Fatalf("unexpected terminal session %q was started", s.name)
	case <-time.After(150 * time.Millisecond):
	}
}

func readControl(t *testing.T, conn *websocket.Conn) map[string]any {
	t.Helper()
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	typ, data, err := conn.ReadMessage()
	if err != nil || typ != websocket.TextMessage {
		t.Fatalf("expected a control message, got type=%d data=%q err=%v", typ, data, err)
	}
	var msg map[string]any
	if err := json.Unmarshal(data, &msg); err != nil {
		t.Fatal(err)
	}
	return msg
}

func readBinary(t *testing.T, conn *websocket.Conn) string {
	t.Helper()
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	typ, data, err := conn.ReadMessage()
	if err != nil || typ != websocket.BinaryMessage {
		t.Fatalf("expected terminal output, got type=%d data=%q err=%v", typ, data, err)
	}
	return string(data)
}

func connect(t *testing.T, e env) (*websocket.Conn, startedSession, map[string]any) {
	t.Helper()
	conn, _, err := dial(e.ts, "http://localhost", "good")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	if err := conn.WriteJSON(map[string]any{"type": "resize", "cols": 90, "rows": 30}); err != nil {
		t.Fatal(err)
	}
	started := waitStarted(t, e.launch)
	return conn, started, readControl(t, conn)
}

func sessionNames(msg map[string]any) []string {
	var names []string
	for _, n := range msg["sessions"].([]any) {
		names = append(names, n.(string))
	}
	return names
}

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestWebsocketBridgesTerminal(t *testing.T) {
	e := setup(t)
	conn, started, hello := connect(t, e)
	if started.size != (terminal.Size{Cols: 90, Rows: 30}) || started.name != "itty" {
		t.Fatalf("started %+v", started)
	}
	if hello["type"] != "sessions" || hello["current"] != "itty" {
		t.Fatalf("hello = %v", hello)
	}

	if err := conn.WriteMessage(websocket.BinaryMessage, []byte("ls\r")); err != nil {
		t.Fatal(err)
	}
	if got := string(<-started.session.fromClient); got != "ls\r" {
		t.Fatalf("terminal received %q", got)
	}

	started.session.toClient <- []byte("output")
	if got := readBinary(t, conn); got != "output" {
		t.Fatalf("got %q", got)
	}

	if err := conn.WriteJSON(map[string]any{"type": "resize", "cols": 100, "rows": 40}); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "resize", func() bool {
		started.session.mu.Lock()
		defer started.session.mu.Unlock()
		return len(started.session.sizes) == 1
	})
}

func TestClosingWebsocketEndsSession(t *testing.T) {
	e := setup(t)
	conn, started, _ := connect(t, e)
	conn.Close()
	select {
	case <-started.session.closed:
	case <-time.After(2 * time.Second):
		t.Fatal("session was not closed after websocket closed")
	}
}

func TestTerminalExitClosesTheWebsocket(t *testing.T) {
	e := setup(t)
	conn, started, _ := connect(t, e)
	_ = started.session.Close()
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, _, err := conn.ReadMessage(); err == nil {
		t.Fatal("expected the websocket to close when the terminal process ends")
	}
}

func TestAttachesTheLastUsedSessionWhenItStillExists(t *testing.T) {
	e := setup(t)
	e.lister.set("itty", "work")
	e.store.value = "work"
	_, started, hello := connect(t, e)
	if started.name != "work" || hello["current"] != "work" {
		t.Fatalf("started %q, hello %v", started.name, hello)
	}
	if got := sessionNames(hello); len(got) != 2 || got[0] != "itty" || got[1] != "work" {
		t.Fatalf("sessions = %v", got)
	}
}

func TestFallsBackToTheDefaultSessionWhenTheLastOneIsGone(t *testing.T) {
	e := setup(t)
	e.lister.set("itty", "work")
	e.store.value = "deleted"
	if _, started, _ := connect(t, e); started.name != "itty" {
		t.Fatalf("started %q, want the default session", started.name)
	}
}

func TestRemembersTheSessionItAttached(t *testing.T) {
	e := setup(t)
	connect(t, e)
	waitFor(t, "last session to be saved", func() bool { return e.store.last() == "itty" })
}

func TestSwitchMovesToAnotherSessionAndKeepsTheSize(t *testing.T) {
	e := setup(t)
	e.lister.set("itty", "work")
	conn, first, _ := connect(t, e)
	if err := conn.WriteJSON(map[string]any{"type": "resize", "cols": 100, "rows": 40}); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "resize", func() bool {
		first.session.mu.Lock()
		defer first.session.mu.Unlock()
		return len(first.session.sizes) == 1
	})

	if err := conn.WriteJSON(map[string]any{"type": "switch", "session": "work"}); err != nil {
		t.Fatal(err)
	}
	second := waitStarted(t, e.launch)
	if second.name != "work" || second.size != (terminal.Size{Cols: 100, Rows: 40}) {
		t.Fatalf("second session %+v", second)
	}
	if msg := readControl(t, conn); msg["type"] != "sessions" || msg["current"] != "work" {
		t.Fatalf("message after switch = %v", msg)
	}
	select {
	case <-first.session.closed:
	case <-time.After(2 * time.Second):
		t.Fatal("the previous session was not closed")
	}
	waitFor(t, "last session to be saved", func() bool { return e.store.last() == "work" })

	second.session.toClient <- []byte("from work")
	if got := readBinary(t, conn); got != "from work" {
		t.Fatalf("got %q", got)
	}
	if err := conn.WriteMessage(websocket.BinaryMessage, []byte("x")); err != nil {
		t.Fatal(err)
	}
	if got := string(<-second.session.fromClient); got != "x" {
		t.Fatalf("input went to the wrong session: %q", got)
	}
}

func TestSwitchToAnUnknownSessionIsRejected(t *testing.T) {
	e := setup(t)
	conn, first, _ := connect(t, e)
	for _, name := range []string{"nope", "", "-t evil", "itty:0"} {
		if err := conn.WriteJSON(map[string]any{"type": "switch", "session": name}); err != nil {
			t.Fatal(err)
		}
		if msg := readControl(t, conn); msg["type"] != "error" {
			t.Fatalf("session %q: message = %v", name, msg)
		}
	}
	noStart(t, e.launch)
	select {
	case <-first.session.closed:
		t.Fatal("a rejected switch must leave the current session running")
	default:
	}
}

func TestSwitchAcceptsTheDefaultSessionEvenWhenItIsNotRunning(t *testing.T) {
	e := setup(t)
	e.lister.set("work")
	e.store.value = "work"
	conn, started, _ := connect(t, e)
	if started.name != "work" {
		t.Fatalf("started %q", started.name)
	}
	if err := conn.WriteJSON(map[string]any{"type": "switch", "session": "itty"}); err != nil {
		t.Fatal(err)
	}
	if got := waitStarted(t, e.launch); got.name != "itty" {
		t.Fatalf("started %q", got.name)
	}
}

func TestListReturnsTheCurrentSessions(t *testing.T) {
	e := setup(t)
	conn, _, _ := connect(t, e)
	e.lister.set("itty", "work", "zeta")
	if err := conn.WriteJSON(map[string]any{"type": "list"}); err != nil {
		t.Fatal(err)
	}
	msg := readControl(t, conn)
	if got := sessionNames(msg); len(got) != 3 || got[2] != "zeta" || msg["current"] != "itty" {
		t.Fatalf("msg = %v", msg)
	}
}

func TestSwitchingKeepsTheConnectionOpenAfterTheOldSessionEnds(t *testing.T) {
	e := setup(t)
	e.lister.set("itty", "work")
	conn, _, _ := connect(t, e)
	_ = conn.WriteJSON(map[string]any{"type": "switch", "session": "work"})
	second := waitStarted(t, e.launch)
	readControl(t, conn)
	time.Sleep(100 * time.Millisecond)
	second.session.toClient <- []byte("still here")
	if got := readBinary(t, conn); got != "still here" {
		t.Fatalf("got %q", got)
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
	noStart(t, l)
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
