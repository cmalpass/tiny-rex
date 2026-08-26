import { overlap } from './util';
import type { GameCtx } from './ctx';
import type { Player } from './player';

/**
 * A ground-level pressure plate. Pressing it (and holding) keeps its linked
 * doors open; the plunger sinks while held.
 */
export class PressurePlate {
  x: number;
  y: number; // ground top the plate sits on
  w = 46;
  h = 10;
  pressed = false;
  /** 0..1 plunger sink, eased for the draw. */
  pressT = 0;
  private readonly game: GameCtx;

  constructor(x: number, y: number, game: GameCtx) {
    this.x = x;
    this.y = y;
    this.game = game;
  }

  /** Trigger zone: a standing (or low-jumping) player over the plate. */
  get zone(): { x: number; y: number; w: number; h: number } {
    return { x: this.x - 10, y: this.y - 30, w: this.w + 20, h: 34 };
  }

  update(dt: number, player: Player): void {
    const was = this.pressed;
    this.pressed = !player.dead && player.state !== 'victory' && overlap(player.rect, this.zone);
    if (this.pressed !== was) this.game.audio.play('plate', { pressed: this.pressed });
    this.pressT += ((this.pressed ? 1 : 0) - this.pressT) * Math.min(1, dt * 14);
  }

  reset(): void {
    this.pressed = false;
    this.pressT = 0;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const cx = this.x + this.w / 2;
    // base
    ctx.fillStyle = '#5f6b78';
    ctx.beginPath();
    ctx.moveTo(this.x - 6, this.y);
    ctx.lineTo(this.x + 8, this.y - 5);
    ctx.lineTo(this.x + this.w - 8, this.y - 5);
    ctx.lineTo(this.x + this.w + 6, this.y);
    ctx.closePath();
    ctx.fill();
    // plunger (sinks when pressed)
    const sink = this.pressT * 4;
    ctx.fillStyle = '#c3ccd4';
    ctx.fillRect(this.x + 6, this.y - 10 + sink, this.w - 12, 6);
    ctx.fillStyle = this.pressed ? '#8fe3ff' : '#9aa3ad';
    ctx.fillRect(this.x + 6, this.y - 12 + sink, this.w - 12, 3);
    // glow ring while held
    if (this.pressT > 0.1) {
      ctx.strokeStyle = 'rgba(143,227,255,' + (this.pressT * 0.7).toFixed(2) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, this.y - 2, this.w / 2 + 10 + this.pressT * 6, 7, 0, Math.PI, 0);
      ctx.stroke();
    }
  }
}
