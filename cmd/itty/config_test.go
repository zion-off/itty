package main

import (
	"bytes"
	"flag"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/zion/itty/internal/config"
)

func writeConfig(t *testing.T, body string) (string, config.Config) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "itty.toml")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err := config.LoadRaw(path)
	if err != nil {
		t.Fatal(err)
	}
	return path, cfg
}

func TestParseInterspersedAcceptsFlagsAnywhere(t *testing.T) {
	for _, args := range [][]string{
		{"set", "listen", "1.2.3.4:5", "-config", "x.toml"},
		{"-config", "x.toml", "set", "listen", "1.2.3.4:5"},
		{"set", "-config", "x.toml", "listen", "1.2.3.4:5"},
	} {
		fs := flag.NewFlagSet("t", flag.ContinueOnError)
		path := fs.String("config", "", "")
		words, err := parseInterspersed(fs, args)
		if err != nil || *path != "x.toml" || !reflect.DeepEqual(words, []string{"set", "listen", "1.2.3.4:5"}) {
			t.Fatalf("args %v: words=%v path=%q err=%v", args, words, *path, err)
		}
	}
}

func TestConfigSetChangesThePortAndReportsTheChange(t *testing.T) {
	path, cfg := writeConfig(t, `hostname = "localhost"`)
	var out bytes.Buffer
	if err := configSet(path, cfg, "listen", "127.0.0.1:9555", &out, discardLog()); err != nil {
		t.Fatal(err)
	}
	reloaded, err := config.LoadRaw(path)
	if err != nil || reloaded.Listen != "127.0.0.1:9555" {
		t.Fatalf("reloaded=%+v err=%v", reloaded, err)
	}
	for _, want := range []string{"127.0.0.1:8080 -> 127.0.0.1:9555", "itty service restart"} {
		if !strings.Contains(out.String(), want) {
			t.Errorf("output missing %q: %s", want, out.String())
		}
	}
}

func TestConfigSetWarnsThatChangingTheHostnameBreaksPasskeys(t *testing.T) {
	path, cfg := writeConfig(t, "hostname = \"a.example.com\"\ntls_cert_file = \"c\"\ntls_key_file = \"k\"")
	var out bytes.Buffer
	if err := configSet(path, cfg, "hostname", "b.example.com", &out, discardLog()); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "existing passkeys stop working") {
		t.Fatalf("output: %s", out.String())
	}
}

func TestConfigSetRejectsBadInputWithoutTouchingTheFile(t *testing.T) {
	path, cfg := writeConfig(t, `hostname = "localhost"`)
	before, _ := os.ReadFile(path)
	var out bytes.Buffer
	for _, c := range [][2]string{{"lisen", "x"}, {"acme_propagation_wait_seconds", "soon"}, {"tmux_session", ""}} {
		if err := configSet(path, cfg, c[0], c[1], &out, discardLog()); err == nil {
			t.Errorf("set %s=%q should fail", c[0], c[1])
		}
	}
	if after, _ := os.ReadFile(path); string(after) != string(before) {
		t.Fatal("the file changed after rejected changes")
	}
}

func TestConfigGetAndShow(t *testing.T) {
	_, cfg := writeConfig(t, `tmux_session = "work"`)
	var out bytes.Buffer
	if err := configGet(cfg, "tmux_session", &out); err != nil || strings.TrimSpace(out.String()) != "work" {
		t.Fatalf("get = %q, %v", out.String(), err)
	}
	out.Reset()
	if err := configShow(cfg, &out); err != nil || !strings.Contains(out.String(), "tmux_session = 'work'") {
		t.Fatalf("show = %q, %v", out.String(), err)
	}
	if err := configGet(cfg, "nope", &out); err == nil {
		t.Fatal("expected an error for an unknown key")
	}
}
