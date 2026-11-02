"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const node_assert_1 = __importDefault(require("node:assert"));
const BOUNDS = { minX: -150, maxX: 150, minY: -400, maxY: 0 };
const fakeSpring = ({ value = 0, onUpdate = () => { } }) => {
    const spring = {
        position: value,
        velocity: 0,
        target: null,
        value: () => spring.position,
        set: (next) => {
            spring.position = next;
            spring.target = null;
            onUpdate(next);
        },
        to: (next, options = {}) => {
            spring.target = next;
            spring.velocity = options.velocity ?? 0;
        },
    };
    return spring;
};
const fakeStore = (initial = null) => ({
    saved: initial,
    load() {
        return this.saved;
    },
    save(placement) {
        this.saved = placement;
    },
});
const setup = ({ stored = null, bounds = BOUNDS } = {}) => {
    const listeners = new Map();
    const captured = [];
    const handle = {
        captured,
        addEventListener: (type, fn) => listeners.set(type, fn),
        setPointerCapture: (id) => captured.push(id),
    };
    const springs = [];
    const positions = [];
    let time = 0;
    const store = fakeStore(stored);
    const reposition = Reposition.create({
        name: 'dock',
        handle,
        bounds: () => bounds,
        store,
        onPosition: (axis, value) => positions.push([axis, value]),
        createSpring: (options) => {
            const spring = fakeSpring(options);
            springs.push(spring);
            return spring;
        },
        now: () => time,
        log: () => { },
    });
    const [springX, springY] = springs;
    if (!springX || !springY)
        throw new Error('the springs were not created');
    const fire = (type, clientX, clientY, extra = {}) => {
        const listener = listeners.get(type);
        if (!listener)
            throw new Error(`no ${type} listener`);
        listener({ pointerId: 1, isPrimary: true, clientX, clientY, ...extra });
    };
    const drag = (path, stepMs = 16) => path.forEach(([x, y]) => {
        time += stepMs;
        fire('pointermove', x, y);
    });
    return { reposition, handle, springX, springY, store, fire, drag, positions, advance: (ms) => (time += ms) };
};
(0, node_test_1.default)('starts at the saved anchor and height', () => {
    const { springX, springY } = setup({ stored: { anchor: 'right', y: -120 } });
    node_assert_1.default.strictEqual(springX.position, 150);
    node_assert_1.default.strictEqual(springY.position, -120);
});
(0, node_test_1.default)('starts at the bottom center without a saved position', () => {
    const { springX, springY } = setup();
    node_assert_1.default.strictEqual(springX.position, 0);
    node_assert_1.default.strictEqual(springY.position, 0);
});
(0, node_test_1.default)('a saved height outside the screen is clamped', () => {
    const { springY } = setup({ stored: { anchor: 'left', y: -9000 } });
    node_assert_1.default.strictEqual(springY.position, -400);
});
(0, node_test_1.default)('a tap that barely moves is not a drag', () => {
    const { fire, drag, springX, reposition } = setup();
    fire('pointerdown', 100, 100);
    drag([[103, 104]]);
    fire('pointerup', 103, 104);
    node_assert_1.default.strictEqual(springX.position, 0);
    node_assert_1.default.strictEqual(reposition.ignoreClick(), false);
});
(0, node_test_1.default)('a drag follows the finger and captures the pointer', () => {
    const { fire, drag, springX, springY, handle } = setup();
    fire('pointerdown', 200, 500);
    drag([[190, 480], [150, 440]]);
    node_assert_1.default.strictEqual(springX.position, -50);
    node_assert_1.default.strictEqual(springY.position, -60);
    node_assert_1.default.deepStrictEqual(handle.captured, [1]);
});
(0, node_test_1.default)('dragging past the edge resists', () => {
    const { fire, drag, springX } = setup();
    fire('pointerdown', 0, 0);
    drag([[100, 0], [250, 0]]);
    node_assert_1.default.strictEqual(springX.position, 150 + 100 * 0.35);
});
(0, node_test_1.default)('releasing springs to the nearest anchor and keeps the finger velocity', () => {
    const { fire, drag, springX, springY } = setup();
    fire('pointerdown', 0, 0);
    drag([[40, -10], [80, -20]]);
    fire('pointerup', 80, -20);
    node_assert_1.default.strictEqual(springX.target, 150);
    node_assert_1.default.strictEqual(springX.velocity, 2500);
    node_assert_1.default.strictEqual(springY.target, -20 + (-10 / 0.016) * 0.18);
});
(0, node_test_1.default)('a slow drag settles at the anchor closest to where it stopped', () => {
    const { fire, drag, advance, springX } = setup();
    fire('pointerdown', 0, 0);
    drag([[-30, -150], [-60, -150]]);
    advance(500);
    drag([[-60, -150]]);
    fire('pointerup', -60, -150);
    node_assert_1.default.strictEqual(springX.target, 0);
});
(0, node_test_1.default)('letting go near the bottom center snaps back to the default spot', () => {
    const { fire, drag, advance, springX, springY, store } = setup({ stored: { anchor: 'right', y: -200 } });
    fire('pointerdown', 0, 0);
    drag([[-100, 100], [-130, 200], [-150, 200]]);
    advance(500);
    drag([[-150, 200]]);
    fire('pointerup', -150, 200);
    node_assert_1.default.strictEqual(springX.target, 0);
    node_assert_1.default.strictEqual(springY.target, 0);
    node_assert_1.default.deepStrictEqual(store.saved, { anchor: 'center', y: 0 });
});
(0, node_test_1.default)('letting go in the middle of the screen does not snap home', () => {
    const { fire, drag, advance, springY } = setup();
    fire('pointerdown', 0, 0);
    drag([[0, -100], [0, -200]]);
    advance(500);
    drag([[0, -200]]);
    fire('pointerup', 0, -200);
    node_assert_1.default.strictEqual(springY.target, -200);
});
(0, node_test_1.default)('the height stays inside the allowed range', () => {
    const { fire, drag, springY } = setup();
    fire('pointerdown', 0, 0);
    drag([[0, -300], [0, -900]]);
    fire('pointerup', 0, -900);
    node_assert_1.default.strictEqual(springY.target, -400);
});
(0, node_test_1.default)('a release saves the anchor and the height', () => {
    const { fire, drag, store } = setup();
    fire('pointerdown', 0, 0);
    drag([[-100, -50], [-200, -50]]);
    fire('pointerup', -200, -50);
    node_assert_1.default.strictEqual(store.saved?.anchor, 'left');
    node_assert_1.default.ok(store.saved !== null && store.saved.y <= 0 && store.saved.y >= -400);
});
(0, node_test_1.default)('the click that ends a drag is ignored, but a later click is not', () => {
    const { fire, drag, advance, reposition } = setup();
    fire('pointerdown', 0, 0);
    drag([[60, 0], [120, 0]]);
    fire('pointerup', 120, 0);
    node_assert_1.default.strictEqual(reposition.ignoreClick(), true);
    advance(1000);
    node_assert_1.default.strictEqual(reposition.ignoreClick(), false);
});
(0, node_test_1.default)('a cancelled drag still settles on an anchor', () => {
    const { fire, drag, springX } = setup();
    fire('pointerdown', 0, 0);
    drag([[100, 0], [140, 0]]);
    fire('pointercancel', 140, 0);
    node_assert_1.default.strictEqual(springX.target, 150);
});
(0, node_test_1.default)('moves from another pointer are ignored', () => {
    const { fire, springX } = setup();
    fire('pointerdown', 0, 0);
    fire('pointermove', 100, 0, { pointerId: 2 });
    node_assert_1.default.strictEqual(springX.position, 0);
});
(0, node_test_1.default)('refresh re-places the dock against the new bounds', () => {
    let bounds = BOUNDS;
    const listeners = new Map();
    const springs = [];
    const reposition = Reposition.create({
        name: 'dock',
        handle: { addEventListener: (type, fn) => listeners.set(type, fn) },
        bounds: () => bounds,
        store: fakeStore({ anchor: 'right', y: 0 }),
        onPosition: () => { },
        createSpring: (options) => {
            const spring = fakeSpring(options);
            springs.push(spring);
            return spring;
        },
        log: () => { },
    });
    bounds = { ...BOUNDS, maxX: 200 };
    reposition.refresh();
    node_assert_1.default.strictEqual(springs[0]?.target, 200);
});
(0, node_test_1.default)('nearestAnchor picks left, center or right', () => {
    node_assert_1.default.strictEqual(Reposition.nearestAnchor(-140, BOUNDS), 'left');
    node_assert_1.default.strictEqual(Reposition.nearestAnchor(10, BOUNDS), 'center');
    node_assert_1.default.strictEqual(Reposition.nearestAnchor(100, BOUNDS), 'right');
});
(0, node_test_1.default)('the store round-trips a placement and rejects bad data', () => {
    const data = new Map();
    const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
    const store = Reposition.createStore(storage, 'k');
    node_assert_1.default.strictEqual(store.load(), null);
    store.save({ anchor: 'left', y: -30 });
    node_assert_1.default.deepStrictEqual(store.load(), { anchor: 'left', y: -30 });
    data.set('k', JSON.stringify({ anchor: 'top', y: 1 }));
    node_assert_1.default.strictEqual(store.load(), null);
    data.set('k', 'not json');
    node_assert_1.default.strictEqual(store.load(), null);
});
(0, node_test_1.default)('the logs name the pill that moved', () => {
    const logs = [];
    const listeners = new Map();
    Reposition.create({
        name: 'switcher',
        handle: { addEventListener: (type, fn) => listeners.set(type, fn) },
        bounds: () => BOUNDS,
        store: fakeStore(),
        onPosition: () => { },
        createSpring: (options) => fakeSpring(options),
        log: (...args) => logs.push(args.join(' ')),
    });
    const fire = (type, clientX, clientY) => listeners.get(type)?.({ pointerId: 1, clientX, clientY });
    fire('pointerdown', 0, 0);
    fire('pointermove', 60, 0);
    fire('pointerup', 60, 0);
    node_assert_1.default.ok(logs.some((line) => line.startsWith('itty: switcher drag started')));
    node_assert_1.default.ok(logs.some((line) => line.startsWith('itty: switcher moved to')));
});
