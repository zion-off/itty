package config

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
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
	p := write(t, "hostname = \"itty.example.com\"\ntls_cert_file = \"c.pem\"\ntls_key_file = \"k.pem\"")
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

func TestOrigin(t *testing.T) {
	cases := []struct {
		cfg  Config
		want string
	}{
		{Config{Hostname: "localhost", Listen: "127.0.0.1:9000"}, "http://localhost:9000"},
		{Config{Hostname: "itty.example.com", Listen: "10.0.0.5:443", TLSCertFile: "c"}, "https://itty.example.com"},
		{Config{Hostname: "itty.example.com", Listen: "10.0.0.5:8443", TLSCertFile: "c"}, "https://itty.example.com:8443"},
	}
	for _, c := range cases {
		if got := c.cfg.Origin(); got != c.want {
			t.Errorf("Origin() = %q, want %q", got, c.want)
		}
	}
}

func TestLoadRequiresTLSForRealHostname(t *testing.T) {
	if _, err := Load(write(t, `hostname = "itty.example.com"`)); err == nil {
		t.Fatal("expected error without tls files")
	}
	if _, err := Load(write(t, "tls_cert_file = \"c.pem\"")); err == nil {
		t.Fatal("expected error when only the certificate is set")
	}
}

func TestACMEDefaults(t *testing.T) {
	cfg, err := Load(write(t, `hostname = "localhost"`))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ACMEDirectory != LetsEncryptProduction || cfg.DNSProvider != "manual" {
		t.Fatalf("defaults: %+v", cfg)
	}
	if filepath.Base(cfg.ACMEDir()) != "acme" {
		t.Fatalf("acme dir = %s", cfg.ACMEDir())
	}
}

func TestLoadRejectsNegativePropagationWait(t *testing.T) {
	if _, err := Load(write(t, "acme_propagation_wait_seconds = -1")); err == nil {
		t.Fatal("expected error")
	}
}

func TestSetAndGetByTomlKey(t *testing.T) {
	cfg := Default()
	if err := cfg.Set("listen", "10.0.0.5:9444"); err != nil {
		t.Fatal(err)
	}
	if err := cfg.Set("acme_propagation_wait_seconds", "45"); err != nil {
		t.Fatal(err)
	}
	if got, _ := cfg.Get("listen"); got != "10.0.0.5:9444" {
		t.Fatalf("listen = %q", got)
	}
	if got, _ := cfg.Get("acme_propagation_wait_seconds"); got != "45" {
		t.Fatalf("wait = %q", got)
	}
}

func TestSetRejectsUnknownKeysAndBadNumbers(t *testing.T) {
	cfg := Default()
	if err := cfg.Set("lisen", "x"); !errors.Is(err, ErrUnknownKey) {
		t.Fatalf("err = %v", err)
	}
	if _, err := cfg.Get("nope"); !errors.Is(err, ErrUnknownKey) {
		t.Fatalf("err = %v", err)
	}
	if err := cfg.Set("acme_propagation_wait_seconds", "soon"); err == nil {
		t.Fatal("expected an error for a non-numeric value")
	}
}

func TestKeysCoverEverySetting(t *testing.T) {
	keys := strings.Join(Keys(), ",")
	for _, want := range []string{"hostname", "listen", "tmux_session", "tls_cert_file", "acme_email", "dns_provider"} {
		if !strings.Contains(keys, want) {
			t.Errorf("missing key %q in %s", want, keys)
		}
	}
}

func TestSaveKeepsRelativePathsAndRefusesInvalidConfig(t *testing.T) {
	path := write(t, `hostname = "localhost"`)
	cfg, err := LoadRaw(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := cfg.Set("listen", "127.0.0.1:9999"); err != nil {
		t.Fatal(err)
	}
	if err := Save(path, cfg); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(path)
	if !strings.Contains(string(raw), "data_dir = 'data'") || !strings.Contains(string(raw), "127.0.0.1:9999") {
		t.Fatalf("saved config: %s", raw)
	}

	cfg.Hostname = "itty.example.com"
	if err := Save(path, cfg); err == nil {
		t.Fatal("a config that fails validation must not be saved")
	}
	if after, _ := os.ReadFile(path); string(after) != string(raw) {
		t.Fatal("the file changed after a rejected save")
	}
}
