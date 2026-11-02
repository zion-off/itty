const Switcher = (() => {
  const ROW_PRESSED_SCALE = 0.98;
  const PILL_PRESSED_SCALE = 0.96;
  const ERROR_VISIBLE_MS = 4000;
  const IDLE_LABEL = 'tmux';

  const CHECK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  const keepFocus = (event) => event.preventDefault();

  const create = ({ root, sessions, send }) => {
    const pill = root.querySelector('.session-pill');
    const menu = root.querySelector('.session-menu');
    const scrim = root.querySelector('.session-scrim');
    const status = StatusLine.create(pill);
    const presence = Presence.create({ element: menu, visible: false });
    let open = false;
    let errorTimer = null;

    const showLabel = () => {
      const { current, pending } = sessions.state();
      if (pending) status.show(`Switching to ${pending}…`, 'pending');
      else status.show(current ?? IDLE_LABEL);
      pill.setAttribute('aria-label', current ? `Session ${current}, switch session` : 'Switch session');
    };

    const setOpen = (next) => {
      if (open === next) return;
      open = next;
      pill.setAttribute('aria-expanded', String(open));
      menu.inert = !open;
      scrim.hidden = !open;
      if (open) presence.show();
      else presence.hide();
    };

    const choose = (name) => {
      const message = sessions.switchMessage(name);
      setOpen(false);
      if (!message) return;
      console.info('itty: switching session', name);
      send(message);
      showLabel();
    };

    const row = (name, current) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'session-row';
      el.setAttribute('role', 'menuitemradio');
      el.setAttribute('aria-checked', String(name === current));
      const label = document.createElement('span');
      label.className = 'session-row-name';
      label.textContent = name;
      el.append(label);
      if (name === current) el.insertAdjacentHTML('beforeend', CHECK);
      Press.attach(el, { scale: ROW_PRESSED_SCALE, onDown: keepFocus });
      el.addEventListener('click', () => choose(name));
      return el;
    };

    const renderRows = () => {
      const { current, sessions: names } = sessions.state();
      menu.replaceChildren(...names.map((name) => row(name, current)));
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
        clearTimeout(errorTimer);
        renderRows();
        showLabel();
        console.info('itty: session', sessions.state().current);
      },
      reset() {
        clearTimeout(errorTimer);
        sessions.forget();
        setOpen(false);
        menu.replaceChildren();
        showLabel();
      },
    };
  };

  return { create };
})();
