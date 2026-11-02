const test = require('node:test');
const assert = require('node:assert');
const Keys = require('./keys.js');

test('controlByte maps letters and symbols', () => {
  assert.strictEqual(Keys.controlByte('c'), '\x03');
  assert.strictEqual(Keys.controlByte('S'), '\x13');
  assert.strictEqual(Keys.controlByte('['), '\x1b');
  assert.strictEqual(Keys.controlByte(' '), '\x00');
  assert.strictEqual(Keys.controlByte('?'), '\x7f');
});

test('controlByte ignores multi-character and unmapped input', () => {
  assert.strictEqual(Keys.controlByte('ab'), null);
  assert.strictEqual(Keys.controlByte('1'), null);
  assert.strictEqual(Keys.controlByte(''), null);
});

test('arrow follows the cursor key mode', () => {
  assert.strictEqual(Keys.arrow('A', false), '\x1b[A');
  assert.strictEqual(Keys.arrow('A', true), '\x1bOA');
});
