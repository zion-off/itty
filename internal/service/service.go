package service

import (
	"bytes"
	"context"
	_ "embed"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"text/template"
)

const (
	Name     = "itty"
	UnitPath = "/etc/systemd/system/itty.service"
)

//go:embed itty.service.tmpl
var unitTemplate string

var ErrUnknownAction = errors.New("unknown service action")

type Runner interface {
	Run(ctx context.Context, name string, args ...string) error
}

type ExecRunner struct{}

func (ExecRunner) Run(ctx context.Context, name string, args ...string) error {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	return cmd.Run()
}

type Unit struct {
	User       string
	WorkingDir string
	Executable string
	ConfigPath string
}

func (u Unit) Render() ([]byte, error) {
	tmpl, err := template.New("unit").Parse(unitTemplate)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, u); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

type Manager struct {
	Runner  Runner
	Log     *slog.Logger
	IsRoot  bool
	TmpDir  string
	Session string
}

func (m Manager) Install(ctx context.Context, unit Unit) error {
	rendered, err := unit.Render()
	if err != nil {
		return fmt.Errorf("render unit file: %w", err)
	}
	dir, err := os.MkdirTemp(m.TmpDir, "itty-unit-")
	if err != nil {
		return fmt.Errorf("create temporary directory: %w", err)
	}
	defer os.RemoveAll(dir)
	staged := filepath.Join(dir, "itty.service")
	if err := os.WriteFile(staged, rendered, 0o644); err != nil {
		return fmt.Errorf("write unit file: %w", err)
	}
	return m.runAll(ctx,
		m.privileged("install", "-m", "0644", staged, UnitPath),
		m.privileged("systemctl", "daemon-reload"),
		m.privileged("systemctl", "enable", "--now", Name),
	)
}

func (m Manager) Uninstall(ctx context.Context) error {
	return m.runAll(ctx,
		m.privileged("systemctl", "disable", "--now", Name),
		m.privileged("rm", "-f", UnitPath),
		m.privileged("systemctl", "daemon-reload"),
	)
}

func (m Manager) Do(ctx context.Context, action string, killSession bool) error {
	switch action {
	case "start", "stop", "restart", "enable", "disable":
		if err := m.runAll(ctx, m.privileged("systemctl", action, Name)); err != nil {
			return err
		}
	case "status":
		return m.runStatus(ctx)
	default:
		return fmt.Errorf("%w %q", ErrUnknownAction, action)
	}
	if killSession && action == "stop" {
		return m.runAll(ctx, step{"tmux", []string{"kill-session", "-t", "=" + m.Session}})
	}
	return nil
}

type step struct {
	name string
	args []string
}

func (m Manager) privileged(name string, args ...string) step {
	if m.IsRoot {
		return step{name, args}
	}
	return step{"sudo", append([]string{name}, args...)}
}

func (m Manager) runAll(ctx context.Context, steps ...step) error {
	for _, s := range steps {
		m.Log.Info("running command", "command", s.name, "args", s.args)
		if err := m.Runner.Run(ctx, s.name, s.args...); err != nil {
			m.Log.Error("command failed", "command", s.name, "args", s.args, "error", err)
			return fmt.Errorf("%s %v: %w", s.name, s.args, err)
		}
	}
	return nil
}

func (m Manager) runStatus(ctx context.Context) error {
	args := []string{"status", "--no-pager", Name}
	m.Log.Info("running command", "command", "systemctl", "args", args)
	err := m.Runner.Run(ctx, "systemctl", args...)
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) && exitErr.ExitCode() == statusInactiveExit {
		return nil
	}
	return err
}

const statusInactiveExit = 3
