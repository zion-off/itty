package main

import (
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"sort"
	"strings"

	"github.com/zion/itty/internal/config"
	"github.com/zion/itty/internal/logging"
)

const defaultConfigPath = "itty.toml"

type command func(args []string) error

var commands = map[string]command{
	"init":   initCommand,
	"check":  withConfig("check", check),
	"enroll": withConfig("enroll", enroll),
	"serve":  withConfig("serve", serve),
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "itty:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	name := "serve"
	if len(args) > 0 && args[0] != "" && args[0][0] != '-' {
		name, args = args[0], args[1:]
	}
	cmd, ok := commands[name]
	if !ok {
		return fmt.Errorf("unknown command %q (available: %s)", name, strings.Join(commandNames(), ", "))
	}
	return cmd(args)
}

func commandNames() []string {
	names := make([]string, 0, len(commands))
	for n := range commands {
		names = append(names, n)
	}
	sort.Strings(names)
	return names
}

func withConfig(name string, fn func(cfg config.Config, log *slog.Logger) error) command {
	return func(args []string) (err error) {
		fs := flag.NewFlagSet("itty "+name, flag.ContinueOnError)
		configPath := fs.String("config", defaultConfigPath, "path to the configuration file")
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
		return fn(cfg, log)
	}
}
