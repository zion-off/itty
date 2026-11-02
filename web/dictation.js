const Dictation = (() => {
    const SETTLE_MS = 1000;
    const CAPTURE = true;
    const INPUT_TYPES = new Set(['insertText', 'insertReplacementText', 'insertCompositionText', 'insertFromComposition']);
    const INPUT_EVENTS = [Dom.event.beforeInput, Dom.event.input];
    const COMPOSITION_EVENTS = [Dom.event.compositionStart, Dom.event.compositionUpdate, Dom.event.compositionEnd];
    const create = ({ root, textarea, send, settleMs = SETTLE_MS, setTimer = setTimeout, clearTimer = clearTimeout, log = console.info, }) => {
        let keyIsDown = false;
        let holding = false;
        let baseline = '';
        let timer = null;
        const forTextarea = (handler) => (event) => {
            if (event.target === textarea)
                handler(event);
        };
        const swallow = (event) => event.stopImmediatePropagation();
        const flush = () => {
            if (!holding)
                return;
            if (timer !== null)
                clearTimer(timer);
            timer = null;
            holding = false;
            const text = textarea.value.slice(baseline.length);
            textarea.value = '';
            log('itty: dictation settled', text.length, 'chars');
            if (text)
                send(text);
        };
        const hold = () => {
            if (!holding) {
                holding = true;
                baseline = textarea.value;
                log('itty: dictation started');
            }
            if (timer !== null)
                clearTimer(timer);
            timer = setTimer(flush, settleMs);
        };
        const startsWithoutKeystroke = (event) => !keyIsDown &&
            (event.type === Dom.event.compositionStart || (event.inputType !== undefined && INPUT_TYPES.has(event.inputType)));
        const intercept = (event) => {
            if (!holding && !startsWithoutKeystroke(event))
                return;
            hold();
            swallow(event);
        };
        const onKeyDown = () => {
            keyIsDown = true;
            flush();
        };
        root.addEventListener(Dom.event.keyDown, forTextarea(onKeyDown), CAPTURE);
        root.addEventListener(Dom.event.keyUp, forTextarea(() => (keyIsDown = false)), CAPTURE);
        [...INPUT_EVENTS, ...COMPOSITION_EVENTS].forEach((type) => root.addEventListener(type, forTextarea(intercept), CAPTURE));
        return { flush, isHolding: () => holding };
    };
    return { create, SETTLE_MS };
})();
if (typeof module !== 'undefined')
    module.exports = Dictation;
