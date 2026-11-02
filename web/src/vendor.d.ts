interface XtermTheme {
  background?: string;
  foreground?: string;
  cursor?: string;
  cursorAccent?: string;
  selectionBackground?: string;
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
}

interface XtermOptions {
  cursorBlink?: boolean;
  fontSize?: number;
  fontFamily?: string;
  theme?: XtermTheme;
  scrollback?: number;
}

type XtermMouseTrackingMode = 'none' | 'x10' | 'vt200' | 'drag' | 'any';

interface XtermModes {
  readonly applicationCursorKeysMode: boolean;
  readonly mouseTrackingMode: XtermMouseTrackingMode;
}

interface XtermDisposable {
  dispose(): void;
}

interface XtermAddon extends XtermDisposable {
  activate(terminal: XtermTerminal): void;
}

interface XtermTerminal {
  readonly element: HTMLElement | undefined;
  readonly textarea: HTMLTextAreaElement | undefined;
  readonly cols: number;
  readonly rows: number;
  readonly modes: XtermModes;
  options: XtermOptions;
  open(parent: HTMLElement): void;
  loadAddon(addon: XtermAddon): void;
  write(data: string | Uint8Array): void;
  input(data: string, wasUserInput?: boolean): void;
  reset(): void;
  onData(listener: (data: string) => void): XtermDisposable;
  onResize(listener: (size: { cols: number; rows: number }) => void): XtermDisposable;
}

interface XtermFitAddon extends XtermAddon {
  fit(): void;
}

declare const Terminal: new (options?: XtermOptions) => XtermTerminal;

declare const FitAddon: { FitAddon: new () => XtermFitAddon };
