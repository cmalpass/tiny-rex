import type { GameCtx, SfxOptions } from '../src/ctx';
import type { ParticleType } from '../src/particles';

export interface MockCtx extends GameCtx {
  godMode: boolean;
  bursts: { x: number; y: number; n: number; colors: string[]; type: ParticleType; speed: number }[];
  scores: number[];
  scoreTotal: number;
  statuses: string[];
  shakes: number[];
  deaths: number;
  victories: number;
  checkpoints: number;
  audio: {
    play: (name: string, opts?: SfxOptions) => void;
    muted: boolean;
    played: string[];
  };
}

/**
 * A recording GameCtx for entity tests: every service call is captured so
 * tests can assert on side effects (score, SFX, status messages).
 */
export function makeCtx(): MockCtx {
  const ctx: MockCtx = {
    audio: {
      play: (name) => {
        ctx.audio.played.push(name);
      },
      muted: false,
      played: [],
    },
    reducedMotion: false,
    godMode: false,
    victoryT: 0,
    stomps: 0,
    bursts: [],
    scores: [],
    scoreTotal: 0,
    statuses: [],
    shakes: [],
    deaths: 0,
    victories: 0,
    checkpoints: 0,
    burst: (x, y, n, colors, type, speed) => {
      ctx.bursts.push({ x, y, n, colors, type, speed });
    },
    addScore: (v, _x, _y) => {
      ctx.scores.push(v);
      ctx.scoreTotal += v;
    },
    addShake: (m) => {
      ctx.shakes.push(m);
    },
    addStatus: (msg) => {
      ctx.statuses.push(msg);
    },
    onPlayerDeath: () => {
      ctx.deaths += 1;
    },
    onPlayerVictory: () => {
      ctx.victories += 1;
    },
    setCheckpoint: () => {
      ctx.checkpoints += 1;
    },
    collectCrystal: (x, y, bonus) => {
      // Mirrors Game.collectCrystal without the combo bookkeeping
      ctx.addScore(bonus ? 500 : 100, x, y);
      ctx.burst(x, y, bonus ? 18 : 10, ['#ffe9b0', '#fff'], 'dot', 150);
      ctx.audio.play(bonus ? 'bonus' : 'collect');
    },
    collectHeart: (x, y) => {
      ctx.burst(x, y, 12, ['#ff8fa3', '#ffd9e2', '#fff'], 'dot', 140);
      ctx.audio.play('heart');
    },
    collectFossil: (x, y, id) => {
      ctx.addScore(150, x, y);
      ctx.burst(x, y, 10, ['#f4ecd9', '#e8dcc0'], 'dot', 130);
      ctx.audio.play('fossil');
      ctx.statuses.push('fossil:' + id);
    },
  };
  return ctx;
}
