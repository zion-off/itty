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
	Start(ctx context.Context, name string, size Size) (Session, error)
}

type Lister interface {
	List(ctx context.Context) ([]string, error)
}
