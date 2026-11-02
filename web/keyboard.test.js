"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const node_assert_1 = __importDefault(require("node:assert"));
const fakeTextarea = () => {
    const calls = [];
    return { calls, blur: () => calls.push('blur'), focus: () => calls.push('focus') };
};
const fakeViewport = (innerHeight, visibleHeight) => ({
    innerHeight,
    visualViewport: { height: visibleHeight },
});
(0, node_test_1.default)('isShowing is true when the visual viewport is much shorter than the layout viewport', () => {
    node_assert_1.default.strictEqual(Keyboard.isShowing(844, 550), true);
});
(0, node_test_1.default)('isShowing is false when both viewports match', () => {
    node_assert_1.default.strictEqual(Keyboard.isShowing(844, 844), false);
});
(0, node_test_1.default)('isShowing is false without a visual viewport', () => {
    node_assert_1.default.strictEqual(Keyboard.isShowing(844, undefined), false);
});
(0, node_test_1.default)('isShowing ignores a browser chrome change smaller than the threshold', () => {
    node_assert_1.default.strictEqual(Keyboard.isShowing(844, 844 - 80), false);
    node_assert_1.default.strictEqual(Keyboard.isShowing(844, 844 - Keyboard.MIN_KEYBOARD_HEIGHT_PX), false);
    node_assert_1.default.strictEqual(Keyboard.isShowing(844, 844 - Keyboard.MIN_KEYBOARD_HEIGHT_PX - 1), true);
});
(0, node_test_1.default)('show blurs then focuses the textarea, hide only blurs it', () => {
    const textarea = fakeTextarea();
    const keyboard = Keyboard.create({ textarea, onChange: () => { }, viewport: fakeViewport(844, 844) });
    keyboard.show();
    node_assert_1.default.deepStrictEqual(textarea.calls, ['blur', 'focus']);
    keyboard.hide();
    node_assert_1.default.deepStrictEqual(textarea.calls, ['blur', 'focus', 'blur']);
});
(0, node_test_1.default)('refresh reports only changes of the keyboard state', () => {
    const viewport = fakeViewport(844, 844);
    const changes = [];
    const keyboard = Keyboard.create({ textarea: fakeTextarea(), onChange: (v) => changes.push(v), viewport });
    keyboard.refresh();
    node_assert_1.default.deepStrictEqual(changes, []);
    viewport.visualViewport.height = 500;
    keyboard.refresh();
    keyboard.refresh();
    node_assert_1.default.deepStrictEqual(changes, [true]);
    node_assert_1.default.strictEqual(keyboard.isShowing(), true);
    viewport.visualViewport.height = 844;
    keyboard.refresh();
    node_assert_1.default.deepStrictEqual(changes, [true, false]);
});
