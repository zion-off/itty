package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"os/user"
	"path/filepath"
	"syscall"

	"github.com/zion/itty/internal/config"
	"github.com/zion/itty/internal/service"
)

const serviceUsage = "usage: itty service <install|uninstall|start|stop|restart|enable|disable|status> [-config path] [-kill-session]"

func serviceCommand(args []string) error {
	if len(args) == 0 || args[0] == "" || args[0][0] == '-' {
		return errors.New(serviceUsage)
	}
	action := args[0]

	fs := flag.NewFlagSet("itty service "+action, flag.ContinueOnError)
	configPath := configPathFlag(fs)
	killSession := fs.Bool("kill-session", false, "with stop: also end the tmux session")
	if err := fs.Parse(args[1:]); err != nil {
		return err
	}
	if *killSession && action != "stop" {
		return errors.New("-kill-session only applies to stop")
	}

	path := configPath()
	return runWithConfig(path, func(cfg config.Config, log *slog.Logger) error {
		return runService(cfg, log, action, path, *killSession)
	})
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
