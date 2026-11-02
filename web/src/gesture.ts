const GestureState = Object.freeze({
  idle: 'idle',
  pending: 'pending',
  scrolling: 'scrolling',
  selecting: 'selecting',
});

type GestureStateName = (typeof GestureState)[keyof typeof GestureState];

const GestureOutcome = Object.freeze({ none: 'none', tap: 'tap', select: 'select', scroll: 'scroll' });

type GestureOutcomeName = (typeof GestureOutcome)[keyof typeof GestureOutcome];

interface GestureTuning {
  slopPx: number;
  stepPx: number | (() => number);
  longPressMs: number;
  maxStepsPerMove: number;
}

interface GestureOptions extends Partial<GestureTuning> {
  onTap: (point: Point) => void;
  onScroll: (emission: ScrollEmission) => void;
  onSelectStart: (point: Point) => void;
  onSelectMove: (point: Point) => void;
  onSelectEnd: (point: Point) => void;
  onFling?: (velocity: number, point: Point) => void;
  onTouchStart?: () => void;
  now?: Now;
  setTimer?: SetTimer;
  clearTimer?: ClearTimer;
}

interface GestureInstance {
  down(id: number, x: number, y: number): void;
  move(id: number, x: number, y: number): void;
  up(id: number): GestureOutcomeName;
  cancel(): void;
  isActive(): boolean;
}

interface GestureSample {
  y: number;
  t: number;
}

const Gesture = (() => {
  const DEFAULTS: GestureTuning = Object.freeze({
    slopPx: 8,
    stepPx: 24,
    longPressMs: 450,
    maxStepsPerMove: Stepper.MAX_STEPS,
  });
  const FLING_WINDOW_MS = 100;

  const create = ({
    onTap,
    onScroll,
    onSelectStart,
    onSelectMove,
    onSelectEnd,
    onFling = () => {},
    onTouchStart = () => {},
    now = Dom.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    ...options
  }: GestureOptions): GestureInstance => {
    const { slopPx, stepPx, longPressMs, maxStepsPerMove } = { ...DEFAULTS, ...options };
    const stepper = Stepper.create({ stepPx, maxSteps: maxStepsPerMove });
    let state: GestureStateName = GestureState.idle;
    let pointer: number | null = null;
    let start: Point = { x: 0, y: 0 };
    let last: Point = { x: 0, y: 0 };
    let samples: GestureSample[] = [];
    let startedAt = 0;
    let timer: TimerHandle | null = null;

    const stopTimer = () => {
      if (timer !== null) clearTimer(timer);
      timer = null;
    };

    const reset = () => {
      stopTimer();
      state = GestureState.idle;
      pointer = null;
      samples = [];
      stepper.reset();
    };

    const scrollBy = (dy: number, point: Point) => {
      const step = stepper.add(dy);
      if (step) onScroll({ ...step, x: point.x, y: point.y });
    };

    const velocity = () => {
      const t = now();
      const recent = samples.filter((s) => t - s.t <= FLING_WINDOW_MS);
      const first = recent[0];
      const latest = recent[recent.length - 1];
      if (!first || !latest || first === latest) return 0;
      return latest.t === first.t ? 0 : (latest.y - first.y) / (latest.t - first.t);
    };

    return {
      down(id, x, y) {
        if (state !== GestureState.idle) return;
        onTouchStart();
        pointer = id;
        state = GestureState.pending;
        start = { x, y };
        last = { x, y };
        startedAt = now();
        timer = setTimer(() => {
          timer = null;
          state = GestureState.selecting;
          onSelectStart(last);
        }, longPressMs);
      },

      move(id, x, y) {
        if (id !== pointer) return;
        const point = { x, y };
        if (state === GestureState.pending) {
          if (Math.hypot(x - start.x, y - start.y) <= slopPx) {
            last = point;
            return;
          }
          stopTimer();
          state = GestureState.scrolling;
          last = { x: start.x, y: start.y };
          samples = [{ y: start.y, t: startedAt }];
        }
        if (state === GestureState.scrolling) {
          scrollBy(y - last.y, point);
          samples.push({ y, t: now() });
        } else if (state === GestureState.selecting) {
          onSelectMove(point);
        }
        last = point;
      },

      up(id) {
        if (id !== pointer) return GestureOutcome.none;
        const finished = state;
        const point = last;
        const flingVelocity = finished === GestureState.scrolling ? velocity() : 0;
        reset();
        if (finished === GestureState.pending) {
          onTap(point);
          return GestureOutcome.tap;
        }
        if (finished === GestureState.selecting) {
          onSelectEnd(point);
          return GestureOutcome.select;
        }
        if (finished !== GestureState.scrolling) return GestureOutcome.none;
        onFling(flingVelocity, point);
        return GestureOutcome.scroll;
      },

      cancel() {
        const wasSelecting = state === GestureState.selecting;
        const point = last;
        reset();
        if (wasSelecting) onSelectEnd(point);
      },

      isActive: () => state !== GestureState.idle,
    };
  };

  return { create, DEFAULTS };
})();

if (typeof module !== 'undefined') module.exports = Gesture;
