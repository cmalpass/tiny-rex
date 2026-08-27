import { afterEach, describe, expect, it, vi } from 'vitest';
import { CFG } from '../src/config';
import { LEVEL_DATA } from '../src/level-data';
import { Level } from '../src/level';
import { Player } from '../src/player';
import { Input } from '../src/input';
import { Crystal } from '../src/crystal';
import { Enemy } from '../src/enemy';
import { PowerUp, rollDrop } from '../src/powerup';
import { makeCtx, type MockCtx } from './mock-ctx';

const DT = 1 / 60;

interface Rig {
  game: MockCtx;
  level: Level;
  player: Player;
  input: Input;
}

function setup(x = 120, y = 414): Rig {
  const game = makeCtx();
  const level = new Level(LEVEL_DATA, game);
  const player = new Player(x, y, game);
  const input = new Input();
  return { game, level, player, input };
}

describe('rollDrop', () => {
  it('drops nothing when the roll misses the chance', () => {
    expect(rollDrop(() => 0.5)).toBeNull(); // 0.5 >= 0.25
    expect(rollDrop(() => 0.99)).toBeNull();
  });

  it('covers all three capsules (single roll, chance 0.25)', () => {
    expect(rollDrop(() => 0.05)).toBe('magnet'); // pick 0.2 < 1/3
    expect(rollDrop(() => 0.1)).toBe('double'); // pick 0.4 < 2/3
    expect(rollDrop(() => 0.2)).toBe('bubble'); // pick 0.8 >= 2/3
    expect(rollDrop(() => 0.25)).toBeNull(); // exactly at the chance edge
    expect(rollDrop(() => 0.9)).toBeNull();
  });
});

describe('PowerUp capsule', () => {
  it('starts alive and expires after the wait', () => {
    const pw = new PowerUp('magnet', 100, 100);
    expect(pw.alive).toBe(true);
    for (let i = 0; i < CFG.powerup.expireT * 60 - 1; i++) pw.update(DT);
    expect(pw.alive).toBe(true);
    pw.update(DT);
    expect(pw.life).toBe(0);
    expect(pw.alive).toBe(false);
  });

  it('stops being alive once collected', () => {
    const pw = new PowerUp('bubble', 0, 0);
    pw.collected = true;
    expect(pw.alive).toBe(false);
  });

  it('is removed from the level when collected (no poof)', () => {
    const { game, level, player } = setup();
    level.spawnPowerUp('magnet', 100, 400);
    level.powerups[0].collected = true;
    level.update(DT, 0, player);
    expect(level.powerups).toHaveLength(0);
    expect(game.bursts).toHaveLength(0);
  });

  it('evaporates with a poof when left behind', () => {
    const { game, level, player } = setup();
    level.spawnPowerUp('double', 100, 400);
    for (let i = 0; i < CFG.powerup.expireT * 60 + 5; i++) level.update(DT, i * DT, player);
    expect(level.powerups).toHaveLength(0);
    expect(game.bursts).toHaveLength(1);
    expect(game.bursts[0].x).toBe(100);
  });

  it('level reset clears all capsules', () => {
    const { level } = setup();
    level.spawnPowerUp('magnet', 100, 400);
    level.spawnPowerUp('bubble', 200, 400);
    expect(level.powerups).toHaveLength(2);
    level.reset();
    expect(level.powerups).toHaveLength(0);
  });
});

