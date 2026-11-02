const ScrollDirection = Object.freeze({ up: 'up', down: 'down' });
const Mouse = (() => {
    const BUTTON = Object.freeze({ left: 0, drag: 32, wheelUp: 64, wheelDown: 65 });
    const MIN_CELL = 1;
    const PRESS_SUFFIX = 'M';
    const RELEASE_SUFFIX = 'm';
    const SGR_PREFIX = '\x1b[<';
    const clamp = (value) => Math.max(MIN_CELL, Math.floor(value));
    const encode = ({ button, col, row, release = false }) => `${SGR_PREFIX}${button};${clamp(col)};${clamp(row)}${release ? RELEASE_SUFFIX : PRESS_SUFFIX}`;
    const wheel = (direction, col, row) => encode({ button: direction === ScrollDirection.up ? BUTTON.wheelUp : BUTTON.wheelDown, col, row });
    const press = (col, row) => encode({ button: BUTTON.left, col, row });
    const release = (col, row) => encode({ button: BUTTON.left, col, row, release: true });
    const drag = (col, row) => encode({ button: BUTTON.drag, col, row });
    return { encode, wheel, press, release, drag, BUTTON, ScrollDirection };
})();
if (typeof module !== 'undefined')
    module.exports = Mouse;
