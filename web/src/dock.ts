const DockState = Object.freeze({ expanded: 'expanded', collapsed: 'collapsed' });

interface DockSurface extends StyleTarget {
  dataset: DOMStringMap;
}

interface DockHandle {
  inert: boolean;
  classList: { toggle(name: string, force: boolean): unknown };
  setAttribute(name: string, value: string): void;
}

interface DockKeys {
  inert: boolean;
}

type DockSpring = Pick<SpringInstance, 'to' | 'set'>;

interface DockOptions {
  root: DockSurface;
  handle: DockHandle;
  keys: DockKeys;
  idleMs?: number;
  setTimer?: SetTimer;
  clearTimer?: ClearTimer;
  createSpring?: (options: SpringOptions) => DockSpring;
}

interface DockInstance {
  expand: () => void;
  collapse: () => void;
  touch: () => void;
  setKeyboardOpen: (open: boolean) => void;
  setArmed: (armed: boolean) => void;
  isExpanded: () => boolean;
}

const Dock = (() => {
  const IDLE_MS = 4000;
  const EXPAND_VAR = '--expand';
  const ARMED_CLASS = 'armed';
  const SPRING_DAMPING = 0.82;
  const SPRING_RESPONSE = 0.5;
  const OPEN = 1;
  const CLOSED = 0;
  const LABEL_SHOW_KEYS = 'Show keys';
  const LABEL_SHOW_KEYS_ARMED = 'Show keys, Control is armed';

  const create = ({
    root,
    handle,
    keys,
    idleMs = IDLE_MS,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    createSpring = (options) =>
      Spring.create({ ...Spring.presets.presence, damping: SPRING_DAMPING, response: SPRING_RESPONSE, ...options }),
  }: DockOptions): DockInstance => {
    let keyboardOpen = false;
    let userExpanded = false;
    let shown: boolean | null = null;
    let timer: TimerHandle | null = null;

    const spring = createSpring({ value: CLOSED, onUpdate: (value) => Dom.setVar(root, EXPAND_VAR, value) });

    const expanded = () => keyboardOpen || userExpanded;

    const stopIdleTimer = () => {
      if (timer === null) return;
      clearTimer(timer);
      timer = null;
    };

    const startIdleTimer = () => {
      stopIdleTimer();
      if (!userExpanded || keyboardOpen) return;
      timer = setTimer(() => {
        timer = null;
        console.info('itty: keys collapsed after idle');
        collapse();
      }, idleMs);
    };

    const apply = () => {
      const next = expanded();
      startIdleTimer();
      if (next === shown) return;
      const first = shown === null;
      shown = next;
      root.dataset['dock'] = next ? DockState.expanded : DockState.collapsed;
      handle.inert = next;
      keys.inert = !next;
      handle.setAttribute(Dom.attr.expanded, String(next));
      if (first) spring.set(next ? OPEN : CLOSED);
      else spring.to(next ? OPEN : CLOSED);
    };

    function collapse() {
      userExpanded = false;
      apply();
    }

    apply();

    return {
      expand() {
        if (keyboardOpen) return;
        userExpanded = true;
        console.info('itty: keys expanded');
        apply();
      },
      collapse,
      touch: startIdleTimer,
      setKeyboardOpen(open) {
        keyboardOpen = open;
        if (open) userExpanded = false;
        apply();
      },
      setArmed(armed) {
        handle.classList.toggle(ARMED_CLASS, armed);
        handle.setAttribute(Dom.attr.label, armed ? LABEL_SHOW_KEYS_ARMED : LABEL_SHOW_KEYS);
      },
      isExpanded: expanded,
    };
  };

  return { create, IDLE_MS };
})();

if (typeof module !== 'undefined') module.exports = Dock;
