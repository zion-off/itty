package server

import (
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/zion/itty/internal/clock"
	"github.com/zion/itty/internal/push"
	"github.com/zion/itty/internal/ratelimit"
)

type fakePush struct {
	mu           sync.Mutex
	key          string
	keyErr       error
	subscribeErr error
	removeErr    error
	saved        []push.Subscription
	removed      []string
}

func (f *fakePush) PublicKey() (string, error) { return f.key, f.keyErr }

func (f *fakePush) Subscribe(s push.Subscription) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.subscribeErr != nil {
		return f.subscribeErr
	}
	f.saved = append(f.saved, s)
	return nil
}

func (f *fakePush) Unsubscribe(endpoint string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.removed = append(f.removed, endpoint)
	return f.removeErr
}

func (f *fakePush) savedCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.saved)
}

func setupWithPush(t *testing.T, p PushRegistry) env {
	t.Helper()
	l := &fakeLauncher{started: make(chan startedSession, 8)}
	lister := &fakeLister{names: []string{"itty"}}
	a := &fakeAuth{tickets: map[string]bool{"good": true}}
	lim := ratelimit.NewFailureLimiter(clock.System{}, 3, time.Minute)
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	ts := httptest.NewServer(New(Deps{Hostname: "localhost", Launcher: l, Sessions: lister, DefaultSession: "itty", Auth: a, Limiter: lim, Push: p, Log: log}))
	t.Cleanup(ts.Close)
	return env{ts: ts, launch: l, lister: lister, auth: a, limiter: lim}
}

func pushSubscriptionJSON(endpoint string) map[string]any {
	return map[string]any{"endpoint": endpoint, "keys": map[string]string{"p256dh": "key", "auth": "secret"}}
}

func TestPushKeyRequestReturnsThePublicKey(t *testing.T) {
	conn, _, _ := connect(t, setupWithPush(t, &fakePush{key: "BPublic"}))
	_ = conn.WriteJSON(map[string]any{"type": "push_key"})
	if msg := readControl(t, conn); msg["type"] != "push_key" || msg["key"] != "BPublic" {
		t.Fatalf("msg = %v", msg)
	}
}

func TestPushKeyFailureReportsNotificationsUnavailable(t *testing.T) {
	conn, _, _ := connect(t, setupWithPush(t, &fakePush{keyErr: errors.New("disk")}))
	_ = conn.WriteJSON(map[string]any{"type": "push_key"})
	if msg := readControl(t, conn); msg["type"] != "push" || msg["subscribed"] != false || msg["error"] != pushUnavailableMessage {
		t.Fatalf("msg = %v", msg)
	}
}

func TestPushSubscribeSavesTheSubscription(t *testing.T) {
	p := &fakePush{}
	conn, _, _ := connect(t, setupWithPush(t, p))
	_ = conn.WriteJSON(map[string]any{"type": "push_subscribe", "subscription": pushSubscriptionJSON("https://web.push.apple.com/x")})
	if msg := readControl(t, conn); msg["type"] != "push" || msg["subscribed"] != true || msg["error"] != nil {
		t.Fatalf("msg = %v", msg)
	}
	if p.saved[0].Endpoint != "https://web.push.apple.com/x" || p.saved[0].Keys.P256dh != "key" || p.saved[0].Keys.Auth != "secret" {
		t.Fatalf("saved = %+v", p.saved)
	}
}

func TestPushSubscribeReportsRejections(t *testing.T) {
	cases := []struct {
		name    string
		err     error
		message map[string]any
		want    string
	}{
		{"missing subscription", nil, map[string]any{"type": "push_subscribe"}, pushInvalidMessage},
		{"invalid subscription", fmt.Errorf("%w: bad key", push.ErrInvalidSubscription), map[string]any{"type": "push_subscribe", "subscription": pushSubscriptionJSON("https://x/y")}, pushInvalidMessage},
		{"store failure", errors.New("disk full"), map[string]any{"type": "push_subscribe", "subscription": pushSubscriptionJSON("https://x/y")}, pushSaveFailedMessage},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p := &fakePush{subscribeErr: c.err}
			conn, _, _ := connect(t, setupWithPush(t, p))
			_ = conn.WriteJSON(c.message)
			if msg := readControl(t, conn); msg["type"] != "push" || msg["subscribed"] != false || msg["error"] != c.want {
				t.Fatalf("msg = %v", msg)
			}
			if p.savedCount() != 0 {
				t.Fatal("nothing should be saved")
			}
		})
	}
}

func TestPushUnsubscribeRemovesAndAlwaysReportsOff(t *testing.T) {
	for _, removeErr := range []error{nil, errors.New("disk")} {
		p := &fakePush{removeErr: removeErr}
		conn, _, _ := connect(t, setupWithPush(t, p))
		_ = conn.WriteJSON(map[string]any{"type": "push_unsubscribe", "endpoint": "https://web.push.apple.com/x"})
		if msg := readControl(t, conn); msg["type"] != "push" || msg["subscribed"] != false || msg["error"] != nil {
			t.Fatalf("removeErr=%v msg = %v", removeErr, msg)
		}
		if len(p.removed) != 1 || p.removed[0] != "https://web.push.apple.com/x" {
			t.Fatalf("removed = %v", p.removed)
		}
	}
}

func TestPushIsUnavailableWithoutARegistry(t *testing.T) {
	conn, _, _ := connect(t, setup(t))
	_ = conn.WriteJSON(map[string]any{"type": "push_key"})
	if msg := readControl(t, conn); msg["type"] != "push" || !strings.Contains(fmt.Sprint(msg["error"]), "not available") {
		t.Fatalf("msg = %v", msg)
	}
}
