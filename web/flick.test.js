"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const node_assert_1 = __importDefault(require("node:assert"));
const setup = ({ repeats = false, hitIndex = null } = {}) => {
    const events = [];
    const timers = new Map();
    let next = 1;
    let target = hitIndex;
    const repeat = repeats ? { start: () => events.push('repeat start'), stop: () => events.push('repeat stop') } : null;
    const gesture = Flick.create({
        hit: () => target,
        repeat,
        onTap: () => events.push('tap'),
        onOpen: () => events.push('open'),
        onHighlight: (i) => events.push(`highlight ${i}`),
        onSelect: (i) => events.push(`select ${i}`),
        onClose: () => events.push('close'),
        setTimer: (fn, ms) => (timers.set(next, { fn, ms }), next++),
        clearTimer: (id) => timers.delete(id),
    });
    return { gesture, events, timers, aim: (i) => (target = i), fire: () => [...timers.values()][0]?.fn() };
};
const at = (x, y) => ({ x, y });
(0, node_test_1.default)('a quick press and release is a tap', () => {
    const { gesture, events, timers } = setup();
    gesture.down(at(10, 100));
    gesture.up(at(10, 100));
    node_assert_1.default.deepStrictEqual(events, ['tap']);
    node_assert_1.default.strictEqual(timers.size, 0);
});
(0, node_test_1.default)('dragging up opens the menu and releasing over an option selects it', () => {
    const { gesture, events, aim } = setup();
    gesture.down(at(10, 100));
    aim(2);
    gesture.move(at(12, 80));
    gesture.up(at(40, 60));
    node_assert_1.default.deepStrictEqual(events, ['open', 'highlight 2', 'close', 'select 2']);
});
(0, node_test_1.default)('a small movement does not open the menu', () => {
    const { gesture, events } = setup();
    gesture.down(at(10, 100));
    gesture.move(at(12, 95));
    gesture.up(at(12, 95));
    node_assert_1.default.deepStrictEqual(events, ['tap']);
});
(0, node_test_1.default)('dragging down or sideways does not open the menu', () => {
    const { gesture, events } = setup();
    gesture.down(at(10, 100));
    gesture.move(at(60, 104));
    gesture.move(at(10, 130));
    gesture.up(at(10, 130));
    node_assert_1.default.deepStrictEqual(events, ['tap']);
});
(0, node_test_1.default)('holding opens the menu and releasing away from it cancels', () => {
    const { gesture, events, fire } = setup();
    gesture.down(at(10, 100));
    fire();
    gesture.up(at(10, 100));
    node_assert_1.default.deepStrictEqual(events, ['open', 'close']);
});
(0, node_test_1.default)('the highlight follows the finger and clears when it leaves the menu', () => {
    const { gesture, events, aim } = setup();
    gesture.down(at(10, 100));
    aim(0);
    gesture.move(at(10, 80));
    aim(1);
    gesture.move(at(50, 80));
    aim(null);
    gesture.move(at(50, 130));
    gesture.up(at(50, 130));
    node_assert_1.default.deepStrictEqual(events, ['open', 'highlight 0', 'highlight 1', 'highlight null', 'close']);
});
(0, node_test_1.default)('a repeating key starts repeating on hold instead of opening the menu', () => {
    const { gesture, events, timers, fire } = setup({ repeats: true });
    gesture.down(at(10, 100));
    node_assert_1.default.strictEqual([...timers.values()][0]?.ms, Flick.REPEAT_HOLD_MS);
    fire();
    gesture.move(at(10, 40));
    gesture.up(at(10, 40));
    node_assert_1.default.deepStrictEqual(events, ['repeat start', 'repeat stop']);
});
(0, node_test_1.default)('a repeating key still opens the menu when dragged before the hold', () => {
    const { gesture, events, timers, aim } = setup({ repeats: true });
    gesture.down(at(10, 100));
    aim(0);
    gesture.move(at(10, 70));
    node_assert_1.default.strictEqual(timers.size, 0);
    gesture.up(at(10, 70));
    node_assert_1.default.deepStrictEqual(events, ['open', 'highlight 0', 'close', 'select 0']);
});
(0, node_test_1.default)('a cancelled pointer closes the menu without selecting', () => {
    const { gesture, events, aim } = setup();
    gesture.down(at(10, 100));
    aim(1);
    gesture.move(at(10, 70));
    gesture.cancel();
    node_assert_1.default.deepStrictEqual(events, ['open', 'highlight 1', 'close']);
});
(0, node_test_1.default)('a cancelled press never sends the tap', () => {
    const { gesture, events, timers } = setup();
    gesture.down(at(10, 100));
    gesture.cancel();
    node_assert_1.default.deepStrictEqual(events, []);
    node_assert_1.default.strictEqual(timers.size, 0);
});
