package main

import (
	"os"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"

	"github.com/zion-off/itty/internal/service"
)

var installedConfigPath = service.InstalledConfigPath

func addConfigFlag(flags *pflag.FlagSet) func() string {
	value := flags.StringP("config", "c", "", "path to the configuration file (default: $ITTY_CONFIG, then ./itty.toml, then the installed service's config)")
	return func() string { return resolveConfigPath(*value) }
}

func resolveConfigPath(explicit string) string {
	if explicit != "" {
		return explicit
	}
	if fromEnv := os.Getenv("ITTY_CONFIG"); fromEnv != "" {
		return fromEnv
	}
	if _, err := os.Stat(defaultConfigPath); err == nil {
		return defaultConfigPath
	}
	if installed, err := installedConfigPath(); err == nil {
		return installed
	}
	return defaultConfigPath
}

func newConfigBoundCommand(use, short string, fn configRunner) *cobra.Command {
	cmd := &cobra.Command{
		Use:   use,
		Short: short,
		Args:  usageArgs(cobra.NoArgs),
	}
	configPath := addConfigFlag(cmd.Flags())
	cmd.RunE = func(*cobra.Command, []string) error { return runWithConfig(configPath(), fn) }
	return cmd
}
