const test = require('node:test');
const assert = require('node:assert');
const Stepper = require('./stepper.js');

test('add returns nothing until a full step has accumulated', () => {
  const s = Stepper.create({ stepPx: 10 });
  assert.strictEqual(s.add(6), null);
  assert.deepStrictEqual(s.add(6), { direction: 'up', steps: 1 });
});

test('negative distance steps down and the remainder carries over', () => {
  const s = Stepper.create({ stepPx: 10 });
  assert.deepStrictEqual(s.add(-25), { direction: 'down', steps: 2 });
  assert.deepStrictEqual(s.add(-5), { direction: 'down', steps: 1 });
});

test('steps are capped but the whole distance is consumed', () => {
  const s = Stepper.create({ stepPx: 10, maxSteps: 3 });
  assert.deepStrictEqual(s.add(100), { direction: 'up', steps: 3 });
  assert.strictEqual(s.add(5), null);
});

test('stepPx may be a function evaluated on every call', () => {
  let size = 10;
  const s = Stepper.create({ stepPx: () => size });
  size = 50;
  assert.strictEqual(s.add(20), null);
});

test('reset discards the remainder', () => {
  const s = Stepper.create({ stepPx: 10 });
  s.add(9);
  s.reset();
  assert.strictEqual(s.add(2), null);
});
