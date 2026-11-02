"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const node_assert_1 = __importDefault(require("node:assert"));
const decode = (message) => JSON.parse(String(message));
const fieldOf = (update, field) => update === null ? undefined : Reflect.get(update, field);
const sessionsMessage = (current, sessions) => JSON.stringify({ type: 'sessions', current, sessions });
const errorMessage = (message) => JSON.stringify({ type: 'error', message });
(0, node_test_1.default)('the first sessions message sets the state and resets the terminal', () => {
    const sessions = Sessions.create();
    node_assert_1.default.deepStrictEqual(sessions.receive(sessionsMessage('work', ['itty', 'work'])), { type: 'sessions', reset: true });
    node_assert_1.default.deepStrictEqual(sessions.state(), { current: 'work', sessions: ['itty', 'work'], pending: null });
});
(0, node_test_1.default)('a different current session requires a reset', () => {
    const sessions = Sessions.create();
    sessions.receive(sessionsMessage('work', ['itty', 'work']));
    node_assert_1.default.strictEqual(fieldOf(sessions.receive(sessionsMessage('itty', ['itty', 'work'])), 'reset'), true);
    node_assert_1.default.strictEqual(sessions.state().current, 'itty');
});
(0, node_test_1.default)('the same current session does not reset but refreshes the list', () => {
    const sessions = Sessions.create();
    sessions.receive(sessionsMessage('work', ['work']));
    const update = sessions.receive(sessionsMessage('work', ['itty', 'work']));
    node_assert_1.default.deepStrictEqual(update, { type: 'sessions', reset: false });
    node_assert_1.default.deepStrictEqual(sessions.state().sessions, ['itty', 'work']);
});
(0, node_test_1.default)('a single session list is accepted', () => {
    const sessions = Sessions.create();
    node_assert_1.default.strictEqual(fieldOf(sessions.receive(sessionsMessage('main', ['main'])), 'type'), 'sessions');
});
(0, node_test_1.default)('malformed and unknown messages are ignored without changing state', () => {
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
    ignored.forEach((raw) => node_assert_1.default.strictEqual(sessions.receive(raw), null, String(raw)));
    node_assert_1.default.deepStrictEqual(sessions.state(), before);
});
(0, node_test_1.default)('an error message is reported and keeps the current session', () => {
    const sessions = Sessions.create();
    sessions.receive(sessionsMessage('work', ['itty', 'work']));
    node_assert_1.default.deepStrictEqual(sessions.receive(errorMessage('unknown session')), {
        type: 'error',
        message: 'unknown session',
    });
    node_assert_1.default.strictEqual(sessions.state().current, 'work');
});
(0, node_test_1.default)('an error without a message gets a generic one', () => {
    const sessions = Sessions.create();
    node_assert_1.default.strictEqual(fieldOf(sessions.receive(JSON.stringify({ type: 'error' })), 'message'), 'request failed');
});
(0, node_test_1.default)('switchMessage builds the request and marks it pending', () => {
    const sessions = Sessions.create();
    sessions.receive(sessionsMessage('work', ['itty', 'work']));
    node_assert_1.default.deepStrictEqual(decode(sessions.switchMessage('itty')), { type: 'switch', session: 'itty' });
    node_assert_1.default.strictEqual(sessions.state().pending, 'itty');
});
(0, node_test_1.default)('switchMessage refuses the current session and unknown names', () => {
    const sessions = Sessions.create();
    sessions.receive(sessionsMessage('work', ['itty', 'work']));
    node_assert_1.default.strictEqual(sessions.switchMessage('work'), null);
    node_assert_1.default.strictEqual(sessions.switchMessage('other'), null);
    node_assert_1.default.strictEqual(sessions.state().pending, null);
});
(0, node_test_1.default)('pending clears on a sessions message and on an error', () => {
    const sessions = Sessions.create();
    sessions.receive(sessionsMessage('work', ['itty', 'work']));
    sessions.switchMessage('itty');
    sessions.receive(sessionsMessage('itty', ['itty', 'work']));
    node_assert_1.default.strictEqual(sessions.state().pending, null);
    sessions.switchMessage('work');
    sessions.receive(errorMessage('unknown session'));
    node_assert_1.default.strictEqual(sessions.state().pending, null);
});
(0, node_test_1.default)('listMessage builds the list request', () => {
    node_assert_1.default.deepStrictEqual(JSON.parse(Sessions.create().listMessage()), { type: 'list' });
});
(0, node_test_1.default)('forget clears the state so a new connection resets the terminal', () => {
    const sessions = Sessions.create();
    sessions.receive(sessionsMessage('work', ['work']));
    sessions.forget();
    node_assert_1.default.deepStrictEqual(sessions.state(), { current: null, sessions: [], pending: null });
    node_assert_1.default.strictEqual(fieldOf(sessions.receive(sessionsMessage('work', ['work'])), 'reset'), true);
});
const windowsMessage = (session, windows) => JSON.stringify({ type: 'windows', session, windows });
const win = (id, index, name, active = false) => ({ id, index, name, active });
const withSessions = () => {
    const s = Sessions.create();
    s.receive(JSON.stringify({ type: 'sessions', current: 'a', sessions: ['a', 'b'] }));
    return s;
};
(0, node_test_1.default)('a windows message is stored per session', () => {
    const s = withSessions();
    const update = s.receive(windowsMessage('b', [win('@1', 0, 'zsh', true)]));
    node_assert_1.default.deepStrictEqual(update, { type: 'windows', session: 'b' });
    node_assert_1.default.deepStrictEqual(s.windowsOf('b'), [win('@1', 0, 'zsh', true)]);
    node_assert_1.default.strictEqual(s.windowsOf('a'), null);
});
(0, node_test_1.default)('malformed windows messages are ignored', () => {
    const s = withSessions();
    node_assert_1.default.strictEqual(s.receive(windowsMessage('b', [{ id: '@1' }])), null);
    node_assert_1.default.strictEqual(s.receive(JSON.stringify({ type: 'windows', session: 'b' })), null);
    node_assert_1.default.strictEqual(s.windowsOf('b'), null);
});
(0, node_test_1.default)('windowsMessage only asks for known sessions', () => {
    const s = withSessions();
    node_assert_1.default.deepStrictEqual(decode(s.windowsMessage('b')), { type: 'windows', session: 'b' });
    node_assert_1.default.strictEqual(s.windowsMessage('nope'), null);
});
(0, node_test_1.default)('selectMessage needs a known window and marks a session change as pending', () => {
    const s = withSessions();
    s.receive(windowsMessage('b', [win('@4', 1, 'logs')]));
    node_assert_1.default.strictEqual(s.selectMessage('b', '@9'), null);
    node_assert_1.default.deepStrictEqual(decode(s.selectMessage('b', '@4')), { type: 'select', session: 'b', window: '@4' });
    node_assert_1.default.strictEqual(s.state().pending, 'b');
});
(0, node_test_1.default)('selecting a window of the current session is not a pending switch', () => {
    const s = withSessions();
    s.receive(windowsMessage('a', [win('@1', 0, 'zsh')]));
    node_assert_1.default.ok(s.selectMessage('a', '@1'));
    node_assert_1.default.strictEqual(s.state().pending, null);
});
(0, node_test_1.default)('newWindowMessage needs a known session and marks a session change as pending', () => {
    const s = withSessions();
    node_assert_1.default.strictEqual(s.newWindowMessage('nope'), null);
    node_assert_1.default.deepStrictEqual(decode(s.newWindowMessage('b')), { type: 'new_window', session: 'b' });
    node_assert_1.default.strictEqual(s.state().pending, 'b');
});
(0, node_test_1.default)('creating a window in the current session is not a pending switch', () => {
    const s = withSessions();
    node_assert_1.default.ok(s.newWindowMessage('a'));
    node_assert_1.default.strictEqual(s.state().pending, null);
});
(0, node_test_1.default)('closeWindowMessage needs a known window and never marks a switch', () => {
    const s = withSessions();
    s.receive(windowsMessage('b', [win('@4', 1, 'logs')]));
    node_assert_1.default.strictEqual(s.closeWindowMessage('b', '@9'), null);
    node_assert_1.default.deepStrictEqual(decode(s.closeWindowMessage('b', '@4')), { type: 'close_window', session: 'b', window: '@4' });
    node_assert_1.default.strictEqual(s.state().pending, null);
});
(0, node_test_1.default)('forget drops the stored windows', () => {
    const s = withSessions();
    s.receive(windowsMessage('b', [win('@1', 0, 'zsh')]));
    s.forget();
    node_assert_1.default.strictEqual(s.windowsOf('b'), null);
});
