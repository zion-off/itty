package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"sync"
	"time"

	"github.com/zion/itty/internal/clock"
	"github.com/zion/itty/internal/fsutil"
)

type EnrollmentLinks interface {
	Create(ttl time.Duration) (token string, err error)
	Active() bool
	Valid(token string) bool
	Consume(token string) bool
}

type enrollmentRecord struct {
	TokenHash []byte    `json:"token_hash"`
	Expires   time.Time `json:"expires"`
}

type FileEnrollmentLinks struct {
	path  string
	clock clock.Clock
	log   *slog.Logger
	mu    sync.Mutex
}

func NewFileEnrollmentLinks(path string, c clock.Clock, log *slog.Logger) *FileEnrollmentLinks {
	return &FileEnrollmentLinks{path: path, clock: c, log: log}
}

func (l *FileEnrollmentLinks) Create(ttl time.Duration) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate enrollment token: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	rec := enrollmentRecord{TokenHash: hashToken(token), Expires: l.clock.Now().Add(ttl)}

	l.mu.Lock()
	defer l.mu.Unlock()
	if err := l.write(rec); err != nil {
		return "", err
	}
	l.log.Info("enrollment link created", "expires", rec.Expires)
	return token, nil
}

func (l *FileEnrollmentLinks) Active() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	_, ok := l.current()
	return ok
}

func (l *FileEnrollmentLinks) Valid(token string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.matches(token)
}

func (l *FileEnrollmentLinks) Consume(token string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if !l.matches(token) {
		return false
	}
	if err := os.Remove(l.path); err != nil {
		l.log.Error("enrollment link removal failed", "error", err)
		return false
	}
	l.log.Info("enrollment link used")
	return true
}

func (l *FileEnrollmentLinks) matches(token string) bool {
	rec, ok := l.current()
	return ok && subtle.ConstantTimeCompare(rec.TokenHash, hashToken(token)) == 1
}

func (l *FileEnrollmentLinks) current() (enrollmentRecord, bool) {
	raw, err := os.ReadFile(l.path)
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			l.log.Error("enrollment link read failed", "error", err)
		}
		return enrollmentRecord{}, false
	}
	var rec enrollmentRecord
	if err := json.Unmarshal(raw, &rec); err != nil {
		l.log.Error("enrollment link parse failed", "error", err)
		return enrollmentRecord{}, false
	}
	if !l.clock.Now().Before(rec.Expires) {
		return enrollmentRecord{}, false
	}
	return rec, true
}

func (l *FileEnrollmentLinks) write(rec enrollmentRecord) error {
	raw, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	return fsutil.WriteFileAtomic(l.path, raw, 0o600)
}

func hashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}
