# itty

itty is a private web terminal for your phone: one person, one tmux session, unlocked with a passkey. It runs as a single Go program on a VM and serves a web app that you add to your phone's home screen. Every time the app comes to the foreground, it asks for a passkey check, such as FaceID.

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
./bin/itty install
itty init
itty check
itty enroll
itty serve
```

1. **`itty install`** copies the binary to `~/.local/bin` so that `itty` works from any directory. Use `--dir` to choose another directory, for example `--dir /usr/local/bin` with `sudo`. Use `--link` to link to `bin/itty` instead of copying, so that a rebuild updates the installed command. If the directory is not on your `PATH`, the command prints the `export PATH=...` line to add to your shell startup file, and it does not edit that file itself. Running it again replaces the installed binary with the one you ran.
2. **`itty init`** asks for the hostname, the listen address and the certificate paths, and writes `itty.toml`. You can pass them as flags instead, for example `itty init --hostname itty.example.com --listen 10.0.0.5:9444 --tls-cert certs/fullchain.pem --tls-key certs/privkey.pem`. It refuses to overwrite an existing file unless you pass `--force`.
3. **`itty check`** verifies the setup before you start. It looks for tmux, a writable data directory, a listen address that belongs to this machine and is free, a certificate that covers the hostname and is not close to expiry, the key file permissions, and a DNS record that matches the listen address. It exits with an error if a check fails.
4. **`itty enroll`** prints a one-time link that expires after 10 minutes. Open it on the phone to register a passkey. Run it again from a shell on the VM to enroll another passkey or to recover from a lost phone.
5. **`itty serve`** starts the server. Start it outside tmux, or use `env -u TMUX itty serve`, because tmux refuses to create a nested session.

Add the page to your home screen from the browser's share menu.

## Notifications

`itty notify` sends a notification to every phone that turned notifications on.

```
itty notify Build finished
itty notify --title deploy "Rolled out to prod"
make test; itty notify "tests exited with $?"
```

To turn notifications on, open itty from the home screen, tap the session pill at the top and turn on the notifications switch below the session list. iOS then asks for permission. Notifications work only in the home-screen app, not in a Safari tab, and need iOS 16.4 or later. To turn them off, use the same switch. If you declined the permission prompt, allow itty again in Settings, Notifications.

The command sends the message through the phone's push service, which is Apple's for an iPhone. It does not need `itty serve` to be running, and the phone does not need to be on the private network to receive the notification. Opening itty from the notification still needs the private network. The VM needs outbound HTTPS access to the push service, `web.push.apple.com` for an iPhone. The message is encrypted end to end, so the push service cannot read it, but iOS shows it on the lock screen without FaceID, so keep secrets out of it.

The first use creates a key pair in `data/push-vapid.json`. The subscriptions of the phones are stored in `data/push-subscriptions.json`. When the push service reports that a subscription no longer exists, `itty notify` removes it. If you delete the key pair, every phone must turn notifications on again.

## Change a setting

`itty config` reads and changes settings without editing the file by hand.

```
itty config show
itty config get listen
itty config set listen 10.0.0.5:9445
```

`set` checks the new value before it saves it, and it refuses a value that would make the config invalid. Changes apply after a restart, so run `itty restart` if you run itty as a service. If you change the port, update the network rule that lets your phone reach it. If you change the hostname, you must run `itty enroll` again, because passkeys are tied to the hostname.

## Run it as a service

`itty service install` writes a systemd unit that starts itty at boot, restarts it if it crashes, and runs it as your user. It fills in the path of the `itty` binary you ran, the config file, and your user name. It then enables and starts the service. The command uses `sudo` for the steps that need root, and skips it when you run it as root.

```
itty service install
itty status
itty restart
itty stop
itty start
itty stop --kill-session
itty service disable
itty service uninstall
```

- `itty start`, `itty stop`, `itty restart` and `itty status` are shortcuts for `itty service start`, `stop`, `restart` and `status`. `itty service` also has `enable` and `disable`, which control whether itty starts at boot.
- `stop` leaves the tmux session running. Add `--kill-session` to end the session too.
- `uninstall` stops and disables the service and removes the unit file.
- After you rebuild the binary, run `itty restart`. If you moved the binary or the config file, run `itty service install` again.

Every command finds the config file the same way, so they work from any directory. The order is the `--config` flag (short form `-c`), then the `ITTY_CONFIG` environment variable, then `itty.toml` in the current directory, then the config file that the installed service uses.

The unit sets `KillMode=process`. Without it, systemd would also kill the tmux server when itty stops or restarts, because tmux starts inside the service, and that would end your session and everything running in it. The unit has no sandboxing options on purpose, because the shell that a login opens must have the same access as you do. Only systemd on Linux is supported.

## Certificate

itty reads the certificate and key from files and reloads them when they change, so renewing needs no restart. `itty renew-cert` gets and renews the certificate with a Let's Encrypt DNS-01 challenge.

1. Set `acme_email` in `itty.toml`, or pass `--acme-email` to `itty init`.
2. Run `itty renew-cert --accept-tos`. The `--accept-tos` flag accepts the Let's Encrypt terms of service when the account is created, and you need it only the first time.
3. The command prints a TXT record. Add it in your DNS dashboard, wait a minute, and press Enter.
4. The command writes the certificate and key to `tls_cert_file` and `tls_key_file`, both with mode 600, and reminds you to delete the TXT record.

The command renews only when 30 days or fewer remain, so you can run it as often as you like. Pass `--force` (or `-f`) to renew anyway. Let's Encrypt certificates last 90 days, and the server logs the days remaining at startup and once a day.

The default `manual` provider stores no DNS credentials on the VM, but it needs you to add the record each time. To renew without you, the project needs a provider for your DNS service. A provider is a Go package that publishes and removes one TXT record, plus one line in `cmd/itty/renew.go` that lists it. Contributions are welcome.

## Configuration

`itty init` writes these settings, and relative paths resolve against the file's directory.

| Setting | Meaning |
|---|---|
| `hostname` | The DNS name clients use. Requests for any other name get no response. |
| `listen` | The address and port to listen on. Pick a port that nothing else uses. |
| `tmux_session` | The default tmux session. The server creates it if it does not exist and attaches to it when no other session was used last. |
| `data_dir` | Where itty keeps enrolled passkeys and the enrollment link. |
| `log_file` | The structured JSON log. itty does not rotate it. |
| `tls_cert_file`, `tls_key_file` | The certificate and key. Required unless the hostname is `localhost`. |
| `acme_email` | The email for the Let's Encrypt account. Required by `renew-cert`. |
| `acme_directory` | The ACME server. Defaults to Let's Encrypt production. Use `https://acme-staging-v02.api.letsencrypt.org/directory` to test without rate limits. |
| `dns_provider` | The DNS provider that `renew-cert` uses. Defaults to `manual`. |
| `acme_propagation_wait_seconds` | If set, `renew-cert` waits this long after the record is added instead of querying the authoritative name servers. Use it if this machine cannot reach them. |

