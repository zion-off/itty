import path from 'node:path';

const MODULES: Readonly<Record<string, string>> = {
  Dom: 'dom.js',
  Narrow: 'narrow.js',
  Spring: 'spring.js',
  Attempts: 'attempts.js',
  Dictation: 'dictation.js',
  Dock: 'dock.js',
  Flick: 'flick.js',
  Focus: 'focus.js',
  Keyboard: 'keyboard.js',
  Keys: 'keys.js',
  Momentum: 'momentum.js',
  Mouse: 'mouse.js',
  Repeat: 'repeat.js',
  Reposition: 'reposition.js',
  Sessions: 'sessions.js',
  Stepper: 'stepper.js',
  Gesture: 'gesture.js',
};

for (const [name, file] of Object.entries(MODULES)) {
  const exported: unknown = require(path.join(__dirname, file));
  Object.defineProperty(globalThis, name, { value: exported, configurable: true });
}
