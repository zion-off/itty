package acme

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/zion/itty/internal/clock"
	"github.com/zion/itty/internal/dns"
	"github.com/zion/itty/internal/fsutil"
)

type Renewer struct {
	Hostname    string
	CertFile    string
	KeyFile     string
	RenewBefore time.Duration
	Issuer      Issuer
	DNS         dns.Provider
	Clock       clock.Clock
	Log         *slog.Logger
}

type Result struct {
	Renewed  bool
	NotAfter time.Time
}

func (r Renewer) Renew(ctx context.Context, force bool) (Result, error) {
	current, err := r.currentExpiry()
	switch {
	case err == nil && !force && current.Sub(r.Clock.Now()) > r.RenewBefore:
		r.Log.Info("certificate renewal not due", "not_after", current, "renew_before", r.RenewBefore.String())
		return Result{NotAfter: current}, nil
	case err != nil && !errors.Is(err, os.ErrNotExist):
		r.Log.Warn("existing certificate unreadable; requesting a new one", "error", err)
	}

	r.Log.Info("certificate renewal started", "hostname", r.Hostname, "forced", force)
	bundle, err := r.Issuer.Issue(ctx, r.Hostname, r.DNS)
	if err != nil {
		r.Log.Error("certificate renewal failed", "error", err)
		return Result{}, err
	}
	notAfter, err := r.validate(bundle)
	if err != nil {
		r.Log.Error("issued certificate rejected", "error", err)
		return Result{}, err
	}
	if err := r.install(bundle); err != nil {
		r.Log.Error("certificate install failed", "error", err)
		return Result{}, err
	}
	r.Log.Info("certificate installed", "cert_file", r.CertFile, "key_file", r.KeyFile, "not_after", notAfter)
	return Result{Renewed: true, NotAfter: notAfter}, nil
}

func (r Renewer) currentExpiry() (time.Time, error) {
	raw, err := os.ReadFile(r.CertFile)
	if err != nil {
		return time.Time{}, err
	}
	block, _ := pem.Decode(raw)
	if block == nil {
		return time.Time{}, errors.New("certificate file is not valid PEM")
	}
	leaf, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return time.Time{}, err
	}
	return leaf.NotAfter, nil
}

func (r Renewer) validate(b Bundle) (time.Time, error) {
	pair, err := tls.X509KeyPair(b.CertPEM, b.KeyPEM)
	if err != nil {
		return time.Time{}, fmt.Errorf("issued certificate and key do not match: %w", err)
	}
	leaf, err := x509.ParseCertificate(pair.Certificate[0])
	if err != nil {
		return time.Time{}, err
	}
	if err := leaf.VerifyHostname(r.Hostname); err != nil {
		return time.Time{}, fmt.Errorf("issued certificate does not cover %s: %w", r.Hostname, err)
	}
	return leaf.NotAfter, nil
}

func (r Renewer) install(b Bundle) error {
	if err := fsutil.WriteFileAtomic(r.KeyFile, b.KeyPEM, 0o600); err != nil {
		return fmt.Errorf("write key: %w", err)
	}
	if err := fsutil.WriteFileAtomic(r.CertFile, b.CertPEM, 0o600); err != nil {
		return fmt.Errorf("write certificate: %w", err)
	}
	return nil
}
