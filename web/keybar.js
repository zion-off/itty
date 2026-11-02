const KeyBar = (() => {
    const PRESSED_SCALE = 0.92;
    const FLICK_REPEAT_DELAY_MS = 100;
    const KEYBOARD_CLICK_DETAIL = 0;
    const ICON_STROKE_WIDTH = '1.8';
    const SLASH = '/';
    const ClassName = Object.freeze({
        key: 'key',
        arrow: ' key-arrow',
        hasFlick: 'has-flick',
        active: 'active',
        hint: 'key-hint',
        main: 'keys-main',
        arrows: 'keys-arrows',
        keyboard: 'keys-keyboard',
    });
    const Slot = Object.freeze({
        esc: 'esc',
        tab: 'tab',
        ctrl: 'ctrl',
        slash: 'slash',
        enter: 'enter',
        keyboard: 'keyboard',
        left: 'left',
        up: 'up',
        down: 'down',
        right: 'right',
    });
    const Label = Object.freeze({
        hint: 'Ctrl + next key',
        showKeyboard: 'Show keyboard',
        hideKeyboard: 'Hide keyboard',
        altEnter: '⌥↩',
    });
    const icon = (paths) => Dom.icon(ICON_STROKE_WIDTH, paths);
    const ICONS = Object.freeze({
        tab: icon('<path d="M4 12h12M12 7l5 5-5 5M20 6v12"/>'),
        enter: icon('<path d="M19 6v5a3 3 0 0 1-3 3H5M9 10l-4 4 4 4"/>'),
        up: icon('<path d="M6 15l6-6 6 6"/>'),
        down: icon('<path d="M6 9l6 6 6-6"/>'),
        left: icon('<path d="M15 6l-6 6 6 6"/>'),
        right: icon('<path d="M9 6l6 6-6 6"/>'),
        keyboard: icon('<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9.5 14h5"/>'),
    });
    const group = (className, keys) => {
        const el = document.createElement('div');
        el.className = className;
        el.append(...keys);
        return el;
    };
    const SYMBOL_VARIANTS = ['|', '~', '`', '\\', '-'];
    const CONTROL_VARIANTS = ['c', 'd', 'z'];
    const NEWLINE_LETTER = 'j';
    const create = ({ container, hintContainer, send, applicationCursorMode, keyboard, onCtrlChange = () => { }, }) => {
        let ctrlActive = false;
        const flickMenu = FlickMenu.create({ host: hintContainer });
        const hint = document.createElement('div');
        hint.className = ClassName.hint;
        hint.setAttribute(Dom.attr.hidden, 'true');
        hint.textContent = Label.hint;
        const hintPresence = Presence.create({ element: hint, visible: false });
        const raiseKeyboard = () => {
            if (!keyboard.isShowing())
                keyboard.show();
        };
        const sendArrow = (direction) => () => send(Keys.arrow(direction, applicationCursorMode()));
        const sendNavigation = (name) => () => send(Keys.navigation(name, applicationCursorMode()));
        const typed = (text) => ({ label: text, run: () => send(text) });
        const controlVariant = (letter) => {
            const byte = Keys.controlByte(letter);
            return {
                label: `^${letter.toUpperCase()}`,
                run: () => {
                    if (byte !== null)
                        send(byte);
                },
            };
        };
        const attachPress = (el, { repeats, onPress }) => {
            const hold = repeats ? Repeat.create({ action: onPress }) : null;
            Press.attach(el, {
                scale: PRESSED_SCALE,
                onDown: (event) => {
                    event.preventDefault();
                    if (hold)
                        hold.start();
                    else
                        onPress();
                },
                onUp: () => hold?.stop(),
            });
        };
        const attachFlick = (el, { name, flick, repeats, onPress }) => {
            el.classList.add(ClassName.hasFlick);
            const point = (event) => ({ x: event.clientX, y: event.clientY });
            const gesture = Flick.create({
                hit: flickMenu.hit,
                repeat: repeats ? Repeat.create({ action: onPress, delayMs: FLICK_REPEAT_DELAY_MS }) : null,
                onTap: onPress,
                onOpen: () => flickMenu.show(flick.map((option) => option.label), el),
                onHighlight: flickMenu.highlight,
                onClose: flickMenu.hide,
                onSelect: (index) => {
                    const variant = flick[index];
                    if (!variant)
                        return;
                    console.info('itty: key variant', name, variant.label);
                    variant.run();
                },
            });
            Press.attach(el, { scale: PRESSED_SCALE });
            el.addEventListener(Dom.event.pointerDown, (event) => {
                event.preventDefault();
                el.setPointerCapture?.(event.pointerId);
                gesture.down(point(event));
            });
            el.addEventListener(Dom.event.pointerMove, (event) => gesture.move(point(event)));
            el.addEventListener(Dom.event.pointerUp, (event) => gesture.up(point(event)));
            el.addEventListener(Dom.event.pointerCancel, gesture.cancel);
        };
        const key = ({ slot, name, face, arrow = false, repeats = false, flick = null, onPress = () => { }, onClick, }) => {
            const el = document.createElement('button');
            el.type = 'button';
            el.className = `${ClassName.key} ${ClassName.key}-${slot}${arrow ? ClassName.arrow : ''}`;
            el.setAttribute(Dom.attr.label, name);
            if ('icon' in face)
                el.innerHTML = face.icon;
            else
                el.textContent = face.label;
            if (flick)
                attachFlick(el, { name, flick, repeats, onPress });
            else
                attachPress(el, { repeats, onPress });
            el.addEventListener(Dom.event.click, (event) => {
                if (event.detail === KEYBOARD_CLICK_DETAIL)
                    onPress();
                onClick?.();
            });
            return el;
        };
        const arrowKey = (slot, name, direction, variant) => key({
            slot,
            name: `${name} arrow`,
            face: { icon: ICONS[slot] },
            arrow: true,
            repeats: true,
            onPress: sendArrow(direction),
            flick: [{ label: variant.label, run: sendNavigation(variant.navigation) }],
        });
        const setCtrl = (active) => {
            ctrlActive = active;
            ctrlKey.classList.toggle(ClassName.active, active);
            ctrlKey.setAttribute(Dom.attr.pressed, String(active));
            onCtrlChange(active);
            if (active)
                hintPresence.show();
            else
                hintPresence.hide();
        };
        const ctrlKey = key({
            slot: Slot.ctrl,
            name: 'Control, applies to the next key',
            face: { label: 'Ctrl' },
            onPress: () => setCtrl(!ctrlActive),
            onClick: raiseKeyboard,
        });
        ctrlKey.setAttribute(Dom.attr.pressed, 'false');
        const keyboardKey = key({
            slot: Slot.keyboard,
            name: Label.showKeyboard,
            face: { icon: ICONS.keyboard },
            onClick: () => (keyboard.isShowing() ? keyboard.hide() : keyboard.show()),
        });
        keyboardKey.setAttribute(Dom.attr.pressed, 'false');
        hintContainer.append(hint);
        container.append(group(ClassName.main, [
            key({
                slot: Slot.esc,
                name: 'Escape',
                face: { label: 'esc' },
                onPress: () => send(Keys.ESCAPE),
                flick: CONTROL_VARIANTS.map(controlVariant),
            }),
            key({
                slot: Slot.tab,
                name: 'Tab',
                face: { icon: ICONS.tab },
                onPress: () => send(Keys.TAB),
                flick: [{ label: '⇧Tab', run: () => send(Keys.BACKTAB) }],
            }),
            ctrlKey,
            key({
                slot: Slot.slash,
                name: 'Slash',
                face: { label: SLASH },
                onPress: () => send(SLASH),
                flick: SYMBOL_VARIANTS.map(typed),
            }),
            key({
                slot: Slot.enter,
                name: 'Enter',
                face: { icon: ICONS.enter },
                onPress: () => send(Keys.ENTER),
                flick: [{ label: Label.altEnter, run: () => send(Keys.ALT_ENTER) }, controlVariant(NEWLINE_LETTER)],
            }),
        ]), group(ClassName.arrows, [
            arrowKey(Slot.left, 'Left', ArrowKey.left, { label: 'Home', navigation: NavigationKey.home }),
            arrowKey(Slot.up, 'Up', ArrowKey.up, { label: 'PgUp', navigation: NavigationKey.pageUp }),
            arrowKey(Slot.down, 'Down', ArrowKey.down, { label: 'PgDn', navigation: NavigationKey.pageDown }),
            arrowKey(Slot.right, 'Right', ArrowKey.right, { label: 'End', navigation: NavigationKey.end }),
        ]), group(ClassName.keyboard, [keyboardKey]));
        return {
            setKeyboardShowing(showing) {
                keyboardKey.setAttribute(Dom.attr.pressed, String(showing));
                keyboardKey.setAttribute(Dom.attr.label, showing ? Label.hideKeyboard : Label.showKeyboard);
            },
            applyCtrl(data) {
                if (!ctrlActive)
                    return data;
                setCtrl(false);
                return Keys.controlByte(data) ?? data;
            },
        };
    };
    return { create };
})();
