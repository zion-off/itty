const test = require('node:test');
const assert = require('node:assert');
const Sessions = require('./sessions.js');

const sessionsMessage = (current, sessions) => JSON.stringify({ type: 'sessions', current, sessions });
const errorMessage = (message) => JSON.stringify({ type: 'error', message });

test('the first sessions message sets the state and resets the terminal', () => {
  const sessions = Sessions.create();
  assert.deepStrictEqual(sessions.receive(sessionsMessage('work', ['itty', 'work'])), { type: 'sessions', reset: true });
  assert.deepStrictEqual(sessions.state(), { current: 'work', sessions: ['itty', 'work'], pending: null });
});

test('a different current session requires a reset', () => {
  const sessions = Sessions.create();
  sessions.receive(sessionsMessage('work', ['itty', 'work']));
  assert.strictEqual(sessions.receive(sessionsMessage('itty', ['itty', 'work'])).reset, true);
  assert.strictEqual(sessions.state().current, 'itty');
});

test('the same current session does not reset but refreshes the list', () => {
  const sessions = Sessions.create();
  sessions.receive(sessionsMessage('work', ['work']));
  const update = sessions.receive(sessionsMessage('work', ['itty', 'work']));
  assert.deepStrictEqual(update, { type: 'sessions', reset: false });
  assert.deepStrictEqual(sessions.state().sessions, ['itty', 'work']);
});

test('a single session list is accepted', () => {
  const sessions = Sessions.create();
  assert.strictEqual(sessions.receive(sessionsMessage('main', ['main'])).type, 'sessions');
});

test('malformed and unknown messages are ignored without changing state', () => {
  const sessions = Sessions.create();
  sessions.receive(sessionsMessage('work', ['itty', 'work']));
  const before = sessions.state();
  const ignored = [
    'not json',
    '',
    'null',
    '42',
    '"sessions"',
    undefined,
    new ArrayBuffer(4),
    JSON.stringify({ type: 'unknown' }),
    JSON.stringify({ current: 'itty', sessions: ['itty'] }),
    JSON.stringify({ type: 'sessions', sessions: ['itty'] }),
    JSON.stringify({ type: 'sessions', current: '', sessions: [''] }),
    JSON.stringify({ type: 'sessions', current: 'itty', sessions: 'itty' }),
    JSON.stringify({ type: 'sessions', current: 'itty', sessions: ['itty', 7] }),
    JSON.stringify({ type: 'sessions', current: 'itty', sessions: ['work'] }),
  ];
  ignored.forEach((raw) => assert.strictEqual(sessions.receive(raw), null, String(raw)));
  assert.deepStrictEqual(sessions.state(), before);
});

test('an error message is reported and keeps the current session', () => {
  const sessions = Sessions.create();
  sessions.receive(sessionsMessage('work', ['itty', 'work']));
  assert.deepStrictEqual(sessions.receive(errorMessage('unknown session')), {
    type: 'error',
    message: 'unknown session',
  });
  assert.strictEqual(sessions.state().current, 'work');
});

test('an error without a message gets a generic one', () => {
  const sessions = Sessions.create();
  assert.strictEqual(sessions.receive(JSON.stringify({ type: 'error' })).message, 'request failed');
});

test('switchMessage builds the request and marks it pending', () => {
  const sessions = Sessions.create();
  sessions.receive(sessionsMessage('work', ['itty', 'work']));
  assert.deepStrictEqual(JSON.parse(sessions.switchMessage('itty')), { type: 'switch', session: 'itty' });
  assert.strictEqual(sessions.state().pending, 'itty');
});

test('switchMessage refuses the current session and unknown names', () => {
  const sessions = Sessions.create();
  sessions.receive(sessionsMessage('work', ['itty', 'work']));
  assert.strictEqual(sessions.switchMessage('work'), null);
  assert.strictEqual(sessions.switchMessage('other'), null);
  assert.strictEqual(sessions.state().pending, null);
});

test('pending clears on a sessions message and on an error', () => {
  const sessions = Sessions.create();
  sessions.receive(sessionsMessage('work', ['itty', 'work']));
  sessions.switchMessage('itty');
  sessions.receive(sessionsMessage('itty', ['itty', 'work']));
  assert.strictEqual(sessions.state().pending, null);
  sessions.switchMessage('work');
  sessions.receive(errorMessage('unknown session'));
  assert.strictEqual(sessions.state().pending, null);
});

test('listMessage builds the list request', () => {
  assert.deepStrictEqual(JSON.parse(Sessions.create().listMessage()), { type: 'list' });
});

test('forget clears the state so a new connection resets the terminal', () => {
  const sessions = Sessions.create();
  sessions.receive(sessionsMessage('work', ['work']));
  sessions.forget();
  assert.deepStrictEqual(sessions.state(), { current: null, sessions: [], pending: null });
  assert.strictEqual(sessions.receive(sessionsMessage('work', ['work'])).reset, true);
});
