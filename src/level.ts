import { TAU } from './config';
import type { DecorDef, LevelDef } from './level-data';
import type { GameCtx } from './ctx';
import type { Player } from './player';
import { Platform } from './platform';
import { Crystal } from './crystal';
import { HeartPickup } from './heart';
import { Hazard } from './hazard';
import { Checkpoint } from './checkpoint';
import { Enemy } from './enemy';
import { Goal } from './goal';

export class Level {
  width: number;
  platforms: Platform[];
  crystals: Crystal[];
  hearts: HeartPickup[];
  hazards: Hazard[];
  checkpoints: Checkpoint[];
  enemies: Enemy[];
  decor: DecorDef[];
  goal: Goal;
  start: { x: number; y: number };
  startGroundY: number;
  totalCrystals: number;
  /** Enemy speed multiplier (difficulty). */
  readonly enemySpeed: number;

  constructor(d: LevelDef, game: GameCtx, enemySpeed = 1) {
    this.width = d.width;
    this.enemySpeed = enemySpeed;
    this.platforms = d.platforms.map((p) => new Platform(p));
    this.crystals = d.crystals.map((c) => new Crystal(c.x, c.y, c.bonus ?? false));
    this.hearts = (d.hearts ?? []).map((h) => new HeartPickup(h.x, h.y));
    this.hazards = d.hazards.map((h) => new Hazard(h, this, game));
    this.checkpoints = d.checkpoints.map((c) => new Checkpoint(c.x, c.y, game));
    this.enemies = d.enemies.map((e) => {
      const en = new Enemy(e, this, enemySpeed);
      if (en.type === 'ptero') {
        en.phase0 = Math.random() * TAU;
        en.x = en.ax;
        en.y = en.ay;
      }
      return en;
    });
    this.decor = d.decor;
    this.goal = new Goal(d.goal.x, d.goal.y);
    this.start = { x: d.startX, y: d.startY };
    this.startGroundY = d.startGroundY;
    this.totalCrystals = this.crystals.length;
  }

  solidAt(x: number, y: number): boolean {
    for (const p of this.platforms) {
      if (!p.solid()) continue;
      if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return true;
    }
    return false;
  }

  groundTopAt(x: number): number | null {
    let best: number | null = null;
    for (const p of this.platforms) {
      if (!p.solid()) continue;
      if (x >= p.x && x <= p.x + p.w && (best === null || p.y < best)) best = p.y;
    }
    return best;
  }

  update(dt: number, t: number, player: Player): void {
    for (const p of this.platforms) p.update(t);
    for (const c of this.crystals) if (!c.collected) c.update(t);
    for (const e of this.enemies) e.update(dt);
    for (const hz of this.hazards) hz.update(dt, player);
    for (const cp of this.checkpoints) cp.update(dt);
  }

  reset(): void {
    for (const p of this.platforms) {
      p.active = true;
      p.prevX = undefined;
      p.prevY = undefined;
    }
    for (const c of this.crystals) c.collected = false;
    for (const h of this.hearts) h.collected = false;
    for (const e of this.enemies) e.reset();
    // Restore each hazard's own interval (the original hard-coded 2.2,
    // clobbering hazards configured with a different one).
    for (const hz of this.hazards) {
      hz.timer = hz.interval;
      hz.warnTimer = 0;
      hz.rocks = [];
    }
    for (const cp of this.checkpoints) {
      cp.active = false;
      cp.pulse = 0;
    }
  }
}
