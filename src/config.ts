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
    timeBonusBase: 2400,
    timeBonusPerSec: 10,
  },
  killY: 680, // falling below this = pit death
} as const;

export const VW = CFG.view.w;
export const VH = CFG.view.h;
export const TAU = Math.PI * 2;
export const FONT_STACK = '"Trebuchet MS", "Segoe UI", Verdana, sans-serif';
