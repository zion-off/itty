const Gesture = (() => {
  const StepperImpl = typeof Stepper !== 'undefined' ? Stepper : require('./stepper.js');
  const DEFAULTS = { slopPx: 8, stepPx: 24, longPressMs: 450, maxStepsPerMove: 8 };
  const FLING_WINDOW_MS = 100;

  const create = ({
    onTap,
    onScroll,
    onSelectStart,
    onSelectMove,
    onSelectEnd,
    onFling = () => {},
    onTouchStart = () => {},
    now = () => performance.now(),
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    ...options
  }) => {
    const { slopPx, stepPx, longPressMs, maxStepsPerMove } = { ...DEFAULTS, ...options };
    const stepper = StepperImpl.create({ stepPx, maxSteps: maxStepsPerMove });
    let state = 'idle';
    let pointer = null;
    let start = { x: 0, y: 0 };
    let last = { x: 0, y: 0 };
    let samples = [];
    let timer = null;

    const stopTimer = () => {
      if (timer !== null) clearTimer(timer);
      timer = null;
    };

    const reset = () => {
      stopTimer();
      state = 'idle';
      pointer = null;
      samples = [];
      stepper.reset();
    };

    const scrollBy = (dy, point) => {
      const step = stepper.add(dy);
      if (step) onScroll({ ...step, x: point.x, y: point.y });
    };

    const velocity = () => {
      const t = now();
      const recent = samples.filter((s) => t - s.t <= FLING_WINDOW_MS);
      if (recent.length < 2) return 0;
      const first = recent[0];
      const latest = recent[recent.length - 1];
      return latest.t === first.t ? 0 : (latest.y - first.y) / (latest.t - first.t);
    };

    return {
      down(id, x, y) {
        if (state !== 'idle') return;
        onTouchStart();
        pointer = id;
        state = 'pending';
        start = { x, y };
        last = { x, y };
        timer = setTimer(() => {
          timer = null;
          state = 'selecting';
          onSelectStart(last);
        }, longPressMs);
      },

      move(id, x, y) {
        if (id !== pointer) return;
        const point = { x, y };
        if (state === 'pending') {
          if (Math.hypot(x - start.x, y - start.y) <= slopPx) {
            last = point;
            return;
          }
          stopTimer();
          state = 'scrolling';
          last = { x: start.x, y: start.y };
          samples = [{ y: start.y, t: now() }];
        }
        if (state === 'scrolling') {
          scrollBy(y - last.y, point);
          samples.push({ y, t: now() });
        } else if (state === 'selecting') {
          onSelectMove(point);
        }
        last = point;
      },

      up(id) {
        if (id !== pointer) return 'none';
        const finished = state;
        const point = last;
        const flingVelocity = finished === 'scrolling' ? velocity() : 0;
        reset();
        if (finished === 'pending') {
          onTap(point);
          return 'tap';
        }
        if (finished === 'selecting') {
          onSelectEnd(point);
          return 'select';
        }
        if (finished !== 'scrolling') return 'none';
        onFling(flingVelocity, point);
        return 'scroll';
      },

      cancel() {
        const wasSelecting = state === 'selecting';
        const point = last;
        reset();
        if (wasSelecting) onSelectEnd(point);
      },

      isActive: () => state !== 'idle',
    };
  };

  return { create, DEFAULTS };
})();

if (typeof module !== 'undefined') module.exports = Gesture;
