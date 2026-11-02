"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const node_assert_1 = __importDefault(require("node:assert"));
const FRAME_MS = 1000 / 60;
const fakeClock = () => {
    let time = 0;
    let pending = null;
    let nextHandle = 1;
    return {
        now: () => time,
        request: (callback) => {
            pending = { callback, handle: nextHandle };
            return nextHandle++;
        },
        cancel: (handle) => {
            if (pending && pending.handle === handle)
                pending = null;
        },
        frame(ms = FRAME_MS) {
            if (!pending)
                return false;
            const { callback } = pending;
            pending = null;
            time += ms;
            callback(time);
            return true;
        },
        running: () => pending !== null,
    };
};
const run = (clock, frames) => {
    for (let i = 0; i < frames && clock.frame(); i += 1)
        ;
};
const record = () => {
    const values = [];
    return { values, onUpdate: (v) => values.push(v) };
};
(0, node_test_1.default)('a critically damped spring reaches the target without overshoot', () => {
    const clock = fakeClock();
    const { values, onUpdate } = record();
    const spring = Spring.create({ value: 0, damping: 1, response: 0.4, onUpdate, clock });
    spring.to(1);
    run(clock, 600);
    node_assert_1.default.ok(values.every((v) => v <= 1 + 1e-9));
    node_assert_1.default.strictEqual(spring.value(), 1);
    node_assert_1.default.strictEqual(clock.running(), false);
});
(0, node_test_1.default)('an under-damped spring overshoots and then settles', () => {
    const clock = fakeClock();
    const { values, onUpdate } = record();
    const spring = Spring.create({ value: 0, damping: 0.5, response: 0.4, onUpdate, clock });
    spring.to(1);
    run(clock, 600);
    node_assert_1.default.ok(Math.max(...values) > 1.05);
    node_assert_1.default.strictEqual(spring.value(), 1);
});
(0, node_test_1.default)('a smaller response settles sooner', () => {
    const settleFrames = (response) => {
        const clock = fakeClock();
        const spring = Spring.create({ value: 0, response, clock });
        spring.to(1);
        let frames = 0;
        while (clock.frame())
            frames += 1;
        node_assert_1.default.strictEqual(spring.value(), 1);
        return frames;
    };
    node_assert_1.default.ok(settleFrames(0.2) < settleFrames(0.5));
});
(0, node_test_1.default)('a critically damped spring covers most of the distance in half its response time', () => {
    const clock = fakeClock();
    const spring = Spring.create({ value: 0, damping: 1, response: 0.4, clock });
    spring.to(1);
    run(clock, 12);
    node_assert_1.default.ok(spring.value() > 0.6 && spring.value() < 0.95);
});
(0, node_test_1.default)('retargeting mid flight continues from the current value and velocity', () => {
    const clock = fakeClock();
    const spring = Spring.create({ value: 0, damping: 1, response: 0.4, clock });
    spring.to(1);
    run(clock, 8);
    const position = spring.value();
    const velocity = spring.velocity();
    node_assert_1.default.ok(position > 0 && position < 1);
    node_assert_1.default.ok(velocity > 0);
    spring.to(0);
    node_assert_1.default.strictEqual(spring.value(), position);
    node_assert_1.default.strictEqual(spring.velocity(), velocity);
    clock.frame();
    node_assert_1.default.ok(spring.value() > position - 0.05, 'velocity carries the value forward before it turns around');
    run(clock, 600);
    node_assert_1.default.strictEqual(spring.value(), 0);
});
(0, node_test_1.default)('an initial velocity is handed to the spring', () => {
    const clock = fakeClock();
    const spring = Spring.create({ value: 0, damping: 1, response: 0.4, clock });
    spring.to(0, { velocity: 5 });
    clock.frame();
    node_assert_1.default.ok(spring.value() > 0);
    run(clock, 600);
    node_assert_1.default.strictEqual(spring.value(), 0);
});
(0, node_test_1.default)('onRest fires once at the target and the frame loop stops', () => {
    const clock = fakeClock();
    const rests = [];
    const spring = Spring.create({ value: 0, onRest: (v) => rests.push(v), clock });
    spring.to(1);
    run(clock, 600);
    node_assert_1.default.deepStrictEqual(rests, [1]);
    node_assert_1.default.strictEqual(clock.running(), false);
});
(0, node_test_1.default)('set jumps to a value, cancels motion and reports it', () => {
    const clock = fakeClock();
    const { values, onUpdate } = record();
    const spring = Spring.create({ value: 0, onUpdate, clock });
    spring.to(1);
    run(clock, 3);
    spring.set(0.25);
    node_assert_1.default.strictEqual(clock.running(), false);
    node_assert_1.default.strictEqual(spring.value(), 0.25);
    node_assert_1.default.strictEqual(spring.velocity(), 0);
    node_assert_1.default.strictEqual(values[values.length - 1], 0.25);
});
(0, node_test_1.default)('a long frame gap is clamped so the spring cannot explode', () => {
    const clock = fakeClock();
    const spring = Spring.create({ value: 0, damping: 0.8, response: 0.3, clock });
    spring.to(1);
    clock.frame(10000);
    node_assert_1.default.ok(spring.value() > 0 && spring.value() < 0.5);
    run(clock, 600);
    node_assert_1.default.strictEqual(spring.value(), 1);
});
(0, node_test_1.default)('presets are frozen critically damped springs', () => {
    node_assert_1.default.strictEqual(Spring.presets.press.damping, 1);
    node_assert_1.default.strictEqual(Spring.presets.presence.damping, 1);
    node_assert_1.default.ok(Object.isFrozen(Spring.presets.press));
});
