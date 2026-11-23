package push

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"slices"

	"golang.org/x/sys/unix"

	"github.com/zion/itty/internal/clock"
	"github.com/zion/itty/internal/fsutil"
)

const MaxSubscriptions = 10

type SubscriptionStore interface {
	List() ([]Subscription, error)
	Save(Subscription) error
	Remove(endpoint string) (bool, error)
}

type FileSubscriptionStore struct {
	path  string
	clock clock.Clock
	log   *slog.Logger
}

func NewFileSubscriptionStore(path string, clk clock.Clock, log *slog.Logger) *FileSubscriptionStore {
	return &FileSubscriptionStore{path: path, clock: clk, log: log}
}

func (s *FileSubscriptionStore) List() ([]Subscription, error) {
	var subs []Subscription
	err := s.locked(func() error {
		var err error
		subs, err = s.read()
		return err
	})
	return subs, err
}

func (s *FileSubscriptionStore) Save(sub Subscription) error {
	if err := sub.Validate(); err != nil {
		return err
	}
	return s.locked(func() error {
		subs, err := s.read()
		if err != nil {
			return err
		}
		i := slices.IndexFunc(subs, func(existing Subscription) bool { return existing.Endpoint == sub.Endpoint })
		if i >= 0 {
			sub.AddedAt = subs[i].AddedAt
			subs[i] = sub
			s.log.Info("push subscription refreshed", "subscription", sub.ID(), "push_host", sub.Host())
			return s.write(subs)
		}
		sub.AddedAt = s.clock.Now().UTC()
		subs = append(subs, sub)
		if dropped := len(subs) - MaxSubscriptions; dropped > 0 {
			for _, old := range subs[:dropped] {
				s.log.Warn("push subscription dropped to stay under the limit", "subscription", old.ID(), "limit", MaxSubscriptions)
			}
			subs = subs[dropped:]
		}
		s.log.Info("push subscription saved", "subscription", sub.ID(), "push_host", sub.Host(), "subscription_count", len(subs))
		return s.write(subs)
	})
}

func (s *FileSubscriptionStore) Remove(endpoint string) (bool, error) {
	removed := false
	err := s.locked(func() error {
		subs, err := s.read()
		if err != nil {
			return err
		}
		kept := slices.DeleteFunc(subs, func(existing Subscription) bool { return existing.Endpoint == endpoint })
		if removed = len(kept) != len(subs); !removed {
			return nil
		}
		s.log.Info("push subscription removed", "subscription", Subscription{Endpoint: endpoint}.ID(), "subscription_count", len(kept))
		return s.write(kept)
	})
	return removed, err
}

func (s *FileSubscriptionStore) locked(fn func() error) error {
	dir := filepath.Dir(s.path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("create directory %s: %w", dir, err)
	}
	lock, err := os.OpenFile(s.path+".lock", os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return fmt.Errorf("open push subscription lock: %w", err)
	}
	defer lock.Close()
	if err := unix.Flock(int(lock.Fd()), unix.LOCK_EX); err != nil {
		return fmt.Errorf("lock push subscriptions: %w", err)
	}
	defer func() { _ = unix.Flock(int(lock.Fd()), unix.LOCK_UN) }()
	return fn()
}

func (s *FileSubscriptionStore) read() ([]Subscription, error) {
	raw, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read push subscriptions %s: %w", s.path, err)
	}
	var subs []Subscription
	if err := json.Unmarshal(raw, &subs); err != nil {
		return nil, fmt.Errorf("parse push subscriptions %s: %w", s.path, err)
	}
	return subs, nil
}

func (s *FileSubscriptionStore) write(subs []Subscription) error {
	if subs == nil {
		subs = []Subscription{}
	}
	raw, err := json.Marshal(subs)
	if err != nil {
		return err
	}
	return fsutil.WriteFileAtomic(s.path, raw, 0o600)
}
