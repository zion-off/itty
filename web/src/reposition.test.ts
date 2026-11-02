import test from 'node:test';
import assert from 'node:assert';

const BOUNDS = { minX: -150, maxX: 150, minY: -400, maxY: 0 };

interface FakeSpring {
  position: number;
  velocity: number;
  target: number | null;
  value: () => number;
  set: (next: number) => void;
  to: (next: number, options?: SpringTarget) => void;
}

const fakeSpring = ({ value = 0, onUpdate = () => {} }: SpringOptions) => {
  const spring: FakeSpring = {
    position: value,
    velocity: 0,
    target: null,
    value: () => spring.position,
    set: (next: number) => {
      spring.position = next;
      spring.target = null;
      onUpdate(next);
    },
    to: (next: number, options: SpringTarget = {}) => {
      spring.target = next;
      spring.velocity = options.velocity ?? 0;
    },
  };
  return spring;
};

const fakeStore = (initial: Placement | null = null) => ({
  saved: initial,
  load() {
    return this.saved;
  },
  save(placement: Placement) {
    this.saved = placement;
  },
});

const setup = ({ stored = null, bounds = BOUNDS }: { stored?: Placement | null; bounds?: DragBounds } = {}) => {
  const listeners = new Map<string, (event: DragPointerEvent) => void>();
  const captured: number[] = [];
  const handle = {
    captured,
    addEventListener: (type: string, fn: (event: DragPointerEvent) => void) => listeners.set(type, fn),
    setPointerCapture: (id: number) => captured.push(id),
  };
  const springs: FakeSpring[] = [];
  const positions: [PositionAxis, number][] = [];
  let time = 0;
  const store = fakeStore(stored);
  const reposition = Reposition.create({
    handle,
    bounds: () => bounds,
    store,
    onPosition: (axis: PositionAxis, value: number) => positions.push([axis, value]),
    createSpring: (options: SpringOptions) => {
      const spring = fakeSpring(options);
      springs.push(spring);
      return spring;
    },
    now: () => time,
    log: () => {},
  });
  const [springX, springY] = springs;
  if (!springX || !springY) throw new Error('the springs were not created');
  const fire = (type: string, clientX: number, clientY: number, extra: Partial<DragPointerEvent> = {}) => {
    const listener = listeners.get(type);
    if (!listener) throw new Error(`no ${type} listener`);
    listener({ pointerId: 1, isPrimary: true, clientX, clientY, ...extra });
  };
  const drag = (path: [number, number][], stepMs = 16) =>
    path.forEach(([x, y]) => {
      time += stepMs;
      fire('pointermove', x, y);
    });
  return { reposition, handle, springX, springY, store, fire, drag, positions, advance: (ms: number) => (time += ms) };
};

test('starts at the saved anchor and height', () => {
  const { springX, springY } = setup({ stored: { anchor: 'right', y: -120 } });
  assert.strictEqual(springX.position, 150);
  assert.strictEqual(springY.position, -120);
});

test('starts at the bottom center without a saved position', () => {
  const { springX, springY } = setup();
  assert.strictEqual(springX.position, 0);
  assert.strictEqual(springY.position, 0);
});

test('a saved height outside the screen is clamped', () => {
  const { springY } = setup({ stored: { anchor: 'left', y: -9000 } });
  assert.strictEqual(springY.position, -400);
});

test('a tap that barely moves is not a drag', () => {
  const { fire, drag, springX, reposition } = setup();
  fire('pointerdown', 100, 100);
  drag([[103, 104]]);
  fire('pointerup', 103, 104);
  assert.strictEqual(springX.position, 0);
  assert.strictEqual(reposition.ignoreClick(), false);
});

test('a drag follows the finger and captures the pointer', () => {
  const { fire, drag, springX, springY, handle } = setup();
  fire('pointerdown', 200, 500);
  drag([[190, 480], [150, 440]]);
  assert.strictEqual(springX.position, -50);
  assert.strictEqual(springY.position, -60);
  assert.deepStrictEqual(handle.captured, [1]);
});

test('dragging past the edge resists', () => {
  const { fire, drag, springX } = setup();
  fire('pointerdown', 0, 0);
  drag([[100, 0], [250, 0]]);
  assert.strictEqual(springX.position, 150 + 100 * 0.35);
});

test('releasing springs to the nearest anchor and keeps the finger velocity', () => {
  const { fire, drag, springX, springY } = setup();
  fire('pointerdown', 0, 0);
  drag([[40, -10], [80, -20]]);
  fire('pointerup', 80, -20);
  assert.strictEqual(springX.target, 150);
  assert.strictEqual(springX.velocity, 2500);
  assert.strictEqual(springY.target, -20 + (-10 / 0.016) * 0.18);
});

