package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"os/user"
	"path/filepath"
	"slices"
	"syscall"

	"github.com/spf13/cobra"

	"github.com/zion-off/itty/internal/config"
	"github.com/zion-off/itty/internal/service"
)

type serviceAction struct {
	name  string
	short string
}

var serviceActions = []serviceAction{
	{"install", "Install, enable and start the systemd service"},
	{"uninstall", "Stop and disable the service and remove its unit file"},
	{"start", "Start the service"},
	{"stop", "Stop the service"},
	{"restart", "Restart the service"},
	{"enable", "Start the service at boot"},
	{"disable", "Do not start the service at boot"},
	{"status", "Show the service status"},
}

var serviceShortcutNames = []string{"start", "stop", "restart", "status"}

func newServiceCommand() *cobra.Command {
	group := newGroupCommand("service", "Install and control the itty systemd service")
	for _, action := range serviceActions {
		group.AddCommand(newServiceActionCommand(action.name, action.short))
	}
	return group
}

func newServiceShortcuts() []*cobra.Command {
	shortcuts := make([]*cobra.Command, 0, len(serviceShortcutNames))
	for _, action := range serviceActions {
		if slices.Contains(serviceShortcutNames, action.name) {
			shortcuts = append(shortcuts, newServiceActionCommand(action.name, action.short+" (shortcut for 'itty service "+action.name+"')"))
		}
	}
	return shortcuts
}

func newServiceActionCommand(action, short string) *cobra.Command {
	var killSession bool
	cmd := &cobra.Command{
		Use:   action,
		Short: short,
		Args:  usageArgs(cobra.NoArgs),
	}
	configPath := addConfigFlag(cmd.Flags())
	if action == "stop" {
		cmd.Flags().BoolVar(&killSession, "kill-session", false, "also end the tmux session")
	}
	cmd.RunE = func(*cobra.Command, []string) error {
		path := configPath()
		return runWithConfig(path, func(cfg config.Config, log *slog.Logger) error {
			return runService(cfg, log, action, path, killSession)
		})
	}
	return cmd
}

func runService(cfg config.Config, log *slog.Logger, action, configPath string, killSession bool) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	manager := service.Manager{
		Runner:  service.ExecRunner{},
		Log:     log,
		IsRoot:  os.Geteuid() == 0,
		Session: cfg.TmuxSession,
	}

	switch action {
	case "install":
		unit, err := currentUnit(configPath)
		if err != nil {
			return err
		}
		if err := manager.Install(ctx, unit); err != nil {
			return err
		}
		fmt.Printf("\nInstalled and started the %s service. Check it with: itty service status\n", service.Name)
		return nil
	case "uninstall":
		if err := manager.Uninstall(ctx); err != nil {
			return err
		}
		fmt.Printf("\nRemoved the %s service. The tmux session, if any, is still running.\n", service.Name)
		return nil
	default:
		return manager.Do(ctx, action, killSession)
	}
}

func currentUnit(configPath string) (service.Unit, error) {
	exe, err := os.Executable()
	if err != nil {
		return service.Unit{}, fmt.Errorf("find the itty binary: %w", err)
	}
	if exe, err = filepath.EvalSymlinks(exe); err != nil {
		return service.Unit{}, fmt.Errorf("resolve the itty binary path: %w", err)
	}
	absConfig, err := filepath.Abs(configPath)
	if err != nil {
		return service.Unit{}, fmt.Errorf("resolve the config path: %w", err)
	}
	current, err := user.Current()
	if err != nil {
		return service.Unit{}, fmt.Errorf("find the current user: %w", err)
	}
	return service.Unit{
		User:       current.Username,
		WorkingDir: filepath.Dir(absConfig),
		Executable: exe,
		ConfigPath: absConfig,
	}, nil
}
