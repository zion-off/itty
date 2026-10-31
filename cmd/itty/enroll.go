package main

import (
	"fmt"
	"log/slog"
	"time"

	"github.com/zion/itty/internal/auth"
	"github.com/zion/itty/internal/clock"
	"github.com/zion/itty/internal/config"
)

const enrollmentLinkLifetime = 10 * time.Minute

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
