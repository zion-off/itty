package acme

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"errors"
	"io"
	"log/slog"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/zion-off/itty/internal/clock"
	"github.com/zion-off/itty/internal/dns"
)

const host = "itty.example.com"

func selfSigned(t *testing.T, name string, notAfter time.Time) Bundle {
	t.Helper()
	priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(time.Now().UnixNano()),
		Subject:      pkix.Name{CommonName: name},
		DNSNames:     []string{name},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     notAfter,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &priv.PublicKey, priv)
	if err != nil {
		t.Fatal(err)
	}
	keyDER, _ := x509.MarshalECPrivateKey(priv)
	return Bundle{
		CertPEM: pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}),
		KeyPEM:  pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER}),
	}
}

type fakeIssuer struct {
	bundle Bundle
	err    error
	calls  int
	gotDNS dns.Provider
}

func (f *fakeIssuer) Issue(_ context.Context, _ string, p dns.Provider) (Bundle, error) {
	f.calls++
	f.gotDNS = p
	return f.bundle, f.err
}

type renewerFixture struct {
	renewer Renewer
	issuer  *fakeIssuer
	cert    string
	key     string
}

func newRenewer(t *testing.T, issued Bundle) renewerFixture {
	t.Helper()
	dir := t.TempDir()
	issuer := &fakeIssuer{bundle: issued}
	cert, key := filepath.Join(dir, "c.pem"), filepath.Join(dir, "k.pem")
	return renewerFixture{
		issuer: issuer, cert: cert, key: key,
		renewer: Renewer{
			Hostname: host, CertFile: cert, KeyFile: key,
			RenewBefore: 30 * 24 * time.Hour,
			Issuer:      issuer, DNS: &recordingDNS{},
			Clock: clock.System{},
			Log:   slog.New(slog.NewTextHandler(io.Discard, nil)),
		},
	}
}

func install(t *testing.T, f renewerFixture, b Bundle) {
	t.Helper()
	_ = os.WriteFile(f.cert, b.CertPEM, 0o600)
	_ = os.WriteFile(f.key, b.KeyPEM, 0o600)
}

func TestRenewSkipsWhenNotDue(t *testing.T) {
	fresh := selfSigned(t, host, time.Now().Add(80*24*time.Hour))
	f := newRenewer(t, selfSigned(t, host, time.Now().Add(90*24*time.Hour)))
	install(t, f, fresh)

	res, err := f.renewer.Renew(context.Background(), false)
	if err != nil || res.Renewed || f.issuer.calls != 0 {
		t.Fatalf("res=%+v err=%v calls=%d", res, err, f.issuer.calls)
	}
}

func TestRenewIssuesWhenDueAndInstallsPrivateFiles(t *testing.T) {
	old := selfSigned(t, host, time.Now().Add(5*24*time.Hour))
	issued := selfSigned(t, host, time.Now().Add(90*24*time.Hour))
	f := newRenewer(t, issued)
	install(t, f, old)

	res, err := f.renewer.Renew(context.Background(), false)
	if err != nil || !res.Renewed {
		t.Fatalf("res=%+v err=%v", res, err)
	}
	if f.issuer.gotDNS == nil {
		t.Fatal("the DNS provider was not handed to the issuer")
	}
	gotCert, _ := os.ReadFile(f.cert)
	gotKey, _ := os.ReadFile(f.key)
	if string(gotCert) != string(issued.CertPEM) || string(gotKey) != string(issued.KeyPEM) {
		t.Fatal("issued files were not installed")
	}
	for _, p := range []string{f.cert, f.key} {
		if info, _ := os.Stat(p); info.Mode().Perm() != 0o600 {
			t.Fatalf("%s mode = %v", p, info.Mode().Perm())
		}
	}
}

func TestRenewIssuesWhenNoCertificateExists(t *testing.T) {
	f := newRenewer(t, selfSigned(t, host, time.Now().Add(90*24*time.Hour)))
	if res, err := f.renewer.Renew(context.Background(), false); err != nil || !res.Renewed {
		t.Fatalf("res=%+v err=%v", res, err)
	}
}

func TestForceRenewsEvenWhenNotDue(t *testing.T) {
	f := newRenewer(t, selfSigned(t, host, time.Now().Add(90*24*time.Hour)))
	install(t, f, selfSigned(t, host, time.Now().Add(80*24*time.Hour)))
	if res, err := f.renewer.Renew(context.Background(), true); err != nil || !res.Renewed {
		t.Fatalf("res=%+v err=%v", res, err)
	}
}

func TestIssuerFailureLeavesExistingFilesUntouched(t *testing.T) {
	old := selfSigned(t, host, time.Now().Add(5*24*time.Hour))
	f := newRenewer(t, Bundle{})
	f.issuer.err = errors.New("dns validation failed")
	install(t, f, old)

	if _, err := f.renewer.Renew(context.Background(), false); err == nil {
		t.Fatal("expected error")
	}
	if got, _ := os.ReadFile(f.cert); string(got) != string(old.CertPEM) {
		t.Fatal("certificate was modified after a failure")
	}
}

func TestRejectsCertificateForAnotherHostOrMismatchedKey(t *testing.T) {
	old := selfSigned(t, host, time.Now().Add(5*24*time.Hour))

	wrongHost := selfSigned(t, "other.example.com", time.Now().Add(90*24*time.Hour))
	mismatched := Bundle{
		CertPEM: selfSigned(t, host, time.Now().Add(90*24*time.Hour)).CertPEM,
		KeyPEM:  selfSigned(t, host, time.Now().Add(90*24*time.Hour)).KeyPEM,
	}
	for name, bundle := range map[string]Bundle{"wrong host": wrongHost, "mismatched key": mismatched} {
		t.Run(name, func(t *testing.T) {
			f := newRenewer(t, bundle)
			install(t, f, old)
			if _, err := f.renewer.Renew(context.Background(), false); err == nil {
				t.Fatal("expected the issued bundle to be rejected")
			}
			if got, _ := os.ReadFile(f.cert); string(got) != string(old.CertPEM) {
				t.Fatal("existing certificate was replaced by a rejected bundle")
			}
		})
	}
}
