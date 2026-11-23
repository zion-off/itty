const Switcher = (() => {
    const ROW_PRESSED_SCALE = 0.98;
    const PILL_PRESSED_SCALE = 0.96;
    const ERROR_VISIBLE_MS = 4000;
    const IDLE_LABEL = 'tmux';
    const ESCAPE_KEY = 'Escape';
    const STROKE_WIDTH = '2.2';
    const Selector = Object.freeze({
        pill: '.session-pill',
        menu: '.session-menu',
        scrim: '.session-scrim',
        pages: '.session-pages',
        sessionsPage: '[data-page="sessions"]',
        windowsPage: '[data-page="windows"]',
    });
    const ClassName = Object.freeze({
        item: 'session-item',
        row: 'session-row',
        rowName: 'session-row-name',
        rowIndex: 'session-row-index',
        drill: 'session-drill',
        back: 'session-back',
        empty: 'session-empty',
        newRow: 'session-row session-new',
        divider: 'session-divider',
        toggleRow: 'session-row session-toggle',
        rowText: 'session-row-text',
        rowNote: 'session-row-note',
        switchTrack: 'switch',
    });
    const Role = Object.freeze({
        radio: 'menuitemradio',
        item: 'menuitem',
        checkbox: 'menuitemcheckbox',
        separator: 'separator',
    });
    const BUSY_ATTR = 'aria-busy';
    const Text = Object.freeze({
        sessionsMenuLabel: 'tmux sessions',
        loading: 'Loading…',
        newWindow: 'New window',
        switchSession: 'Switch session',
        notifications: 'notifications',
    });
    const Var = Object.freeze({ depth: '--depth', pagesHeight: '--pages-height' });
    const CHECK = Dom.icon(STROKE_WIDTH, '<path d="M5 12.5l4.5 4.5L19 7.5"/>');
    const CHEVRON_RIGHT = Dom.icon(STROKE_WIDTH, '<path d="M9 6l6 6-6 6"/>');
    const CHEVRON_LEFT = Dom.icon(STROKE_WIDTH, '<path d="M15 6l-6 6 6 6"/>');
    const PLUS = Dom.icon(STROKE_WIDTH, '<path d="M12 5v14M5 12h14"/>');
    const CLOSE = Dom.icon(STROKE_WIDTH, '<path d="M6 6l12 12M18 6L6 18"/>');
    const keepFocus = (event) => event.preventDefault();
    const create = ({ root, sessions, notifications, send, ignoreClick = () => false }) => {
        const pill = Dom.query(root, Selector.pill, HTMLElement);
        const menu = Dom.query(root, Selector.menu, HTMLElement);
        const scrim = Dom.query(root, Selector.scrim, HTMLElement);
        const pages = Dom.query(root, Selector.pages, HTMLElement);
        const sessionsPage = Dom.query(pages, Selector.sessionsPage, HTMLElement);
        const windowsPage = Dom.query(pages, Selector.windowsPage, HTMLElement);
        const status = StatusLine.create(pill);
        const presence = Presence.create({ element: menu, visible: false });
        const depth = Spring.create({
            value: 0,
            ...Spring.presets.presence,
            onUpdate: (value) => Dom.setVar(pages, Var.depth, value),
        });
        const height = Spring.create({
            value: 0,
            ...Spring.presets.presence,
            onUpdate: (value) => Dom.setVar(pages, Var.pagesHeight, `${value}px`),
        });
        let open = false;
        let drilled = null;
        let errorTimer = null;
        const stopErrorTimer = () => {
            if (errorTimer !== null)
                clearTimeout(errorTimer);
        };
        const showLabel = () => {
            const { current, pending } = sessions.state();
            if (pending)
                status.show(`Switching to ${pending}…`, StatusTone.pending);
            else
                status.show(current ?? IDLE_LABEL);
            pill.setAttribute(Dom.attr.label, current ? `Session ${current}, switch session` : Text.switchSession);
        };
        const activePage = () => (drilled === null ? sessionsPage : windowsPage);
        const fitHeight = ({ animate }) => {
            const target = activePage().offsetHeight;
            if (animate)
                height.to(target);
            else
                height.set(target);
        };
        const showPage = ({ animate }) => {
            const depthTarget = drilled === null ? 0 : 1;
            sessionsPage.inert = drilled !== null;
            windowsPage.inert = drilled === null;
            if (animate)
                depth.to(depthTarget);
            else
                depth.set(depthTarget);
            fitHeight({ animate });
        };
        const setOpen = (next) => {
            if (open === next)
                return;
            open = next;
            pill.setAttribute(Dom.attr.expanded, String(open));
            menu.inert = !open;
            scrim.hidden = !open;
            if (open) {
                drilled = null;
                updateNotifications({ animate: false });
                renderSessions();
                showPage({ animate: false });
                presence.show();
            }
            else {
                presence.hide();
            }
        };
        const dispatch = (message, logLine, announce) => {
            setOpen(false);
            if (!message)
                return;
            logLine();
            send(message);
            announce();
        };
        const choose = (name) => {
            dispatch(sessions.switchMessage(name), () => console.info('itty: switching session', name), showLabel);
        };
        const button = (className, onClick) => {
            const el = document.createElement('button');
            el.type = 'button';
            el.className = className;
            Press.attach(el, { scale: ROW_PRESSED_SCALE, onDown: keepFocus });
            el.addEventListener(Dom.event.click, onClick);
            return el;
        };
        const label = (className, text) => {
            const el = document.createElement('span');
            el.className = className;
            el.textContent = text;
            return el;
        };
        const item = (...children) => {
            const el = document.createElement('div');
            el.className = ClassName.item;
            el.append(...children);
            return el;
        };
        const sessionRow = (name, current) => {
            const main = button(ClassName.row, () => choose(name));
            main.setAttribute(Dom.attr.role, Role.radio);
            main.setAttribute(Dom.attr.checked, String(name === current));
            main.append(label(ClassName.rowName, name));
            if (name === current)
                main.insertAdjacentHTML('beforeend', CHECK);
            const drill = button(ClassName.drill, () => openWindows(name));
            drill.setAttribute(Dom.attr.label, `Windows in ${name}`);
            drill.insertAdjacentHTML('beforeend', CHEVRON_RIGHT);
            return item(main, drill);
        };
        const windowName = (win) => win.name || `window ${win.index}`;
        const windowRow = (session, win, closable) => {
            const main = button(ClassName.row, () => chooseWindow(session, win.id));
            main.setAttribute(Dom.attr.role, Role.radio);
            main.setAttribute(Dom.attr.checked, String(win.active));
            main.append(label(ClassName.rowIndex, String(win.index)), label(ClassName.rowName, windowName(win)));
            if (win.active)
                main.insertAdjacentHTML('beforeend', CHECK);
            const el = item(main);
            if (closable) {
                const close = button(ClassName.drill, () => closeWindow(session, win));
                close.setAttribute(Dom.attr.label, `Close ${windowName(win)}`);
                close.insertAdjacentHTML('beforeend', CLOSE);
                el.append(close);
            }
            return el;
        };
        const newWindowRow = (session) => {
            const el = button(ClassName.newRow, () => createWindow(session));
            el.setAttribute(Dom.attr.role, Role.item);
            el.insertAdjacentHTML('beforeend', PLUS);
            el.append(label(ClassName.rowName, Text.newWindow));
            return el;
        };
        const divider = () => {
            const el = document.createElement('div');
            el.className = ClassName.divider;
            el.setAttribute(Dom.attr.role, Role.separator);
            return el;
        };
        const notificationsDivider = divider();
        const notificationsNote = label(ClassName.rowNote, '');
        const notificationsTrack = label(ClassName.switchTrack, '');
        notificationsTrack.setAttribute(Dom.attr.hidden, 'true');
        const notificationsText = document.createElement('span');
        notificationsText.className = ClassName.rowText;
        notificationsText.append(label(ClassName.rowName, Text.notifications), notificationsNote);
        const notificationsRow = document.createElement('button');
        notificationsRow.type = 'button';
        notificationsRow.className = ClassName.toggleRow;
        notificationsRow.setAttribute(Dom.attr.role, Role.checkbox);
        notificationsRow.append(notificationsText, notificationsTrack);
        notificationsRow.addEventListener(Dom.event.pointerDown, keepFocus);
        notificationsRow.addEventListener(Dom.event.click, () => notifications.toggle());
        const notificationsSwitch = Toggle.create({ root: notificationsRow, track: notificationsTrack, checked: false });
        const updateNotifications = ({ animate }) => {
            const { checked, enabled, busy, note } = notifications.state();
            notificationsRow.setAttribute(Dom.attr.checked, String(checked));
            notificationsRow.setAttribute(BUSY_ATTR, String(busy));
            notificationsRow.disabled = !enabled;
            notificationsNote.textContent = note;
            notificationsNote.hidden = note === '';
            notificationsSwitch.setChecked(checked, { animate });
        };
        const renderSessions = () => {
            const { current, sessions: names } = sessions.state();
            menu.setAttribute(Dom.attr.label, Text.sessionsMenuLabel);
            sessionsPage.replaceChildren(...names.map((name) => sessionRow(name, current)), notificationsDivider, notificationsRow);
        };
        const renderWindows = (session) => {
            const back = button(ClassName.back, () => closeWindows());
            back.insertAdjacentHTML('beforeend', CHEVRON_LEFT);
            back.append(label(ClassName.rowName, session));
            const windows = sessions.windowsOf(session);
            const rows = windows === null
                ? [label(ClassName.empty, Text.loading)]
                : [...windows.map((win) => windowRow(session, win, windows.length > 1)), newWindowRow(session)];
            menu.setAttribute(Dom.attr.label, `tmux windows in ${session}`);
            windowsPage.replaceChildren(back, ...rows);
        };
        const openWindows = (name) => {
            drilled = name;
            const message = sessions.windowsMessage(name);
            if (message)
                send(message);
            renderWindows(name);
            showPage({ animate: true });
        };
        const closeWindows = () => {
            drilled = null;
            menu.setAttribute(Dom.attr.label, Text.sessionsMenuLabel);
            showPage({ animate: true });
        };
        const chooseWindow = (session, id) => {
            dispatch(sessions.selectMessage(session, id), () => console.info('itty: selecting window', session, id), showLabel);
        };
        const createWindow = (session) => {
            dispatch(sessions.newWindowMessage(session), () => console.info('itty: creating window', session), showLabel);
        };
        const closeWindow = (session, win) => {
            const message = sessions.closeWindowMessage(session, win.id);
            if (!message)
                return;
            console.info('itty: closing window', session, win.id);
            send(message);
        };
        const showError = (message) => {
            console.warn('itty: session request rejected', message);
            status.show(message.charAt(0).toUpperCase() + message.slice(1), StatusTone.error);
            stopErrorTimer();
            errorTimer = setTimeout(showLabel, ERROR_VISIBLE_MS);
        };
        const toggle = () => {
            if (!open)
                send(sessions.listMessage());
            setOpen(!open);
        };
        Press.attach(pill, { scale: PILL_PRESSED_SCALE, onDown: keepFocus });
        pill.addEventListener(Dom.event.click, () => {
            if (ignoreClick())
                return;
            toggle();
        });
        scrim.addEventListener(Dom.event.pointerDown, keepFocus);
        scrim.addEventListener(Dom.event.click, () => setOpen(false));
        document.addEventListener(Dom.event.keyDown, (event) => {
            if (!open || event.key !== ESCAPE_KEY)
                return;
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
        }, true);
        return {
            handle(update) {
                if (update.type === ControlType.error) {
                    showError(update.message);
                    return;
                }
                if (update.type === ControlType.windows) {
                    if (drilled === update.session) {
                        renderWindows(update.session);
                        fitHeight({ animate: true });
                    }
                    return;
                }
                stopErrorTimer();
                renderSessions();
                if (drilled !== null && !sessions.state().sessions.includes(drilled))
                    closeWindows();
                else
                    fitHeight({ animate: open });
                showLabel();
                console.info('itty: session', sessions.state().current);
            },
            refreshNotifications() {
                updateNotifications({ animate: open });
                if (open && drilled === null)
                    fitHeight({ animate: true });
            },
            reset() {
                stopErrorTimer();
                sessions.forget();
                setOpen(false);
                drilled = null;
                sessionsPage.replaceChildren();
                windowsPage.replaceChildren();
                showLabel();
            },
        };
    };
    return { create };
})();
