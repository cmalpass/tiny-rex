import { describe, it, expect } from 'vitest';
import { LEVEL_DATA, LEVELS } from '../src/level-data';

describe('LEVEL_DATA — Crystal Valley integrity', () => {
  it('has the original top-level shape', () => {
    expect(LEVEL_DATA.width).toBe(7550);
    expect(LEVEL_DATA.startX).toBe(120);
    expect(LEVEL_DATA.startY).toBe(414);
    expect(LEVEL_DATA.startGroundY).toBe(460);
    expect(LEVEL_DATA.goal).toEqual({ x: 7150, y: 460 });
  });

  it('keeps the original entity counts', () => {
    expect(LEVEL_DATA.platforms).toHaveLength(35);
    expect(LEVEL_DATA.crystals).toHaveLength(39);
    expect(LEVEL_DATA.crystals.filter((c) => c.bonus)).toHaveLength(1);
    expect(LEVEL_DATA.enemies).toHaveLength(14);
    expect(LEVEL_DATA.hazards).toHaveLength(6);
    expect(LEVEL_DATA.checkpoints).toHaveLength(3);
    expect(LEVEL_DATA.decor).toHaveLength(49);
  });

  it('places every platform inside the level bounds', () => {
    for (const p of LEVEL_DATA.platforms) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(LEVEL_DATA.width);
    }
  });

  it('keeps all ground segments at the ground line', () => {
    const grounds = LEVEL_DATA.platforms.filter((p) => p.type === 'ground');
    expect(grounds.length).toBeGreaterThan(5);
    for (const p of grounds) {
      expect(p.y).toBe(460);
      expect(p.h).toBe(120);
    }
  });

  it('has x- and y-axis movers over the lava river', () => {
    const movers = LEVEL_DATA.platforms.filter((p) => p.type === 'mover');
    expect(movers.filter((m) => m.axis === 'x')).toHaveLength(2);
    expect(movers.filter((m) => m.axis === 'y')).toHaveLength(1);
    for (const m of movers) {
      expect(m.amp).toBeGreaterThan(0);
      expect(m.speed).toBeGreaterThan(0);
    }
  });

  it('positions ground enemies on the ground line and air enemies above it', () => {
    for (const e of LEVEL_DATA.enemies) {
      if (e.type === 'ptero') {
        expect(e.y).toBeLessThan(460);
        expect(e.range).toBeGreaterThan(0);
      } else {
        expect(e.minX).toBeLessThan(e.x);
        expect(e.maxX).toBeGreaterThan(e.x);
        expect(e.y).toBeLessThanOrEqual(460);
      }
    }
  });

  it('gives the falling-rocks hazard a custom interval', () => {
    const rocks = LEVEL_DATA.hazards.filter((h) => h.type === 'rocks');
    expect(rocks).toHaveLength(1);
    expect(rocks[0].interval).toBe(2.0);
  });
});

describe('LEVELS registry', () => {
  it('exposes both levels with distinct themes', () => {
    expect(LEVELS).toHaveLength(2);
    expect(LEVELS[0].id).toBe(0);
    expect(LEVELS[0].theme).toBe('meadow');
    expect(LEVELS[1].id).toBe(1);
    expect(LEVELS[1].theme).toBe('volcanic');
    expect(LEVELS[0].def).toBe(LEVEL_DATA);
  });
});

describe('LEVEL_2 — Volcanic Depths integrity', () => {
  const L2 = LEVELS[1].def;

  it('has the expected top-level shape', () => {
    expect(L2.width).toBe(7550);
    expect(L2.startX).toBe(120);
    expect(L2.startY).toBe(414);
    expect(L2.startGroundY).toBe(460);
    expect(L2.goal).toEqual({ x: 7350, y: 460 });
  });

  it('keeps its entity counts and a single bonus crystal', () => {
    expect(L2.crystals.filter((c) => c.bonus)).toHaveLength(1);
    expect(L2.checkpoints).toHaveLength(3);
    expect(L2.enemies.length).toBeGreaterThanOrEqual(10);
    expect(L2.hazards.filter((h) => h.type === 'lava').length).toBeGreaterThanOrEqual(2);
  });

  it('places every platform inside the level bounds', () => {
    for (const p of L2.platforms) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(L2.width);
    }
  });

  it('keeps all ground segments on the ground line', () => {
    const grounds = L2.platforms.filter((p) => p.type === 'ground');
    expect(grounds.length).toBeGreaterThanOrEqual(5);
    for (const p of grounds) {
      expect(p.y).toBe(460);
      expect(p.h).toBe(120);
    }
  });

  it('positions ground enemies on the ground line and air enemies above it', () => {
    for (const e of L2.enemies) {
      if (e.type === 'ptero') {
        expect(e.y).toBeLessThan(460);
        expect(e.range).toBeGreaterThan(0);
      } else {
        expect(e.minX).toBeLessThan(e.x);
        expect(e.maxX).toBeGreaterThan(e.x);
        expect(e.y).toBeLessThanOrEqual(460);
      }
    }
  });

  it('keeps patrolling enemies within their ground segment', () => {
    const grounds = L2.platforms.filter((p) => p.type === 'ground');
    for (const e of L2.enemies) {
      if (e.type === 'ptero') continue;
      const seg = grounds.find((p) => (e.minX ?? 0) >= p.x && (e.maxX ?? 0) <= p.x + p.w);
      expect(seg, e.type + ' at x=' + e.x).toBeTruthy();
    }
  });

  it('bridges every wide ground gap with a reachable platform', () => {
    const grounds = L2.platforms.filter((p) => p.type === 'ground').sort((a, b) => a.x - b.x);
    for (let i = 0; i < grounds.length - 1; i++) {
      const gapStart = grounds[i].x + grounds[i].w;
      const gapEnd = grounds[i + 1].x;
      if (gapEnd - gapStart <= 200) continue; // directly jumpable
      const bridged = L2.platforms.some(
        (p) => p.type !== 'ground' && p.x + p.w > gapStart + 20 && p.x < gapEnd - 20 && p.y >= 280,
      );
      expect(bridged, 'gap ' + gapStart + '..' + gapEnd).toBe(true);
    }
  });

  it('keeps lava pools inside ground gaps, never under solid ground', () => {
    const grounds = L2.platforms.filter((p) => p.type === 'ground');
    for (const hz of L2.hazards) {
      if (hz.type !== 'lava') continue;
      const under = grounds.some((p) => hz.x + 40 < p.x + p.w && hz.x + hz.w - 40 > p.x);
      expect(under, 'lava at x=' + hz.x).toBe(false);
    }
  });

  it('places checkpoints on ground segments', () => {
    const grounds = L2.platforms.filter((p) => p.type === 'ground');
    for (const cp of L2.checkpoints) {
      const on = grounds.some((p) => cp.x >= p.x && cp.x <= p.x + p.w);
      expect(on, 'checkpoint at x=' + cp.x).toBe(true);
    }
  });
});
