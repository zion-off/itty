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

func TestCopyFileAtomicReplacesWithTheRequestedMode(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "src")
	dst := filepath.Join(dir, "bin", "dst")
	_ = os.WriteFile(src, []byte("new"), 0o600)
	_ = os.MkdirAll(filepath.Dir(dst), 0o755)
	_ = os.WriteFile(dst, []byte("old"), 0o644)

	if err := CopyFileAtomic(src, dst, 0o755); err != nil {
		t.Fatal(err)
	}
	got, _ := os.ReadFile(dst)
	info, _ := os.Stat(dst)
	if string(got) != "new" || info.Mode().Perm() != 0o755 {
		t.Fatalf("content=%q mode=%v", got, info.Mode().Perm())
	}
	if entries, _ := os.ReadDir(filepath.Dir(dst)); len(entries) != 1 {
		t.Fatalf("temporary files left behind: %v", entries)
	}
}

func TestSymlinkAtomicReplacesAnExistingFile(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "target")
	link := filepath.Join(dir, "bin", "link")
	_ = os.WriteFile(target, []byte("x"), 0o755)
	_ = os.MkdirAll(filepath.Dir(link), 0o755)
	_ = os.WriteFile(link, []byte("stale"), 0o644)

	if err := SymlinkAtomic(target, link); err != nil {
		t.Fatal(err)
	}
	if got, err := os.Readlink(link); err != nil || got != target {
		t.Fatalf("readlink = %q, %v", got, err)
	}
}
