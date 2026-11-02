"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const node_assert_1 = __importDefault(require("node:assert"));
const fakeElement = () => {
    const attributes = {};
    const classes = new Set();
    return {
        dataset: {},
        inert: false,
        style: { setProperty: (name, value) => (attributes[name] = value) },
        classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)), has: (name) => classes.has(name) },
        setAttribute: (name, value) => (attributes[name] = value),
        attribute: (name) => attributes[name],
    };
};
const setup = () => {
    const timers = new Map();
    let next = 1;
    const targets = [];
    const dock = Dock.create({
        root: fakeElement(),
        handle: fakeElement(),
        keys: fakeElement(),
        idleMs: 4000,
        setTimer: (fn, ms) => (timers.set(next, { fn, ms }), next++),
        clearTimer: (id) => timers.delete(id),
        createSpring: () => ({ to: (v) => targets.push(v), set: (v) => targets.push(`set ${v}`) }),
    });
    return { dock, timers, targets, fire: () => [...timers.values()][0]?.fn() };
};
(0, node_test_1.default)('starts collapsed with the keys out of reach', () => {
    const { dock, targets } = setup();
    node_assert_1.default.strictEqual(dock.isExpanded(), false);
    node_assert_1.default.deepStrictEqual(targets, ['set 0']);
});
(0, node_test_1.default)('expanding springs open and collapses after the idle time', () => {
    const { dock, timers, targets, fire } = setup();
    dock.expand();
    node_assert_1.default.strictEqual(dock.isExpanded(), true);
    node_assert_1.default.strictEqual(targets.at(-1), 1);
    node_assert_1.default.strictEqual([...timers.values()][0]?.ms, 4000);
    fire();
    node_assert_1.default.strictEqual(dock.isExpanded(), false);
    node_assert_1.default.strictEqual(targets.at(-1), 0);
});
(0, node_test_1.default)('touching a key restarts the idle time', () => {
    const { dock, timers } = setup();
    dock.expand();
    const first = [...timers.keys()][0];
    dock.touch();
    node_assert_1.default.strictEqual(timers.size, 1);
    node_assert_1.default.notStrictEqual([...timers.keys()][0], first);
});
(0, node_test_1.default)('an open keyboard keeps the keys expanded without an idle timer', () => {
    const { dock, timers } = setup();
    dock.setKeyboardOpen(true);
    node_assert_1.default.strictEqual(dock.isExpanded(), true);
    node_assert_1.default.strictEqual(timers.size, 0);
    dock.touch();
    node_assert_1.default.strictEqual(timers.size, 0);
});
(0, node_test_1.default)('closing the keyboard returns to the capsule', () => {
    const { dock, targets } = setup();
    dock.expand();
    dock.setKeyboardOpen(true);
    dock.setKeyboardOpen(false);
    node_assert_1.default.strictEqual(dock.isExpanded(), false);
    node_assert_1.default.strictEqual(targets.at(-1), 0);
});
(0, node_test_1.default)('expand is ignored while the keyboard is open', () => {
    const { dock, targets } = setup();
    dock.setKeyboardOpen(true);
    const count = targets.length;
    dock.expand();
    node_assert_1.default.strictEqual(targets.length, count);
});
(0, node_test_1.default)('collapse cancels the idle timer', () => {
    const { dock, timers } = setup();
    dock.expand();
    dock.collapse();
    node_assert_1.default.strictEqual(timers.size, 0);
});
