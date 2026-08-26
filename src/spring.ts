import { TAU } from './config';

/**
 * A bouncy pad the player launches off of. Not a solid — it works as a
 * one-way trampoline (jump through from below, launch when falling onto it).
 * Defs pass the ground top as `y`, which is the pad's bottom edge.
 */
export class SpringPad {
  x: number;
  y: number;
  w = 48;
  h = 14;
  /** 1 right after a bounce, eases back to 0 (the coil's squash). */
  compress = 0;
  phase = Math.random() * TAU;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  /** Generous trigger zone: feet near the pad's top while falling. */
  get rect(): { x: number; y: number; w: number; h: number } {
    return { x: this.x - 4, y: this.y - 26, w: this.w + 8, h: 30 };
  }

  /** The pad just fired a launch. */
  bounce(): void {
    this.compress = 1;
  }

  update(dt: number): void {
    this.compress = Math.max(0, this.compress - dt * 3.2);
  }

  reset(): void {
    this.compress = 0;
  }

  draw(ctx: CanvasRenderingContext2D, t: number): void {
    const cx = this.x + this.w / 2;
    const squash = 1 - this.compress * 0.55;
    const idle = 1 + 0.05 * Math.sin(t * 3 + this.phase);
    const s = squash * idle;
    ctx.save();
    ctx.translate(cx, this.y);
    // base plate
    ctx.fillStyle = '#5f6b78';
    this.round(ctx, -this.w / 2, -8, this.w, 8, 4);
    ctx.fill();
    // coil
    ctx.strokeStyle = '#c3ccd4';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const top = -8 - 18 * s;
    for (let i = 0; i < 4; i++) {
      const yy = -8 + (top + 8) * (i / 3);
      const xx = i % 2 === 0 ? -13 : 13;
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    // spring cap
    ctx.fillStyle = '#ff8fa3';
    this.round(ctx, -this.w / 2 + 4, top - 9, this.w - 8, 10, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    this.round(ctx, -this.w / 2 + 7, top - 8, this.w - 14, 3, 2);
    ctx.fill();
    ctx.restore();
    // sparkle when freshly bounced
    if (this.compress > 0.4) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (this.compress * 0.9).toFixed(2) + ')';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i - 1) * 0.55;
        const r1 = 16 + (1 - this.compress) * 28;
        const r2 = r1 + 7;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r1, this.y - 14 + Math.sin(a) * r1);
        ctx.lineTo(cx + Math.cos(a) * r2, this.y - 14 + Math.sin(a) * r2);
        ctx.stroke();
      }
    }
  }

  private round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
