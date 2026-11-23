package main

import (
	"errors"
	"fmt"
	"io"
	"log/slog"
	"path/filepath"

	"github.com/pelletier/go-toml/v2"
	"github.com/spf13/cobra"

	"github.com/zion-off/itty/internal/config"
	"github.com/zion-off/itty/internal/logging"
)

func newConfigCommand() *cobra.Command {
	group := newGroupCommand("config", "Show or change settings without editing the configuration file")
	configPath := addConfigFlag(group.PersistentFlags())

	group.AddCommand(
		&cobra.Command{
			Use:   "show",
			Short: "Print every setting",
			Args:  usageArgs(cobra.NoArgs),
			RunE: func(cmd *cobra.Command, _ []string) error {
				return runWithRawConfig(configPath(), func(cfg config.Config, _ string, _ *slog.Logger) error {
					return configShow(cfg, cmd.OutOrStdout())
				})
			},
		},
		&cobra.Command{
			Use:   "get KEY",
			Short: "Print one setting",
			Args:  usageArgs(cobra.ExactArgs(1)),
			RunE: func(cmd *cobra.Command, args []string) error {
				return runWithRawConfig(configPath(), func(cfg config.Config, _ string, _ *slog.Logger) error {
					return configGet(cfg, args[0], cmd.OutOrStdout())
				})
			},
		},
		&cobra.Command{
			Use:   "set KEY VALUE",
			Short: "Change one setting after checking that the result is valid",
			Args:  usageArgs(cobra.ExactArgs(2)),
			RunE: func(cmd *cobra.Command, args []string) error {
				return runWithRawConfig(configPath(), func(cfg config.Config, path string, log *slog.Logger) error {
					return configSet(path, cfg, args[0], args[1], cmd.OutOrStdout(), log)
				})
			},
		},
	)
	return group
}

func runWithRawConfig(path string, fn func(cfg config.Config, path string, log *slog.Logger) error) (err error) {
	cfg, err := config.LoadRaw(path)
	if err != nil {
		return err
	}
	log, closeLog, err := logging.New(cfg.Resolved(filepath.Dir(path)).LogFile)
	if err != nil {
		return err
	}
	defer func() { err = errors.Join(err, closeLog()) }()
	return fn(cfg, path, log)
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
