package setup

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/pelletier/go-toml/v2"

	"github.com/zion/itty/internal/config"
)

var ErrConfigExists = errors.New("config file already exists")

type InitOptions struct {
	Path   string
	Config config.Config
	Force  bool
}

func Init(opts InitOptions, log *slog.Logger) error {
	if err := opts.Config.Validate(); err != nil {
		return fmt.Errorf("invalid settings: %w", err)
	}
	if _, err := os.Stat(opts.Path); err == nil && !opts.Force {
		return fmt.Errorf("%w: %s (use --force to overwrite)", ErrConfigExists, opts.Path)
	}

	raw, err := toml.Marshal(opts.Config)
	if err != nil {
		return fmt.Errorf("render config: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(opts.Path), 0o700); err != nil {
		return fmt.Errorf("create config directory: %w", err)
	}
	if err := os.WriteFile(opts.Path, raw, 0o600); err != nil {
		return fmt.Errorf("write config %s: %w", opts.Path, err)
	}

	dataDir := filepath.Join(filepath.Dir(opts.Path), opts.Config.DataDir)
	if filepath.IsAbs(opts.Config.DataDir) {
		dataDir = opts.Config.DataDir
	}
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return fmt.Errorf("create data directory %s: %w", dataDir, err)
	}
	log.Info("config written", "path", opts.Path, "data_dir", dataDir, "hostname", opts.Config.Hostname)
	return nil
}
