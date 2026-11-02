package lastsession

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadReturnsEmptyWhenNothingWasSaved(t *testing.T) {
	name, err := NewFileStore(filepath.Join(t.TempDir(), "last-session")).Load()
	if err != nil || name != "" {
		t.Fatalf("name=%q err=%v", name, err)
	}
}

func TestSaveThenLoadRoundTripsNamesWithSpaces(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data", "last-session")
	store := NewFileStore(path)
	for _, name := range []string{"work", "my project"} {
		if err := store.Save(name); err != nil {
			t.Fatal(err)
		}
		if got, err := store.Load(); err != nil || got != name {
			t.Fatalf("got %q err=%v, want %q", got, err, name)
		}
	}
	if info, _ := os.Stat(path); info.Mode().Perm() != 0o600 {
		t.Fatalf("mode = %v", info.Mode().Perm())
	}
}

func TestSaveFailsWhenTheDirectoryIsNotWritable(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root can write anywhere")
	}
	if err := NewFileStore("/proc/itty/last-session").Save("work"); err == nil {
		t.Fatal("expected error")
	}
}
