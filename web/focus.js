const Focus = (() => {
  const abortError = () => new DOMException('Waiting for focus was cancelled', 'AbortError');

  const whenFocused = ({ signal, doc = document, win = window } = {}) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      if (doc.hasFocus()) {
        resolve();
        return;
      }
      const onFocus = () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      };
      const onAbort = () => {
        win.removeEventListener('focus', onFocus);
        reject(abortError());
      };
      win.addEventListener('focus', onFocus, { once: true });
      signal?.addEventListener('abort', onAbort, { once: true });
    });

  const isNotFocusedError = (error) => /not focused/i.test(error?.message ?? '');

  return { whenFocused, isNotFocusedError };
})();

if (typeof module !== 'undefined') module.exports = Focus;
