package logging

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNewWritesJSONLines(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sub", "itty.log")
	log, closeFn, err := New(path)
	if err != nil {
		t.Fatal(err)
	}
	log.Info("hello", "conn_id", "abc")
	if err := closeFn(); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(path)
	if !strings.Contains(string(raw), `"conn_id":"abc"`) {
		t.Fatalf("unexpected log: %s", raw)
	}
}

func TestWithConsoleWritesTextToTheConsoleAndJSONToTheFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "itty.log")
	var console bytes.Buffer
	log, closeFn, err := New(path, WithConsole(&console))
	if err != nil {
		t.Fatal(err)
	}
	log.Info("hello", "conn_id", "abc")
	if err := closeFn(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(console.String(), "msg=hello conn_id=abc") {
		t.Fatalf("unexpected console output: %s", console.String())
	}
	raw, _ := os.ReadFile(path)
	if !strings.Contains(string(raw), `"conn_id":"abc"`) {
		t.Fatalf("unexpected log file: %s", raw)
	}
}

func TestNewIDIsUnique(t *testing.T) {
	if NewID() == NewID() {
		t.Fatal("ids collided")
	}
}
