package push

import (
	"context"
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/zion-off/itty/internal/clock"
)

func discardLog() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func browserSubscription(t *testing.T, endpoint string) Subscription {
	t.Helper()
	key, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	auth := make([]byte, 16)
	_, _ = rand.Read(auth)
	return Subscription{
		Endpoint: endpoint,
		Keys: Keys{
			P256dh: base64.RawURLEncoding.EncodeToString(key.PublicKey().Bytes()),
			Auth:   base64.RawURLEncoding.EncodeToString(auth),
		},
	}
}

func TestValidateAcceptsABrowserSubscription(t *testing.T) {
	sub := browserSubscription(t, "https://web.push.apple.com/abc")
	if err := sub.Validate(); err != nil {
		t.Fatal(err)
	}
	padded := sub
	padded.Keys.Auth += "=="
	if err := padded.Validate(); err != nil {
		t.Fatalf("padded keys: %v", err)
	}
}

func TestValidateRejectsBadSubscriptions(t *testing.T) {
	good := browserSubscription(t, "https://web.push.apple.com/abc")
	cases := map[string]func(*Subscription){
		"http endpoint":      func(s *Subscription) { s.Endpoint = "http://web.push.apple.com/abc" },
		"relative endpoint":  func(s *Subscription) { s.Endpoint = "/abc" },
		"long endpoint":      func(s *Subscription) { s.Endpoint = "https://x/" + strings.Repeat("a", maxEndpointLength) },
		"short p256dh":       func(s *Subscription) { s.Keys.P256dh = "AAAA" },
		"bad base64":         func(s *Subscription) { s.Keys.P256dh = "***" },
		"wrong point prefix": func(s *Subscription) { s.Keys.P256dh = base64.RawURLEncoding.EncodeToString(make([]byte, 65)) },
		"short auth":         func(s *Subscription) { s.Keys.Auth = "AAAA" },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			sub := good
			mutate(&sub)
			if err := sub.Validate(); !errors.Is(err, ErrInvalidSubscription) {
				t.Fatalf("err = %v", err)
			}
		})
	}
}

func TestIDIsStableAndDoesNotRevealTheEndpoint(t *testing.T) {
	a := Subscription{Endpoint: "https://web.push.apple.com/secret-token"}
	if a.ID() != a.ID() || len(a.ID()) != idLength || strings.Contains(a.ID(), "secret") {
		t.Fatalf("id = %q", a.ID())
	}
	if a.Host() != "web.push.apple.com" {
		t.Fatalf("host = %q", a.Host())
	}
}

func TestKeyStoreCreatesOnceWithPrivateMode(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data", "push-vapid.json")
	first, err := NewFileKeyStore(path, discardLog()).LoadOrCreate()
	if err != nil {
		t.Fatal(err)
	}
	second, err := NewFileKeyStore(path, discardLog()).LoadOrCreate()
	if err != nil || second != first {
		t.Fatalf("second load = %+v, %v; want %+v", second, err, first)
	}
	info, err := os.Stat(path)
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("mode = %v, %v", info.Mode().Perm(), err)
	}
	raw, _ := base64.RawURLEncoding.DecodeString(first.Public)
	if len(raw) != p256PointLength {
		t.Fatalf("public key length = %d", len(raw))
	}
}

func TestKeyStoresRacingToCreateAgreeOnOneKey(t *testing.T) {
	path := filepath.Join(t.TempDir(), "push-vapid.json")
	const racers = 8
	got := make([]VAPIDKeys, racers)
	var wg sync.WaitGroup
	for i := range racers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			keys, err := NewFileKeyStore(path, discardLog()).LoadOrCreate()
			if err != nil {
				t.Error(err)
			}
			got[i] = keys
		}()
	}
	wg.Wait()
	for _, keys := range got[1:] {
		if keys != got[0] {
			t.Fatalf("racers disagree: %+v vs %+v", keys, got[0])
		}
	}
}

func TestKeyStoreRejectsACorruptFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "push-vapid.json")
	_ = os.WriteFile(path, []byte(`{"public_key":"x"}`), 0o600)
	if _, err := NewFileKeyStore(path, discardLog()).LoadOrCreate(); err == nil {
		t.Fatal("expected an error for incomplete keys")
	}
}

