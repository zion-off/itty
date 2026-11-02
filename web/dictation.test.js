"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const node_assert_1 = __importDefault(require("node:assert"));
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
        setTimer: (fn) => {
            timer = fn;
            return 1;
        },
        clearTimer: () => (timer = null),
        log: (...args) => logs.push(args.join(' ')),
    });
    const dispatch = (type, extra = {}) => {
        const event = {
            type,
            target: textarea,
            stopped: false,
            stopImmediatePropagation() {
                this.stopped = true;
            },
            ...extra,
        };
        (listeners.get(type) || []).forEach((handler) => handler(event));
        return event;
    };
    const dictate = (value, inputType = 'insertText') => {
        const event = dispatch('beforeinput', { inputType });
        if (!event.stopped)
            return event;
        textarea.value = value;
        dispatch('input', { inputType });
        return event;
    };
    return { textarea, dispatch, dictate, sent, logs, settle: () => timer && timer(), pending: () => timer !== null };
};
(0, node_test_1.default)('revisions of dictated text are held and only the final text is sent', () => {
    const { dictate, settle, sent } = setup();
    dictate('list');
    dictate('list the', 'insertReplacementText');
    dictate('list the files', 'insertReplacementText');
    node_assert_1.default.deepStrictEqual(sent, []);
    settle();
    node_assert_1.default.deepStrictEqual(sent, ['list the files']);
});
(0, node_test_1.default)('dictated events are hidden from the terminal', () => {
    const { dictate, dispatch } = setup();
    node_assert_1.default.strictEqual(dictate('hello').stopped, true);
    node_assert_1.default.strictEqual(dispatch('input', { inputType: 'insertText' }).stopped, true);
    node_assert_1.default.strictEqual(dispatch('compositionend').stopped, true);
});
(0, node_test_1.default)('typed characters pass through untouched', () => {
    const { dispatch, sent, pending } = setup();
    dispatch('keydown');
    node_assert_1.default.strictEqual(dispatch('beforeinput', { inputType: 'insertText' }).stopped, false);
    node_assert_1.default.strictEqual(dispatch('input', { inputType: 'insertText' }).stopped, false);
    dispatch('keyup');
    node_assert_1.default.strictEqual(pending(), false);
    node_assert_1.default.deepStrictEqual(sent, []);
});
(0, node_test_1.default)('a composition that begins without a keystroke is held', () => {
    const { dispatch } = setup();
    node_assert_1.default.strictEqual(dispatch('compositionstart').stopped, true);
});
(0, node_test_1.default)('a composition that follows a keystroke passes through', () => {
    const { dispatch } = setup();
    dispatch('keydown');
    node_assert_1.default.strictEqual(dispatch('compositionstart').stopped, false);
});
(0, node_test_1.default)('a key press sends the held text before the key is handled', () => {
    const { dictate, dispatch, sent, textarea } = setup();
    dictate('echo hi');
    dispatch('keydown');
    node_assert_1.default.deepStrictEqual(sent, ['echo hi']);
    node_assert_1.default.strictEqual(textarea.value, '');
});
(0, node_test_1.default)('the text field is cleared once the text is sent', () => {
    const { dictate, settle, textarea } = setup();
    dictate('pwd');
    settle();
    node_assert_1.default.strictEqual(textarea.value, '');
});
(0, node_test_1.default)('text that was already in the field is not sent again', () => {
    const { textarea, dictate, settle, sent } = setup();
    textarea.value = 'old';
    dictate('old new');
    settle();
    node_assert_1.default.deepStrictEqual(sent, [' new']);
});
(0, node_test_1.default)('dictation after a settled phrase starts a new phrase', () => {
    const { dictate, settle, sent } = setup();
    dictate('one');
    settle();
    dictate('two');
    settle();
    node_assert_1.default.deepStrictEqual(sent, ['one', 'two']);
});
(0, node_test_1.default)('nothing is sent when the held text ends up empty', () => {
    const { dictate, settle, sent } = setup();
    dictate('oops');
    dictate('', 'insertReplacementText');
    settle();
    node_assert_1.default.deepStrictEqual(sent, []);
});
(0, node_test_1.default)('events from other elements are ignored', () => {
    const { dispatch, pending } = setup();
    dispatch('beforeinput', { inputType: 'insertText', target: {} });
    node_assert_1.default.strictEqual(pending(), false);
});
(0, node_test_1.default)('logs never include the dictated text', () => {
    const { dictate, settle, logs } = setup();
    dictate('secret');
    settle();
    node_assert_1.default.ok(logs.length > 0);
    node_assert_1.default.ok(logs.every((line) => !line.includes('secret')));
});
