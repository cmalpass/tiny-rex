import type { GameCtx } from './ctx';
import { Platform } from './platform';
import type { PressurePlate } from './plate';

/**
 * A sliding gate. Solid while closed; opens while its pressure plate is
 * held and latches shut-open once fully raised, so a run through never
 * traps the player in a closing door.
 */
export class Door extends Platform {
  /** 0 = shut, 1 = fully open. */
  open = 0;
  /** Latched open for the rest of the run. */
  latched = false;
  /** The plate that drives this door (wired by Level). */
  plate: PressurePlate | null = null;
  private openedSfx = false;
  private readonly game: GameCtx;

  constructor(x: number, y: number, w: number, h: number, game: GameCtx) {
    super({ x, y, w, h, type: 'door' });
    this.game = game;
  }

  update(dt: number, t: number): void {
    super.update(dt, t);
    const target = this.plate?.pressed ? 1 : 0;
    const goal = this.latched || target === 1 ? 1 : 0;
    if (goal > this.open) {
      const prev = this.open;
      this.open = Math.min(1, this.open + dt / 0.5);
      if (this.open >= 1) {
        this.latched = true;
        if (!this.openedSfx) {
          this.openedSfx = true;
          this.game.audio.play('door');
          this.game.burst(this.x + this.w / 2, this.y + this.h / 2, 10, ['#9fd8ef', '#fff'], 'dot', 120);
        }
      } else if (prev < 0.5 && this.open >= 0.5) {
        // half-way point: no longer blocks
        this.game.audio.play('ui');
      }
    } else if (goal < this.open) {
      this.open = Math.max(0, this.open - dt / 0.9);
    }
  }

  solid(): boolean {
    return this.open < 0.5;
  }

  reset(): void {
    super.reset();
    this.open = 0;
    this.latched = false;
    this.openedSfx = false;
  }

  draw(ctx: CanvasRenderingContext2D, t: number): void {
    const { x, y, w, h } = this;
    // frame pillars + lintel
    ctx.fillStyle = '#54606e';
    this.frame(ctx, x - 10, y - 14, 14, h + 14);
    this.frame(ctx, x + w - 4, y - 14, 14, h + 14);
    this.frame(ctx, x - 10, y - 24, w + 20, 12);
    // glowing seal (dims as the gate rises)
    const glow = 0.35 + 0.4 * (1 - this.open) + 0.1 * Math.sin(t * 3);
    ctx.fillStyle = 'rgba(143,227,255,' + glow.toFixed(2) + ')';
    ctx.beginPath();
    ctx.arc(x + w / 2, y - 18, 4.5, 0, Math.PI * 2);
    ctx.fill();
    // the slab, clipped to the opening, sliding up as it opens
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const rise = this.open * (h + 4);
    const slabY = y - rise;
    const grad = ctx.createLinearGradient(0, slabY, 0, slabY + h);
    grad.addColorStop(0, '#8fa3b8');
    grad.addColorStop(0.5, '#6d8093');
    grad.addColorStop(1, '#596b7d');
    ctx.fillStyle = grad;
    ctx.fillRect(x + 2, slabY + 2, w - 4, h);
    // rivets + seam
    ctx.strokeStyle = 'rgba(20,30,40,0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 4, slabY + 4, w - 8, h - 8);
    ctx.beginPath();
    ctx.moveTo(x + 4, slabY + h / 2);
    ctx.lineTo(x + w - 4, slabY + h / 2);
    ctx.stroke();
    ctx.fillStyle = '#c9d6e2';
    for (const fx of [10, w - 10]) {
      for (const fy of [14, h / 2 - 10, h - 14]) {
        ctx.beginPath();
        ctx.arc(x + fx, slabY + fy, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private frame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(x, y, w, 3);
    ctx.fillStyle = '#54606e';
  }
}
