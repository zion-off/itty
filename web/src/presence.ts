interface PresenceOptions {
  element: HTMLElement;
  visible: boolean;
}

interface PresenceInstance {
  show(): void;
  hide(): void;
}

const PresenceState = Object.freeze({ shown: 'shown', hidden: 'hidden' });

const Presence = (() => {
  const PROGRESS_VAR = '--presence';
  const SHOWN = 1;
  const HIDDEN = 0;

  const create = ({ element, visible }: PresenceOptions): PresenceInstance => {
    const initial = visible ? SHOWN : HIDDEN;
    element.dataset['state'] = visible ? PresenceState.shown : PresenceState.hidden;
    Dom.setVar(element, PROGRESS_VAR, initial);

    const spring = Spring.create({
      value: initial,
      ...Spring.presets.presence,
      onUpdate: (progress) => Dom.setVar(element, PROGRESS_VAR, progress),
      onRest: (progress) => {
        if (progress === HIDDEN) element.dataset['state'] = PresenceState.hidden;
      },
    });

    return {
      show() {
        element.dataset['state'] = PresenceState.shown;
        spring.to(SHOWN);
      },
      hide: () => spring.to(HIDDEN),
    };
  };

  return { create };
})();
