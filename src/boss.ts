import { CFG } from './config';
import type { Level } from './level';
import type { Player } from './player';
import { overlap } from './util';

/** Placement + patrol bounds for the Magma King (x is the left edge). */
export interface BossDef {
  x: number;
  y: number;
  minX: number;
  maxX: number;
}

export interface BossOrb {
  x: number;
  y: number;
  alive: boolean;
  respawnT: number;
}

export type BossState =
  | 'walk'
  | 'telegraph'
  | 'chargeWarn'
  | 'charge'
  | 'stagger'
  | 'stunned'
  | 'dying';

const SHOOT_CD = 4.6;
const CHARGE_CD = 7.0;
const TELEGRAPH_T = 0.75;
const CHARGE_WARN_T = 0.85;
const STAGGER_T = 2.2;
const STUN_T = 3.2;
const DIE_T = 1.6;
const ORB_RESPAWN = 10;

const MAGMA = ['#ff9d3f', '#ff6b35', '#ffd257', '#8a3b1e'];

/**
 * Magma King — the end-of-game boss for "Molten Nest".
 *
 * Pattern loop: patrols the arena, telegraphs and fires a 3-glob magma spread,
 * and periodically telegraphs a full-speed charge that ends in a stagger.
 * The player can only damage him while staggered or stunned; shattering all
 * three crystal orbs (stomp) stuns him. Three stomp hits kill him.
 */
export class MagmaKing {
  readonly w = 120;
  readonly h = 104;
  x: number;
  y: number;
  minX: number;
  maxX: number;
  hp = 3;
  readonly maxHp = 3;
  state: BossState = 'walk';
  stateT = 0;
  dir: 1 | -1 = 1;
  dead = false;
  /** 1 right after a stomp, eases to 0 (squash). */
  squash = 0;
  orbs: BossOrb[];
  shootT = SHOOT_CD;
  chargeT = CHARGE_CD;
  chargeDir: 1 | -1 = 1;

  private readonly spawnX: number;
  private readonly spawnY: number;
  private readonly level: Level;
  private readonly speedMult: number;

