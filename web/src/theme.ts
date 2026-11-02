const TerminalTheme = (() => {
  const fontFamily = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, monospace';

  const darkAnsi: XtermTheme = {
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

  const lightAnsi: XtermTheme = {
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

  const FONT_SCALE = 0.85;
  const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';
  const TOKEN = Object.freeze({
    background: '--terminal-bg',
    foreground: '--terminal-fg',
    accent: '--accent',
    selection: '--terminal-selection',
  });

  const query = window.matchMedia(DARK_SCHEME_QUERY);
  const root = document.documentElement;

  const token = (name: string) => getComputedStyle(root).getPropertyValue(name).trim();

  const surface = (): XtermTheme => ({
    background: token(TOKEN.background),
    foreground: token(TOKEN.foreground),
    cursor: token(TOKEN.accent),
    cursorAccent: token(TOKEN.background),
    selectionBackground: token(TOKEN.selection),
  });

  const current = (): XtermTheme => ({ ...(query.matches ? darkAnsi : lightAnsi), ...surface() });
  const onChange = (listener: (theme: XtermTheme) => void) =>
    query.addEventListener(Dom.event.change, () => listener(current()));
  const fontSize = () => Math.round(parseFloat(getComputedStyle(root).fontSize) * FONT_SCALE);

  return { fontFamily, fontSize, current, onChange };
})();
