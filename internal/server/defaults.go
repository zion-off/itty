package server

import "context"

type onlySession string

func (o onlySession) List(context.Context) ([]string, error) { return []string{string(o)}, nil }

type forgetfulStore struct{}

func (forgetfulStore) Load() (string, error) { return "", nil }
func (forgetfulStore) Save(string) error     { return nil }
