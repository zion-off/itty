# itty

itty is a web terminal for one person and one tmux session. It runs as a single Go program on a VM and serves a web app that you add to your phone's home screen. Every time the app comes to the foreground, it asks for a passkey check, such as FaceID.

itty is for a VM that is reachable only over a private network such as a VPN. It does not support exposing the server to the internet. Read `docs/threat-model.md` before you install it, because a successful login is a shell as the user that runs itty.

## Requirements

- Go, to build the program.
- tmux on the VM.
- A DNS name that points at the VM's private address, with any DNS proxy turned off.
- A TLS certificate for that name. WebAuthn works only over HTTPS. A `localhost` install needs no certificate.
- A network rule that lets your phone reach the listen port. On a cloud VM this is usually a security group.

## Install

```
go build -o bin/itty ./cmd/itty
./bin/itty init
./bin/itty check
./bin/itty enroll
./bin/itty serve
```

1. **`itty init`** asks for the hostname, the listen address and the certificate paths, and writes `itty.toml`. You can pass them as flags instead, for example `itty init -hostname itty.example.com -listen 10.0.0.5:9444 -tls-cert certs/fullchain.pem -tls-key certs/privkey.pem`. It refuses to overwrite an existing file unless you pass `-force`.
2. **`itty check`** verifies the setup before you start. It looks for tmux, a writable data directory, a listen address that belongs to this machine and is free, a certificate that covers the hostname and is not close to expiry, the key file permissions, and a DNS record that matches the listen address. It exits with an error if a check fails.
3. **`itty enroll`** prints a one-time link that expires after 10 minutes. Open it on the phone to register a passkey. Run it again from a shell on the VM to enroll another passkey or to recover from a lost phone.
4. **`itty serve`** starts the server. Start it outside tmux, or use `env -u TMUX itty serve`, because tmux refuses to create a nested session.

Add the page to your home screen from the browser's share menu.

## Run it as a service

`itty service install` writes a systemd unit that starts itty at boot, restarts it if it crashes, and runs it as your user. It fills in the path of the `itty` binary you ran, the config file you pass with `-config`, and your user name. It then enables and starts the service. The command uses `sudo` for the steps that need root, and skips it when you run it as root.

```
itty service install
itty service status
itty service restart
itty service stop
itty service stop -kill-session
itty service disable
itty service uninstall
```

- `start`, `stop`, `restart`, `enable` and `disable` map to the matching `systemctl` commands for the `itty` service. `enable` and `disable` control whether it starts at boot.
- `stop` leaves the tmux session running. Add `-kill-session` to end the session too.
- `uninstall` stops and disables the service and removes the unit file.
- After you rebuild the binary, run `itty service restart`. If you moved the binary or the config file, run `itty service install` again.

The unit sets `KillMode=process`. Without it, systemd would also kill the tmux server when itty stops or restarts, because tmux starts inside the service, and that would end your session and everything running in it. The unit has no sandboxing options on purpose, because the shell that a login opens must have the same access as you do. Only systemd on Linux is supported.

## Certificate

itty reads the certificate and key from files and reloads them when they change, so renewing needs no restart. `itty renew-cert` gets and renews the certificate with a Let's Encrypt DNS-01 challenge.

1. Set `acme_email` in `itty.toml`, or pass `-acme-email` to `itty init`.
2. Run `itty renew-cert -accept-tos`. The `-accept-tos` flag accepts the Let's Encrypt terms of service when the account is created, and you need it only the first time.
3. The command prints a TXT record. Add it in your DNS dashboard, wait a minute, and press Enter.
4. The command writes the certificate and key to `tls_cert_file` and `tls_key_file`, both with mode 600, and reminds you to delete the TXT record.

The command renews only when 30 days or fewer remain, so you can run it as often as you like. Pass `-force` to renew anyway. Let's Encrypt certificates last 90 days, and the server logs the days remaining at startup and once a day.

The default `manual` provider stores no DNS credentials on the VM, but it needs you to add the record each time. To renew without you, the project needs a provider for your DNS service. A provider is a Go package that publishes and removes one TXT record, plus one line in `cmd/itty/renew.go` that lists it. Contributions are welcome.

## Configuration

`itty init` writes these settings, and relative paths resolve against the file's directory.

| Setting | Meaning |
|---|---|
| `hostname` | The DNS name clients use. Requests for any other name get no response. |
| `listen` | The address and port to listen on. Pick a port that nothing else uses. |
| `tmux_session` | The tmux session to attach to. The server creates it if it does not exist. |
| `data_dir` | Where itty keeps enrolled passkeys and the enrollment link. |
| `log_file` | The structured JSON log. itty does not rotate it. |
| `tls_cert_file`, `tls_key_file` | The certificate and key. Required unless the hostname is `localhost`. |
| `acme_email` | The email for the Let's Encrypt account. Required by `renew-cert`. |
| `acme_directory` | The ACME server. Defaults to Let's Encrypt production. Use `https://acme-staging-v02.api.letsencrypt.org/directory` to test without rate limits. |
| `dns_provider` | The DNS provider that `renew-cert` uses. Defaults to `manual`. |
| `acme_propagation_wait_seconds` | If set, `renew-cert` waits this long after the record is added instead of querying the authoritative name servers. Use it if this machine cannot reach them. |

## Known limits

- Private networks only. The security audit found hardening gaps that matter once the server is reachable from the internet, such as no rate limit on `/auth/challenge`, no security headers and no HTTP read timeouts.
- The touch layer for scrolling and selecting text on a phone is not built.

## More

- `docs/design.md` describes the system.
- `docs/threat-model.md` lists the threats and the accepted risks.
- `docs/build-order.md` gives the order the program was built in.
