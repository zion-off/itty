interface DictationEvent {
  type: string;
  target: unknown;
  inputType?: string;
  stopImmediatePropagation(): void;
}

type DictationHandler = (event: DictationEvent) => void;

interface DictationRoot {
  addEventListener(type: string, handler: DictationHandler, capture: boolean): void;
}

interface DictationTextarea {
  value: string;
}

interface DictationOptions {
  root: DictationRoot;
  textarea: DictationTextarea;
  send: (text: string) => void;
  settleMs?: number;
  setTimer?: SetTimer;
  clearTimer?: ClearTimer;
  log?: (...args: unknown[]) => void;
}

interface DictationInstance {
  flush(): void;
  isHolding(): boolean;
}

const Dictation = (() => {
  const SETTLE_MS = 1000;
  const CAPTURE = true;
  const INPUT_TYPES = new Set(['insertText', 'insertReplacementText', 'insertCompositionText', 'insertFromComposition']);
  const INPUT_EVENTS = [Dom.event.beforeInput, Dom.event.input];
  const COMPOSITION_EVENTS = [Dom.event.compositionStart, Dom.event.compositionUpdate, Dom.event.compositionEnd];

  const create = ({
    root,
    textarea,
    send,
    settleMs = SETTLE_MS,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    log = console.info,
  }: DictationOptions): DictationInstance => {
    let keyIsDown = false;
    let holding = false;
    let baseline = '';
    let timer: TimerHandle | null = null;

    const forTextarea = (handler: DictationHandler): DictationHandler => (event) => {
      if (event.target === textarea) handler(event);
    };

    const swallow = (event: DictationEvent) => event.stopImmediatePropagation();

    const flush = () => {
      if (!holding) return;
      if (timer !== null) clearTimer(timer);
      timer = null;
      holding = false;
      const text = textarea.value.slice(baseline.length);
      textarea.value = '';
      log('itty: dictation settled', text.length, 'chars');
      if (text) send(text);
    };

    const hold = () => {
      if (!holding) {
        holding = true;
        baseline = textarea.value;
        log('itty: dictation started');
      }
      if (timer !== null) clearTimer(timer);
      timer = setTimer(flush, settleMs);
    };

    const startsWithoutKeystroke = (event: DictationEvent) =>
      !keyIsDown &&
      (event.type === Dom.event.compositionStart || (event.inputType !== undefined && INPUT_TYPES.has(event.inputType)));

    const intercept: DictationHandler = (event) => {
      if (!holding && !startsWithoutKeystroke(event)) return;
      hold();
      swallow(event);
    };

    const onKeyDown = () => {
      keyIsDown = true;
      flush();
    };

    root.addEventListener(Dom.event.keyDown, forTextarea(onKeyDown), CAPTURE);
    root.addEventListener(Dom.event.keyUp, forTextarea(() => (keyIsDown = false)), CAPTURE);
    [...INPUT_EVENTS, ...COMPOSITION_EVENTS].forEach((type) =>
      root.addEventListener(type, forTextarea(intercept), CAPTURE),
    );

    return { flush, isHolding: () => holding };
  };

  return { create, SETTLE_MS };
})();

if (typeof module !== 'undefined') module.exports = Dictation;
