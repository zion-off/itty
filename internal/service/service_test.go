package service

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"os/exec"
	"strings"
	"testing"
)

type recordingRunner struct {
	calls   []string
	failOn  string
	failErr error
}

func (r *recordingRunner) Run(_ context.Context, name string, args ...string) error {
	call := strings.Join(append([]string{name}, args...), " ")
	r.calls = append(r.calls, call)
	if r.failOn != "" && strings.Contains(call, r.failOn) {
		return r.failErr
	}
	return nil
}

func newManager(r Runner, root bool) Manager {
	return Manager{Runner: r, Log: slog.New(slog.NewTextHandler(io.Discard, nil)), IsRoot: root, TmpDir: "", Session: "itty"}
}

func TestRenderFillsInThePathsAndKeepsTheSessionAlive(t *testing.T) {
	out, err := Unit{User: "alex", WorkingDir: "/srv/itty dir", Executable: "/srv/itty dir/bin/itty", ConfigPath: "/srv/itty dir/itty.toml"}.Render()
	if err != nil {
		t.Fatal(err)
	}
	text := string(out)
	for _, want := range []string{
		"User=alex",
		"WorkingDirectory=/srv/itty dir",
		`ExecStart="/srv/itty dir/bin/itty" serve -config "/srv/itty dir/itty.toml"`,
		"KillMode=process",
		"Restart=on-failure",
	} {
		if !strings.Contains(text, want) {
			t.Errorf("unit file is missing %q:\n%s", want, text)
		}
	}
	if strings.Contains(text, "{{") {
		t.Fatalf("unrendered template left in unit file:\n%s", text)
	}
}

func TestInstallRunsPrivilegedStepsThroughSudo(t *testing.T) {
	r := &recordingRunner{}
	err := newManager(r, false).Install(context.Background(), Unit{User: "u", WorkingDir: "/w", Executable: "/w/bin/itty", ConfigPath: "/w/itty.toml"})
	if err != nil {
		t.Fatal(err)
	}
	if len(r.calls) != 3 {
		t.Fatalf("calls = %v", r.calls)
	}
	if !strings.HasPrefix(r.calls[0], "sudo install -m 0644 ") || !strings.HasSuffix(r.calls[0], " "+UnitPath) {
		t.Errorf("install step = %q", r.calls[0])
	}
	if r.calls[1] != "sudo systemctl daemon-reload" || r.calls[2] != "sudo systemctl enable --now itty" {
		t.Errorf("calls = %v", r.calls)
	}
}

func TestRootSkipsSudo(t *testing.T) {
	r := &recordingRunner{}
	if err := newManager(r, true).Do(context.Background(), "stop", false); err != nil {
		t.Fatal(err)
	}
	if len(r.calls) != 1 || r.calls[0] != "systemctl stop itty" {
		t.Fatalf("calls = %v", r.calls)
	}
}

func TestActionsMapToSystemctl(t *testing.T) {
	for _, action := range []string{"start", "stop", "restart", "enable", "disable"} {
		r := &recordingRunner{}
		if err := newManager(r, false).Do(context.Background(), action, false); err != nil {
			t.Fatal(err)
		}
		if want := "sudo systemctl " + action + " itty"; len(r.calls) != 1 || r.calls[0] != want {
			t.Errorf("%s: calls = %v, want %q", action, r.calls, want)
		}
	}
}

func TestStatusNeedsNoPrivilegesAndToleratesAnInactiveService(t *testing.T) {
	r := &recordingRunner{}
	if err := newManager(r, false).Do(context.Background(), "status", false); err != nil {
		t.Fatal(err)
	}
	if len(r.calls) != 1 || r.calls[0] != "systemctl status --no-pager itty" {
		t.Fatalf("calls = %v", r.calls)
	}

	inactive := exec.Command("sh", "-c", "exit 3").Run()
	r = &recordingRunner{failOn: "status", failErr: inactive}
	if err := newManager(r, false).Do(context.Background(), "status", false); err != nil {
		t.Fatalf("an inactive service is a normal status result, got %v", err)
	}

	missing := exec.Command("sh", "-c", "exit 4").Run()
	r = &recordingRunner{failOn: "status", failErr: missing}
	if err := newManager(r, false).Do(context.Background(), "status", false); !errors.Is(err, ErrNotInstalled) {
		t.Fatalf("a missing unit should say how to install it, got %v", err)
	}

	broken := exec.Command("sh", "-c", "exit 1").Run()
	r = &recordingRunner{failOn: "status", failErr: broken}
	if err := newManager(r, false).Do(context.Background(), "status", false); err == nil || errors.Is(err, ErrNotInstalled) {
		t.Fatalf("other failures must be reported as they are, got %v", err)
	}
}

func TestStopCanAlsoEndTheTmuxSession(t *testing.T) {
	r := &recordingRunner{}
	if err := newManager(r, false).Do(context.Background(), "stop", true); err != nil {
		t.Fatal(err)
	}
	want := []string{"sudo systemctl stop itty", "tmux kill-session -t =itty"}
	if strings.Join(r.calls, "|") != strings.Join(want, "|") {
		t.Fatalf("calls = %v, want %v", r.calls, want)
	}
}

func TestKillSessionIsSkippedWhenStopFails(t *testing.T) {
	r := &recordingRunner{failOn: "systemctl stop", failErr: errors.New("boom")}
	if err := newManager(r, false).Do(context.Background(), "stop", true); err == nil {
		t.Fatal("expected error")
	}
	if len(r.calls) != 1 {
		t.Fatalf("the session must not be killed when the service did not stop: %v", r.calls)
	}
}

func TestUninstallSequence(t *testing.T) {
	r := &recordingRunner{}
	if err := newManager(r, false).Uninstall(context.Background()); err != nil {
		t.Fatal(err)
	}
	want := []string{"sudo systemctl disable --now itty", "sudo rm -f " + UnitPath, "sudo systemctl daemon-reload"}
	if strings.Join(r.calls, "|") != strings.Join(want, "|") {
		t.Fatalf("calls = %v", r.calls)
	}
}

func TestFailedStepStopsTheSequence(t *testing.T) {
	r := &recordingRunner{failOn: "daemon-reload", failErr: errors.New("boom")}
	err := newManager(r, false).Install(context.Background(), Unit{User: "u", WorkingDir: "/w", Executable: "/w/itty", ConfigPath: "/w/c"})
	if err == nil {
		t.Fatal("expected error")
	}
	if len(r.calls) != 2 {
		t.Fatalf("steps after the failure must not run: %v", r.calls)
	}
}

func TestUnknownAction(t *testing.T) {
	if err := newManager(&recordingRunner{}, false).Do(context.Background(), "explode", false); !errors.Is(err, ErrUnknownAction) {
		t.Fatalf("err = %v", err)
	}
}
