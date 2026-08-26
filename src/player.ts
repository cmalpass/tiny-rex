import { CFG } from './config';
import { clamp, lerp, overlap } from './util';
import type { Input } from './input';
import type { Level } from './level';
import type { Platform } from './platform';
import type { GameCtx } from './ctx';

export type PlayerState = 'idle' | 'run' | 'jump' | 'fall' | 'hurt' | 'dead' | 'victory';
export type DamageKind = 'spikes' | 'lava' | 'enemy' | 'rock' | 'pit' | 'spit';

/** Haptic pulse where supported (mobile vibration + gamepad rumble); silent no-op elsewhere. */
function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
  } catch {
    /* no haptics */
  }
  // Gamepads with a vibration actuator get a matching dual rumble
  try {
    if (typeof navigator !== 'undefined' && 'getGamepads' in navigator) {
      const pad = Array.from(navigator.getGamepads()).find((p) => p && p.vibrationActuator);
      if (pad) {
        const duration = Array.isArray(pattern) ? pattern.reduce((a, b) => a + b, 0) : pattern;
        pad.vibrationActuator.playEffect('dual-rumble', {
          duration,
          strongMagnitude: 0.7,
          weakMagnitude: 0.4,
        });
      }
    }
  } catch {
    /* no actuator */
  }
}

export class Player {
  w = CFG.player.w;
  h = CFG.player.h;
  spawn: { x: number; y: number } = { x: 0, y: 0 };
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  facing = 1;
  grounded = false;
  standingOn: Platform | null = null;
  coyoteT = 0;
  /** Max hearts — set by the Game from the active difficulty. */
  maxHearts: number = CFG.player.maxHearts;
  hearts: number = CFG.player.maxHearts;
  invulnT = 0;
  dead = false;
  deathT = 0;
  rot = 0;
  state: PlayerState = 'idle'; // idle | run | jump | fall | hurt | dead | victory
  runPhase = 0;
  squashX = 1;
  squashY = 1;
  landT = 0;
  hurtT = 0;
  walkDustT = 0;
  jumpCutPending = false;
  /** Konami code: rainbow skin. */
  rainbow = false;
  private readonly game: GameCtx;

  constructor(x: number, y: number, game: GameCtx) {
    this.game = game;
    this.reset(x, y, true);
  }

  reset(x: number, y: number, first: boolean): void {
    this.x = x;
    this.y = y;
    this.spawn = { x, y };
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.grounded = false;
    this.standingOn = null;
    this.coyoteT = 0;
    this.hearts = this.maxHearts;
    this.invulnT = first ? 0 : CFG.player.respawnInvuln;
    this.dead = false;
    this.deathT = 0;
    this.rot = 0;
    this.state = 'idle';
    this.runPhase = 0;
    this.squashX = 1;
    this.squashY = 1;
    this.landT = 0;
    this.hurtT = 0;
    this.walkDustT = 0;
    this.jumpCutPending = false;
  }

  get feet(): number {
    return this.y + this.h;
  }

