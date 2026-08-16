import { overlap } from './util';
import type { HazardDef, HazardType } from './level-data';
import type { Level } from './level';
import type { Player } from './player';
import type { GameCtx } from './ctx';

interface Rock {
  x: number;
  y: number;
  vy: number;
  r: number;
}

export class Hazard {
  type: HazardType;
  x: number;
  y: number;
  w: number;
  /** Reset interval (seconds between rock waves for the 'rocks' type). */
  interval: number;
  timer: number;
  warnTimer = 0;
  warnX = 0;
  rocks: Rock[] = [];
  active = true;
  readonly level: Level;
  private readonly game: GameCtx;

  constructor(d: HazardDef, level: Level, game: GameCtx) {
    this.type = d.type;
    this.x = d.x;
    this.y = d.y;
    this.w = d.w;
    // Keep the configured interval so Level.reset() can restore it exactly
    // (the original hard-coded 2.2 here, clobbering custom intervals).
    this.interval = d.interval || 2.2;
    this.timer = this.interval;
    this.level = level;
    this.game = game;
  }

  get rect(): { x: number; y: number; w: number; h: number } {
    return { x: this.x, y: this.y - 8, w: this.w, h: 16 }; // spike hitbox
  }

  update(dt: number, player: Player): void {
    if (this.type !== 'rocks') return;
    // Telegraph, then drop a rock; rocks shatter on the ground.
    if (this.warnTimer > 0) {
      this.warnTimer -= dt;
      if (this.warnTimer <= 0) {
        this.rocks.push({ x: this.warnX, y: -30, vy: 60, r: 15 });
        this.game.audio.play('rockfall');
      }
    }
    const inZone = player.x + player.w > this.x - 300 && player.x < this.x + this.w + 300;
    if (inZone) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = 1.9 + Math.random() * 0.9;
        this.warnX = this.x + 40 + Math.random() * (this.w - 80);
        this.warnTimer = 0.85;
      }
    }
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      r.vy = Math.min(r.vy + 1300 * dt, 850);
      r.y += r.vy * dt;
      const ground = this.level.groundTopAt(r.x);
      if (ground !== null && r.y + r.r >= ground) {
        this.rocks.splice(i, 1);
        this.game.burst(r.x, ground, 10, ['#8d7b6a', '#6e5f50', '#a8977f'], 'chunk', 220);
        this.game.addShake(3);
        this.game.audio.play('rock');
      }
    }
    // Rock hits player
    if (!player.dead && player.invulnT <= 0) {
      for (const r of this.rocks) {
        const rr = { x: r.x - r.r, y: r.y - r.r, w: r.r * 2, h: r.r * 2 };
        if (overlap(rr, player.rect)) {
          player.damage(this, 'rock');
          r.vy = -200;
          break;
        }
      }
    }
  }
}
