package server

import (
	"bytes"
	"io"
	"log/slog"
	"net/http/httptest"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"github.com/zion/itty/internal/clock"
	"github.com/zion/itty/internal/lastsession"
	"github.com/zion/itty/internal/ratelimit"
	"github.com/zion/itty/internal/terminal"
)

func readUntilOutput(t *testing.T, conn *websocket.Conn, marker string) {
	t.Helper()
	var seen bytes.Buffer
	deadline := time.Now().Add(8 * time.Second)
	for time.Now().Before(deadline) {
		_ = conn.SetReadDeadline(time.Now().Add(time.Second))
		typ, data, err := conn.ReadMessage()
		if err != nil {
			continue
		}
		if typ == websocket.BinaryMessage {
			seen.Write(data)
			if strings.Contains(seen.String(), marker) {
				return
			}
		}
	}
	t.Fatalf("never saw %q on screen; got %q", marker, seen.String())
}

func TestSwitchingSessionsWithRealTmux(t *testing.T) {
	if _, err := exec.LookPath("tmux"); err != nil {
		t.Skip("tmux not installed")
	}
	const first, second = "itty-it-first", "itty-it-second"
	t.Cleanup(func() {
		for _, name := range []string{first, second} {
			_ = exec.Command("tmux", "kill-session", "-t", "="+name).Run()
		}
	})
	for name, marker := range map[string]string{first: "ITTYMARKFIRST", second: "ITTYMARKSECOND"} {
		if out, err := exec.Command("tmux", "new-session", "-d", "-s", name, "echo "+marker+"; sleep 120").CombinedOutput(); err != nil {
			t.Fatalf("create %s: %v: %s", name, err, out)
		}
	}

	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	tmux := terminal.TmuxLauncher{Log: log}
	store := lastsession.NewFileStore(filepath.Join(t.TempDir(), "last-session"))
	ts := httptest.NewServer(New(Deps{
		Hostname: "localhost", Launcher: tmux, Sessions: tmux, LastSession: store, DefaultSession: first,
		Auth:    &fakeAuth{tickets: map[string]bool{"good": true}},
		Limiter: ratelimit.NewFailureLimiter(clock.System{}, 3, time.Minute),
		Log:     log,
	}))
	defer ts.Close()

	conn, _, err := dial(ts, "http://localhost", "good")
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if err := conn.WriteJSON(map[string]any{"type": "resize", "cols": 100, "rows": 30}); err != nil {
		t.Fatal(err)
	}

	hello := readControl(t, conn)
	names := sessionNames(hello)
	if hello["current"] != first || !slices.Contains(names, first) || !slices.Contains(names, second) {
		t.Fatalf("hello = %v", hello)
	}
	readUntilOutput(t, conn, "ITTYMARKFIRST")

	if err := conn.WriteJSON(map[string]any{"type": "switch", "session": second}); err != nil {
		t.Fatal(err)
	}
	var switched map[string]any
	for switched == nil {
		_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
		typ, data, err := conn.ReadMessage()
		if err != nil {
			t.Fatal(err)
		}
		if typ == websocket.TextMessage {
			switched = map[string]any{}
			if !strings.Contains(string(data), `"current":"`+second+`"`) {
				t.Fatalf("unexpected message after switching: %s", data)
			}
		}
	}
	readUntilOutput(t, conn, "ITTYMARKSECOND")

	deadline := time.Now().Add(2 * time.Second)
	for {
		if last, _ := store.Load(); last == second {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("the switched session was not remembered")
		}
		time.Sleep(20 * time.Millisecond)
	}
}
