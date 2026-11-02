const Dock = (() => {
  const IDLE_MS = 4000;

  const create = ({
    root,
    handle,
    keys,
    idleMs = IDLE_MS,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    createSpring = (options) => Spring.create({ ...Spring.presets.presence, damping: 0.82, response: 0.5, ...options }),
  }) => {
    let keyboardOpen = false;
    let userExpanded = false;
    let shown = null;
    let timer = null;

    const spring = createSpring({ value: 0, onUpdate: (value) => root.style.setProperty('--expand', value) });

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
      root.dataset.dock = next ? 'expanded' : 'collapsed';
      handle.inert = next;
      keys.inert = !next;
      handle.setAttribute('aria-expanded', String(next));
      if (first) spring.set(next ? 1 : 0);
      else spring.to(next ? 1 : 0);
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
        handle.classList.toggle('armed', armed);
        handle.setAttribute('aria-label', armed ? 'Show keys, Control is armed' : 'Show keys');
      },
      isExpanded: expanded,
    };
  };

  return { create, IDLE_MS };
})();

if (typeof module !== 'undefined') module.exports = Dock;
