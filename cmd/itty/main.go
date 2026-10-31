package main

import (
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"

	"github.com/zion/itty/internal/config"
	"github.com/zion/itty/internal/logging"
)

type command func(cfg config.Config, log *slog.Logger) error

var commands = map[string]command{
	"serve":  serve,
	"enroll": enroll,
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "itty:", err)
		os.Exit(1)
	}
}

func run(args []string) (err error) {
	name := "serve"
	if len(args) > 0 && len(args[0]) > 0 && args[0][0] != '-' {
		name, args = args[0], args[1:]
	}
	cmd, ok := commands[name]
	if !ok {
		return fmt.Errorf("unknown command %q (available: serve, enroll)", name)
	}

	fs := flag.NewFlagSet("itty "+name, flag.ContinueOnError)
	configPath := fs.String("config", "itty.toml", "path to the configuration file")
	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg, err := config.Load(*configPath)
	if err != nil {
		return err
	}
	log, closeLog, err := logging.New(cfg.LogFile)
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, closeLog()) }()

	return cmd(cfg, log)
}
