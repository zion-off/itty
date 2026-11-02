const TerminalTouch = (() => {
    const COMPAT_MOUSE_WINDOW_MS = 800;
    const CLICK_SUPPRESS_MS = 600;
    const POINTER_TYPE_TOUCH = 'touch';
    const NOT_TRACKING = 'none';
    const COMPAT_MOUSE_EVENTS = [Dom.event.mouseDown, Dom.event.mouseUp, Dom.event.mouseMove];
    const CAPTURE = true;
    const create = ({ element, term, screen, send, now = Dom.now }) => {
        let lastTouchAt = -Infinity;
        let lastConsumedAt = -Infinity;
        let gestureLive = false;
        const trackingMouse = () => term.modes.mouseTrackingMode !== NOT_TRACKING;
        const cellAt = ({ x, y }) => {
            const rect = screen().getBoundingClientRect();
            return {
                col: Math.min(term.cols, Math.max(1, Math.floor(((x - rect.left) / rect.width) * term.cols) + 1)),
                row: Math.min(term.rows, Math.max(1, Math.floor(((y - rect.top) / rect.height) * term.rows) + 1)),
            };
        };
        const wheelStepPx = () => screen().getBoundingClientRect().height / term.rows;
        const emitScroll = ({ direction, steps, x, y }) => {
            const { col, row } = cellAt({ x, y });
            send(Mouse.wheel(direction, col, row).repeat(steps));
        };
        const momentum = Momentum.create({
            stepper: Stepper.create({ stepPx: wheelStepPx, maxSteps: Stepper.MAX_STEPS }),
            emit: emitScroll,
        });
        const gesture = Gesture.create({
            stepPx: wheelStepPx,
            maxStepsPerMove: Stepper.MAX_STEPS,
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
        const isTouch = (event) => event.pointerType === POINTER_TYPE_TOUCH;
        element.addEventListener(Dom.event.pointerDown, (event) => {
            if (!isTouch(event) || !trackingMouse())
                return;
            gestureLive = true;
            element.setPointerCapture?.(event.pointerId);
            gesture.down(event.pointerId, event.clientX, event.clientY);
        });
        element.addEventListener(Dom.event.pointerMove, (event) => {
            if (isTouch(event))
                gesture.move(event.pointerId, event.clientX, event.clientY);
        });
        const finish = (event) => {
            if (!isTouch(event) || !gestureLive)
                return;
            gestureLive = false;
            lastTouchAt = now();
            const kind = gesture.up(event.pointerId);
            if (kind === GestureOutcome.scroll || kind === GestureOutcome.select)
                lastConsumedAt = now();
        };
        element.addEventListener(Dom.event.pointerUp, finish);
        element.addEventListener(Dom.event.pointerCancel, (event) => {
            if (!isTouch(event))
                return;
            gestureLive = false;
            lastTouchAt = now();
            lastConsumedAt = now();
            gesture.cancel();
        });
        const swallowCompatMouse = (event) => {
            if (!trackingMouse())
                return;
            if (gesture.isActive() || now() - lastTouchAt < COMPAT_MOUSE_WINDOW_MS)
                event.stopPropagation();
        };
        for (const type of COMPAT_MOUSE_EVENTS) {
            element.addEventListener(type, swallowCompatMouse, CAPTURE);
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
