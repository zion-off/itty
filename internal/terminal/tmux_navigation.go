package terminal

import (
	"context"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

const windowFieldSeparator = "|||"

func (l TmuxLauncher) Windows(ctx context.Context, session string) ([]Window, error) {
	format := strings.Join([]string{"#{window_id}", "#{window_index}", "#{window_active}", "#{window_name}"}, windowFieldSeparator)
	out, err := exec.CommandContext(ctx, "tmux", "list-windows", "-t", "="+session, "-F", format).Output()
	if err != nil {
		return nil, fmt.Errorf("list windows of tmux session %q: %w", session, err)
	}
	return parseWindows(string(out)), nil
}

func parseWindows(out string) []Window {
	var windows []Window
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		fields := strings.SplitN(line, windowFieldSeparator, 4)
		if len(fields) != 4 {
			continue
		}
		index, err := strconv.Atoi(fields[1])
		if err != nil {
			continue
		}
		windows = append(windows, Window{ID: fields[0], Index: index, Active: fields[2] == "1", Name: fields[3]})
	}
	return windows
}

func (l TmuxLauncher) knownWindow(ctx context.Context, session, windowID string) ([]Window, error) {
	windows, err := l.Windows(ctx, session)
	if err != nil {
		return nil, err
	}
	for _, w := range windows {
		if w.ID == windowID {
			return windows, nil
		}
	}
	return nil, ErrUnknownWindow
}

func (l TmuxLauncher) SelectWindow(ctx context.Context, session, windowID string) error {
	if _, err := l.knownWindow(ctx, session, windowID); err != nil {
		return err
	}
	if out, err := exec.CommandContext(ctx, "tmux", "select-window", "-t", windowID).CombinedOutput(); err != nil {
		return fmt.Errorf("select tmux window %q: %w: %s", windowID, err, strings.TrimSpace(string(out)))
	}
	l.Log.InfoContext(ctx, "tmux window selected", "session", session, "window", windowID)
	return nil
}

func (l TmuxLauncher) NewWindow(ctx context.Context, session string) error {
	if out, err := exec.CommandContext(ctx, "tmux", "new-window", "-t", "="+session+":").CombinedOutput(); err != nil {
		return fmt.Errorf("create window in tmux session %q: %w: %s", session, err, strings.TrimSpace(string(out)))
	}
	l.Log.InfoContext(ctx, "tmux window created", "session", session)
	return nil
}

func (l TmuxLauncher) CloseWindow(ctx context.Context, session, windowID string) error {
	windows, err := l.knownWindow(ctx, session, windowID)
	if err != nil {
		return err
	}
	if len(windows) < 2 {
		return ErrLastWindow
	}
	if out, err := exec.CommandContext(ctx, "tmux", "kill-window", "-t", windowID).CombinedOutput(); err != nil {
		return fmt.Errorf("close tmux window %q: %w: %s", windowID, err, strings.TrimSpace(string(out)))
	}
	l.Log.InfoContext(ctx, "tmux window closed", "session", session, "window", windowID)
	return nil
}
