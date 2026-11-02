interface PressOptions {
  scale?: number;
  onDown?: (event: PointerEvent) => void;
  onUp?: () => void;
}

const Press = (() => {
  const PRESSED_SCALE = 0.94;
  const SCALE_VAR = '--press-scale';
  const PRESSED_CLASS = 'pressed';
  const RELEASE_EVENTS = [Dom.event.pointerUp, Dom.event.pointerCancel, Dom.event.pointerLeave];

  const attach = (element: HTMLElement, { scale = PRESSED_SCALE, onDown = () => {}, onUp = () => {} }: PressOptions = {}) => {
    const spring = Spring.create({
      value: 1,
      ...Spring.presets.press,
      onUpdate: (value) => Dom.setVar(element, SCALE_VAR, value),
    });
    element.addEventListener(Dom.event.pointerDown, (event) => {
      element.classList.add(PRESSED_CLASS);
      spring.to(scale);
      onDown(event);
    });
    RELEASE_EVENTS.forEach((type) =>
      element.addEventListener(type, () => {
        element.classList.remove(PRESSED_CLASS);
        spring.to(1);
        onUp();
      }),
    );
  };

  return { attach };
})();
