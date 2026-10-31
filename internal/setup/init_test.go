package setup

import (
	"errors"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/zion/itty/internal/config"
)

func discard() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func localConfig() config.Config {
	c := config.Default()
	c.Hostname = "localhost"
	return c
}

func TestInitWritesLoadableConfigAndDataDir(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "itty.toml")
	if err := Init(InitOptions{Path: path, Config: localConfig()}, discard()); err != nil {
		t.Fatal(err)
	}
	cfg, err := config.Load(path)
	if err != nil {
		t.Fatalf("written config does not load: %v", err)
	}
	if cfg.Hostname != "localhost" {
		t.Fatalf("hostname = %q", cfg.Hostname)
	}
	if info, err := os.Stat(filepath.Join(dir, "data")); err != nil || info.Mode().Perm() != 0o700 {
		t.Fatalf("data dir missing or not private: %v", err)
	}
	if info, _ := os.Stat(path); info.Mode().Perm() != 0o600 {
		t.Fatalf("config mode = %v", info.Mode().Perm())
	}
}

func TestInitRefusesToOverwriteWithoutForce(t *testing.T) {
	path := filepath.Join(t.TempDir(), "itty.toml")
	if err := Init(InitOptions{Path: path, Config: localConfig()}, discard()); err != nil {
		t.Fatal(err)
	}
	err := Init(InitOptions{Path: path, Config: localConfig()}, discard())
	if !errors.Is(err, ErrConfigExists) {
		t.Fatalf("err = %v", err)
	}
	if err := Init(InitOptions{Path: path, Config: localConfig(), Force: true}, discard()); err != nil {
		t.Fatalf("force should overwrite: %v", err)
	}
}

func TestInitRejectsInvalidSettings(t *testing.T) {
	c := config.Default()
	c.Hostname = "itty.example.com"
	path := filepath.Join(t.TempDir(), "itty.toml")
	if err := Init(InitOptions{Path: path, Config: c}, discard()); err == nil {
		t.Fatal("expected error: a real hostname needs TLS files")
	}
	if _, err := os.Stat(path); err == nil {
		t.Fatal("config must not be written when settings are invalid")
	}
}
