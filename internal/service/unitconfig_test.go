package service

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func writeUnit(t *testing.T, body string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "itty.service")
	if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestConfigPathFromRenderedUnit(t *testing.T) {
	rendered, err := Unit{User: "u", WorkingDir: "/srv/itty dir", Executable: "/srv/itty dir/bin/itty", ConfigPath: "/srv/itty dir/itty.toml"}.Render()
	if err != nil {
		t.Fatal(err)
	}
	got, err := ConfigPathFrom(writeUnit(t, string(rendered)))
	if err != nil || got != "/srv/itty dir/itty.toml" {
		t.Fatalf("got %q err=%v", got, err)
	}
}

func TestConfigPathFromUnitWithoutAConfigFlag(t *testing.T) {
	_, err := ConfigPathFrom(writeUnit(t, "[Service]\nExecStart=/usr/bin/itty serve\n"))
	if !errors.Is(err, ErrNoInstalledConfig) {
		t.Fatalf("err = %v", err)
	}
}

func TestConfigPathFromMissingUnit(t *testing.T) {
	if _, err := ConfigPathFrom(filepath.Join(t.TempDir(), "nope.service")); err == nil {
		t.Fatal("expected error")
	}
}
