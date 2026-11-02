interface PillGeometry {
  areaWidth: number;
  pillWidth: number;
  pillHeight: number;
  homeTop: number;
  edge: number;
}

interface TopPillGeometry extends PillGeometry {
  dockTop: number;
}

interface DockGeometry extends PillGeometry {
  topPillBottom: number;
}

interface PillLayoutOptions {
  area: HTMLElement;
  switcher: HTMLElement;
  pill: HTMLElement;
  dock: HTMLElement;
}

interface PillLayoutInstance {
  topPill: () => DragBounds;
  dock: () => DragBounds;
}

const PillLayout = (() => {
  const GAP_PX = 8;
  const HALF = 2;

  const CssVar = Object.freeze({ capsuleWidth: '--capsule-w', capsuleHeight: '--capsule-h' });

  const horizontalReach = ({ areaWidth, pillWidth, edge }: PillGeometry) =>
    Math.max(0, (areaWidth - pillWidth) / HALF - edge);

  const forTopPill = (geometry: TopPillGeometry): DragBounds => {
    const reach = horizontalReach(geometry);
    const room = geometry.dockTop - GAP_PX - geometry.homeTop - geometry.pillHeight;
    return { minX: -reach, maxX: reach, minY: 0, maxY: Math.max(0, room) };
  };

  const forDock = (geometry: DockGeometry): DragBounds => {
    const reach = horizontalReach(geometry);
    const room = geometry.topPillBottom + GAP_PX - geometry.homeTop;
    return { minX: -reach, maxX: reach, minY: Math.min(0, room), maxY: 0 };
  };

  const remPx = (value: string) => parseFloat(value) * parseFloat(getComputedStyle(document.documentElement).fontSize);

  const create = ({ area, switcher, pill, dock }: PillLayoutOptions): PillLayoutInstance => {
    const areaTop = () => area.getBoundingClientRect().top;
    const edge = () => parseFloat(getComputedStyle(switcher).paddingLeft);

    return {
      topPill: () =>
        forTopPill({
          areaWidth: area.clientWidth,
          pillWidth: pill.offsetWidth,
          pillHeight: pill.offsetHeight,
          homeTop: switcher.offsetTop + pill.offsetTop,
          edge: edge(),
          dockTop: dock.getBoundingClientRect().top - areaTop(),
        }),
      dock: () => {
        const style = getComputedStyle(dock);
        const capsuleHeight = remPx(style.getPropertyValue(CssVar.capsuleHeight));
        return forDock({
          areaWidth: area.clientWidth,
          pillWidth: remPx(style.getPropertyValue(CssVar.capsuleWidth)),
          pillHeight: capsuleHeight,
          homeTop: area.clientHeight - parseFloat(style.bottom) - capsuleHeight,
          edge: edge(),
          topPillBottom: pill.getBoundingClientRect().bottom - areaTop(),
        });
      },
    };
  };

  return { create, forTopPill, forDock, GAP_PX };
})();

if (typeof module !== 'undefined') module.exports = PillLayout;
