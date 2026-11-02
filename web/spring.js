const Spring = (() => {
    const SUBSTEPS_PER_SECOND = 240;
    const MIN_FRAMES_PER_SECOND = 15;
    const MAX_SUBSTEP_SECONDS = 1 / SUBSTEPS_PER_SECOND;
    const MAX_FRAME_SECONDS = 1 / MIN_FRAMES_PER_SECOND;
    const MS_PER_SECOND = 1000;
    const FULL_TURN = Math.PI * 2;
    const DRAG_FACTOR = 2;
    const DEFAULTS = Object.freeze({ value: 0, damping: 1, response: 0.4, precision: 0.002 });
    const presets = Object.freeze({
        press: Object.freeze({ damping: 1, response: 0.22 }),
        presence: Object.freeze({ damping: 1, response: 0.45 }),
    });
    const advance = ({ position, velocity }, target, { damping, response }, seconds) => {
        const omega = FULL_TURN / response;
        const stiffness = omega * omega;
        const drag = DRAG_FACTOR * damping * omega;
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
    const create = ({ value = DEFAULTS.value, damping = DEFAULTS.damping, response = DEFAULTS.response, precision = DEFAULTS.precision, onUpdate = () => { }, onRest = () => { }, clock = browserClock(), }) => {
        const params = { damping, response };
        let state = { position: value, velocity: 0 };
        let target = value;
        let handle = null;
        let lastTime = 0;
        const settled = () => Math.abs(target - state.position) < precision && Math.abs(state.velocity) < precision;
        const tick = (time) => {
            const seconds = Math.min((time - lastTime) / MS_PER_SECOND, MAX_FRAME_SECONDS);
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
            if (handle === null)
                return;
            clock.cancel(handle);
            handle = null;
        };
        return {
            to(next, { velocity } = {}) {
                target = next;
                if (velocity !== undefined)
                    state = { ...state, velocity };
                if (handle !== null)
                    return;
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
if (typeof module !== 'undefined')
    module.exports = Spring;
