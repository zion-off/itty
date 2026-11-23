package ratelimit

import (
	"sync"
	"time"

	"github.com/zion-off/itty/internal/clock"
)

type Limiter interface {
	Allowed(key string) bool
	RecordFailure(key string)
}

type FailureLimiter struct {
	clock    clock.Clock
	max      int
	window   time.Duration
	mu       sync.Mutex
	failures map[string][]time.Time
}

func NewFailureLimiter(c clock.Clock, max int, window time.Duration) *FailureLimiter {
	return &FailureLimiter{clock: c, max: max, window: window, failures: make(map[string][]time.Time)}
}

func (l *FailureLimiter) Allowed(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.recent(key)) < l.max
}

func (l *FailureLimiter) RecordFailure(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.failures[key] = append(l.recent(key), l.clock.Now())
}

func (l *FailureLimiter) recent(key string) []time.Time {
	cutoff := l.clock.Now().Add(-l.window)
	kept := l.failures[key][:0]
	for _, t := range l.failures[key] {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}
	if len(kept) == 0 {
		delete(l.failures, key)
		return nil
	}
	l.failures[key] = kept
	return kept
}
