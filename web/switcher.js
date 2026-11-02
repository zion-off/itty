const Switcher = (() => {
  const ROW_PRESSED_SCALE = 0.98;
  const PILL_PRESSED_SCALE = 0.96;
  const ERROR_VISIBLE_MS = 4000;
  const IDLE_LABEL = 'tmux';

  const CHECK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  const CHEVRON_RIGHT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  const CHEVRON_LEFT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';

  const keepFocus = (event) => event.preventDefault();

  const create = ({ root, sessions, send }) => {
    const pill = root.querySelector('.session-pill');
    const menu = root.querySelector('.session-menu');
    const scrim = root.querySelector('.session-scrim');
    const pages = root.querySelector('.session-pages');
    const sessionsPage = pages.querySelector('[data-page="sessions"]');
    const windowsPage = pages.querySelector('[data-page="windows"]');
    const status = StatusLine.create(pill);
    const presence = Presence.create({ element: menu, visible: false });
    const depth = Spring.create({
      value: 0,
      ...Spring.presets.presence,
      onUpdate: (value) => pages.style.setProperty('--depth', value),
    });
    const height = Spring.create({
      value: 0,
      ...Spring.presets.presence,
      onUpdate: (value) => pages.style.setProperty('--pages-height', `${value}px`),
    });
    let open = false;
    let drilled = null;
    let errorTimer = null;

    const showLabel = () => {
      const { current, pending } = sessions.state();
      if (pending) status.show(`Switching to ${pending}…`, 'pending');
      else status.show(current ?? IDLE_LABEL);
      pill.setAttribute('aria-label', current ? `Session ${current}, switch session` : 'Switch session');
    };

    const activePage = () => (drilled === null ? sessionsPage : windowsPage);

    const fitHeight = ({ animate }) => {
      const target = activePage().offsetHeight;
      if (animate) height.to(target);
      else height.set(target);
    };

    const showPage = ({ animate }) => {
      sessionsPage.inert = drilled !== null;
      windowsPage.inert = drilled === null;
      if (animate) depth.to(drilled === null ? 0 : 1);
      else depth.set(drilled === null ? 0 : 1);
      fitHeight({ animate });
    };

    const setOpen = (next) => {
      if (open === next) return;
      open = next;
      pill.setAttribute('aria-expanded', String(open));
      menu.inert = !open;
      scrim.hidden = !open;
      if (open) {
        drilled = null;
        renderSessions();
        showPage({ animate: false });
        presence.show();
      } else {
        presence.hide();
      }
    };

    const choose = (name) => {
      const message = sessions.switchMessage(name);
      setOpen(false);
      if (!message) return;
      console.info('itty: switching session', name);
      send(message);
      showLabel();
    };

    const button = (className, onClick) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = className;
      Press.attach(el, { scale: ROW_PRESSED_SCALE, onDown: keepFocus });
      el.addEventListener('click', onClick);
      return el;
    };

    const label = (className, text) => {
      const el = document.createElement('span');
      el.className = className;
      el.textContent = text;
      return el;
    };

    const sessionRow = (name, current) => {
      const item = document.createElement('div');
      item.className = 'session-item';
      const main = button('session-row', () => choose(name));
      main.setAttribute('role', 'menuitemradio');
      main.setAttribute('aria-checked', String(name === current));
      main.append(label('session-row-name', name));
      if (name === current) main.insertAdjacentHTML('beforeend', CHECK);
      const drill = button('session-drill', () => openWindows(name));
      drill.setAttribute('aria-label', `Windows in ${name}`);
      drill.insertAdjacentHTML('beforeend', CHEVRON_RIGHT);
      item.append(main, drill);
      return item;
    };

    const windowRow = (session, win) => {
      const el = button('session-row', () => chooseWindow(session, win.id));
      el.setAttribute('role', 'menuitemradio');
      el.setAttribute('aria-checked', String(win.active));
      el.append(label('session-row-index', String(win.index)), label('session-row-name', win.name || `window ${win.index}`));
      if (win.active) el.insertAdjacentHTML('beforeend', CHECK);
      return el;
    };

    const renderSessions = () => {
      const { current, sessions: names } = sessions.state();
      menu.setAttribute('aria-label', 'tmux sessions');
      sessionsPage.replaceChildren(...names.map((name) => sessionRow(name, current)));
    };

    const renderWindows = () => {
      const back = button('session-back', () => closeWindows());
      back.insertAdjacentHTML('beforeend', CHEVRON_LEFT);
      back.append(label('session-row-name', drilled));
      const windows = sessions.windowsOf(drilled);
      const rows = windows === null ? [label('session-empty', 'Loading…')] : windows.map((win) => windowRow(drilled, win));
      menu.setAttribute('aria-label', `tmux windows in ${drilled}`);
      windowsPage.replaceChildren(back, ...rows);
    };

    const openWindows = (name) => {
      drilled = name;
      const message = sessions.windowsMessage(name);
      if (message) send(message);
      renderWindows();
      showPage({ animate: true });
    };

    const closeWindows = () => {
      drilled = null;
      menu.setAttribute('aria-label', 'tmux sessions');
      showPage({ animate: true });
    };

    const chooseWindow = (session, id) => {
      const message = sessions.selectMessage(session, id);
      setOpen(false);
      if (!message) return;
      console.info('itty: selecting window', session, id);
      send(message);
      showLabel();
    };

    const showError = (message) => {
      console.warn('itty: session request rejected', message);
      status.show(`Could not switch: ${message}`, 'error');
      clearTimeout(errorTimer);
      errorTimer = setTimeout(showLabel, ERROR_VISIBLE_MS);
    };

    const toggle = () => {
      if (!open) send(sessions.listMessage());
      setOpen(!open);
    };

    Press.attach(pill, { scale: PILL_PRESSED_SCALE, onDown: keepFocus });
    pill.addEventListener('click', toggle);
    scrim.addEventListener('pointerdown', keepFocus);
    scrim.addEventListener('click', () => setOpen(false));
    document.addEventListener(
      'keydown',
      (event) => {
        if (!open || event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      },
      true,
    );

    return {
      handle(update) {
        if (update.type === 'error') {
          showError(update.message);
          return;
        }
        if (update.type === 'windows') {
          if (drilled === update.session) {
            renderWindows();
            fitHeight({ animate: true });
          }
          return;
        }
        clearTimeout(errorTimer);
        renderSessions();
        if (drilled !== null && !sessions.state().sessions.includes(drilled)) closeWindows();
        else fitHeight({ animate: open });
        showLabel();
        console.info('itty: session', sessions.state().current);
      },
      reset() {
        clearTimeout(errorTimer);
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
