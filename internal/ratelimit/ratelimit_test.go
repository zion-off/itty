package ratelimit

import (
	"testing"
	"time"

	"github.com/zion-off/itty/internal/clock"
)

func TestBlocksAfterMaxFailuresUntilWindowPasses(t *testing.T) {
	c := &clock.Fake{T: time.Unix(0, 0)}
	l := NewFailureLimiter(c, 3, time.Minute)
	for i := 0; i < 3; i++ {
		if !l.Allowed("ip") {
			t.Fatalf("blocked after %d failures", i)
		}
		l.RecordFailure("ip")
	}
	if l.Allowed("ip") {
		t.Fatal("should be blocked after 3 failures")
	}
	if !l.Allowed("other") {
		t.Fatal("other keys must be unaffected")
	}
	c.Advance(time.Minute + time.Second)
	if !l.Allowed("ip") {
		t.Fatal("should be allowed once failures age out")
	}
}
