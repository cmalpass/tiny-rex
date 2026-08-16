import { CFG } from './config';
import type { GameCtx } from './ctx';

/** A flag pole; touching it records the farthest respawn point. */
export class Checkpoint {
  x: number;
  y: number; // y = ground top
  w = 40;
  active = false;
  pulse = 0;
  private readonly game: GameCtx;

  constructor(x: number, y: number, game: GameCtx) {
    this.x = x;
    this.y = y;
    this.game = game;
  }

  get rect(): { x: number; y: number; w: number; h: number } {
    return { x: this.x - 22, y: this.y - 78, w: 44, h: 78 };
  }

  activate(): void {
    if (this.active) return;
    this.active = true;
    this.pulse = 1;
    this.game.setCheckpoint(this);
    this.game.addStatus('Checkpoint!', '#9ff0ff');
    this.game.addScore(CFG.score.checkpoint, this.x, this.y - 90);
    this.game.burst(this.x, this.y - 40, 16, ['#9ff0ff', '#ffe28a', '#fff'], 'dot', 160);
    this.game.addShake(2);
    this.game.audio.play('checkpoint');
  }

  update(dt: number): void {
    this.pulse = Math.max(0, this.pulse - dt * 1.6);
  }

  draw(ctx: CanvasRenderingContext2D, t: number): void {
    const x = this.x, y = this.y;
    // pole
    ctx.fillStyle = '#8a6a4a';
    ctx.fillRect(x - 3, y - 74, 6, 74);
    ctx.fillStyle = '#6d5238';
    ctx.fillRect(x - 7, y - 6, 14, 6);
    // orb
    const col = this.active ? '#ffd257' : '#9db8c9';
    const glow = this.active ? 0.5 + 0.5 * Math.sin(t * 5) : 0.12;
    ctx.globalAlpha = glow;
    ctx.fillStyle = this.active ? '#ffe28a' : '#c9dbe8';
    ctx.beginPath();
    ctx.arc(x, y - 62, 15 + 5 * (this.active ? Math.sin(t * 5) : 0), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y - 62, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(x - 3, y - 65, 2.6, 0, Math.PI * 2);
    ctx.fill();
    // flag
    const wave = Math.sin(t * 4 + x) * 3;
    ctx.fillStyle = this.active ? '#ff9d3c' : '#8fa8ba';
    ctx.beginPath();
    ctx.moveTo(x + 3, y - 72);
    ctx.lineTo(x + 30, y - 64 + wave);
    ctx.lineTo(x + 3, y - 55);
    ctx.closePath();
    ctx.fill();
    // activation burst ring
    if (this.pulse > 0) {
      ctx.globalAlpha = this.pulse;
      ctx.strokeStyle = '#ffe28a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y - 62, 12 + (1 - this.pulse) * 40, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}
