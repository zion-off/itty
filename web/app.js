(() => {
  const app = document.getElementById('app');
  const lock = document.getElementById('lock');
  const lockStatus = document.getElementById('lock-status');
  const unlockButton = document.getElementById('unlock');
  const certWarning = document.getElementById('cert-warning');
  const CERT_WARNING_DAYS = 14;
  const UNLOCK_TIMEOUT_MS = 30000;

  const term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: TerminalTheme.fontFamily,
    theme: TerminalTheme.current(),
    scrollback: 0,
  });
  TerminalTheme.onChange((theme) => {
    term.options.theme = theme;
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(document.getElementById('terminal'));

  const encoder = new TextEncoder();
  let socket = null;

  function sendText(data) {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(encoder.encode(data));
  }

  const keyBar = KeyBar.create({
    container: document.getElementById('keybar'),
    send: (data) => {
      sendText(data);
      term.focus();
    },
    applicationCursorMode: () => term.modes.applicationCursorKeysMode,
  });
  const attempts = Attempts.create({ timeoutMs: UNLOCK_TIMEOUT_MS });

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
  }

  function showLock(message) {
    setLocked(true);
    lockStatus.textContent = message || '';
    refreshCertWarning();
  }

  function closeSocket() {
    if (socket) {
      socket.onclose = null;
      socket.close();
      socket = null;
    }
  }

  function lockDown(message) {
    attempts.cancel();
    unlockButton.disabled = false;
    closeSocket();
    term.reset();
    showLock(message);
  }

  function sendResize() {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    }
  }

  function connect(ticket) {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${scheme}://${location.host}/ws?ticket=${encodeURIComponent(ticket)}`);
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => {
      setLocked(false);
      fit.fit();
      sendResize();
      term.focus();
    };
    socket.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(event.data));
        return;
      }
      const message = JSON.parse(event.data);
      if (message.type === 'prefix') keyBar.setPrefix(message.value);
    };
    socket.onclose = () => lockDown('Disconnected');
  }

  function describeFailure(result) {
    if (result.status === 'timeout') return 'Unlock timed out. Tap Unlock to try again.';
    return `Unlock failed: ${result.error.message}`;
  }

  async function unlock() {
    if (socket) return;
    unlockButton.disabled = true;
    lockStatus.textContent = '';
    const result = await attempts.start((signal) => Passkey.login({ signal }));
    if (result.status === 'stale') return;
    unlockButton.disabled = false;
    if (result.status === 'ok') {
      connect(result.value);
    } else {
      showLock(describeFailure(result));
    }
  }

  term.onData((data) => sendText(keyBar.applyCtrl(data)));
  term.onResize(sendResize);
  function fitToViewport() {
    const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${height}px`);
    fit.fit();
  }
  window.addEventListener('resize', fitToViewport);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fitToViewport);
  unlockButton.addEventListener('click', unlock);

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
