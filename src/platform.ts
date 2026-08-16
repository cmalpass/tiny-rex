import type { PlatformDef, PlatformType } from './level-data';

/**
 * Ground, wooden crates, crumbling stone slabs, and the moving platforms.
 * Movers oscillate around their base position; per-frame deltas are recorded
 * so a player standing on one is carried along.
 */
export class Platform {
  type: PlatformType;
  baseX: number;
  baseY: number;
  w: number;
  h: number;
  x: number;
  y: number;
  amp: number;
  speed: number;
  phase: number;
  axis: 'x' | 'y';
  /** Crumbled platforms are deactivated by the player landing on them. */
  active = true;
  dx = 0;
  dy = 0;
  seed: number;
  /** Previous-frame position; undefined until the first update. */
  prevX: number | undefined;
  prevY: number | undefined;

  constructor(d: PlatformDef) {
    this.type = d.type || 'ground';
    this.baseX = d.x;
    this.baseY = d.y;
    this.w = d.w;
    this.h = d.h;
    this.x = d.x;
    this.y = d.y;
    this.amp = d.amp || 0;
    this.speed = d.speed || 0;
    this.phase = d.phase || 0;
    this.axis = d.axis || 'x';
    this.seed = (d.x * 7 + d.y * 13) % 97;
  }

  update(t: number): void {
    if (this.type === 'mover' && this.amp > 0) {
      const off = Math.sin(t * this.speed + this.phase) * this.amp;
      this.x = this.axis === 'x' ? this.baseX + off : this.baseX;
      this.y = this.axis === 'y' ? this.baseY + off : this.baseY;
    } else {
      this.x = this.baseX;
      this.y = this.baseY;
    }
    this.dx = this.x - (this.prevX === undefined ? this.x : this.prevX);
    this.dy = this.y - (this.prevY === undefined ? this.y : this.prevY);
    this.prevX = this.x;
    this.prevY = this.y;
  }

  solid(): boolean {
    return this.active;
  }
}
