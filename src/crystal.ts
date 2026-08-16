import { TAU } from './config';

/** A floating collectible. The rare "bonus" variant is worth 5x. */
export class Crystal {
  x: number;
  y: number;
  w = 20;
  h = 26;
  bonus: boolean;
  collected = false;
  phase = Math.random() * TAU;

  constructor(x: number, y: number, bonus: boolean) {
    this.x = x;
    this.y = y;
    this.bonus = !!bonus;
  }

  get rect(): { x: number; y: number; w: number; h: number } {
    return { x: this.x - 12, y: this.y - 16, w: 24, h: 32 };
  }

  update(_t: number): void {
    this.phase += 0.03;
  }

  draw(ctx: CanvasRenderingContext2D, t: number): void {
    const bob = Math.sin(t * 2.6 + this.phase) * 4;
    const cx = this.x;
    const cy = this.y + bob;
    const pulse = 0.55 + 0.45 * Math.sin(t * 3.4 + this.phase);
    const big = this.bonus ? 1.35 : 1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(big, big);
    // glow
    ctx.globalAlpha = 0.28 + 0.22 * pulse;
    ctx.fillStyle = this.bonus ? '#ffe28a' : '#ffcf6e';
    ctx.beginPath();
    ctx.arc(0, 0, 20 + 3 * pulse, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    // amber gem
    const grad = ctx.createLinearGradient(0, -13, 0, 13);
    if (this.bonus) {
      grad.addColorStop(0, '#fff3c0');
      grad.addColorStop(0.5, '#ffd257');
      grad.addColorStop(1, '#e08c1a');
    } else {
      grad.addColorStop(0, '#ffe9b0');
      grad.addColorStop(0.5, '#ffb84d');
      grad.addColorStop(1, '#d97a16');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(9, -3);
    ctx.lineTo(6, 12);
    ctx.lineTo(-6, 12);
    ctx.lineTo(-9, -3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,60,10,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // facets
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(0, 12);
    ctx.moveTo(-9, -3);
    ctx.lineTo(9, -3);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(-3, -6, 1.6, 0, TAU);
    ctx.fill();
    ctx.restore();
    // sparkle
    if (Math.sin(t * 2.2 + this.phase * 3) > 0.86) {
      ctx.save();
      ctx.translate(cx + 9, cy - 12);
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
