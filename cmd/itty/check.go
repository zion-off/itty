package main

import (
	"errors"
	"fmt"
	"log/slog"

	"github.com/spf13/cobra"

	"github.com/zion/itty/internal/clock"
	"github.com/zion/itty/internal/config"
	"github.com/zion/itty/internal/setup"
)

func newCheckCommand() *cobra.Command {
	return newConfigBoundCommand("check", "Verify the setup before starting the server", check)
}

func check(cfg config.Config, log *slog.Logger) error {
	results := setup.Checker{Config: cfg, Clock: clock.System{}}.Run()
	for _, r := range results {
		fmt.Printf("%-5s %-16s %s\n", r.Status, r.Name, r.Detail)
		log.Info("setup check", "check", r.Name, "status", r.Status, "detail", r.Detail)
	}
	if setup.Failed(results) {
		return errors.New("one or more checks failed")
	}
	fmt.Println("\nAll checks passed. Next: itty enroll, then itty serve.")
	return nil
}
