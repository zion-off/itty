const Touch = (() => {
  const COMPAT_MOUSE_WINDOW_MS = 800;
  const CLICK_SUPPRESS_MS = 600;
  const MAX_STEPS = 8;

  const create = ({ element, term, send, now = () => performance.now() }) => {
    let lastTouchAt = -Infinity;
    let lastConsumedAt = -Infinity;
    let gestureLive = false;

    const trackingMouse = () => term.modes.mouseTrackingMode !== 'none';

    const cellAt = ({ x, y }) => {
      const screen = term.element.querySelector('.xterm-screen');
      const rect = screen.getBoundingClientRect();
      return {
        col: Math.min(term.cols, Math.max(1, Math.floor(((x - rect.left) / rect.width) * term.cols) + 1)),
        row: Math.min(term.rows, Math.max(1, Math.floor(((y - rect.top) / rect.height) * term.rows) + 1)),
      };
    };

    const wheelStepPx = () => term.element.querySelector('.xterm-screen').getBoundingClientRect().height / term.rows;

    const emitScroll = ({ direction, steps, x, y }) => {
      const { col, row } = cellAt({ x, y });
      send(Mouse.wheel(direction, col, row).repeat(steps));
    };

    const momentum = Momentum.create({
      stepper: Stepper.create({ stepPx: wheelStepPx, maxSteps: MAX_STEPS }),
      emit: emitScroll,
    });

    const gesture = Gesture.create({
      stepPx: wheelStepPx,
      maxStepsPerMove: MAX_STEPS,
      onTouchStart: momentum.stop,
      onFling: momentum.fling,
      onTap: (point) => {
        const { col, row } = cellAt(point);
        send(Mouse.press(col, row) + Mouse.release(col, row));
      },
      onScroll: emitScroll,
      onSelectStart: (point) => {
        const { col, row } = cellAt(point);
        console.info('itty: touch selection started');
        send(Mouse.press(col, row));
      },
      onSelectMove: (point) => {
        const { col, row } = cellAt(point);
        send(Mouse.drag(col, row));
      },
      onSelectEnd: (point) => {
        const { col, row } = cellAt(point);
        console.info('itty: touch selection ended');
        send(Mouse.release(col, row));
      },
    });

    const isTouch = (event) => event.pointerType === 'touch';

    element.addEventListener('pointerdown', (event) => {
      if (!isTouch(event) || !trackingMouse()) return;
      gestureLive = true;
      element.setPointerCapture?.(event.pointerId);
      gesture.down(event.pointerId, event.clientX, event.clientY);
    });
    element.addEventListener('pointermove', (event) => {
      if (isTouch(event)) gesture.move(event.pointerId, event.clientX, event.clientY);
    });
    const finish = (event) => {
      if (!isTouch(event) || !gestureLive) return;
      gestureLive = false;
      lastTouchAt = now();
      const kind = gesture.up(event.pointerId);
      if (kind === 'scroll' || kind === 'select') lastConsumedAt = now();
    };
    element.addEventListener('pointerup', finish);
    element.addEventListener('pointercancel', (event) => {
      if (!isTouch(event)) return;
      gestureLive = false;
      lastTouchAt = now();
      lastConsumedAt = now();
      gesture.cancel();
    });

    const swallowCompatMouse = (event) => {
      if (!trackingMouse()) return;
      if (gesture.isActive() || now() - lastTouchAt < COMPAT_MOUSE_WINDOW_MS) event.stopPropagation();
    };
    for (const type of ['mousedown', 'mouseup', 'mousemove']) {
      element.addEventListener(type, swallowCompatMouse, true);
    }

    return {
      ignoreClick: () => now() - lastConsumedAt < CLICK_SUPPRESS_MS,
      reset: () => {
        momentum.stop();
        gestureLive = false;
        gesture.cancel();
      },
    };
  };

  return { create };
})();
