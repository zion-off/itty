"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const node_assert_1 = __importDefault(require("node:assert"));
const harness = (options = {}) => {
    const events = [];
    let pendingTimer = null;
    const gesture = Gesture.create({
        onTap: (p) => events.push(['tap', p.x, p.y]),
        onScroll: (s) => events.push(['scroll', s.direction, s.steps]),
        onSelectStart: (p) => events.push(['selectStart', p.x, p.y]),
        onSelectMove: (p) => events.push(['selectMove', p.x, p.y]),
        onSelectEnd: (p) => events.push(['selectEnd', p.x, p.y]),
        setTimer: (fn) => {
            pendingTimer = fn;
            return 1;
        },
        clearTimer: () => {
            pendingTimer = null;
        },
        ...options,
    });
    return { gesture, events, fireTimer: () => pendingTimer && pendingTimer(), hasTimer: () => pendingTimer !== null };
};
(0, node_test_1.default)('a touch that does not move is a tap at the release position', () => {
    const { gesture, events } = harness();
    gesture.down(1, 10, 20);
    node_assert_1.default.strictEqual(gesture.up(1), 'tap');
    node_assert_1.default.deepStrictEqual(events, [['tap', 10, 20]]);
});
(0, node_test_1.default)('movement within the slop is still a tap', () => {
    const { gesture, events } = harness();
    gesture.down(1, 10, 20);
    gesture.move(1, 14, 23);
    gesture.up(1);
    node_assert_1.default.deepStrictEqual(events, [['tap', 14, 23]]);
});
(0, node_test_1.default)('dragging down sends wheel up, one step per stepPx', () => {
    const { gesture, events } = harness();
    gesture.down(1, 0, 0);
    gesture.move(1, 0, 50);
    node_assert_1.default.deepStrictEqual(events, [['scroll', 'up', 2]]);
    node_assert_1.default.strictEqual(gesture.up(1), 'scroll');
});
(0, node_test_1.default)('dragging up sends wheel down', () => {
    const { gesture, events } = harness();
    gesture.down(1, 0, 100);
    gesture.move(1, 0, 60);
    node_assert_1.default.deepStrictEqual(events, [['scroll', 'down', 1]]);
});
(0, node_test_1.default)('the remainder below one step carries over to the next move', () => {
    const { gesture, events } = harness();
    gesture.down(1, 0, 0);
    gesture.move(1, 0, 20);
    gesture.move(1, 0, 30);
    node_assert_1.default.deepStrictEqual(events, [['scroll', 'up', 1]]);
});
(0, node_test_1.default)('steps per move are capped', () => {
    const { gesture, events } = harness();
    gesture.down(1, 0, 0);
    gesture.move(1, 0, 2000);
    node_assert_1.default.deepStrictEqual(events, [['scroll', 'up', 8]]);
});
(0, node_test_1.default)('moving past the slop cancels the long press', () => {
    const { gesture, hasTimer } = harness();
    gesture.down(1, 0, 0);
    gesture.move(1, 0, 30);
    node_assert_1.default.strictEqual(hasTimer(), false);
});
(0, node_test_1.default)('holding still starts a selection, then moves drag and release ends it', () => {
    const { gesture, events, fireTimer } = harness();
    gesture.down(1, 5, 5);
    fireTimer();
    gesture.move(1, 40, 60);
    node_assert_1.default.strictEqual(gesture.up(1), 'select');
    node_assert_1.default.deepStrictEqual(events, [
        ['selectStart', 5, 5],
        ['selectMove', 40, 60],
        ['selectEnd', 40, 60],
    ]);
});
(0, node_test_1.default)('cancel during a selection releases the button', () => {
    const { gesture, events, fireTimer } = harness();
    gesture.down(1, 5, 5);
    fireTimer();
    gesture.cancel();
    node_assert_1.default.deepStrictEqual(events.at(-1), ['selectEnd', 5, 5]);
    node_assert_1.default.strictEqual(gesture.isActive(), false);
});
(0, node_test_1.default)('cancel before the long press sends nothing and stops the timer', () => {
    const { gesture, events, hasTimer } = harness();
    gesture.down(1, 5, 5);
    gesture.cancel();
    node_assert_1.default.deepStrictEqual(events, []);
    node_assert_1.default.strictEqual(hasTimer(), false);
});
(0, node_test_1.default)('a second pointer is ignored while one is active', () => {
    const { gesture, events } = harness();
    gesture.down(1, 0, 0);
    gesture.down(2, 100, 100);
    gesture.move(2, 100, 300);
    node_assert_1.default.strictEqual(gesture.up(2), 'none');
    node_assert_1.default.deepStrictEqual(events, []);
    node_assert_1.default.strictEqual(gesture.up(1), 'tap');
});
(0, node_test_1.default)('releasing a fast drag reports the release velocity in pixels per millisecond', () => {
    let clock = 0;
    const flings = [];
    const { gesture } = harness({ now: () => clock, onFling: (v) => flings.push(v) });
    gesture.down(1, 0, 0);
    for (const y of [20, 40, 60]) {
        clock += 10;
        gesture.move(1, 0, y);
    }
    gesture.up(1);
    node_assert_1.default.strictEqual(flings.length, 1);
    node_assert_1.default.ok(Math.abs((flings[0] ?? NaN) - 2) < 0.01);
});
(0, node_test_1.default)('touching down notifies so running momentum can stop', () => {
    let touched = 0;
    const { gesture } = harness({ onTouchStart: () => touched++ });
    gesture.down(1, 0, 0);
    node_assert_1.default.strictEqual(touched, 1);
});
