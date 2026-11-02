import test from 'node:test';
import assert from 'node:assert';

const AREA = { areaWidth: 400, edge: 12 };

const topPill = (overrides: Partial<TopPillGeometry> = {}) =>
  PillLayout.forTopPill({ ...AREA, pillWidth: 100, pillHeight: 24, homeTop: 4, dockTop: 800, ...overrides });

const dock = (overrides: Partial<DockGeometry> = {}) =>
  PillLayout.forDock({ ...AREA, pillWidth: 88, pillHeight: 36, homeTop: 760, topPillBottom: 28, ...overrides });

test('the top pill reaches both side margins', () => {
  const bounds = topPill();
  assert.strictEqual(bounds.minX, -(150 - 12));
  assert.strictEqual(bounds.maxX, 150 - 12);
});

test('the top pill cannot go above its default spot', () => {
  assert.strictEqual(topPill().minY, 0);
});

test('the top pill stops a gap above the dock', () => {
  assert.strictEqual(topPill().maxY, 800 - PillLayout.GAP_PX - 4 - 24);
});

test('the top pill has no room to move when the dock is right below it', () => {
  assert.strictEqual(topPill({ dockTop: 30 }).maxY, 0);
});

test('a wide top pill leaves less room to move sideways', () => {
  assert.strictEqual(topPill({ pillWidth: 376 }).maxX, 0);
  assert.strictEqual(topPill({ pillWidth: 500 }).maxX, 0);
});

test('the dock reaches both side margins', () => {
  const bounds = dock();
  assert.strictEqual(bounds.minX, -(156 - 12));
  assert.strictEqual(bounds.maxX, 156 - 12);
});

test('the dock cannot go below its default spot', () => {
  assert.strictEqual(dock().maxY, 0);
});

test('the dock stops a gap below the top pill', () => {
  assert.strictEqual(dock().minY, 28 + PillLayout.GAP_PX - 760);
});

test('the dock has no room to move when the top pill is right above it', () => {
  assert.strictEqual(dock({ topPillBottom: 800 }).minY, 0);
});
