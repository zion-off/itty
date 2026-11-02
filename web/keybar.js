const KeyBar = (() => {
  const create = ({ container, send, applicationCursorMode }) => {
    let ctrlActive = false;
    let prefix = null;

    const setCtrl = (active) => {
      ctrlActive = active;
      ctrlButton.classList.toggle('active', active);
      ctrlButton.setAttribute('aria-pressed', String(active));
    };

    const sendArrow = (direction) => () => send(Keys.arrow(direction, applicationCursorMode()));

    const ctrlButton = button({ label: 'Ctrl', name: 'Control, applies to the next key' }, () => setCtrl(!ctrlActive));
    ctrlButton.setAttribute('aria-pressed', 'false');
    const prefixButton = button({ label: 'Prefix', name: 'tmux prefix' }, () => {
      if (prefix) send(prefix);
    });
    prefixButton.hidden = true;

    const buttons = [
      ctrlButton,
      prefixButton,
      button({ label: 'Esc', name: 'Escape' }, () => send('\x1b')),
      button({ label: 'Tab', name: 'Tab' }, () => send('\t')),
      button({ label: '←', name: 'Left arrow', arrow: true }, sendArrow('D')),
      button({ label: '↓', name: 'Down arrow', arrow: true }, sendArrow('B')),
      button({ label: '↑', name: 'Up arrow', arrow: true }, sendArrow('A')),
      button({ label: '→', name: 'Right arrow', arrow: true }, sendArrow('C')),
    ];
    buttons.forEach((b) => container.appendChild(b));

    function button({ label, name, arrow = false }, onPress) {
      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = label;
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
      });
      return el;
    }

    return {
      setPrefix(value) {
        prefix = Keys.prefixBytes(value);
        prefixButton.hidden = !prefix;
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
