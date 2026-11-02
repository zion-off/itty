package acme

import (
	"context"
	"testing"

	"github.com/go-acme/lego/v4/challenge/dns01"
)

type recordingDNS struct {
	published, removed [][2]string
}

func (r *recordingDNS) Publish(_ context.Context, name, value string) error {
	r.published = append(r.published, [2]string{name, value})
	return nil
}

func (r *recordingDNS) Remove(_ context.Context, name, value string) error {
	r.removed = append(r.removed, [2]string{name, value})
	return nil
}

func TestChallengeProviderPublishesAndRemovesTheChallengeRecord(t *testing.T) {
	rec := &recordingDNS{}
	p := challengeProvider{ctx: context.Background(), dns: rec}
	want := dns01.GetChallengeInfo("itty.example.com", "key-auth")

	if err := p.Present("itty.example.com", "token", "key-auth"); err != nil {
		t.Fatal(err)
	}
	if err := p.CleanUp("itty.example.com", "token", "key-auth"); err != nil {
		t.Fatal(err)
	}
	expect := [2]string{want.EffectiveFQDN, want.Value}
	if len(rec.published) != 1 || rec.published[0] != expect {
		t.Fatalf("published = %v, want %v", rec.published, expect)
	}
	if len(rec.removed) != 1 || rec.removed[0] != expect {
		t.Fatalf("removed = %v, want %v", rec.removed, expect)
	}
}

func TestChallengeProviderAllowsTimeToAddTheRecord(t *testing.T) {
	timeout, interval := challengeProvider{}.Timeout()
	if timeout < propagationPoll || interval <= 0 {
		t.Fatalf("timeout=%v interval=%v", timeout, interval)
	}
}
