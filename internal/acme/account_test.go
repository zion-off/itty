package acme

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/go-acme/lego/v4/registration"
)

func TestAccountStoreRoundTrip(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "acme")
	store := NewFileAccountStore(dir)
	if acct, err := store.Load(); acct != nil || err != nil {
		t.Fatalf("empty store: %v %v", acct, err)
	}

	key, err := newAccountKey()
	if err != nil {
		t.Fatal(err)
	}
	in := &Account{Email: "a@example.com", Key: key, Registration: &registration.Resource{URI: "https://ca/acct/1"}}
	if err := store.Save(in); err != nil {
		t.Fatal(err)
	}
	out, err := store.Load()
	if err != nil || out == nil {
		t.Fatalf("load: %v %v", out, err)
	}
	if out.Email != in.Email || out.Registration.URI != in.Registration.URI {
		t.Fatalf("account mismatch: %+v", out)
	}
	if !key.Equal(out.Key) {
		t.Fatal("key changed across save and load")
	}
	for _, name := range []string{"account.json", "account.key"} {
		if info, _ := os.Stat(filepath.Join(dir, name)); info.Mode().Perm() != 0o600 {
			t.Fatalf("%s mode = %v", name, info.Mode().Perm())
		}
	}
}

func TestAccountStoreRejectsCorruptKey(t *testing.T) {
	dir := t.TempDir()
	store := NewFileAccountStore(dir)
	key, _ := newAccountKey()
	_ = store.Save(&Account{Email: "a@example.com", Key: key})
	_ = os.WriteFile(filepath.Join(dir, "account.key"), []byte("junk"), 0o600)
	if _, err := store.Load(); err == nil {
		t.Fatal("expected error")
	}
}
