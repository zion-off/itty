package main

import (
	"bufio"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"golang.org/x/term"

	"github.com/zion/itty/internal/config"
	"github.com/zion/itty/internal/logging"
	"github.com/zion/itty/internal/setup"
)

func initCommand(args []string) error {
	cfg := config.Default()
	fs := flag.NewFlagSet("itty init", flag.ContinueOnError)
	path := fs.String("config", defaultConfigPath, "where to write the configuration file")
	force := fs.Bool("force", false, "overwrite an existing configuration file")
	fs.StringVar(&cfg.Hostname, "hostname", "", "DNS name the phone will use")
	fs.StringVar(&cfg.Listen, "listen", "", "address and port to listen on")
	fs.StringVar(&cfg.TmuxSession, "tmux-session", cfg.TmuxSession, "name of the tmux session to attach to")
	fs.StringVar(&cfg.TLSCertFile, "tls-cert", "", "path to the certificate file (PEM)")
	fs.StringVar(&cfg.TLSKeyFile, "tls-key", "", "path to the private key file (PEM)")
	if err := fs.Parse(args); err != nil {
		return err
	}

	if interactive() {
		prompter := &prompter{in: bufio.NewReader(os.Stdin), out: os.Stdout}
		cfg.Hostname = prompter.ask("Hostname", cfg.Hostname, "localhost")
		cfg.Listen = prompter.ask("Listen address", cfg.Listen, defaultListen(cfg.Hostname))
		if cfg.Hostname != "localhost" {
			cfg.TLSCertFile = prompter.ask("TLS certificate file", cfg.TLSCertFile, "certs/fullchain.pem")
			cfg.TLSKeyFile = prompter.ask("TLS key file", cfg.TLSKeyFile, "certs/privkey.pem")
		}
	}
	if cfg.Hostname == "" {
		cfg.Hostname = "localhost"
	}
	if cfg.Listen == "" {
		cfg.Listen = defaultListen(cfg.Hostname)
	}

	log, closeLog, err := logging.New(cfg.LogFile)
	if err != nil {
		return err
	}
	defer closeLog()

	if err := setup.Init(setup.InitOptions{Path: *path, Config: cfg, Force: *force}, log); err != nil {
		return err
	}
	fmt.Printf("Wrote %s\n\nNext:\n  itty check -config %s\n  itty enroll -config %s\n  itty serve -config %s\n", *path, *path, *path, *path)
	return nil
}

func defaultListen(hostname string) string {
	if hostname == "localhost" {
		return "127.0.0.1:8080"
	}
	return ""
}

func interactive() bool {
	return term.IsTerminal(int(os.Stdin.Fd()))
}

type prompter struct {
	in  *bufio.Reader
	out io.Writer
}

func (p *prompter) ask(label, current, fallback string) string {
	if current != "" {
		return current
	}
	if fallback != "" {
		fmt.Fprintf(p.out, "%s [%s]: ", label, fallback)
	} else {
		fmt.Fprintf(p.out, "%s: ", label)
	}
	line, _ := p.in.ReadString('\n')
	if line = strings.TrimSpace(line); line != "" {
		return line
	}
	return fallback
}