## Troubleshooting

- **The home-screen app shows a black screen or times out, but the server is running.** On iOS, iCloud Private Relay can reroute Safari and web-app traffic when the server's address is not in a standard private range (`10.0.0.0/8`, `172.16.0.0/12` or `192.168.0.0/16`), which includes some cloud VMs. Turn off Private Relay in Settings, iCloud, Private Relay, and "Limit IP Address Tracking" for your network. To check that the network path itself works, run a Shortcuts "Get contents of URL" action on `https://<hostname>:<port>/status`.

## Known limits

- Private networks only. The security audit found hardening gaps that matter once the server is reachable from the internet, such as no rate limit on `/auth/challenge`, no security headers and no HTTP read timeouts.
- Touch scrolling and selection work only while the program in the terminal has asked for mouse events, as tmux does with `set -g mouse on`. The drag sensitivity and the long-press delay are constants in `web/src/gesture.ts` and may need tuning on your phone.

## Develop the web client

The browser client is written in TypeScript in `web/src`, and `tsc` compiles each file to a plain script next to it in `web`. The compiled `web/*.js` files are committed, so `go build` needs no Node and embeds exactly what is in the repository. Do not edit those `.js` files by hand. Install the tooling once with `pnpm install`, which needs Node 22 or later and pnpm 9. Then run `pnpm build` to recompile, `pnpm typecheck` to type-check, `pnpm lint` to enforce the no-`any` and no-type-assertion rules, and `pnpm test` to compile and run the unit tests. Run `pnpm check` before you commit, because it also runs `scripts/check-web-build.sh`, which fails when a committed `web/*.js` file differs from what `pnpm build` produces.

## More

- `docs/design.md` describes the system.
- `docs/threat-model.md` lists the threats and the accepted risks.
- `docs/build-order.md` gives the order the program was built in.
