"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const node_assert_1 = __importDefault(require("node:assert"));
const harness = () => {
    let clock = 0;
    let queued = null;
    const emitted = [];
    const momentum = Momentum.create({
        stepper: Stepper.create({ stepPx: 10 }),
        emit: (e) => emitted.push(e),
        raf: (fn) => {
            queued = fn;
            return 1;
        },
        caf: () => {
            queued = null;
        },
        now: () => clock,
    });
    const frame = (ms = 16) => {
        clock += ms;
        const fn = queued;
        queued = null;
        if (fn)
            fn();
    };
    return { momentum, emitted, frame, queued: () => queued !== null };
};
(0, node_test_1.default)('a slow release does not start momentum', () => {
    const h = harness();
    h.momentum.fling(0.1, { x: 1, y: 2 });
    node_assert_1.default.strictEqual(h.queued(), false);
});
(0, node_test_1.default)('a fast release keeps scrolling in its direction at the touch position, then decays and stops', () => {
    const h = harness();
    h.momentum.fling(2, { x: 1, y: 2 });
    let frames = 0;
    while (h.queued() && frames < 2000) {
        h.frame();
        frames++;
    }
    node_assert_1.default.ok(h.emitted.length > 1);
    node_assert_1.default.ok(h.emitted.every((e) => e.direction === 'up' && e.x === 1 && e.y === 2));
    node_assert_1.default.strictEqual(h.momentum.isRunning(), false);
});
(0, node_test_1.default)('stop cancels the running animation', () => {
    const h = harness();
    h.momentum.fling(2, { x: 0, y: 0 });
    h.momentum.stop();
    node_assert_1.default.strictEqual(h.queued(), false);
    node_assert_1.default.strictEqual(h.momentum.isRunning(), false);
});
