package auth

import (
	"testing"
	"time"

	"github.com/zion/itty/internal/clock"
)

func TestTakeIsSingleUse(t *testing.T) {
	s := NewMemoryOneTimeStore(&clock.Fake{T: time.Unix(0, 0)})
	s.Put("ticket", "a", []byte("v"), time.Minute)
	if v, ok := s.Take("ticket", "a"); !ok || string(v) != "v" {
		t.Fatalf("first take = %q %v", v, ok)
	}
	if _, ok := s.Take("ticket", "a"); ok {
		t.Fatal("second take should fail")
	}
}

func TestTakeRejectsExpired(t *testing.T) {
	c := &clock.Fake{T: time.Unix(0, 0)}
	s := NewMemoryOneTimeStore(c)
	s.Put("ticket", "a", []byte("v"), time.Minute)
	c.Advance(time.Minute)
	if _, ok := s.Take("ticket", "a"); ok {
		t.Fatal("expired value was returned")
	}
}

func TestKindsAreSeparate(t *testing.T) {
	s := NewMemoryOneTimeStore(&clock.Fake{T: time.Unix(0, 0)})
	s.Put("challenge", "a", []byte("v"), time.Minute)
	if _, ok := s.Take("ticket", "a"); ok {
		t.Fatal("value leaked across kinds")
	}
}

func TestPutPurgesExpiredEntries(t *testing.T) {
	c := &clock.Fake{T: time.Unix(0, 0)}
	s := NewMemoryOneTimeStore(c)
	s.Put("ticket", "old", nil, time.Second)
	c.Advance(time.Hour)
	s.Put("ticket", "new", nil, time.Second)
	if len(s.entries) != 1 {
		t.Fatalf("expected 1 entry, have %d", len(s.entries))
	}
}
