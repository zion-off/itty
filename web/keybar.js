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

  const SYMBOL_VARIANTS = ['|', '~', '`', '\\', '-'];
  const CONTROL_VARIANTS = ['c', 'd', 'z'];
  const FLICK_REPEAT_DELAY_MS = 100;

  const create = ({ container, hintContainer, send, applicationCursorMode, keyboard, onCtrlChange = () => {} }) => {
    let ctrlActive = false;
    const flickMenu = FlickMenu.create({ host: hintContainer });

    const hint = document.createElement('div');
    hint.className = 'key-hint';
    hint.setAttribute('aria-hidden', 'true');
    hint.textContent = 'Ctrl + next key';
    const hintPresence = Presence.create({ element: hint, visible: false });

    const setCtrl = (active) => {
      ctrlActive = active;
      ctrlKey.classList.toggle('active', active);
      ctrlKey.setAttribute('aria-pressed', String(active));
      onCtrlChange(active);
      if (active) hintPresence.show();
      else hintPresence.hide();
    };

    const raiseKeyboard = () => {
      if (!keyboard.isShowing()) keyboard.show();
    };

    const sendArrow = (direction) => () => send(Keys.arrow(direction, applicationCursorMode()));

    const sendNavigation = (name) => () => send(Keys.navigation(name, applicationCursorMode()));

    const typed = (text) => ({ label: text, run: () => send(text) });

    const arrowKey = (slot, name, direction, variant) =>
      key({
        slot,
        name: `${name} arrow`,
        icon: ICONS[slot],
        arrow: true,
        repeats: true,
        onPress: sendArrow(direction),
        flick: [{ label: variant.label, run: sendNavigation(variant.navigation) }],
      });

    const ctrlKey = key({
      slot: 'ctrl',
      name: 'Control, applies to the next key',
      label: 'Ctrl',
      onPress: () => setCtrl(!ctrlActive),
      onClick: raiseKeyboard,
    });
    ctrlKey.setAttribute('aria-pressed', 'false');

    const keyboardKey = key({
      slot: 'keyboard',
      name: 'Show keyboard',
      icon: ICONS.keyboard,
      onClick: () => (keyboard.isShowing() ? keyboard.hide() : keyboard.show()),
    });
    keyboardKey.setAttribute('aria-pressed', 'false');

    hintContainer.append(hint);
    container.append(
      group('keys-main', [
        key({
          slot: 'esc',
          name: 'Escape',
          label: 'esc',
          onPress: () => send('\x1b'),
          flick: CONTROL_VARIANTS.map((letter) => ({ label: `^${letter.toUpperCase()}`, run: () => send(Keys.controlByte(letter)) })),
        }),
        key({
          slot: 'tab',
          name: 'Tab',
          icon: ICONS.tab,
          onPress: () => send('\t'),
          flick: [{ label: '⇧Tab', run: () => send(Keys.BACKTAB) }],
        }),
        ctrlKey,
        key({ slot: 'slash', name: 'Slash', label: '/', onPress: () => send('/'), flick: SYMBOL_VARIANTS.map(typed) }),
      ]),
      group('keys-arrows', [
        arrowKey('left', 'Left', 'D', { label: 'Home', navigation: 'home' }),
        arrowKey('up', 'Up', 'A', { label: 'PgUp', navigation: 'pageUp' }),
        arrowKey('down', 'Down', 'B', { label: 'PgDn', navigation: 'pageDown' }),
        arrowKey('right', 'Right', 'C', { label: 'End', navigation: 'end' }),
      ]),
      group('keys-keyboard', [keyboardKey]),
    );

    function key({ slot, name, label, icon: markup, arrow = false, repeats = false, flick = null, onPress = () => {}, onClick }) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `key key-${slot}${arrow ? ' key-arrow' : ''}`;
      el.setAttribute('aria-label', name);
      if (markup) el.innerHTML = markup;
      else el.textContent = label;

      if (flick) attachFlick(el, { name, flick, repeats, onPress });
      else attachPress(el, { repeats, onPress });
      el.addEventListener('click', (event) => {
        if (event.detail === 0) onPress();
        onClick?.();
      });
      return el;
    }

    function attachPress(el, { repeats, onPress }) {
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
    }

    function attachFlick(el, { name, flick, repeats, onPress }) {
      el.classList.add('has-flick');
      const point = (event) => ({ x: event.clientX, y: event.clientY });
      const gesture = Flick.create({
        hit: flickMenu.hit,
        repeat: repeats ? Repeat.create({ action: onPress, delayMs: FLICK_REPEAT_DELAY_MS }) : null,
        onTap: onPress,
        onOpen: () => flickMenu.show(flick.map((option) => option.label), el),
        onHighlight: flickMenu.highlight,
        onClose: flickMenu.hide,
        onSelect: (index) => {
          console.info('itty: key variant', name, flick[index].label);
          flick[index].run();
        },
      });
      Press.attach(el, { scale: PRESSED_SCALE });
      el.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        el.setPointerCapture?.(event.pointerId);
        gesture.down(point(event));
      });
      el.addEventListener('pointermove', (event) => gesture.move(point(event)));
      el.addEventListener('pointerup', (event) => gesture.up(point(event)));
      el.addEventListener('pointercancel', gesture.cancel);
    }

    return {
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
