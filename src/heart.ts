import { TAU } from './config';

/** A floating, pulsing heart that restores one heart (or points at full health). */
export class HeartPickup {
  x: number;
  y: number;
  w = 22;
  h = 20;
  collected = false;
  phase = Math.random() * TAU;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  get rect(): { x: number; y: number; w: number; h: number } {
    return { x: this.x - 13, y: this.y - 13, w: 26, h: 26 };
  }

  draw(ctx: CanvasRenderingContext2D, t: number): void {
    const bob = Math.sin(t * 2.4 + this.phase) * 4;
    const pulse = 1 + 0.14 * Math.sin(t * 5 + this.phase);
    ctx.save();
    ctx.translate(this.x, this.y + bob);
    // soft glow
    ctx.globalAlpha = 0.3 + 0.2 * Math.sin(t * 5 + this.phase);
    ctx.fillStyle = '#ff8fa3';
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.scale(pulse, pulse);
    // heart body
    const grad = ctx.createLinearGradient(0, -11, 0, 7);
    grad.addColorStop(0, '#ff8fa3');
    grad.addColorStop(1, '#e8506e');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.bezierCurveTo(-13, -7, -11, -17, 0, -9);
    ctx.bezierCurveTo(11, -17, 13, -7, 0, 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,20,45,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // shine
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(-4, -7, 2.2, 0, TAU);
    ctx.fill();
    ctx.restore();
    // sparkle
    if (Math.sin(t * 2.6 + this.phase * 3) > 0.85) {
      ctx.save();
      ctx.translate(this.x + 9, this.y + bob - 12);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(4, 0);
      ctx.moveTo(0, -4);
      ctx.lineTo(0, 4);
      ctx.stroke();
      ctx.restore();
    }
  }
}
