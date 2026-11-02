const test = require('node:test');
const assert = require('node:assert');
const Keyboard = require('./keyboard.js');

const fakeTextarea = () => {
  const calls = [];
  return { calls, blur: () => calls.push('blur'), focus: () => calls.push('focus') };
};

const fakeViewport = (innerHeight, visibleHeight) => ({
  innerHeight,
  visualViewport: visibleHeight === undefined ? undefined : { height: visibleHeight },
});

test('isShowing is true when the visual viewport is much shorter than the layout viewport', () => {
  assert.strictEqual(Keyboard.isShowing(844, 550), true);
});

test('isShowing is false when both viewports match', () => {
  assert.strictEqual(Keyboard.isShowing(844, 844), false);
});

test('isShowing is false without a visual viewport', () => {
  assert.strictEqual(Keyboard.isShowing(844, undefined), false);
});

test('isShowing ignores a browser chrome change smaller than the threshold', () => {
  assert.strictEqual(Keyboard.isShowing(844, 844 - 80), false);
  assert.strictEqual(Keyboard.isShowing(844, 844 - Keyboard.MIN_KEYBOARD_HEIGHT_PX), false);
  assert.strictEqual(Keyboard.isShowing(844, 844 - Keyboard.MIN_KEYBOARD_HEIGHT_PX - 1), true);
});

test('show blurs then focuses the textarea, hide only blurs it', () => {
  const textarea = fakeTextarea();
  const keyboard = Keyboard.create({ textarea, onChange: () => {}, viewport: fakeViewport(844, 844) });
  keyboard.show();
  assert.deepStrictEqual(textarea.calls, ['blur', 'focus']);
  keyboard.hide();
  assert.deepStrictEqual(textarea.calls, ['blur', 'focus', 'blur']);
});

test('refresh reports only changes of the keyboard state', () => {
  const viewport = fakeViewport(844, 844);
  const changes = [];
  const keyboard = Keyboard.create({ textarea: fakeTextarea(), onChange: (v) => changes.push(v), viewport });
  keyboard.refresh();
  assert.deepStrictEqual(changes, []);
  viewport.visualViewport.height = 500;
  keyboard.refresh();
  keyboard.refresh();
  assert.deepStrictEqual(changes, [true]);
  assert.strictEqual(keyboard.isShowing(), true);
  viewport.visualViewport.height = 844;
  keyboard.refresh();
  assert.deepStrictEqual(changes, [true, false]);
});
