package manual

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/zion/itty/internal/dns"
)

func newProvider(t *testing.T, in io.Reader) (dns.Provider, *bytes.Buffer) {
	t.Helper()
	out := &bytes.Buffer{}
	p, err := New(dns.Env{In: in, Out: out, Log: slog.New(slog.NewTextHandler(io.Discard, nil))})
	if err != nil {
		t.Fatal(err)
	}
	return p, out
}

func TestPublishPrintsRecordAndWaitsForEnter(t *testing.T) {
	p, out := newProvider(t, strings.NewReader("\n"))
	if err := p.Publish(context.Background(), "_acme-challenge.itty.example.com.", "abc123"); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"_acme-challenge.itty.example.com.", "abc123", "TXT"} {
		if !strings.Contains(out.String(), want) {
			t.Fatalf("output missing %q: %s", want, out.String())
		}
	}
}

func TestPublishBlocksUntilConfirmed(t *testing.T) {
	pr, pw := io.Pipe()
	p, _ := newProvider(t, pr)
	done := make(chan error, 1)
	go func() { done <- p.Publish(context.Background(), "n", "v") }()

	select {
	case <-done:
		t.Fatal("returned before the operator pressed Enter")
	case <-time.After(100 * time.Millisecond):
	}
	_, _ = pw.Write([]byte("\n"))
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("did not return after Enter")
	}
}

func TestPublishStopsWhenContextIsCancelled(t *testing.T) {
	pr, _ := io.Pipe()
	p, _ := newProvider(t, pr)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- p.Publish(ctx, "n", "v") }()
	cancel()
	select {
	case err := <-done:
		if err != context.Canceled {
			t.Fatalf("err = %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("did not stop after cancellation")
	}
}

func TestRemoveRemindsOperator(t *testing.T) {
	p, out := newProvider(t, strings.NewReader(""))
	if err := p.Remove(context.Background(), "_acme-challenge.itty.example.com.", "v"); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "delete the TXT record _acme-challenge.itty.example.com.") {
		t.Fatalf("output: %s", out.String())
	}
}
