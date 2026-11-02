"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const node_assert_1 = __importDefault(require("node:assert"));
(0, node_test_1.default)('wheel up and down use buttons 64 and 65 in SGR form', () => {
    node_assert_1.default.strictEqual(Mouse.wheel('up', 5, 7), '\x1b[<64;5;7M');
    node_assert_1.default.strictEqual(Mouse.wheel('down', 5, 7), '\x1b[<65;5;7M');
});
(0, node_test_1.default)('press, drag and release use the left button, motion flag and a lowercase m', () => {
    node_assert_1.default.strictEqual(Mouse.press(1, 2), '\x1b[<0;1;2M');
    node_assert_1.default.strictEqual(Mouse.drag(3, 4), '\x1b[<32;3;4M');
    node_assert_1.default.strictEqual(Mouse.release(3, 4), '\x1b[<0;3;4m');
});
(0, node_test_1.default)('coordinates are clamped to at least 1 and floored', () => {
    node_assert_1.default.strictEqual(Mouse.press(0, -3), '\x1b[<0;1;1M');
    node_assert_1.default.strictEqual(Mouse.press(2.9, 3.2), '\x1b[<0;2;3M');
});
