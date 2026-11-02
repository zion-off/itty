interface StepperOptions {
  stepPx: number | (() => number);
  maxSteps?: number;
}

interface ScrollStep {
  direction: ScrollDirectionName;
  steps: number;
}

interface StepperInstance {
  add(dy: number): ScrollStep | null;
  reset(): void;
}

const Stepper = (() => {
  const MAX_STEPS = 8;

  const create = ({ stepPx, maxSteps = MAX_STEPS }: StepperOptions): StepperInstance => {
    let pending = 0;
    const size = () => (typeof stepPx === 'function' ? stepPx() : stepPx);

    return {
      add(dy) {
        pending += dy;
        const step = size();
        const steps = Math.trunc(Math.abs(pending) / step);
        if (steps === 0) return null;
        const direction = pending > 0 ? Mouse.ScrollDirection.up : Mouse.ScrollDirection.down;
        pending -= Math.sign(pending) * steps * step;
        return { direction, steps: Math.min(steps, maxSteps) };
      },
      reset() {
        pending = 0;
      },
    };
  };

  return { create, MAX_STEPS };
})();

if (typeof module !== 'undefined') module.exports = Stepper;
