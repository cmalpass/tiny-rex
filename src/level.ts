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
import { SpringPad } from './spring';
import { PressurePlate } from './plate';
import { Door } from './door';
import { Projectile } from './projectile';
import type { ProjectileKind } from './projectile';
import { Fossil } from './fossil';
import { MagmaKing } from './boss';

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
  springs: SpringPad[];
  plates: PressurePlate[];
  doors: Door[];
  projectiles: Projectile[];
  fossils: Fossil[];
  /** The Magma King (Molten Nest only). */
  boss: MagmaKing | null;
  readonly game: GameCtx;

  constructor(d: LevelDef, game: GameCtx, enemySpeed = 1, levelIdx = 0) {
    this.width = d.width;
    this.enemySpeed = enemySpeed;
    this.game = game;
    this.fossils = (d.fossils ?? []).map((f, i) => new Fossil(f.x, f.y, levelIdx + ':' + i));
    this.springs = (d.springs ?? []).map((s) => new SpringPad(s.x, s.y));
    this.plates = (d.plates ?? []).map((p) => new PressurePlate(p.x, p.y, game));
    this.doors = (d.doors ?? []).map((dr) => new Door(dr.x, dr.y, dr.w, dr.h, game));
    for (let i = 0; i < (d.plates ?? []).length; i++) {
      this.doors[(d.plates ?? [])[i].door].plate = this.plates[i];
    }
    // Doors join the platform list so player/enemy collision treats them
    // as solid ground while closed.
    this.platforms = [...d.platforms.map((p) => new Platform(p)), ...this.doors];
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
    this.projectiles = [];
    this.boss = d.boss
      ? new MagmaKing(d.boss, this, enemySpeed, d.orbs ?? [])
      : null;
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

  /** A spitter fires a glob (SFX + muzzle burst handled by the enemy). */
  spawnProjectile(
    x: number, y: number, vx: number, vy: number,
    kind: ProjectileKind = 'goo',
  ): void {
    this.projectiles.push(new Projectile(x, y, vx, vy, kind));
  }

  popProjectile(x: number, y: number): void {
    const pr = this.projectiles.find((p) => !p.dead && Math.hypot(p.x - x, p.y - y) < 30);
    if (pr) pr.dead = true;
  }

  update(dt: number, t: number, player: Player): void {
    for (const p of this.plates) p.update(dt, player);
    for (const p of this.platforms) p.update(dt, t);
    for (const s of this.springs) s.update(dt);
    for (const e of this.enemies) e.update(dt, player);
    for (const hz of this.hazards) hz.update(dt, player);
    for (const cp of this.checkpoints) cp.update(dt);
    this.boss?.update(dt, t, player);
    for (const pr of this.projectiles) pr.update(dt, this, player);
    this.projectiles = this.projectiles.filter((pr) => !pr.dead);
  }

  reset(): void {
    for (const p of this.platforms) p.reset();
    for (const s of this.springs) s.reset();
    for (const p of this.plates) p.reset();
    this.projectiles = [];
    for (const c of this.crystals) c.collected = false;
    for (const h of this.hearts) h.collected = false;
    for (const f of this.fossils) f.collected = false;
    for (const e of this.enemies) e.reset();
    this.boss?.reset();
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
