const Keyboard = (() => {
    const MIN_KEYBOARD_HEIGHT_PX = 120;
    const isShowing = (layoutHeight, visibleHeight) => typeof visibleHeight === 'number' && layoutHeight - visibleHeight > MIN_KEYBOARD_HEIGHT_PX;
    const create = ({ textarea, onChange, viewport = window }) => {
        let showing = false;
        const refresh = () => {
            const next = isShowing(viewport.innerHeight, viewport.visualViewport?.height);
            if (next === showing)
                return;
            showing = next;
            onChange(showing);
        };
        return {
            refresh,
            isShowing: () => showing,
            show() {
                textarea.blur();
                textarea.focus();
            },
            hide: () => textarea.blur(),
        };
    };
    return { create, isShowing, MIN_KEYBOARD_HEIGHT_PX };
})();
if (typeof module !== 'undefined')
    module.exports = Keyboard;
