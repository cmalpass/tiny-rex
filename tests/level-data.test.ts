import { describe, it, expect } from 'vitest';
import { LEVEL_DATA } from '../src/level-data';

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
