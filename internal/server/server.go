package server

import (
	"log/slog"
	"net/http"

	"github.com/zion/itty/internal/terminal"
	"github.com/zion/itty/web"
)

type Server struct {
	hostname string
	launcher terminal.Launcher
	log      *slog.Logger
}

func New(hostname string, launcher terminal.Launcher, log *slog.Logger) http.Handler {
	s := &Server{hostname: hostname, launcher: launcher, log: log}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /ws", s.handleWebsocket)
	mux.Handle("GET /", http.FileServerFS(web.Files()))
	return mux
}
