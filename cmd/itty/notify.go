package main

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/zion/itty/internal/clock"
	"github.com/zion/itty/internal/config"
	"github.com/zion/itty/internal/push"
)

const (
	notifyTimeout     = 30 * time.Second
	pushClientTimeout = 15 * time.Second
)

const notifyLong = `Send a notification to every phone that turned notifications on in the
session menu. The words after the flags form the message.

The command talks to the push service directly, so it works while itty serve
is stopped. The VM needs outbound HTTPS access to the push service, which is
web.push.apple.com for an iPhone.`

func newNotifyCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:     "notify [flags] MESSAGE...",
		Short:   "Send a notification to your phone",
		Long:    notifyLong,
		Example: "  itty notify Build finished\n  itty notify --title deploy \"Rolled out to prod\"\n  make test; itty notify \"tests exited with $?\"",
		Args:    usageArgs(cobra.MinimumNArgs(1)),
	}
	configPath := addConfigFlag(cmd.Flags())
	title := cmd.Flags().StringP("title", "t", push.DefaultTitle, "the notification title")
	cmd.RunE = func(cmd *cobra.Command, args []string) error {
		msg := push.Message{Title: *title, Body: strings.Join(args, " ")}
		return runWithConfig(configPath(), func(cfg config.Config, log *slog.Logger) error {
			return notify(cmd.Context(), cfg, msg, cmd.OutOrStdout(), log)
		})
	}
	return cmd
}

func notify(parent context.Context, cfg config.Config, msg push.Message, out io.Writer, log *slog.Logger) error {
	ctx, stop := signal.NotifyContext(parent, os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, notifyTimeout)
	defer cancel()

	log = log.With("command", "notify")
	keys, err := push.NewFileKeyStore(cfg.PushKeysPath(), log).LoadOrCreate()
	if err != nil {
		log.Error("loading push keys failed", "error", err)
		return err
	}
	subs := push.NewFileSubscriptionStore(cfg.PushSubscriptionsPath(), clock.System{}, log)
	sender := push.NewWebPushSender(keys, cfg.PushSubscriber(), push.DefaultTTL, &http.Client{Timeout: pushClientTimeout})
	report, err := push.NewNotifier(subs, sender, log).Notify(ctx, msg)
	printReport(out, report)
	return err
}

func printReport(out io.Writer, r push.Report) {
	if r.Delivered > 0 {
		fmt.Fprintf(out, "Sent to %s.\n", plural(r.Delivered, "device"))
	}
	if r.Removed > 0 {
		fmt.Fprintf(out, "Removed %s that had expired.\n", plural(r.Removed, "device subscription"))
	}
	if r.Failed > 0 {
		fmt.Fprintf(out, "Failed for %s.\n", plural(r.Failed, "device"))
	}
}

func plural(n int, noun string) string {
	if n == 1 {
		return fmt.Sprintf("1 %s", noun)
	}
	return fmt.Sprintf("%d %ss", n, noun)
}
