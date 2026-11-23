package push

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"
)

const (
	DefaultTitle    = "itty"
	MaxPayloadBytes = 3072
)

var (
	ErrNoSubscriptions = errors.New("no device has notifications turned on; open itty on your phone and turn them on in the session menu")
	ErrAllExpired      = errors.New("every device subscription had expired and was removed; turn notifications on again on your phone")
	ErrEmptyMessage    = errors.New("the message is empty")
	ErrMessageTooLong  = fmt.Errorf("the title and message together must fit in %d bytes", MaxPayloadBytes)
)

type Message struct {
	Title string `json:"title"`
	Body  string `json:"body"`
}

func (m Message) Payload() ([]byte, error) {
	m.Title = strings.TrimSpace(m.Title)
	if m.Title == "" {
		m.Title = DefaultTitle
	}
	if strings.TrimSpace(m.Body) == "" {
		return nil, ErrEmptyMessage
	}
	raw, err := json.Marshal(m)
	if err != nil {
		return nil, err
	}
	if len(raw) > MaxPayloadBytes {
		return nil, ErrMessageTooLong
	}
	return raw, nil
}

type Report struct {
	Delivered int
	Removed   int
	Failed    int
}

type Notifier struct {
	subs   SubscriptionStore
	sender Sender
	log    *slog.Logger
}

func NewNotifier(subs SubscriptionStore, sender Sender, log *slog.Logger) *Notifier {
	return &Notifier{subs: subs, sender: sender, log: log}
}

func (n *Notifier) Notify(ctx context.Context, msg Message) (Report, error) {
	payload, err := msg.Payload()
	if err != nil {
		return Report{}, err
	}
	subs, err := n.subs.List()
	if err != nil {
		return Report{}, err
	}
	if len(subs) == 0 {
		n.log.Warn("notification not sent", "reason", "no subscriptions")
		return Report{}, ErrNoSubscriptions
	}
	var report Report
	var failures []error
	for _, sub := range subs {
		started := time.Now()
		err := n.sender.Send(ctx, sub, payload)
		log := n.log.With("subscription", sub.ID(), "push_host", sub.Host(), "duration", time.Since(started).String())
		switch {
		case err == nil:
			report.Delivered++
			log.Info("notification delivered to push service")
		case errors.Is(err, ErrGone):
			log.Warn("push subscription expired", "error", err)
			if _, removeErr := n.subs.Remove(sub.Endpoint); removeErr != nil {
				log.Error("removing expired push subscription failed", "error", removeErr)
			}
			report.Removed++
		default:
			log.Error("notification send failed", "error", err)
			report.Failed++
			failures = append(failures, fmt.Errorf("device %s: %w", sub.ID(), err))
		}
	}
	n.log.Info("notification finished", "delivered", report.Delivered, "removed", report.Removed, "failed", report.Failed)
	if report.Delivered > 0 {
		return report, nil
	}
	if report.Failed > 0 {
		return report, errors.Join(failures...)
	}
	return report, ErrAllExpired
}
