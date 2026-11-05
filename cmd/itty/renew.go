package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	legolog "github.com/go-acme/lego/v4/log"
	"github.com/spf13/cobra"

	"github.com/zion/itty/internal/acme"
	"github.com/zion/itty/internal/clock"
	"github.com/zion/itty/internal/config"
	"github.com/zion/itty/internal/dns"
	"github.com/zion/itty/internal/dns/manual"
)

const renewBefore = 30 * 24 * time.Hour

var dnsProviders = map[string]dns.Factory{
	"manual": manual.New,
}

func newRenewCertCommand() *cobra.Command {
	var force, acceptTOS bool

	cmd := &cobra.Command{
		Use:   "renew-cert",
		Short: "Get or renew the TLS certificate with a Let's Encrypt DNS-01 challenge",
		Args:  usageArgs(cobra.NoArgs),
	}
	configPath := addConfigFlag(cmd.Flags())
	cmd.Flags().BoolVarP(&force, "force", "f", false, "request a new certificate even if the current one is not close to expiry")
	cmd.Flags().BoolVar(&acceptTOS, "accept-tos", false, "accept the certificate authority's terms of service when creating the ACME account")
	cmd.RunE = func(*cobra.Command, []string) error {
		return runWithConfig(configPath(), func(cfg config.Config, log *slog.Logger) error {
			return renewCert(cfg, log, force, acceptTOS)
		})
	}
	return cmd
}

func renewCert(cfg config.Config, log *slog.Logger, force, acceptTOS bool) error {
	if !cfg.TLSEnabled() {
		return errors.New("tls_cert_file and tls_key_file must be set before a certificate can be renewed")
	}
	if cfg.ACMEEmail == "" {
		return errors.New("acme_email must be set in the config file")
	}
	factory, ok := dnsProviders[cfg.DNSProvider]
	if !ok {
		return fmt.Errorf("unknown dns_provider %q", cfg.DNSProvider)
	}
	provider, err := factory(dns.Env{In: os.Stdin, Out: os.Stdout, Log: log})
	if err != nil {
		return fmt.Errorf("configure dns provider %q: %w", cfg.DNSProvider, err)
	}

	legolog.Logger = slog.NewLogLogger(log.Handler(), slog.LevelInfo)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	renewer := acme.Renewer{
		Hostname:    cfg.Hostname,
		CertFile:    cfg.TLSCertFile,
		KeyFile:     cfg.TLSKeyFile,
		RenewBefore: renewBefore,
		DNS:         provider,
		Clock:       clock.System{},
		Log:         log,
		Issuer: acme.LegoIssuer{
			Email:           cfg.ACMEEmail,
			Directory:       cfg.ACMEDirectory,
			Accounts:        acme.NewFileAccountStore(cfg.ACMEDir()),
			PropagationWait: time.Duration(cfg.ACMEPropagationSeconds) * time.Second,
			AcceptTOS:       acceptTOS,
			Log:             log,
		},
	}

	result, err := renewer.Renew(ctx, force)
	if err != nil {
		return err
	}
	if !result.Renewed {
		fmt.Printf("Certificate is valid until %s and is not due for renewal. Use --force to renew anyway.\n", result.NotAfter.Format(time.DateOnly))
		return nil
	}
	fmt.Printf("\nCertificate installed and valid until %s. A running server loads it without a restart.\n", result.NotAfter.Format(time.DateOnly))
	return nil
}
