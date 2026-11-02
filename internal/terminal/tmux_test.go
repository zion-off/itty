package terminal

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"os/exec"
	"sort"
	"sync"
	"testing"
	"time"
)

func newTestLauncher(t *testing.T) (TmuxLauncher, string) {
	t.Helper()
	if _, err := exec.LookPath("tmux"); err != nil {
		t.Skip("tmux not installed")
	}
	name := "itty-test-" + t.Name()
	t.Cleanup(func() { _ = exec.Command("tmux", "kill-session", "-t", "="+name).Run() })
	return TmuxLauncher{Log: slog.New(slog.NewTextHandler(io.Discard, nil))}, name
}

type recorder struct {
	s   Session
	mu  sync.Mutex
	buf bytes.Buffer
}

func record(s Session) *recorder {
	r := &recorder{s: s}
	go func() {
		chunk := make([]byte, 4096)
		for {
			n, err := s.Read(chunk)
			r.mu.Lock()
			r.buf.Write(chunk[:n])
			r.mu.Unlock()
			if err != nil {
				return
			}
		}
	}()
	return r
}

func (r *recorder) sendUntilSeen(t *testing.T, input, want string) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if _, err := r.s.Write([]byte(input)); err != nil {
			t.Fatal(err)
		}
		time.Sleep(300 * time.Millisecond)
		r.mu.Lock()
		found := bytes.Contains(r.buf.Bytes(), []byte(want))
		r.mu.Unlock()
		if found {
			return
		}
	}
	t.Fatalf("never saw %q after sending %q", want, input)
}

func TestTmuxSessionPersistsAfterClose(t *testing.T) {
	l, name := newTestLauncher(t)
	s, err := l.Start(context.Background(), name, Size{Cols: 80, Rows: 24})
	if err != nil {
		t.Fatal(err)
	}
	rec := record(s)
	rec.sendUntilSeen(t, "echo itty-$((20+22))\r", "itty-42")
	_ = s.Close()
	_, _ = s.Wait()
	if err := exec.Command("tmux", "has-session", "-t", "="+name).Run(); err != nil {
		t.Fatalf("tmux session should survive detach: %v", err)
	}
}

func TestCtrlSReachesTmux(t *testing.T) {
	l, name := newTestLauncher(t)
	s, err := l.Start(context.Background(), name, Size{Cols: 80, Rows: 24})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = s.Close(); _, _ = s.Wait() }()
	rec := record(s)
	rec.sendUntilSeen(t, "echo r$((1+1))y\r", "r2y")
	if _, err := s.Write([]byte("\x13")); err != nil {
		t.Fatal(err)
	}
	rec.sendUntilSeen(t, "echo a$((1+1))b\r", "a2b")
}

func TestResize(t *testing.T) {
	l, name := newTestLauncher(t)
	s, err := l.Start(context.Background(), name, Size{Cols: 80, Rows: 24})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = s.Close(); _, _ = s.Wait() }()
	if err := s.Resize(Size{Cols: 100, Rows: 30}); err != nil {
		t.Fatal(err)
	}
}

func TestListIncludesRunningSessionsSorted(t *testing.T) {
	l, name := newTestLauncher(t)
	s, err := l.Start(context.Background(), name, Size{Cols: 80, Rows: 24})
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = s.Close(); _, _ = s.Wait() }()

	deadline := time.Now().Add(5 * time.Second)
	for {
		names, err := l.List(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		if !sort.StringsAreSorted(names) {
			t.Fatalf("names are not sorted: %v", names)
		}
		for _, n := range names {
			if n == name {
				return
			}
		}
		if time.Now().After(deadline) {
			t.Fatalf("session %q not listed: %v", name, names)
		}
		time.Sleep(100 * time.Millisecond)
	}
}

func TestWindowsListsAndSelectsWindowsOfOneSession(t *testing.T) {
	l, name := newTestLauncher(t)
	if out, err := exec.Command("tmux", "new-session", "-d", "-s", name, "-n", "one", "sleep 60").CombinedOutput(); err != nil {
		t.Fatalf("%v: %s", err, out)
	}
	if out, err := exec.Command("tmux", "new-window", "-t", "="+name, "-n", "two", "sleep 60").CombinedOutput(); err != nil {
		t.Fatalf("%v: %s", err, out)
	}
	ctx := context.Background()
	windows, err := l.Windows(ctx, name)
	if err != nil {
		t.Fatal(err)
	}
	if len(windows) != 2 || windows[0].Name != "one" || windows[1].Name != "two" || windows[0].Active || !windows[1].Active {
		t.Fatalf("windows = %+v", windows)
	}
	if err := l.SelectWindow(ctx, name, windows[0].ID); err != nil {
		t.Fatal(err)
	}
	after, _ := l.Windows(ctx, name)
	if !after[0].Active || after[1].Active {
		t.Fatalf("after select = %+v", after)
	}
	if err := l.SelectWindow(ctx, name, "@999999"); !errors.Is(err, ErrUnknownWindow) {
		t.Fatalf("err = %v", err)
	}
}

func TestNewAndCloseWindowChangeTheWindowsOfOneSession(t *testing.T) {
	l, name := newTestLauncher(t)
	if out, err := exec.Command("tmux", "new-session", "-d", "-s", name, "sleep 60").CombinedOutput(); err != nil {
		t.Fatalf("%v: %s", err, out)
	}
	ctx := context.Background()
	if err := l.NewWindow(ctx, name); err != nil {
		t.Fatal(err)
	}
	windows, _ := l.Windows(ctx, name)
	if len(windows) != 2 || !windows[1].Active {
		t.Fatalf("after new = %+v", windows)
	}
	if err := l.CloseWindow(ctx, name, "@999999"); !errors.Is(err, ErrUnknownWindow) {
		t.Fatalf("err = %v", err)
	}
	if err := l.CloseWindow(ctx, name, windows[1].ID); err != nil {
		t.Fatal(err)
	}
	after, _ := l.Windows(ctx, name)
	if len(after) != 1 || after[0].ID != windows[0].ID {
		t.Fatalf("after close = %+v", after)
	}
	if err := l.CloseWindow(ctx, name, after[0].ID); !errors.Is(err, ErrLastWindow) {
		t.Fatalf("err = %v", err)
	}
}

func TestParseWindowsSkipsMalformedLines(t *testing.T) {
	got := parseWindows("@1|||0|||1|||a|b\nbroken\n@2|||x|||0|||bad index\n")
	if len(got) != 1 || got[0].Name != "a|b" || !got[0].Active {
		t.Fatalf("got %+v", got)
	}
}
