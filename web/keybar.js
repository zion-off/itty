const KeyBar = (() => {
  const KEYBOARD_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9.5 14h5"/></svg>';

  const create = ({ container, send, applicationCursorMode, keyboard }) => {
    let ctrlActive = false;
    let prefix = null;

    const setCtrl = (active) => {
      ctrlActive = active;
      ctrlButton.classList.toggle('active', active);
      ctrlButton.setAttribute('aria-pressed', String(active));
    };

    const sendArrow = (direction) => () => send(Keys.arrow(direction, applicationCursorMode()));

    const raiseKeyboard = () => {
      if (!keyboard.isShowing()) keyboard.show();
    };

    const ctrlButton = button({ label: 'Ctrl', name: 'Control, applies to the next key', onClick: raiseKeyboard }, () =>
      setCtrl(!ctrlActive),
    );
    ctrlButton.setAttribute('aria-pressed', 'false');
    const prefixButton = button({ label: 'Prefix', name: 'tmux prefix', onClick: raiseKeyboard }, () => {
      if (prefix) send(prefix);
    });
    prefixButton.hidden = true;
    const keyboardButton = button(
      { icon: KEYBOARD_ICON, name: 'Show keyboard', onClick: () => (keyboard.isShowing() ? keyboard.hide() : keyboard.show()) },
      () => {},
    );
    keyboardButton.setAttribute('aria-pressed', 'false');

    const buttons = [
      ctrlButton,
      prefixButton,
      button({ label: 'Esc', name: 'Escape' }, () => send('\x1b')),
      button({ label: 'Tab', name: 'Tab' }, () => send('\t')),
      button({ label: '←', name: 'Left arrow', arrow: true }, sendArrow('D')),
      button({ label: '↓', name: 'Down arrow', arrow: true }, sendArrow('B')),
      button({ label: '↑', name: 'Up arrow', arrow: true }, sendArrow('A')),
      button({ label: '→', name: 'Right arrow', arrow: true }, sendArrow('C')),
      keyboardButton,
    ];
    buttons.forEach((b) => container.appendChild(b));

    function button({ label, icon, name, arrow = false, onClick }, onPress) {
      const el = document.createElement('button');
      el.type = 'button';
      if (icon) el.innerHTML = icon;
      else el.textContent = label;
      el.className = arrow ? 'key key-arrow' : 'key';
      el.setAttribute('aria-label', name);
      const release = () => el.classList.remove('pressed');
      el.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        el.classList.add('pressed');
        onPress();
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => el.addEventListener(type, release));
      el.addEventListener('click', (event) => {
        if (event.detail === 0) onPress();
        if (onClick) onClick();
      });
      return el;
    }

    return {
      setPrefix(value) {
        prefix = Keys.prefixBytes(value);
        prefixButton.hidden = !prefix;
      },
      setKeyboardShowing(showing) {
        keyboardButton.setAttribute('aria-pressed', String(showing));
        keyboardButton.setAttribute('aria-label', showing ? 'Hide keyboard' : 'Show keyboard');
      },
      applyCtrl(data) {
        if (!ctrlActive) return data;
        setCtrl(false);
        return Keys.controlByte(data) ?? data;
      },
    };
  };

  return { create };
})();
