const Reposition = (() => {
  const DRAG_PX = 8;
  const CLICK_SUPPRESS_MS = 400;
  const RUBBER_BAND = 0.35;
  const PROJECTION_SECONDS = 0.18;
  const HOME_SNAP_PX = 72;
  const VELOCITY_WINDOW_MS = 100;
  const ANCHORS = Object.freeze(['left', 'center', 'right']);
  const HOME = Object.freeze({ anchor: 'center', y: 0 });

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const resist = (value, min, max) => {
    if (value < min) return min + (value - min) * RUBBER_BAND;
    if (value > max) return max + (value - max) * RUBBER_BAND;
    return value;
  };

  const anchorX = (anchor, { minX, maxX }) => ({ left: minX, center: 0, right: maxX })[anchor];

  const nearestAnchor = (x, bounds) =>
    ANCHORS.reduce((best, anchor) =>
      Math.abs(anchorX(anchor, bounds) - x) < Math.abs(anchorX(best, bounds) - x) ? anchor : best,
    );

  const velocityOf = (samples) => {
    if (samples.length < 2) return { x: 0, y: 0 };
    const first = samples[0];
    const last = samples[samples.length - 1];
    const seconds = (last.t - first.t) / 1000;
    if (seconds <= 0) return { x: 0, y: 0 };
    return { x: (last.x - first.x) / seconds, y: (last.y - first.y) / seconds };
  };

  const isPlacement = (value) =>
    value !== null &&
    typeof value === 'object' &&
    ANCHORS.includes(value.anchor) &&
    Number.isFinite(value.y);

  const createStore = (storage, key) => ({
    load() {
      try {
        const value = JSON.parse(storage.getItem(key));
        return isPlacement(value) ? { anchor: value.anchor, y: value.y } : null;
      } catch {
        return null;
      }
    },
    save(placement) {
      try {
        storage.setItem(key, JSON.stringify(placement));
      } catch (error) {
        console.warn('itty: dock position not saved', error);
      }
    },
  });

  const create = ({
    handle,
    bounds,
    store,
    onPosition,
    createSpring = (options) => Spring.create({ ...Spring.presets.presence, damping: 0.72, response: 0.5, ...options }),
    now = () => performance.now(),
    log = console.info,
  }) => {
    const springX = createSpring({ value: 0, onUpdate: (value) => onPosition('x', value) });
    const springY = createSpring({ value: 0, onUpdate: (value) => onPosition('y', value) });
    let placement = store.load() || HOME;
    let press = null;
    let lastDragEndAt = -Infinity;

    const restingPoint = (limits) => ({
      x: anchorX(placement.anchor, limits),
      y: clamp(placement.y, limits.minY, limits.maxY),
    });

    const settleAt = (point) => {
      springX.set(point.x);
      springY.set(point.y);
    };

    const beginDrag = (event) => {
      press.dragging = true;
      press.limits = bounds();
      press.origin = { x: springX.value(), y: springY.value() };
      springX.set(press.origin.x);
      springY.set(press.origin.y);
      handle.setPointerCapture?.(event.pointerId);
      log('itty: dock drag started');
    };

    const follow = (event) => {
      const { limits, origin, start } = press;
      springX.set(resist(origin.x + event.clientX - start.x, limits.minX, limits.maxX));
      springY.set(resist(origin.y + event.clientY - start.y, limits.minY, limits.maxY));
      const t = now();
      press.samples.push({ t, x: springX.value(), y: springY.value() });
      while (press.samples.length > 2 && t - press.samples[0].t > VELOCITY_WINDOW_MS) press.samples.shift();
    };

    const release = () => {
      const { limits, samples } = press;
      const velocity = velocityOf(samples);
      const x = springX.value();
      const y = springY.value();
      const landing = {
        x: x + velocity.x * PROJECTION_SECONDS,
        y: clamp(y + velocity.y * PROJECTION_SECONDS, limits.minY, limits.maxY),
      };
      placement =
        Math.hypot(landing.x, landing.y) < HOME_SNAP_PX
          ? HOME
          : { anchor: nearestAnchor(landing.x, limits), y: landing.y };
      const target = restingPoint(limits);
      springX.to(target.x, { velocity: velocity.x });
      springY.to(target.y, { velocity: velocity.y });
      store.save(placement);
      lastDragEndAt = now();
      log('itty: dock moved to', placement.anchor, Math.round(placement.y), placement === HOME ? '(home)' : '');
    };

    handle.addEventListener('pointerdown', (event) => {
      if (press || event.isPrimary === false) return;
      press = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, dragging: false, samples: [] };
    });

    handle.addEventListener('pointermove', (event) => {
      if (!press || event.pointerId !== press.id) return;
      if (!press.dragging) {
        const moved = Math.hypot(event.clientX - press.start.x, event.clientY - press.start.y);
        if (moved < DRAG_PX) return;
        beginDrag(event);
      }
      follow(event);
    });

    const end = (event) => {
      if (!press || event.pointerId !== press.id) return;
      if (press.dragging) release();
      press = null;
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);

    settleAt(restingPoint(bounds()));

    return {
      ignoreClick: () => now() - lastDragEndAt < CLICK_SUPPRESS_MS,
      refresh() {
        if (press) return;
        const target = restingPoint(bounds());
        springX.to(target.x);
        springY.to(target.y);
      },
    };
  };

  return { create, createStore, nearestAnchor, resist, ANCHORS };
})();

if (typeof module !== 'undefined') module.exports = Reposition;
