const Dom = (() => {
    const event = Object.freeze({
        pointerDown: 'pointerdown',
        pointerMove: 'pointermove',
        pointerUp: 'pointerup',
        pointerCancel: 'pointercancel',
        pointerLeave: 'pointerleave',
        mouseDown: 'mousedown',
        mouseMove: 'mousemove',
        mouseUp: 'mouseup',
        click: 'click',
        keyDown: 'keydown',
        keyUp: 'keyup',
        beforeInput: 'beforeinput',
        input: 'input',
        compositionStart: 'compositionstart',
        compositionUpdate: 'compositionupdate',
        compositionEnd: 'compositionend',
        resize: 'resize',
        focus: 'focus',
        abort: 'abort',
        change: 'change',
        visibilityChange: 'visibilitychange',
    });
    const attr = Object.freeze({
        label: 'aria-label',
        expanded: 'aria-expanded',
        pressed: 'aria-pressed',
        checked: 'aria-checked',
        hidden: 'aria-hidden',
        role: 'role',
    });
    const icon = (strokeWidth, paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
    const missing = (what, type) => new Error(`itty: ${what} is missing or is not a ${type.name}`);
    const byId = (id, type) => {
        const found = document.getElementById(id);
        if (found instanceof type)
            return found;
        throw missing(`#${id}`, type);
    };
    const query = (root, selector, type) => {
        const found = root.querySelector(selector);
        if (found instanceof type)
            return found;
        throw missing(selector, type);
    };
    const setVar = (target, name, value) => target.style.setProperty(name, String(value));
    const now = () => performance.now();
    return { event, attr, byId, query, setVar, now, icon };
})();
if (typeof module !== 'undefined')
    module.exports = Dom;
