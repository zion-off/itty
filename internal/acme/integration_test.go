//go:build integration

package acme

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/zion/itty/internal/clock"
)

const (
	pebbleAddr     = "127.0.0.1:24000"
	pebbleMgmtAddr = "127.0.0.1:25000"
	dnsAddr        = "127.0.0.1:28053"
	dnsMgmtAddr    = "127.0.0.1:28055"
)

type challtestDNS struct{}

func (challtestDNS) post(path string, body map[string]string) error {
	raw, _ := json.Marshal(body)
	resp, err := http.Post("http://"+dnsMgmtAddr+path, "application/json", bytes.NewReader(raw))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s: %s", path, resp.Status)
	}
	return nil
}

func (c challtestDNS) Publish(_ context.Context, name, value string) error {
	return c.post("/set-txt", map[string]string{"host": name, "value": value})
}

func (c challtestDNS) Remove(_ context.Context, name, _ string) error {
	return c.post("/clear-txt", map[string]string{"host": name})
}

func startProcess(t *testing.T, env []string, bin string, args ...string) {
	t.Helper()
	cmd := exec.Command(bin, args...)
	cmd.Env = append(os.Environ(), env...)
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = cmd.Process.Kill(); _ = cmd.Wait() })
}

func waitForPort(t *testing.T, addr string) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if c, err := net.DialTimeout("tcp", addr, 200*time.Millisecond); err == nil {
			_ = c.Close()
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("%s did not start listening", addr)
}

func startPebble(t *testing.T) {
	t.Helper()
	binDir, certDir := os.Getenv("ITTY_PEBBLE_DIR"), os.Getenv("ITTY_PEBBLE_CERTS")
	if binDir == "" || certDir == "" {
		t.Skip("set ITTY_PEBBLE_DIR and ITTY_PEBBLE_CERTS to run the ACME integration test")
	}
	cfg := map[string]any{"pebble": map[string]any{
		"listenAddress":           pebbleAddr,
		"managementListenAddress": pebbleMgmtAddr,
		"certificate":             filepath.Join(certDir, "localhost", "cert.pem"),
		"privateKey":              filepath.Join(certDir, "localhost", "key.pem"),
		"httpPort":                5002,
		"tlsPort":                 5001,
		"ocspResponderURL":        "",
		"keyAlgorithm":            "ecdsa",
		"retryAfter":              map[string]int{"authz": 1, "order": 1},
	}}
	raw, _ := json.Marshal(cfg)
	cfgPath := filepath.Join(t.TempDir(), "pebble.json")
	_ = os.WriteFile(cfgPath, raw, 0o600)

	startProcess(t, nil, filepath.Join(binDir, "pebble-challtestsrv"),
		"-dnsserver", dnsAddr, "-management", dnsMgmtAddr, "-http01", "", "-https01", "", "-tlsalpn01", "", "-doh", "")
	startProcess(t, []string{"PEBBLE_VA_NOSLEEP=1"}, filepath.Join(binDir, "pebble"),
		"-config", cfgPath, "-dnsserver", dnsAddr)
	waitForPort(t, dnsMgmtAddr)
	waitForPort(t, pebbleAddr)
	t.Setenv("LEGO_CA_CERTIFICATES", filepath.Join(certDir, "pebble.minica.pem"))
}

func newIssuer(t *testing.T, accounts AccountStore, acceptTOS bool) LegoIssuer {
	return LegoIssuer{
		Email:           "ops@example.com",
		Directory:       "https://" + pebbleAddr + "/dir",
		Accounts:        accounts,
		PropagationWait: time.Second,
		AcceptTOS:       acceptTOS,
		Log:             slog.New(slog.NewTextHandler(io.Discard, nil)),
	}
}

func TestIssueAndRenewAgainstATestCA(t *testing.T) {
	startPebble(t)
	dir := t.TempDir()
	accounts := NewFileAccountStore(filepath.Join(dir, "acme"))

	_, err := newIssuer(t, accounts, false).Issue(context.Background(), host, challtestDNS{})
	if !errors.Is(err, ErrTermsNotAccepted) {
		t.Fatalf("first run without -accept-tos: err = %v", err)
	}

	renewer := Renewer{
		Hostname: host, CertFile: filepath.Join(dir, "c.pem"), KeyFile: filepath.Join(dir, "k.pem"),
		RenewBefore: 30 * 24 * time.Hour, Issuer: newIssuer(t, accounts, true), DNS: challtestDNS{},
		Clock: clock.System{}, Log: slog.New(slog.NewTextHandler(io.Discard, nil)),
	}
	res, err := renewer.Renew(context.Background(), false)
	if err != nil || !res.Renewed {
		t.Fatalf("renew: res=%+v err=%v", res, err)
	}
	if acct, err := accounts.Load(); err != nil || acct == nil || acct.Registration == nil {
		t.Fatalf("account was not persisted: %v %v", acct, err)
	}

	renewer.Issuer = newIssuer(t, accounts, false)
	res, err = renewer.Renew(context.Background(), true)
	if err != nil || !res.Renewed {
		t.Fatalf("forced renewal with the stored account: res=%+v err=%v", res, err)
	}
}
