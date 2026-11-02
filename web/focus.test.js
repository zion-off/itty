const test = require('node:test');
const assert = require('node:assert');
const Focus = require('./focus.js');

const fakePage = (focused) => {
  const win = new EventTarget();
  const doc = { hasFocus: () => focused.value };
  return { win, doc };
};

test('resolves immediately when the document already has focus', async () => {
  const { win, doc } = fakePage({ value: true });
  await Focus.whenFocused({ doc, win });
});

test('waits for the focus event when the document is not focused', async () => {
  const state = { value: false };
  const { win, doc } = fakePage(state);
  let resolved = false;
  const waiting = Focus.whenFocused({ doc, win }).then(() => {
    resolved = true;
  });
  await Promise.resolve();
  assert.strictEqual(resolved, false);
  state.value = true;
  win.dispatchEvent(new Event('focus'));
  await waiting;
  assert.strictEqual(resolved, true);
});

test('rejects with AbortError when cancelled while waiting, and ignores a later focus', async () => {
  const { win, doc } = fakePage({ value: false });
  const controller = new AbortController();
  const waiting = Focus.whenFocused({ doc, win, signal: controller.signal });
  controller.abort();
  await assert.rejects(waiting, { name: 'AbortError' });
  win.dispatchEvent(new Event('focus'));
});

test('rejects immediately when the signal is already aborted', async () => {
  const { win, doc } = fakePage({ value: true });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(Focus.whenFocused({ doc, win, signal: controller.signal }), { name: 'AbortError' });
});

test('recognizes the browser focus error', () => {
  assert.strictEqual(Focus.isNotFocusedError(new Error('The document is not focused.')), true);
  assert.strictEqual(Focus.isNotFocusedError(new Error('network down')), false);
  assert.strictEqual(Focus.isNotFocusedError(undefined), false);
});
