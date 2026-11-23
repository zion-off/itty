package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"sync"

	"github.com/gorilla/websocket"

	"github.com/zion-off/itty/internal/terminal"
)

type activeSession struct {
	name string
	term terminal.Session
}

type connection struct {
	srv *Server
	ws  *websocket.Conn
	log *slog.Logger

	mu     sync.Mutex
	size   terminal.Size
	active *activeSession
	closed bool
}

func newConnection(s *Server, ws *websocket.Conn, size terminal.Size, log *slog.Logger) *connection {
	return &connection{srv: s, ws: ws, size: size, log: log}
}

func (c *connection) attachInitial(ctx context.Context) error {
	names := c.listSessions(ctx)
	name, reason := c.srv.DefaultSession, "default"
	if last, err := c.srv.LastSession.Load(); err != nil {
		c.log.Warn("last session unreadable; using the default", "error", err)
	} else if last != "" && slices.Contains(names, last) {
		name, reason = last, "last used"
	}
	return c.attach(ctx, name, reason)
}

func (c *connection) attach(ctx context.Context, name, reason string) error {
	term, err := c.srv.Launcher.Start(ctx, name, c.currentSize())
	if err != nil {
		return err
	}
	next := &activeSession{name: name, term: term}

	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		closeTerminal(term)
		return nil
	}
	previous := c.active
	c.active = next
	err = c.writeSessionsLocked(ctx, name)
	c.mu.Unlock()
	if err != nil {
		c.log.Warn("sending session list failed", "error", err)
	}

	if saveErr := c.srv.LastSession.Save(name); saveErr != nil {
		c.log.Warn("remembering the last session failed", "session", name, "error", saveErr)
	}
	if previous != nil {
		c.log.Info("session switched", "from", previous.name, "to", name)
		go closeTerminal(previous.term)
	} else {
		c.log.Info("session attached", "session", name, "reason", reason)
	}
	go c.pump(next)
	return nil
}

func (c *connection) readLoop(ctx context.Context) {
	for {
		msgType, data, err := c.ws.ReadMessage()
		if err != nil {
			c.log.Debug("websocket read ended", "error", err)
			return
		}
		switch msgType {
		case websocket.BinaryMessage:
			c.input(data)
		case websocket.TextMessage:
			c.control(ctx, data)
		}
	}
}

func (c *connection) control(ctx context.Context, data []byte) {
	var msg clientMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		c.log.Debug("ignoring malformed control message", "error", err)
		return
	}
	switch msg.Type {
	case "resize":
		if msg.Cols == 0 || msg.Rows == 0 {
			c.log.Debug("ignoring invalid resize message")
			return
		}
		c.resize(terminal.Size{Cols: msg.Cols, Rows: msg.Rows})
	case "list":
		c.mu.Lock()
		err := c.writeSessionsLocked(ctx, c.active.name)
		c.mu.Unlock()
		if err != nil {
			c.log.Warn("sending session list failed", "error", err)
		}
	case "switch":
		c.switchTo(ctx, msg.Session)
	case "windows":
		c.sendWindows(ctx, msg.Session)
	case "select":
		c.selectWindow(ctx, msg.Session, msg.Window)
	case "new_window":
		c.newWindow(ctx, msg.Session)
	case "close_window":
		c.closeWindow(ctx, msg.Session, msg.Window)
	case "push_key":
		c.sendPushKey()
	case "push_subscribe":
		c.subscribePush(msg.Subscription)
	case "push_unsubscribe":
		c.unsubscribePush(msg.Endpoint)
	default:
		c.log.Debug("ignoring unknown control message", "type", msg.Type)
	}
}

func (c *connection) switchTo(ctx context.Context, name string) {
	if name == c.activeName() {
		c.sendSessions(ctx)
		return
	}
	if !c.sessionKnown(ctx, name) {
		c.log.Warn("session switch rejected", "reason", "unknown session", "requested", name)
		c.sendError("unknown session")
		return
	}
	if err := c.attach(ctx, name, "switch"); err != nil {
		c.log.Error("session switch failed", "to", name, "error", err)
		c.sendError("could not switch session")
	}
}

func (c *connection) sessionKnown(ctx context.Context, name string) bool {
	return name == c.srv.DefaultSession || name == c.activeName() || slices.Contains(c.listSessions(ctx), name)
}

