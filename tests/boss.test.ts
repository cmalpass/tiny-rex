import { describe, it, expect, vi } from 'vitest';
import { CFG } from '../src/config';
import { LEVELS } from '../src/level-data';
import { Level } from '../src/level';
import { Player } from '../src/player';
import { MagmaKing, type BossState } from '../src/boss';
import { makeCtx, type MockCtx } from './mock-ctx';

const DT = 1 / 60;

interface Rig {
  ctx: MockCtx;
  level: Level;
  boss: MagmaKing;
}

/** A Molten Nest level with a fresh recording ctx. */
function makeRig(speedMult = 1): Rig {
  const ctx = makeCtx();
  const level = new Level(LEVELS[3].def, ctx, speedMult, 3);
  return { ctx, level, boss: level.boss as MagmaKing };
}

/** A plain player the boss can target; place freely. */
function dummy(x: number, y: number, vy = 0): Player {
  const p = new Player(x, y, makeCtx());
  p.vy = vy;
  return p;
}

/** A falling player whose feet sit just inside the boss's stomp band. */
function stomper(boss: MagmaKing): Player {
  return dummy(boss.x + 40, boss.y - 42, 300);
}

describe('MagmaKing construction', () => {
  it('spawns in the Molten Nest arena with full HP and three live orbs', () => {
    const { boss } = makeRig();
    expect(boss).toBeInstanceOf(MagmaKing);
    expect(boss.x).toBe(2760);
    expect(boss.y).toBe(356);
    expect(boss.hp).toBe(boss.maxHp);
    expect(boss.maxHp).toBe(3);
    expect(boss.rect).toEqual({ x: 2760, y: 356, w: 120, h: 104 });
    expect(boss.state).toBe('walk');
    expect(boss.orbs).toHaveLength(3);
    expect(boss.orbs.every((o) => o.alive && o.respawnT === 0)).toBe(true);
  });

  it('is absent from the other levels', () => {
    for (const l of LEVELS.slice(0, 3)) {
      expect(new Level(l.def, makeCtx()).boss, l.name).toBeNull();
    }
  });

  it('is only vulnerable while staggered or stunned', () => {
    const { boss } = makeRig();
    for (const s of ['walk', 'telegraph', 'chargeWarn', 'charge'] as const) {
      boss.state = s;
      expect(boss.vulnerable, s).toBe(false);
    }
    boss.state = 'stagger';
    expect(boss.vulnerable).toBe(true);
    boss.state = 'stunned';
    expect(boss.vulnerable).toBe(true);
  });
});

