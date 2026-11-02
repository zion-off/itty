"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const node_assert_1 = __importDefault(require("node:assert"));
(0, node_test_1.default)('controlByte maps letters and symbols', () => {
    node_assert_1.default.strictEqual(Keys.controlByte('c'), '\x03');
    node_assert_1.default.strictEqual(Keys.controlByte('S'), '\x13');
    node_assert_1.default.strictEqual(Keys.controlByte('['), '\x1b');
    node_assert_1.default.strictEqual(Keys.controlByte(' '), '\x00');
    node_assert_1.default.strictEqual(Keys.controlByte('?'), '\x7f');
});
(0, node_test_1.default)('controlByte ignores multi-character and unmapped input', () => {
    node_assert_1.default.strictEqual(Keys.controlByte('ab'), null);
    node_assert_1.default.strictEqual(Keys.controlByte('1'), null);
    node_assert_1.default.strictEqual(Keys.controlByte(''), null);
});
(0, node_test_1.default)('arrow follows the cursor key mode', () => {
    node_assert_1.default.strictEqual(Keys.arrow('A', false), '\x1b[A');
    node_assert_1.default.strictEqual(Keys.arrow('A', true), '\x1bOA');
});
(0, node_test_1.default)('navigation keys follow the cursor key mode for home and end only', () => {
    node_assert_1.default.strictEqual(Keys.navigation('pageUp', true), '\x1b[5~');
    node_assert_1.default.strictEqual(Keys.navigation('pageDown', false), '\x1b[6~');
    node_assert_1.default.strictEqual(Keys.navigation('home', false), '\x1b[H');
    node_assert_1.default.strictEqual(Keys.navigation('home', true), '\x1bOH');
    node_assert_1.default.strictEqual(Keys.navigation('end', false), '\x1b[F');
    node_assert_1.default.strictEqual(Keys.navigation('end', true), '\x1bOF');
});
(0, node_test_1.default)('backtab is the reverse tab sequence', () => {
    node_assert_1.default.strictEqual(Keys.BACKTAB, '\x1b[Z');
});
