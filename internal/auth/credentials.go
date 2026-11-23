package auth

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"sync"

	"github.com/go-webauthn/webauthn/webauthn"

	"github.com/zion-off/itty/internal/fsutil"
)

type CredentialStore interface {
	List() ([]webauthn.Credential, error)
	Add(webauthn.Credential) error
	Update(webauthn.Credential) error
}

type FileCredentialStore struct {
	path string
	log  *slog.Logger
	mu   sync.Mutex
}

func NewFileCredentialStore(path string, log *slog.Logger) *FileCredentialStore {
	return &FileCredentialStore{path: path, log: log}
}

func (s *FileCredentialStore) List() ([]webauthn.Credential, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.read()
}

func (s *FileCredentialStore) Add(c webauthn.Credential) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	creds, err := s.read()
	if err != nil {
		return err
	}
	creds = append(creds, c)
	if err := s.write(creds); err != nil {
		return err
	}
	s.log.Info("credential stored", "credential_count", len(creds))
	return nil
}

func (s *FileCredentialStore) Update(c webauthn.Credential) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	creds, err := s.read()
	if err != nil {
		return err
	}
	for i := range creds {
		if string(creds[i].ID) == string(c.ID) {
			creds[i] = c
			return s.write(creds)
		}
	}
	return errors.New("credential not found")
}

func (s *FileCredentialStore) read() ([]webauthn.Credential, error) {
	raw, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read credentials %s: %w", s.path, err)
	}
	var creds []webauthn.Credential
	if err := json.Unmarshal(raw, &creds); err != nil {
		return nil, fmt.Errorf("parse credentials %s: %w", s.path, err)
	}
	return creds, nil
}

func (s *FileCredentialStore) write(creds []webauthn.Credential) error {
	raw, err := json.Marshal(creds)
	if err != nil {
		return err
	}
	return fsutil.WriteFileAtomic(s.path, raw, 0o600)
}
