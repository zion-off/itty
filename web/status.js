const StatusTone = Object.freeze({
    none: '',
    pending: 'pending',
    success: 'success',
    error: 'error',
    info: 'info',
});
const StatusLine = (() => {
    const TEXT_SELECTOR = '.status-text';
    const create = (element) => {
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
