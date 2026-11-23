# itty design

itty is a web terminal that lets one person use their tmux sessions on a remote VM from a phone. It runs as a single Go program on the VM and serves a web app that is installed on the phone's home screen. The app requires a passkey check (for example FaceID on an iPhone) every time it comes to the foreground.

Anyone can install itty on their own VM for their own use. Each install serves one person. The first version supports a VM that is reachable only over a private network such as a VPN. It does not support exposing the server to the internet. The authentication does not depend on a private network, so that support can be added later without changing the login.

This document describes the system as designed. Anything not yet decided is listed under Open questions at the end. The threat model is in `threat-model.md` and the implementation order is in `build-order.md`.

## Terms

The operator is the person who installs itty on a VM and runs it. The operator is also the only user of that install.

## Scope

An install has one operator, one default tmux session and any number of enrolled passkeys. The phone can only operate inside a tmux session of the operator's user, because the server runs a fixed command and never starts a general shell. The operator can switch between the sessions that already exist, and the server never creates a session except the default one. iOS Safari is the client that the project tests against. WebAuthn is not specific to iOS, so other browsers with passkey support should work, but they are not a goal of the first version.

itty is not an SSH server. It does not support file transfer, port forwarding, multiple users in one install or exposure of the server to the internet. The first version also leaves out copying text to the phone's clipboard and momentum scrolling, and the design does not block adding either one later.

## Components

The itty server is a Go program that runs on the VM as the operator's own user. It serves the web client, handles passkey enrollment and login, and bridges a websocket to a pseudo-terminal (pty) running `tmux attach`.

The web client is plain HTML and JavaScript with xterm.js. The itty server serves it, and the operator installs it as a home-screen web app (PWA). It has no build step.

The itty server also provides command-line commands that the operator runs on the VM, such as `itty enroll`, `itty renew-cert` and `itty notify`.

A configuration file holds everything that differs between installs. This is the hostname, the address and port to listen on, the tmux session name, the certificate mode and file paths, the data directory and the log file location. The file is TOML.

```
phone --HTTPS--> itty server
    1. passkey login (FaceID)  -> one-time ticket
    2. websocket + ticket      -> pty running `tmux attach`
```

## Security baseline

The authentication assumes that the network is hostile. It does not depend on the VPN, so a later version can allow internet exposure without redesigning the login. In the first version the VPN is an extra layer that limits who can reach the server.

Before login, the server exposes only these endpoints (enrollment also has begin and finish endpoints that follow the same rule):

- The static client files.
- The endpoint that issues a login challenge.
- The endpoint that verifies a signed challenge.
- The status endpoint, which returns only the days until the certificate expires, for the lock screen.
- The websocket endpoint, which accepts an upgrade only with a valid ticket.
- The enrollment endpoint, which exists only while an enrollment link is active and returns not found otherwise.

The server rejects any request whose Host header or TLS server name does not match the configured hostname, before the request reaches any of these endpoints. A person who finds the server's address by scanning, without knowing the hostname, gets no response from itty. This does not stop a person who knows the hostname, so it is not a replacement for the passkey.

The server limits repeated failed attempts on the login and enrollment endpoints. It keeps the code that runs before login small, because a flaw in that code is a flaw in the only protection of a shell.

## Network and TLS

WebAuthn works only over HTTPS with a certificate that the browser trusts. itty serves TLS itself and asks a certificate source for the current certificate, so the way the certificate is obtained is configuration.

### Deployment

The operator's DNS name points to the VM's private address, and the phone must be on the private network to reach it. If the DNS provider offers a proxy, the proxy cannot be used, because it cannot reach a private address.

The first version does not support pointing the name at a public address. Supporting it later would need an automatic certificate source and a review of the code that runs before login. Both fit the existing design.

### Certificate mode

The first version reads the certificate and key from files. The server detects when the files change and loads them without a restart. `itty renew-cert` produces these files and works with any DNS provider.

