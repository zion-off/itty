const Toggle = (() => {
    const ProgressVar = '--switch-progress';
    const StretchVar = '--switch-stretch';
    const SLIDE = Object.freeze({ damping: 0.78, response: 0.38 });
    const STRETCH = Object.freeze({ damping: 1, response: 0.18 });
    const RELEASE_EVENTS = [Dom.event.pointerUp, Dom.event.pointerCancel, Dom.event.pointerLeave];
    const create = ({ root, track, checked }) => {
        const target = (on) => (on ? 1 : 0);
        const slide = Spring.create({
            value: target(checked),
            ...SLIDE,
            onUpdate: (value) => Dom.setVar(track, ProgressVar, value),
        });
        const stretch = Spring.create({
            value: 0,
            ...STRETCH,
            onUpdate: (value) => Dom.setVar(track, StretchVar, value),
        });
        Dom.setVar(track, ProgressVar, target(checked));
        Dom.setVar(track, StretchVar, 0);
        root.addEventListener(Dom.event.pointerDown, () => {
            if (root instanceof HTMLButtonElement && root.disabled)
                return;
            stretch.to(1);
        });
        RELEASE_EVENTS.forEach((type) => root.addEventListener(type, () => stretch.to(0)));
        return {
            setChecked(next, { animate }) {
                if (animate)
                    slide.to(target(next));
                else
                    slide.set(target(next));
            },
        };
    };
    return { create };
})();