test('a slow drag settles at the anchor closest to where it stopped', () => {
  const { fire, drag, advance, springX } = setup();
  fire('pointerdown', 0, 0);
  drag([[-30, -150], [-60, -150]]);
  advance(500);
  drag([[-60, -150]]);
  fire('pointerup', -60, -150);
  assert.strictEqual(springX.target, 0);
});

test('letting go near the bottom center snaps back to the default spot', () => {
  const { fire, drag, advance, springX, springY, store } = setup({ stored: { anchor: 'right', y: -200 } });
  fire('pointerdown', 0, 0);
  drag([[-100, 100], [-130, 200], [-150, 200]]);
  advance(500);
  drag([[-150, 200]]);
  fire('pointerup', -150, 200);
  assert.strictEqual(springX.target, 0);
  assert.strictEqual(springY.target, 0);
  assert.deepStrictEqual(store.saved, { anchor: 'center', y: 0 });
});

test('letting go in the middle of the screen does not snap home', () => {
  const { fire, drag, advance, springY } = setup();
  fire('pointerdown', 0, 0);
  drag([[0, -100], [0, -200]]);
  advance(500);
  drag([[0, -200]]);
  fire('pointerup', 0, -200);
  assert.strictEqual(springY.target, -200);
});

test('the height stays inside the allowed range', () => {
  const { fire, drag, springY } = setup();
  fire('pointerdown', 0, 0);
  drag([[0, -300], [0, -900]]);
  fire('pointerup', 0, -900);
  assert.strictEqual(springY.target, -400);
});

test('a release saves the anchor and the height', () => {
  const { fire, drag, store } = setup();
  fire('pointerdown', 0, 0);
  drag([[-100, -50], [-200, -50]]);
  fire('pointerup', -200, -50);
  assert.strictEqual(store.saved?.anchor, 'left');
  assert.ok(store.saved !== null && store.saved.y <= 0 && store.saved.y >= -400);
});

test('the click that ends a drag is ignored, but a later click is not', () => {
  const { fire, drag, advance, reposition } = setup();
  fire('pointerdown', 0, 0);
  drag([[60, 0], [120, 0]]);
  fire('pointerup', 120, 0);
  assert.strictEqual(reposition.ignoreClick(), true);
  advance(1000);
  assert.strictEqual(reposition.ignoreClick(), false);
});

test('a cancelled drag still settles on an anchor', () => {
  const { fire, drag, springX } = setup();
  fire('pointerdown', 0, 0);
  drag([[100, 0], [140, 0]]);
  fire('pointercancel', 140, 0);
  assert.strictEqual(springX.target, 150);
});

test('moves from another pointer are ignored', () => {
  const { fire, springX } = setup();
  fire('pointerdown', 0, 0);
  fire('pointermove', 100, 0, { pointerId: 2 });
  assert.strictEqual(springX.position, 0);
});

test('refresh re-places the dock against the new bounds', () => {
  let bounds = BOUNDS;
  const listeners = new Map<string, (event: DragPointerEvent) => void>();
  const springs: FakeSpring[] = [];
  const reposition = Reposition.create({
    handle: { addEventListener: (type: string, fn: (event: DragPointerEvent) => void) => listeners.set(type, fn) },
    bounds: () => bounds,
    store: fakeStore({ anchor: 'right', y: 0 }),
    onPosition: () => {},
    createSpring: (options: SpringOptions) => {
      const spring = fakeSpring(options);
      springs.push(spring);
      return spring;
    },
    log: () => {},
  });
  bounds = { ...BOUNDS, maxX: 200 };
  reposition.refresh();
  assert.strictEqual(springs[0]?.target, 200);
});

test('nearestAnchor picks left, center or right', () => {
  assert.strictEqual(Reposition.nearestAnchor(-140, BOUNDS), 'left');
  assert.strictEqual(Reposition.nearestAnchor(10, BOUNDS), 'center');
  assert.strictEqual(Reposition.nearestAnchor(100, BOUNDS), 'right');
});

test('the store round-trips a placement and rejects bad data', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) };
  const store = Reposition.createStore(storage, 'k');
  assert.strictEqual(store.load(), null);
  store.save({ anchor: 'left', y: -30 });
  assert.deepStrictEqual(store.load(), { anchor: 'left', y: -30 });
  data.set('k', JSON.stringify({ anchor: 'top', y: 1 }));
  assert.strictEqual(store.load(), null);
  data.set('k', 'not json');
  assert.strictEqual(store.load(), null);
});
