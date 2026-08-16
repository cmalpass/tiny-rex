import type { Checkpoint } from './checkpoint';
import type { ParticleType } from './particles';

/** Minimal SFX surface that entities need from the audio manager. */
export interface Sfx {
  play(name: string): void;
  readonly muted: boolean;
}

/**
 * Services the Game exposes to entities so they stay decoupled from the
 * concrete Game class (and the DOM). Game implements this interface;
 * tests provide a mock.
 */
export interface GameCtx {
  readonly audio: Sfx;
  /** True when the user has enabled calm mode (fewer particles, no shake). */
  reducedMotion: boolean;
  /** Seconds since the current victory sequence started. */
  victoryT: number;
  /** Stomp count for the current run. */
  stomps: number;
  burst(x: number, y: number, n: number, colors: string[], type: ParticleType, speed: number): void;
  addScore(v: number, x: number, y: number): void;
  addShake(m: number): void;
  addStatus(msg: string, color?: string): void;
  onPlayerDeath(): void;
  onPlayerVictory(): void;
  setCheckpoint(cp: Checkpoint): void;
}
