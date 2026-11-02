package main

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/zion/itty/internal/auth"
	"github.com/zion/itty/internal/certs"
	"github.com/zion/itty/internal/clock"
	"github.com/zion/itty/internal/config"
	"github.com/zion/itty/internal/lastsession"
	"github.com/zion/itty/internal/ratelimit"
	"github.com/zion/itty/internal/server"
	"github.com/zion/itty/internal/terminal"
)

const (
	shutdownTimeout   = 5 * time.Second
	maxFailedLogins   = 5
	failureWindow     = time.Minute
	readHeaderTimout  = 10 * time.Second
	expiryLogInterval = 24 * time.Hour
)

func serve(cfg config.Config, log *slog.Logger) error {
	host, _, err := net.SplitHostPort(cfg.Listen)
	if err != nil {
		return fmt.Errorf("parse listen address %q: %w", cfg.Listen, err)
	}
	if ip := net.ParseIP(host); ip == nil || !ip.IsPrivate() && !ip.IsLoopback() {
		log.Warn("listen address is not loopback or private; itty supports private networks only", "listen", cfg.Listen)
	}

	clk := clock.System{}
	wa, err := auth.NewWebAuthn(cfg.Hostname, []string{cfg.Origin()})
	if err != nil {
		return fmt.Errorf("configure webauthn: %w", err)
	}
	authService := auth.NewService(
		wa,
		auth.NewFileCredentialStore(cfg.CredentialsPath(), log),
		auth.NewMemoryOneTimeStore(clk),
		auth.NewFileEnrollmentLinks(cfg.EnrollmentPath(), clk, log),
		auth.DefaultLifetimes(),
		log,
	)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	tmux := terminal.TmuxLauncher{Log: log}
	deps := server.Deps{
		Hostname:       cfg.Hostname,
		Launcher:       tmux,
		Sessions:       tmux,
		Windows:        tmux,
		LastSession:    lastsession.NewFileStore(cfg.LastSessionPath()),
		DefaultSession: cfg.TmuxSession,
		Auth:           authService,
		Limiter:        ratelimit.NewFailureLimiter(clk, maxFailedLogins, failureWindow),
		Log:            log,
	}
	srv := &http.Server{
		Addr:              cfg.Listen,
		ReadHeaderTimeout: readHeaderTimout,
		ErrorLog:          slog.NewLogLogger(log.Handler(), slog.LevelWarn),
	}

	if cfg.TLSEnabled() {
		source, err := certs.NewFileSource(cfg.TLSCertFile, cfg.TLSKeyFile, cfg.Hostname, clk, log)
		if err != nil {
			return fmt.Errorf("load certificate: %w", err)
		}
		deps.Certs = source
		srv.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12, GetCertificate: source.GetCertificate}
		go logCertificateExpiry(ctx, source, log)
	}
	srv.Handler = server.New(deps)

	errCh := make(chan error, 1)
	go func() {
		log.Info("server listening", "listen", cfg.Listen, "hostname", cfg.Hostname, "origin", cfg.Origin(), "tmux_session", cfg.TmuxSession, "tls", cfg.TLSEnabled())
		if cfg.TLSEnabled() {
			errCh <- srv.ListenAndServeTLS("", "")
			return
		}
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

func logCertificateExpiry(ctx context.Context, source server.CertStatus, log *slog.Logger) {
	ticker := time.NewTicker(expiryLogInterval)
	defer ticker.Stop()
	for {
		days, err := source.DaysRemaining()
		if err != nil {
			log.Error("certificate expiry check failed", "error", err)
		} else {
			log.Info("certificate expiry", "days_remaining", days)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}
