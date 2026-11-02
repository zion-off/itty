const Attempts = (() => {
  const STALE = Object.freeze({ status: 'stale' });

  const create = ({ timeoutMs, setTimer = setTimeout, clearTimer = clearTimeout }) => {
    let generation = 0;
    let current = null;

    const cancel = () => {
      generation += 1;
      if (!current) return;
      const attempt = current;
      current = null;
      attempt.controller.abort();
      attempt.finish(STALE);
    };

    const start = (task) => {
      cancel();
      const id = generation;
      const controller = new AbortController();
      return new Promise((resolve) => {
        let settled = false;
        const finish = (result) => {
          if (settled) return;
          settled = true;
          clearTimer(timer);
          if (current === attempt) current = null;
          resolve(id === generation ? result : STALE);
        };
        const attempt = { controller, finish };
        current = attempt;
        const timer = setTimer(() => {
          controller.abort();
          finish({ status: 'timeout' });
        }, timeoutMs);
        Promise.resolve()
          .then(() => task(controller.signal))
          .then(
            (value) => finish({ status: 'ok', value }),
            (error) => finish({ status: 'error', error }),
          );
      });
    };

    return { start, cancel };
  };

  return { create };
})();

if (typeof module !== 'undefined') module.exports = Attempts;
