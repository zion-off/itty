package push

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"

	"github.com/SherClockHolmes/webpush-go"
)

type VAPIDKeys struct {
	Public  string `json:"public_key"`
	Private string `json:"private_key"`
}

type KeyStore interface {
	LoadOrCreate() (VAPIDKeys, error)
}

type FileKeyStore struct {
	path string
	log  *slog.Logger
	mu   sync.Mutex
}

func NewFileKeyStore(path string, log *slog.Logger) *FileKeyStore {
	return &FileKeyStore{path: path, log: log}
}

func (s *FileKeyStore) LoadOrCreate() (VAPIDKeys, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	keys, err := s.read()
	if !errors.Is(err, os.ErrNotExist) {
		return keys, err
	}
	created, err := s.create()
	if errors.Is(err, os.ErrExist) {
		return s.read()
	}
	return created, err
}

func (s *FileKeyStore) read() (VAPIDKeys, error) {
	raw, err := os.ReadFile(s.path)
	if err != nil {
		return VAPIDKeys{}, err
	}
	var keys VAPIDKeys
	if err := json.Unmarshal(raw, &keys); err != nil {
		return VAPIDKeys{}, fmt.Errorf("parse push keys %s: %w", s.path, err)
	}
	if keys.Public == "" || keys.Private == "" {
		return VAPIDKeys{}, fmt.Errorf("push keys %s are incomplete", s.path)
	}
	return keys, nil
}

func (s *FileKeyStore) create() (VAPIDKeys, error) {
	private, public, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		return VAPIDKeys{}, fmt.Errorf("generate push keys: %w", err)
	}
	keys := VAPIDKeys{Public: public, Private: private}
	raw, err := json.Marshal(keys)
	if err != nil {
		return VAPIDKeys{}, err
	}
	if err := writeFileExclusive(s.path, raw); err != nil {
		return VAPIDKeys{}, err
	}
	s.log.Info("push key pair created", "path", s.path)
	return keys, nil
}

func writeFileExclusive(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("create directory %s: %w", dir, err)
	}
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Link(tmp.Name(), path); err != nil {
		return fmt.Errorf("write push keys %s: %w", path, err)
	}
	return nil
}
