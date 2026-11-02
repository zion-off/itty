"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const node_assert_1 = __importDefault(require("node:assert"));
const fakeTimers = () => {
    const timers = new Map();
    let next = 1;
    return {
        setTimer: (fn, ms) => {
            timers.set(next, { fn, ms });
            return next++;
        },
        clearTimer: (id) => timers.delete(id),
        fire() {
            const entry = [...timers.entries()][0];
            if (!entry)
                throw new Error('no pending timer');
            const [id, { fn, ms }] = entry;
            timers.delete(id);
            fn();
            return ms;
        },
        pending: () => timers.size,
    };
};
const setup = () => {
    const timers = fakeTimers();
    const presses = [];
    const repeat = Repeat.create({
        action: () => presses.push(presses.length),
        delayMs: 400,
        intervalMs: 70,
        setTimer: timers.setTimer,
        clearTimer: timers.clearTimer,
    });
    return { timers, presses, repeat };
};
(0, node_test_1.default)('start acts immediately and waits for the initial delay before repeating', () => {
    const { timers, presses, repeat } = setup();
    repeat.start();
    node_assert_1.default.strictEqual(presses.length, 1);
    node_assert_1.default.strictEqual(timers.pending(), 1);
    node_assert_1.default.strictEqual(timers.fire(), 400);
    node_assert_1.default.strictEqual(presses.length, 2);
});
(0, node_test_1.default)('after the delay it repeats at the shorter interval', () => {
    const { timers, presses, repeat } = setup();
    repeat.start();
    timers.fire();
    node_assert_1.default.strictEqual(timers.fire(), 70);
    node_assert_1.default.strictEqual(timers.fire(), 70);
    node_assert_1.default.strictEqual(presses.length, 4);
});
(0, node_test_1.default)('stop cancels pending repeats', () => {
    const { timers, presses, repeat } = setup();
    repeat.start();
    timers.fire();
    repeat.stop();
    node_assert_1.default.strictEqual(timers.pending(), 0);
    node_assert_1.default.strictEqual(presses.length, 2);
});
(0, node_test_1.default)('stop without start does nothing', () => {
    const { timers, repeat } = setup();
    repeat.stop();
    node_assert_1.default.strictEqual(timers.pending(), 0);
});
(0, node_test_1.default)('starting again restarts the delay without stacking timers', () => {
    const { timers, presses, repeat } = setup();
    repeat.start();
    repeat.start();
    node_assert_1.default.strictEqual(timers.pending(), 1);
    node_assert_1.default.strictEqual(presses.length, 2);
});
