package terminal

import (
	"context"
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
	Start(ctx context.Context, size Size) (Session, error)
}