func (c *connection) sendWindows(ctx context.Context, session string) {
	if !c.sessionKnown(ctx, session) {
		c.log.Warn("window list rejected", "reason", "unknown session", "requested", session)
		c.sendError("unknown session")
		return
	}
	windows, err := c.srv.Windows.Windows(ctx, session)
	if err != nil {
		c.log.Warn("listing tmux windows failed", "session", session, "error", err)
		c.sendError("could not list windows")
		return
	}
	if windows == nil {
		windows = []terminal.Window{}
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := c.writeJSONLocked(map[string]any{"type": "windows", "session": session, "windows": windows}); err != nil {
		c.log.Warn("sending window list failed", "error", err)
	}
}

func (c *connection) selectWindow(ctx context.Context, session, windowID string) {
	if !c.sessionKnown(ctx, session) {
		c.log.Warn("window selection rejected", "reason", "unknown session", "requested", session)
		c.sendError("unknown session")
		return
	}
	if err := c.srv.Windows.SelectWindow(ctx, session, windowID); err != nil {
		c.log.Warn("window selection failed", "session", session, "window", windowID, "error", err)
		c.sendError("could not select window")
		return
	}
	if session == c.activeName() {
		c.sendWindows(ctx, session)
		return
	}
	c.switchTo(ctx, session)
}

func (c *connection) newWindow(ctx context.Context, session string) {
	if !c.sessionKnown(ctx, session) {
		c.log.Warn("window creation rejected", "reason", "unknown session", "requested", session)
		c.sendError("unknown session")
		return
	}
	if err := c.srv.Windows.NewWindow(ctx, session); err != nil {
		c.log.Warn("window creation failed", "session", session, "error", err)
		c.sendError("could not create window")
		return
	}
	if session == c.activeName() {
		c.sendWindows(ctx, session)
		return
	}
	c.switchTo(ctx, session)
}

func (c *connection) closeWindow(ctx context.Context, session, windowID string) {
	if !c.sessionKnown(ctx, session) {
		c.log.Warn("window close rejected", "reason", "unknown session", "requested", session)
		c.sendError("unknown session")
		return
	}
	err := c.srv.Windows.CloseWindow(ctx, session, windowID)
	switch {
	case errors.Is(err, terminal.ErrLastWindow):
		c.log.Warn("window close rejected", "reason", "last window", "session", session, "window", windowID)
		c.sendError("cannot close the last window")
	case err != nil:
		c.log.Warn("window close failed", "session", session, "window", windowID, "error", err)
		c.sendError("could not close window")
	default:
		c.sendWindows(ctx, session)
	}
}

func (c *connection) input(data []byte) {
	a := c.current()
	if a == nil {
		return
	}
	if _, err := a.term.Write(data); err != nil {
		c.log.Debug("terminal write failed", "error", err)
	}
}

func (c *connection) resize(size terminal.Size) {
	c.mu.Lock()
	c.size = size
	a := c.active
	c.mu.Unlock()
	if a == nil {
		return
	}
	if err := a.term.Resize(size); err != nil {
		c.log.Debug("resize failed", "error", err)
	}
}

func (c *connection) pump(a *activeSession) {
	buf := make([]byte, readChunkSize)
	for {
		n, err := a.term.Read(buf)
		if n > 0 && !c.forward(a, buf[:n]) {
			return
		}
		if err != nil {
			c.log.Debug("terminal read ended", "session", a.name, "error", err)
			c.terminalEnded(a)
			return
		}
	}
}

func (c *connection) forward(a *activeSession, data []byte) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.active != a {
		return false
	}
	if err := c.ws.WriteMessage(websocket.BinaryMessage, data); err != nil {
		c.log.Debug("websocket write failed", "error", err)
		return false
	}
	return true
}

func (c *connection) terminalEnded(a *activeSession) {
	if c.current() != a {
		return
	}
	c.log.Info("terminal session ended", "session", a.name)
	_ = c.ws.Close()
}

func (c *connection) close() {
	c.mu.Lock()
	c.closed = true
	a := c.active
	c.active = nil
	c.mu.Unlock()
	if a != nil {
		closeTerminal(a.term)
	}
}

func (c *connection) current() *activeSession {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.active
}

func (c *connection) activeName() string {
	if a := c.current(); a != nil {
		return a.name
	}
	return ""
}

func (c *connection) currentSize() terminal.Size {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.size
}

func (c *connection) listSessions(ctx context.Context) []string {
	names, err := c.srv.Sessions.List(ctx)
	if err != nil {
		c.log.Warn("listing tmux sessions failed", "error", err)
		return nil
	}
	return names
}

func (c *connection) sendSessions(ctx context.Context) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.active == nil {
		return
	}
	if err := c.writeSessionsLocked(ctx, c.active.name); err != nil {
		c.log.Warn("sending session list failed", "error", err)
	}
}

func (c *connection) writeSessionsLocked(ctx context.Context, current string) error {
	names := c.listSessions(ctx)
	if !slices.Contains(names, current) {
		names = append(names, current)
		slices.Sort(names)
	}
	return c.writeJSONLocked(map[string]any{"type": "sessions", "current": current, "sessions": names})
}

func (c *connection) sendError(message string) {
	c.writeControl(map[string]string{"type": "error", "message": message})
}

func (c *connection) writeJSONLocked(v any) error {
	raw, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("encode message: %w", err)
	}
	return c.ws.WriteMessage(websocket.TextMessage, raw)
}

func closeTerminal(t terminal.Session) {
	_ = t.Close()
	_, _ = t.Wait()
}
