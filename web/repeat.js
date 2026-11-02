const Repeat = (() => {
  const create = ({ action, delayMs = 400, intervalMs = 70, setTimer = setTimeout, clearTimer = clearTimeout }) => {
    let timer = null;

    const stop = () => {
      if (timer === null) return;
      clearTimer(timer);
      timer = null;
    };

    const schedule = (waitMs) => {
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
