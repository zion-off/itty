interface FocusDocument {
  hasFocus(): boolean;
}

interface FocusWindow {
  addEventListener(type: string, listener: () => void, options: { once: boolean }): void;
  removeEventListener(type: string, listener: () => void): void;
}

interface FocusOptions {
  signal?: AbortSignal;
  doc?: FocusDocument;
  win?: FocusWindow;
}

const Focus = (() => {
  const ABORT_MESSAGE = 'Waiting for focus was cancelled';
  const ABORT_NAME = 'AbortError';
  const NOT_FOCUSED = /not focused/i;

  const abortError = () => new DOMException(ABORT_MESSAGE, ABORT_NAME);

  const whenFocused = ({ signal, doc = document, win = window }: FocusOptions = {}): Promise<void> =>
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
        signal?.removeEventListener(Dom.event.abort, onAbort);
        resolve();
      };
      const onAbort = () => {
        win.removeEventListener(Dom.event.focus, onFocus);
        reject(abortError());
      };
      win.addEventListener(Dom.event.focus, onFocus, { once: true });
      signal?.addEventListener(Dom.event.abort, onAbort, { once: true });
    });

  const isNotFocusedError = (error: unknown) => NOT_FOCUSED.test(Narrow.errorMessage(error));

  return { whenFocused, isNotFocusedError };
})();

if (typeof module !== 'undefined') module.exports = Focus;
