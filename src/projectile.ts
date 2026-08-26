import { CFG } from './config';
import { overlap } from './util';
import type { Level } from './level';
import type { Player } from './player';
import { drawGlob } from './sprite';

/** A glob of spitter goo: arcing, bounces once on the ground, fades out. */
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

  constructor(x: number, y: number, vx: number, vy: number) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
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
    for (const p of level.platforms) {
      if (!p.solid() || !overlap(this.rect, p)) continue;
      if (this.vy > 0 && this.bounces > 0) {
        this.bounces -= 1;
        this.y = p.y - this.r;
        this.vy = -Math.abs(this.vy) * 0.42;
        this.vx *= 0.72;
        this.life = Math.max(this.life, 0.9);
        level.game.burst(this.x, this.y + this.r, 6, ['#8fe07a', '#c9f0a0'], 'dot', 90);
      } else {
        this.dead = true;
        level.game.burst(this.x, this.y, 7, ['#8fe07a'], 'dot', 80);
      }
      break;
    }
    if (this.age > this.life) this.dead = true;
    // hit the player
    if (!player.dead && player.state !== 'victory' && player.invulnT <= 0 && overlap(this.rect, player.rect)) {
      this.dead = true;
      player.damage({ x: this.x - this.r, w: this.r * 2 }, 'spit');
    }
    if (this.x < -60 || this.x > level.width + 60 || this.y > 640) this.dead = true;
  }

  draw(ctx: CanvasRenderingContext2D, t: number): void {
    drawGlob(ctx, this.x, this.y, this.r, t);
  }
}
