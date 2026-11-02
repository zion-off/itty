interface KeyboardTextarea {
  blur(): void;
  focus(): void;
}

interface KeyboardViewport {
  innerHeight: number;
  visualViewport?: { height: number } | null;
}

interface KeyboardOptions {
  textarea: KeyboardTextarea;
  onChange: (showing: boolean) => void;
  viewport?: KeyboardViewport;
}

interface KeyboardInstance {
  refresh(): void;
  isShowing(): boolean;
  show(): void;
  hide(): void;
}

const Keyboard = (() => {
  const MIN_KEYBOARD_HEIGHT_PX = 120;

  const isShowing = (layoutHeight: number, visibleHeight: number | undefined) =>
    typeof visibleHeight === 'number' && layoutHeight - visibleHeight > MIN_KEYBOARD_HEIGHT_PX;

  const create = ({ textarea, onChange, viewport = window }: KeyboardOptions): KeyboardInstance => {
    let showing = false;

    const refresh = () => {
      const next = isShowing(viewport.innerHeight, viewport.visualViewport?.height);
      if (next === showing) return;
      showing = next;
      onChange(showing);
    };

    return {
      refresh,
      isShowing: () => showing,
      show() {
        textarea.blur();
        textarea.focus();
      },
      hide: () => textarea.blur(),
    };
  };

  return { create, isShowing, MIN_KEYBOARD_HEIGHT_PX };
})();

if (typeof module !== 'undefined') module.exports = Keyboard;
