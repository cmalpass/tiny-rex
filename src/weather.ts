import type { LevelTheme } from './level-data';
import type { Player } from './player';
import { overlap } from './util';
import { TAU } from './config';

/* --- Weather tuning --- */
export const GUST_INTERVAL = 8; // seconds between frost gusts (nominal)
export const GUST_DUR = 2.4; // seconds an active gust lasts
export const GUST_PUSH = 150; // target drift speed while gusting (px/s)
export const MEADOW_DRIFT = 14; // gentle pollen sway amplitude (px/s)
export const GEYSER_PERIOD = 6; // full volcanic vent cycle (s)
export const GEYSER_ERUPT = 1.4; // seconds the eruption column is live
export const GEYSER_BUBBLE = 1.3; // telegraph bubbles before each eruption
export const GEYSER_W = 46; // eruption column width
export const GEYSER_H = 170; // eruption column height

export type VentState = 'idle' | 'bubbling' | 'erupting';

export interface GeyserVent {
  x: number;
  surfaceY: number;
  phase: number;
  state: VentState;
}

export interface Streak {
  x: number;
  y: number;
  len: number;
  spd: number;
  life: number;
  maxLife: number;
}

export interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  size: number;
}

export interface EruptPart {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

interface HazardLike {
  type: string;
  x: number;
  y: number;
  w: number;
}

/** Pure vent cycle: which phase of the eruption cycle a vent is in. */
export function ventState(t: number, phase: number): VentState {
  const cycle = (t + phase) % GEYSER_PERIOD;
  if (cycle < GEYSER_ERUPT) return 'erupting';
  if (cycle > GEYSER_PERIOD - GEYSER_BUBBLE) return 'bubbling';
  return 'idle';
}

/**
 * Per-theme environmental dynamics:
 * - frost:    timed wind gusts that streak across the screen and shove Rex
 * - volcanic: lava geysers above the big pools (bubbling telegraph, hot column)
 * - meadow:   slow pollen drift with a barely-there sway
 *
 * The class keeps its own lightweight particle arrays and is drawn in the
 * foreground. Forces are applied to the player each frame; geyser columns
 * deal damage through the normal player.damage path.
 */
export class Weather {
  theme: LevelTheme = 'meadow';
  t = 0;
  reducedMotion = false;
  /** Called once when a frost gust kicks in (the game plays a whoosh). */
  onGust: (() => void) | null = null;
  /** Test/determinism hook; defaults to Math.random. */
  rng: () => number = Math.random;

  /* frost */
  gusts = 0; // gusts started since apply() — handy for tests and the HUD
  gusting = 0; // seconds of gust remaining
  gustT = 0; // countdown to the next gust
  gustDir: 1 | -1 = 1;
  streaks: Streak[] = [];

  /* volcanic */
  vents: GeyserVent[] = [];
  eruptParts: EruptPart[] = [];

  /* meadow */
  motes: Mote[] = [];

  /** (Re)configure weather for a level. Resets all state. */
  apply(theme: LevelTheme, hazards: HazardLike[], playerX: number): void {
    this.theme = theme;
    this.t = 0;
    this.gusts = 0;
    this.gusting = 0;
    this.gustT = 3 + this.rng() * 5;
    this.gustDir = 1;
    this.streaks = [];
    this.eruptParts = [];
    this.motes = [];
    this.vents = [];
    if (theme === 'volcanic') {
      let n = 0;
      for (const hz of hazards) {
        if (hz.type !== 'lava' || hz.w < 180) continue;
        this.vents.push({
          x: hz.x + hz.w / 2,
          surfaceY: hz.y,
          phase: this.rng() * GEYSER_PERIOD,
          state: 'idle',
        });
        if (++n >= 5) break; // keep it readable
      }
    }
    if (theme === 'meadow') {
      for (let i = 0; i < 18; i++) this.motes.push(this.spawnMote(playerX));
    }
  }

  /** Hitbox of a live eruption column. */
  columnRect(v: GeyserVent): { x: number; y: number; w: number; h: number } {
    return { x: v.x - GEYSER_W / 2, y: v.surfaceY - GEYSER_H, w: GEYSER_W, h: GEYSER_H };
  }

  update(dt: number, player: Player | null): void {
    this.t += dt;
    if (this.theme === 'frost') this.updateFrost(dt, player);
    else if (this.theme === 'volcanic') this.updateVolcanic(player);
    else this.updateMeadow(dt, player);

    for (const p of this.eruptParts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 620 * dt;
      p.life -= dt;
    }
    this.eruptParts = this.eruptParts.filter((p) => p.life > 0);
    if (this.eruptParts.length > 120) this.eruptParts.splice(0, this.eruptParts.length - 120);
  }

  private spawnMote(playerX: number): Mote {
    return {
      x: playerX - 520 + this.rng() * 1040,
      y: this.rng() * 540,
      vx: 10 + this.rng() * 22,
      vy: 4 + this.rng() * 10,
      phase: this.rng() * TAU,
      size: 1.5 + this.rng() * 2,
    };
  }

