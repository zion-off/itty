package acme

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/go-acme/lego/v4/registration"

	"github.com/zion-off/itty/internal/fsutil"
)

type Account struct {
	Email        string
	Registration *registration.Resource
	Key          crypto.PrivateKey
}

func (a *Account) GetEmail() string                        { return a.Email }
func (a *Account) GetRegistration() *registration.Resource { return a.Registration }
func (a *Account) GetPrivateKey() crypto.PrivateKey        { return a.Key }

type AccountStore interface {
	Load() (*Account, error)
	Save(*Account) error
}

type FileAccountStore struct{ dir string }

func NewFileAccountStore(dir string) *FileAccountStore { return &FileAccountStore{dir: dir} }

type accountRecord struct {
	Email        string                 `json:"email"`
	Registration *registration.Resource `json:"registration"`
}

func (s *FileAccountStore) Load() (*Account, error) {
	rawRecord, err := os.ReadFile(s.recordPath())
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read account: %w", err)
	}
	var rec accountRecord
	if err := json.Unmarshal(rawRecord, &rec); err != nil {
		return nil, fmt.Errorf("parse account: %w", err)
	}
	rawKey, err := os.ReadFile(s.keyPath())
	if err != nil {
		return nil, fmt.Errorf("read account key: %w", err)
	}
	block, _ := pem.Decode(rawKey)
	if block == nil {
		return nil, errors.New("account key is not valid PEM")
	}
	key, err := x509.ParseECPrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse account key: %w", err)
	}
	return &Account{Email: rec.Email, Registration: rec.Registration, Key: key}, nil
}

func (s *FileAccountStore) Save(a *Account) error {
	key, ok := a.Key.(*ecdsa.PrivateKey)
	if !ok {
		return errors.New("account key must be an ECDSA key")
	}
	der, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		return err
	}
	if err := fsutil.WriteFileAtomic(s.keyPath(), pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: der}), 0o600); err != nil {
		return err
	}
	rec, err := json.Marshal(accountRecord{Email: a.Email, Registration: a.Registration})
	if err != nil {
		return err
	}
	return fsutil.WriteFileAtomic(s.recordPath(), rec, 0o600)
}

func (s *FileAccountStore) recordPath() string { return filepath.Join(s.dir, "account.json") }
func (s *FileAccountStore) keyPath() string    { return filepath.Join(s.dir, "account.key") }

func newAccountKey() (*ecdsa.PrivateKey, error) {
	return ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
}
