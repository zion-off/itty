const Momentum = (() => {
  const FRICTION_PER_FRAME = 0.95;
  const FRAME_MS = 16;
  const MIN_START_PX_PER_MS = 0.3;
  const MIN_RUN_PX_PER_MS = 0.03;

  const create = ({ stepper, emit, raf = requestAnimationFrame, caf = cancelAnimationFrame, now = () => performance.now() }) => {
    let handle = null;

    const stop = () => {
      if (handle !== null) caf(handle);
      handle = null;
      stepper.reset();
    };

    return {
      stop,
      isRunning: () => handle !== null,
      fling(velocity, point) {
        stop();
        if (Math.abs(velocity) < MIN_START_PX_PER_MS) return;
        let v = velocity;
        let last = now();
        const frame = () => {
          const t = now();
          const dt = t - last;
          last = t;
          const step = stepper.add(v * dt);
          if (step) emit({ ...step, x: point.x, y: point.y });
          v *= Math.pow(FRICTION_PER_FRAME, dt / FRAME_MS);
          handle = Math.abs(v) < MIN_RUN_PX_PER_MS ? null : raf(frame);
        };
        handle = raf(frame);
      },
    };
  };

  return { create };
})();

if (typeof module !== 'undefined') module.exports = Momentum;
