package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/pelletier/go-toml/v2"

	"github.com/zion/itty/internal/config"
	"github.com/zion/itty/internal/logging"
)

const configUsage = "usage: itty config <show | get KEY | set KEY VALUE> [-config path]"

func configCommand(args []string) error {
	fs := flag.NewFlagSet("itty config", flag.ContinueOnError)
	configPath := configPathFlag(fs)
	words, err := parseInterspersed(fs, args)
	if err != nil {
		return err
	}
	if len(words) == 0 {
		return errors.New(configUsage)
	}

	path := configPath()
	cfg, err := config.LoadRaw(path)
	if err != nil {
		return err
	}
	log, closeLog, err := logging.New(cfg.Resolved(filepath.Dir(path)).LogFile)
	if err != nil {
		return err
	}
	defer closeLog()

	switch action, rest := words[0], words[1:]; {
	case action == "show" && len(rest) == 0:
		return configShow(cfg, os.Stdout)
	case action == "get" && len(rest) == 1:
		return configGet(cfg, rest[0], os.Stdout)
	case action == "set" && len(rest) == 2:
		return configSet(path, cfg, rest[0], rest[1], os.Stdout, log)
	}
	return errors.New(configUsage)
}

func configShow(cfg config.Config, out io.Writer) error {
	raw, err := toml.Marshal(cfg)
	if err != nil {
		return err
	}
	_, err = out.Write(raw)
	return err
}

func configGet(cfg config.Config, key string, out io.Writer) error {
	value, err := cfg.Get(key)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintln(out, value)
	return err
}

func configSet(path string, cfg config.Config, key, value string, out io.Writer, log *slog.Logger) error {
	before, err := cfg.Get(key)
	if err != nil {
		return err
	}
	if err := cfg.Set(key, value); err != nil {
		return err
	}
	if err := config.Save(path, cfg); err != nil {
		log.Error("config change rejected", "key", key, "error", err)
		return err
	}
	log.Info("config changed", "path", path, "key", key, "from", before, "to", value)

	fmt.Fprintf(out, "%s: %s -> %s\n", key, before, value)
	if key == "hostname" && before != value {
		fmt.Fprintln(out, "Passkeys are tied to the hostname, so existing passkeys stop working. Run itty enroll to register a new one.")
	}
	fmt.Fprintln(out, "Restart the server to apply the change: itty service restart")
	return nil
}

func parseInterspersed(fs *flag.FlagSet, args []string) ([]string, error) {
	var words []string
	for {
		if err := fs.Parse(args); err != nil {
			return nil, err
		}
		rest := fs.Args()
		if len(rest) == 0 {
			return words, nil
		}
		words = append(words, rest[0])
		args = rest[1:]
	}
}
