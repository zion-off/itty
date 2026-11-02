const test = require('node:test');
const assert = require('node:assert');
const Dock = require('./dock.js');

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
  return { dock, timers, targets, fire: () => [...timers.values()][0].fn() };
};

test('starts collapsed with the keys out of reach', () => {
  const { dock, targets } = setup();
  assert.strictEqual(dock.isExpanded(), false);
  assert.deepStrictEqual(targets, ['set 0']);
});

test('expanding springs open and collapses after the idle time', () => {
  const { dock, timers, targets, fire } = setup();
  dock.expand();
  assert.strictEqual(dock.isExpanded(), true);
  assert.strictEqual(targets.at(-1), 1);
  assert.strictEqual([...timers.values()][0].ms, 4000);
  fire();
  assert.strictEqual(dock.isExpanded(), false);
  assert.strictEqual(targets.at(-1), 0);
});

test('touching a key restarts the idle time', () => {
  const { dock, timers } = setup();
  dock.expand();
  const first = [...timers.keys()][0];
  dock.touch();
  assert.strictEqual(timers.size, 1);
  assert.notStrictEqual([...timers.keys()][0], first);
});

test('an open keyboard keeps the keys expanded without an idle timer', () => {
  const { dock, timers } = setup();
  dock.setKeyboardOpen(true);
  assert.strictEqual(dock.isExpanded(), true);
  assert.strictEqual(timers.size, 0);
  dock.touch();
  assert.strictEqual(timers.size, 0);
});

test('closing the keyboard returns to the capsule', () => {
  const { dock, targets } = setup();
  dock.expand();
  dock.setKeyboardOpen(true);
  dock.setKeyboardOpen(false);
  assert.strictEqual(dock.isExpanded(), false);
  assert.strictEqual(targets.at(-1), 0);
});

test('expand is ignored while the keyboard is open', () => {
  const { dock, targets } = setup();
  dock.setKeyboardOpen(true);
  const count = targets.length;
  dock.expand();
  assert.strictEqual(targets.length, count);
});

test('collapse cancels the idle timer', () => {
  const { dock, timers } = setup();
  dock.expand();
  dock.collapse();
  assert.strictEqual(timers.size, 0);
});
