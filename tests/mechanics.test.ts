import { describe, it, expect } from 'vitest';
import { CFG } from '../src/config';
import type { LevelDef } from '../src/level-data';
import { Level } from '../src/level';
import { Player } from '../src/player';
import { Input, type GameKey } from '../src/input';
import { SpringPad } from '../src/spring';
import { CheatSystem, type CheatId } from '../src/cheats';
import { makeCtx, type MockCtx } from './mock-ctx';

const DT = 1 / 60;

/** A small, flat level that tests can extend with the mechanics under test. */
function makeDef(partial: Partial<LevelDef> = {}): LevelDef {
  return {
    width: 2000,
    startX: 120,
    startY: 414,
    startGroundY: 460,
    platforms: [{ x: 0, y: 460, w: 2000, h: 120, type: 'ground' }],
    crystals: [],
    hazards: [],
    checkpoints: [],
    enemies: [],
    hearts: [],
    goal: { x: 1900, y: 460 },
    decor: [],
    ...partial,
  };
}

interface Rig {
  game: MockCtx;
  level: Level;
  player: Player;
  input: Input;
}

function setup(def: LevelDef, px = 120, py = 414): Rig {
  const game = makeCtx();
  const level = new Level(def, game);
  const player = new Player(px, py, game);
  const input = new Input();
  return { game, level, player, input };
}

describe('SpringPad', () => {
  it('exposes a trigger rect just above the pad', () => {
    const s = new SpringPad(100, 460);
    expect(s.rect).toEqual({ x: 96, y: 434, w: 56, h: 30 });
  });

  it('launches a falling player at full spring velocity', () => {
    const { game, level, player, input } = setup(makeDef({ springs: [{ x: 100, y: 460 }] }), 100, 400);
    player.vy = 50; // dropping onto the pad
    player.update(DT, 0, input, level);
    expect(player.vy).toBe(-CFG.spring.vel);
    expect(player.grounded).toBe(false);
    expect(level.springs[0].compress).toBe(1);
    expect(game.audio.played).toContain('spring');
  });

  it('eases the coil back down after a bounce', () => {
    const s = new SpringPad(0, 460);
    s.bounce();
    expect(s.compress).toBe(1);
    s.update(0.3);
    expect(s.compress).toBeCloseTo(1 - 0.3 * 3.2, 5);
    s.update(1);
    expect(s.compress).toBe(0);
  });
});

describe('PressurePlate + Door', () => {
  const def = makeDef({
    plates: [{ x: 400, y: 460, door: 0 }],
    doors: [{ x: 600, y: 310, w: 40, h: 150 }],
  });

  it('wires each plate to its door in the level', () => {
    const { level } = setup(def);
    expect(level.plates).toHaveLength(1);
    expect(level.doors).toHaveLength(1);
    expect(level.doors[0].plate).toBe(level.plates[0]);
  });

  it('is solid while closed and blocks the level', () => {
    const { level } = setup(def);
    const door = level.doors[0];
    expect(door.solid()).toBe(true);
    expect(level.solidAt(620, 400)).toBe(true);
  });

  it('blocks a player walking into the closed door', () => {
    const { level, player, input } = setup(def, 590, 414);
    player.vx = 200;
    player.update(DT, 0, input, level);
    expect(player.x).toBe(600 - player.w);
    expect(player.vx).toBe(0);
  });

  it('opens while its plate is held and latches open at full raise', () => {
    const { game, level, player } = setup(def, 400, 414); // standing on the plate
    const door = level.doors[0];
    level.update(DT, 0, player);
    expect(level.plates[0].pressed).toBe(true);
    expect(game.audio.played).toContain('plate');
    expect(door.open).toBeGreaterThan(0);
    expect(door.solid()).toBe(true);
    for (let i = 0; i < 60 && !door.latched; i++) level.update(DT, (i + 1) * DT, player);
    expect(door.open).toBe(1);
    expect(door.latched).toBe(true);
    expect(door.solid()).toBe(false);
    expect(level.solidAt(620, 400)).toBe(false);
    expect(game.audio.played).toContain('door');
  });

  it('closes again if the player walks off before the door latches', () => {
    const { game, level, player } = setup(def, 400, 414);
    const door = level.doors[0];
    level.update(DT, 0, player);
    level.update(DT, DT, player);
    expect(door.open).toBeGreaterThan(0);
    expect(door.open).toBeLessThan(1);
    player.x = 1000; // walk away before it latches
    for (let i = 0; i < 60; i++) level.update(DT, i * DT, player);
    expect(door.open).toBe(0);
    expect(door.solid()).toBe(true);
    expect(game.audio.played.filter((n) => n === 'plate')).toHaveLength(2); // press + release
  });

  it('reset() re-closes a latched door and unpresses the plate', () => {
    const { level, player } = setup(def, 400, 414);
    const door = level.doors[0];
    for (let i = 0; i < 40; i++) level.update(DT, i * DT, player);
    expect(door.latched).toBe(true);
    level.reset();
    expect(door.open).toBe(0);
    expect(door.latched).toBe(false);
    expect(door.solid()).toBe(true);
    expect(level.plates[0].pressed).toBe(false);
  });
});

