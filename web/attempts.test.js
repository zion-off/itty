"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const node_assert_1 = __importDefault(require("node:assert"));
const fakeTimers = () => {
    const timers = new Map();
    let next = 1;
    return {
        setTimer: (fn) => {
            timers.set(next, fn);
            return next++;
        },
        clearTimer: (id) => timers.delete(id),
        fireAll: () => [...timers.values()].forEach((fn) => fn()),
        pending: () => timers.size,
    };
};
const deferred = () => {
    let resolve = () => { };
    let reject = () => { };
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};
(0, node_test_1.default)('a completed task resolves ok and clears its timer', async () => {
    const timers = fakeTimers();
    const attempts = Attempts.create({ timeoutMs: 30000, ...timers });
    const result = await attempts.start(async () => 'ticket');
    node_assert_1.default.deepStrictEqual(result, { status: 'ok', value: 'ticket' });
    node_assert_1.default.strictEqual(timers.pending(), 0);
});
(0, node_test_1.default)('a failing task resolves with the error', async () => {
    const attempts = Attempts.create({ timeoutMs: 30000, ...fakeTimers() });
    const boom = new Error('boom');
    const result = await attempts.start(async () => {
        throw boom;
    });
    node_assert_1.default.deepStrictEqual(result, { status: 'error', error: boom });
});
(0, node_test_1.default)('a task that never settles times out and is aborted', async () => {
    const timers = fakeTimers();
    const attempts = Attempts.create({ timeoutMs: 30000, ...timers });
    let signal;
    const pending = attempts.start((s) => {
        signal = s;
        return new Promise(() => { });
    });
    await Promise.resolve();
    timers.fireAll();
    node_assert_1.default.deepStrictEqual(await pending, { status: 'timeout' });
    node_assert_1.default.strictEqual(signal?.aborted, true);
});
(0, node_test_1.default)('starting a new attempt makes the previous one stale and aborts it', async () => {
    const attempts = Attempts.create({ timeoutMs: 30000, ...fakeTimers() });
    const first = deferred();
    let firstSignal;
    const firstResult = attempts.start((s) => {
        firstSignal = s;
        return first.promise;
    });
    const secondResult = attempts.start(async () => 'second');
    node_assert_1.default.deepStrictEqual(await firstResult, { status: 'stale' });
    node_assert_1.default.strictEqual(firstSignal?.aborted, true);
    node_assert_1.default.deepStrictEqual(await secondResult, { status: 'ok', value: 'second' });
    first.resolve('late-ticket');
});
(0, node_test_1.default)('a late result after cancel is ignored', async () => {
    const attempts = Attempts.create({ timeoutMs: 30000, ...fakeTimers() });
    const task = deferred();
    const result = attempts.start(() => task.promise);
    attempts.cancel();
    task.resolve('late-ticket');
    node_assert_1.default.deepStrictEqual(await result, { status: 'stale' });
});
(0, node_test_1.default)('cancel with nothing in flight is harmless', async () => {
    const attempts = Attempts.create({ timeoutMs: 30000, ...fakeTimers() });
    attempts.cancel();
    node_assert_1.default.deepStrictEqual(await attempts.start(async () => 1), { status: 'ok', value: 1 });
});
(0, node_test_1.default)('active reports an attempt in flight until it settles or is cancelled', async () => {
    const attempts = Attempts.create({ timeoutMs: 30000, ...fakeTimers() });
    node_assert_1.default.strictEqual(attempts.active(), false);
    const task = deferred();
    const result = attempts.start(() => task.promise);
    node_assert_1.default.strictEqual(attempts.active(), true);
    task.resolve('ticket');
    await result;
    node_assert_1.default.strictEqual(attempts.active(), false);
    const cancelled = attempts.start(() => deferred().promise);
    attempts.cancel();
    await cancelled;
    node_assert_1.default.strictEqual(attempts.active(), false);
});
