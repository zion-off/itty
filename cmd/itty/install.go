package main

import (
	"flag"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/zion/itty/internal/install"
)

func installCommand(args []string) error {
	defaultDir, err := install.DefaultDir()
	if err != nil {
		return err
	}
	fs := flag.NewFlagSet("itty install", flag.ContinueOnError)
	dir := fs.String("dir", defaultDir, "directory to install itty into")
	link := fs.Bool("link", false, "link to this binary instead of copying it, so rebuilding updates the installed command")
	if err := fs.Parse(args); err != nil {
		return err
	}

	source, err := os.Executable()
	if err != nil {
		return fmt.Errorf("find the itty binary: %w", err)
	}
	if source, err = filepath.EvalSymlinks(source); err != nil {
		return fmt.Errorf("resolve the itty binary path: %w", err)
	}

	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))

	result, err := install.Installer{PathEnv: os.Getenv("PATH"), Log: log}.Install(install.Options{Source: source, Dir: *dir, Link: *link})
	if err != nil {
		return err
	}
	if result.Unchanged {
		fmt.Printf("%s is already this binary.\n", result.Target)
	} else {
		fmt.Printf("Installed %s\n", result.Target)
	}
	if !result.OnPath {
		fmt.Printf("\n%s is not on your PATH. Add this line to your shell startup file (~/.bashrc or ~/.zshrc):\n\n  export PATH=\"%s:$PATH\"\n", *dir, *dir)
	}
	return nil
}
