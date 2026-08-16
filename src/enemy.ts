import { CFG, TAU } from './config';
import { clamp, lerp, overlap } from './util';
import type { EnemyDef, EnemyType } from './level-data';
import type { Level } from './level';

/** Ground beetle (patrol), trike (bounces), and ptero (flies). */
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
  private readonly level: Level;

  constructor(d: EnemyDef, level: Level) {
    this.type = d.type;
    this.level = level;
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

  update(dt: number): void {
    if (this.dead) return;
    this.squash = Math.max(0, this.squash - dt * 4);
    if (this.type === 'beetle') this.updateBeetle(dt);
    else if (this.type === 'trike') this.updateTrike(dt);
    else this.updatePtero(dt);
  }

  private updateBeetle(dt: number): void {
    const speed = 62;
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
      this.vx = this.dir * 78;
      this.hopTimer = 1.35 + Math.random() * 0.5;
      this.squash = 1;
    }
    if (this.grounded) this.vx = lerp(this.vx, 0, dt * 10);
    this.x += this.vx * dt;
    if (this.x < this.minX) {
      this.x = this.minX;
      this.dir = 1;
      if (this.grounded) this.vx = 78;
    }
    if (this.x + this.w > this.maxX) {
      this.x = this.maxX - this.w;
      this.dir = -1;
      if (this.grounded) this.vx = -78;
    }
    this.phase += dt * (this.grounded ? 6 : 16);
  }

  private updatePtero(dt: number): void {
    // Figure-eight-ish wave around its anchor.
    this.phase += dt;
    this.x = this.ax + Math.sin(this.phase * 0.9 + this.phase0) * this.range;
    this.y = this.ay + Math.sin(this.phase * 1.7 + this.phase0 * 2) * 46;
  }

  stomp(): void {
    this.dead = true;
    this.squash = 1;
  }
}
