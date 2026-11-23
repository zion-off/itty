package main

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"

	"github.com/zion-off/itty/internal/install"
)

func newInstallCommand() *cobra.Command {
	var dir string
	var link bool

	cmd := &cobra.Command{
		Use:   "install",
		Short: "Copy this binary to a directory on your PATH",
		Args:  usageArgs(cobra.NoArgs),
		RunE: func(cmd *cobra.Command, _ []string) error {
			return installBinary(cmd, dir, link)
		},
	}
	flags := cmd.Flags()
	flags.StringVarP(&dir, "dir", "d", "", "directory to install itty into (default: ~/.local/bin)")
	flags.BoolVarP(&link, "link", "l", false, "link to this binary instead of copying it, so rebuilding updates the installed command")
	return cmd
}

func installBinary(cmd *cobra.Command, dir string, link bool) error {
	if dir == "" {
		defaultDir, err := install.DefaultDir()
		if err != nil {
			return err
		}
		dir = defaultDir
	}

	source, err := os.Executable()
	if err != nil {
		return fmt.Errorf("find the itty binary: %w", err)
	}
	if source, err = filepath.EvalSymlinks(source); err != nil {
		return fmt.Errorf("resolve the itty binary path: %w", err)
	}

	log := slog.New(slog.NewTextHandler(cmd.ErrOrStderr(), &slog.HandlerOptions{Level: slog.LevelWarn}))

	result, err := install.Installer{PathEnv: os.Getenv("PATH"), Log: log}.Install(install.Options{Source: source, Dir: dir, Link: link})
	if err != nil {
		return err
	}
	out := cmd.OutOrStdout()
	if result.Unchanged {
		fmt.Fprintf(out, "%s is already this binary.\n", result.Target)
	} else {
		fmt.Fprintf(out, "Installed %s\n", result.Target)
	}
	if !result.OnPath {
		fmt.Fprintf(out, "\n%s is not on your PATH. Add this line to your shell startup file (~/.bashrc or ~/.zshrc):\n\n  export PATH=\"%s:$PATH\"\n", dir, dir)
	}
	return nil
}
