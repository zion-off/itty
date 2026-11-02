package manual

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log/slog"

	"github.com/zion/itty/internal/dns"
)

type Provider struct {
	in  *bufio.Reader
	out io.Writer
	log *slog.Logger
}

func New(env dns.Env) (dns.Provider, error) {
	return &Provider{in: bufio.NewReader(env.In), out: env.Out, log: env.Log}, nil
}

func (p *Provider) Publish(ctx context.Context, name, value string) error {
	fmt.Fprintf(p.out, "\nAdd this DNS record, then press Enter:\n\n  Type:    TXT\n  Name:    %s\n  Content: %s\n\n", name, value)
	p.log.Info("waiting for the operator to add the TXT record", "name", name)

	done := make(chan error, 1)
	go func() {
		_, err := p.in.ReadString('\n')
		done <- err
	}()
	select {
	case err := <-done:
		if err != nil && err != io.EOF {
			return fmt.Errorf("read confirmation: %w", err)
		}
		p.log.Info("operator confirmed the TXT record", "name", name)
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (p *Provider) Remove(_ context.Context, name, _ string) error {
	fmt.Fprintf(p.out, "\nYou can now delete the TXT record %s from your DNS.\n", name)
	p.log.Info("reminded the operator to delete the TXT record", "name", name)
	return nil
}
