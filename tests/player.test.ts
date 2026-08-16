import { describe, it, expect } from 'vitest';
import { CFG } from '../src/config';
import { LEVEL_DATA } from '../src/level-data';
import { Level } from '../src/level';
import { Player } from '../src/player';
import { Input } from '../src/input';
import { makeCtx, type MockCtx } from './mock-ctx';

const DT = 1 / 60;

interface Rig {
  game: MockCtx;
  level: Level;
  player: Player;
  input: Input;
}

function setup(x: number, y: number): Rig {
  const game = makeCtx();
  const level = new Level(LEVEL_DATA, game);
  const player = new Player(x, y, game);
  const input = new Input();
  return { game, level, player, input };
}

describe('Player', () => {
  it('lands on the starting ground and settles idle', () => {
    const { level, player, input } = setup(LEVEL_DATA.startX, LEVEL_DATA.startY);
    player.update(DT, 0, input, level);
    expect(player.grounded).toBe(true);
    expect(player.y).toBe(LEVEL_DATA.startGroundY - player.h);
    expect(player.feet).toBe(LEVEL_DATA.startGroundY);
    expect(player.state).toBe('idle');
  });

  it('applies gravity while airborne', () => {
    const { player, level, input } = setup(120, 300);
    player.update(DT, 0, input, level);
    expect(player.vy).toBeCloseTo(CFG.player.gravity * DT, 6);
    expect(player.y).toBeGreaterThan(300);
    expect(player.grounded).toBe(false);
    expect(player.state).toBe('fall');
  });

  it('consumes a fresh jump press and cuts the ascent on release', () => {
    const { game, level, player, input } = setup(120, 414);
    player.update(DT, 0, input, level); // land first
    const t = 1;
    input.jumpBufferT = t;
    player.update(DT, t, input, level);
    // jump fired (vy = -jumpVel), released immediately so the ascent is
    // cut (x jumpCut), then one gravity step: -625 * 0.42 + 1500/60
    expect(input.jumpBufferT).toBe(-1); // consumed
    expect(player.vy).toBeCloseTo(-CFG.player.jumpVel * CFG.player.jumpCut + CFG.player.gravity * DT, 5);
    expect(player.state).toBe('jump');
    expect(game.audio.played).toContain('jump');
  });

  it('keeps the full jump velocity while the button is held', () => {
    const { level, player, input } = setup(120, 414);
    player.update(DT, 0, input, level); // land
    const t = 1;
    input.touch.jump = true;
    input.jumpBufferT = t;
    player.update(DT, t, input, level);
    expect(player.vy).toBeCloseTo(-CFG.player.jumpVel + CFG.player.gravity * DT, 5);
    input.touch.jump = false;
  });

  it('ignores jump presses outside the buffer window', () => {
    const { game, level, player, input } = setup(120, 414);
    player.update(DT, 0, input, level); // land
    const t = 1;
    input.jumpBufferT = t - 0.5; // pressed half a second ago (> 0.13s window)
    player.update(DT, t, input, level);
    expect(player.vy).toBe(0);
    expect(player.grounded).toBe(true);
    expect(game.audio.played).not.toContain('jump');
  });

  it('takes spike damage with knockback and i-frames', () => {
    const { game, level, player, input } = setup(2620, 414);
    player.update(DT, 0, input, level);
    expect(player.hearts).toBe(CFG.player.maxHearts - 1);
    expect(player.invulnT).toBeCloseTo(CFG.player.invulnTime, 5);
    expect(player.vx).toBe(-CFG.player.knockX); // knocked left, away from the spike centre
    expect(player.vy).toBe(-CFG.player.knockY);
    expect(game.statuses).toContain('Ouch!');
    expect(game.audio.played).toContain('hurt');
    // state is recomputed at the top of the next frame (hurtT was set after the state block)
    player.update(DT, 0.016, input, level);
    expect(player.state).toBe('hurt');
  });

  it('is invulnerable to damage during i-frames', () => {
    const { level, player, input } = setup(2620, 414);
    player.update(DT, 0, input, level); // first hit
    const hearts = player.hearts;
    player.update(DT, 0.016, input, level);
    expect(player.hearts).toBe(hearts); // invulnT still > 0
  });

  it('stomps a beetle from above, bouncing off it', () => {
    const { game, level, player, input } = setup(950, 395);
    // beetle lives at (950, 432) with h=28; player feet at 441 overlap its top
    player.vy = 100;
    const beetle = level.enemies[0];
    expect(beetle.type).toBe('beetle');
    player.update(DT, 0, input, level);
    expect(beetle.dead).toBe(true);
    expect(game.stomps).toBe(1);
    expect(player.vy).toBe(-CFG.player.stompBounce);
    expect(game.scores).toContain(CFG.score.stomp);
    expect(game.audio.played).toContain('stomp');
  });

  it('stomping with a held jump gives the higher bounce', () => {
    const { level, player, input } = setup(950, 395);
    player.vy = 100;
    input.touch.jump = true;
    player.update(DT, 0, input, level);
    expect(player.vy).toBe(-CFG.player.stompBounceHeld);
    input.touch.jump = false;
  });

  it('dies in a pit and notifies the game', () => {
    const { game, level, player, input } = setup(1160, 700); // gap between grounds 1150–1230
    player.update(DT, 0, input, level);
    expect(player.dead).toBe(true);
    expect(player.state).toBe('dead');
    expect(game.deaths).toBe(1);
    expect(game.audio.played).toContain('die');
  });

  it('collects a crystal and awards its score', () => {
    const { game, level, player, input } = setup(190, 414);
    const crystal = level.crystals[0];
    expect(crystal.x).toBe(190);
    player.update(DT, 0, input, level);
    expect(crystal.collected).toBe(true);
    expect(game.scores).toContain(CFG.score.crystal);
    expect(game.audio.played).toContain('collect');
  });

  it('activates a checkpoint on contact', () => {
    const { game, level, player, input } = setup(2330, 414);
    const cp = level.checkpoints[0];
    expect(cp.active).toBe(false);
    player.update(DT, 0, input, level);
    expect(cp.active).toBe(true);
    expect(game.checkpoints).toBe(1);
    expect(game.statuses).toContain('Checkpoint!');
    expect(game.scores).toContain(CFG.score.checkpoint);
  });

  it('reaches the goal and triggers victory', () => {
    const { game, level, player, input } = setup(7150, 414);
    expect(player.state).not.toBe('victory');
    player.update(DT, 0, input, level);
    expect(player.state).toBe('victory');
    expect(player.vx).toBe(0);
    expect(game.victories).toBe(1);
  });

  it('deactivates a crumble platform after landing on it', () => {
    const { game, level, player, input } = setup(1010, 364 - 46);
    const crumble = level.platforms.find((p) => p.type === 'crumble');
    expect(crumble).toBeDefined();
    expect(crumble!.active).toBe(true);
    // fall from above the crumble shelf (y=412) until the landing triggers it
    for (let i = 0; i < 30 && crumble!.active; i++) player.update(DT, i * DT, input, level);
    expect(crumble!.active).toBe(false);
    expect(game.audio.played).toContain('crumble');
  });
});
