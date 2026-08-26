import { clamp } from './util';
import { TAU, FONT_STACK } from './config';

export type ParticleType = 'dot' | 'dust' | 'chunk' | 'rect' | 'ring' | 'ember';

export interface ParticleOpts {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  life?: number;
  size?: number;
  color?: string;
  grav?: number;
  type?: ParticleType;
  rot?: number;
  vrot?: number;
}

/** Dust, sparkles, chunks, confetti — the decorative FX layer. */
export class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  grav: number;
  type: ParticleType;
  rot: number;
  vrot: number;

  constructor(o: ParticleOpts) {
    // `||` (not `??`) on purpose: matches the original fallback semantics.
    this.x = o.x;
    this.y = o.y;
    this.vx = o.vx || 0;
    this.vy = o.vy || 0;
    this.life = o.life || 0.5;
    this.maxLife = this.life;
    this.size = o.size || 3;
    this.color = o.color || '#fff';
    this.grav = o.grav || 0;
    this.type = o.type || 'dot';
    this.rot = o.rot || 0;
    this.vrot = o.vrot || 0;
  }

  /** Returns false when the particle has expired. */
  update(dt: number): boolean {
    this.life -= dt;
    this.vy += this.grav * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.vrot * dt;
    return this.life > 0;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const a = clamp(this.life / this.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = this.color;
    if (this.type === 'rect') {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
      ctx.restore();
    } else if (this.type === 'ring') {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * (1.6 - a * 1.2), 0, TAU);
      ctx.stroke();
    } else if (this.type === 'ember') {
      // Glowing spark: soft halo + bright core, flickering as it fades.
      ctx.globalAlpha = a * 0.35;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * 2.2 * a + 1, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * a + 0.5, 0, TAU);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * a + 0.5, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/** Score popups ("+100") that float up and fade. */
export class FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life = 1.0;
  maxLife = 1.0;

  constructor(x: number, y: number, text: string, color?: string) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color ?? '#fff';
  }

  /** Returns false when the text has expired. */
  update(dt: number): boolean {
    this.life -= dt;
    this.y -= 34 * dt;
    return this.life > 0;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.globalAlpha = clamp(this.life / this.maxLife, 0, 1);
    ctx.font = '800 15px ' + FONT_STACK;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(30,20,10,0.7)';
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.x, this.y);
    ctx.globalAlpha = 1;
  }
}
