const FlickState = Object.freeze({
    idle: 'idle',
    pressed: 'pressed',
    repeating: 'repeating',
    open: 'open',
});
const Flick = (() => {
    const DRAG_PX = 10;
    const HOLD_MS = 250;
    const REPEAT_HOLD_MS = 300;
    const create = ({ hit, repeat = null, onTap, onOpen, onHighlight, onSelect, onClose, setTimer = setTimeout, clearTimer = clearTimeout, }) => {
        let state = FlickState.idle;
        let origin = null;
        let timer = null;
        let highlighted = null;
        const stopTimer = () => {
            if (timer === null)
                return;
            clearTimer(timer);
            timer = null;
        };
        const open = () => {
            stopTimer();
            state = FlickState.open;
            highlighted = null;
            onOpen();
        };
        const close = () => {
            state = FlickState.idle;
            highlighted = null;
            onClose();
        };
        const finish = () => {
            stopTimer();
            if (state === FlickState.repeating)
                repeat?.stop();
            state = FlickState.idle;
        };
        return {
            down({ x, y }) {
                finish();
                state = FlickState.pressed;
                origin = { x, y };
                timer = setTimer(() => {
                    timer = null;
                    if (repeat) {
                        state = FlickState.repeating;
                        repeat.start();
                    }
                    else {
                        open();
                    }
                }, repeat ? REPEAT_HOLD_MS : HOLD_MS);
            },
            move({ x, y }) {
                if (state === FlickState.pressed && origin && origin.y - y >= DRAG_PX)
                    open();
                if (state !== FlickState.open)
                    return;
                const index = hit(x, y);
                if (index === highlighted)
                    return;
                highlighted = index;
                onHighlight(index);
            },
            up({ x, y }) {
                if (state === FlickState.pressed) {
                    finish();
                    onTap();
                }
                else if (state === FlickState.open) {
                    const index = hit(x, y);
                    close();
                    if (index !== null)
                        onSelect(index);
                }
                else {
                    finish();
                }
            },
            cancel() {
                if (state === FlickState.open)
                    close();
                else
                    finish();
            },
        };
    };
    return { create, DRAG_PX, HOLD_MS, REPEAT_HOLD_MS };
})();
if (typeof module !== 'undefined')
    module.exports = Flick;