describe('MagmaKing behaviour', () => {
  it('patrols inside its arena bounds', () => {
    const { boss } = makeRig();
    const start = boss.x;
    for (let i = 0; i < 120; i++) boss.update(DT, 0, dummy(2000, 414));
    expect(boss.state).toBe('walk');
    expect(boss.x).not.toBe(start);
    expect(boss.x).toBeGreaterThanOrEqual(boss.minX);
    expect(boss.x).toBeLessThanOrEqual(boss.maxX);
  });

  it('telegraphs, then fires a three-glob magma spread', () => {
    const { ctx, level, boss } = makeRig();
    let sawTelegraph = false;
    for (let i = 0; i < 400; i++) {
      boss.update(DT, 0, dummy(2000, 414));
      if (boss.state === 'telegraph') sawTelegraph = true;
    }
    expect(sawTelegraph).toBe(true);
    const magma = level.projectiles.filter((p) => p.kind === 'magma');
    expect(magma).toHaveLength(3);
    expect(ctx.audio.played).toContain('spit');
  });

  it('charges toward the player and staggers at the arena bound', () => {
    const { ctx, boss } = makeRig();
    boss.state = 'chargeWarn';
    const p = dummy(2000, 414); // left of the arena → charge left
    for (let i = 0; i < 200; i++) {
      boss.update(DT, 0, p);
      if ((boss.state as BossState) === 'stagger') break; // TS keeps the stale narrowing
    }
    expect(boss.state).toBe('stagger');
    expect(boss.x).toBe(boss.minX);
    expect(ctx.shakes.length).toBeGreaterThan(0);
    expect(ctx.audio.played).toContain('rock');
  });

  it('takes damage and bounces the player when stomped while vulnerable', () => {
    const { ctx, boss } = makeRig();
    boss.state = 'stagger';
    const p = stomper(boss);
    boss.update(DT, 0, p);
    expect(boss.hp).toBe(2);
    expect(p.vy).toBe(-CFG.player.stompBounce);
    expect(ctx.stomps).toBe(1);
    expect(ctx.scores).toContain(CFG.score.stomp);
    expect(ctx.audio.played).toContain('stomp');
  });

  it('clanks without damage when stomped while not vulnerable', () => {
    const { ctx, boss } = makeRig();
    boss.state = 'walk';
    const before = boss.hp;
    const p = stomper(boss);
    boss.update(DT, 0, p);
    expect(boss.hp).toBe(before);
    expect(p.vy).toBe(-260);
    expect(ctx.audio.played).toContain('rock');
  });

  it('damages the player on side contact, unless invulnerable', () => {
    const { boss } = makeRig();
    boss.state = 'walk';
    const p = dummy(boss.x + 40, boss.y + 30);
    const spy = vi.spyOn(p, 'damage');
    boss.update(DT, 0, p);
    expect(spy).toHaveBeenCalledWith(expect.anything(), 'enemy');

    const p2 = dummy(boss.x + 40, boss.y + 30);
    p2.invulnT = 1;
    const spy2 = vi.spyOn(p2, 'damage');
    boss.update(DT, 0, p2);
    expect(spy2).not.toHaveBeenCalled();
  });

  it('shatters an orb when stomped: score, bounce, and a respawn timer', () => {
    const { ctx, boss } = makeRig();
    const o = boss.orbs[0]; // (2615, 286)
    const p = dummy(2600, 240, 300);
    boss.update(DT, 0, p);
    expect(o.alive).toBe(false);
    expect(o.respawnT).toBeGreaterThan(0);
    expect(p.vy).toBe(-CFG.player.stompBounce * 0.75);
    expect(ctx.scores).toContain(CFG.score.orb);
    expect(ctx.audio.played).toContain('orb');
    expect(boss.state).not.toBe('stunned'); // two orbs remain
  });

  it('stuns when the last orb shatters, then recovers after the stun window', () => {
    const { ctx, boss } = makeRig();
    boss.orbs[0].alive = false;
    boss.orbs[0].respawnT = 999;
    boss.orbs[1].alive = false;
    boss.orbs[1].respawnT = 999;
    const p = dummy(2750, 170, 300); // onto orb 2 at (2780, 216)
    boss.update(DT, 0, p);
    expect(boss.orbs[2].alive).toBe(false);
    expect(boss.state).toBe('stunned');
    expect(ctx.statuses.some((s) => s.includes('stunned'))).toBe(true);
    for (let i = 0; i < 200; i++) boss.update(DT, 0, p);
    expect(boss.state).toBe('walk');
  });

  it('respawns shattered orbs after their timer elapses', () => {
    const { boss } = makeRig();
    boss.orbs[0].alive = false;
    boss.orbs[0].respawnT = 0.5;
    for (let i = 0; i < 60; i++) boss.update(DT, 0, dummy(2000, 414));
    expect(boss.orbs[0].alive).toBe(true);
  });

  it('dies on the third stomp and notifies the game exactly once', () => {
    const { ctx, boss } = makeRig();
    boss.state = 'stagger';
    boss.hp = 1;
    const p = stomper(boss);
    boss.update(DT, 0, p);
    expect(boss.state).toBe('dying');
    for (let i = 0; i < 120; i++) boss.update(DT, 0, p);
    expect(boss.dead).toBe(true);
    expect(ctx.bossDefeats).toBe(1);
    boss.update(DT, 0, p);
    expect(ctx.bossDefeats).toBe(1);
  });

  it('reset() restores spawn position, HP, orbs, and state', () => {
    const { boss } = makeRig();
    boss.x = boss.minX;
    boss.hp = 1;
    boss.state = 'stagger';
    boss.orbs[0].alive = false;
    boss.orbs[0].respawnT = 999;
    boss.dead = true;
    boss.reset();
    expect(boss.x).toBe(2760);
    expect(boss.y).toBe(356);
    expect(boss.hp).toBe(3);
    expect(boss.state).toBe('walk');
    expect(boss.dead).toBe(false);
    expect(boss.orbs.every((o) => o.alive && o.respawnT === 0)).toBe(true);
  });
});
