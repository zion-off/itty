package config

import (
	"os"
	"path/filepath"
	"testing"
)

func write(t *testing.T, body string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "itty.toml")
	if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestLoadAppliesDefaultsAndResolvesRelativePaths(t *testing.T) {
	p := write(t, `hostname = "itty.example.com"`)
	cfg, err := Load(p)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Listen != "127.0.0.1:8080" || cfg.TmuxSession != "itty" {
		t.Fatalf("defaults not applied: %+v", cfg)
	}
	if want := filepath.Join(filepath.Dir(p), "data"); cfg.DataDir != want {
		t.Fatalf("data dir = %q, want %q", cfg.DataDir, want)
	}
}

func TestLoadRejectsUnknownKeys(t *testing.T) {
	if _, err := Load(write(t, `hostnam = "x"`)); err == nil {
		t.Fatal("expected error for unknown key")
	}
}

func TestLoadRejectsEmptyRequiredValue(t *testing.T) {
	if _, err := Load(write(t, `tmux_session = ""`)); err == nil {
		t.Fatal("expected error for empty tmux_session")
	}
}

func TestLoadMissingFile(t *testing.T) {
	if _, err := Load(filepath.Join(t.TempDir(), "nope.toml")); err == nil {
		t.Fatal("expected error for missing file")
	}
}
