package fsutil

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWriteFileAtomicSetsModeAndReplaces(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sub", "f")
	for _, content := range []string{"one", "two"} {
		if err := WriteFileAtomic(path, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	got, _ := os.ReadFile(path)
	if string(got) != "two" {
		t.Fatalf("content = %q", got)
	}
	if info, _ := os.Stat(path); info.Mode().Perm() != 0o600 {
		t.Fatalf("mode = %v", info.Mode().Perm())
	}
	entries, _ := os.ReadDir(filepath.Dir(path))
	if len(entries) != 1 {
		t.Fatalf("temporary files left behind: %v", entries)
	}
}
