import test from 'node:test';
import assert from 'node:assert';

const decode = (message: string | null): unknown => JSON.parse(String(message));

const fieldOf = (update: SessionUpdate | null, field: string): unknown =>
  update === null ? undefined : Reflect.get(update, field);

const sessionsMessage = (current: string, sessions: string[]) => JSON.stringify({ type: 'sessions', current, sessions });
const errorMessage = (message: string) => JSON.stringify({ type: 'error', message });

test('the first sessions message sets the state and resets the terminal', () => {
  const sessions = Sessions.create();
  assert.deepStrictEqual(sessions.receive(sessionsMessage('work', ['itty', 'work'])), { type: 'sessions', reset: true });
  assert.deepStrictEqual(sessions.state(), { current: 'work', sessions: ['itty', 'work'], pending: null });
});

test('a different current session requires a reset', () => {
  const sessions = Sessions.create();
  sessions.receive(sessionsMessage('work', ['itty', 'work']));
  assert.strictEqual(fieldOf(sessions.receive(sessionsMessage('itty', ['itty', 'work'])), 'reset'), true);
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
  assert.strictEqual(fieldOf(sessions.receive(sessionsMessage('main', ['main'])), 'type'), 'sessions');
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
  assert.strictEqual(fieldOf(sessions.receive(JSON.stringify({ type: 'error' })), 'message'), 'request failed');
});

test('switchMessage builds the request and marks it pending', () => {
  const sessions = Sessions.create();
  sessions.receive(sessionsMessage('work', ['itty', 'work']));
  assert.deepStrictEqual(decode(sessions.switchMessage('itty')), { type: 'switch', session: 'itty' });
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
  assert.strictEqual(fieldOf(sessions.receive(sessionsMessage('work', ['work'])), 'reset'), true);
});

const windowsMessage = (session: string, windows: unknown[]) => JSON.stringify({ type: 'windows', session, windows });
const win = (id: string, index: number, name: string, active = false) => ({ id, index, name, active });

const withSessions = () => {
  const s = Sessions.create();
  s.receive(JSON.stringify({ type: 'sessions', current: 'a', sessions: ['a', 'b'] }));
  return s;
};

test('a windows message is stored per session', () => {
  const s = withSessions();
  const update = s.receive(windowsMessage('b', [win('@1', 0, 'zsh', true)]));
  assert.deepStrictEqual(update, { type: 'windows', session: 'b' });
  assert.deepStrictEqual(s.windowsOf('b'), [win('@1', 0, 'zsh', true)]);
  assert.strictEqual(s.windowsOf('a'), null);
});

test('malformed windows messages are ignored', () => {
  const s = withSessions();
  assert.strictEqual(s.receive(windowsMessage('b', [{ id: '@1' }])), null);
  assert.strictEqual(s.receive(JSON.stringify({ type: 'windows', session: 'b' })), null);
  assert.strictEqual(s.windowsOf('b'), null);
});

test('windowsMessage only asks for known sessions', () => {
  const s = withSessions();
  assert.deepStrictEqual(decode(s.windowsMessage('b')), { type: 'windows', session: 'b' });
  assert.strictEqual(s.windowsMessage('nope'), null);
});

test('selectMessage needs a known window and marks a session change as pending', () => {
  const s = withSessions();
  s.receive(windowsMessage('b', [win('@4', 1, 'logs')]));
  assert.strictEqual(s.selectMessage('b', '@9'), null);
  assert.deepStrictEqual(decode(s.selectMessage('b', '@4')), { type: 'select', session: 'b', window: '@4' });
  assert.strictEqual(s.state().pending, 'b');
});

test('selecting a window of the current session is not a pending switch', () => {
  const s = withSessions();
  s.receive(windowsMessage('a', [win('@1', 0, 'zsh')]));
  assert.ok(s.selectMessage('a', '@1'));
  assert.strictEqual(s.state().pending, null);
});

test('newWindowMessage needs a known session and marks a session change as pending', () => {
  const s = withSessions();
  assert.strictEqual(s.newWindowMessage('nope'), null);
  assert.deepStrictEqual(decode(s.newWindowMessage('b')), { type: 'new_window', session: 'b' });
  assert.strictEqual(s.state().pending, 'b');
});

test('creating a window in the current session is not a pending switch', () => {
  const s = withSessions();
  assert.ok(s.newWindowMessage('a'));
  assert.strictEqual(s.state().pending, null);
});

test('closeWindowMessage needs a known window and never marks a switch', () => {
  const s = withSessions();
  s.receive(windowsMessage('b', [win('@4', 1, 'logs')]));
  assert.strictEqual(s.closeWindowMessage('b', '@9'), null);
  assert.deepStrictEqual(decode(s.closeWindowMessage('b', '@4')), { type: 'close_window', session: 'b', window: '@4' });
  assert.strictEqual(s.state().pending, null);
});

test('forget drops the stored windows', () => {
  const s = withSessions();
  s.receive(windowsMessage('b', [win('@1', 0, 'zsh')]));
  s.forget();
  assert.strictEqual(s.windowsOf('b'), null);
});
