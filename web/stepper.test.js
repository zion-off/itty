"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const node_assert_1 = __importDefault(require("node:assert"));
(0, node_test_1.default)('add returns nothing until a full step has accumulated', () => {
    const s = Stepper.create({ stepPx: 10 });
    node_assert_1.default.strictEqual(s.add(6), null);
    node_assert_1.default.deepStrictEqual(s.add(6), { direction: 'up', steps: 1 });
});
(0, node_test_1.default)('negative distance steps down and the remainder carries over', () => {
    const s = Stepper.create({ stepPx: 10 });
    node_assert_1.default.deepStrictEqual(s.add(-25), { direction: 'down', steps: 2 });
    node_assert_1.default.deepStrictEqual(s.add(-5), { direction: 'down', steps: 1 });
});
(0, node_test_1.default)('steps are capped but the whole distance is consumed', () => {
    const s = Stepper.create({ stepPx: 10, maxSteps: 3 });
    node_assert_1.default.deepStrictEqual(s.add(100), { direction: 'up', steps: 3 });
    node_assert_1.default.strictEqual(s.add(5), null);
});
(0, node_test_1.default)('stepPx may be a function evaluated on every call', () => {
    let size = 10;
    const s = Stepper.create({ stepPx: () => size });
    size = 50;
    node_assert_1.default.strictEqual(s.add(20), null);
});
(0, node_test_1.default)('reset discards the remainder', () => {
    const s = Stepper.create({ stepPx: 10 });
    s.add(9);
    s.reset();
    node_assert_1.default.strictEqual(s.add(2), null);
});
