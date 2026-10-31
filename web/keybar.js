const KeyBar = (() => {
  const create = ({ container, send, applicationCursorMode }) => {
    let ctrlActive = false;
    let prefix = null;

    const ctrlButton = button('Ctrl', () => {
      ctrlActive = !ctrlActive;
      ctrlButton.classList.toggle('active', ctrlActive);
    });
    const prefixButton = button('Prefix', () => {
      if (prefix) send(prefix);
    });
    prefixButton.hidden = true;

    const buttons = [
      ctrlButton,
      prefixButton,
      button('Esc', () => send('\x1b')),
      button('Tab', () => send('\t')),
      button('←', () => send(Keys.arrow('D', applicationCursorMode()))),
      button('↓', () => send(Keys.arrow('B', applicationCursorMode()))),
      button('↑', () => send(Keys.arrow('A', applicationCursorMode()))),
      button('→', () => send(Keys.arrow('C', applicationCursorMode()))),
    ];
    buttons.forEach((b) => container.appendChild(b));

    function button(label, onPress) {
      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = label;
      el.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        onPress();
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
        ctrlActive = false;
        ctrlButton.classList.remove('active');
        return Keys.controlByte(data) ?? data;
      },
    };
  };

  return { create };
})();
