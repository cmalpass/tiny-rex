import type { Checkpoint } from './checkpoint';
import type { ParticleType } from './particles';

/** Per-play SFX options (most SFX take none). */
export interface SfxOptions {
  /** Combo step (2+) for crystal pickup — raises the pitch so streaks feel accelerating. */
  comboStep?: number;
  /** True when a heart pickup restored health; false when it converted to points at full health. */
  healed?: boolean;
  /** Which victory star is popping (0–2) — raises the chime a touch each time. */
  starIndex?: number;
  /** Pressure plate just pressed (true) or released (false). */
  pressed?: boolean;
  /** Victory fanfare variant: true for a flawless run (no damage, no deaths). */
  flawless?: boolean;
}

/** Minimal SFX surface that entities need from the audio manager. */
export interface Sfx {
  play(name: string, opts?: SfxOptions): void;
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
  /** Cheat code: Rex cannot lose hearts while this is on. */
  godMode: boolean;
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
  /**
   * The player lost a heart (god mode and bubble saves do not count).
   * Feeds the flawless-run tracking for the victory fanfare.
   */
  onPlayerHit(): void;
  /**
   * The Magma King collapsed: bonus score, fanfare, and the nest gate
   * latches open. Fired exactly once per boss death.
   */
  onBossDefeated(): void;
  setCheckpoint(cp: Checkpoint): void;
  /**
   * A crystal was collected: score (including any combo bonus), sparkles
   * and SFX in one call so the combo bookkeeping stays in one place.
   */
  collectCrystal(x: number, y: number, bonus: boolean): void;
  /**
   * A heart pickup was collected: restores one heart, or pays points when
   * the player is already at full health.
   */
  collectHeart(x: number, y: number): void;
  /**
   * A hidden fossil was unearthed: score + sparkle, and the first discovery
   * is persisted to the fossil codex (id = "<levelIdx>:<i>").
   */
  collectFossil(x: number, y: number, id: string): void;
}
