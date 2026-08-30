import { describe, it, expect } from 'vitest';
import { Game } from '../src/game';
import { LEVELS, type LevelDef } from '../src/level-data';
import { Level } from '../src/level';
import { AudioManager } from '../src/audio';
import { makeCtx } from './mock-ctx';

function makeGame(): Game {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  return new Game(canvas);
}

const dusk = LEVELS[4];

describe('Duskfen (level 5) registry', () => {
  it('is the fifth level with the dusk theme and a rising tide', () => {
    expect(LEVELS.length).toBe(5);
    expect(dusk.id).toBe(4);
    expect(dusk.name).toBe('Duskfen');
    expect(dusk.theme).toBe('dusk');
    const t = dusk.def.tide!;
    expect(t.fromY).toBeGreaterThan(t.toY);
    expect(t.toY).toBeGreaterThan(0);
    expect(t.rate).toBeGreaterThan(0);
    // the tide must be able to submerge the low ground (ground top = 460)
    expect(t.toY).toBeLessThan(460);
  });

  it('has a valid level structure', () => {
    const def: LevelDef = dusk.def;
    expect(def.width).toBeGreaterThan(5000);
    expect(def.goal.x).toBeGreaterThan(0);
    expect(def.goal.x).toBeLessThan(def.width);
    expect(def.goal.y).toBeLessThanOrEqual(460);
    for (const c of def.crystals) {
      expect(c.x).toBeGreaterThan(0);
      expect(c.x).toBeLessThan(def.width);
      expect(c.y).toBeGreaterThan(0);
    }
    expect(def.springs?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(def.tide).toBeDefined();
  });
});

describe('rising tide mechanic', () => {
  it('climbs while the run is live and stops at the final level', () => {
    const game = makeGame();
    game.levelIdx = 4;
    game.handleKey('primary');
    const lvl = game.level!;
    const t = dusk.def.tide!;
    expect(lvl.waterY).toBe(t.fromY);
    game.update(1);
    expect(lvl.waterY).toBeLessThan(t.fromY);
    expect(lvl.waterY).toBeCloseTo(t.fromY - t.rate, 5);
    game.update(1000);
    expect(lvl.waterY).toBe(t.toY);
  });

  it('does not advance once the run is over', () => {
    const game = makeGame();
    game.levelIdx = 4;
    game.handleKey('primary');
    const lvl = game.level!;
    game.update(1);
    const w = lvl.waterY;
    expect(w).toBeLessThan(dusk.def.tide!.fromY);
    game.state = 'victory';
    game.update(1);
    expect(lvl.waterY).toBe(w);
  });

  it('standing in the water costs a heart, bounces Rex up, and pings once', () => {
    const game = makeGame();
    game.levelIdx = 4;
    game.handleKey('primary');
    const lvl = game.level!;
    const p = game.player!;
    const feet = p.rect.y + p.rect.h;
    expect(feet).toBeGreaterThan(0);
    lvl.waterY = feet - 10; // water just above Rex's feet
    const hearts = p.hearts;
    game.update(0.016);
    expect(p.hearts).toBe(hearts - 1);
    expect(p.invulnT).toBeGreaterThan(0);
    expect(p.vy).toBeLessThan(0); // bounced out of the water
    expect(lvl.tideWarned).toBe(true);
    // still submerged, but invulnerable: no second hit
    game.update(0.016);
    expect(p.hearts).toBe(hearts - 1);
  });

  it('reset restores the waterline', () => {
    const game = makeGame();
    game.levelIdx = 4;
    game.handleKey('primary');
    const lvl = game.level!;
    game.update(1);
    expect(lvl.waterY).toBeLessThan(dusk.def.tide!.fromY);
    lvl.reset();
    expect(lvl.waterY).toBe(dusk.def.tide!.fromY);
    expect(lvl.tideWarned).toBe(false);
    expect(lvl.tideTense).toBe(false);
  });

  it('flags tideTense once the water has climbed 80% of its rise, and reset clears it', () => {
    const game = makeGame();
    game.levelIdx = 4;
    game.handleKey('primary');
    const lvl = game.level!;
    const t = dusk.def.tide!;
    expect(lvl.tideTense).toBe(false);
    // Just under the 80% threshold: no tension cue yet.
    lvl.waterY = t.fromY - 0.79 * (t.fromY - t.toY);
    game.update(0.016);
    expect(lvl.tideTense).toBe(false);
    // Past the threshold: the one-shot tension flag trips.
    lvl.waterY = t.fromY - 0.81 * (t.fromY - t.toY);
    game.update(0.016);
    expect(lvl.tideTense).toBe(true);
    // reset() clears the cue for the next run.
    lvl.reset();
    expect(lvl.tideTense).toBe(false);
  });
});

describe('checkpoint & spawn safety under the full tide', () => {
  // Lowest platform top that stays dry forever: the final waterline minus a
  // margin. A respawn point is safe iff it has a dry refuge within running
  // jump range (max flat gap ~210-230px, jump apex ~130-135px).
  const SAFE_TOP = dusk.def.tide!.toY - 6;
  const REACH_X = 230;
  const REACH_UP = 130;

  function dryRefugeNear(x: number, y: number): boolean {
    return dusk.def.platforms.some((pl) => {
      if (pl.y > SAFE_TOP || pl.y < y - REACH_UP) return false;
      return Math.abs(pl.x - x) <= REACH_X;
    });
  }

  it('every checkpoint and the spawn have a reachable dry refuge', () => {
    const points = [...dusk.def.checkpoints, { x: dusk.def.startX, y: dusk.def.startY }];
    expect(points.length).toBeGreaterThanOrEqual(4);
    for (const pt of points) {
      expect(
        dryRefugeNear(pt.x, pt.y),
        `no dry refuge near respawn point (${pt.x}, ${pt.y})`,
      ).toBe(true);
    }
  });

  it('no checkpoint sits on ground the tide eventually drowns', () => {
    for (const cp of dusk.def.checkpoints) {
      expect(
        cp.y,
        `checkpoint at x=${cp.x} stands on submergeable ground (top ${cp.y} > ${SAFE_TOP})`,
      ).toBeLessThanOrEqual(SAFE_TOP);
    }
  });
});

describe('dusk theme plumbing', () => {
  it('dusk is a valid LevelTheme and the Level builds with tide state', () => {
    const level = new Level(dusk.def, makeCtx(), 1, 2);
    expect(level.tide).not.toBeNull();
    expect(level.waterY).toBe(dusk.def.tide!.fromY);
    expect(level.tideWarned).toBe(false);
  });

  it('dusk music and tide SFX boot without throwing', () => {
    const audio = new AudioManager();
    expect(() => {
      audio.startMusic('dusk');
      audio.play('tide');
    }).not.toThrow();
  });
});
