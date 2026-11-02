package install

import (
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"testing"
)

func newInstaller(path string) Installer {
	return Installer{PathEnv: path, Log: slog.New(slog.NewTextHandler(io.Discard, nil))}
}

func writeSource(t *testing.T, content string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "itty-build")
	if err := os.WriteFile(p, []byte(content), 0o755); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestInstallCopiesAnExecutableAndCreatesTheDirectory(t *testing.T) {
	src := writeSource(t, "binary-v1")
	dir := filepath.Join(t.TempDir(), "new", "bin")

	res, err := newInstaller("").Install(Options{Source: src, Dir: dir})
	if err != nil {
		t.Fatal(err)
	}
	got, _ := os.ReadFile(res.Target)
	info, _ := os.Stat(res.Target)
	if string(got) != "binary-v1" || info.Mode().Perm() != 0o755 {
		t.Fatalf("content=%q mode=%v", got, info.Mode().Perm())
	}
	if info, _ := os.Lstat(res.Target); info.Mode()&os.ModeSymlink != 0 {
		t.Fatal("copy mode must not create a symlink")
	}
}

func TestInstallLinkPointsAtTheSource(t *testing.T) {
	src := writeSource(t, "binary")
	dir := t.TempDir()
	res, err := newInstaller("").Install(Options{Source: src, Dir: dir, Link: true})
	if err != nil {
		t.Fatal(err)
	}
	if got, err := os.Readlink(res.Target); err != nil || got != src {
		t.Fatalf("readlink = %q, %v", got, err)
	}
}

func TestReinstallReplacesAnOlderCopy(t *testing.T) {
	dir := t.TempDir()
	inst := newInstaller("")
	if _, err := inst.Install(Options{Source: writeSource(t, "v1"), Dir: dir}); err != nil {
		t.Fatal(err)
	}
	res, err := inst.Install(Options{Source: writeSource(t, "v2"), Dir: dir})
	if err != nil || res.Unchanged {
		t.Fatalf("res=%+v err=%v", res, err)
	}
	if got, _ := os.ReadFile(res.Target); string(got) != "v2" {
		t.Fatalf("content = %q", got)
	}
}

func TestInstallingTheSameBinaryIsANoOp(t *testing.T) {
	dir := t.TempDir()
	src := writeSource(t, "binary")
	inst := newInstaller("")
	if _, err := inst.Install(Options{Source: src, Dir: dir, Link: true}); err != nil {
		t.Fatal(err)
	}
	res, err := inst.Install(Options{Source: src, Dir: dir, Link: true})
	if err != nil || !res.Unchanged {
		t.Fatalf("res=%+v err=%v", res, err)
	}
	if res, _ := inst.Install(Options{Source: filepath.Join(dir, "itty"), Dir: dir}); !res.Unchanged {
		t.Fatal("installing the installed binary onto itself must not touch it")
	}
}

func TestOnPathDetection(t *testing.T) {
	list := string(os.PathListSeparator)
	inst := newInstaller("/usr/bin" + list + "/home/u/.local/bin/" + list)
	if !inst.onPath("/home/u/.local/bin") {
		t.Fatal("a directory on PATH was not detected, even with a trailing slash")
	}
	if inst.onPath("/home/u/bin") || newInstaller("").onPath("/home/u/bin") {
		t.Fatal("a directory that is not on PATH was reported as on PATH")
	}
}

func TestInstallReportsAnUnwritableDirectory(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root can write anywhere")
	}
	if _, err := newInstaller("").Install(Options{Source: writeSource(t, "x"), Dir: "/proc/itty-bin"}); err == nil {
		t.Fatal("expected error")
	}
}
