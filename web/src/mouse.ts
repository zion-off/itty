const ScrollDirection = Object.freeze({ up: 'up', down: 'down' });

type ScrollDirectionName = (typeof ScrollDirection)[keyof typeof ScrollDirection];

interface MouseReport {
  button: number;
  col: number;
  row: number;
  release?: boolean;
}

const Mouse = (() => {
  const BUTTON = Object.freeze({ left: 0, drag: 32, wheelUp: 64, wheelDown: 65 });
  const MIN_CELL = 1;
  const PRESS_SUFFIX = 'M';
  const RELEASE_SUFFIX = 'm';
  const SGR_PREFIX = '\x1b[<';

  const clamp = (value: number) => Math.max(MIN_CELL, Math.floor(value));

  const encode = ({ button, col, row, release = false }: MouseReport) =>
    `${SGR_PREFIX}${button};${clamp(col)};${clamp(row)}${release ? RELEASE_SUFFIX : PRESS_SUFFIX}`;

  const wheel = (direction: ScrollDirectionName, col: number, row: number) =>
    encode({ button: direction === ScrollDirection.up ? BUTTON.wheelUp : BUTTON.wheelDown, col, row });
  const press = (col: number, row: number) => encode({ button: BUTTON.left, col, row });
  const release = (col: number, row: number) => encode({ button: BUTTON.left, col, row, release: true });
  const drag = (col: number, row: number) => encode({ button: BUTTON.drag, col, row });

  return { encode, wheel, press, release, drag, BUTTON, ScrollDirection };
})();

if (typeof module !== 'undefined') module.exports = Mouse;
