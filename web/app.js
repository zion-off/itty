(() => {
  const term = new Terminal({ cursorBlink: true, fontSize: 14, scrollback: 0 });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.open(document.getElementById('terminal'));
  fit.fit();

  const encoder = new TextEncoder();
  let socket = null;

  function sendResize() {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    }
  }

  function connect() {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${scheme}://${location.host}/ws`);
    socket.binaryType = 'arraybuffer';
    socket.onopen = sendResize;
    socket.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(event.data));
      }
    };
    socket.onclose = () => term.write('\r\n[disconnected]\r\n');
  }

  term.onData((data) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(encoder.encode(data));
    }
  });
  term.onResize(sendResize);
  window.addEventListener('resize', () => fit.fit());

  connect();
})();
