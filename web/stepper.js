const Stepper = (() => {
  const create = ({ stepPx, maxSteps = 8 }) => {
    let pending = 0;
    const size = () => (typeof stepPx === 'function' ? stepPx() : stepPx);

    return {
      add(dy) {
        pending += dy;
        const step = size();
        const steps = Math.trunc(Math.abs(pending) / step);
        if (steps === 0) return null;
        const direction = pending > 0 ? 'up' : 'down';
        pending -= Math.sign(pending) * steps * step;
        return { direction, steps: Math.min(steps, maxSteps) };
      },
      reset() {
        pending = 0;
      },
    };
  };

  return { create };
})();

if (typeof module !== 'undefined') module.exports = Stepper;
