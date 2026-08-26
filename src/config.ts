/* Central configuration — all gameplay tuning lives here. */
export const CFG = {
  view: { w: 960, h: 540 }, // fixed logical resolution
  fixedDt: 1 / 60, // physics timestep (seconds)
  player: {
    w: 34,
    h: 46,
    accel: 1500, // ground acceleration (px/s^2)
    airAccel: 950, // air acceleration
    friction: 1750, // ground deceleration with no input
    airDrag: 110, // air deceleration with no input
    maxSpeed: 285, // max horizontal speed
    gravity: 1500,
    maxFall: 940, // cap so a 60Hz step (15.7px) never tunnels the 24px slabs
    jumpVel: 625, // jump height ~ v^2 / 2g ≈ 130px
    coyoteTime: 0.1, // seconds of grace after walking off a ledge
    jumpBuffer: 0.13, // seconds a jump press is remembered before landing
    jumpCut: 0.42, // vy multiplier when jump is released early
    stompBounce: 430,
    stompBounceHeld: 565, // higher bounce when jump is held on stomp
    knockX: 265,
    knockY: 335, // knockback impulse after damage
    invulnTime: 1.6,
    maxHearts: 3,
    lavaBounce: 580,
    respawnInvuln: 2.2,
  },
  camera: { lerp: 5.5, lookAhead: 46, maxShake: 14 },
  score: {
    crystal: 100,
    bonusCrystal: 500,
    stomp: 200,
    checkpoint: 250,
    heartBonus: 400,
    /** Points a healing heart is worth when collected at full health. */
    heartFull: 200,
    /** Points a hidden fossil is worth (re-collectable each run). */
    fossil: 150,
    timeBonusBase: 2400,
    timeBonusPerSec: 10,
  },
  /** Crystal combo: pickups inside `window` seconds chain a +`bonus` per step. */
  combo: { window: 2.0, bonus: 25, maxSteps: 12 },
  killY: 680, // falling below this = pit death
  /** Spring pads: launch velocity (~270px pop, v²/2g). */
  spring: { vel: 900 },
  /** Spitter enemy: firing range, cooldown, and projectile tuning. */
  spitter: { range: 520, band: 150, fireCd: 1.8, projSpeed: 1.06, projGravity: 700 },
} as const;

export const VW = CFG.view.w;
export const VH = CFG.view.h;
export const TAU = Math.PI * 2;
export const FONT_STACK = '"Trebuchet MS", "Segoe UI", Verdana, sans-serif';

/* Difficulty presets: hearts on the player, and how fast enemies move. */
export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTIES: Record<Difficulty, { hearts: number; enemySpeed: number }> = {
  easy: { hearts: 5, enemySpeed: 0.8 },
  normal: { hearts: 3, enemySpeed: 1.0 },
  hard: { hearts: 2, enemySpeed: 1.25 },
};

/** End-of-run star rating: finish = 1★, +1 for ≥2 hearts left, +1 for ≥80% crystals. */
export const STARS = {
  heartThreshold: 2,
  crystalPct: 0.8,
};