A later automatic mode, in which itty obtains and renews the certificate itself, would need the server to be reachable from the internet for the verification. It therefore belongs with internet exposure. Because the server asks a certificate source for the certificate, adding it does not change the rest of the program.

### Certificate renewal

`itty renew-cert` uses the DNS-01 method, in which Let's Encrypt gives itty a value that must be published as a TXT record in the domain's DNS. The command requests a certificate and asks the configured DNS provider to publish the record. It then polls DNS until the record is visible and asks Let's Encrypt to verify it. When verification succeeds, it writes the certificate and key to disk and asks the provider to remove the record.

A DNS provider is a plugin with two operations, which are to publish a TXT record with a given name and value and to remove it. The default provider is the manual one. It prints the record name and value, waits while the operator adds the record in their DNS dashboard, and later reminds the operator to delete it. With the manual provider, no DNS credentials are stored on the VM.

A provider that publishes the record through a DNS service's API makes renewal unattended, so the operator can run it on a schedule. That provider needs a credential on the VM, and the operator decides whether that trade-off is acceptable. itty ships the manual provider first, and a provider for Cloudflare is planned as the first API-based one. The ACME client is the `lego` library. `itty renew-cert` renews only when 30 days or fewer remain, unless it is forced, and it checks that the issued certificate matches its key and covers the hostname before it replaces the files. Providers are part of the itty repository and are compiled into the program. An operator whose DNS service has no provider writes one and contributes it as a pull request, and every operator then gets it in the next release. A provider is a new package that implements the interface, plus one line where the program lists the available providers. The configuration file names the provider to use and holds that provider's settings.

If the certificate expires, the web app stops working until the operator renews it. To make that unlikely, the server logs the days until expiry at startup and once a day. The lock screen also shows the days remaining when the number is low. The operator can give the Let's Encrypt account an email address to receive expiry notices.

## Authentication

Authentication uses WebAuthn with the configured hostname as the relying party. The login requires user verification, so the phone always asks for FaceID or the equivalent. Where the passkey is stored depends on the authenticator. On an iPhone it is stored in iCloud Keychain by default.

The server stores each enrolled credential in a local file with mode 0600. The record holds the credential ID, public key, signature counter and the flags that the WebAuthn library needs to validate later logins, and nothing else about the passkey.

### Enrollment

The operator runs `itty enroll` on the VM. The command prints a one-time link that expires after 10 minutes and cannot be guessed. The token is in the link's fragment, so it never appears in a request line or a server log. The command and the server share the link through a file in the data directory, which holds only a hash of the token. The operator opens the link on the phone, which registers a passkey, and the server marks the link as used. There is no public registration page and no "forgot passkey" flow.

Enrollment is also the recovery path. If the phone is lost, the operator runs `itty enroll` again from any shell on the VM and registers a new passkey.

### Login and connection

Each connection follows the same steps.

1. The web app comes to the foreground and shows a lock screen. The terminal contents are not visible.
2. The client asks the server for a challenge. The challenge can be used once.
3. The phone asks for FaceID and signs the challenge.
4. The server verifies the signature. If it is valid, the server issues a one-time ticket that is bound to that login and expires after a short time.
5. The client opens a websocket and presents the ticket. The server accepts the upgrade only if the ticket is valid and unused, and only if the request's Origin header matches the configured hostname.
6. The server spawns the terminal session and the live terminal appears.

There are no session cookies and no long-lived login. Every websocket needs a fresh ticket, which needs a fresh FaceID check. When the connection drops for any reason, including a brief network change while the app is in the foreground, the client returns to the lock screen and the operator must pass FaceID again.

## Terminal session

For each websocket, the server starts a pty that runs `tmux new-session -A` for one session, which attaches to it and creates it when it does not exist, as the user that runs itty. When the websocket closes, the server ends that attach process. The tmux session itself keeps running, so the operator's work is not affected by dropped connections.

