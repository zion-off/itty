const Keys = (() => {
  const controlByte = (ch) => {
    if (ch.length !== 1) return null;
    if (ch === ' ') return '\x00';
    if (ch === '?') return '\x7f';
    const code = ch.toUpperCase().charCodeAt(0);
    return code >= 64 && code <= 95 ? String.fromCharCode(code - 64) : null;
  };

  const arrow = (direction, applicationMode) => `\x1b${applicationMode ? 'O' : '['}${direction}`;

  return { controlByte, arrow };
})();

if (typeof module !== 'undefined') module.exports = Keys;
