package server

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"

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

func setup(t *testing.T) (*httptest.Server, *fakeLauncher) {
	t.Helper()
	l := &fakeLauncher{session: newFakeSession(), started: make(chan terminal.Size, 1)}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	ts := httptest.NewServer(New("localhost", l, log))
	t.Cleanup(ts.Close)
	return ts, l
}

func dial(ts *httptest.Server, origin string) (*websocket.Conn, *http.Response, error) {
	h := http.Header{}
	if origin != "" {
		h.Set("Origin", origin)
	}
	return websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(ts.URL, "http")+"/ws", h)
}

func TestWebsocketBridgesTerminal(t *testing.T) {
	ts, l := setup(t)
	conn, _, err := dial(ts, "http://localhost:8080")
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
	ts, l := setup(t)
	conn, _, err := dial(ts, "http://localhost")
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
	ts, l := setup(t)
	for _, origin := range []string{"", "http://evil.example.com"} {
		if _, resp, err := dial(ts, origin); err == nil || resp == nil || resp.StatusCode != http.StatusForbidden {
			t.Fatalf("origin %q: expected 403, got err=%v resp=%v", origin, err, resp)
		}
	}
	select {
	case <-l.started:
		t.Fatal("terminal started for a rejected origin")
	default:
	}
}

func TestServesClient(t *testing.T) {
	ts, _ := setup(t)
	resp, err := http.Get(ts.URL + "/")
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
