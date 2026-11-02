const AttemptStatus = Object.freeze({ ok: 'ok', error: 'error', timeout: 'timeout', stale: 'stale' });

interface StaleResult {
  status: typeof AttemptStatus.stale;
}

type AttemptResult<T> =
  | { status: typeof AttemptStatus.ok; value: T }
  | { status: typeof AttemptStatus.error; error: unknown }
  | { status: typeof AttemptStatus.timeout }
  | StaleResult;

interface AttemptsOptions {
  timeoutMs: number;
  setTimer?: SetTimer;
  clearTimer?: ClearTimer;
}

interface ActiveAttempt {
  controller: AbortController;
  finish(result: StaleResult): void;
}

interface AttemptsInstance {
  start<T>(task: (signal: AbortSignal) => Promise<T>): Promise<AttemptResult<T>>;
  cancel(): void;
  active(): boolean;
}

const Attempts = (() => {
  const STALE: StaleResult = Object.freeze({ status: AttemptStatus.stale });

  const create = ({ timeoutMs, setTimer = setTimeout, clearTimer = clearTimeout }: AttemptsOptions): AttemptsInstance => {
    let generation = 0;
    let current: ActiveAttempt | null = null;

    const cancel = () => {
      generation += 1;
      if (!current) return;
      const attempt = current;
      current = null;
      attempt.controller.abort();
      attempt.finish(STALE);
    };

    const start = <T>(task: (signal: AbortSignal) => Promise<T>) => {
      cancel();
      const id = generation;
      const controller = new AbortController();
      return new Promise<AttemptResult<T>>((resolve) => {
        let settled = false;
        const finish = (result: AttemptResult<T>) => {
          if (settled) return;
          settled = true;
          clearTimer(timer);
          if (current === attempt) current = null;
          resolve(id === generation ? result : STALE);
        };
        const attempt: ActiveAttempt = { controller, finish };
        current = attempt;
        const timer = setTimer(() => {
          controller.abort();
          finish({ status: AttemptStatus.timeout });
        }, timeoutMs);
        Promise.resolve()
          .then(() => task(controller.signal))
          .then(
            (value) => finish({ status: AttemptStatus.ok, value }),
            (error: unknown) => finish({ status: AttemptStatus.error, error }),
          );
      });
    };

    return { start, cancel, active: () => current !== null };
  };

  return { create };
})();

if (typeof module !== 'undefined') module.exports = Attempts;
