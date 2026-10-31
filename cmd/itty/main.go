package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/zion/itty/internal/config"
	"github.com/zion/itty/internal/logging"
	"github.com/zion/itty/internal/server"
	"github.com/zion/itty/internal/terminal"
)

const shutdownTimeout = 5 * time.Second

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "itty:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	fs := flag.NewFlagSet("itty", flag.ContinueOnError)
	configPath := fs.String("config", "itty.toml", "path to the configuration file")
	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg, err := config.Load(*configPath)
	if err != nil {
		return err
	}
	log, closeLog, err := logging.New(cfg.LogFile)
	if err != nil {
		return err
	}
	defer closeLog()

	return serve(cfg, log)
}

func serve(cfg config.Config, log *slog.Logger) error {
	host, _, err := net.SplitHostPort(cfg.Listen)
	if err != nil {
		return fmt.Errorf("parse listen address %q: %w", cfg.Listen, err)
	}
	if ip := net.ParseIP(host); ip == nil || !ip.IsLoopback() {
		return fmt.Errorf("listen address %q is not loopback; login is not implemented yet", cfg.Listen)
	}

	launcher := terminal.TmuxLauncher{Session: cfg.TmuxSession, Log: log}
	srv := &http.Server{
		Addr:              cfg.Listen,
		Handler:           server.New(cfg.Hostname, launcher, log),
		ReadHeaderTimeout: 10 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	errCh := make(chan error, 1)
	go func() {
		log.Info("server listening", "listen", cfg.Listen, "hostname", cfg.Hostname, "tmux_session", cfg.TmuxSession)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		log.Error("server failed", "error", err)
		return err
	case <-ctx.Done():
		log.Info("shutdown requested")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	}
}
