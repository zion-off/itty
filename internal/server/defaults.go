package server

import (
	"context"
	"errors"

	"github.com/zion/itty/internal/terminal"
)

type onlySession string

func (o onlySession) List(context.Context) ([]string, error) { return []string{string(o)}, nil }

type forgetfulStore struct{}

func (forgetfulStore) Load() (string, error) { return "", nil }
func (forgetfulStore) Save(string) error     { return nil }

type noWindows struct{}

func (noWindows) Windows(context.Context, string) ([]terminal.Window, error) { return nil, nil }
func (noWindows) SelectWindow(context.Context, string, string) error {
	return errors.New("window selection is not available")
}
func (noWindows) NewWindow(context.Context, string) error {
	return errors.New("window creation is not available")
}
func (noWindows) CloseWindow(context.Context, string, string) error {
	return errors.New("window closing is not available")
}
