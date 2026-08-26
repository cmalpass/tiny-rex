import { TAU } from './config';

/**
 * A hidden fossil: a persistent meta-collectible. Found once (stored across
 * runs by id "<levelIdx>:<i>"), but re-collectable for score on later runs.
 */
export class Fossil {
  x: number;
  y: number;
  w = 28;
  h = 20;
  id: string;
  collected = false;
  phase = Math.random() * TAU;

  constructor(x: number, y: number, id: string) {
    this.x = x;
    this.y = y;
    this.id = id;
  }

  get rect(): { x: number; y: number; w: number; h: number } {
    return { x: this.x - 15, y: this.y - 13, w: 30, h: 26 };
  }

  draw(ctx: CanvasRenderingContext2D, t: number): void {
    const bob = Math.sin(t * 1.8 + this.phase) * 2.5; // heavy — bobs less than crystals
    const cx = this.x;
    const cy = this.y + bob;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + this.phase);
    ctx.save();
    ctx.translate(cx, cy);
    // warm unearthed glow
    ctx.globalAlpha = 0.22 + 0.16 * pulse;
    ctx.fillStyle = '#e8dcc0';
    ctx.beginPath();
    ctx.arc(0, 0, 17 + 2 * pulse, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    // bone shaft
    const grad = ctx.createLinearGradient(0, -5, 0, 5);
    grad.addColorStop(0, '#f4ecd9');
    grad.addColorStop(1, '#cbb98f');
    ctx.fillStyle = grad;
    ctx.fillRect(-10, -3.5, 20, 7);
    // knob ends (two circles per side)
    for (const sx of [-1, 1]) {
      for (const sy of [-3.2, 3.2]) {
        ctx.beginPath();
        ctx.arc(sx * 11, sy, 4, 0, TAU);
        ctx.fill();
      }
    }
    // weathering crack
    ctx.strokeStyle = 'rgba(110,90,55,0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-4, -3);
    ctx.lineTo(-1, 0);
    ctx.lineTo(-4, 3);
    ctx.stroke();
    // outline
    ctx.strokeStyle = 'rgba(110,90,55,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-10, -3.5, 20, 7);
    ctx.restore();
    // sparkle
    if (Math.sin(t * 1.9 + this.phase * 3) > 0.88) {
      ctx.save();
      ctx.translate(cx + 10, cy - 11);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-3.5, 0);
      ctx.lineTo(3.5, 0);
      ctx.moveTo(0, -3.5);
      ctx.lineTo(0, 3.5);
      ctx.stroke();
      ctx.restore();
    }
  }
}
