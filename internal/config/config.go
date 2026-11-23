package config

import (
	"bytes"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"

	"github.com/pelletier/go-toml/v2"

	"github.com/zion-off/itty/internal/fsutil"
)

type Config struct {
	Hostname    string `toml:"hostname"`
	Listen      string `toml:"listen"`
	TmuxSession string `toml:"tmux_session"`
	DataDir     string `toml:"data_dir"`
	LogFile     string `toml:"log_file"`
	TLSCertFile string `toml:"tls_cert_file,omitempty"`
	TLSKeyFile  string `toml:"tls_key_file,omitempty"`

	ACMEEmail              string `toml:"acme_email,omitempty"`
	ACMEDirectory          string `toml:"acme_directory"`
	DNSProvider            string `toml:"dns_provider"`
	ACMEPropagationSeconds int    `toml:"acme_propagation_wait_seconds,omitempty"`
}

func (c Config) TLSEnabled() bool { return c.TLSCertFile != "" }

const LetsEncryptProduction = "https://acme-v02.api.letsencrypt.org/directory"

func Default() Config {
	return Config{
		Hostname:    "localhost",
		Listen:      "127.0.0.1:8080",
		TmuxSession: "itty",
		DataDir:     "data",
		LogFile:     "itty.log",

		ACMEDirectory: LetsEncryptProduction,
		DNSProvider:   "manual",
	}
}

func Load(path string) (Config, error) {
	cfg, err := LoadRaw(path)
	if err != nil {
		return Config{}, err
	}
	return cfg.Resolved(filepath.Dir(path)), nil
}

func LoadRaw(path string) (Config, error) {
	cfg := Default()
	raw, err := os.ReadFile(path)
	if err != nil {
		return Config{}, fmt.Errorf("read config %s: %w", path, err)
	}
	dec := toml.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&cfg); err != nil {
		return Config{}, fmt.Errorf("parse config %s: %w", path, err)
	}
	if err := cfg.Validate(); err != nil {
		return Config{}, fmt.Errorf("invalid config %s: %w", path, err)
	}
	return cfg, nil
}

func Save(path string, cfg Config) error {
	if err := cfg.Validate(); err != nil {
		return fmt.Errorf("invalid config: %w", err)
	}
	raw, err := toml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("render config: %w", err)
	}
	return fsutil.WriteFileAtomic(path, raw, 0o600)
}

func (c Config) Origin() string {
	_, port, err := net.SplitHostPort(c.Listen)
	scheme := "http"
	if c.TLSEnabled() {
		scheme = "https"
	}
	if err != nil || (scheme == "https" && port == "443") {
		return scheme + "://" + c.Hostname
	}
	return scheme + "://" + c.Hostname + ":" + port
}

func (c Config) ACMEDir() string { return filepath.Join(c.DataDir, "acme") }

func (c Config) CredentialsPath() string { return filepath.Join(c.DataDir, "credentials.json") }

func (c Config) LastSessionPath() string { return filepath.Join(c.DataDir, "last-session") }

func (c Config) EnrollmentPath() string { return filepath.Join(c.DataDir, "enrollment.json") }

func (c Config) PushKeysPath() string { return filepath.Join(c.DataDir, "push-vapid.json") }

func (c Config) PushSubscriptionsPath() string {
	return filepath.Join(c.DataDir, "push-subscriptions.json")
}

func (c Config) PushSubscriber() string { return "https://" + c.Hostname }

func (c Config) Validate() error {
	var errs []error
	if c.Hostname == "" {
		errs = append(errs, errors.New("hostname is required"))
	}
	if c.Listen == "" {
		errs = append(errs, errors.New("listen is required"))
	}
	if c.TmuxSession == "" {
		errs = append(errs, errors.New("tmux_session is required"))
	}
	if c.DataDir == "" {
		errs = append(errs, errors.New("data_dir is required"))
	}
	if c.LogFile == "" {
		errs = append(errs, errors.New("log_file is required"))
	}
	if (c.TLSCertFile == "") != (c.TLSKeyFile == "") {
		errs = append(errs, errors.New("tls_cert_file and tls_key_file must be set together"))
	}
	if c.ACMEPropagationSeconds < 0 {
		errs = append(errs, errors.New("acme_propagation_wait_seconds must not be negative"))
	}
	if c.TLSCertFile == "" && c.Hostname != "localhost" {
		errs = append(errs, errors.New("tls_cert_file and tls_key_file are required unless hostname is localhost"))
	}
	return errors.Join(errs...)
}

func (c Config) Resolved(base string) Config {
	c.DataDir = absolute(base, c.DataDir)
	c.LogFile = absolute(base, c.LogFile)
	if c.TLSEnabled() {
		c.TLSCertFile = absolute(base, c.TLSCertFile)
		c.TLSKeyFile = absolute(base, c.TLSKeyFile)
	}
	return c
}

func absolute(base, p string) string {
	if filepath.IsAbs(p) {
		return p
	}
	return filepath.Join(base, p)
}
