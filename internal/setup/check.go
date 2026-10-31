package setup

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net"
	"os"
	"os/exec"
	"time"

	"github.com/zion/itty/internal/clock"
	"github.com/zion/itty/internal/config"
)

type Status string

const (
	OK   Status = "ok"
	Warn Status = "warn"
	Fail Status = "fail"
)

const certWarnDays = 14

type Result struct {
	Name   string
	Status Status
	Detail string
}

type Checker struct {
	Config config.Config
	Clock  clock.Clock
}

func (c Checker) Run() []Result {
	results := []Result{c.tmux(), c.dataDir(), c.listenAddress()}
	if c.Config.TLSEnabled() {
		results = append(results, c.certificate(), c.keyPermissions())
	}
	return append(results, c.dns())
}

func Failed(results []Result) bool {
	for _, r := range results {
		if r.Status == Fail {
			return true
		}
	}
	return false
}

func (c Checker) tmux() Result {
	path, err := exec.LookPath("tmux")
	if err != nil {
		return Result{"tmux", Fail, "tmux is not installed or not on PATH"}
	}
	return Result{"tmux", OK, path}
}

func (c Checker) dataDir() Result {
	if err := os.MkdirAll(c.Config.DataDir, 0o700); err != nil {
		return Result{"data directory", Fail, err.Error()}
	}
	probe, err := os.CreateTemp(c.Config.DataDir, ".check-*")
	if err != nil {
		return Result{"data directory", Fail, fmt.Sprintf("not writable: %v", err)}
	}
	_ = probe.Close()
	_ = os.Remove(probe.Name())
	return Result{"data directory", OK, c.Config.DataDir}
}

func (c Checker) listenAddress() Result {
	host, _, err := net.SplitHostPort(c.Config.Listen)
	if err != nil {
		return Result{"listen address", Fail, err.Error()}
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return Result{"listen address", Fail, fmt.Sprintf("%q is not an IP address", host)}
	}
	if !ownsAddress(ip) {
		return Result{"listen address", Fail, fmt.Sprintf("%s is not an address of this machine", ip)}
	}
	ln, err := net.Listen("tcp", c.Config.Listen)
	if err != nil {
		return Result{"listen address", Fail, fmt.Sprintf("cannot bind %s: %v", c.Config.Listen, err)}
	}
	_ = ln.Close()
	if !ip.IsLoopback() && !ip.IsPrivate() {
		return Result{"listen address", Warn, fmt.Sprintf("%s is a public address; itty supports private networks only", c.Config.Listen)}
	}
	return Result{"listen address", OK, c.Config.Listen + " is free"}
}

func ownsAddress(ip net.IP) bool {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return false
	}
	for _, a := range addrs {
		if n, ok := a.(*net.IPNet); ok && n.IP.Equal(ip) {
			return true
		}
	}
	return false
}

func (c Checker) certificate() Result {
	pair, err := tls.LoadX509KeyPair(c.Config.TLSCertFile, c.Config.TLSKeyFile)
	if err != nil {
		return Result{"certificate", Fail, fmt.Sprintf("cannot load certificate and key: %v", err)}
	}
	leaf, err := x509.ParseCertificate(pair.Certificate[0])
	if err != nil {
		return Result{"certificate", Fail, err.Error()}
	}
	if err := leaf.VerifyHostname(c.Config.Hostname); err != nil {
		return Result{"certificate", Fail, fmt.Sprintf("does not cover %s: %v", c.Config.Hostname, err)}
	}
	now := c.Clock.Now()
	if !now.Before(leaf.NotAfter) {
		return Result{"certificate", Fail, fmt.Sprintf("expired on %s", leaf.NotAfter.Format(time.DateOnly))}
	}
	days := int(leaf.NotAfter.Sub(now) / (24 * time.Hour))
	switch {
	case days <= certWarnDays:
		return Result{"certificate", Warn, fmt.Sprintf("expires in %d days", days)}
	}
	return Result{"certificate", OK, fmt.Sprintf("valid for %s, %d days left", c.Config.Hostname, days)}
}

func (c Checker) keyPermissions() Result {
	info, err := os.Stat(c.Config.TLSKeyFile)
	if err != nil {
		return Result{"key permissions", Fail, err.Error()}
	}
	if info.Mode().Perm()&0o077 != 0 {
		return Result{"key permissions", Warn, fmt.Sprintf("%s is readable by other users (mode %o)", c.Config.TLSKeyFile, info.Mode().Perm())}
	}
	return Result{"key permissions", OK, fmt.Sprintf("mode %o", info.Mode().Perm())}
}

func (c Checker) dns() Result {
	if c.Config.Hostname == "localhost" {
		return Result{"dns", OK, "localhost needs no DNS record"}
	}
	host, _, _ := net.SplitHostPort(c.Config.Listen)
	addrs, err := net.LookupHost(c.Config.Hostname)
	if err != nil {
		return Result{"dns", Warn, fmt.Sprintf("%s does not resolve from this machine: %v", c.Config.Hostname, err)}
	}
	for _, a := range addrs {
		if a == host {
			return Result{"dns", OK, fmt.Sprintf("%s resolves to %s", c.Config.Hostname, a)}
		}
	}
	return Result{"dns", Warn, fmt.Sprintf("%s resolves to %v, not the listen address %s", c.Config.Hostname, addrs, host)}
}
