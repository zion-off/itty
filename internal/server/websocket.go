package server

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"time"

	"github.com/gorilla/websocket"

	"github.com/zion-off/itty/internal/logging"
	"github.com/zion-off/itty/internal/push"
	"github.com/zion-off/itty/internal/terminal"
)

const (
	initialResizeTimeout = 5 * time.Second
	readChunkSize        = 32 * 1024
)

type clientMessage struct {
	Type         string             `json:"type"`
	Cols         uint16             `json:"cols"`
	Rows         uint16             `json:"rows"`
	Session      string             `json:"session"`
	Window       string             `json:"window"`
	Subscription *push.Subscription `json:"subscription"`
	Endpoint     string             `json:"endpoint"`
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
	ws, err := up.Upgrade(w, r, nil)
	if err != nil {
		log.Warn("websocket upgrade failed", "error", err)
		return
	}
	defer ws.Close()

	started := time.Now()
	log.Info("websocket opened")
	defer func() { log.Info("websocket closed", "duration", time.Since(started).String()) }()

	size, err := readInitialSize(ws)
	if err != nil {
		log.Warn("initial resize not received", "error", err)
		return
	}

	c := newConnection(s, ws, size, log)
	defer c.close()
	if err := c.attachInitial(r.Context()); err != nil {
		log.Error("terminal start failed", "error", err)
		return
	}
	c.readLoop(r.Context())
}

func readInitialSize(ws *websocket.Conn) (terminal.Size, error) {
	_ = ws.SetReadDeadline(time.Now().Add(initialResizeTimeout))
	defer func() { _ = ws.SetReadDeadline(time.Time{}) }()
	msgType, data, err := ws.ReadMessage()
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
