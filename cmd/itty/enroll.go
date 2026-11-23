package main

import (
	"fmt"
	"log/slog"
	"time"

	"github.com/spf13/cobra"

	"github.com/zion-off/itty/internal/auth"
	"github.com/zion-off/itty/internal/clock"
	"github.com/zion-off/itty/internal/config"
)

const enrollmentLinkLifetime = 10 * time.Minute

func newEnrollCommand() *cobra.Command {
	return newConfigBoundCommand("enroll", "Print a one-time link that registers a passkey", enroll)
}

func enroll(cfg config.Config, log *slog.Logger) error {
	links := auth.NewFileEnrollmentLinks(cfg.EnrollmentPath(), clock.System{}, log)
	token, err := links.Create(enrollmentLinkLifetime)
	if err != nil {
		log.Error("enrollment link creation failed", "error", err)
		return err
	}
	fmt.Printf("Open this link on your phone within %d minutes:\n\n  %s/enroll#%s\n\n", int(enrollmentLinkLifetime.Minutes()), cfg.Origin(), token)
	return nil
}
