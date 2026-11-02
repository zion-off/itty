const Mouse = (() => {
  const BUTTON = { left: 0, drag: 32, wheelUp: 64, wheelDown: 65 };

  const clamp = (value) => Math.max(1, Math.floor(value));

  const encode = ({ button, col, row, release = false }) =>
    `\x1b[<${button};${clamp(col)};${clamp(row)}${release ? 'm' : 'M'}`;

  const wheel = (direction, col, row) =>
    encode({ button: direction === 'up' ? BUTTON.wheelUp : BUTTON.wheelDown, col, row });
  const press = (col, row) => encode({ button: BUTTON.left, col, row });
  const release = (col, row) => encode({ button: BUTTON.left, col, row, release: true });
  const drag = (col, row) => encode({ button: BUTTON.drag, col, row });

  return { encode, wheel, press, release, drag, BUTTON };
})();

if (typeof module !== 'undefined') module.exports = Mouse;
