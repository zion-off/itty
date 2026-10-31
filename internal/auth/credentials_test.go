package auth

import (
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/go-webauthn/webauthn/webauthn"
)

func discardLog() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func TestCredentialStoreRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data", "credentials.json")
	s := NewFileCredentialStore(path, discardLog())
	if creds, err := s.List(); err != nil || len(creds) != 0 {
		t.Fatalf("empty store: %v %v", creds, err)
	}
	if err := s.Add(webauthn.Credential{ID: []byte("a"), PublicKey: []byte("k")}); err != nil {
		t.Fatal(err)
	}
	if err := s.Update(webauthn.Credential{ID: []byte("a"), PublicKey: []byte("k"), Authenticator: webauthn.Authenticator{SignCount: 7}}); err != nil {
		t.Fatal(err)
	}
	creds, err := s.List()
	if err != nil || len(creds) != 1 || creds[0].Authenticator.SignCount != 7 {
		t.Fatalf("unexpected: %+v %v", creds, err)
	}
	info, _ := os.Stat(path)
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("mode = %v", info.Mode().Perm())
	}
}

func TestCredentialStoreUpdateUnknown(t *testing.T) {
	s := NewFileCredentialStore(filepath.Join(t.TempDir(), "c.json"), discardLog())
	if err := s.Update(webauthn.Credential{ID: []byte("zzz")}); err == nil {
		t.Fatal("expected error")
	}
}

func TestCredentialStoreRejectsCorruptFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "c.json")
	_ = os.WriteFile(path, []byte("{"), 0o600)
	if _, err := NewFileCredentialStore(path, discardLog()).List(); err == nil {
		t.Fatal("expected parse error")
	}
}
