import { TAU, FONT_STACK } from './config';

/** The nest goal: a big egg platform with a light pillar. */
export class Goal {
  x: number;
  y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  get rect(): { x: number; y: number; w: number; h: number } {
    // Let a jumping Rex finish inside the nest's visible light pillar instead
    // of requiring a precise landing on the small nest mound.
    return { x: this.x - 60, y: this.y - 140, w: 120, h: 140 };
  }

  draw(ctx: CanvasRenderingContext2D, t: number): void {
    const x = this.x, y = this.y;
    // light pillar
    const grad = ctx.createLinearGradient(0, y - 210, 0, y);
    grad.addColorStop(0, 'rgba(255,226,138,0)');
    grad.addColorStop(1, 'rgba(255,226,138,0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - 40, y - 210, 80, 210);
    // mound
    ctx.fillStyle = '#7a5a3c';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 52, 14, 0, 0, TAU);
    ctx.fill();
    // nest (woven arcs)
    ctx.fillStyle = '#8a5f36';
    ctx.beginPath();
    ctx.ellipse(x, y - 10, 36, 22, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#6d4a28';
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(x, y - 10, 34 - i * 6, 20 - i * 4, 0, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
    // eggs
    ctx.fillStyle = '#fdf3e3';
    for (const [ox, oy] of [[-14, -14], [2, -18], [16, -13]]) {
      ctx.beginPath();
      ctx.ellipse(x + ox, y + oy, 7, 9, 0, 0, TAU);
      ctx.fill();
    }
    // sparkle motes
    for (let i = 0; i < 5; i++) {
      const a = t * 1.2 + i * (TAU / 5);
      const px = x + Math.cos(a) * 44;
      const py = y - 30 + Math.sin(a * 1.3) * 26 - ((t * 22 + i * 30) % 60);
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 4 + i);
      ctx.fillStyle = '#ffe28a';
      ctx.beginPath();
      ctx.arc(px, py, 2.2, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // "NEST" sign
    ctx.fillStyle = '#6d4a28';
    ctx.fillRect(x + 46, y - 40, 5, 40);
    ctx.fillStyle = '#a8783f';
    ctx.fillRect(x + 34, y - 56, 30, 18);
    ctx.fillStyle = '#fff';
    ctx.font = '700 9px ' + FONT_STACK;
    ctx.textAlign = 'center';
    ctx.fillText('HOME', x + 49, y - 43);
  }
}
