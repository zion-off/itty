package certs

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"sync"
	"time"

	"github.com/zion-off/itty/internal/clock"
)

type Source interface {
	GetCertificate(*tls.ClientHelloInfo) (*tls.Certificate, error)
	DaysRemaining() (int, error)
}

type FileSource struct {
	certPath string
	keyPath  string
	hostname string
	clock    clock.Clock
	log      *slog.Logger

	mu       sync.Mutex
	cert     *tls.Certificate
	notAfter time.Time
	certMod  time.Time
	keyMod   time.Time
}

func NewFileSource(certPath, keyPath, hostname string, c clock.Clock, log *slog.Logger) (*FileSource, error) {
	s := &FileSource{certPath: certPath, keyPath: keyPath, hostname: hostname, clock: c, log: log}
	if err := s.reload(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *FileSource) GetCertificate(hello *tls.ClientHelloInfo) (*tls.Certificate, error) {
	if hello.ServerName != s.hostname {
		s.log.Warn("tls handshake rejected for unexpected server name", "server_name", hello.ServerName)
		return nil, errors.New("unexpected server name")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.changed() {
		if err := s.reloadLocked(); err != nil {
			s.log.Error("certificate reload failed; keeping the previous certificate", "error", err)
		}
	}
	return s.cert, nil
}

func (s *FileSource) DaysRemaining() (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return int(s.notAfter.Sub(s.clock.Now()).Hours() / 24), nil
}

func (s *FileSource) reload() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.reloadLocked()
}

func (s *FileSource) reloadLocked() error {
	certInfo, err := os.Stat(s.certPath)
	if err != nil {
		return fmt.Errorf("stat certificate: %w", err)
	}
	keyInfo, err := os.Stat(s.keyPath)
	if err != nil {
		return fmt.Errorf("stat key: %w", err)
	}
	s.certMod, s.keyMod = certInfo.ModTime(), keyInfo.ModTime()
	pair, err := tls.LoadX509KeyPair(s.certPath, s.keyPath)
	if err != nil {
		return fmt.Errorf("load certificate and key: %w", err)
	}
	leaf, err := x509.ParseCertificate(pair.Certificate[0])
	if err != nil {
		return fmt.Errorf("parse certificate: %w", err)
	}
	pair.Leaf = leaf
	s.cert, s.notAfter = &pair, leaf.NotAfter
	s.log.Info("certificate loaded", "not_after", leaf.NotAfter, "days_remaining", int(leaf.NotAfter.Sub(s.clock.Now()).Hours()/24))
	return nil
}

func (s *FileSource) changed() bool {
	certInfo, err1 := os.Stat(s.certPath)
	keyInfo, err2 := os.Stat(s.keyPath)
	if err1 != nil || err2 != nil {
		return false
	}
	return !certInfo.ModTime().Equal(s.certMod) || !keyInfo.ModTime().Equal(s.keyMod)
}