  get rect(): { x: number; y: number; w: number; h: number } {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  update(dt: number, t: number, input: Input, level: Level): void {
    const P = CFG.player;
    if (this.dead) {
      // Death tumble: spin and fall through the world.
      this.deathT += dt;
      this.vy = Math.min(this.vy + P.gravity * dt, 1100);
      this.y += this.vy * dt;
      this.x += this.vx * dt;
      this.vx *= 0.99;
      this.rot += dt * 9 * this.facing;
      return;
    }
    if (this.state === 'victory') {
      // The run's victory clock lives on the Game (single source of truth).
      const vT = this.game.victoryT;
      // Little hops into the nest
      this.vy = Math.min(this.vy + P.gravity * dt, 900);
      this.y += this.vy * dt;
      this.grounded = false;
      for (const pl of level.platforms) {
        if (!pl.solid()) continue;
        const r = this.rect;
        if (overlap(r, pl) && this.vy >= 0 && r.y + r.h - this.vy * dt <= pl.y + 14) {
          this.y = pl.y - this.h;
          this.vy = this.vy > 120 ? -300 : 0;
          this.grounded = true;
        }
      }
      if (Math.floor(vT * 2) !== Math.floor((vT - dt) * 2)) {
        this.game.burst(this.x + this.w / 2, this.y, 4, ['#ffe28a', '#fff'], 'dot', 120);
      }
      return;
    }

    this.hurtT = Math.max(0, this.hurtT - dt);
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.landT = Math.max(0, this.landT - dt);
    // Ease squash & stretch back to neutral
    this.squashX = lerp(this.squashX, 1, dt * 12);
    this.squashY = lerp(this.squashY, 1, dt * 12);

    const prevFeet = this.feet;

    // --- Horizontal ---
    const accel = this.grounded ? P.accel : P.airAccel;
    const drag = this.grounded ? P.friction : P.airDrag;
    if (input.left && !input.right) {
      this.vx -= accel * dt;
      this.facing = -1;
    } else if (input.right && !input.left) {
      this.vx += accel * dt;
      this.facing = 1;
    } else {
      const s = Math.sign(this.vx);
      this.vx -= s * drag * dt;
      if (Math.sign(this.vx) !== s) this.vx = 0;
    }
    this.vx = clamp(this.vx, -P.maxSpeed, P.maxSpeed);

    // --- Jump: buffered + coyote time ---
    this.coyoteT = this.grounded ? P.coyoteTime : Math.max(0, this.coyoteT - dt);
    const sincePress = t - input.jumpBufferT;
    const buffered = input.jumpBufferT >= 0 && sincePress >= 0 && sincePress <= P.jumpBuffer;
    if (buffered && (this.grounded || this.coyoteT > 0)) {
      input.jumpBufferT = -1;
      this.vy = -P.jumpVel;
      this.grounded = false;
      this.coyoteT = 0;
      this.squashX = 0.8;
      this.squashY = 1.25;
      this.jumpCutPending = true;
      this.game.burst(this.x + this.w / 2, this.feet, 5, ['#e8dcc8'], 'dust', 90);
      this.game.audio.play('jump');
    }
    // Variable jump height: releasing early cuts the ascent, but only once
    // (edge-triggered) so stomp bounces and lava flicks keep their full pop.
    if (this.jumpCutPending) {
      if (!input.jumpHeld && this.vy < -140) {
        this.vy *= P.jumpCut;
        this.jumpCutPending = false;
      } else if (this.grounded) {
        this.jumpCutPending = false;
      }
    }

    // --- Gravity ---
    this.vy = Math.min(this.vy + P.gravity * dt, P.maxFall);

    // --- Carry by moving platform before integrating ---
    if (this.standingOn && this.standingOn.solid()) {
      this.x += this.standingOn.dx;
      if (this.standingOn.dy > 0) this.y += this.standingOn.dy;
    }

    // --- Axis-separated collision (prevents tunneling; y capped so a
    //     60Hz step moves less than the thinnest solid) ---
    this.x += this.vx * dt;
    for (const pl of level.platforms) {
      if (!pl.solid()) continue;
      if (overlap(this.rect, pl)) {
        if (this.vx > 0) this.x = pl.x - this.w;
        else if (this.vx < 0) this.x = pl.x + pl.w;
        else {
          // pushed in by a mover: resolve to the nearer side
          const toL = this.x + this.w / 2 - pl.x;
          const toR = pl.x + pl.w - (this.x + this.w / 2);
          this.x = toL < toR ? pl.x - this.w : pl.x + pl.w;
        }
        this.vx = 0;
      }
    }
    this.x = clamp(this.x, 0, level.width - this.w);

    const wasGrounded = this.grounded;
    this.y += this.vy * dt;
    this.grounded = false;
    this.standingOn = null;
    for (const pl of level.platforms) {
      if (!pl.solid()) continue;
      if (overlap(this.rect, pl)) {
        if (this.vy > 0) {
          this.y = pl.y - this.h;
          if (this.vy > 480 && !wasGrounded) {
            // landing: squash + dust
            this.squashX = 1.22;
            this.squashY = 0.78;
            this.landT = 0.14;
            this.game.burst(this.x + this.w / 2, this.feet, 6, ['#e8dcc8', '#d9c9a8'], 'dust', 110);
            this.game.audio.play('land');
          }
          if (pl.type === 'crumble') {
            pl.active = false;
            this.game.burst(pl.x + pl.w / 2, pl.y + pl.h / 2, 12, ['#b7a88f', '#93866f'], 'chunk', 180);
            this.game.audio.play('crumble');
            this.game.addShake(2);
          }
          this.vy = 0;
          this.grounded = true;
          this.standingOn = pl;
        } else if (this.vy < 0) {
          this.y = pl.y + pl.h;
          this.vy = 0;
        }
      }
    }

    // --- Spring pads: launch when falling (or walking) onto one ---
    for (const s of level.springs) {
      if (this.vy >= 0 && overlap(this.rect, s.rect)) {
        this.vy = -CFG.spring.vel;
        this.grounded = false;
        this.standingOn = null;
        this.squashX = 0.78;
        this.squashY = 1.32;
        this.jumpCutPending = false; // a spring launch isn't cuttable
        s.bounce();
        this.game.burst(this.x + this.w / 2, s.y - 8, 8, ['#ffb3c0', '#fff'], 'dot', 140);
        this.game.audio.play('spring');
      }
    }

    // --- Walk dust ---
    if (this.grounded && Math.abs(this.vx) > 140) {
      this.walkDustT -= dt;
      if (this.walkDustT <= 0) {
        this.walkDustT = 0.16;
        this.game.burst(this.x + this.w / 2 - this.facing * 10, this.feet, 1, ['#e0d4bc'], 'dust', 40);
      }
    }

    // --- State for animation ---
    if (this.hurtT > 0) this.state = 'hurt';
    else if (!this.grounded) this.state = this.vy < 0 ? 'jump' : 'fall';
    else if (Math.abs(this.vx) > 20) this.state = 'run';
    else this.state = 'idle';
    if (this.state === 'run') this.runPhase += dt * (8 + Math.abs(this.vx) * 0.045);

    // --- Hazards ---
    for (const hz of level.hazards) {
      if (hz.type === 'spikes' && this.invulnT <= 0 && overlap(this.rect, hz.rect)) {
        this.damage(hz, 'spikes');
      } else if (hz.type === 'lava' && this.invulnT <= 0) {
        const lr = { x: hz.x, y: hz.y - 6, w: hz.w, h: 60 };
        if (overlap(this.rect, lr)) {
          this.damage(hz, 'lava');
          if (!this.dead) this.vy = -P.lavaBounce; // flick out of the lava
        }
      }
    }

    // --- Crystals ---
    for (const c of level.crystals) {
      if (c.collected) continue;
      if (overlap(this.rect, c.rect)) {
        c.collected = true;
        this.game.collectCrystal(c.x, c.y, c.bonus);
      }
    }

    // --- Hearts (heal, or pay out at full health) ---
    for (const h of level.hearts) {
      if (h.collected) continue;
      if (overlap(this.rect, h.rect)) {
        h.collected = true;
        this.game.collectHeart(h.x, h.y);
      }
    }

    // --- Fossils (persistent discoveries, re-collectable for score) ---
    for (const f of level.fossils) {
      if (f.collected) continue;
      if (overlap(this.rect, f.rect)) {
        f.collected = true;
        this.game.collectFossil(f.x, f.y, f.id);
      }
    }

    // --- Enemies: stomp from above, hurt from the side ---
    for (const e of level.enemies) {
      if (e.dead) continue;
      if (!overlap(this.rect, e.rect)) continue;
      const fallingOnTop = this.vy > 40 && prevFeet - 2 <= e.y + 12;
      if (fallingOnTop) {
        e.stomp();
        this.game.stomps += 1;
        this.vy = input.jumpHeld ? -P.stompBounceHeld : -P.stompBounce;
        this.squashX = 1.25;
        this.squashY = 0.75;
        this.game.addScore(CFG.score.stomp, e.x + e.w / 2, e.y - 10);
        this.game.burst(e.x + e.w / 2, e.y + e.h / 2, 14, this.enemyColors(e.type), 'chunk', 200);
        this.game.addShake(3);
        this.game.audio.play('stomp');
        if (e.type === 'spitter') level.popProjectile(e.x + e.w / 2, e.y + e.h / 2);
        vibrate(30);
      } else if (this.invulnT <= 0) {
        this.damage(e, 'enemy');
      }
    }

    // --- Checkpoints ---
    for (const cp of level.checkpoints) {
      if (!cp.active && overlap(this.rect, cp.rect)) cp.activate();
    }

    // --- Pit ---
    if (this.y > CFG.killY && !this.dead) this.die('pit');

    // --- Goal --- (victory state early-returns at the top of update())
    if (overlap(this.rect, level.goal.rect)) {
      this.state = 'victory';
      this.vx = 0;
      this.game.onPlayerVictory();
    }
  }

  enemyColors(type: string): string[] {
    if (type === 'beetle') return ['#7a3b2e', '#5c2c22', '#c96f4a'];
    if (type === 'trike') return ['#7d97ad', '#5d7690', '#c3d3e0'];
    if (type === 'spitter') return ['#63b06b', '#4c9d52', '#c9f0a0'];
    return ['#e8a0b4', '#c97d97', '#ffd9e2'];
  }

  damage(source: { x: number; w: number }, kind: DamageKind): void {
    if (this.invulnT > 0 || this.dead || this.state === 'victory') return;
    if (this.game.godMode) {
      // Invulnerable: still show the hit, no heart lost.
      this.hurtT = 0.25;
      this.game.audio.play('hurt');
      this.game.burst(this.x + this.w / 2, this.y + this.h / 2, 8, ['#8fe3ff', '#fff'], 'dot', 160);
      this.game.addStatus('Invulnerable!', '#8fe3ff');
      return;
    }
    this.hearts -= 1;
    this.invulnT = CFG.player.invulnTime;
    this.hurtT = 0.5;
    this.game.audio.play('hurt');
    this.game.addShake(6);
    vibrate([60, 40, 60]);
    this.game.burst(this.x + this.w / 2, this.y + this.h / 2, 10, ['#ff8a5c', '#ffd257'], 'dot', 180);
    if (this.hearts <= 0) {
      this.die(kind);
      return;
    }
    // Knockback away from the source (every caller passes x/w)
    const cx = this.x + this.w / 2;
    let dir = cx < source.x + source.w / 2 ? -1 : 1;
    if (kind === 'lava') dir = 0;
    this.vx = dir * CFG.player.knockX;
    this.vy = kind === 'lava' ? -CFG.player.lavaBounce : -CFG.player.knockY;
    const msgs: Record<DamageKind, string> = {
      spikes: 'Ouch!',
      lava: 'Sizzling!',
      enemy: 'Bumped!',
      rock: 'Bonked!',
      pit: 'Whoa!',
      spit: 'Yuck!',
    };
    this.game.addStatus(msgs[kind], '#ff9d7a');
  }

  die(kind: DamageKind): void {
    if (this.dead) return;
    this.dead = true;
    this.state = 'dead';
    this.deathT = 0;
    this.rot = 0;
    this.vy = kind === 'pit' ? this.vy : -380;
    this.vx = 0;
    this.game.audio.play('die');
    this.game.onPlayerDeath();
  }
}
