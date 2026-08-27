import { CFG, TAU } from './config';

export type PowerUpType = 'magnet' | 'double' | 'bubble';

export const POWERUP_COLORS: Record<PowerUpType, string> = {
  magnet: '#ff6b8a',
  double: '#7ac9ff',
  bubble: '#8fe3ff',
};

/**
 * Enemy-kill drop table: nothing most of the time, otherwise one of the
 * three capsules. `rng` is injectable so tests can force outcomes.
 */
export function rollDrop(rng: () => number = Math.random): PowerUpType | null {
  const r = rng();
  if (r >= CFG.powerup.dropChance) return null;
  // Conditional on dropping, the same roll picks the type uniformly.
  const pick = r / CFG.powerup.dropChance;
  return pick < 1 / 3 ? 'magnet' : pick < 2 / 3 ? 'double' : 'bubble';
}

/** Icon glyph shared by the world capsule and the HUD chip. */
export function drawPowerUpIcon(ctx: CanvasRenderingContext2D, type: PowerUpType, cx: number, cy: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  if (type === 'magnet') {
    // Horseshoe (opening down) with silver tips
    ctx.lineCap = 'round';
    ctx.lineWidth = 4.4;
    ctx.strokeStyle = POWERUP_COLORS.magnet;
    ctx.beginPath();
    ctx.arc(0, -2, 6.5, Math.PI - 0.45, Math.PI * 2 + 0.45);
    ctx.stroke();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = '#e8eef4';
    ctx.beginPath();
    ctx.moveTo(-5.8, 1.6);
    ctx.lineTo(-5.8, 5.6);
    ctx.moveTo(5.8, 1.6);
    ctx.lineTo(5.8, 5.6);
    ctx.stroke();
  } else if (type === 'double') {
    // Two stacked upward chevrons (the lower one ghosted)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = POWERUP_COLORS.double;
    ctx.lineWidth = 2.6;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(-5.5, 7);
    ctx.lineTo(0, 1.5);
    ctx.lineTo(5.5, 7);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(-5.5, 2.5);
    ctx.lineTo(0, -3);
    ctx.lineTo(5.5, 2.5);
    ctx.stroke();
  } else {
    // Bubble ring with a highlight
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = POWERUP_COLORS.bubble;
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(-2.6, -2.8, 1.8, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * A dropped power-up capsule: bobs, glows, and evaporates after a few
 * seconds if the player leaves it behind.
 */
export class PowerUp {
  type: PowerUpType;
  x: number;
  y: number;
  collected = false;
  life: number = CFG.powerup.expireT;
  phase = Math.random() * TAU;

  constructor(type: PowerUpType, x: number, y: number) {
    this.type = type;
    this.x = x;
    this.y = y;
  }

  get alive(): boolean {
    return !this.collected && this.life > 0;
  }

  get rect(): { x: number; y: number; w: number; h: number } {
    return { x: this.x - 15, y: this.y - 15, w: 30, h: 30 };
  }

  update(dt: number): void {
    this.life = Math.max(0, this.life - dt);
    this.phase += dt * 3;
  }

  draw(ctx: CanvasRenderingContext2D, t: number): void {
    const bob = Math.sin(t * 2.8 + this.phase) * 3;
    const cx = this.x;
    const cy = this.y + bob;
    // Blink in the last two seconds so an expiring capsule reads clearly
    const blink = this.life < 2 ? (Math.sin(t * 14) > 0 ? 1 : 0.3) : 1;
    ctx.save();
    // glow
    ctx.globalAlpha = blink * (0.28 + 0.14 * Math.sin(t * 3.4 + this.phase));
    ctx.fillStyle = POWERUP_COLORS[this.type];
    ctx.beginPath();
    ctx.arc(cx, cy, 21, 0, TAU);
    ctx.fill();
    // capsule body
    ctx.globalAlpha = blink;
    ctx.fillStyle = 'rgba(22,34,50,0.88)';
    ctx.beginPath();
    ctx.arc(cx, cy, 13, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = POWERUP_COLORS[this.type];
    ctx.lineWidth = 2;
    ctx.stroke();
    drawPowerUpIcon(ctx, this.type, cx, cy);
    ctx.restore();
  }
}
