const Press = (() => {
  const PRESSED_SCALE = 0.94;
  const RELEASE_EVENTS = ['pointerup', 'pointercancel', 'pointerleave'];

  const attach = (element, { scale = PRESSED_SCALE, onDown = () => {}, onUp = () => {} } = {}) => {
    const spring = Spring.create({
      value: 1,
      ...Spring.presets.press,
      onUpdate: (value) => element.style.setProperty('--press-scale', value),
    });
    element.addEventListener('pointerdown', (event) => {
      element.classList.add('pressed');
      spring.to(scale);
      onDown(event);
    });
    RELEASE_EVENTS.forEach((type) =>
      element.addEventListener(type, () => {
        element.classList.remove('pressed');
        spring.to(1);
        onUp();
      }),
    );
  };

  return { attach };
})();
