const Repeat = (() => {
    const DELAY_MS = 400;
    const INTERVAL_MS = 70;
    const create = ({ action, delayMs = DELAY_MS, intervalMs = INTERVAL_MS, setTimer = setTimeout, clearTimer = clearTimeout, }) => {
        let timer = null;
        const stop = () => {
            if (timer === null)
                return;
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
if (typeof module !== 'undefined')
    module.exports = Repeat;
