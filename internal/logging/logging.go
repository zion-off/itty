package logging

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
)

type Option func(*settings)

type settings struct {
	console io.Writer
}

// WithConsole also writes human-readable log lines to w, in addition to the log file.
func WithConsole(w io.Writer) Option {
	return func(s *settings) { s.console = w }
}

func New(path string, opts ...Option) (*slog.Logger, func() error, error) {
	var cfg settings
	for _, opt := range opts {
		opt(&cfg)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, nil, fmt.Errorf("create log directory: %w", err)
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return nil, nil, fmt.Errorf("open log file %s: %w", path, err)
	}
	handler := slog.Handler(slog.NewJSONHandler(f, nil))
	if cfg.console != nil {
		handler = slog.NewMultiHandler(handler, slog.NewTextHandler(cfg.console, nil))
	}
	return slog.New(handler), f.Close, nil
}

func NewID() string {
	b := make([]byte, 6)
	if _, err := rand.Read(b); err != nil {
		panic(fmt.Sprintf("read random bytes: %v", err))
	}
	return hex.EncodeToString(b)
}
