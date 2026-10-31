package auth

import (
	"sync"
	"time"

	"github.com/zion/itty/internal/clock"
)

type OneTimeStore interface {
	Put(kind, key string, value []byte, ttl time.Duration)
	Take(kind, key string) ([]byte, bool)
}

type entry struct {
	value   []byte
	expires time.Time
}

type MemoryOneTimeStore struct {
	clock   clock.Clock
	mu      sync.Mutex
	entries map[string]entry
}

func NewMemoryOneTimeStore(c clock.Clock) *MemoryOneTimeStore {
	return &MemoryOneTimeStore{clock: c, entries: make(map[string]entry)}
}

func (s *MemoryOneTimeStore) Put(kind, key string, value []byte, ttl time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.clock.Now()
	s.purgeExpired(now)
	s.entries[kind+"\x00"+key] = entry{value: value, expires: now.Add(ttl)}
}

func (s *MemoryOneTimeStore) Take(kind, key string) ([]byte, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	k := kind + "\x00" + key
	e, ok := s.entries[k]
	if !ok {
		return nil, false
	}
	delete(s.entries, k)
	if !s.clock.Now().Before(e.expires) {
		return nil, false
	}
	return e.value, true
}

func (s *MemoryOneTimeStore) purgeExpired(now time.Time) {
	for k, e := range s.entries {
		if !now.Before(e.expires) {
			delete(s.entries, k)
		}
	}
}
