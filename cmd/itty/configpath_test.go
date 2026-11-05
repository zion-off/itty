package main

import (
	"errors"
	"os"
	"testing"
)

func withInstalled(t *testing.T, path string, err error) {
	t.Helper()
	previous := installedConfigPath
	installedConfigPath = func() (string, error) { return path, err }
	t.Cleanup(func() { installedConfigPath = previous })
}

func inEmptyDir(t *testing.T) {
	t.Helper()
	t.Chdir(t.TempDir())
	t.Setenv("ITTY_CONFIG", "")
}

func TestResolveConfigPathOrder(t *testing.T) {
	withInstalled(t, "/srv/itty/itty.toml", nil)

	inEmptyDir(t)
	if got := resolveConfigPath("explicit.toml"); got != "explicit.toml" {
		t.Fatalf("an explicit flag must win, got %q", got)
	}

	t.Setenv("ITTY_CONFIG", "/etc/from-env.toml")
	if got := resolveConfigPath(""); got != "/etc/from-env.toml" {
		t.Fatalf("the environment variable must come next, got %q", got)
	}

	t.Setenv("ITTY_CONFIG", "")
	if got := resolveConfigPath(""); got != "/srv/itty/itty.toml" {
		t.Fatalf("with no local file the installed service's config applies, got %q", got)
	}

	if err := os.WriteFile(defaultConfigPath, []byte("hostname = \"localhost\"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := resolveConfigPath(""); got != defaultConfigPath {
		t.Fatalf("a config in the current directory beats the installed one, got %q", got)
	}
}

func TestResolveConfigPathFallsBackToTheDefaultName(t *testing.T) {
	withInstalled(t, "", errors.New("no service"))
	inEmptyDir(t)
	if got := resolveConfigPath(""); got != defaultConfigPath {
		t.Fatalf("got %q", got)
	}
}
