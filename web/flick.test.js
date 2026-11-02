const test = require('node:test');
const assert = require('node:assert');
const Flick = require('./flick.js');

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
  return { gesture, events, timers, aim: (i) => (target = i), fire: () => [...timers.values()][0].fn() };
};

const at = (x, y) => ({ x, y });

test('a quick press and release is a tap', () => {
  const { gesture, events, timers } = setup();
  gesture.down(at(10, 100));
  gesture.up(at(10, 100));
  assert.deepStrictEqual(events, ['tap']);
  assert.strictEqual(timers.size, 0);
});

test('dragging up opens the menu and releasing over an option selects it', () => {
  const { gesture, events, aim } = setup();
  gesture.down(at(10, 100));
  aim(2);
  gesture.move(at(12, 80));
  gesture.up(at(40, 60));
  assert.deepStrictEqual(events, ['open', 'highlight 2', 'close', 'select 2']);
});

test('a small movement does not open the menu', () => {
  const { gesture, events } = setup();
  gesture.down(at(10, 100));
  gesture.move(at(12, 95));
  gesture.up(at(12, 95));
  assert.deepStrictEqual(events, ['tap']);
});

test('dragging down or sideways does not open the menu', () => {
  const { gesture, events } = setup();
  gesture.down(at(10, 100));
  gesture.move(at(60, 104));
  gesture.move(at(10, 130));
  gesture.up(at(10, 130));
  assert.deepStrictEqual(events, ['tap']);
});

test('holding opens the menu and releasing away from it cancels', () => {
  const { gesture, events, fire } = setup();
  gesture.down(at(10, 100));
  fire();
  gesture.up(at(10, 100));
  assert.deepStrictEqual(events, ['open', 'close']);
});

test('the highlight follows the finger and clears when it leaves the menu', () => {
  const { gesture, events, aim } = setup();
  gesture.down(at(10, 100));
  aim(0);
  gesture.move(at(10, 80));
  aim(1);
  gesture.move(at(50, 80));
  aim(null);
  gesture.move(at(50, 130));
  gesture.up(at(50, 130));
  assert.deepStrictEqual(events, ['open', 'highlight 0', 'highlight 1', 'highlight null', 'close']);
});

test('a repeating key starts repeating on hold instead of opening the menu', () => {
  const { gesture, events, timers, fire } = setup({ repeats: true });
  gesture.down(at(10, 100));
  assert.strictEqual([...timers.values()][0].ms, Flick.REPEAT_HOLD_MS);
  fire();
  gesture.move(at(10, 40));
  gesture.up(at(10, 40));
  assert.deepStrictEqual(events, ['repeat start', 'repeat stop']);
});

test('a repeating key still opens the menu when dragged before the hold', () => {
  const { gesture, events, timers, aim } = setup({ repeats: true });
  gesture.down(at(10, 100));
  aim(0);
  gesture.move(at(10, 70));
  assert.strictEqual(timers.size, 0);
  gesture.up(at(10, 70));
  assert.deepStrictEqual(events, ['open', 'highlight 0', 'close', 'select 0']);
});

test('a cancelled pointer closes the menu without selecting', () => {
  const { gesture, events, aim } = setup();
  gesture.down(at(10, 100));
  aim(1);
  gesture.move(at(10, 70));
  gesture.cancel();
  assert.deepStrictEqual(events, ['open', 'highlight 1', 'close']);
});

test('a cancelled press never sends the tap', () => {
  const { gesture, events, timers } = setup();
  gesture.down(at(10, 100));
  gesture.cancel();
  assert.deepStrictEqual(events, []);
  assert.strictEqual(timers.size, 0);
});
