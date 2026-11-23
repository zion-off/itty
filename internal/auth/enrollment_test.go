package auth

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/zion-off/itty/internal/clock"
)

func newLinks(t *testing.T) (*FileEnrollmentLinks, *clock.Fake) {
	t.Helper()
	c := &clock.Fake{T: time.Unix(1000, 0)}
	return NewFileEnrollmentLinks(filepath.Join(t.TempDir(), "enroll.json"), c, discardLog()), c
}

func TestEnrollmentLinkLifecycle(t *testing.T) {
	l, _ := newLinks(t)
	if l.Active() {
		t.Fatal("no link should be active initially")
	}
	token, err := l.Create(time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if !l.Active() || !l.Valid(token) {
		t.Fatal("new link should be active and valid")
	}
	if l.Valid("wrong") || l.Consume("wrong") {
		t.Fatal("wrong token accepted")
	}
	if !l.Consume(token) {
		t.Fatal("consume failed")
	}
	if l.Active() || l.Consume(token) {
		t.Fatal("link should be single-use")
	}
}

func TestEnrollmentLinkExpires(t *testing.T) {
	l, c := newLinks(t)
	token, _ := l.Create(time.Minute)
	c.Advance(time.Minute)
	if l.Active() || l.Valid(token) {
		t.Fatal("expired link accepted")
	}
}

func TestNewEnrollmentLinkReplacesOld(t *testing.T) {
	l, _ := newLinks(t)
	first, _ := l.Create(time.Minute)
	second, _ := l.Create(time.Minute)
	if l.Valid(first) || !l.Valid(second) {
		t.Fatal("only the newest link should be valid")
	}
}
