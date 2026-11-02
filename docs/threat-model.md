# itty threat model

itty gives a live shell session to whoever completes a login, so the login is the asset being protected. This document lists who might try to get in, how the design stops them, and which risks the operator accepts. It assumes the design in `design.md`.

The first version is for a server that is reachable only over a private network such as a VPN. The model still assumes that the network is hostile, so that exposing the server to the internet can be added later without redesigning the defenses.

## What is protected

A successful login attaches to the operator's tmux session, which runs as the operator's own user on the VM. Whoever gets that session can run anything that user can run. The session also holds whatever is already on screen and in tmux's history.

## Threats and responses

| Threat | Response |
|---|---|
| A person guesses or replays a login | Challenges are single-use and the passkey signs them with a private key that does not leave the phone's secure storage. |
| A person obtains a ticket | A ticket is single-use, expires after a short time and is bound to one login, so it is of little use after the websocket opens. |
| A web page on another site opens a websocket to itty | The server rejects any websocket upgrade whose Origin header does not match the configured hostname. |
| A person finds the server by scanning addresses | The server rejects requests whose Host header or TLS server name does not match the configured hostname, so a scan by address does not reach the login page. A person who knows the hostname is not stopped by this. |
| A person floods the login or enrollment endpoints | The server limits repeated failed attempts and logs each rejection with the source address. |
| A person registers their own passkey | There is no public registration page. The enrollment endpoint exists only while an enrollment link is active, the link is one-time, short-lived and cannot be guessed, and only a person with a shell on the VM can create one. |
| A flaw in the code that runs before login | The server exposes few endpoints before login and keeps their code small. This lowers the risk and cannot remove it. |
| Someone picks up the unlocked phone | Every foreground and every reconnect needs FaceID, and the lock screen hides the terminal until then. |
| The certificate expires | The server logs the days remaining, the lock screen warns when expiry is near, and `itty renew-cert` renews it. |
| A stolen DNS provider credential | The manual provider stores none, because the operator adds the DNS record by hand. A provider that uses an API needs a credential on the VM, so the operator should limit it to editing DNS records for the one zone. |

## Network exposure

The server is reachable only over a private network, so a person outside that network cannot reach the login page. A person inside the network can reach it, but gets nothing without a passkey. The pre-login code is exposed only to people on that network.

## Internet exposure is not supported

If the server were reachable from the internet, the passkey and the pre-login code would be the only protection, and a flaw in that code would matter most. Certificate Transparency logs publish the hostname of every certificate, so scanners would find the server soon after it got one. This model does not cover that case. Adding support for it needs its own review of the threats first.

## Accepted risks

- A passkey that syncs through a cloud account, such as iCloud Keychain, is as safe as that account. Someone who takes over the account and passes its recovery checks could use the passkey. The private network is still required in addition.
- The terminal session has the operator's full privileges. The design limits what the phone can start, but it does not limit what a logged-in person can do inside tmux. A logged-in person can also switch to any other tmux session of that user, which adds no new access, because every session runs with the same privileges.
- Anyone who gets a shell on the VM can enroll a passkey. That person already has access to the operator's user, so enrollment does not add a new exposure.
- The iOS app switcher can show a snapshot of the last screen. The first version does not guard against this.

## Not covered

itty does not defend against a compromised VM, a compromised phone or a compromised VPN profile. It also does not log terminal contents, so it cannot answer what was done in a session, only when sessions started and ended.
