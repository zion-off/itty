package setup

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/zion-off/itty/internal/clock"
	"github.com/zion-off/itty/internal/config"
)

func writeCert(t *testing.T, dir, host string, notAfter time.Time) (string, string) {
	t.Helper()
	priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: host},
		DNSNames:     []string{host},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     notAfter,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &priv.PublicKey, priv)
	if err != nil {
		t.Fatal(err)
	}
	keyDER, _ := x509.MarshalECPrivateKey(priv)
	cert, key := filepath.Join(dir, "c.pem"), filepath.Join(dir, "k.pem")
	_ = os.WriteFile(cert, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), 0o600)
	_ = os.WriteFile(key, pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER}), 0o600)
	return cert, key
}

func checkerFor(cfg config.Config) Checker {
	return Checker{Config: cfg, Clock: clock.System{}}
}

func TestCertificateChecks(t *testing.T) {
	dir := t.TempDir()
	cases := []struct {
		name     string
		host     string
		notAfter time.Time
		want     Status
	}{
		{"valid", "itty.example.com", time.Now().Add(60 * 24 * time.Hour), OK},
		{"expiring", "itty.example.com", time.Now().Add(5 * 24 * time.Hour), Warn},
		{"expired", "itty.example.com", time.Now().Add(-time.Hour), Fail},
		{"wrong host", "other.example.com", time.Now().Add(60 * 24 * time.Hour), Fail},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			cert, key := writeCert(t, dir, c.host, c.notAfter)
			cfg := config.Config{Hostname: "itty.example.com", TLSCertFile: cert, TLSKeyFile: key}
			if got := checkerFor(cfg).certificate(); got.Status != c.want {
				t.Fatalf("status = %s (%s), want %s", got.Status, got.Detail, c.want)
			}
		})
	}
}

func TestCertificateMissingFilesFail(t *testing.T) {
	cfg := config.Config{Hostname: "h", TLSCertFile: "/nope/c", TLSKeyFile: "/nope/k"}
	if got := checkerFor(cfg).certificate(); got.Status != Fail {
		t.Fatalf("status = %s", got.Status)
	}
}

func TestKeyPermissions(t *testing.T) {
	_, key := writeCert(t, t.TempDir(), "h", time.Now().Add(time.Hour))
	cfg := config.Config{TLSKeyFile: key}
	if got := checkerFor(cfg).keyPermissions(); got.Status != OK {
		t.Fatalf("0600 key: %s", got.Status)
	}
	_ = os.Chmod(key, 0o644)
	if got := checkerFor(cfg).keyPermissions(); got.Status != Warn {
		t.Fatalf("0644 key: %s", got.Status)
	}
}

func TestListenAddressChecks(t *testing.T) {
	if got := checkerFor(config.Config{Listen: "127.0.0.1:0"}).listenAddress(); got.Status != OK {
		t.Fatalf("free loopback port: %s (%s)", got.Status, got.Detail)
	}

	busy, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer busy.Close()
	if got := checkerFor(config.Config{Listen: busy.Addr().String()}).listenAddress(); got.Status != Fail {
		t.Fatalf("busy port: %s", got.Status)
	}

	if got := checkerFor(config.Config{Listen: "203.0.113.5:8080"}).listenAddress(); got.Status != Fail {
		t.Fatalf("address not on this machine: %s", got.Status)
	}
	if got := checkerFor(config.Config{Listen: "not-an-address"}).listenAddress(); got.Status != Fail {
		t.Fatalf("malformed address: %s", got.Status)
	}
}

func TestDataDirChecks(t *testing.T) {
	if got := checkerFor(config.Config{DataDir: filepath.Join(t.TempDir(), "new")}).dataDir(); got.Status != OK {
		t.Fatalf("creatable dir: %s (%s)", got.Status, got.Detail)
	}
	if got := checkerFor(config.Config{DataDir: "/proc/itty-data"}).dataDir(); got.Status != Fail {
		t.Fatalf("uncreatable dir: %s", got.Status)
	}
}

func TestFailedReportsOnlyFailures(t *testing.T) {
	if Failed([]Result{{Status: OK}, {Status: Warn}}) {
		t.Fatal("warnings must not count as failures")
	}
	if !Failed([]Result{{Status: OK}, {Status: Fail}}) {
		t.Fatal("a failure must be reported")
	}
}

func TestDNSForLocalhostNeedsNoRecord(t *testing.T) {
	if got := checkerFor(config.Config{Hostname: "localhost", Listen: "127.0.0.1:8080"}).dns(); got.Status != OK {
		t.Fatalf("status = %s", got.Status)
	}
}
