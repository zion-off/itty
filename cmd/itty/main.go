package main

import (
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"

	"github.com/zion/itty/internal/config"
	"github.com/zion/itty/internal/logging"
)

const defaultConfigPath = "itty.toml"

const (
	exitOK      = 0
	exitFailure = 1
	exitUsage   = 2
)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout, stderr io.Writer) int {
	root := newRootCommand()
	root.SetOut(stdout)
	root.SetErr(stderr)
	root.SetArgs(args)

	cmd, err := root.ExecuteC()
	if err == nil {
		return exitOK
	}
	fmt.Fprintln(stderr, "itty:", err)
	if errors.As(err, new(usageError)) {
		fmt.Fprintf(stderr, "Try '%s --help' for more information.\n", cmd.CommandPath())
		return exitUsage
	}
	return exitFailure
}

type configRunner func(cfg config.Config, log *slog.Logger) error

func runWithConfig(path string, fn configRunner, logOpts ...logging.Option) (err error) {
	cfg, err := config.Load(path)
	if err != nil {
		return err
	}
	log, closeLog, err := logging.New(cfg.LogFile, logOpts...)
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, closeLog()) }()
	return fn(cfg, log)
}
