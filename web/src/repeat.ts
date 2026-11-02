interface RepeatOptions {
  action: () => void;
  delayMs?: number;
  intervalMs?: number;
  setTimer?: SetTimer;
  clearTimer?: ClearTimer;
}

interface RepeatInstance {
  start(): void;
  stop(): void;
}

const Repeat = (() => {
  const DELAY_MS = 400;
  const INTERVAL_MS = 70;

  const create = ({
    action,
    delayMs = DELAY_MS,
    intervalMs = INTERVAL_MS,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  }: RepeatOptions): RepeatInstance => {
    let timer: TimerHandle | null = null;

    const stop = () => {
      if (timer === null) return;
      clearTimer(timer);
      timer = null;
    };

    const schedule = (waitMs: number) => {
      timer = setTimer(() => {
        action();
        schedule(intervalMs);
      }, waitMs);
    };

    return {
      start() {
        stop();
        action();
        schedule(delayMs);
      },
      stop,
    };
  };

  return { create };
})();

if (typeof module !== 'undefined') module.exports = Repeat;
