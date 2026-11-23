package install

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/zion-off/itty/internal/fsutil"
)

type Options struct {
	Source string
	Dir    string
	Link   bool
}

type Result struct {
	Target    string
	OnPath    bool
	Unchanged bool
}

type Installer struct {
	PathEnv string
	Log     *slog.Logger
}

func DefaultDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("find the home directory: %w", err)
	}
	return filepath.Join(home, ".local", "bin"), nil
}

func (i Installer) Install(opts Options) (Result, error) {
	target := filepath.Join(opts.Dir, "itty")
	result := Result{Target: target, OnPath: i.onPath(opts.Dir)}

	if sameFile(opts.Source, target) {
		i.Log.Info("binary already installed", "target", target)
		result.Unchanged = true
		return result, nil
	}

	var err error
	if opts.Link {
		err = fsutil.SymlinkAtomic(opts.Source, target)
	} else {
		err = fsutil.CopyFileAtomic(opts.Source, target, 0o755)
	}
	if err != nil {
		i.Log.Error("binary install failed", "target", target, "link", opts.Link, "error", err)
		return Result{}, fmt.Errorf("install %s: %w", target, err)
	}
	i.Log.Info("binary installed", "source", opts.Source, "target", target, "link", opts.Link, "on_path", result.OnPath)
	return result, nil
}

func (i Installer) onPath(dir string) bool {
	want := filepath.Clean(dir)
	for _, entry := range filepath.SplitList(i.PathEnv) {
		if entry != "" && filepath.Clean(entry) == want {
			return true
		}
	}
	return false
}

func sameFile(a, b string) bool {
	infoA, errA := os.Stat(a)
	infoB, errB := os.Stat(b)
	return errA == nil && errB == nil && os.SameFile(infoA, infoB)
}
