(() => {
  const lock = document.getElementById('lock');
  const lockStatus = document.getElementById('lock-status');
  const unlockButton = document.getElementById('unlock');
  const certWarning = document.getElementById('cert-warning');
  const CERT_WARNING_DAYS = 14;

  const term = new Terminal({ cursorBlink: true, fontSize: 14, scrollback: 0 });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(document.getElementById('terminal'));

  const encoder = new TextEncoder();
  let socket = null;
  let unlocking = false;

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

  function showLock(message) {
    lock.hidden = false;
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
      lock.hidden = true;
      fit.fit();
      sendResize();
      term.focus();
    };
    socket.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) term.write(new Uint8Array(event.data));
    };
    socket.onclose = () => lockDown('Disconnected');
  }

  async function unlock() {
    if (unlocking || socket) return;
    unlocking = true;
    unlockButton.disabled = true;
    lockStatus.textContent = '';
    try {
      connect(await Passkey.login());
    } catch (err) {
      showLock(`Unlock failed: ${err.message}`);
    } finally {
      unlocking = false;
      unlockButton.disabled = false;
    }
  }

  term.onData((data) => {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(encoder.encode(data));
  });
  term.onResize(sendResize);
  window.addEventListener('resize', () => fit.fit());
  unlockButton.addEventListener('click', unlock);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      lockDown('');
    } else {
      unlock();
    }
  });

  fit.fit();
  unlock();
})();
