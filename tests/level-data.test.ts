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
  it('exposes all three levels with distinct themes', () => {
    expect(LEVELS).toHaveLength(3);
    expect(LEVELS[0].id).toBe(0);
    expect(LEVELS[0].theme).toBe('meadow');
    expect(LEVELS[1].id).toBe(1);
    expect(LEVELS[1].theme).toBe('volcanic');
    expect(LEVELS[2].id).toBe(2);
    expect(LEVELS[2].theme).toBe('frost');
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

describe('LEVEL_3 — Frostpeak Pass integrity', () => {
  const L3 = LEVELS[2].def;

  it('has the expected top-level shape', () => {
    expect(L3.width).toBe(8000);
    expect(L3.startX).toBe(120);
    expect(L3.startY).toBe(414);
    expect(L3.startGroundY).toBe(460);
    expect(L3.goal).toEqual({ x: 7850, y: 460 });
  });

  it('keeps its entity counts, including the new mechanics', () => {
    expect(L3.platforms).toHaveLength(19);
    expect(L3.crystals).toHaveLength(40);
    expect(L3.crystals.filter((c) => c.bonus)).toHaveLength(1);
    expect(L3.enemies).toHaveLength(8);
    expect(L3.enemies.filter((e) => e.type === 'spitter')).toHaveLength(3);
    expect(L3.hazards).toHaveLength(3);
    expect(L3.hazards.filter((h) => h.type === 'lava')).toHaveLength(0);
    expect(L3.checkpoints).toHaveLength(3);
    expect(L3.springs).toHaveLength(5);
    expect(L3.plates).toHaveLength(2);
    expect(L3.doors).toHaveLength(2);
    expect(L3.hearts).toHaveLength(2);
  });

  it('places every platform inside the level bounds', () => {
    for (const p of L3.platforms) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(L3.width);
    }
  });

  it('keeps all ground segments on the ground line', () => {
    const grounds = L3.platforms.filter((p) => p.type === 'ground');
    expect(grounds).toHaveLength(6);
    for (const p of grounds) {
      expect(p.y).toBe(460);
      expect(p.h).toBe(120);
    }
  });

  it('sits every spring pad on a ground segment', () => {
    const grounds = L3.platforms.filter((p) => p.type === 'ground');
    for (const s of L3.springs ?? []) {
      const on = grounds.some((p) => s.x >= p.x && s.x + 48 <= p.x + p.w && s.y === p.y);
      expect(on, 'spring at x=' + s.x).toBe(true);
    }
  });

  it('sits each pressure plate on its stone ledge and wires a real door', () => {
    for (const pl of L3.plates ?? []) {
      const ledge = L3.platforms.find(
        (p) => p.type === 'stone' && pl.x >= p.x && pl.x + 46 <= p.x + p.w && pl.y === p.y,
      );
      expect(ledge, 'plate at x=' + pl.x).toBeTruthy();
      const door = L3.doors?.[pl.door];
      expect(door, 'door index ' + pl.door).toBeTruthy();
    }
  });

  it('drops each sliding door down to the ground line on solid ground', () => {
    const grounds = L3.platforms.filter((p) => p.type === 'ground');
    for (const d of L3.doors ?? []) {
      expect(d.y + d.h).toBe(460);
      const on = grounds.some((p) => d.x >= p.x && d.x + d.w <= p.x + p.w);
      expect(on, 'door at x=' + d.x).toBe(true);
    }
  });

  it('perches each spitter on a stone ledge', () => {
    for (const e of L3.enemies) {
      if (e.type !== 'spitter') continue;
      const perch = L3.platforms.find(
        (p) => p.type === 'stone' && e.x >= p.x && e.x + 40 <= p.x + p.w && p.y === 380,
      );
      expect(perch, 'spitter at x=' + e.x).toBeTruthy();
      expect(e.y).toBe(380 - 38);
    }
  });

  it('positions ground enemies on the ground line', () => {
    for (const e of L3.enemies) {
      if (e.type === 'spitter') continue; // perched, checked above
      expect(e.minX).toBeLessThan(e.x);
      expect(e.maxX).toBeGreaterThan(e.x);
      expect(e.y).toBeLessThanOrEqual(460);
    }
  });

  it('keeps patrolling enemies within their ground segment', () => {
    const grounds = L3.platforms.filter((p) => p.type === 'ground');
    for (const e of L3.enemies) {
      if (e.type === 'ptero' || e.type === 'spitter') continue;
      const seg = grounds.find((p) => (e.minX ?? 0) >= p.x && (e.maxX ?? 0) <= p.x + p.w);
      expect(seg, e.type + ' at x=' + e.x).toBeTruthy();
    }
  });

  it('keeps every ground gap inside a full-speed running jump (~237px)', () => {
    const grounds = L3.platforms.filter((p) => p.type === 'ground').sort((a, b) => a.x - b.x);
    for (let i = 0; i < grounds.length - 1; i++) {
      const gapStart = grounds[i].x + grounds[i].w;
      const gapEnd = grounds[i + 1].x;
      const width = gapEnd - gapStart;
      if (width <= 235) continue; // jumpable: 285 px/s * (2*625/1500) s ≈ 237px
      const bridged = L3.platforms.some(
        (p) => p.type !== 'ground' && p.x + p.w > gapStart + 20 && p.x < gapEnd - 20 && p.y >= 280,
      );
      expect(bridged, 'gap ' + gapStart + '..' + gapEnd + ' is ' + width + 'px').toBe(true);
    }
  });

  it('places checkpoints on ground segments', () => {
    const grounds = L3.platforms.filter((p) => p.type === 'ground');
    for (const cp of L3.checkpoints) {
      const on = grounds.some((p) => cp.x >= p.x && cp.x <= p.x + p.w);
      expect(on, 'checkpoint at x=' + cp.x).toBe(true);
    }
  });
});
