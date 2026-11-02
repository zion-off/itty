const PillLayout = (() => {
    const GAP_PX = 8;
    const HALF = 2;
    const CssVar = Object.freeze({ capsuleWidth: '--capsule-w', capsuleHeight: '--capsule-h' });
    const horizontalReach = ({ areaWidth, pillWidth, edge }) => Math.max(0, (areaWidth - pillWidth) / HALF - edge);
    const forTopPill = (geometry) => {
        const reach = horizontalReach(geometry);
        const room = geometry.dockTop - GAP_PX - geometry.homeTop - geometry.pillHeight;
        return { minX: -reach, maxX: reach, minY: 0, maxY: Math.max(0, room) };
    };
    const forDock = (geometry) => {
        const reach = horizontalReach(geometry);
        const room = geometry.topPillBottom + GAP_PX - geometry.homeTop;
        return { minX: -reach, maxX: reach, minY: Math.min(0, room), maxY: 0 };
    };
    const remPx = (value) => parseFloat(value) * parseFloat(getComputedStyle(document.documentElement).fontSize);
    const create = ({ area, switcher, pill, dock }) => {
        const areaTop = () => area.getBoundingClientRect().top;
        const edge = () => parseFloat(getComputedStyle(switcher).paddingLeft);
        return {
            topPill: () => forTopPill({
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
if (typeof module !== 'undefined')
    module.exports = PillLayout;
