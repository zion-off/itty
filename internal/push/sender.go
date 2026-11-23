package push

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/SherClockHolmes/webpush-go"
)

const (
	DefaultTTL         = 24 * time.Hour
	maxErrorBodyLength = 512
)

var ErrGone = errors.New("push subscription is no longer valid")

type StatusError struct {
	Code int
	Body string
}

func (e *StatusError) Error() string {
	if e.Body == "" {
		return fmt.Sprintf("push service answered %d", e.Code)
	}
	return fmt.Sprintf("push service answered %d: %s", e.Code, e.Body)
}

type Sender interface {
	Send(ctx context.Context, sub Subscription, payload []byte) error
}

type WebPushSender struct {
	keys       VAPIDKeys
	subscriber string
	ttl        time.Duration
	client     webpush.HTTPClient
}

func NewWebPushSender(keys VAPIDKeys, subscriber string, ttl time.Duration, client webpush.HTTPClient) *WebPushSender {
	return &WebPushSender{keys: keys, subscriber: subscriber, ttl: ttl, client: client}
}

func (s *WebPushSender) Send(ctx context.Context, sub Subscription, payload []byte) error {
	resp, err := webpush.SendNotificationWithContext(ctx, payload, &webpush.Subscription{
		Endpoint: sub.Endpoint,
		Keys:     webpush.Keys{P256dh: sub.Keys.P256dh, Auth: sub.Keys.Auth},
	}, &webpush.Options{
		HTTPClient:      s.client,
		Subscriber:      s.subscriber,
		TTL:             int(s.ttl.Seconds()),
		Urgency:         webpush.UrgencyHigh,
		VAPIDPublicKey:  s.keys.Public,
		VAPIDPrivateKey: s.keys.Private,
	})
	if err != nil {
		return fmt.Errorf("send to push service: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, maxErrorBodyLength))
	switch {
	case resp.StatusCode >= http.StatusOK && resp.StatusCode < http.StatusMultipleChoices:
		return nil
	case resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone:
		return fmt.Errorf("%w: %w", ErrGone, &StatusError{Code: resp.StatusCode, Body: strings.TrimSpace(string(body))})
	default:
		return &StatusError{Code: resp.StatusCode, Body: strings.TrimSpace(string(body))}
	}
}
