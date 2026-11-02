const Gesture = (() => {
  const DEFAULTS = { slopPx: 8, stepPx: 24, longPressMs: 450, maxStepsPerMove: 8 };

  const create = ({ onTap, onScroll, onSelectStart, onSelectMove, onSelectEnd, setTimer = setTimeout, clearTimer = clearTimeout, ...options }) => {
    const { slopPx, stepPx, longPressMs, maxStepsPerMove } = { ...DEFAULTS, ...options };
    let state = 'idle';
    let pointer = null;
    let start = { x: 0, y: 0 };
    let last = { x: 0, y: 0 };
    let pending = 0;
    let timer = null;

    const stopTimer = () => {
      if (timer !== null) clearTimer(timer);
      timer = null;
    };

    const reset = () => {
      stopTimer();
      state = 'idle';
      pointer = null;
      pending = 0;
    };

    const scrollBy = (dy, point) => {
      pending += dy;
      const steps = Math.trunc(Math.abs(pending) / stepPx);
      if (steps === 0) return;
      const direction = pending > 0 ? 'up' : 'down';
      pending -= Math.sign(pending) * steps * stepPx;
      onScroll({ direction, steps: Math.min(steps, maxStepsPerMove), x: point.x, y: point.y });
    };

    return {
      down(id, x, y) {
        if (state !== 'idle') return;
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
        }
        if (state === 'scrolling') {
          scrollBy(y - last.y, point);
        } else if (state === 'selecting') {
          onSelectMove(point);
        }
        last = point;
      },

      up(id) {
        if (id !== pointer) return 'none';
        const finished = state;
        const point = last;
        reset();
        if (finished === 'pending') {
          onTap(point);
          return 'tap';
        }
        if (finished === 'selecting') {
          onSelectEnd(point);
          return 'select';
        }
        return finished === 'scrolling' ? 'scroll' : 'none';
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
