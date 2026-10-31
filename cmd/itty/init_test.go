package main

import (
	"bufio"
	"bytes"
	"strings"
	"testing"
)

func newPrompter(input string) (*prompter, *bytes.Buffer) {
	out := &bytes.Buffer{}
	return &prompter{in: bufio.NewReader(strings.NewReader(input)), out: out}, out
}

func TestAskSkipsPromptWhenValueGiven(t *testing.T) {
	p, out := newPrompter("ignored\n")
	if got := p.ask("Hostname", "itty.example.com", "localhost"); got != "itty.example.com" {
		t.Fatalf("got %q", got)
	}
	if out.Len() != 0 {
		t.Fatalf("unexpected prompt: %q", out.String())
	}
}

func TestAskUsesAnswerOrFallback(t *testing.T) {
	p, _ := newPrompter("typed.example.com\n\n")
	if got := p.ask("Hostname", "", "localhost"); got != "typed.example.com" {
		t.Fatalf("got %q", got)
	}
	if got := p.ask("Listen", "", "127.0.0.1:8080"); got != "127.0.0.1:8080" {
		t.Fatalf("empty answer should use the fallback, got %q", got)
	}
}

func TestDefaultListen(t *testing.T) {
	if defaultListen("localhost") != "127.0.0.1:8080" || defaultListen("itty.example.com") != "" {
		t.Fatal("unexpected default listen address")
	}
}