describe('Spitter enemy', () => {
  const def = makeDef({ enemies: [{ type: 'spitter', x: 400, y: 342 }] });

  it('has the spitter body size', () => {
    const { level } = setup(def);
    const sp = level.enemies[0];
    expect(sp.w).toBe(40);
    expect(sp.h).toBe(38);
  });

  it('fires a lobbed glob toward a player in range and re-arms', () => {
    const { game, level, player } = setup(def, 250, 414); // player to the left
    const sp = level.enemies[0];
    let fired = false;
    for (let i = 0; i < 240; i++) {
      level.update(DT, i * DT, player);
      if (level.projectiles.length > 0) {
        fired = true;
        break;
      }
    }
    expect(fired).toBe(true);
    const p = level.projectiles[0];
    expect(p.vx).toBeLessThan(0); // lobbed toward the player on the left
    expect(p.vy).toBeCloseTo(-330 + CFG.spitter.projGravity * DT, 1); // one gravity step
    expect(sp.facing).toBe(-1);
    expect(game.audio.played).toContain('spit');
    expect(sp.charge).toBeGreaterThan(0);
    expect(sp.fireCd).toBeGreaterThan(0); // re-armed
  });

  it('holds fire while the player is out of range', () => {
    const { game, level, player } = setup(def, 1200, 414); // far right of the spitter
    for (let i = 0; i < 120; i++) level.update(DT, i * DT, player);
    expect(level.projectiles).toHaveLength(0);
    expect(game.audio.played).not.toContain('spit');
  });
});

describe('Projectile (spitter glob)', () => {
  it('falls under gravity and bounces once on the ground', () => {
    const { level, player } = setup(makeDef(), 120, 414);
    level.spawnProjectile(500, 450, 120, 100);
    const p = level.projectiles[0];
    level.update(DT, 0, player);
    expect(p.bounces).toBe(0);
    expect(p.vy).toBeLessThan(0); // bounced back up
    expect(p.y).toBe(460 - p.r); // resting on the ground top
    expect(p.x).toBeCloseTo(500 + 120 * DT, 5);
  });

  it('pops when it hits the player (spit damage)', () => {
    const { game, level, player } = setup(makeDef(), 490, 414);
    level.spawnProjectile(500, 450, 0, 0);
    level.update(DT, 0, player);
    expect(player.hearts).toBe(CFG.player.maxHearts - 1);
    expect(game.statuses).toContain('Yuck!');
    expect(level.projectiles).toHaveLength(0); // dead projectiles are filtered
  });

  it('does not re-hit a player during i-frames', () => {
    const { level, player } = setup(makeDef(), 490, 414);
    player.invulnT = CFG.player.invulnTime;
    level.spawnProjectile(500, 450, 0, 0);
    level.update(DT, 0, player);
    expect(player.hearts).toBe(CFG.player.maxHearts);
  });

  it('dies out of bounds', () => {
    const { level, player } = setup(makeDef(), 120, 414);
    level.spawnProjectile(500, 300, 0, 0);
    level.projectiles[0].x = 3000;
    level.update(DT, 0, player);
    expect(level.projectiles).toHaveLength(0);
  });

  it('popProjectile clears the nearest glob (spitter stomp)', () => {
    const { level } = setup(makeDef(), 120, 414);
    level.spawnProjectile(500, 400, 0, 0);
    level.popProjectile(510, 410); // within 30px
    expect(level.projectiles[0].dead).toBe(true);
  });
});

