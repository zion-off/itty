(() => {
  const app = document.getElementById('app');
  const lock = document.getElementById('lock');
  const unlockButton = document.getElementById('unlock');
  const terminalElement = document.getElementById('terminal');
  const lockStatus = StatusLine.create(document.getElementById('lock-status'));
  const lockPresence = Presence.create({ element: lock, visible: true });
  const certWarning = document.getElementById('cert-warning');
  const CERT_WARNING_DAYS = 14;
  const UNLOCK_TIMEOUT_MS = 30000;

  const term = new Terminal({
    cursorBlink: true,
    fontSize: TerminalTheme.fontSize(),
    fontFamily: TerminalTheme.fontFamily,
    theme: TerminalTheme.current(),
    scrollback: 0,
  });
  TerminalTheme.onChange((theme) => {
    term.options.theme = theme;
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(terminalElement);

  const encoder = new TextEncoder();
  let socket = null;

  function sendText(data) {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(encoder.encode(data));
  }

  function sendControl(message) {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(message);
  }

  const keyboard = Keyboard.create({
    textarea: term.textarea,
    onChange: (showing) => {
      console.info('itty: keyboard', showing ? 'shown' : 'hidden');
      document.documentElement.dataset.keyboard = showing ? 'open' : 'closed';
      keyBar.setKeyboardShowing(showing);
      dock.setKeyboardOpen(showing);
    },
  });
  const dockElement = document.getElementById('keybar');
  const dockHandle = document.getElementById('dock-handle');
  const dock = Dock.create({ root: dockElement, handle: dockHandle, keys: document.getElementById('keys') });
  const keyBar = KeyBar.create({
    container: document.getElementById('keys'),
    hintContainer: dockElement,
    onCtrlChange: dock.setArmed,
    send: sendText,
    applicationCursorMode: () => term.modes.applicationCursorKeysMode,
    keyboard,
  });
  Press.attach(dockHandle, { scale: 0.92 });
  dockHandle.addEventListener('click', dock.expand);
  dockElement.addEventListener('pointerdown', dock.touch);
  const touch = Touch.create({ element: terminalElement, term, send: sendText });
  const attempts = Attempts.create({ timeoutMs: UNLOCK_TIMEOUT_MS });
  const sessions = Sessions.create();
  const switcher = Switcher.create({ root: document.getElementById('switcher'), sessions, send: sendControl });

  async function refreshCertWarning() {
    try {
      const res = await fetch('/status', { cache: 'no-store' });
      const { cert_days_remaining: days } = await res.json();
      const expiring = typeof days === 'number' && days <= CERT_WARNING_DAYS;
      certWarning.textContent = expiring ? `Certificate expires in ${days} day(s). Run itty renew-cert.` : '';
    } catch (err) {
      certWarning.textContent = '';
    }
  }

  function setLocked(locked) {
    document.body.classList.toggle('locked', locked);
    app.inert = locked;
    lock.inert = !locked;
    if (locked) lockPresence.show();
    else lockPresence.hide();
  }

  function showLock(message, tone) {
    setLocked(true);
    lockStatus.show(message, tone);
    refreshCertWarning();
  }

  function closeSocket() {
    if (socket) {
      socket.onclose = null;
      socket.close();
      socket = null;
    }
  }

  function lockDown(message, tone) {
    attempts.cancel();
    closeSocket();
    term.reset();
    switcher.reset();
    touch.reset();
    showLock(message, tone);
  }

  function sendResize() {
    sendControl(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
  }

  function handleControl(raw) {
    const update = sessions.receive(raw);
    if (!update) return;
    if (update.reset) term.reset();
    switcher.handle(update);
  }

  function connect(ticket) {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${scheme}://${location.host}/ws?ticket=${encodeURIComponent(ticket)}`);
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => {
      console.info('itty: connected');
      setLocked(false);
      fit.fit();
      sendResize();
    };
    socket.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) term.write(new Uint8Array(event.data));
      else handleControl(event.data);
    };
    socket.onclose = () => {
      console.warn('itty: connection closed');
      lockDown('Disconnected. Tap Unlock to reconnect.', 'info');
    };
  }

  function describeFailure(result) {
    if (result.status === 'timeout') return 'Unlock timed out. Tap Unlock to try again.';
    if (Focus.isNotFocusedError(result.error)) return 'Tap Unlock to continue.';
    return `Unlock failed: ${result.error.message}`;
  }

  async function unlock() {
    if (socket) return;
    lockStatus.show('Waiting for your passkey…', 'pending');
    const result = await attempts.start(async (signal) => {
      await Focus.whenFocused({ signal });
      return Passkey.login({ signal });
    });
    if (result.status === 'stale') return;
    if (result.status === 'ok') {
      connect(result.value);
    } else {
      console.warn('itty: unlock attempt ended', result.status, result.error);
      const notFocused = result.status === 'error' && Focus.isNotFocusedError(result.error);
      showLock(describeFailure(result), notFocused ? 'info' : 'error');
    }
  }

  term.onData((data) => sendText(keyBar.applyCtrl(data)));
  term.onResize(sendResize);
  function fitToViewport() {
    const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${height}px`);
    keyboard.refresh();
  }
  new ResizeObserver(() => {
    fit.fit();
    console.info('itty: terminal fitted', term.cols, 'x', term.rows);
  }).observe(terminalElement);
  window.addEventListener('resize', fitToViewport);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fitToViewport);
  Press.attach(unlockButton, { scale: 0.97 });
  unlockButton.addEventListener('click', unlock);
  terminalElement.addEventListener('click', () => {
    if (touch.ignoreClick()) return;
    if (!keyboard.isShowing()) keyboard.show();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      lockDown('');
    } else {
      unlock();
    }
  });

  fitToViewport();
  unlock();
})();