The server remembers the last session that a connection attached to, in a private file in the data directory. At the start of a connection it attaches to that session if it still exists, and otherwise to the default session named in the configuration. The operator can ask to switch to another session while connected. The server accepts only the default session and the names that `tmux list-sessions` reports, passes the name to tmux as one argument and never through a shell, and replaces the attach process while the websocket stays open. A switch keeps the terminal size and saves the new session as the last one.

The operator can also move between the tmux windows of a session, the ones that prefix and `c` creates and prefix and `n` or `p` move between. The server lists the windows of a session with `tmux list-windows`. It selects a window only if its id (such as `@3`) is in that list, passes the id to tmux as one argument and never through a shell, and then switches to the session if the client is not attached to it, so the session opens on the chosen window.

The operator can also create a window in a session and close one. A new window is created with `tmux new-window` in the chosen session, and the server then switches to that session if the client is not attached to it, so the new window is the one on screen. The server closes a window only if its id is in the list of that session. It refuses to close the last window of a session, because that would end the session and the server never ends sessions.

The client sends its terminal size when it connects and whenever the size changes, and the server applies it to the pty.

The pty must have XON/XOFF flow control turned off. Some operators use Ctrl+s as their tmux prefix, which is also the traditional pause key, and it must reach tmux unchanged.

## Notifications

The operator can send a notification to the phone with `itty notify`. Delivery uses Web Push, which iOS supports for home-screen web apps from iOS 16.4.

1. After login, the client asks the server for its public VAPID key over the websocket. VAPID is the key pair that identifies the sender to the push service. The server creates the key pair the first time it is needed and stores it in the data directory with mode 0600.
2. When the operator turns on the notifications switch in the session menu, the browser asks for permission and creates a subscription with the push service. The subscription is an endpoint URL and the keys that encrypt messages for this browser. The client sends it to the server over the websocket, and the server stores it in the data directory.
3. `itty notify` reads the key pair and the subscriptions, encrypts the message for each subscription and posts it to the endpoint. The push service delivers it to the phone, and the service worker of the web app shows it.
4. When the operator taps the notification, the service worker focuses or opens the web app, which shows the lock screen.

The subscription travels over the websocket because the websocket is the only channel that requires a login. The design adds no endpoint before login. `itty notify` talks to the push service directly, so it works while the server is stopped.

On every login the client sends its current subscription again, so the server recovers from a lost subscriptions file. A subscription created for a different public key is removed and the switch shows off. Turning the switch off removes the subscription in the browser first and then on the server, so a failure on the server cannot turn notifications back on at the next login. The server keeps at most 10 subscriptions and drops the oldest. When the push service answers 404 or 410 for a subscription, `itty notify` removes it.

The service worker handles only the push and notification click events. It has no fetch handler, so it does not cache or change how the app loads.

## Extension points

itty follows the SOLID principles from the start. Each part of the program that is expected to vary sits behind a small interface. The code that uses a part depends on the interface and not on a concrete implementation, and one place at startup connects the concrete parts. Adding a variant means adding an implementation, and it does not change existing code.

These parts sit behind interfaces:

- The DNS provider, which publishes and removes the TXT record for a certificate challenge. The manual provider comes first and a Cloudflare provider follows.
- The certificate source, which returns the current certificate. The files source comes first and an automatic source can follow.
- The credential store, which saves and loads enrolled passkeys. The first implementation is a local file.
- The store for one-time values, which holds challenges, tickets and enrollment links until they are used or expire. The first implementation is in memory.
- The terminal launcher, which starts the process behind a websocket. The first implementation runs `tmux attach` on a pty, and tests can use a fake one.
- The clock, so that tests can check expiry without waiting.
- The push key store, the subscription store and the sender that posts a notification to the push service. The first implementations are local files and Web Push.

Each interface has only the operations that its callers need, so an implementation is never forced to provide something it does not use. An implementation must work anywhere the interface is used. For example, every DNS provider must accept the same publish and remove calls and report failure in the same way.

## Client

### Lock screen

