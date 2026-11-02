const Spring = (() => {
  const MAX_SUBSTEP_SECONDS = 1 / 240;
  const MAX_FRAME_SECONDS = 1 / 15;

  const presets = Object.freeze({
    press: Object.freeze({ damping: 1, response: 0.22 }),
    presence: Object.freeze({ damping: 1, response: 0.45 }),
  });

  const advance = ({ position, velocity }, target, { damping, response }, seconds) => {
    const omega = (2 * Math.PI) / response;
    const stiffness = omega * omega;
    const drag = 2 * damping * omega;
    let p = position;
    let v = velocity;
    for (let left = seconds; left > 0; left -= MAX_SUBSTEP_SECONDS) {
      const h = Math.min(left, MAX_SUBSTEP_SECONDS);
      v += (stiffness * (target - p) - drag * v) * h;
      p += v * h;
    }
    return { position: p, velocity: v };
  };

  const browserClock = () => ({
    now: () => performance.now(),
    request: (callback) => requestAnimationFrame(callback),
    cancel: (handle) => cancelAnimationFrame(handle),
  });

  const create = ({
    value = 0,
    damping = 1,
    response = 0.4,
    precision = 0.002,
    onUpdate = () => {},
    onRest = () => {},
    clock = browserClock(),
  }) => {
    const params = { damping, response };
    let state = { position: value, velocity: 0 };
    let target = value;
    let handle = null;
    let lastTime = 0;

    const settled = () => Math.abs(target - state.position) < precision && Math.abs(state.velocity) < precision;

    const tick = (time) => {
      const seconds = Math.min((time - lastTime) / 1000, MAX_FRAME_SECONDS);
      lastTime = time;
      state = advance(state, target, params, seconds);
      if (settled()) {
        state = { position: target, velocity: 0 };
        handle = null;
        onUpdate(target);
        onRest(target);
        return;
      }
      onUpdate(state.position);
      handle = clock.request(tick);
    };

    const stop = () => {
      if (handle === null) return;
      clock.cancel(handle);
      handle = null;
    };

    return {
      to(next, { velocity } = {}) {
        target = next;
        if (velocity !== undefined) state = { ...state, velocity };
        if (handle !== null) return;
        lastTime = clock.now();
        handle = clock.request(tick);
      },
      set(next) {
        stop();
        target = next;
        state = { position: next, velocity: 0 };
        onUpdate(next);
      },
      value: () => state.position,
      velocity: () => state.velocity,
    };
  };

  return { create, advance, presets };
})();

if (typeof module !== 'undefined') module.exports = Spring;
