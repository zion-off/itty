import test from 'node:test';
import assert from 'node:assert';

const harness = () => {
  let clock = 0;
  let queued: (() => void) | null = null;
  const emitted: ScrollEmission[] = [];
  const momentum = Momentum.create({
    stepper: Stepper.create({ stepPx: 10 }),
    emit: (e: ScrollEmission) => emitted.push(e),
    raf: (fn: () => void) => {
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
    if (fn) fn();
  };
  return { momentum, emitted, frame, queued: () => queued !== null };
};

test('a slow release does not start momentum', () => {
  const h = harness();
  h.momentum.fling(0.1, { x: 1, y: 2 });
  assert.strictEqual(h.queued(), false);
});

test('a fast release keeps scrolling in its direction at the touch position, then decays and stops', () => {
  const h = harness();
  h.momentum.fling(2, { x: 1, y: 2 });
  let frames = 0;
  while (h.queued() && frames < 2000) {
    h.frame();
    frames++;
  }
  assert.ok(h.emitted.length > 1);
  assert.ok(h.emitted.every((e) => e.direction === 'up' && e.x === 1 && e.y === 2));
  assert.strictEqual(h.momentum.isRunning(), false);
});

test('stop cancels the running animation', () => {
  const h = harness();
  h.momentum.fling(2, { x: 0, y: 0 });
  h.momentum.stop();
  assert.strictEqual(h.queued(), false);
  assert.strictEqual(h.momentum.isRunning(), false);
});