The client listens for the page becoming hidden and visible. When the page is hidden, the client closes the websocket. When the page becomes visible, the client shows the lock screen and starts the login steps above. The server also treats a closed websocket as the end of the session, so a missed hidden event does not leave a session open.

### Key bar

The iOS keyboard has no Ctrl, Esc, Tab or arrow keys, so the client shows a key bar. It has a sticky Ctrl key, which applies to the next key typed and sends the matching control byte. It also has Esc, Tab, `/`, Enter and the arrow keys, which repeat while held, and a key that shows or hides the iOS keyboard. Enter sends a carriage return, so the operator can confirm a prompt without raising the iOS keyboard. The keys sit in one row. The operator types the tmux prefix with the sticky Ctrl key and the next key. While the iOS keyboard is closed, the key bar collapses into a small capsule at the bottom centre that floats over the terminal. Tapping it expands it into the key row, and it collapses again after four seconds without a key press. While the iOS keyboard is open, the key row stays expanded in a flat strip above the keyboard. The operator can drag the capsule to another place on the screen. When released, it springs to the left, centre or right at the height where it was dropped, and it snaps back to the bottom centre when it lands close to it. The client stores the place in the browser, and tapping the capsule still expands the key row at the bottom.

Some keys hide extra keys that the operator reaches by dragging the key upward, or by holding it for 250 ms. A menu opens above the key, the finger slides onto an option, and lifting the finger sends it. Lifting anywhere else cancels. Esc offers `Ctrl-C`, `Ctrl-D` and `Ctrl-Z`, Tab offers `Shift-Tab`, the `/` key offers `|`, `~`, a backtick, `\` and `-`, Enter offers `Alt-Enter` and `Ctrl-J`, which add a line break in prompts that run on a plain Enter, and each arrow key offers the navigation key in its own direction (`Home`, `PgUp`, `PgDn`, `End`). A key with extra keys sends its own key when it is released after a tap, not when it is pressed. An arrow key that is held for 300 ms repeats instead of opening the menu. A key with extra keys shows a small dot in its corner.

Macro buttons are possible later, and the set of macros is an open question.

A hardware keyboard works without the key bar, because xterm.js passes its keystrokes straight to the pty.

### Session and window menu

The pill at the top of the screen shows the current session. It floats over the terminal and reserves no space. The operator can drag it in the same way as the key capsule, and it snaps back to the top centre when it lands close to it. The two pills never overlap, because the top pill stops above the key capsule and the key capsule stops below the top pill. Tapping it opens a menu with two levels. The first level lists the sessions. Tapping a session name switches to it, and tapping the arrow at the end of the row opens the second level, which lists the windows of that session with a check mark on the active one. Tapping a window selects it and switches to its session if needed. Each window row has a close button, which is hidden when the session has only one window, and the list ends with a row that creates a new window. Creating a window closes the menu so that the new window is on screen, and closing a window keeps the menu open with the refreshed list. The back row returns to the sessions. Its menu ends with a divider and the notifications switch, which is described in Notifications above. Outside the home-screen app, or when the operator has blocked notifications, the switch is disabled and a line below it says why.

### Touch layer

Many operators use tmux mouse mode, in which tmux asks the terminal to report mouse events and scrolls its own history on wheel events. xterm.js does not turn touch drags on iOS into wheel events, so the client adds a touch layer.

A vertical drag is sent to tmux as mouse-wheel events at the touch position, because tmux scrolls the pane under the pointer. A tap is sent as a mouse click, which lets tmux select panes and windows. A long press followed by a drag selects text. The terminal area disables Safari's own page scrolling so that gestures reach the touch layer.

The touch layer sends mouse events in the SGR format and acts only while the terminal program has asked for mouse events, so without tmux mouse mode a tap still just opens the keyboard. It ignores a second finger, caps the wheel events sent for one finger movement, and swallows the mouse events that iOS generates after a tap so that tmux does not receive each click twice. After a drag or a selection it suppresses the click that would otherwise open the keyboard.

The touch layer sends one wheel event for each terminal row the finger moves, which is what a desktop trackpad does. A program that scrolls one line per wheel event, such as Claude Code inside tmux, then moves with the finger. tmux's own history moves 5 lines per wheel event, so it scrolls faster than the finger, as it does on the desktop. The long press lasts 450 ms.

## Logging

The server writes structured log lines to a local file. Each websocket connection and each login attempt has an identifier that appears on every related line, so one connection can be traced from login to close.

The server logs these events:

- Enrollment link creation, use and expiry.
- Challenge issue, and each login success or failure with the reason.
- Rate limit rejections, with the source address.
- Ticket issue, use and rejection.
- Websocket open and close, with the duration, and the Origin rejections.
- Terminal process start and exit, with the exit status.
- Certificate load and reload, and the days until expiry.
- Each step of `itty renew-cert`.
- Push key creation, and each subscription that is saved, refreshed, removed or rejected.
- Each notification sent by `itty notify`, with the result for each subscription.

The server never logs ticket values, challenge values, push subscription endpoints or keys, notification text or terminal input and output. A subscription appears in the log as a short hash of its endpoint and the host of its push service.

## Open questions

- The contribution guide for new DNS providers, including the tests that every provider must pass, such as a shared set of checks against the interface.
- The default location of the configuration file. Relative paths in the file resolve against the file's directory.
- Whether the log file is rotated by itty or left to the operator.
- How the server gets permission to listen on port 443, either by a configurable port behind a reverse proxy or by a system capability.
- How an operator installs and starts itty, such as a service file or an init command, and whether the project provides one.
- Whether the VPN's DNS resolver accepts a public name that resolves to a private address. Some resolvers block this, and it has not been tested.
- The macro buttons on the key bar, if any.

## Decided values

- The ticket lasts 15 seconds and a login challenge lasts 2 minutes.
- Each source address may fail 5 times per minute on the login and enrollment endpoints. The limit counts only failures and blocks every later attempt from that address, including a valid one, until the failures age out.
- The tmux session is named `itty` by default and is created when it does not exist.
- A new enrollment adds a passkey and does not replace the existing ones.
- The lock screen shows the certificate warning when 14 days or fewer remain.

## Websocket messages

Binary frames carry terminal data in both directions. Text frames carry JSON control messages. The client sends `{"type":"resize","cols":N,"rows":N}` as its first message and again whenever the size changes. The server sends `{"type":"sessions","current":"work","sessions":["itty","work"]}` after it attaches, after every switch and in reply to a list request, and it sends it before the first output of the new session. The client asks for a change with `{"type":"switch","session":"work"}` and for a fresh list with `{"type":"list"}`. The client asks for the windows of a session with `{"type":"windows","session":"work"}`, and the server replies with `{"type":"windows","session":"work","windows":[{"id":"@1","index":0,"name":"zsh","active":true}]}`. The client selects a window with `{"type":"select","session":"work","window":"@1"}`. The client creates a window with `{"type":"new_window","session":"work"}` and closes one with `{"type":"close_window","session":"work","window":"@1"}`. The server answers a successful close, and a successful creation in the current session, with a fresh `windows` message. A creation in another session switches to it, which sends a `sessions` message. The server answers a rejected request with `{"type":"error","message":"unknown session"}` and stays in the current session. The websocket URL carries the ticket in the `ticket` query parameter, and the server never logs URLs. The client asks for the push public key with `{"type":"push_key"}`, and the server replies with `{"type":"push_key","key":"..."}`. The client sends a subscription with `{"type":"push_subscribe","subscription":{"endpoint":"https://...","keys":{"p256dh":"...","auth":"..."}}}` and removes one with `{"type":"push_unsubscribe","endpoint":"https://..."}`. The server answers both, and a failure to load the key, with `{"type":"push","subscribed":true}` or `{"type":"push","subscribed":false}`, and adds an `error` field with a short message when it rejects the request.