describe('Player power-up effects', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stomping an enemy rolls a capsule drop', () => {
    const { level, player } = setup(200, 346);
    const beetle = new Enemy({ type: 'beetle', x: 200, y: 432, minX: 160, maxX: 280 }, level, 1);
    level.enemies.push(beetle);
    vi.spyOn(Math, 'random').mockReturnValue(0.05); // drop + 'magnet' (pick 0.2)
    player.vy = 300;
    for (let i = 0; i < 30 && !beetle.dead; i++) {
      player.update(DT, 1 + i * DT, new Input(), level);
    }
    expect(beetle.dead).toBe(true);
    expect(level.powerups).toHaveLength(1);
    expect(level.powerups[0].type).toBe('magnet');
    expect(level.powerups[0].x).toBeCloseTo(219, 0); // beetle centre
  });

  it('no drop when the roll misses', () => {
    const { level, player } = setup(200, 346);
    const beetle = new Enemy({ type: 'beetle', x: 200, y: 432, minX: 160, maxX: 280 }, level, 1);
    level.enemies.push(beetle);
    vi.spyOn(Math, 'random').mockReturnValue(0.9); // 0.9 >= 0.25 -> no drop
    player.vy = 300;
    for (let i = 0; i < 30 && !beetle.dead; i++) {
      player.update(DT, 1 + i * DT, new Input(), level);
    }
    expect(beetle.dead).toBe(true);
    expect(level.powerups).toHaveLength(0);
  });

  it('applyPowerup sets the timers and plays feedback', () => {
    const { game, player } = setup();
    player.applyPowerup('magnet', 100, 100);
    expect(player.magnetT).toBe(CFG.powerup.magnetDur);
    expect(game.statuses).toContain('Magnet!');
    expect(game.audio.played).toContain('powerup');
    player.applyPowerup('double', 100, 100);
    expect(player.doubleJumpT).toBe(CFG.powerup.doubleJumpDur);
    expect(game.statuses).toContain('Double Jump!');
    player.applyPowerup('bubble', 100, 100);
    expect(player.bubble).toBe(true);
    expect(game.statuses).toContain('Bubble Shield!');
  });

  it('timers decay and reset() clears everything', () => {
    const { level, player } = setup();
    player.applyPowerup('magnet', 0, 0);
    player.applyPowerup('bubble', 0, 0);
    for (let i = 0; i < (CFG.powerup.magnetDur + 0.3) * 60; i++) {
      player.update(DT, i * DT, new Input(), level);
    }
    expect(player.magnetT).toBe(0);
    player.reset(120, 414, false);
    expect(player.magnetT).toBe(0);
    expect(player.doubleJumpT).toBe(0);
    expect(player.bubble).toBe(false);
    expect(player.airJumps).toBe(0);
  });

  it('the magnet pulls nearby crystals toward Rex', () => {
    const { level, player } = setup();
    player.update(DT, 0, new Input(), level); // land first
    const near = new Crystal(200, 400, false);
    const far = new Crystal(120, 120, false);
    level.crystals.push(near, far);
    player.magnetT = CFG.powerup.magnetDur;
    for (let i = 0; i < 3; i++) player.update(DT, i * DT, new Input(), level);
    expect(near.x).toBeLessThan(200); // pulled left, toward the player
    expect(near.y).toBeGreaterThan(400); // and down, toward the centre
    expect(near.collected).toBe(false); // not close enough yet
    expect(far.x).toBe(120); // out of range: untouched
    expect(far.y).toBe(120);
  });

  it('the magnet stops pulling after it expires', () => {
    const { level, player } = setup();
    player.update(DT, 0, new Input(), level);
    const c = new Crystal(200, 400, false);
    level.crystals.push(c);
    player.magnetT = CFG.powerup.magnetDur;
    const frames = CFG.powerup.magnetDur * 60 + 60;
    for (let i = 0; i < frames; i++) player.update(DT, i * DT, new Input(), level);
    expect(player.magnetT).toBe(0);
    const x = c.x, y = c.y;
    player.update(DT, frames * DT, new Input(), level);
    expect(c.x).toBe(x);
    expect(c.y).toBe(y);
  });

  it('double jump gives one extra mid-air jump', () => {
    const { game, level, player, input } = setup(120, 300);
    player.update(DT, 0, input, level); // let gravity start
    player.doubleJumpT = CFG.powerup.doubleJumpDur;
    input.jumpBufferT = 1; // fresh press
    player.update(DT, 1, input, level);
    expect(player.airJumps).toBe(1);
    // impulse minus the early release cut, plus one gravity step
    expect(player.vy).toBeCloseTo(
      -CFG.powerup.doubleJumpVel * CFG.player.jumpCut + CFG.player.gravity * DT,
      5,
    );
    expect(game.audio.played).toContain('jump');
  });

  it('the extra jump cannot stack within one flight', () => {
    const { level, player, input } = setup(120, 300);
    player.update(DT, 0, input, level);
    player.doubleJumpT = CFG.powerup.doubleJumpDur;
    input.jumpBufferT = 1;
    player.update(DT, 1, input, level);
    input.jumpBufferT = 1.1; // press again, still airborne
    player.update(DT, 1.1, input, level);
    expect(player.airJumps).toBe(1);
  });

  it('without the power-up an air jump does nothing', () => {
    const { game, level, player, input } = setup(120, 300);
    player.update(DT, 0, input, level);
    input.jumpBufferT = 1;
    player.update(DT, 1, input, level);
    expect(player.airJumps).toBe(0);
    expect(player.vy).toBeGreaterThan(0); // still falling
    expect(game.audio.played).not.toContain('jump');
  });

  it('landing resets the air-jump allotment', () => {
    const { level, player, input } = setup(120, 300);
    player.update(DT, 0, input, level);
    player.doubleJumpT = CFG.powerup.doubleJumpDur;
    input.jumpBufferT = 1;
    player.update(DT, 1, input, level);
    expect(player.airJumps).toBe(1);
    player.y = 415; // drop onto the start ground (top 460)
    player.vy = 50;
    player.update(DT, 1.1, input, level);
    expect(player.grounded).toBe(true);
    expect(player.airJumps).toBe(0);
  });

  it('the bubble absorbs one hit without losing a heart', () => {
    const { game, player } = setup();
    player.bubble = true;
    player.hearts = 3;
    player.damage({ x: 0, w: 34 }, 'enemy');
    expect(player.bubble).toBe(false);
    expect(player.hearts).toBe(3);
    expect(player.invulnT).toBeGreaterThan(0);
    expect(game.audio.played).toContain('bubblePop');
    expect(game.statuses).toContain('Bubble popped!');
  });

  it('without a bubble the hit costs a heart', () => {
    const { game, player } = setup();
    player.hearts = 3;
    player.damage({ x: 0, w: 34 }, 'enemy');
    expect(player.hearts).toBe(2);
    expect(game.audio.played).toContain('hurt');
  });
});
