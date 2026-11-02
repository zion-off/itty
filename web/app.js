(() => {
    const CERT_WARNING_DAYS = 14;
    const UNLOCK_TIMEOUT_MS = 30000;
    const UNLOCK_PRESSED_SCALE = 0.97;
    const DOCK_HANDLE_PRESSED_SCALE = 0.92;
    const SCREEN_SELECTOR = '.xterm-screen';
    const HALF = 2;
    const Id = Object.freeze({
        app: 'app',
        lock: 'lock',
        unlock: 'unlock',
        terminal: 'terminal',
        lockStatus: 'lock-status',
        certWarning: 'cert-warning',
        keybar: 'keybar',
        dockHandle: 'dock-handle',
        keys: 'keys',
        switcher: 'switcher',
    });
    const CssVar = Object.freeze({
        capsuleWidth: '--capsule-w',
        capsuleHeight: '--capsule-h',
        appHeight: '--app-height',
        dockOffset: (axis) => `--dock-${axis}`,
    });
    const KeyboardAttr = Object.freeze({ open: 'open', closed: 'closed' });
    const Message = Object.freeze({
        waitingForPasskey: 'Waiting for your passkey…',
        disconnected: 'Disconnected. Tap Unlock to reconnect.',
        unlockTimedOut: 'Unlock timed out. Tap Unlock to try again.',
        tapToContinue: 'Tap Unlock to continue.',
    });
    const app = Dom.byId(Id.app, HTMLElement);
    const lock = Dom.byId(Id.lock, HTMLElement);
    const unlockButton = Dom.byId(Id.unlock, HTMLElement);
    const terminalElement = Dom.byId(Id.terminal, HTMLElement);
    const lockStatus = StatusLine.create(Dom.byId(Id.lockStatus, HTMLElement));
    const lockPresence = Presence.create({ element: lock, visible: true });
    const certWarning = Dom.byId(Id.certWarning, HTMLElement);
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
    const { element: termElement, textarea: termTextarea } = term;
    if (!termElement || !termTextarea)
        throw new Error('itty: the terminal did not create its elements');
    const encoder = new TextEncoder();
    let socket = null;
    function sendText(data) {
        if (socket && socket.readyState === WebSocket.OPEN)
            socket.send(encoder.encode(data));
    }
    function sendControl(message) {
        if (socket && socket.readyState === WebSocket.OPEN)
            socket.send(message);
    }
    const keyboard = Keyboard.create({
        textarea: termTextarea,
        onChange: (showing) => {
            console.info('itty: keyboard', showing ? 'shown' : 'hidden');
            document.documentElement.dataset['keyboard'] = showing ? KeyboardAttr.open : KeyboardAttr.closed;
            keyBar.setKeyboardShowing(showing);
            dock.setKeyboardOpen(showing);
        },
    });
    const dockElement = Dom.byId(Id.keybar, HTMLElement);
    const dockHandle = Dom.byId(Id.dockHandle, HTMLElement);
    const keysElement = Dom.byId(Id.keys, HTMLElement);
    const dock = Dock.create({ root: dockElement, handle: dockHandle, keys: keysElement });
    const keyBar = KeyBar.create({
        container: keysElement,
        hintContainer: dockElement,
        onCtrlChange: dock.setArmed,
        send: sendText,
        applicationCursorMode: () => term.modes.applicationCursorKeysMode,
        keyboard,
    });
    Press.attach(dockHandle, { scale: DOCK_HANDLE_PRESSED_SCALE });
    const switcherElement = Dom.byId(Id.switcher, HTMLElement);
    const remPx = (value) => parseFloat(value) * parseFloat(getComputedStyle(document.documentElement).fontSize);
    function dockBounds() {
        const style = getComputedStyle(dockElement);
        const capsuleWidth = remPx(style.getPropertyValue(CssVar.capsuleWidth));
        const capsuleHeight = remPx(style.getPropertyValue(CssVar.capsuleHeight));
        const edge = parseFloat(getComputedStyle(switcherElement).paddingLeft);
        const reach = (app.clientWidth - capsuleWidth) / HALF - edge;
        const homeTop = app.clientHeight - parseFloat(style.bottom) - capsuleHeight;
        const topLimit = switcherElement.offsetTop + switcherElement.offsetHeight;
        return { minX: -reach, maxX: reach, minY: topLimit - homeTop, maxY: 0 };
    }
    const reposition = Reposition.create({
        handle: dockHandle,
        bounds: dockBounds,
        store: Reposition.createStore(localStorage, Reposition.STORAGE_KEY),
        onPosition: (axis, value) => Dom.setVar(dockElement, CssVar.dockOffset(axis), `${value}px`),
    });
    dockHandle.addEventListener(Dom.event.click, () => {
        if (reposition.ignoreClick())
            return;
        dock.expand();
    });
    dockElement.addEventListener(Dom.event.pointerDown, dock.touch);
    const touch = TerminalTouch.create({
        element: terminalElement,
        term,
        screen: () => Dom.query(termElement, SCREEN_SELECTOR, HTMLElement),
        send: sendText,
    });
    const attempts = Attempts.create({ timeoutMs: UNLOCK_TIMEOUT_MS });
    const sessions = Sessions.create();
    const switcher = Switcher.create({ root: switcherElement, sessions, send: sendControl });
    async function refreshCertWarning() {
        try {
            const res = await fetch('/status', { cache: 'no-store' });
            const body = await res.json();
            const days = Narrow.isRecord(body) ? body['cert_days_remaining'] : undefined;
            const expiring = typeof days === 'number' && days <= CERT_WARNING_DAYS;
            certWarning.textContent = expiring ? `Certificate expires in ${days} day(s). Run itty renew-cert.` : '';
        }
        catch (err) {
            certWarning.textContent = '';
        }
    }
    function setLocked(locked) {
        document.body.classList.toggle('locked', locked);
        app.inert = locked;
        lock.inert = !locked;
        if (locked)
            lockPresence.show();
        else
            lockPresence.hide();
    }
    function showLock(message, tone) {
        setLocked(true);
        lockStatus.show(message, tone);
        void refreshCertWarning();
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
        sendControl(JSON.stringify({ type: ControlType.resize, cols: term.cols, rows: term.rows }));
    }
    function handleControl(raw) {
        const update = sessions.receive(raw);
        if (!update)
            return;
        if (update.type === ControlType.sessions && update.reset)
            term.reset();
        switcher.handle(update);
    }
    function connect(ticket) {
        const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
        const ws = new WebSocket(`${scheme}://${location.host}/ws?ticket=${encodeURIComponent(ticket)}`);
        socket = ws;
        ws.binaryType = 'arraybuffer';
        ws.onopen = () => {
            console.info('itty: connected');
            setLocked(false);
            fit.fit();
            sendResize();
        };
        ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer)
                term.write(new Uint8Array(event.data));
            else
                handleControl(event.data);
        };
        ws.onclose = () => {
            console.warn('itty: connection closed');
            lockDown(Message.disconnected, StatusTone.info);
        };
    }
    function describeFailure(result) {
        if (result.status === AttemptStatus.timeout)
            return Message.unlockTimedOut;
        if (Focus.isNotFocusedError(result.error))
            return Message.tapToContinue;
        return `Unlock failed: ${Narrow.errorMessage(result.error)}`;
    }
    async function unlock() {
        if (socket)
            return;
        if (attempts.active()) {
            console.info('itty: unlock skipped, an attempt is already in progress');
            return;
        }
        lockStatus.show(Message.waitingForPasskey, StatusTone.pending);
        const result = await attempts.start(async (signal) => {
            await Focus.whenFocused({ signal });
            return Passkey.login({ signal });
        });
        if (result.status === AttemptStatus.stale)
            return;
        if (result.status === AttemptStatus.ok) {
            connect(result.value);
        }
        else {
            const error = result.status === AttemptStatus.error ? result.error : undefined;
            console.warn('itty: unlock attempt ended', result.status, error);
            const notFocused = result.status === AttemptStatus.error && Focus.isNotFocusedError(result.error);
            showLock(describeFailure(result), notFocused ? StatusTone.info : StatusTone.error);
        }
    }
    term.onData((data) => sendText(keyBar.applyCtrl(data)));
    Dictation.create({ root: termElement, textarea: termTextarea, send: (text) => term.input(text, true) });
    term.onResize(sendResize);
    function fitToViewport() {
        const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        document.documentElement.style.setProperty(CssVar.appHeight, `${height}px`);
        keyboard.refresh();
        reposition.refresh();
    }
    new ResizeObserver(() => {
        fit.fit();
        console.info('itty: terminal fitted', term.cols, 'x', term.rows);
    }).observe(terminalElement);
    window.addEventListener(Dom.event.resize, fitToViewport);
    if (window.visualViewport)
        window.visualViewport.addEventListener(Dom.event.resize, fitToViewport);
    Press.attach(unlockButton, { scale: UNLOCK_PRESSED_SCALE });
    unlockButton.addEventListener(Dom.event.click, () => void unlock());
    terminalElement.addEventListener(Dom.event.click, () => {
        if (touch.ignoreClick())
            return;
        if (!keyboard.isShowing())
            keyboard.show();
    });
    document.addEventListener(Dom.event.visibilityChange, () => {
        if (document.hidden) {
            lockDown('');
        }
        else {
            void unlock();
        }
    });
    fitToViewport();
    void unlock();
})();
