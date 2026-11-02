package service

import (
	"errors"
	"fmt"
	"os"
	"regexp"
)

var ErrNoInstalledConfig = errors.New("the installed service does not name a config file")

var execStartConfig = regexp.MustCompile(`(?m)^ExecStart=.*\s-config "([^"]+)"`)

func InstalledConfigPath() (string, error) {
	return ConfigPathFrom(UnitPath)
}

func ConfigPathFrom(unitFile string) (string, error) {
	raw, err := os.ReadFile(unitFile)
	if err != nil {
		return "", fmt.Errorf("read unit file %s: %w", unitFile, err)
	}
	match := execStartConfig.FindSubmatch(raw)
	if match == nil {
		return "", ErrNoInstalledConfig
	}
	return string(match[1]), nil
}
