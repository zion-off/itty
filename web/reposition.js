const Anchor = Object.freeze({ left: 'left', center: 'center', right: 'right' });
const Reposition = (() => {
    const DRAG_PX = 8;
    const CLICK_SUPPRESS_MS = 400;
    const RUBBER_BAND = 0.35;
    const PROJECTION_SECONDS = 0.18;
    const HOME_SNAP_PX = 72;
    const VELOCITY_WINDOW_MS = 100;
    const MIN_VELOCITY_SAMPLES = 2;
    const MS_PER_SECOND = 1000;
    const STORAGE_KEY = 'itty.dock.placement';
    const SPRING_DAMPING = 0.72;
    const SPRING_RESPONSE = 0.5;
    const ANCHORS = Object.freeze(Object.values(Anchor));
    const HOME = Object.freeze({ anchor: Anchor.center, y: 0 });
    const NO_VELOCITY = Object.freeze({ x: 0, y: 0 });
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const resist = (value, min, max) => {
        if (value < min)
            return min + (value - min) * RUBBER_BAND;
        if (value > max)
            return max + (value - max) * RUBBER_BAND;
        return value;
    };
    const anchorX = (anchor, { minX, maxX }) => ({ left: minX, center: 0, right: maxX })[anchor];
    const nearestAnchor = (x, bounds) => ANCHORS.reduce((best, anchor) => Math.abs(anchorX(anchor, bounds) - x) < Math.abs(anchorX(best, bounds) - x) ? anchor : best);
    const velocityOf = (samples) => {
        const first = samples[0];
        const last = samples[samples.length - 1];
        if (samples.length < MIN_VELOCITY_SAMPLES || !first || !last)
            return NO_VELOCITY;
        const seconds = (last.t - first.t) / MS_PER_SECOND;
        if (seconds <= 0)
            return NO_VELOCITY;
        return { x: (last.x - first.x) / seconds, y: (last.y - first.y) / seconds };
    };
    const isAnchor = (value) => ANCHORS.some((anchor) => anchor === value);
    const isPlacement = (value) => Narrow.isRecord(value) &&
        isAnchor(value['anchor']) &&
        typeof value['y'] === 'number' &&
        Number.isFinite(value['y']);
    const createStore = (storage, key) => ({
        load() {
            try {
                const raw = storage.getItem(key);
                if (raw === null)
                    return null;
                const value = JSON.parse(raw);
                return isPlacement(value) ? { anchor: value.anchor, y: value.y } : null;
            }
            catch {
                return null;
            }
        },
        save(placement) {
            try {
                storage.setItem(key, JSON.stringify(placement));
            }
            catch (error) {
                console.warn('itty: dock position not saved', error);
            }
        },
    });
    const create = ({ handle, bounds, store, onPosition, createSpring = (options) => Spring.create({ ...Spring.presets.presence, damping: SPRING_DAMPING, response: SPRING_RESPONSE, ...options }), now = Dom.now, log = console.info, }) => {
        const springX = createSpring({ value: 0, onUpdate: (value) => onPosition('x', value) });
        const springY = createSpring({ value: 0, onUpdate: (value) => onPosition('y', value) });
        let placement = store.load() || HOME;
        let press = null;
        let drag = null;
        let lastDragEndAt = -Infinity;
        const restingPoint = (limits) => ({
            x: anchorX(placement.anchor, limits),
            y: clamp(placement.y, limits.minY, limits.maxY),
        });
        const settleAt = (point) => {
            springX.set(point.x);
            springY.set(point.y);
        };
        const beginDrag = (tracking, event) => {
            const limits = bounds();
            const origin = { x: springX.value(), y: springY.value() };
            springX.set(origin.x);
            springY.set(origin.y);
            handle.setPointerCapture?.(event.pointerId);
            log('itty: dock drag started');
            return { press: tracking, limits, origin };
        };
        const follow = ({ press: { start, samples }, limits, origin }, event) => {
            springX.set(resist(origin.x + event.clientX - start.x, limits.minX, limits.maxX));
            springY.set(resist(origin.y + event.clientY - start.y, limits.minY, limits.maxY));
            const t = now();
            samples.push({ t, x: springX.value(), y: springY.value() });
            const expired = () => {
                const oldest = samples[0];
                return samples.length > MIN_VELOCITY_SAMPLES && oldest !== undefined && t - oldest.t > VELOCITY_WINDOW_MS;
            };
            while (expired())
                samples.shift();
        };
        const release = ({ press: { samples }, limits }) => {
            const velocity = velocityOf(samples);
            const x = springX.value();
            const y = springY.value();
            const landing = {
                x: x + velocity.x * PROJECTION_SECONDS,
                y: clamp(y + velocity.y * PROJECTION_SECONDS, limits.minY, limits.maxY),
            };
            placement =
                Math.hypot(landing.x, landing.y) < HOME_SNAP_PX
                    ? HOME
                    : { anchor: nearestAnchor(landing.x, limits), y: landing.y };
            const target = restingPoint(limits);
            springX.to(target.x, { velocity: velocity.x });
            springY.to(target.y, { velocity: velocity.y });
            store.save(placement);
            lastDragEndAt = now();
            log('itty: dock moved to', placement.anchor, Math.round(placement.y), placement === HOME ? '(home)' : '');
        };
        handle.addEventListener(Dom.event.pointerDown, (event) => {
            if (press || event.isPrimary === false)
                return;
            press = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, samples: [] };
        });
        handle.addEventListener(Dom.event.pointerMove, (event) => {
            if (!press || event.pointerId !== press.id)
                return;
            if (!drag) {
                const moved = Math.hypot(event.clientX - press.start.x, event.clientY - press.start.y);
                if (moved < DRAG_PX)
                    return;
                drag = beginDrag(press, event);
            }
            follow(drag, event);
        });
        const end = (event) => {
            if (!press || event.pointerId !== press.id)
                return;
            if (drag)
                release(drag);
            press = null;
            drag = null;
        };
        handle.addEventListener(Dom.event.pointerUp, end);
        handle.addEventListener(Dom.event.pointerCancel, end);
        settleAt(restingPoint(bounds()));
        return {
            ignoreClick: () => now() - lastDragEndAt < CLICK_SUPPRESS_MS,
            refresh() {
                if (press)
                    return;
                const target = restingPoint(bounds());
                springX.to(target.x);
                springY.to(target.y);
            },
        };
    };
    return { create, createStore, nearestAnchor, resist, ANCHORS, STORAGE_KEY };
})();
if (typeof module !== 'undefined')
    module.exports = Reposition;
