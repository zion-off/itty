package main

import (
	"flag"
	"os"

	"github.com/zion/itty/internal/service"
)

var installedConfigPath = service.InstalledConfigPath

func configPathFlag(fs *flag.FlagSet) func() string {
	value := fs.String("config", "", "path to the configuration file (default: ITTY_CONFIG, then ./itty.toml, then the installed service's config)")
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
