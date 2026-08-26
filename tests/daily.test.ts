import { describe, it, expect } from 'vitest';
import { dailySeed, dailyLabel, rexCode, parseRexCode, generateDailyLevel } from '../src/daily';
import type { LevelDef, PlatformDef } from '../src/level-data';

const GY = 460;

function grounds(def: LevelDef): PlatformDef[] {
  return def.platforms.filter((p) => p.type === 'ground');
}

/** The ground platform covering x (the level floor is contiguous per segment). */
function groundAt(def: LevelDef, x: number): PlatformDef | null {
  return grounds(def).find((g) => x >= g.x && x <= g.x + g.w) ?? null;
}

describe('daily seed & Rex code', () => {
  it('seed is YYYYMMDD of the local date', () => {
    expect(dailySeed(new Date(2026, 7, 26))).toBe(20260826);
    expect(dailySeed(new Date(2025, 0, 5))).toBe(20250105);
  });

  it('label formats the seed as "Daily · Mon D"', () => {
    expect(dailyLabel(20260826)).toBe('Daily · Aug 26');
    expect(dailyLabel(20250105)).toBe('Daily · Jan 5');
  });

  it('rexCode round-trips through parseRexCode', () => {
    for (let s = 1; s <= 100; s++) {
      const seed = s * 7919 + 123;
      const code = rexCode(seed);
      expect(code).toMatch(/^[0-9A-Z]{6}$/);
      expect(parseRexCode(code)).toBe(seed);
    }
  });

  it('parseRexCode rejects malformed codes', () => {
    for (const bad of ['', '12 34', 'abc123', '0', '1234567', 'ABC-DEF']) {
      expect(parseRexCode(bad)).toBeNull();
    }
  });
});

describe('generateDailyLevel — determinism', () => {
  it('same seed → identical level', () => {
    const a = generateDailyLevel(20260826);
    const b = generateDailyLevel(20260826);
    expect(a.def).toEqual(b.def);
    expect(a.theme).toBe(b.theme);
  });

  it('different seeds → different layouts', () => {
    const a = generateDailyLevel(20260826);
    const b = generateDailyLevel(20260827);
    expect(a.def).not.toEqual(b.def);
  });

  it('theme cycles deterministically with the seed', () => {
    const themes = [generateDailyLevel(20260826).theme, generateDailyLevel(20260827).theme, generateDailyLevel(20260828).theme];
    expect(new Set(themes).size).toBeGreaterThan(1);
  });
});

describe('generateDailyLevel — validity across 50 seeds', () => {
  it('holds for every checked seed', () => {
    for (let s = 0; s < 50; s++) {
      const seed = 1000 + s * 997;
      const { def } = generateDailyLevel(seed);
      expect(def.width, `seed ${seed}: width`).toBeGreaterThan(3500);

      // Every entity lives inside the level bounds.
      for (const p of def.platforms) {
        expect(p.x, `seed ${seed}: platform x`).toBeGreaterThanOrEqual(0);
        expect(p.x + p.w, `seed ${seed}: platform right`).toBeLessThanOrEqual(def.width);
      }
      for (const c of def.crystals) {
        expect(c.x, `seed ${seed}: crystal x`).toBeGreaterThanOrEqual(0);
        expect(c.x, `seed ${seed}: crystal right`).toBeLessThanOrEqual(def.width);
      }
      for (const h of def.hazards) {
        expect(h.x, `seed ${seed}: hazard x`).toBeGreaterThanOrEqual(0);
        expect(h.x + h.w, `seed ${seed}: hazard right`).toBeLessThanOrEqual(def.width);
      }
      for (const e of def.enemies) {
        expect(e.x, `seed ${seed}: enemy x`).toBeGreaterThanOrEqual(0);
        expect(e.x, `seed ${seed}: enemy right`).toBeLessThanOrEqual(def.width);
      }

      // Pits (gaps between ground segments) are always jumpable.
      const gs = grounds(def);
      expect(gs[0].x, `seed ${seed}: starts with ground`).toBe(0);
      for (let g = 1; g < gs.length; g++) {
        const gap = gs[g].x - (gs[g - 1].x + gs[g - 1].w);
        expect(gap, `seed ${seed}: pit width`).toBeGreaterThanOrEqual(0);
        expect(gap, `seed ${seed}: pit ≤140px`).toBeLessThanOrEqual(140);
      }

      // Start and goal stand on solid ground.
      expect(groundAt(def, def.startX), `seed ${seed}: start ground`).not.toBeNull();
      expect(groundAt(def, def.goal.x), `seed ${seed}: goal ground`).not.toBeNull();
      expect(def.goal.y).toBe(GY);

      // Walkers patrol within a single ground segment (never across a pit).
      for (const e of def.enemies) {
        if (e.type === 'beetle' || e.type === 'trike') {
          const g = grounds(def).find((g) => e.minX! >= g.x && e.maxX! <= g.x + g.w);
          expect(g, `seed ${seed}: walker patrol on one ground`).toBeDefined();
          expect(e.y, `seed ${seed}: walker feet on ground`).toBe(e.type === 'beetle' ? GY - 28 : GY - 36);
        } else if (e.type === 'spitter') {
          const perch = def.platforms.find((p) => p.y === e.y + 38);
          expect(perch, `seed ${seed}: spitter has a perch`).toBeDefined();
        } else if (e.type === 'ptero') {
          expect(e.y, `seed ${seed}: ptero altitude`).toBeGreaterThanOrEqual(240);
          expect(e.y, `seed ${seed}: ptero altitude`).toBeLessThanOrEqual(320);
        }
      }

      // Checkpoints stand on ground, away from ground hazards.
      for (const cp of def.checkpoints) {
        expect(groundAt(def, cp.x), `seed ${seed}: checkpoint ground`).not.toBeNull();
        for (const h of def.hazards) {
          if (h.type === 'lava') continue; // lava sits in pits, never on the floor
          const center = h.x + h.w / 2;
          const dist = Math.abs(center - cp.x);
          expect(dist, `seed ${seed}: checkpoint clear of ${h.type}`).toBeGreaterThanOrEqual(150);
        }
      }

      // Every pit with lava has lava sized to the pit.
      for (const h of def.hazards.filter((h) => h.type === 'lava')) {
        expect(h.y).toBe(520);
        expect(h.w).toBeGreaterThanOrEqual(60);
        expect(h.w).toBeLessThanOrEqual(140);
      }

      // The level has a reasonable amount of content.
      expect(def.crystals.length).toBeGreaterThanOrEqual(8);
      expect(def.enemies.length).toBeGreaterThanOrEqual(3);
      expect(def.checkpoints.length).toBeGreaterThanOrEqual(1);
    }
  });
});
