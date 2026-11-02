const TerminalTheme = (() => {
  const fontFamily = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, monospace';

  const dark = {
    background: '#000000',
    foreground: '#f2f2f7',
    cursor: '#0a84ff',
    cursorAccent: '#000000',
    selectionBackground: 'rgba(10, 132, 255, 0.35)',
    black: '#1c1c1e',
    red: '#ff453a',
    green: '#32d74b',
    yellow: '#ffd60a',
    blue: '#0a84ff',
    magenta: '#bf5af2',
    cyan: '#64d2ff',
    white: '#d1d1d6',
    brightBlack: '#636366',
    brightRed: '#ff6961',
    brightGreen: '#30db5b',
    brightYellow: '#ffd426',
    brightBlue: '#409cff',
    brightMagenta: '#da8fff',
    brightCyan: '#70d7ff',
    brightWhite: '#ffffff',
  };

  const light = {
    background: '#ffffff',
    foreground: '#1c1c1e',
    cursor: '#007aff',
    cursorAccent: '#ffffff',
    selectionBackground: 'rgba(0, 122, 255, 0.25)',
    black: '#1c1c1e',
    red: '#d70015',
    green: '#248a3d',
    yellow: '#a05a00',
    blue: '#0040dd',
    magenta: '#ad44ab',
    cyan: '#0071a4',
    white: '#aeaeb2',
    brightBlack: '#6c6c70',
    brightRed: '#ff3b30',
    brightGreen: '#30b94d',
    brightYellow: '#c79200',
    brightBlue: '#007aff',
    brightMagenta: '#c75bc6',
    brightCyan: '#32ade6',
    brightWhite: '#636366',
  };

  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const current = () => (query.matches ? dark : light);
  const onChange = (listener) => query.addEventListener('change', () => listener(current()));

  return { fontFamily, current, onChange };
})();
