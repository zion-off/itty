const Presence = (() => {
  const create = ({ element, visible }) => {
    const initial = visible ? 1 : 0;
    element.dataset.state = visible ? 'shown' : 'hidden';
    element.style.setProperty('--presence', initial);

    const spring = Spring.create({
      value: initial,
      ...Spring.presets.presence,
      onUpdate: (progress) => element.style.setProperty('--presence', progress),
      onRest: (progress) => {
        if (progress === 0) element.dataset.state = 'hidden';
      },
    });

    return {
      show() {
        element.dataset.state = 'shown';
        spring.to(1);
      },
      hide: () => spring.to(0),
    };
  };

  return { create };
})();
