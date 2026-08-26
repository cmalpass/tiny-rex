import { CFG, TAU } from './config';
import { clamp, lerp, overlap } from './util';
import type { EnemyDef, EnemyType } from './level-data';
import type { Level } from './level';
import type { Player } from './player';

/** Ground beetle (patrol), trike (bounces), ptero (flies), and spitter plant (lobs globs). */
export class Enemy {
  type: EnemyType;
  x: number;
  y: number;
  spawnX: number;
  spawnY: number;
  minX: number;
  maxX: number;
  dir: number;
  dead = false;
  squash = 0;
  phase = Math.random() * TAU;
  /** Random offset the Level assigns to pteros. */
  phase0 = 0;
  hopTimer = 0.6 + Math.random() * 1.2;
  vx = 0;
  vy = 0;
  grounded = false;
  w: number;
  h: number;
  /** Ptero anchor (stored for every enemy; only pteros use it). */
  ax: number;
  ay: number;
  range: number;
  /** Spitter: seconds until the next glob. */
  fireCd: number = CFG.spitter.fireCd;
  /** Spitter: 1 right after firing, eases to 0 (nozzle recoil/glow). */
  charge = 0;
  /** Spitter: faces the player. */
  facing = 1;
  private readonly level: Level;
  /** Speed multiplier (difficulty). */
  private readonly speedMult: number;

  constructor(d: EnemyDef, level: Level, speedMult = 1) {
    this.type = d.type;
    this.level = level;
    this.speedMult = speedMult;
    this.x = d.x;
    this.y = d.y;
    this.spawnX = d.x;
    this.spawnY = d.y;
    this.minX = d.minX !== undefined ? d.minX : d.x - 60;
    this.maxX = d.maxX !== undefined ? d.maxX : d.x + 60;
    this.dir = d.dir || 1;
    this.ax = d.x;
    this.ay = d.y;
    this.range = d.range || 130;
    if (this.type === 'beetle') {
      this.w = 38;
      this.h = 28;
    } else if (this.type === 'trike') {
      this.w = 42;
      this.h = 36;
    } else if (this.type === 'spitter') {
      this.w = 40;
      this.h = 38;
    } else {
      this.w = 46;
      this.h = 30;
    }
  }

  get rect(): { x: number; y: number; w: number; h: number } {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  reset(): void {
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.dead = false;
    this.vx = 0;
    this.vy = 0;
    this.squash = 0;
    if (this.type === 'ptero') {
      this.ax = this.spawnX;
      this.ay = this.spawnY;
    }
  }

  update(dt: number, player: Player): void {
    if (this.dead) return;
    this.squash = Math.max(0, this.squash - dt * 4);
    this.charge = Math.max(0, this.charge - dt * 2.2);
    if (this.type === 'beetle') this.updateBeetle(dt);
    else if (this.type === 'trike') this.updateTrike(dt);
    else if (this.type === 'spitter') this.updateSpitter(dt, player);
    else this.updatePtero(dt);
  }

  private updateBeetle(dt: number): void {
    const speed = 62 * this.speedMult;
    this.x += this.dir * speed * dt;
    // Turn around at walls, patrol bounds, or ledges (no ground ahead).
    const frontX = this.dir > 0 ? this.x + this.w + 3 : this.x - 3;
    const wall = this.level.solidAt(frontX, this.y + this.h * 0.5);
    const ledge = !this.level.solidAt(frontX, this.y + this.h + 8);
    if (wall || ledge || this.x < this.minX || this.x + this.w > this.maxX) {
      this.dir *= -1;
      this.x = clamp(this.x, this.minX, this.maxX - this.w);
    }
    this.phase += dt * 14;
  }

  private updateTrike(dt: number): void {
    // Gravity + vertical platform collision; hops on a timer.
    this.vy = Math.min(this.vy + CFG.player.gravity * dt, 900);
    this.y += this.vy * dt;
    this.grounded = false;
    for (const p of this.level.platforms) {
      if (!p.solid()) continue;
      const r = { x: this.x, y: this.y, w: this.w, h: this.h };
      if (overlap(r, p) && this.vy >= 0 && r.y + r.h - this.vy * dt <= p.y + 14) {
        this.y = p.y - this.h;
        this.vy = 0;
        this.grounded = true;
      }
    }
    this.hopTimer -= dt;
    if (this.grounded && this.hopTimer <= 0) {
      this.vy = -440;
      this.vx = this.dir * 78 * this.speedMult;
      this.hopTimer = 1.35 + Math.random() * 0.5;
      this.squash = 1;
    }
    if (this.grounded) this.vx = lerp(this.vx, 0, dt * 10);
    this.x += this.vx * dt;
    if (this.x < this.minX) {
      this.x = this.minX;
      this.dir = 1;
      if (this.grounded) this.vx = 78 * this.speedMult;
    }
    if (this.x + this.w > this.maxX) {
      this.x = this.maxX - this.w;
      this.dir = -1;
      if (this.grounded) this.vx = -78 * this.speedMult;
    }
    this.phase += dt * (this.grounded ? 6 : 16);
  }

  private updatePtero(dt: number): void {
    // Figure-eight-ish wave around its anchor; speed scales with difficulty.
    this.phase += dt * this.speedMult;
    this.x = this.ax + Math.sin(this.phase * 0.9 + this.phase0) * this.range;
    this.y = this.ay + Math.sin(this.phase * 1.7 + this.phase0 * 2) * 46;
  }

  private updateSpitter(dt: number, player: Player): void {
    this.phase += dt * 3;
    const pcx = player.x + 23; // player center
    const ecx = this.x + this.w / 2;
    const dx = pcx - ecx;
    const dyFeet = player.y + 46 - (this.y + this.h);
    const target = !player.dead && player.state !== 'victory' &&
      Math.abs(dx) < CFG.spitter.range && Math.abs(dyFeet) < CFG.spitter.band;
    this.facing = dx >= 0 ? 1 : -1;
    if (target) {
      this.fireCd -= dt;
      if (this.fireCd <= 0) {
        const speed = clamp(Math.abs(dx) * CFG.spitter.projSpeed, 240, 460);
        this.level.spawnProjectile(
          ecx + this.facing * 20,
          this.y + 12,
          this.facing * speed,
          -330,
        );
        this.level.game.audio.play('spit');
        this.level.game.burst(ecx + this.facing * 24, this.y + 12, 5, ['#8fe07a', '#c9f0a0'], 'dot', 90);
        this.charge = 1;
        this.fireCd = CFG.spitter.fireCd + Math.random() * 0.5;
      }
    } else {
      // Out of range: hold fire, slowly re-arm.
      this.fireCd = Math.max(this.fireCd - dt * 0.5, 0.35);
    }
  }

  stomp(): void {
    this.dead = true;
    this.squash = 1;
  }
}
