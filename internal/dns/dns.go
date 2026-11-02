package dns

import (
	"context"
	"io"
	"log/slog"
)

type Provider interface {
	Publish(ctx context.Context, name, value string) error
	Remove(ctx context.Context, name, value string) error
}

type Env struct {
	In  io.Reader
	Out io.Writer
	Log *slog.Logger
}

type Factory func(Env) (Provider, error)
