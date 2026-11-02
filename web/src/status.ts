const StatusTone = Object.freeze({
  none: '',
  pending: 'pending',
  success: 'success',
  error: 'error',
  info: 'info',
});

type StatusToneName = (typeof StatusTone)[keyof typeof StatusTone];

interface StatusLineInstance {
  show(message: string, tone?: StatusToneName): void;
}

const StatusLine = (() => {
  const TEXT_SELECTOR = '.status-text';

  const create = (element: HTMLElement): StatusLineInstance => {
    const text = Dom.query(element, TEXT_SELECTOR, HTMLElement);
    return {
      show(message, tone = StatusTone.none) {
        text.textContent = message;
        element.dataset['tone'] = message ? tone : StatusTone.none;
      },
    };
  };

  return { create };
})();
