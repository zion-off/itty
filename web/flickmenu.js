const FlickMenu = (() => {
  const EDGE_PX = 8;
  const SLACK_PX = 24;

  const create = ({ host }) => {
    const element = document.createElement('div');
    element.className = 'flick-menu';
    element.setAttribute('aria-hidden', 'true');
    host.append(element);
    const presence = Presence.create({ element, visible: false });
    let options = [];

    const place = (anchor) => {
      const hostBox = host.getBoundingClientRect();
      const anchorBox = anchor.getBoundingClientRect();
      const center = anchorBox.left + anchorBox.width / 2 - hostBox.left;
      const maxLeft = Math.max(EDGE_PX, hostBox.width - element.offsetWidth - EDGE_PX);
      const left = Math.min(Math.max(center - element.offsetWidth / 2, EDGE_PX), maxLeft);
      element.style.left = `${left}px`;
      element.style.transformOrigin = `${center - left}px bottom`;
    };

    return {
      show(labels, anchor) {
        options = labels.map((text) => {
          const option = document.createElement('span');
          option.className = 'flick-option';
          option.textContent = text;
          return option;
        });
        element.replaceChildren(...options);
        place(anchor);
        presence.show();
      },
      hide: () => presence.hide(),
      highlight: (index) => options.forEach((option, i) => option.classList.toggle('highlighted', i === index)),
      hit(x, y) {
        if (element.dataset.state === 'hidden') return null;
        if (y > element.getBoundingClientRect().bottom + SLACK_PX) return null;
        const index = options.findIndex((option) => {
          const box = option.getBoundingClientRect();
          return x >= box.left && x < box.right;
        });
        return index === -1 ? null : index;
      },
    };
  };

  return { create };
})();
