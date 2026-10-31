package server

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"time"

	"github.com/gorilla/websocket"

	"github.com/zion/itty/internal/logging"
	"github.com/zion/itty/internal/terminal"
)

const (
	initialResizeTimeout = 5 * time.Second
	readChunkSize        = 32 * 1024
)

type clientMessage struct {
	Type string `json:"type"`
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

func (s *Server) originAllowed(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return false
	}
	u, err := url.Parse(origin)
	return err == nil && u.Hostname() == s.Hostname
}

func (s *Server) handleWebsocket(w http.ResponseWriter, r *http.Request) {
	connID := logging.NewID()
	log := s.Log.With("conn_id", connID, "remote", r.RemoteAddr)

	if !s.originAllowed(r) {
		log.Warn("websocket rejected", "reason", "origin not allowed", "origin", r.Header.Get("Origin"))
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if !s.Auth.RedeemTicket(r.URL.Query().Get("ticket")) {
		log.Warn("websocket rejected", "reason", "invalid ticket")
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	log.Info("ticket redeemed")

	up := websocket.Upgrader{CheckOrigin: s.originAllowed}
	conn, err := up.Upgrade(w, r, nil)
	if err != nil {
		log.Warn("websocket upgrade failed", "error", err)
		return
	}
	defer conn.Close()

	started := time.Now()
	log.Info("websocket opened")
	defer func() { log.Info("websocket closed", "duration", time.Since(started).String()) }()

	size, err := readInitialSize(conn)
	if err != nil {
		log.Warn("initial resize not received", "error", err)
		return
	}

	session, err := s.Launcher.Start(r.Context(), size)
	if err != nil {
		log.Error("terminal start failed", "error", err)
		return
	}
	defer func() {
		_ = session.Close()
		_, _ = session.Wait()
	}()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	go func() {
		defer cancel()
		pumpOutput(conn, session, log)
	}()
	go func() {
		defer cancel()
		pumpInput(conn, session, log)
	}()
	<-ctx.Done()
}

func readInitialSize(conn *websocket.Conn) (terminal.Size, error) {
	_ = conn.SetReadDeadline(time.Now().Add(initialResizeTimeout))
	defer func() { _ = conn.SetReadDeadline(time.Time{}) }()
	msgType, data, err := conn.ReadMessage()
	if err != nil {
		return terminal.Size{}, err
	}
	if msgType != websocket.TextMessage {
		return terminal.Size{}, errors.New("first message must be a resize message")
	}
	return parseResize(data)
}

func parseResize(data []byte) (terminal.Size, error) {
	var msg clientMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		return terminal.Size{}, err
	}
	if msg.Type != "resize" || msg.Cols == 0 || msg.Rows == 0 {
		return terminal.Size{}, errors.New("invalid resize message")
	}
	return terminal.Size{Cols: msg.Cols, Rows: msg.Rows}, nil
}

func pumpOutput(conn *websocket.Conn, session terminal.Session, log *slog.Logger) {
	buf := make([]byte, readChunkSize)
	for {
		n, err := session.Read(buf)
		if n > 0 {
			if werr := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); werr != nil {
				log.Debug("websocket write failed", "error", werr)
				return
			}
		}
		if err != nil {
			log.Debug("terminal read ended", "error", err)
			return
		}
	}
}

func pumpInput(conn *websocket.Conn, session terminal.Session, log *slog.Logger) {
	for {
		msgType, data, err := conn.ReadMessage()
		if err != nil {
			log.Debug("websocket read ended", "error", err)
			return
		}
		switch msgType {
		case websocket.BinaryMessage:
			if _, err := session.Write(data); err != nil {
				log.Debug("terminal write failed", "error", err)
				return
			}
		case websocket.TextMessage:
			size, err := parseResize(data)
			if err != nil {
				log.Debug("ignoring malformed control message", "error", err)
				continue
			}
			if err := session.Resize(size); err != nil {
				log.Debug("resize failed", "error", err)
			}
		}
	}
}
