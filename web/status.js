const StatusLine = (() => {
  const create = (element) => {
    const text = element.querySelector('.status-text');
    return {
      show(message, tone = '') {
        text.textContent = message;
        element.dataset.tone = message ? tone : '';
      },
    };
  };

  return { create };
})();
