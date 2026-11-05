package main

import (
	"bytes"
	"os"
	"strings"
	"testing"
)

type result struct {
	code   int
	stdout string
	stderr string
}

func runCLI(t *testing.T, args ...string) result {
	t.Helper()
	withInstalled(t, "", nil)
	inEmptyDir(t)
	var stdout, stderr bytes.Buffer
	code := run(args, &stdout, &stderr)
	return result{code, stdout.String(), stderr.String()}
}

func TestHelpGoesToStdoutAndSucceeds(t *testing.T) {
	for _, args := range [][]string{{"--help"}, {"-h"}, {"help"}, {"serve", "--help"}, {"stop", "-h"}, {"config", "set", "--help"}} {
		got := runCLI(t, args...)
		if got.code != exitOK || !strings.Contains(got.stdout, "Usage:") || got.stderr != "" {
			t.Errorf("itty %v: code=%d stdout=%q stderr=%q", args, got.code, got.stdout, got.stderr)
		}
	}
}

func TestBareCommandShowsHelpInsteadOfStartingTheServer(t *testing.T) {
	for _, args := range [][]string{{}, {"config"}, {"service"}} {
		got := runCLI(t, args...)
		if got.code != exitOK || !strings.Contains(got.stdout, "Available Commands:") {
			t.Errorf("itty %v: code=%d stdout=%q stderr=%q", args, got.code, got.stdout, got.stderr)
		}
	}
}

func TestHelpListsEveryCommand(t *testing.T) {
	got := runCLI(t, "--help")
	for _, name := range []string{"install", "init", "check", "enroll", "serve", "renew-cert", "config", "service", "start", "stop", "restart", "status"} {
		if !strings.Contains(got.stdout, name) {
			t.Errorf("help does not list %q:\n%s", name, got.stdout)
		}
	}
}

func TestVersionFlag(t *testing.T) {
	got := runCLI(t, "--version")
	if got.code != exitOK || !strings.HasPrefix(got.stdout, "itty version ") {
		t.Fatalf("code=%d stdout=%q stderr=%q", got.code, got.stdout, got.stderr)
	}
}

func TestUsageErrorsExitWithTwoAndPrintOnce(t *testing.T) {
	cases := []struct {
		name string
		args []string
		want string
	}{
		{"unknown command", []string{"bogus"}, `unknown command "bogus"`},
		{"unknown subcommand", []string{"config", "bogus"}, `unknown command "bogus"`},
		{"unknown flag", []string{"check", "--bogus"}, "unknown flag: --bogus"},
		{"extra argument", []string{"check", "extra"}, `unknown command "extra"`},
		{"single-dash long flag is no longer accepted", []string{"check", "-config", "x.toml"}, `unknown command "x.toml"`},
		{"get without key", []string{"config", "get"}, "accepts 1 arg(s), received 0"},
		{"set with one argument", []string{"config", "set", "listen"}, "accepts 2 arg(s), received 1"},
		{"kill-session outside stop", []string{"start", "--kill-session"}, "unknown flag: --kill-session"},
		{"stop shortcut under service", []string{"service", "start", "--kill-session"}, "unknown flag: --kill-session"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := runCLI(t, c.args...)
			if got.code != exitUsage {
				t.Fatalf("code = %d, want %d (stderr %q)", got.code, exitUsage, got.stderr)
			}
			if got.stdout != "" {
				t.Errorf("stdout = %q, want it empty", got.stdout)
			}
			if n := strings.Count(got.stderr, c.want); n != 1 {
				t.Errorf("stderr mentions %q %d times, want once: %q", c.want, n, got.stderr)
			}
			if !strings.Contains(got.stderr, "--help' for more information") {
				t.Errorf("stderr has no pointer to --help: %q", got.stderr)
			}
		})
	}
}

func TestRuntimeFailuresExitWithOne(t *testing.T) {
	got := runCLI(t, "check", "--config", "missing.toml")
	if got.code != exitFailure || !strings.HasPrefix(got.stderr, "itty: ") || strings.Contains(got.stderr, "--help") {
		t.Fatalf("code=%d stderr=%q", got.code, got.stderr)
	}
}

func TestStopOffersKillSessionAndOtherActionsDoNot(t *testing.T) {
	if got := runCLI(t, "stop", "--help"); !strings.Contains(got.stdout, "--kill-session") {
		t.Errorf("stop help: %s", got.stdout)
	}
	if got := runCLI(t, "status", "--help"); strings.Contains(got.stdout, "--kill-session") {
		t.Errorf("status help: %s", got.stdout)
	}
}

func TestConfigSubcommandsAcceptFlagsAnywhere(t *testing.T) {
	path, _ := writeConfig(t, `tmux_session = "work"`)
	for _, args := range [][]string{
		{"config", "get", "tmux_session", "--config", path},
		{"config", "--config", path, "get", "tmux_session"},
		{"config", "get", "-c", path, "tmux_session"},
	} {
		got := runCLI(t, args...)
		if got.code != exitOK || strings.TrimSpace(got.stdout) != "work" {
			t.Errorf("itty %v: code=%d stdout=%q stderr=%q", args, got.code, got.stdout, got.stderr)
		}
	}
}

func TestConfigSetThroughTheCommandLine(t *testing.T) {
	path, _ := writeConfig(t, `hostname = "localhost"`)
	got := runCLI(t, "config", "set", "listen", "127.0.0.1:9555", "-c", path)
	if got.code != exitOK || !strings.Contains(got.stdout, "127.0.0.1:8080 -> 127.0.0.1:9555") {
		t.Fatalf("code=%d stdout=%q stderr=%q", got.code, got.stdout, got.stderr)
	}
}

func TestServeLogsToTheConsoleOnlyWhenStderrIsATerminal(t *testing.T) {
	if got := terminalLogOptions(&bytes.Buffer{}); len(got) != 0 {
		t.Fatalf("a buffer is not a terminal, got %d options", len(got))
	}
	file, err := os.Open(os.DevNull)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	if got := terminalLogOptions(file); len(got) != 0 {
		t.Fatalf("/dev/null is not a terminal, got %d options", len(got))
	}
}
