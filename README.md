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

## Certificate

itty reads the certificate and key from files and reloads them when they change, so renewing needs no restart. `itty renew-cert` is not built yet. Until it is, get a certificate by hand with any ACME client that supports the DNS-01 challenge. For example, with certbot:

```
certbot certonly --manual --preferred-challenges dns -d itty.example.com
```

Add the `_acme-challenge` TXT record that it asks for, then delete the record afterwards. Copy the certificate and key to the paths in `itty.toml`, and set the key file to mode 600. Let's Encrypt certificates last 90 days, and the server logs the days remaining at startup and once a day.

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

## Known limits

- Private networks only. The security audit found hardening gaps that matter once the server is reachable from the internet, such as no rate limit on `/auth/challenge`, no security headers and no HTTP read timeouts.
- The touch layer for scrolling and selecting text on a phone is not built.
- There is no service file. Run `itty serve` under your own process manager.

## More

- `docs/design.md` describes the system.
- `docs/threat-model.md` lists the threats and the accepted risks.
- `docs/build-order.md` gives the order the program was built in.
