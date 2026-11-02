const test = require('node:test');
const assert = require('node:assert');
const Gesture = require('./gesture.js');

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

test('a touch that does not move is a tap at the release position', () => {
  const { gesture, events } = harness();
  gesture.down(1, 10, 20);
  assert.strictEqual(gesture.up(1), 'tap');
  assert.deepStrictEqual(events, [['tap', 10, 20]]);
});

test('movement within the slop is still a tap', () => {
  const { gesture, events } = harness();
  gesture.down(1, 10, 20);
  gesture.move(1, 14, 23);
  gesture.up(1);
  assert.deepStrictEqual(events, [['tap', 14, 23]]);
});

test('dragging down sends wheel up, one step per stepPx', () => {
  const { gesture, events } = harness();
  gesture.down(1, 0, 0);
  gesture.move(1, 0, 50);
  assert.deepStrictEqual(events, [['scroll', 'up', 2]]);
  assert.strictEqual(gesture.up(1), 'scroll');
});

test('dragging up sends wheel down', () => {
  const { gesture, events } = harness();
  gesture.down(1, 0, 100);
  gesture.move(1, 0, 60);
  assert.deepStrictEqual(events, [['scroll', 'down', 1]]);
});

test('the remainder below one step carries over to the next move', () => {
  const { gesture, events } = harness();
  gesture.down(1, 0, 0);
  gesture.move(1, 0, 20);
  gesture.move(1, 0, 30);
  assert.deepStrictEqual(events, [['scroll', 'up', 1]]);
});

test('steps per move are capped', () => {
  const { gesture, events } = harness();
  gesture.down(1, 0, 0);
  gesture.move(1, 0, 2000);
  assert.deepStrictEqual(events, [['scroll', 'up', 8]]);
});

test('moving past the slop cancels the long press', () => {
  const { gesture, hasTimer } = harness();
  gesture.down(1, 0, 0);
  gesture.move(1, 0, 30);
  assert.strictEqual(hasTimer(), false);
});

test('holding still starts a selection, then moves drag and release ends it', () => {
  const { gesture, events, fireTimer } = harness();
  gesture.down(1, 5, 5);
  fireTimer();
  gesture.move(1, 40, 60);
  assert.strictEqual(gesture.up(1), 'select');
  assert.deepStrictEqual(events, [
    ['selectStart', 5, 5],
    ['selectMove', 40, 60],
    ['selectEnd', 40, 60],
  ]);
});

test('cancel during a selection releases the button', () => {
  const { gesture, events, fireTimer } = harness();
  gesture.down(1, 5, 5);
  fireTimer();
  gesture.cancel();
  assert.deepStrictEqual(events.at(-1), ['selectEnd', 5, 5]);
  assert.strictEqual(gesture.isActive(), false);
});

test('cancel before the long press sends nothing and stops the timer', () => {
  const { gesture, events, hasTimer } = harness();
  gesture.down(1, 5, 5);
  gesture.cancel();
  assert.deepStrictEqual(events, []);
  assert.strictEqual(hasTimer(), false);
});

test('a second pointer is ignored while one is active', () => {
  const { gesture, events } = harness();
  gesture.down(1, 0, 0);
  gesture.down(2, 100, 100);
  gesture.move(2, 100, 300);
  assert.strictEqual(gesture.up(2), 'none');
  assert.deepStrictEqual(events, []);
  assert.strictEqual(gesture.up(1), 'tap');
});

test('releasing a fast drag reports the release velocity in pixels per millisecond', () => {
  let clock = 0;
  const flings = [];
  const { gesture } = harness({ now: () => clock, onFling: (v) => flings.push(v) });
  gesture.down(1, 0, 0);
  for (const y of [20, 40, 60]) {
    clock += 10;
    gesture.move(1, 0, y);
  }
  gesture.up(1);
  assert.strictEqual(flings.length, 1);
  assert.ok(Math.abs(flings[0] - 2) < 0.01);
});

test('touching down notifies so running momentum can stop', () => {
  let touched = 0;
  const { gesture } = harness({ onTouchStart: () => touched++ });
  gesture.down(1, 0, 0);
  assert.strictEqual(touched, 1);
});
