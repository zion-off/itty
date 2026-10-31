package terminal

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/creack/pty"
	"golang.org/x/sys/unix"
)

type TmuxLauncher struct {
	Session string
	Log     *slog.Logger
}

func (l TmuxLauncher) Start(ctx context.Context, size Size) (Session, error) {
	cmd := exec.Command("tmux", "new-session", "-A", "-s", l.Session)
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")
	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: size.Cols, Rows: size.Rows})
	if err != nil {
		return nil, fmt.Errorf("start tmux session %q: %w", l.Session, err)
	}
	if err := disableFlowControl(ptmx); err != nil {
		_ = ptmx.Close()
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		return nil, fmt.Errorf("disable flow control: %w", err)
	}
	l.Log.InfoContext(ctx, "terminal process started", "session", l.Session, "pid", cmd.Process.Pid)
	return &ptySession{ptmx: ptmx, cmd: cmd, log: l.Log}, nil
}

func disableFlowControl(f *os.File) error {
	t, err := unix.IoctlGetTermios(int(f.Fd()), unix.TCGETS)
	if err != nil {
		return err
	}
	t.Iflag &^= unix.IXON | unix.IXOFF
	return unix.IoctlSetTermios(int(f.Fd()), unix.TCSETS, t)
}

type ptySession struct {
	ptmx *os.File
	cmd  *exec.Cmd
	log  *slog.Logger

	closeOnce sync.Once
	waitOnce  sync.Once
	exitCode  int
	waitErr   error
}

func (s *ptySession) Read(p []byte) (int, error)  { return s.ptmx.Read(p) }
func (s *ptySession) Write(p []byte) (int, error) { return s.ptmx.Write(p) }

func (s *ptySession) Resize(size Size) error {
	return pty.Setsize(s.ptmx, &pty.Winsize{Cols: size.Cols, Rows: size.Rows})
}

func (s *ptySession) Close() error {
	var err error
	s.closeOnce.Do(func() {
		err = s.ptmx.Close()
		_ = s.cmd.Process.Signal(unix.SIGHUP)
	})
	return err
}

func (s *ptySession) Wait() (int, error) {
	s.waitOnce.Do(func() {
		err := s.cmd.Wait()
		var exitErr *exec.ExitError
		switch {
		case err == nil:
		case errors.As(err, &exitErr):
			s.exitCode = exitErr.ExitCode()
		default:
			s.exitCode = -1
			s.waitErr = err
		}
		s.log.Info("terminal process exited", "pid", s.cmd.Process.Pid, "exit_code", s.exitCode)
	})
	return s.exitCode, s.waitErr
}

const (
	prefixAttempts = 10
	prefixRetry    = 100 * time.Millisecond
)

func (l TmuxLauncher) Prefix(ctx context.Context) (string, error) {
	var lastErr error
	for attempt := 0; attempt < prefixAttempts; attempt++ {
		out, err := exec.CommandContext(ctx, "tmux", "show-options", "-gv", "prefix").Output()
		if err == nil {
			return strings.TrimSpace(string(out)), nil
		}
		lastErr = err
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(prefixRetry):
		}
	}
	return "", fmt.Errorf("read tmux prefix: %w", lastErr)
}