  get rect(): { x: number; y: number; w: number; h: number } {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  get vulnerable(): boolean {
    return this.state === 'stagger' || this.state === 'stunned';
  }

  constructor(
    def: BossDef,
    level: Level,
    speedMult: number,
    orbs: ReadonlyArray<{ x: number; y: number }>,
  ) {
    this.x = def.x;
    this.y = def.y;
    this.minX = def.minX;
    this.maxX = def.maxX;
    this.spawnX = def.x;
    this.spawnY = def.y;
    this.level = level;
    this.speedMult = speedMult;
    this.orbs = orbs.map((o) => ({ x: o.x, y: o.y, alive: true, respawnT: 0 }));
  }

  update(dt: number, _t: number, player: Player): void {
    if (this.dead) return;
    this.squash = Math.max(0, this.squash - dt * 2.5);

    // Orbs respawn on a timer
    for (const o of this.orbs) {
      if (o.alive) continue;
      o.respawnT -= dt;
      if (o.respawnT <= 0) {
        o.alive = true;
        this.level.game.audio.play('orb');
        this.level.game.burst(o.x, o.y, 8, ['#8fd8ff', '#fff'], 'dot', 120);
      }
    }

    const g = this.level.game;
    const playerActive = !player.dead && player.state !== 'victory';

    switch (this.state) {
      case 'dying': {
        this.stateT += dt;
        if (Math.random() < 0.35) {
          g.burst(
            this.x + this.w / 2 + (Math.random() - 0.5) * this.w,
            this.y + 24, 6, MAGMA, 'ember', 170,
          );
        }
        if (this.stateT >= DIE_T) {
          this.dead = true;
          g.onBossDefeated();
        }
        return;
      }

      case 'telegraph': {
        this.stateT += dt;
        if (this.stateT >= TELEGRAPH_T) {
          this.fireAt(player);
          this.state = 'walk';
          this.stateT = 0;
        }
        break;
      }

      case 'chargeWarn': {
        this.stateT += dt;
        if (this.stateT >= CHARGE_WARN_T) {
          const pcx = player.x + player.w / 2;
          this.chargeDir = pcx < this.x + this.w / 2 ? -1 : 1;
          this.state = 'charge';
          this.stateT = 0;
          g.audio.play('boss');
        }
        break;
      }

      case 'charge': {
        this.x += this.chargeDir * CFG.boss.chargeSpeed * this.speedMult * dt;
        if (Math.random() < 0.5) {
          g.burst(
            this.x + (this.chargeDir === 1 ? 8 : this.w - 8),
            this.y + this.h - 6, 3, ['#ff9d3f', '#8a5a3b'], 'dust', 70,
          );
        }
        if (this.x <= this.minX || this.x >= this.maxX) {
          this.x = Math.min(Math.max(this.x, this.minX), this.maxX);
          this.state = 'stagger';
          this.stateT = 0;
          this.shootT = SHOOT_CD;
          this.chargeT = CHARGE_CD;
          g.addShake(7);
          g.burst(
            this.x + (this.chargeDir === 1 ? this.w : 0),
            this.y + this.h - 20, 18, MAGMA, 'chunk', 260,
          );
          g.audio.play('rock');
        }
        break;
      }

      case 'stagger':
      case 'stunned': {
        this.stateT += dt;
        const dur = this.state === 'stagger' ? STAGGER_T : STUN_T;
        if (this.stateT >= dur) {
          this.state = 'walk';
          this.stateT = 0;
        }
        break;
      }

      case 'walk': {
        this.x += this.dir * 55 * this.speedMult * dt;
        if (this.x <= this.minX) {
          this.x = this.minX;
          this.dir = 1;
        } else if (this.x >= this.maxX) {
          this.x = this.maxX;
          this.dir = -1;
        }
        if (playerActive) {
          this.shootT -= dt;
          this.chargeT -= dt;
          if (this.shootT <= 0) {
            this.shootT = SHOOT_CD;
            this.state = 'telegraph';
            this.stateT = 0;
            g.burst(this.x + this.w / 2, this.y + 40, 6, MAGMA, 'ember', 130);
          } else if (this.chargeT <= 0) {
            this.chargeT = CHARGE_CD;
            this.state = 'chargeWarn';
            this.stateT = 0;
            g.addShake(2.5);
          }
        }
        break;
      }
    }

    // --- Crystal orbs: stomp to shatter ---
    for (const o of this.orbs) {
      if (!o.alive) continue;
      const orbRect = { x: o.x - 13, y: o.y - 13, w: 26, h: 26 };
      const fallingOnOrb =
        player.vy > 40 &&
        player.x + player.w > orbRect.x &&
        player.x < orbRect.x + orbRect.w &&
        player.y + player.h >= orbRect.y &&
        player.y + player.h <= o.y + 16;
      if (!fallingOnOrb) continue;
      o.alive = false;
      o.respawnT = ORB_RESPAWN;
      player.vy = -CFG.player.stompBounce * 0.75;
      g.addScore(CFG.score.orb, o.x, o.y);
      g.addShake(2);
      g.audio.play('orb');
      g.burst(o.x, o.y, 14, ['#8fd8ff', '#fff', '#c9ecff'], 'chunk', 220);
      if (this.orbs.every((x) => !x.alive)) {
        this.state = 'stunned';
        this.stateT = 0;
        g.audio.play('boss');
        g.addShake(4);
        g.addStatus('Magma King is stunned! Stomp him!', '#8fd8ff');
      }
    }

    // --- Player interaction: stomp when vulnerable, hurt otherwise ---
    if (
      !player.dead &&
      player.state !== 'victory' &&
      overlap(player.rect, this.rect)
    ) {
      const fallingOnTop =
        player.vy > 40 && player.y + player.h <= this.y + 18;
      if (fallingOnTop) {
        if (this.vulnerable) {
          this.hp -= 1;
          this.squash = 1;
          player.vy = -CFG.player.stompBounce;
          g.stomps += 1;
          g.addScore(CFG.score.stomp, this.x + this.w / 2, this.y - 8);
          g.addShake(5);
          g.audio.play('stomp');
          g.burst(
            this.x + this.w / 2, this.y + 20, 16, MAGMA, 'chunk', 240,
          );
          if (this.hp <= 0) {
            this.state = 'dying';
            this.stateT = 0;
            g.addShake(8);
            g.audio.play('boss');
          }
        } else {
          // Clank: no damage, small deflection bounce
          player.vy = -260;
          g.addShake(1.5);
          g.audio.play('rock');
          g.burst(player.x + player.w / 2, this.y + 8, 5, ['#ffd257', '#fff'], 'dot', 120);
        }
      } else if (player.invulnT <= 0) {
        player.damage(this, 'enemy');
      }
    }
  }

  fireAt(player: Player): void {
    const g = this.level.game;
    // The entry pocket is a deliberate recovery space before the fight. Do
    // not aim a spread through the arena wall while Rex is still entering.
    if (player.x > this.minX - 220 && player.x + player.w < this.minX - 40) return;
    const bx = this.x + this.w / 2;
    const by = this.y + 34;
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    const base = Math.atan2(py - by, px - bx);
    for (const off of [-0.22, 0, 0.22]) {
      const a = base + off;
      this.level.spawnProjectile(
        bx, by,
        Math.cos(a) * CFG.boss.shootSpeed,
        Math.sin(a) * CFG.boss.shootSpeed - 130,
        'magma',
      );
    }
    g.audio.play('spit');
    g.burst(bx, by, 8, MAGMA, 'ember', 180);
  }

  reset(): void {
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.hp = this.maxHp;
    this.state = 'walk';
    this.stateT = 0;
    this.dead = false;
    this.squash = 0;
    this.dir = 1;
    this.shootT = SHOOT_CD;
    this.chargeT = CHARGE_CD;
    for (const o of this.orbs) {
      o.alive = true;
      o.respawnT = 0;
    }
  }

  draw(ctx: CanvasRenderingContext2D, t: number): void {
    // Orbs (floating crystals on the perches)
    for (let i = 0; i < this.orbs.length; i++) {
      const o = this.orbs[i];
      if (!o.alive) continue;
      const bob = Math.sin(t * 3 + i * 2.1) * 3;
      const oy = o.y + bob;
      ctx.save();
      const glow = ctx.createRadialGradient(o.x, oy, 2, o.x, oy, 20);
      glow.addColorStop(0, 'rgba(143,216,255,0.85)');
      glow.addColorStop(1, 'rgba(143,216,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(o.x, oy, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8f8ff';
      ctx.beginPath();
      ctx.moveTo(o.x, oy - 11);
      ctx.lineTo(o.x + 8, oy);
      ctx.lineTo(o.x, oy + 11);
      ctx.lineTo(o.x - 8, oy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#8fd8ff';
      ctx.beginPath();
      ctx.moveTo(o.x, oy - 11);
      ctx.lineTo(o.x + 8, oy);
      ctx.lineTo(o.x, oy + 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    if (this.dead) return;

    // Squash & stretch around the feet
    const sqx = 1 + 0.14 * this.squash;
    const sqy = 1 - 0.22 * this.squash;
    const sinking = this.state === 'dying' ? Math.min(26, this.stateT * this.stateT * 40) : 0;

    ctx.save();
    ctx.translate(this.x + this.w / 2, this.y + this.h + sinking);
    ctx.scale(sqx, sqy);
    if (this.state === 'dying') {
      ctx.globalAlpha = Math.max(0.25, 1 - this.stateT / 1.6);
    }
    ctx.translate(-this.w / 2, -this.h);

    // Shadow
    ctx.fillStyle = 'rgba(20,10,5,0.35)';
    ctx.beginPath();
    ctx.ellipse(this.w / 2, this.h - 2, 56, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    const crouch = this.state === 'chargeWarn' ? 6 : 0;
    const bodyTop = 24 + crouch;

    // Rocky shell body
    ctx.fillStyle = '#4a2e26';
    this.rr(ctx, 6, bodyTop, this.w - 12, this.h - bodyTop, 26);
    ctx.fill();
    // Belly
    ctx.fillStyle = '#33211b';
    this.rr(ctx, 26, bodyTop + 34, this.w - 52, this.h - bodyTop - 44, 16);
    ctx.fill();
    // Molten crest (the "magma head")
    const molten = ctx.createLinearGradient(0, 12, 0, bodyTop + 46);
    molten.addColorStop(0, '#ff6b35');
    molten.addColorStop(1, '#c93a1e');
    ctx.fillStyle = molten;
    this.rr(ctx, 14, 14 + crouch, this.w - 28, 44, 18);
    ctx.fill();
    // Bubbles on the crest
    ctx.fillStyle = 'rgba(255,210,87,0.9)';
    for (let i = 0; i < 3; i++) {
      const bub = 2.5 + 1.8 * Math.abs(Math.sin(t * 2.4 + i * 2));
      ctx.beginPath();
      ctx.arc(38 + i * 22, 24 + crouch + 8 + Math.sin(t * 3 + i) * 2, bub, 0, Math.PI * 2);
      ctx.fill();
    }
    // Magma cracks on the shell
    ctx.strokeStyle = 'rgba(255,107,53,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, bodyTop + 50);
    ctx.lineTo(34, bodyTop + 62);
    ctx.lineTo(28, bodyTop + 76);
    ctx.moveTo(98, bodyTop + 46);
    ctx.lineTo(86, bodyTop + 60);
    ctx.lineTo(94, bodyTop + 74);
    ctx.stroke();

    // Horns
    ctx.fillStyle = '#2e1c16';
    for (let i = 0; i < 3; i++) {
      const hx = 30 + i * 30;
      ctx.beginPath();
      ctx.moveTo(hx - 8, 18 + crouch);
      ctx.lineTo(hx, -2 - i * 4 + crouch);
      ctx.lineTo(hx + 8, 18 + crouch);
      ctx.closePath();
      ctx.fill();
    }

    // Eyes (angry gold; X when stunned; sleepy when dying)
    const eyeY = 34 + crouch;
    const look = this.dir === 1 ? 2 : -2;
    for (const ex of [44, 76]) {
      if (this.state === 'stunned') {
        ctx.strokeStyle = '#ffd257';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ex - 5, eyeY - 5);
        ctx.lineTo(ex + 5, eyeY + 5);
        ctx.moveTo(ex + 5, eyeY - 5);
        ctx.lineTo(ex - 5, eyeY + 5);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#ffd257';
        ctx.beginPath();
        ctx.arc(ex, eyeY, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#241209';
        ctx.beginPath();
        ctx.arc(ex + look, eyeY, 3, 0, Math.PI * 2);
        ctx.fill();
        // angry brow
        ctx.strokeStyle = '#241209';
        ctx.lineWidth = 3;
        ctx.beginPath();
        if (this.state === 'dying') {
          ctx.moveTo(ex - 6, eyeY - 7);
          ctx.lineTo(ex + 6, eyeY - 7);
        } else {
          ctx.moveTo(ex - (this.dir === 1 ? 8 : -8), eyeY - 10);
          ctx.lineTo(ex + (this.dir === 1 ? 6 : -6), eyeY - 5);
        }
        ctx.stroke();
      }
    }

    // Jaw
    ctx.fillStyle = '#2e1c16';
    this.rr(ctx, 30, 52 + crouch, 60, 16, 8);
    ctx.fill();
    ctx.fillStyle = '#f4ecd9';
    for (let i = 0; i < 4; i++) {
      const tx = 38 + i * 14;
      ctx.beginPath();
      ctx.moveTo(tx, 52 + crouch);
      ctx.lineTo(tx + 5, 52 + crouch);
      ctx.lineTo(tx + 2.5, 58 + crouch);
      ctx.closePath();
      ctx.fill();
    }

    // Telegraph: muzzle glow building before the shot
    if (this.state === 'telegraph') {
      const p = this.stateT / 0.75;
      ctx.fillStyle = `rgba(255,157,63,${0.35 + 0.5 * p})`;
      ctx.beginPath();
      ctx.arc(60, 56 + crouch, 6 + 10 * p, 0, Math.PI * 2);
      ctx.fill();
    }

    // Charge warn: pulsing red tint + "!" overhead
    if (this.state === 'chargeWarn') {
      const p = this.stateT / 0.85;
      ctx.fillStyle = `rgba(255,60,60,${0.12 + 0.18 * Math.abs(Math.sin(p * 12))})`;
      this.rr(ctx, 6, bodyTop, this.w - 12, this.h - bodyTop, 26);
      ctx.fill();
      ctx.fillStyle = '#ff5c5c';
      ctx.font = '900 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', this.w / 2, -8 + Math.sin(t * 20) * 3);
    }

    // Charge: speed streaks
    if (this.state === 'charge') {
      ctx.strokeStyle = 'rgba(255,210,87,0.7)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const sy = 30 + i * 26;
        ctx.beginPath();
        ctx.moveTo(this.chargeDir === 1 ? -8 : this.w + 8, sy);
        ctx.lineTo(this.chargeDir === 1 ? -30 : this.w + 30, sy);
        ctx.stroke();
      }
    }

    // Dizzy stars while stagger/stunned
    if (this.state === 'stagger' || this.state === 'stunned') {
      ctx.fillStyle = '#ffd257';
      for (let i = 0; i < 3; i++) {
        const a = t * 4 + (i * Math.PI * 2) / 3;
        const sx = this.w / 2 + Math.cos(a) * 30;
        const sy = 6 + Math.sin(a) * 7;
        ctx.beginPath();
        ctx.arc(sx, sy, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  private rr(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
}
