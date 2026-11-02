const KeyBar = (() => {
  const PRESSED_SCALE = 0.92;

  const icon = (paths) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

  const ICONS = {
    tab: icon('<path d="M4 12h12M12 7l5 5-5 5M20 6v12"/>'),
    up: icon('<path d="M6 15l6-6 6 6"/>'),
    down: icon('<path d="M6 9l6 6 6-6"/>'),
    left: icon('<path d="M15 6l-6 6 6 6"/>'),
    right: icon('<path d="M9 6l6 6-6 6"/>'),
    keyboard: icon(
      '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9.5 14h5"/>',
    ),
  };

  const group = (className, keys) => {
    const el = document.createElement('div');
    el.className = className;
    el.append(...keys);
    return el;
  };

  const create = ({ container, send, applicationCursorMode, keyboard }) => {
    let ctrlActive = false;
    let prefix = null;

    const hint = document.createElement('div');
    hint.className = 'key-hint';
    hint.setAttribute('aria-hidden', 'true');
    hint.textContent = 'Ctrl + next key';
    const hintPresence = Presence.create({ element: hint, visible: false });

    const setCtrl = (active) => {
      ctrlActive = active;
      ctrlKey.classList.toggle('active', active);
      ctrlKey.setAttribute('aria-pressed', String(active));
      if (active) hintPresence.show();
      else hintPresence.hide();
    };

    const raiseKeyboard = () => {
      if (!keyboard.isShowing()) keyboard.show();
    };

    const sendArrow = (direction) => () => send(Keys.arrow(direction, applicationCursorMode()));

    const arrowKey = (slot, name, direction) =>
      key({ slot, name: `${name} arrow`, icon: ICONS[slot], arrow: true, repeats: true, onPress: sendArrow(direction) });

    const ctrlKey = key({
      slot: 'ctrl',
      name: 'Control, applies to the next key',
      label: 'Ctrl',
      onPress: () => setCtrl(!ctrlActive),
      onClick: raiseKeyboard,
    });
    ctrlKey.setAttribute('aria-pressed', 'false');

    const prefixKey = key({
      slot: 'prefix',
      name: 'tmux prefix',
      label: 'Prefix',
      onPress: () => {
        if (prefix) send(prefix);
      },
      onClick: raiseKeyboard,
    });
    prefixKey.hidden = true;

    const keyboardKey = key({
      slot: 'keyboard',
      name: 'Show keyboard',
      icon: ICONS.keyboard,
      onClick: () => (keyboard.isShowing() ? keyboard.hide() : keyboard.show()),
    });
    keyboardKey.setAttribute('aria-pressed', 'false');

    container.append(
      hint,
      group('keys-main', [
        key({ slot: 'esc', name: 'Escape', label: 'esc', onPress: () => send('\x1b') }),
        key({ slot: 'tab', name: 'Tab', icon: ICONS.tab, onPress: () => send('\t') }),
        ctrlKey,
        prefixKey,
      ]),
      group('keys-arrows', [
        arrowKey('up', 'Up', 'A'),
        arrowKey('left', 'Left', 'D'),
        arrowKey('down', 'Down', 'B'),
        arrowKey('right', 'Right', 'C'),
      ]),
      group('keys-keyboard', [keyboardKey]),
    );

    function key({ slot, name, label, icon: markup, arrow = false, repeats = false, onPress = () => {}, onClick }) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `key key-${slot}${arrow ? ' key-arrow' : ''}`;
      el.setAttribute('aria-label', name);
      if (markup) el.innerHTML = markup;
      else el.textContent = label;

      const hold = repeats ? Repeat.create({ action: onPress }) : null;
      Press.attach(el, {
        scale: PRESSED_SCALE,
        onDown: (event) => {
          event.preventDefault();
          if (hold) hold.start();
          else onPress();
        },
        onUp: () => hold?.stop(),
      });
      el.addEventListener('click', (event) => {
        if (event.detail === 0) onPress();
        onClick?.();
      });
      return el;
    }

    return {
      setPrefix(value) {
        prefix = Keys.prefixBytes(value);
        prefixKey.hidden = !prefix;
      },
      setKeyboardShowing(showing) {
        keyboardKey.setAttribute('aria-pressed', String(showing));
        keyboardKey.setAttribute('aria-label', showing ? 'Hide keyboard' : 'Show keyboard');
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