  private updateFrost(dt: number, player: Player | null): void {
    if (this.gusting > 0) {
      this.gusting -= dt;
      // Blend Rex's velocity toward the gust: the drag model in player.ts
      // would otherwise eat a plain force almost instantly.
      if (player && !player.dead) {
        // Strong blend so the drift survives the player's air drag:
        // steady-state drift ≈ GUST_PUSH * 40 / airDrag (~55 px/s).
        const target = this.gustDir * GUST_PUSH;
        player.vx += (target - player.vx) * Math.min(1, dt * 40);
      }
      if (!this.reducedMotion && player) {
        for (let i = 0; i < 2; i++) {
          this.streaks.push({
            x: player.x - 480 + this.rng() * 960,
            y: 50 + this.rng() * 430,
            len: 40 + this.rng() * 70,
            spd: 500 + this.rng() * 300,
            life: 0.9,
            maxLife: 0.9,
          });
        }
      }
    } else {
      this.gustT -= dt;
      if (this.gustT <= 0) {
        this.gusts += 1;
        this.gusting = GUST_DUR;
        this.gustDir = this.rng() < 0.5 ? -1 : 1;
        this.gustT = GUST_INTERVAL * (0.75 + this.rng() * 0.5);
        if (this.onGust) this.onGust();
      }
    }
    for (const s of this.streaks) {
      s.x += s.spd * this.gustDir * dt;
      s.life -= dt;
    }
    this.streaks = this.streaks.filter((s) => s.life > 0);
  }

  private updateVolcanic(player: Player | null): void {
    for (const v of this.vents) {
      v.state = ventState(this.t, v.phase);
      if (v.state === 'erupting') {
        if (!this.reducedMotion) {
          this.eruptParts.push({
            x: v.x + (this.rng() - 0.5) * GEYSER_W * 0.7,
            y: v.surfaceY - 4,
            vx: (this.rng() - 0.5) * 70,
            vy: -(320 + this.rng() * 220),
            life: 0.8 + this.rng() * 0.4,
            maxLife: 1.2,
            size: 2 + this.rng() * 3,
          });
        }
        if (player && !player.dead && player.invulnT <= 0 && overlap(player.rect, this.columnRect(v))) {
          player.damage({ x: v.x - GEYSER_W / 2, w: GEYSER_W }, 'lava');
          if (!player.dead) player.vy = -300; // hot air kicks Rex out
        }
      }
    }
  }

  private updateMeadow(dt: number, player: Player | null): void {
    if (player && !player.dead) {
      const sway = Math.sin(this.t * 0.6) * MEADOW_DRIFT;
      player.vx += (sway - player.vx) * Math.min(1, dt * 20);
    }
    for (const m of this.motes) {
      m.phase += dt;
      m.x += m.vx * dt;
      m.y += (m.vy + Math.sin(m.phase * 1.7) * 6) * dt;
      if (player) {
        const px = player.x;
        if (m.x < px - 520) m.x += 1040;
        else if (m.x > px + 520) m.x -= 1040;
        if (m.y < -20) m.y += 560;
        else if (m.y > 580) m.y -= 560;
      }
    }
  }

  /* ---------- rendering (world space, caller passes camera x) ---------- */

  draw(ctx: CanvasRenderingContext2D, camX: number): void {
    if (this.theme === 'frost') this.drawStreaks(ctx, camX);
    else if (this.theme === 'volcanic') this.drawVents(ctx, camX);
    else this.drawMotes(ctx, camX);
  }

  private drawStreaks(ctx: CanvasRenderingContext2D, camX: number): void {
    if (this.streaks.length === 0) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (const s of this.streaks) {
      const a = (s.life / s.maxLife) * 0.5;
      ctx.strokeStyle = `rgba(235,245,255,${a.toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const x0 = s.x - camX;
      ctx.moveTo(x0, s.y);
      ctx.lineTo(x0 + s.len * this.gustDir, s.y - s.len * 0.08);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawVents(ctx: CanvasRenderingContext2D, camX: number): void {
    for (const v of this.vents) {
      if (v.x + GEYSER_W < camX - 60 || v.x - GEYSER_W > camX + 1020) continue;
      const x = v.x - camX;
      if (v.state === 'bubbling') {
        ctx.fillStyle = 'rgba(255,150,60,0.55)';
        for (let i = 0; i < 4; i++) {
          const by = v.surfaceY - 5 - ((this.t * 34 + i * 11) % 26);
          ctx.beginPath();
          ctx.arc(x + (i - 1.5) * 9, by, 1.6 + (i % 2), 0, TAU);
          ctx.fill();
        }
      } else if (v.state === 'erupting') {
        const grad = ctx.createLinearGradient(0, v.surfaceY - GEYSER_H, 0, v.surfaceY);
        grad.addColorStop(0, 'rgba(255,80,20,0)');
        grad.addColorStop(0.45, 'rgba(255,110,35,0.65)');
        grad.addColorStop(1, 'rgba(255,150,50,0.95)');
        ctx.fillStyle = grad;
        ctx.fillRect(x - GEYSER_W / 2, v.surfaceY - GEYSER_H, GEYSER_W, GEYSER_H);
        const core = ctx.createLinearGradient(0, v.surfaceY - GEYSER_H, 0, v.surfaceY);
        core.addColorStop(0, 'rgba(255,220,140,0)');
        core.addColorStop(1, 'rgba(255,235,170,0.9)');
        ctx.fillStyle = core;
        ctx.fillRect(x - GEYSER_W * 0.22, v.surfaceY - GEYSER_H, GEYSER_W * 0.44, GEYSER_H);
      }
    }
    for (const p of this.eruptParts) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = `rgba(255,${120 + Math.floor(90 * a)},40,${(a * 0.9).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x - camX, p.y, p.size, 0, TAU);
      ctx.fill();
    }
  }

  private drawMotes(ctx: CanvasRenderingContext2D, camX: number): void {
    ctx.save();
    for (const m of this.motes) {
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(m.phase * 1.7);
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.arc(m.x - camX, m.y, m.size, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}