describe('CheatSystem', () => {
  const KONAMI: GameKey[] = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'primary'];
  const GOD: GameKey[] = ['left', 'left', 'right', 'right', 'up', 'up', 'primary'];
  const MAXHEARTS: GameKey[] = ['down', 'down', 'up', 'up', 'left', 'right', 'primary'];

  const feed = (cs: CheatSystem, seq: GameKey[], t0: number, step = 250): CheatId | null => {
    let t = t0;
    let result: CheatId | null = null;
    for (const k of seq) {
      t += step;
      result = cs.press(k, t);
    }
    return result;
  };

  it('fires the Konami code for rainbow Rex', () => {
    const cs = new CheatSystem();
    expect(feed(cs, KONAMI, 0)).toBe('rainbow');
  });

  it('fires god mode on its sequence', () => {
    const cs = new CheatSystem();
    expect(feed(cs, GOD, 0)).toBe('god');
  });

  it('fires score surge on a triple jump tap', () => {
    const cs = new CheatSystem();
    expect(feed(cs, ['primary', 'primary', 'primary'], 0, 150)).toBe('surge');
  });

  it('max hearts fires on its sequence', () => {
    const cs = new CheatSystem();
    expect(feed(cs, MAXHEARTS, 0)).toBe('maxhearts');
  });

  it('rejects a sequence with too long a gap between presses', () => {
    const cs = new CheatSystem();
    let t = 0;
    let result: CheatId | null = null;
    KONAMI.forEach((k, i) => {
      t += i === 2 ? 1500 : 300; // 1.5s stall mid-sequence (> 900ms window)
      result = cs.press(k, t);
    });
    expect(result).toBeNull();
  });

  it('enforces the cooldown between activations', () => {
    const cs = new CheatSystem();
    expect(feed(cs, GOD, 0)).toBe('god'); // fires at t=1750
    expect(feed(cs, GOD, 1750)).toBeNull(); // second attempt finishes at t=3500, < 3s later
  });

  it('max hearts fires only once per page load', () => {
    const cs = new CheatSystem();
    expect(feed(cs, MAXHEARTS, 0)).toBe('maxhearts');
    expect(feed(cs, MAXHEARTS, 61000)).toBeNull(); // well past the 60s cooldown
  });

  it('surge can be re-triggered after its cooldown', () => {
    const cs = new CheatSystem();
    expect(feed(cs, ['primary', 'primary', 'primary'], 0, 150)).toBe('surge');
    expect(feed(cs, ['primary', 'primary', 'primary'], 12500, 150)).toBe('surge');
  });
});

describe('God mode (cheat)', () => {
  it('shows the hit but keeps the heart', () => {
    const { game, player } = setup(makeDef(), 120, 414);
    game.godMode = true;
    player.damage({ x: 150, w: 20 }, 'spikes');
    expect(player.hearts).toBe(CFG.player.maxHearts);
    expect(player.dead).toBe(false);
    expect(game.statuses).toContain('Invulnerable!');
    expect(game.shakes).toHaveLength(0);
  });
});
