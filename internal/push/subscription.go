package push

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"
)

const (
	maxEndpointLength = 2048
	p256PointLength   = 65
	p256PointPrefix   = 0x04
	authSecretLength  = 16
	idLength          = 12
)

var ErrInvalidSubscription = errors.New("invalid push subscription")

type Keys struct {
	P256dh string `json:"p256dh"`
	Auth   string `json:"auth"`
}

type Subscription struct {
	Endpoint string    `json:"endpoint"`
	Keys     Keys      `json:"keys"`
	AddedAt  time.Time `json:"added_at,omitzero"`
}

func (s Subscription) ID() string {
	sum := sha256.Sum256([]byte(s.Endpoint))
	return hex.EncodeToString(sum[:])[:idLength]
}

func (s Subscription) Host() string {
	u, err := url.Parse(s.Endpoint)
	if err != nil {
		return ""
	}
	return u.Host
}

func (s Subscription) Validate() error {
	if len(s.Endpoint) > maxEndpointLength {
		return fmt.Errorf("%w: endpoint is longer than %d characters", ErrInvalidSubscription, maxEndpointLength)
	}
	u, err := url.Parse(s.Endpoint)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return fmt.Errorf("%w: endpoint must be an https URL", ErrInvalidSubscription)
	}
	key, err := decodeKey(s.Keys.P256dh)
	if err != nil || len(key) != p256PointLength || key[0] != p256PointPrefix {
		return fmt.Errorf("%w: p256dh must be an uncompressed P-256 public key", ErrInvalidSubscription)
	}
	auth, err := decodeKey(s.Keys.Auth)
	if err != nil || len(auth) != authSecretLength {
		return fmt.Errorf("%w: auth must be %d bytes", ErrInvalidSubscription, authSecretLength)
	}
	return nil
}

func decodeKey(value string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(strings.TrimRight(value, "="))
}
