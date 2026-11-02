package main

import (
	"io"
	"log/slog"
	"strings"
	"testing"

	"github.com/zion/itty/internal/config"
	"github.com/zion/itty/internal/dns"
)

func discardLog() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func TestRenewCertValidatesConfiguration(t *testing.T) {
	base := config.Default()
	base.Hostname = "itty.example.com"
	base.TLSCertFile, base.TLSKeyFile = "c.pem", "k.pem"
	base.ACMEEmail = "ops@example.com"

	cases := []struct {
		name    string
		mutate  func(*config.Config)
		wantErr string
	}{
		{"no tls files", func(c *config.Config) { c.TLSCertFile, c.TLSKeyFile = "", "" }, "tls_cert_file"},
		{"no email", func(c *config.Config) { c.ACMEEmail = "" }, "acme_email"},
		{"unknown provider", func(c *config.Config) { c.DNSProvider = "nope" }, "unknown dns_provider"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			cfg := base
			c.mutate(&cfg)
			err := renewCert(cfg, discardLog(), false, false)
			if err == nil || !strings.Contains(err.Error(), c.wantErr) {
				t.Fatalf("err = %v, want it to mention %q", err, c.wantErr)
			}
		})
	}
}

func TestEveryRegisteredProviderBuilds(t *testing.T) {
	for name, factory := range dnsProviders {
		provider, err := factory(dns.Env{In: strings.NewReader(""), Out: io.Discard, Log: discardLog()})
		if err != nil || provider == nil {
			t.Errorf("provider %q: %v", name, err)
		}
	}
}
