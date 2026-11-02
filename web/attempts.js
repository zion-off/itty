const AttemptStatus = Object.freeze({ ok: 'ok', error: 'error', timeout: 'timeout', stale: 'stale' });
const Attempts = (() => {
    const STALE = Object.freeze({ status: AttemptStatus.stale });
    const create = ({ timeoutMs, setTimer = setTimeout, clearTimer = clearTimeout }) => {
        let generation = 0;
        let current = null;
        const cancel = () => {
            generation += 1;
            if (!current)
                return;
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
                    if (settled)
                        return;
                    settled = true;
                    clearTimer(timer);
                    if (current === attempt)
                        current = null;
                    resolve(id === generation ? result : STALE);
                };
                const attempt = { controller, finish };
                current = attempt;
                const timer = setTimer(() => {
                    controller.abort();
                    finish({ status: AttemptStatus.timeout });
                }, timeoutMs);
                Promise.resolve()
                    .then(() => task(controller.signal))
                    .then((value) => finish({ status: AttemptStatus.ok, value }), (error) => finish({ status: AttemptStatus.error, error }));
            });
        };
        return { start, cancel, active: () => current !== null };
    };
    return { create };
})();
if (typeof module !== 'undefined')
    module.exports = Attempts;