func newStore(t *testing.T) (*FileSubscriptionStore, *clock.Fake, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "data", "push-subscriptions.json")
	clk := &clock.Fake{T: time.Date(2026, 11, 23, 10, 0, 0, 0, time.UTC)}
	return NewFileSubscriptionStore(path, clk, discardLog()), clk, path
}

func TestStoreSavesRefreshesAndRemoves(t *testing.T) {
	store, clk, path := newStore(t)
	sub := browserSubscription(t, "https://web.push.apple.com/one")
	if err := store.Save(sub); err != nil {
		t.Fatal(err)
	}
	clk.Advance(time.Hour)
	refreshed := browserSubscription(t, sub.Endpoint)
	if err := store.Save(refreshed); err != nil {
		t.Fatal(err)
	}
	subs, err := store.List()
	if err != nil || len(subs) != 1 {
		t.Fatalf("subs = %+v, %v", subs, err)
	}
	if subs[0].Keys != refreshed.Keys || !subs[0].AddedAt.Equal(time.Date(2026, 11, 23, 10, 0, 0, 0, time.UTC)) {
		t.Fatalf("refresh should replace the keys and keep the first date: %+v", subs[0])
	}
	if info, _ := os.Stat(path); info.Mode().Perm() != 0o600 {
		t.Fatalf("mode = %v", info.Mode().Perm())
	}
	if removed, err := store.Remove(sub.Endpoint); err != nil || !removed {
		t.Fatalf("remove = %v, %v", removed, err)
	}
	if removed, err := store.Remove(sub.Endpoint); err != nil || removed {
		t.Fatalf("second remove = %v, %v", removed, err)
	}
	if subs, _ := store.List(); len(subs) != 0 {
		t.Fatalf("subs after remove = %+v", subs)
	}
}

func TestStoreKeepsOnlyTheNewestSubscriptions(t *testing.T) {
	store, clk, _ := newStore(t)
	for i := range MaxSubscriptions + 2 {
		clk.Advance(time.Minute)
		if err := store.Save(browserSubscription(t, "https://web.push.apple.com/"+string(rune('a'+i)))); err != nil {
			t.Fatal(err)
		}
	}
	subs, _ := store.List()
	if len(subs) != MaxSubscriptions || subs[0].Endpoint != "https://web.push.apple.com/c" {
		t.Fatalf("got %d subscriptions starting with %q", len(subs), subs[0].Endpoint)
	}
}

func TestStoreRejectsAnInvalidSubscription(t *testing.T) {
	store, _, path := newStore(t)
	if err := store.Save(Subscription{Endpoint: "https://web.push.apple.com/x"}); !errors.Is(err, ErrInvalidSubscription) {
		t.Fatalf("err = %v", err)
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("an invalid subscription must not create the file: %v", err)
	}
}

func TestMessagePayload(t *testing.T) {
	raw, err := Message{Body: "done"}.Payload()
	if err != nil || string(raw) != `{"title":"itty","body":"done"}` {
		t.Fatalf("payload = %s, %v", raw, err)
	}
	if _, err := (Message{Body: "  "}).Payload(); !errors.Is(err, ErrEmptyMessage) {
		t.Fatalf("empty: %v", err)
	}
	if _, err := (Message{Body: strings.Repeat("x", MaxPayloadBytes)}).Payload(); !errors.Is(err, ErrMessageTooLong) {
		t.Fatalf("long: %v", err)
	}
}

type pushService struct {
	*httptest.Server
	mu       sync.Mutex
	requests []*http.Request
	status   map[string]int
}

func newPushService(t *testing.T) *pushService {
	t.Helper()
	p := &pushService{status: map[string]int{}}
	p.Server = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		p.mu.Lock()
		p.requests = append(p.requests, r)
		code, ok := p.status[r.URL.Path]
		p.mu.Unlock()
		if !ok {
			code = http.StatusCreated
		}
		w.WriteHeader(code)
	}))
	t.Cleanup(p.Close)
	return p
}

func (p *pushService) sender(t *testing.T) *WebPushSender {
	t.Helper()
	keys, err := NewFileKeyStore(filepath.Join(t.TempDir(), "k.json"), discardLog()).LoadOrCreate()
	if err != nil {
		t.Fatal(err)
	}
	return NewWebPushSender(keys, "https://itty.example.com", DefaultTTL, p.Client())
}

