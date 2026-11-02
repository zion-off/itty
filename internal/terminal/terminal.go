package terminal

import (
	"context"
	"errors"
	"io"
)

type Size struct {
	Cols uint16
	Rows uint16
}

type Session interface {
	io.ReadWriteCloser
	Resize(Size) error
	Wait() (exitCode int, err error)
}

type Launcher interface {
	Start(ctx context.Context, name string, size Size) (Session, error)
}

type Lister interface {
	List(ctx context.Context) ([]string, error)
}

type Window struct {
	ID     string `json:"id"`
	Index  int    `json:"index"`
	Name   string `json:"name"`
	Active bool   `json:"active"`
}

var ErrUnknownWindow = errors.New("unknown window")

type Navigator interface {
	Windows(ctx context.Context, session string) ([]Window, error)
	SelectWindow(ctx context.Context, session, windowID string) error
}
