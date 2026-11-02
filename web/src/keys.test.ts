import test from 'node:test';
import assert from 'node:assert';

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

test('navigation keys follow the cursor key mode for home and end only', () => {
  assert.strictEqual(Keys.navigation('pageUp', true), '\x1b[5~');
  assert.strictEqual(Keys.navigation('pageDown', false), '\x1b[6~');
  assert.strictEqual(Keys.navigation('home', false), '\x1b[H');
  assert.strictEqual(Keys.navigation('home', true), '\x1bOH');
  assert.strictEqual(Keys.navigation('end', false), '\x1b[F');
  assert.strictEqual(Keys.navigation('end', true), '\x1bOF');
});

test('backtab is the reverse tab sequence', () => {
  assert.strictEqual(Keys.BACKTAB, '\x1b[Z');
});
