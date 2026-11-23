package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/zion/itty/internal/push"
)

func TestNotifyWithoutSubscriptionsExplainsHowToTurnThemOn(t *testing.T) {
	path, _ := writeConfig(t, `hostname = "localhost"`)
	got := runCLI(t, "notify", "-c", path, "Build", "finished")
	if got.code != exitFailure || !strings.Contains(got.stderr, "turn them on in the session menu") {
		t.Fatalf("code=%d stdout=%q stderr=%q", got.code, got.stdout, got.stderr)
	}
	info, err := os.Stat(filepath.Join(filepath.Dir(path), "data", "push-vapid.json"))
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("the key pair should be created with mode 0600: %v", err)
	}
}

func TestNotifyNeedsAMessage(t *testing.T) {
	got := runCLI(t, "notify")
	if got.code != exitUsage || !strings.Contains(got.stderr, "requires at least 1 arg(s)") {
		t.Fatalf("code=%d stderr=%q", got.code, got.stderr)
	}
}

func TestPrintReport(t *testing.T) {
	var out bytes.Buffer
	printReport(&out, push.Report{Delivered: 1, Removed: 2, Failed: 3})
	want := "Sent to 1 device.\nRemoved 2 device subscriptions that had expired.\nFailed for 3 devices.\n"
	if out.String() != want {
		t.Fatalf("got %q", out.String())
	}
}
