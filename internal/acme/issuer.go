package acme

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/go-acme/lego/v4/certcrypto"
	"github.com/go-acme/lego/v4/certificate"
	"github.com/go-acme/lego/v4/challenge/dns01"
	"github.com/go-acme/lego/v4/lego"
	"github.com/go-acme/lego/v4/registration"

	"github.com/zion/itty/internal/dns"
)

var ErrTermsNotAccepted = errors.New("no ACME account exists yet; pass -accept-tos to accept the certificate authority's terms of service")

type Bundle struct {
	CertPEM []byte
	KeyPEM  []byte
}

type Issuer interface {
	Issue(ctx context.Context, hostname string, provider dns.Provider) (Bundle, error)
}

type LegoIssuer struct {
	Email           string
	Directory       string
	Accounts        AccountStore
	PropagationWait time.Duration
	AcceptTOS       bool
	Log             *slog.Logger
}

func (i LegoIssuer) Issue(ctx context.Context, hostname string, provider dns.Provider) (Bundle, error) {
	account, err := i.Accounts.Load()
	if err != nil {
		return Bundle{}, fmt.Errorf("load account: %w", err)
	}
	needsRegistration := account == nil
	if needsRegistration {
		if !i.AcceptTOS {
			return Bundle{}, ErrTermsNotAccepted
		}
		key, err := newAccountKey()
		if err != nil {
			return Bundle{}, fmt.Errorf("generate account key: %w", err)
		}
		account = &Account{Email: i.Email, Key: key}
	}

	cfg := lego.NewConfig(account)
	cfg.CADirURL = i.Directory
	cfg.Certificate.KeyType = certcrypto.EC256
	i.Log.Info("connecting to the certificate authority", "directory", i.Directory)
	client, err := lego.NewClient(cfg)
	if err != nil {
		return Bundle{}, fmt.Errorf("connect to the certificate authority: %w", err)
	}

	if needsRegistration {
		reg, err := client.Registration.Register(registration.RegisterOptions{TermsOfServiceAgreed: true})
		if err != nil {
			return Bundle{}, fmt.Errorf("register account: %w", err)
		}
		account.Registration = reg
		if err := i.Accounts.Save(account); err != nil {
			return Bundle{}, fmt.Errorf("save account: %w", err)
		}
		i.Log.Info("account registered", "email", i.Email)
	}

	err = client.Challenge.SetDNS01Provider(
		challengeProvider{ctx: ctx, dns: provider},
		dns01.CondOption(i.PropagationWait > 0, dns01.PropagationWait(i.PropagationWait, true)),
	)
	if err != nil {
		return Bundle{}, fmt.Errorf("configure the DNS challenge: %w", err)
	}

	i.Log.Info("requesting certificate", "hostname", hostname)
	res, err := client.Certificate.Obtain(certificate.ObtainRequest{Domains: []string{hostname}, Bundle: true})
	if err != nil {
		return Bundle{}, fmt.Errorf("obtain certificate: %w", err)
	}
	i.Log.Info("certificate issued", "hostname", hostname, "certificate_url", res.CertStableURL)
	return Bundle{CertPEM: res.Certificate, KeyPEM: res.PrivateKey}, nil
}
