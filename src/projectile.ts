import { CFG } from './config';
import { overlap } from './util';
import type { Level } from './level';
import type { Player } from './player';
import { drawGlob, drawMagmaGlob } from './sprite';

export type ProjectileKind = 'goo' | 'magma';

/** A glob of spitter goo (or boss magma): arcs, bounces once, fades out. */
export class Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r = 9;
  dead = false;
  /** bounces left before fading. */
  bounces = 1;
  age = 0;
  /** extra life granted after a bounce. */
  life = 2.4;
  kind: ProjectileKind;
  readonly originX: number;

  constructor(
    x: number, y: number, vx: number, vy: number,
    kind: ProjectileKind = 'goo',
  ) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.kind = kind;
    this.originX = x;
  }

  get rect(): { x: number; y: number; w: number; h: number } {
    return { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 };
  }

  update(dt: number, level: Level, player: Player): void {
    this.age += dt;
    this.vy += CFG.spitter.projGravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // pop against solid ground
    const popColors =
      this.kind === 'magma' ? ['#ff9d3f', '#ffd257'] : ['#8fe07a', '#c9f0a0'];
    for (const p of level.platforms) {
      if (!p.solid() || !overlap(this.rect, p)) continue;
      if (this.vy > 0 && this.bounces > 0) {
        this.bounces -= 1;
        this.y = p.y - this.r;
        this.vy = -Math.abs(this.vy) * 0.42;
        this.vx *= 0.72;
        this.life = Math.max(this.life, 0.9);
        level.game.burst(this.x, this.y + this.r, 6, popColors, 'dot', 90);
      } else {
        this.dead = true;
        level.game.burst(this.x, this.y, 7, [popColors[0]], 'dot', 80);
      }
      break;
    }
    if (this.age > this.life) this.dead = true;
    // hit the player
    const isBehindPlayer =
      (this.vx < 0 && player.x > this.originX + this.r) ||
      (this.vx > 0 && player.x + player.w < this.originX - this.r);
    if (!isBehindPlayer && !player.dead && player.state !== 'victory' &&
        player.invulnT <= 0 && overlap(this.rect, player.rect)) {
      this.dead = true;
      player.damage({ x: this.x - this.r, w: this.r * 2 }, 'spit');
    }
    if (this.x < -60 || this.x > level.width + 60 || this.y > 640) this.dead = true;
  }

  draw(ctx: CanvasRenderingContext2D, t: number): void {
    if (this.kind === 'magma') drawMagmaGlob(ctx, this.x, this.y, this.r, t);
    else drawGlob(ctx, this.x, this.y, this.r, t);
  }
}
