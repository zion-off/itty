import test from 'node:test';
import assert from 'node:assert';

const fakeTimers = () => {
  const timers = new Map<TimerHandle, () => void>();
  let next = 1;
  return {
    setTimer: (fn: () => void) => {
      timers.set(next, fn);
      return next++;
    },
    clearTimer: (id: TimerHandle) => timers.delete(id),
    fireAll: () => [...timers.values()].forEach((fn) => fn()),
    pending: () => timers.size,
  };
};

const deferred = <T = string>() => {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

test('a completed task resolves ok and clears its timer', async () => {
  const timers = fakeTimers();
  const attempts = Attempts.create({ timeoutMs: 30000, ...timers });
  const result = await attempts.start(async () => 'ticket');
  assert.deepStrictEqual(result, { status: 'ok', value: 'ticket' });
  assert.strictEqual(timers.pending(), 0);
});

test('a failing task resolves with the error', async () => {
  const attempts = Attempts.create({ timeoutMs: 30000, ...fakeTimers() });
  const boom = new Error('boom');
  const result = await attempts.start(async () => {
    throw boom;
  });
  assert.deepStrictEqual(result, { status: 'error', error: boom });
});

test('a task that never settles times out and is aborted', async () => {
  const timers = fakeTimers();
  const attempts = Attempts.create({ timeoutMs: 30000, ...timers });
  let signal: AbortSignal | undefined;
  const pending = attempts.start((s) => {
    signal = s;
    return new Promise(() => {});
  });
  await Promise.resolve();
  timers.fireAll();
  assert.deepStrictEqual(await pending, { status: 'timeout' });
  assert.strictEqual(signal?.aborted, true);
});

test('starting a new attempt makes the previous one stale and aborts it', async () => {
  const attempts = Attempts.create({ timeoutMs: 30000, ...fakeTimers() });
  const first = deferred();
  let firstSignal: AbortSignal | undefined;
  const firstResult = attempts.start((s) => {
    firstSignal = s;
    return first.promise;
  });
  const secondResult = attempts.start(async () => 'second');
  assert.deepStrictEqual(await firstResult, { status: 'stale' });
  assert.strictEqual(firstSignal?.aborted, true);
  assert.deepStrictEqual(await secondResult, { status: 'ok', value: 'second' });
  first.resolve('late-ticket');
});

test('a late result after cancel is ignored', async () => {
  const attempts = Attempts.create({ timeoutMs: 30000, ...fakeTimers() });
  const task = deferred();
  const result = attempts.start(() => task.promise);
  attempts.cancel();
  task.resolve('late-ticket');
  assert.deepStrictEqual(await result, { status: 'stale' });
});

test('cancel with nothing in flight is harmless', async () => {
  const attempts = Attempts.create({ timeoutMs: 30000, ...fakeTimers() });
  attempts.cancel();
  assert.deepStrictEqual(await attempts.start(async () => 1), { status: 'ok', value: 1 });
});

test('active reports an attempt in flight until it settles or is cancelled', async () => {
  const attempts = Attempts.create({ timeoutMs: 30000, ...fakeTimers() });
  assert.strictEqual(attempts.active(), false);
  const task = deferred();
  const result = attempts.start(() => task.promise);
  assert.strictEqual(attempts.active(), true);
  task.resolve('ticket');
  await result;
  assert.strictEqual(attempts.active(), false);
  const cancelled = attempts.start(() => deferred().promise);
  attempts.cancel();
  await cancelled;
  assert.strictEqual(attempts.active(), false);
});
