package acme

import (
	"context"
	"time"

	"github.com/go-acme/lego/v4/challenge/dns01"

	"github.com/zion/itty/internal/dns"
)

const (
	propagationTimeout = 10 * time.Minute
	propagationPoll    = 5 * time.Second
)

type challengeProvider struct {
	ctx context.Context
	dns dns.Provider
}

func (c challengeProvider) Present(domain, _, keyAuth string) error {
	info := dns01.GetChallengeInfo(domain, keyAuth)
	return c.dns.Publish(c.ctx, info.EffectiveFQDN, info.Value)
}

func (c challengeProvider) CleanUp(domain, _, keyAuth string) error {
	info := dns01.GetChallengeInfo(domain, keyAuth)
	return c.dns.Remove(c.ctx, info.EffectiveFQDN, info.Value)
}

func (c challengeProvider) Timeout() (time.Duration, time.Duration) {
	return propagationTimeout, propagationPoll
}
