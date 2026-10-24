# itty build order

This document gives the order in which to build itty. Each step produces something that can be run and tested before the next step starts, and each one adds one new area of Go. The design is in `design.md`.

The order keeps the server on the loopback address until login exists. A server that bridges a websocket to a shell and has no login must not be reachable from any network, even briefly.

## 1. Terminal bridge

Build a Go server that serves an xterm.js page and bridges a websocket to a pty running `tmux attach`. It reads its settings from a configuration file from the start, and it listens on loopback only and has no login. Test it from a desktop browser on the VM or through a local port forward.

This step covers the Go HTTP server, websockets, running a process on a pty, terminal resizing, and turning off flow control so that Ctrl+s reaches tmux. It also sets up the structured logging that every later step uses.

Reading the hostname, listen address, tmux session name and file locations from configuration in this step is what keeps the program from being tied to one person's machine.

## 2. Passkey enrollment and login

Add WebAuthn. Implement `itty enroll`, the credential file, the challenge and assertion endpoints, and the login on the client. Browsers treat localhost as a secure context, so this step can be tested on the desktop with a virtual authenticator or a platform passkey.

This step covers a second command in the same binary, file storage, and a WebAuthn library.

## 3. Tickets, the lock screen and attempt limits

Replace the open websocket with the ticket flow. The server issues a ticket after a valid assertion and accepts the websocket upgrade only with an unused ticket and a matching Origin. The client closes the websocket when the page is hidden and shows the lock screen when it becomes visible.

Reject requests whose Host header or TLS server name does not match the configured hostname. Add the limit on repeated failed attempts, and make the enrollment endpoint return not found unless an enrollment link is active.

This step covers concurrency-safe state in the server, expiry of short-lived values, and tests for the rejection cases. After it, the server has all of its login behavior and the pre-login surface described in the security baseline, so it can be exposed beyond loopback.

## 4. TLS and certificate renewal

Serve HTTPS from a certificate source that reads certificate and key files and loads changed files without a restart. Implement `itty renew-cert` on top of a DNS provider interface, with the manual provider as the only implementation. Add the days-until-expiry log line and the lock screen warning. Then deploy to a real hostname and connect from the phone.

The first thing to check on the phone is whether the VPN's DNS resolver accepts a hostname that resolves to a private address, because that is untested. This step covers TLS in Go, an ACME library, a command that talks to the operator interactively, and the interfaces for the certificate source and the DNS provider. A later automatic certificate mode and later providers implement those interfaces without changing the code that uses them.

## 5. Key bar

Add the sticky Ctrl key, the Prefix button, Esc, Tab and the arrow keys. Have the server read the tmux prefix at attach and send it to the client. Test on the phone, and add the home-screen PWA manifest if it was not added earlier.

## 6. Touch layer

Add drag-to-scroll as wheel events, tap as click, and long press with drag to select. Test every change on the real phone, because the right sensitivity cannot be found in a simulator. This step is the one most likely to need several rounds.

## 7. Setup for other operators

Write the installation and configuration guide, and decide how itty is installed and started on a VM. Test a clean install on a second VM that is not the author's.

## Later

A Cloudflare DNS provider, which is also the first test that the DNS provider interface works for a second implementation, a contribution guide for people who add providers by pull request, support for exposing the server to the internet, which would add an automatic certificate mode, a review of the pre-login code and rate limits, and possibly an allowlist of source addresses, copying to the phone's clipboard, momentum scrolling and macro buttons are not part of the first version. Each can be added without changing the earlier steps.
