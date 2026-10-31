package config

import (
	"bytes"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"

	"github.com/pelletier/go-toml/v2"
)

type Config struct {
	Hostname    string `toml:"hostname"`
	Listen      string `toml:"listen"`
	TmuxSession string `toml:"tmux_session"`
	DataDir     string `toml:"data_dir"`
	LogFile     string `toml:"log_file"`
}

func Default() Config {
	return Config{
		Hostname:    "localhost",
		Listen:      "127.0.0.1:8080",
		TmuxSession: "itty",
		DataDir:     "data",
		LogFile:     "itty.log",
	}
}

func Load(path string) (Config, error) {
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
	cfg.resolvePaths(filepath.Dir(path))
	return cfg, nil
}

func (c Config) Origin() string {
	_, port, err := net.SplitHostPort(c.Listen)
	if c.Hostname == "localhost" && err == nil {
		return "http://localhost:" + port
	}
	return "https://" + c.Hostname
}

func (c Config) CredentialsPath() string { return filepath.Join(c.DataDir, "credentials.json") }

func (c Config) EnrollmentPath() string { return filepath.Join(c.DataDir, "enrollment.json") }

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
	return errors.Join(errs...)
}

func (c *Config) resolvePaths(base string) {
	c.DataDir = absolute(base, c.DataDir)
	c.LogFile = absolute(base, c.LogFile)
}

func absolute(base, p string) string {
	if filepath.IsAbs(p) {
		return p
	}
	return filepath.Join(base, p)
}
