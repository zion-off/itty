import test from 'node:test';
import assert from 'node:assert';

test('wheel up and down use buttons 64 and 65 in SGR form', () => {
  assert.strictEqual(Mouse.wheel('up', 5, 7), '\x1b[<64;5;7M');
  assert.strictEqual(Mouse.wheel('down', 5, 7), '\x1b[<65;5;7M');
});

test('press, drag and release use the left button, motion flag and a lowercase m', () => {
  assert.strictEqual(Mouse.press(1, 2), '\x1b[<0;1;2M');
  assert.strictEqual(Mouse.drag(3, 4), '\x1b[<32;3;4M');
  assert.strictEqual(Mouse.release(3, 4), '\x1b[<0;3;4m');
});

test('coordinates are clamped to at least 1 and floored', () => {
  assert.strictEqual(Mouse.press(0, -3), '\x1b[<0;1;1M');
  assert.strictEqual(Mouse.press(2.9, 3.2), '\x1b[<0;2;3M');
});
