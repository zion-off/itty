interface FlickMenuOptions {
  host: HTMLElement;
}

interface FlickMenuInstance {
  show: (labels: string[], anchor: HTMLElement) => void;
  hide: () => void;
  highlight: (index: number | null) => void;
  hit: (x: number, y: number) => number | null;
}

const FlickMenu = (() => {
  const EDGE_PX = 8;
  const SLACK_PX = 24;
  const HALF = 2;
  const MENU_CLASS = 'flick-menu';
  const OPTION_CLASS = 'flick-option';
  const HIGHLIGHT_CLASS = 'highlighted';

  const create = ({ host }: FlickMenuOptions): FlickMenuInstance => {
    const element = document.createElement('div');
    element.className = MENU_CLASS;
    element.setAttribute('aria-hidden', 'true');
    host.append(element);
    const presence = Presence.create({ element, visible: false });
    let options: HTMLElement[] = [];

    const place = (anchor: HTMLElement) => {
      const hostBox = host.getBoundingClientRect();
      const anchorBox = anchor.getBoundingClientRect();
      const center = anchorBox.left + anchorBox.width / HALF - hostBox.left;
      const maxLeft = Math.max(EDGE_PX, hostBox.width - element.offsetWidth - EDGE_PX);
      const left = Math.min(Math.max(center - element.offsetWidth / HALF, EDGE_PX), maxLeft);
      element.style.left = `${left}px`;
      element.style.transformOrigin = `${center - left}px bottom`;
    };

    return {
      show(labels, anchor) {
        options = labels.map((text) => {
          const option = document.createElement('span');
          option.className = OPTION_CLASS;
          option.textContent = text;
          return option;
        });
        element.replaceChildren(...options);
        place(anchor);
        presence.show();
      },
      hide: () => presence.hide(),
      highlight: (index) => options.forEach((option, i) => option.classList.toggle(HIGHLIGHT_CLASS, i === index)),
      hit(x, y) {
        if (element.dataset['state'] === PresenceState.hidden) return null;
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
