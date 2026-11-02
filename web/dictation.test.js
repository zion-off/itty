const test = require('node:test');
const assert = require('node:assert');
const Dictation = require('./dictation.js');

const setup = () => {
  const textarea = { value: '' };
  const listeners = new Map();
  const root = {
    addEventListener: (type, handler) => listeners.set(type, [...(listeners.get(type) || []), handler]),
  };
  let timer = null;
  const sent = [];
  const logs = [];
  Dictation.create({
    root,
    textarea,
    send: (text) => sent.push(text),
    setTimer: (fn) => (timer = fn),
    clearTimer: () => (timer = null),
    log: (...args) => logs.push(args.join(' ')),
  });
  const dispatch = (type, extra = {}) => {
    const event = { type, target: textarea, stopped: false, stopImmediatePropagation() { this.stopped = true; }, ...extra };
    (listeners.get(type) || []).forEach((handler) => handler(event));
    return event;
  };
  const dictate = (value, inputType = 'insertText') => {
    const event = dispatch('beforeinput', { inputType });
    if (!event.stopped) return event;
    textarea.value = value;
    dispatch('input', { inputType });
    return event;
  };
  return { textarea, dispatch, dictate, sent, logs, settle: () => timer && timer(), pending: () => timer !== null };
};

test('revisions of dictated text are held and only the final text is sent', () => {
  const { dictate, settle, sent } = setup();
  dictate('list');
  dictate('list the', 'insertReplacementText');
  dictate('list the files', 'insertReplacementText');
  assert.deepStrictEqual(sent, []);
  settle();
  assert.deepStrictEqual(sent, ['list the files']);
});

test('dictated events are hidden from the terminal', () => {
  const { dictate, dispatch } = setup();
  assert.strictEqual(dictate('hello').stopped, true);
  assert.strictEqual(dispatch('input', { inputType: 'insertText' }).stopped, true);
  assert.strictEqual(dispatch('compositionend').stopped, true);
});

test('typed characters pass through untouched', () => {
  const { dispatch, sent, pending } = setup();
  dispatch('keydown');
  assert.strictEqual(dispatch('beforeinput', { inputType: 'insertText' }).stopped, false);
  assert.strictEqual(dispatch('input', { inputType: 'insertText' }).stopped, false);
  dispatch('keyup');
  assert.strictEqual(pending(), false);
  assert.deepStrictEqual(sent, []);
});

test('a composition that begins without a keystroke is held', () => {
  const { dispatch } = setup();
  assert.strictEqual(dispatch('compositionstart').stopped, true);
});

test('a composition that follows a keystroke passes through', () => {
  const { dispatch } = setup();
  dispatch('keydown');
  assert.strictEqual(dispatch('compositionstart').stopped, false);
});

test('a key press sends the held text before the key is handled', () => {
  const { dictate, dispatch, sent, textarea } = setup();
  dictate('echo hi');
  dispatch('keydown');
  assert.deepStrictEqual(sent, ['echo hi']);
  assert.strictEqual(textarea.value, '');
});

test('the text field is cleared once the text is sent', () => {
  const { dictate, settle, textarea } = setup();
  dictate('pwd');
  settle();
  assert.strictEqual(textarea.value, '');
});

test('text that was already in the field is not sent again', () => {
  const { textarea, dictate, settle, sent } = setup();
  textarea.value = 'old';
  dictate('old new');
  settle();
  assert.deepStrictEqual(sent, [' new']);
});

test('dictation after a settled phrase starts a new phrase', () => {
  const { dictate, settle, sent } = setup();
  dictate('one');
  settle();
  dictate('two');
  settle();
  assert.deepStrictEqual(sent, ['one', 'two']);
});

test('nothing is sent when the held text ends up empty', () => {
  const { dictate, settle, sent } = setup();
  dictate('oops');
  dictate('', 'insertReplacementText');
  settle();
  assert.deepStrictEqual(sent, []);
});

test('events from other elements are ignored', () => {
  const { dispatch, pending } = setup();
  dispatch('beforeinput', { inputType: 'insertText', target: {} });
  assert.strictEqual(pending(), false);
});

test('logs never include the dictated text', () => {
  const { dictate, settle, logs } = setup();
  dictate('secret');
  settle();
  assert.ok(logs.length > 0);
  assert.ok(logs.every((line) => !line.includes('secret')));
});
