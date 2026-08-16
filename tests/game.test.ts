import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../src/game';
import { LEVEL_DATA } from '../src/level-data';

function makeGame(): Game {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  return new Game(canvas);
}

describe('Game state machine', () => {
  let game: Game;

  beforeEach(() => {
    game = makeGame();
  });

  it('boots in the menu state', () => {
    expect(game.state).toBe('menu');
    expect(game.player).toBeNull();
    expect(game.level).toBeNull();
  });

  it('starts a run from the menu with the primary key', () => {
    game.handleKey('primary');
    expect(game.state).toBe('playing');
    expect(game.player).not.toBeNull();
    expect(game.level).not.toBeNull();
    expect(game.score).toBe(0);
    expect(game.checkpoint).toEqual({ x: LEVEL_DATA.startX, y: LEVEL_DATA.startGroundY });
  });

  it('pauses and resumes with the pause key', () => {
    game.handleKey('primary');
    expect(game.state).toBe('playing');
    game.handleKey('pause');
    expect(game.state).toBe('paused');
    game.handleKey('pause');
    expect(game.state).toBe('playing');
  });

  it('pauses automatically when the tab is hidden', () => {
    game.handleKey('primary');
    game.handleKey('visibility');
    expect(game.state).toBe('paused');
  });

  it('restart resets the run in place', () => {
    game.handleKey('primary');
    game.score = 500;
    game.crystalsGot = 7;
    game.deaths = 2;
    game.handleKey('restart');
    expect(game.state).toBe('playing');
    expect(game.score).toBe(0);
    expect(game.crystalsGot).toBe(0);
    expect(game.deaths).toBe(0);
  });

  it('respawns at the checkpoint after game over', () => {
    game.handleKey('primary');
    game.checkpoint = { x: 2330, y: 460 };
    game.state = 'gameover';
    game.handleKey('primary');
    expect(game.state).toBe('playing');
    expect(game.player!.x).toBe(2330);
    expect(game.player!.y).toBe(460 - game.player!.h - 2);
    expect(game.player!.invulnT).toBeGreaterThan(0); // respawn i-frames
  });

  it('ignores primary during the victory intro', () => {
    game.handleKey('primary');
    game.state = 'victory';
    game.victoryT = 0.5;
    game.handleKey('primary');
    expect(game.state).toBe('victory'); // still in the confetti intro
    game.victoryT = 2;
    game.handleKey('primary');
    expect(game.state).toBe('playing');
  });

  it('returns to the menu from any end state', () => {
    game.handleKey('primary');
    game.toMenu();
    expect(game.state).toBe('menu');
    expect(game.player).toBeNull();
    expect(game.level).not.toBeNull(); // rebuilt for the next run
  });

  it('tracks score with floating text', () => {
    expect(game.score).toBe(0);
    game.addScore(100, 0, 0);
    game.addScore(50, 10, 10);
    expect(game.score).toBe(150);
    expect(game.texts).toHaveLength(2);
  });

  it('enters the dying state on death', () => {
    game.handleKey('primary');
    game.onPlayerDeath();
    expect(game.state).toBe('dying');
    expect(game.deaths).toBe(1);
  });

  it('routes touch buttons through the input state', () => {
    expect(game.input.left).toBe(false);
    game.input.touchBtn('left', true);
    expect(game.input.left).toBe(true);
    game.input.touchBtn('left', false);
    expect(game.input.left).toBe(false);
  });

  it('stamps jump touches on the game clock', () => {
    game.time = 5;
    game.input.touchBtn('jump', true);
    expect(game.input.jumpBufferT).toBe(5);
    expect(game.input.jumpHeld).toBe(true);
    game.input.touchBtn('jump', false);
    expect(game.input.jumpHeld).toBe(false);
  });
});
