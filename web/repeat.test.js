const test = require('node:test');
const assert = require('node:assert');
const Repeat = require('./repeat.js');

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
      const [id, { fn, ms }] = [...timers.entries()][0];
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

test('start acts immediately and waits for the initial delay before repeating', () => {
  const { timers, presses, repeat } = setup();
  repeat.start();
  assert.strictEqual(presses.length, 1);
  assert.strictEqual(timers.pending(), 1);
  assert.strictEqual(timers.fire(), 400);
  assert.strictEqual(presses.length, 2);
});

test('after the delay it repeats at the shorter interval', () => {
  const { timers, presses, repeat } = setup();
  repeat.start();
  timers.fire();
  assert.strictEqual(timers.fire(), 70);
  assert.strictEqual(timers.fire(), 70);
  assert.strictEqual(presses.length, 4);
});

test('stop cancels pending repeats', () => {
  const { timers, presses, repeat } = setup();
  repeat.start();
  timers.fire();
  repeat.stop();
  assert.strictEqual(timers.pending(), 0);
  assert.strictEqual(presses.length, 2);
});

test('stop without start does nothing', () => {
  const { timers, repeat } = setup();
  repeat.stop();
  assert.strictEqual(timers.pending(), 0);
});

test('starting again restarts the delay without stacking timers', () => {
  const { timers, presses, repeat } = setup();
  repeat.start();
  repeat.start();
  assert.strictEqual(timers.pending(), 1);
  assert.strictEqual(presses.length, 2);
});
