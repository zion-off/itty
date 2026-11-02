const Keys = (() => {
  const controlByte = (ch) => {
    if (ch.length !== 1) return null;
    if (ch === ' ') return '\x00';
    if (ch === '?') return '\x7f';
    const code = ch.toUpperCase().charCodeAt(0);
    return code >= 64 && code <= 95 ? String.fromCharCode(code - 64) : null;
  };

  const arrow = (direction, applicationMode) => `\x1b${applicationMode ? 'O' : '['}${direction}`;

  const NAVIGATION = {
    pageUp: () => '\x1b[5~',
    pageDown: () => '\x1b[6~',
    home: (applicationMode) => `\x1b${applicationMode ? 'O' : '['}H`,
    end: (applicationMode) => `\x1b${applicationMode ? 'O' : '['}F`,
  };

  const navigation = (name, applicationMode) => NAVIGATION[name](applicationMode);

  const BACKTAB = '\x1b[Z';

  return { controlByte, arrow, navigation, BACKTAB };
})();

if (typeof module !== 'undefined') module.exports = Keys;
