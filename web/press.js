const Press = (() => {
  const PRESSED_SCALE = 0.94;
  const RELEASE_EVENTS = ['pointerup', 'pointercancel', 'pointerleave'];

  const attach = (element, { scale = PRESSED_SCALE } = {}) => {
    const spring = Spring.create({
      value: 1,
      ...Spring.presets.press,
      onUpdate: (value) => element.style.setProperty('--press-scale', value),
    });
    const down = () => {
      element.classList.add('pressed');
      spring.to(scale);
    };
    const up = () => {
      element.classList.remove('pressed');
      spring.to(1);
    };
    element.addEventListener('pointerdown', down);
    RELEASE_EVENTS.forEach((type) => element.addEventListener(type, up));
  };

  return { attach };
})();
