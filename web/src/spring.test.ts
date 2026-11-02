import test from 'node:test';
import assert from 'node:assert';

const FRAME_MS = 1000 / 60;

interface PendingFrame {
  callback: FrameRequestCallback;
  handle: number;
}

const fakeClock = () => {
  let time = 0;
  let pending: PendingFrame | null = null;
  let nextHandle = 1;
  return {
    now: () => time,
    request: (callback: FrameRequestCallback) => {
      pending = { callback, handle: nextHandle };
      return nextHandle++;
    },
    cancel: (handle: number) => {
      if (pending && pending.handle === handle) pending = null;
    },
    frame(ms = FRAME_MS) {
      if (!pending) return false;
      const { callback } = pending;
      pending = null;
      time += ms;
      callback(time);
      return true;
    },
    running: () => pending !== null,
  };
};

const run = (clock: { frame: () => boolean }, frames: number) => {
  for (let i = 0; i < frames && clock.frame(); i += 1);
};

const record = () => {
  const values: number[] = [];
  return { values, onUpdate: (v: number) => values.push(v) };
};

test('a critically damped spring reaches the target without overshoot', () => {
  const clock = fakeClock();
  const { values, onUpdate } = record();
  const spring = Spring.create({ value: 0, damping: 1, response: 0.4, onUpdate, clock });
  spring.to(1);
  run(clock, 600);
  assert.ok(values.every((v) => v <= 1 + 1e-9));
  assert.strictEqual(spring.value(), 1);
  assert.strictEqual(clock.running(), false);
});

test('an under-damped spring overshoots and then settles', () => {
  const clock = fakeClock();
  const { values, onUpdate } = record();
  const spring = Spring.create({ value: 0, damping: 0.5, response: 0.4, onUpdate, clock });
  spring.to(1);
  run(clock, 600);
  assert.ok(Math.max(...values) > 1.05);
  assert.strictEqual(spring.value(), 1);
});

test('a smaller response settles sooner', () => {
  const settleFrames = (response: number) => {
    const clock = fakeClock();
    const spring = Spring.create({ value: 0, response, clock });
    spring.to(1);
    let frames = 0;
    while (clock.frame()) frames += 1;
    assert.strictEqual(spring.value(), 1);
    return frames;
  };
  assert.ok(settleFrames(0.2) < settleFrames(0.5));
});

test('a critically damped spring covers most of the distance in half its response time', () => {
  const clock = fakeClock();
  const spring = Spring.create({ value: 0, damping: 1, response: 0.4, clock });
  spring.to(1);
  run(clock, 12);
  assert.ok(spring.value() > 0.6 && spring.value() < 0.95);
});

test('retargeting mid flight continues from the current value and velocity', () => {
  const clock = fakeClock();
  const spring = Spring.create({ value: 0, damping: 1, response: 0.4, clock });
  spring.to(1);
  run(clock, 8);
  const position = spring.value();
  const velocity = spring.velocity();
  assert.ok(position > 0 && position < 1);
  assert.ok(velocity > 0);
  spring.to(0);
  assert.strictEqual(spring.value(), position);
  assert.strictEqual(spring.velocity(), velocity);
  clock.frame();
  assert.ok(spring.value() > position - 0.05, 'velocity carries the value forward before it turns around');
  run(clock, 600);
  assert.strictEqual(spring.value(), 0);
});

test('an initial velocity is handed to the spring', () => {
  const clock = fakeClock();
  const spring = Spring.create({ value: 0, damping: 1, response: 0.4, clock });
  spring.to(0, { velocity: 5 });
  clock.frame();
  assert.ok(spring.value() > 0);
  run(clock, 600);
  assert.strictEqual(spring.value(), 0);
});

test('onRest fires once at the target and the frame loop stops', () => {
  const clock = fakeClock();
  const rests: number[] = [];
  const spring = Spring.create({ value: 0, onRest: (v: number) => rests.push(v), clock });
  spring.to(1);
  run(clock, 600);
  assert.deepStrictEqual(rests, [1]);
  assert.strictEqual(clock.running(), false);
});

test('set jumps to a value, cancels motion and reports it', () => {
  const clock = fakeClock();
  const { values, onUpdate } = record();
  const spring = Spring.create({ value: 0, onUpdate, clock });
  spring.to(1);
  run(clock, 3);
  spring.set(0.25);
  assert.strictEqual(clock.running(), false);
  assert.strictEqual(spring.value(), 0.25);
  assert.strictEqual(spring.velocity(), 0);
  assert.strictEqual(values[values.length - 1], 0.25);
});

test('a long frame gap is clamped so the spring cannot explode', () => {
  const clock = fakeClock();
  const spring = Spring.create({ value: 0, damping: 0.8, response: 0.3, clock });
  spring.to(1);
  clock.frame(10000);
  assert.ok(spring.value() > 0 && spring.value() < 0.5);
  run(clock, 600);
  assert.strictEqual(spring.value(), 1);
});

test('presets are frozen critically damped springs', () => {
  assert.strictEqual(Spring.presets.press.damping, 1);
  assert.strictEqual(Spring.presets.presence.damping, 1);
  assert.ok(Object.isFrozen(Spring.presets.press));
});
