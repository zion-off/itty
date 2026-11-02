const GestureState = Object.freeze({
    idle: 'idle',
    pending: 'pending',
    scrolling: 'scrolling',
    selecting: 'selecting',
});
const GestureOutcome = Object.freeze({ none: 'none', tap: 'tap', select: 'select', scroll: 'scroll' });
const Gesture = (() => {
    const DEFAULTS = Object.freeze({
        slopPx: 8,
        stepPx: 24,
        longPressMs: 450,
        maxStepsPerMove: Stepper.MAX_STEPS,
    });
    const FLING_WINDOW_MS = 100;
    const create = ({ onTap, onScroll, onSelectStart, onSelectMove, onSelectEnd, onFling = () => { }, onTouchStart = () => { }, now = Dom.now, setTimer = setTimeout, clearTimer = clearTimeout, ...options }) => {
        const { slopPx, stepPx, longPressMs, maxStepsPerMove } = { ...DEFAULTS, ...options };
        const stepper = Stepper.create({ stepPx, maxSteps: maxStepsPerMove });
        let state = GestureState.idle;
        let pointer = null;
        let start = { x: 0, y: 0 };
        let last = { x: 0, y: 0 };
        let samples = [];
        let startedAt = 0;
        let timer = null;
        const stopTimer = () => {
            if (timer !== null)
                clearTimer(timer);
            timer = null;
        };
        const reset = () => {
            stopTimer();
            state = GestureState.idle;
            pointer = null;
            samples = [];
            stepper.reset();
        };
        const scrollBy = (dy, point) => {
            const step = stepper.add(dy);
            if (step)
                onScroll({ ...step, x: point.x, y: point.y });
        };
        const velocity = () => {
            const t = now();
            const recent = samples.filter((s) => t - s.t <= FLING_WINDOW_MS);
            const first = recent[0];
            const latest = recent[recent.length - 1];
            if (!first || !latest || first === latest)
                return 0;
            return latest.t === first.t ? 0 : (latest.y - first.y) / (latest.t - first.t);
        };
        return {
            down(id, x, y) {
                if (state !== GestureState.idle)
                    return;
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
                if (id !== pointer)
                    return;
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
                }
                else if (state === GestureState.selecting) {
                    onSelectMove(point);
                }
                last = point;
            },
            up(id) {
                if (id !== pointer)
                    return GestureOutcome.none;
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
                if (finished !== GestureState.scrolling)
                    return GestureOutcome.none;
                onFling(flingVelocity, point);
                return GestureOutcome.scroll;
            },
            cancel() {
                const wasSelecting = state === GestureState.selecting;
                const point = last;
                reset();
                if (wasSelecting)
                    onSelectEnd(point);
            },
            isActive: () => state !== GestureState.idle,
        };
    };
    return { create, DEFAULTS };
})();
if (typeof module !== 'undefined')
    module.exports = Gesture;