func TestSenderSignsAndEncryptsTheRequest(t *testing.T) {
	service := newPushService(t)
	sender := service.sender(t)
	if err := sender.Send(context.Background(), browserSubscription(t, service.URL+"/ok"), []byte(`{"body":"hi"}`)); err != nil {
		t.Fatal(err)
	}
	r := service.requests[0]
	if r.Method != http.MethodPost || r.Header.Get("Content-Encoding") != "aes128gcm" || r.Header.Get("Urgency") != "high" || r.Header.Get("TTL") != "86400" {
		t.Fatalf("headers = %v", r.Header)
	}
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "vapid t=") || !strings.Contains(auth, ", k="+sender.keys.Public) {
		t.Fatalf("authorization = %q", auth)
	}
	token := strings.TrimSuffix(strings.TrimPrefix(auth, "vapid t="), ", k="+sender.keys.Public)
	parts := strings.Split(token, ".")
	claimsRaw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatal(err)
	}
	var claims map[string]any
	_ = json.Unmarshal(claimsRaw, &claims)
	if claims["sub"] != "https://itty.example.com" || claims["aud"] != service.URL {
		t.Fatalf("claims = %v", claims)
	}
}

func TestSenderReportsGoneAndOtherFailures(t *testing.T) {
	service := newPushService(t)
	service.status["/gone"] = http.StatusGone
	service.status["/missing"] = http.StatusNotFound
	service.status["/busy"] = http.StatusTooManyRequests
	sender := service.sender(t)
	for path, wantGone := range map[string]bool{"/gone": true, "/missing": true, "/busy": false} {
		err := sender.Send(context.Background(), browserSubscription(t, service.URL+path), []byte("x"))
		var status *StatusError
		if !errors.As(err, &status) || errors.Is(err, ErrGone) != wantGone {
			t.Errorf("%s: err = %v", path, err)
		}
	}
}

func TestNotifierDeliversRemovesExpiredAndReports(t *testing.T) {
	service := newPushService(t)
	service.status["/gone"] = http.StatusGone
	store, _, _ := newStore(t)
	for _, path := range []string{"/a", "/gone", "/b"} {
		if err := store.Save(browserSubscription(t, service.URL+path)); err != nil {
			t.Fatal(err)
		}
	}
	report, err := NewNotifier(store, service.sender(t), discardLog()).Notify(context.Background(), Message{Body: "done"})
	if err != nil || report != (Report{Delivered: 2, Removed: 1}) {
		t.Fatalf("report = %+v, err = %v", report, err)
	}
	subs, _ := store.List()
	if len(subs) != 2 {
		t.Fatalf("the expired subscription should be removed, have %d", len(subs))
	}
}

func TestNotifierErrors(t *testing.T) {
	service := newPushService(t)
	service.status["/gone"] = http.StatusGone
	service.status["/broken"] = http.StatusInternalServerError

	empty, _, _ := newStore(t)
	if _, err := NewNotifier(empty, service.sender(t), discardLog()).Notify(context.Background(), Message{Body: "x"}); !errors.Is(err, ErrNoSubscriptions) {
		t.Fatalf("no subscriptions: %v", err)
	}

	expired, _, _ := newStore(t)
	_ = expired.Save(browserSubscription(t, service.URL+"/gone"))
	if _, err := NewNotifier(expired, service.sender(t), discardLog()).Notify(context.Background(), Message{Body: "x"}); !errors.Is(err, ErrAllExpired) {
		t.Fatalf("all expired: %v", err)
	}

	broken, _, _ := newStore(t)
	_ = broken.Save(browserSubscription(t, service.URL+"/broken"))
	report, err := NewNotifier(broken, service.sender(t), discardLog()).Notify(context.Background(), Message{Body: "x"})
	var status *StatusError
	if !errors.As(err, &status) || status.Code != http.StatusInternalServerError || report.Failed != 1 {
		t.Fatalf("failure: report = %+v, err = %v", report, err)
	}
	if subs, _ := broken.List(); len(subs) != 1 {
		t.Fatal("a failed send must keep the subscription")
	}
}
