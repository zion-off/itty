"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const node_assert_1 = __importDefault(require("node:assert"));
const fakePage = (focused) => {
    const win = new EventTarget();
    const doc = { hasFocus: () => focused.value };
    return { win, doc };
};
(0, node_test_1.default)('resolves immediately when the document already has focus', async () => {
    const { win, doc } = fakePage({ value: true });
    await Focus.whenFocused({ doc, win });
});
(0, node_test_1.default)('waits for the focus event when the document is not focused', async () => {
    const state = { value: false };
    const { win, doc } = fakePage(state);
    let resolved = false;
    const waiting = Focus.whenFocused({ doc, win }).then(() => {
        resolved = true;
    });
    await Promise.resolve();
    node_assert_1.default.strictEqual(resolved, false);
    state.value = true;
    win.dispatchEvent(new Event('focus'));
    await waiting;
    node_assert_1.default.strictEqual(resolved, true);
});
(0, node_test_1.default)('rejects with AbortError when cancelled while waiting, and ignores a later focus', async () => {
    const { win, doc } = fakePage({ value: false });
    const controller = new AbortController();
    const waiting = Focus.whenFocused({ doc, win, signal: controller.signal });
    controller.abort();
    await node_assert_1.default.rejects(waiting, { name: 'AbortError' });
    win.dispatchEvent(new Event('focus'));
});
(0, node_test_1.default)('rejects immediately when the signal is already aborted', async () => {
    const { win, doc } = fakePage({ value: true });
    const controller = new AbortController();
    controller.abort();
    await node_assert_1.default.rejects(Focus.whenFocused({ doc, win, signal: controller.signal }), { name: 'AbortError' });
});
(0, node_test_1.default)('recognizes the browser focus error', () => {
    node_assert_1.default.strictEqual(Focus.isNotFocusedError(new Error('The document is not focused.')), true);
    node_assert_1.default.strictEqual(Focus.isNotFocusedError(new Error('network down')), false);
    node_assert_1.default.strictEqual(Focus.isNotFocusedError(undefined), false);
});
