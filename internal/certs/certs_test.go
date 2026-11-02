package certs

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"io"
	"log/slog"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/zion/itty/internal/clock"
)

func writePair(t *testing.T, dir string, notAfter time.Time, serial int64) (string, string) {
	t.Helper()
	priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(serial),
		Subject:      pkix.Name{CommonName: "itty.example.com"},
		DNSNames:     []string{"itty.example.com"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     notAfter,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &priv.PublicKey, priv)
	if err != nil {
		t.Fatal(err)
	}
	keyDER, _ := x509.MarshalECPrivateKey(priv)
	certPath, keyPath := filepath.Join(dir, "cert.pem"), filepath.Join(dir, "key.pem")
	if err := os.WriteFile(certPath, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(keyPath, pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER}), 0o600); err != nil {
		t.Fatal(err)
	}
	return certPath, keyPath
}

func discard() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func TestReloadsChangedFilesWithoutRestart(t *testing.T) {
	dir := t.TempDir()
	certPath, keyPath := writePair(t, dir, time.Now().Add(48*time.Hour), 1)
	s, err := NewFileSource(certPath, keyPath, "itty.example.com", clock.System{}, discard())
	if err != nil {
		t.Fatal(err)
	}
	hello := &tls.ClientHelloInfo{ServerName: "itty.example.com"}
	first, _ := s.GetCertificate(hello)

	writePair(t, dir, time.Now().Add(90*24*time.Hour), 2)
	future := time.Now().Add(time.Minute)
	_ = os.Chtimes(certPath, future, future)
	_ = os.Chtimes(keyPath, future, future)

	second, _ := s.GetCertificate(hello)
	if first.Leaf.SerialNumber.Cmp(second.Leaf.SerialNumber) == 0 {
		t.Fatal("certificate was not reloaded")
	}
	if days, _ := s.DaysRemaining(); days < 89 {
		t.Fatalf("days remaining = %d", days)
	}
}

func TestRejectsUnexpectedServerName(t *testing.T) {
	certPath, keyPath := writePair(t, t.TempDir(), time.Now().Add(time.Hour), 1)
	s, _ := NewFileSource(certPath, keyPath, "itty.example.com", clock.System{}, discard())
	if _, err := s.GetCertificate(&tls.ClientHelloInfo{ServerName: "203.0.113.5"}); err == nil {
		t.Fatal("expected rejection")
	}
	if _, err := s.GetCertificate(&tls.ClientHelloInfo{ServerName: ""}); err == nil {
		t.Fatal("expected rejection for missing SNI")
	}
}

func TestKeepsPreviousCertificateWhenReloadFails(t *testing.T) {
	dir := t.TempDir()
	certPath, keyPath := writePair(t, dir, time.Now().Add(time.Hour), 1)
	s, _ := NewFileSource(certPath, keyPath, "itty.example.com", clock.System{}, discard())
	_ = os.WriteFile(certPath, []byte("garbage"), 0o600)
	future := time.Now().Add(time.Minute)
	_ = os.Chtimes(certPath, future, future)
	cert, err := s.GetCertificate(&tls.ClientHelloInfo{ServerName: "itty.example.com"})
	if err != nil || cert == nil {
		t.Fatalf("expected the previous certificate, got %v %v", cert, err)
	}
}

func TestFailsFastOnMissingFiles(t *testing.T) {
	if _, err := NewFileSource("/nope/c", "/nope/k", "h", clock.System{}, discard()); err == nil {
		t.Fatal("expected error")
	}
}

func TestFailedReloadIsNotRetriedUntilFilesChangeAgain(t *testing.T) {
	dir := t.TempDir()
	certPath, keyPath := writePair(t, dir, time.Now().Add(time.Hour), 1)
	s, _ := NewFileSource(certPath, keyPath, "itty.example.com", clock.System{}, discard())
	hello := &tls.ClientHelloInfo{ServerName: "itty.example.com"}

	_ = os.WriteFile(certPath, []byte("garbage"), 0o600)
	t1 := time.Now().Add(time.Minute)
	_ = os.Chtimes(certPath, t1, t1)
	_, _ = s.GetCertificate(hello)
	if s.changed() {
		t.Fatal("the failed reload should not be retried while the files are unchanged")
	}

	writePair(t, dir, time.Now().Add(90*24*time.Hour), 2)
	t2 := time.Now().Add(2 * time.Minute)
	_ = os.Chtimes(certPath, t2, t2)
	_ = os.Chtimes(keyPath, t2, t2)
	cert, _ := s.GetCertificate(hello)
	if cert.Leaf.SerialNumber.Int64() != 2 {
		t.Fatal("the repaired files were not loaded")
	}
}
