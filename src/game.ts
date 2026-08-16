import { CFG, VW, VH, TAU, FONT_STACK } from './config';
import { clamp, fmtTime } from './util';
import { Store } from './store';
import { AudioManager } from './audio';
import { Input } from './input';
import type { GameKey } from './input';
import { Background } from './background';
import { Camera } from './camera';
import { Level } from './level';
import { Player } from './player';
import { Particle, FloatingText } from './particles';
import type { ParticleType } from './particles';
import { LEVEL_DATA } from './level-data';
import { drawDecor } from './decor';
import { Sprite } from './sprite';
import type { GameCtx } from './ctx';
import type { Checkpoint } from './checkpoint';
import type { Platform } from './platform';
import type { Hazard } from './hazard';

export type GameState = 'menu' | 'playing' | 'paused' | 'dying' | 'gameover' | 'victory';

interface UIButton {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color?: string;
  action: () => void;
}

interface RunResults {
  crystals: number;
  totalCrystals: number;
  stomps: number;
  time: number;
  timeBonus: number;
  heartBonus: number;
  total: number;
  isBestScore: boolean;
  isBestTime: boolean;
}

/**
 * Orchestrates the whole game: state machine, main loop, HUD and screens.
 * Rendering lives here (as in the original); entities render themselves.
 */
export class Game implements GameCtx {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly audio = new AudioManager();
  readonly input = new Input();
  readonly bg = new Background();
  readonly camera = new Camera();
  level: Level | null = null;
  player: Player | null = null;
  state: GameState = 'menu'; // menu | playing | paused | dying | gameover | victory
  time = 0; // game (unpaused) clock
  elapsed = 0; // run timer
  score = 0;
  crystalsGot = 0;
  /** Stomp count for the current run (GameCtx). */
  stomps = 0;
  deaths = 0;
  particles: Particle[] = [];
  texts: FloatingText[] = [];
  status = { msg: '', color: '#fff', t: 0 };
  debug = false;
  reducedMotion = Store.get('tinyrex_reduced', false);
  fps = 60;
  fpsT = 0;
  fpsN = 0;
  victoryT = 0;
  results: RunResults | null = null;
  best = { score: Store.get('tinyrex_best_score', 0), time: Store.get('tinyrex_best_time', null as number | null) };
  checkpoint: { x: number; y: number } | null = null;
  dyingT = 0;
  uiButtons: UIButton[] = [];
  uiHover: UIButton | null = null;
  dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.input.onGameKey = (k) => this.handleKey(k);
    // Stamp the jump buffer with the unpaused game clock so buffering
    // works across pause boundaries.
    this.input.now = () => this.time;
    this.bindPointer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /* ---------- lifecycle ---------- */
  buildLevel(): void {
    this.level = new Level(LEVEL_DATA, this);
  }

  startGame(): void {
    this.buildLevel();
    this.player = new Player(this.level!.start.x, this.level!.start.y, this);
    this.score = 0;
    this.crystalsGot = 0;
    this.stomps = 0;
    this.deaths = 0;
    this.elapsed = 0;
    this.time = 0;
    this.particles = [];
    this.texts = [];
    this.checkpoint = null;
    this.results = null;
    this.victoryT = 0;
    this.camera.x = 0;
    this.camera.shake = 0;
    this.state = 'playing';
    this.updatePauseButton();
    this.setCheckpointAt(0);
    this.addStatus('Find your way to the glowing nest!', '#fff');
    this.audio.unlock();
    this.audio.play('ui');
  }

  setCheckpointAt(index: number): void {
    // Checkpoints store the ground-top y; the player is dropped onto it.
    this.checkpoint = { x: this.level!.start.x, y: this.level!.startGroundY };
    if (index > 0 && this.level!.checkpoints[index - 1]) {
      const cp = this.level!.checkpoints[index - 1];
      this.checkpoint = { x: cp.x, y: cp.y };
    }
  }

  setCheckpoint(cp: Checkpoint): void {
    this.checkpoint = { x: cp.x, y: cp.y };
    this.setCheckpointAt(this.level!.checkpoints.indexOf(cp) + 1);
  }

  respawn(): void {
    const c = this.checkpoint!;
    const p = this.player!;
    p.reset(c.x, c.y - p.h - 2, false);
    p.spawn = { x: c.x, y: c.y - p.h - 2 };
    // Reset nearby enemies so a spawn point is never instantly lethal
    for (const e of this.level!.enemies) {
      if (Math.abs(e.x - c.x) < 420) e.reset();
    }
    this.particles = [];
    this.camera.shake = 0;
    this.addShake(0);
    this.burst(c.x + 17, c.y - 30, 14, ['#9ff0ff', '#fff'], 'dot', 150);
  }

  toMenu(): void {
    this.state = 'menu';
    this.updatePauseButton();
    this.buildLevel();
    this.player = null;
  }

  handleKey(k: GameKey): void {
    if (k === 'visibility' && this.state === 'playing') {
      this.pause();
      return;
    }
    if (k === 'mute') {
      this.audio.setMuted(!this.audio.muted);
      this.audio.play('ui');
      this.updateMuteButton();
      return;
    }
    if (k === 'reducedMotion') {
      this.reducedMotion = !this.reducedMotion;
      Store.set('tinyrex_reduced', this.reducedMotion);
      this.audio.play('ui');
      return;
    }
    if (k === 'debug') {
      this.debug = !this.debug;
      return;
    }
    switch (this.state) {
      case 'menu':
        if (k === 'primary') this.startGame();
        break;
      case 'playing':
        if (k === 'pause') this.pause();
        else if (k === 'restart') this.startGame();
        break;
      case 'paused':
        if (k === 'pause' || k === 'primary') this.resume();
        else if (k === 'restart') this.startGame();
        break;
      case 'gameover':
        if (k === 'primary') {
          this.respawn();
          this.state = 'playing';
          this.addStatus('From the checkpoint!', '#9ff0ff');
        } else if (k === 'restart') this.startGame();
        break;
      case 'victory':
        if (k === 'primary' && this.victoryT > 1.2) this.startGame();
        else if (k === 'restart') this.startGame();
        break;
    }
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.updatePauseButton();
    this.audio.play('pause');
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.updatePauseButton();
    this.audio.play('ui');
  }

  addStatus(msg: string, color?: string): void {
    this.status = { msg, color: color || '#fff', t: 2.4 };
  }

  addShake(m: number): void {
    this.camera.addShake(m);
  }

  addScore(v: number, x: number, y: number): void {
    this.score += v;
    this.texts.push(new FloatingText(x, y, '+' + v, '#ffe28a'));
  }

  burst(x: number, y: number, n: number, colors: string[], type: ParticleType, speed: number): void {
    if (this.reducedMotion) n = Math.max(1, Math.floor(n * 0.4));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.particles.push(new Particle({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - (type === 'dust' ? 30 : 60),
        life: 0.35 + Math.random() * 0.4,
        size: type === 'chunk' ? 5 : type === 'dust' ? 4 : 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        grav: type === 'dust' ? 60 : type === 'chunk' ? 500 : 260,
        type,
        rot: Math.random() * TAU,
        vrot: (Math.random() - 0.5) * 10,
      }));
    }
  }

  onPlayerDeath(): void {
    this.deaths += 1;
    this.state = 'dying';
    this.dyingT = 0;
  }

  onPlayerVictory(): void {
    this.state = 'victory';
    this.victoryT = 0;
    this.audio.play('victory');
    this.addShake(4);
    // Confetti from above the nest
    for (let i = 0; i < (this.reducedMotion ? 30 : 90); i++) {
      const x = this.level!.goal.x - 120 + Math.random() * 240;
      this.particles.push(new Particle({
        x,
        y: -20 - Math.random() * 120,
        vx: (Math.random() - 0.5) * 60,
        vy: 60 + Math.random() * 120,
        life: 1.6 + Math.random() * 1.2,
        size: 5,
        color: ['#ffd257', '#7ec8f2', '#ff8fa3', '#9ff0a8', '#fff'][i % 5],
        grav: 120,
        type: 'rect',
        rot: Math.random() * TAU,
        vrot: (Math.random() - 0.5) * 12,
      }));
    }
    // Final score
    const timeBonus = Math.max(0, CFG.score.timeBonusBase - Math.floor(this.elapsed) * CFG.score.timeBonusPerSec);
    const heartBonus = this.player!.hearts * CFG.score.heartBonus;
    this.score += timeBonus + heartBonus;
    const isBestScore = this.score > this.best.score;
    const isBestTime = this.best.time === null || this.elapsed < this.best.time;
    if (isBestScore) {
      this.best.score = this.score;
      Store.set('tinyrex_best_score', this.best.score);
    }
    if (isBestTime) {
      this.best.time = this.elapsed;
      Store.set('tinyrex_best_time', this.best.time);
    }
    this.results = {
      crystals: this.crystalsGot,
      totalCrystals: this.level!.totalCrystals,
      stomps: this.stomps,
      time: this.elapsed,
      timeBonus,
      heartBonus,
      total: this.score,
      isBestScore,
      isBestTime,
    };
  }

  update(dt: number): void {
    this.audio.update(dt);
    if (this.state === 'playing') {
      this.time += dt;
      this.elapsed += dt;
      this.level!.update(dt, this.time, this.player!);
      this.player!.update(dt, this.time, this.input, this.level!);
      this.camera.update(dt, this.player!, this.level!.width, this);
      // track crystal count
      this.crystalsGot = this.level!.crystals.filter((c) => c.collected).length;
      if (this.player!.state === 'victory' && this.state === 'playing') {
        this.state = 'victory';
      }
    } else if (this.state === 'dying') {
      this.time += dt;
      this.dyingT += dt;
      this.level!.update(dt, this.time, this.player!);
      this.player!.update(dt, this.time, this.input, this.level!);
      this.camera.update(dt, this.player!, this.level!.width, this);
      if (this.dyingT > 1.15) {
        this.state = 'gameover';
        this.audio.play('ui');
      }
    } else if (this.state === 'victory') {
      this.time += dt;
      this.victoryT += dt;
      this.level!.update(dt, this.time, this.player!);
      this.player!.update(dt, this.time, this.input, this.level!);
      this.camera.update(dt, this.player!, this.level!.width, this);
    } else if (this.state === 'menu') {
      this.time += dt;
    }
    // Particles & texts always animate (they're decorative)
    this.particles = this.particles.filter((p) => p.update(dt));
    this.texts = this.texts.filter((p) => p.update(dt));
    if (this.status.t > 0) this.status.t -= dt;
  }

  /* ---------- rendering ---------- */
  render(): void {
    const ctx = this.ctx;
    ctx.save();
    // Crisp scaling: work in logical pixels
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!this.level) this.buildLevel();
    if (this.state === 'menu') {
      this.renderMenu(ctx);
      ctx.restore();
      return;
    }

    const camX = this.camera.x + this.camera.ox;
    const camY = this.camera.oy;
    this.bg.draw(ctx, camX, this.time);

    ctx.save();
    ctx.translate(-camX, -camY);

    // Platforms & decor
    for (const p of this.level!.platforms) {
      if (p.x + p.w > camX - 40 && p.x < camX + VW + 40) this.drawPlatform(ctx, p);
    }
    // The original called drawDecor with 3 args here, leaving groundY
    // undefined so level decor rendered at NaN and never appeared; pass the
    // ground line so trees/bushes/tufts actually draw.
    for (const d of this.level!.decor) drawDecor(ctx, d, this.time, this.level!.startGroundY);

    // Hazards (lava pools & spikes under entities)
    for (const hz of this.level!.hazards) {
      if (hz.type === 'lava') this.drawLava(ctx, hz, this.time);
    }
    for (const hz of this.level!.hazards) {
      if (hz.type === 'spikes') this.drawSpikes(ctx, hz);
    }
    for (const hz of this.level!.hazards) {
      if (hz.type === 'rocks') this.drawRocks(ctx, hz);
    }

    // Goal, checkpoints, crystals, enemies
    this.level!.goal.draw(ctx, this.time);
    for (const cp of this.level!.checkpoints) cp.draw(ctx, this.time);
    for (const c of this.level!.crystals) {
      if (!c.collected) c.draw(ctx, this.time);
    }
    for (const e of this.level!.enemies) {
      if (e.dead) continue;
      if (e.x + e.w < camX - 60 || e.x > camX + VW + 60) continue;
      if (e.type === 'beetle') Sprite.drawBeetle(ctx, e);
      else if (e.type === 'trike') Sprite.drawTrike(ctx, e);
      else Sprite.drawPtero(ctx, e);
    }

    // Player
    if (this.player) Sprite.drawRex(ctx, this.player, this.time);

    // Particles & floating text
    for (const p of this.particles) p.draw(ctx);
    for (const t of this.texts) t.draw(ctx);

    ctx.restore();

    // Vignette-ish bottom fade for depth
    const vg = ctx.createLinearGradient(0, VH - 60, 0, VH);
    vg.addColorStop(0, 'rgba(40,30,20,0)');
    vg.addColorStop(1, 'rgba(40,30,20,0.18)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, VH - 60, VW, 60);

    this.drawHUD(ctx);

    if (this.state === 'paused') this.drawPause(ctx);
    else if (this.state === 'gameover') this.drawGameOver(ctx);
    else if (this.state === 'victory') this.drawVictory(ctx);

    if (this.debug) this.drawDebug(ctx);
    ctx.restore();
  }

  drawPlatform(ctx: CanvasRenderingContext2D, p: Platform): void {
    if (!p.active) return;
    if (p.type === 'ground') {
      ctx.fillStyle = '#8a5f3c';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      // dirt texture dots
      ctx.fillStyle = 'rgba(90,60,35,0.5)';
      for (let i = 0; i < p.w / 46; i++) {
        const sx = p.x + 12 + ((p.seed * 31 + i * 53) % Math.max(1, p.w - 24));
        ctx.fillRect(sx, p.y + 26 + ((i * 37 + p.seed) % (p.h - 40)), 5, 4);
      }
      // grass top
      ctx.fillStyle = '#5da854';
      ctx.fillRect(p.x, p.y, p.w, 12);
      ctx.fillStyle = '#6fbe62';
      ctx.fillRect(p.x, p.y, p.w, 5);
      // edge shading
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.fillRect(p.x, p.y, 4, p.h);
      ctx.fillRect(p.x + p.w - 4, p.y, 4, p.h);
    } else if (p.type === 'wood' || p.type === 'stone' || p.type === 'mover') {
      const isMover = p.type === 'mover';
      ctx.fillStyle = isMover ? '#5f8f9d' : p.type === 'wood' ? '#a8783f' : '#9aa3ad';
      this.roundRect(ctx, p.x, p.y, p.w, p.h, 6);
      ctx.fill();
      ctx.fillStyle = isMover ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.3)';
      this.roundRect(ctx, p.x, p.y, p.w, 6, 3);
      ctx.fill();
      ctx.strokeStyle = isMover ? '#3f6b78' : p.type === 'wood' ? '#6d4a28' : '#6b747e';
      ctx.lineWidth = 2;
      this.roundRect(ctx, p.x, p.y, p.w, p.h, 6);
      ctx.stroke();
      if (p.type === 'wood') {
        ctx.strokeStyle = 'rgba(109,74,40,0.5)';
        ctx.lineWidth = 1.5;
        for (let i = 1; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(p.x + 4, p.y + (p.h / 3) * i);
          ctx.lineTo(p.x + p.w - 4, p.y + (p.h / 3) * i);
          ctx.stroke();
        }
      } else if (isMover) {
        // crystal trim
        ctx.fillStyle = '#ffe28a';
        ctx.beginPath();
        ctx.moveTo(p.x + 8, p.y + p.h - 4);
        ctx.lineTo(p.x + 14, p.y + p.h - 12);
        ctx.lineTo(p.x + 20, p.y + p.h - 4);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(p.x + p.w - 20, p.y + p.h - 4);
        ctx.lineTo(p.x + p.w - 14, p.y + p.h - 12);
        ctx.lineTo(p.x + p.w - 8, p.y + p.h - 4);
        ctx.closePath();
        ctx.fill();
      }
    } else if (p.type === 'crumble') {
      ctx.fillStyle = '#b7a88f';
      this.roundRect(ctx, p.x, p.y, p.w, p.h, 4);
      ctx.fill();
      ctx.strokeStyle = '#7c705c';
      ctx.lineWidth = 2;
      this.roundRect(ctx, p.x, p.y, p.w, p.h, 4);
      ctx.stroke();
      // cracks
      ctx.strokeStyle = 'rgba(90,80,64,0.7)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(p.x + 8, p.y + 4);
      ctx.lineTo(p.x + 16, p.y + 12);
      ctx.lineTo(p.x + 10, p.y + 20);
      ctx.moveTo(p.x + p.w - 10, p.y + 6);
      ctx.lineTo(p.x + p.w - 18, p.y + 14);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(p.x + 2, p.y + 2, p.w - 4, 3);
    }
  }

  roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  drawLava(ctx: CanvasRenderingContext2D, hz: Hazard, t: number): void {
    const x = hz.x, y = hz.y, w = hz.w;
    // glow
    ctx.fillStyle = 'rgba(255,120,40,0.18)';
    ctx.fillRect(x - 12, y - 26, w + 24, 40);
    // body
    const grad = ctx.createLinearGradient(0, y, 0, y + 70);
    grad.addColorStop(0, '#ff9d3c');
    grad.addColorStop(0.4, '#f2622e');
    grad.addColorStop(1, '#b23a1c');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, 80);
    // animated surface
    ctx.fillStyle = '#ffc46e';
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let i = 0; i <= w; i += 8) {
      ctx.lineTo(x + i, y + Math.sin(t * 3 + i * 0.11 + x) * 3);
    }
    ctx.lineTo(x + w, y + 10);
    ctx.lineTo(x, y + 10);
    ctx.closePath();
    ctx.fill();
    // bubbles
    for (let i = 0; i < w / 34; i++) {
      const bx = x + ((i * 61 + Math.floor(x)) % w);
      const bt = (t * 0.7 + i * 0.37) % 1;
      ctx.globalAlpha = 0.7 * (1 - bt);
      ctx.fillStyle = '#ffe28a';
      ctx.beginPath();
      ctx.arc(bx, y + 6 - bt * 4, 2 + 2 * (1 - bt), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawSpikes(ctx: CanvasRenderingContext2D, hz: Hazard): void {
    const n = Math.floor(hz.w / 14);
    ctx.fillStyle = '#8f9aa5';
    for (let i = 0; i < n; i++) {
      const sx = hz.x + i * 14;
      ctx.beginPath();
      ctx.moveTo(sx, hz.y + 8);
      ctx.lineTo(sx + 7, hz.y - 10);
      ctx.lineTo(sx + 14, hz.y + 8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#c3ccd4';
    for (let i = 0; i < n; i++) {
      const sx = hz.x + i * 14;
      ctx.beginPath();
      ctx.moveTo(sx + 2, hz.y + 8);
      ctx.lineTo(sx + 7, hz.y - 8);
      ctx.lineTo(sx + 7, hz.y + 8);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawRocks(ctx: CanvasRenderingContext2D, hz: Hazard): void {
    // warning shadows
    if (hz.warnTimer > 0) {
      const ground = hz.level.groundTopAt(hz.warnX) || 460;
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(hz.warnTimer * 30);
      ctx.fillStyle = 'rgba(60,40,30,0.55)';
      ctx.beginPath();
      ctx.ellipse(hz.warnX, ground + 4, 18, 5, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ff5c5c';
      ctx.font = '800 20px ' + FONT_STACK;
      ctx.textAlign = 'center';
      ctx.fillText('!', hz.warnX, ground - 26);
      ctx.globalAlpha = 1;
    }
    // falling rocks
    for (const r of hz.rocks) {
      ctx.fillStyle = '#8d7b6a';
      ctx.beginPath();
      ctx.moveTo(r.x - r.r, r.y);
      ctx.lineTo(r.x - r.r * 0.4, r.y - r.r);
      ctx.lineTo(r.x + r.r * 0.6, r.y - r.r * 0.9);
      ctx.lineTo(r.x + r.r, r.y);
      ctx.lineTo(r.x + r.r * 0.5, r.y + r.r * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#a8977f';
      ctx.beginPath();
      ctx.arc(r.x - r.r * 0.2, r.y - r.r * 0.3, r.r * 0.3, 0, TAU);
      ctx.fill();
    }
  }

  drawHUD(ctx: CanvasRenderingContext2D): void {
    // Panel
    ctx.fillStyle = 'rgba(20,30,45,0.55)';
    this.roundRect(ctx, 10, 10, 300, 62, 12);
    ctx.fill();
    // Hearts
    for (let i = 0; i < CFG.player.maxHearts; i++) {
      const hx = 34 + i * 34, hy = 32;
      const full = i < (this.player ? this.player.hearts : CFG.player.maxHearts);
      ctx.save();
      ctx.translate(hx, hy);
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.bezierCurveTo(-12, -8, -10, -18, 0, -10);
      ctx.bezierCurveTo(10, -18, 12, -8, 0, 4);
      ctx.closePath();
      if (full) {
        ctx.fillStyle = '#ff5c7a';
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(-4, -9, 2.4, 0, TAU);
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    }
    // Crystals
    ctx.save();
    ctx.translate(140, 32);
    ctx.fillStyle = '#ffb84d';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, -2);
    ctx.lineTo(4, 8);
    ctx.lineTo(-4, 8);
    ctx.lineTo(-6, -2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.font = '800 17px ' + FONT_STACK;
    ctx.textAlign = 'left';
    ctx.fillText('× ' + (this.crystalsGot || 0) + '/' + (this.level ? this.level.totalCrystals : 0), 154, 38);
    // Score & time (right)
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(20,30,45,0.55)';
    this.roundRect(ctx, VW - 190, 10, 180, 62, 12);
    ctx.fill();
    ctx.fillStyle = '#ffe28a';
    ctx.font = '800 19px ' + FONT_STACK;
    ctx.fillText('Score ' + this.score, VW - 24, 34);
    ctx.fillStyle = '#cfe8ff';
    ctx.font = '700 15px ' + FONT_STACK;
    ctx.fillText('Time ' + fmtTime(this.elapsed), VW - 24, 58);
    // Status message
    if (this.status.t > 0 && this.state === 'playing') {
      ctx.globalAlpha = clamp(this.status.t / 0.5, 0, 1);
      ctx.textAlign = 'center';
      ctx.font = '800 22px ' + FONT_STACK;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20,30,45,0.7)';
      ctx.strokeText(this.status.msg, VW / 2, 108);
      ctx.fillStyle = this.status.color;
      ctx.fillText(this.status.msg, VW / 2, 108);
      ctx.globalAlpha = 1;
    }
  }

  drawPanel(ctx: CanvasRenderingContext2D, title: string, titleColor?: string): { px: number; py: number; pw: number; ph: number } {
    ctx.fillStyle = 'rgba(15,22,35,0.72)';
    ctx.fillRect(0, 0, VW, VH);
    const pw = 560, ph = 380;
    const px = (VW - pw) / 2, py = (VH - ph) / 2;
    ctx.fillStyle = 'rgba(35,48,70,0.96)';
    this.roundRect(ctx, px, py, pw, ph, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,226,138,0.5)';
    ctx.lineWidth = 3;
    this.roundRect(ctx, px, py, pw, ph, 18);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = '800 40px ' + FONT_STACK;
    ctx.fillStyle = titleColor || '#ffe28a';
    ctx.fillText(title, VW / 2, py + 62);
    return { px, py, pw, ph };
  }

  drawUIButton(ctx: CanvasRenderingContext2D, b: UIButton): void {
    const hover = this.uiHover === b;
    ctx.fillStyle = b.color || '#ffd257';
    this.roundRect(ctx, b.x, b.y, b.w, b.h, 12);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    this.roundRect(ctx, b.x, b.y, b.w, 10, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(30,20,10,0.9)';
    ctx.font = '800 19px ' + FONT_STACK;
    ctx.textAlign = 'center';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 7);
    if (hover) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      this.roundRect(ctx, b.x - 2, b.y - 2, b.w + 4, b.h + 4, 14);
      ctx.stroke();
    }
  }

  drawPause(ctx: CanvasRenderingContext2D): void {
    const { py, ph } = this.drawPanel(ctx, 'Paused', '#9ff0ff');
    ctx.fillStyle = '#dce8f5';
    ctx.font = '700 16px ' + FONT_STACK;
    ctx.textAlign = 'center';
    ctx.fillText('P / Esc — resume      R — restart level      M — mute', VW / 2, py + ph - 70);
    this.uiButtons = [
      { x: VW / 2 - 170, y: py + 110, w: 160, h: 52, label: 'Resume', action: () => this.resume() },
      { x: VW / 2 + 10, y: py + 110, w: 160, h: 52, label: 'Restart', action: () => this.startGame() },
    ];
    for (const b of this.uiButtons) this.drawUIButton(ctx, b);
  }

  drawGameOver(ctx: CanvasRenderingContext2D): void {
    const { py } = this.drawPanel(ctx, 'Game Over', '#ff8a5c');
    ctx.fillStyle = '#dce8f5';
    ctx.font = '700 17px ' + FONT_STACK;
    ctx.textAlign = 'center';
    ctx.fillText('Rex tumbled... but the valley is kind.', VW / 2, py + 100);
    ctx.fillText('Score ' + this.score + '    Crystals ' + this.crystalsGot + '    Time ' + fmtTime(this.elapsed), VW / 2, py + 128);
    this.uiButtons = [
      {
        x: VW / 2 - 220, y: py + 160, w: 200, h: 54, label: 'Try Again',
        action: () => {
          this.respawn();
          this.state = 'playing';
          this.addStatus('From the checkpoint!', '#9ff0ff');
        },
      },
      { x: VW / 2 + 20, y: py + 160, w: 200, h: 54, label: 'Restart Level', action: () => this.startGame() },
    ];
    for (const b of this.uiButtons) this.drawUIButton(ctx, b);
    ctx.fillStyle = 'rgba(220,232,245,0.7)';
    ctx.font = '600 14px ' + FONT_STACK;
    ctx.fillText('Enter — try again      R — restart level', VW / 2, py + 260);
  }

  drawVictory(ctx: CanvasRenderingContext2D): void {
    const r = this.results!;
    const { py } = this.drawPanel(ctx, 'You Made It Home!', '#9ff0a8');
    ctx.textAlign = 'center';
    ctx.font = '700 17px ' + FONT_STACK;
    ctx.fillStyle = '#dce8f5';
    const lines: [string, string][] = [
      ['Crystals', r.crystals + ' / ' + r.totalCrystals + (r.crystals === r.totalCrystals ? '  ✦ all!' : '')],
      ['Stomps', String(r.stomps)],
      ['Time', fmtTime(r.time) + (r.isBestTime ? '  (best!)' : '   best ' + (this.best.time === null ? '—' : fmtTime(this.best.time)))],
      ['Health bonus', '+' + r.heartBonus],
      ['Time bonus', '+' + r.timeBonus],
    ];
    lines.forEach((ln, i) => {
      const y = py + 105 + i * 26;
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(220,232,245,0.8)';
      ctx.fillText(ln[0], VW / 2 - 190, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffe28a';
      ctx.fillText(ln[1], VW / 2 + 190, y);
    });
    ctx.textAlign = 'center';
    ctx.font = '800 24px ' + FONT_STACK;
    ctx.fillStyle = '#fff';
    ctx.fillText('TOTAL  ' + r.total + (r.isBestScore ? '  ★ New Best!' : '   best ' + this.best.score), VW / 2, py + 250);
    this.uiButtons = [
      { x: VW / 2 - 220, y: py + 275, w: 200, h: 54, label: 'Play Again', action: () => this.startGame() },
      { x: VW / 2 + 20, y: py + 275, w: 200, h: 54, label: 'Menu', action: () => this.toMenu() },
    ];
    for (const b of this.uiButtons) this.drawUIButton(ctx, b);
    if (this.victoryT < 1.2) {
      ctx.fillStyle = 'rgba(255,255,255,' + clamp(1.2 - this.victoryT, 0, 1) * 0.5 + ')';
      ctx.fillRect(0, 0, VW, VH);
    }
  }

  renderMenu(ctx: CanvasRenderingContext2D): void {
    // Scenic backdrop: slow auto-pan through the valley
    const camX = (Math.sin(this.time * 0.06) * 0.5 + 0.5) * 900;
    this.bg.draw(ctx, camX, this.time);
    // Draw a slice of the level floor for grounding
    ctx.fillStyle = '#8a5f3c';
    ctx.fillRect(0, 460, VW, 80);
    ctx.fillStyle = '#5da854';
    ctx.fillRect(0, 460, VW, 12);
    ctx.fillStyle = '#6fbe62';
    ctx.fillRect(0, 460, VW, 5);
    // Decor
    drawDecor(ctx, { type: 'tree', x: 130, s: 1.1 }, this.time, 460);
    drawDecor(ctx, { type: 'tree', x: 850, s: 1.25 }, this.time, 460);
    drawDecor(ctx, { type: 'flower', x: 250, color: '#ff8fa3' }, this.time, 460);
    drawDecor(ctx, { type: 'flower', x: 720, color: '#c9a0ff' }, this.time, 460);
    drawDecor(ctx, { type: 'crystalrock', x: 480, s: 1.2 }, this.time, 460);
    drawDecor(ctx, { type: 'bush', x: 960, s: 1 }, this.time, 460);
    // Rex idle
    const fakeP = {
      x: VW / 2 - 17,
      y: 460 - 46,
      w: 34,
      h: 46,
      facing: 1,
      state: 'idle' as const,
      runPhase: 0,
      vy: 0,
      squashX: 1,
      squashY: 1,
      invulnT: 0,
      dead: false,
      rot: 0,
    };
    Sprite.drawRex(ctx, fakeP, this.time);
    // Title with bounce
    ctx.textAlign = 'center';
    const bounce = Math.sin(this.time * 2) * 4;
    ctx.font = '800 64px ' + FONT_STACK;
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(30,50,30,0.85)';
    ctx.strokeText('TINY REX', VW / 2, 150 + bounce);
    const tg = ctx.createLinearGradient(0, 90, 0, 160);
    tg.addColorStop(0, '#c8f0a0');
    tg.addColorStop(1, '#5da854');
    ctx.fillStyle = tg;
    ctx.fillText('TINY REX', VW / 2, 150 + bounce);
    ctx.font = '800 30px ' + FONT_STACK;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(60,40,20,0.8)';
    ctx.strokeText('Crystal Valley', VW / 2, 192 + bounce * 0.5);
    ctx.fillStyle = '#ffe28a';
    ctx.fillText('Crystal Valley', VW / 2, 192 + bounce * 0.5);
    // Start prompt
    const pulse = 0.6 + 0.4 * Math.sin(this.time * 3.4);
    ctx.globalAlpha = pulse;
    ctx.font = '800 24px ' + FONT_STACK;
    ctx.fillStyle = '#fff';
    ctx.fillText('Press SPACE or Tap to Start', VW / 2, 512);
    ctx.globalAlpha = 1;
    // Best records
    ctx.font = '700 15px ' + FONT_STACK;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(
      'Best Score ' + (this.best.score || '—') + '      Best Time ' + (this.best.time === null ? '—' : fmtTime(this.best.time)),
      VW / 2,
      534,
    );
    // Controls
    ctx.fillStyle = 'rgba(20,30,45,0.6)';
    this.roundRect(ctx, 34, 236, 260, 160, 12);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.font = '800 16px ' + FONT_STACK;
    ctx.fillText('Controls', 54, 262);
    ctx.font = '600 13.5px ' + FONT_STACK;
    ctx.fillStyle = '#dce8f5';
    const rows = [
      'Move — A / D or ← / →',
      'Jump — W / ↑ / Space',
      'Pause — P or Esc',
      'Restart — R',
      'Mute — M      Reduced motion — V',
      'Debug overlay — F2',
    ];
    rows.forEach((r, i) => ctx.fillText(r, 54, 286 + i * 22));
    // Right side info panel
    ctx.fillStyle = 'rgba(20,30,45,0.6)';
    this.roundRect(ctx, VW - 300, 236, 260, 160, 12);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '800 16px ' + FONT_STACK;
    ctx.fillText('Your Quest', VW - 280, 262);
    ctx.font = '600 13.5px ' + FONT_STACK;
    ctx.fillStyle = '#dce8f5';
    const quest = [
      '• Reach the glowing nest',
      '• Collect amber crystals',
      '• Stomp beetles, trikes & pteros',
      '• Watch for lava, spikes & rocks',
      '• Touch flags to save progress',
    ];
    quest.forEach((r, i) => ctx.fillText(r, VW - 280, 286 + i * 22));
    // Mute / reduced-motion toggles (drawn as buttons)
    this.uiButtons = [
      { x: VW / 2 - 100, y: 440, w: 200, h: 50, label: 'Start Game', action: () => this.startGame() },
      {
        x: 640, y: 452, w: 128, h: 40, label: (this.audio.muted ? 'Sound: Off' : 'Sound: On') + '  [M]',
        color: '#8fa8ba',
        action: () => {
          this.audio.setMuted(!this.audio.muted);
          this.audio.play('ui');
          this.updateMuteButton();
        },
      },
      {
        x: 778, y: 452, w: 150, h: 40, label: (this.reducedMotion ? 'Calm: On' : 'Calm: Off') + '  [V]',
        color: '#8fa8ba',
        action: () => {
          this.reducedMotion = !this.reducedMotion;
          Store.set('tinyrex_reduced', this.reducedMotion);
          this.audio.play('ui');
        },
      },
    ];
    for (const b of this.uiButtons) this.drawUIButton(ctx, b);
  }

  drawDebug(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(10,20,15,0.85)';
    this.roundRect(ctx, VW - 250, VH - 118, 240, 108, 8);
    ctx.fill();
    ctx.fillStyle = '#9ff0a8';
    ctx.font = '600 12px monospace';
    ctx.textAlign = 'left';
    const p = this.player;
    const lines = [
      'FPS ' + this.fps.toFixed(0),
      'x ' + (p ? p.x.toFixed(1) : '-') + '  y ' + (p ? p.y.toFixed(1) : '-'),
      'vx ' + (p ? p.vx.toFixed(0) : '-') + '  vy ' + (p ? p.vy.toFixed(0) : '-'),
      'grounded ' + (p ? p.grounded : '-') + '  hearts ' + (p ? p.hearts : '-'),
      'state ' + this.state,
    ];
    lines.forEach((l, i) => ctx.fillText(l, VW - 240, VH - 100 + i * 18));
    // collision boxes
    ctx.strokeStyle = '#0f0';
    ctx.lineWidth = 1;
    for (const pl of this.level!.platforms) {
      if (!pl.active) continue;
      if (pl.x + pl.w < this.camera.x - 40 || pl.x > this.camera.x + VW + 40) continue;
      ctx.strokeRect(pl.x, pl.y, pl.w, pl.h);
    }
    if (p) {
      ctx.strokeStyle = '#ff0';
      ctx.strokeRect(p.x, p.y, p.w, p.h);
    }
    for (const e of this.level!.enemies) {
      if (e.dead) continue;
      ctx.strokeStyle = '#f0f';
      ctx.strokeRect(e.x, e.y, e.w, e.h);
    }
    for (const hz of this.level!.hazards) {
      if (hz.type === 'spikes') {
        ctx.strokeStyle = '#f80';
        ctx.strokeRect(hz.x, hz.y - 8, hz.w, 16);
      }
    }
  }

  updateMuteButton(): void {
    const el = document.getElementById('muteBtn');
    if (el) el.textContent = this.audio.muted ? '🔇' : '🔊';
  }

  updatePauseButton(): void {
    const el = document.getElementById('pauseBtn');
    if (el) el.textContent = this.state === 'paused' ? '▶' : '⏸';
  }

  /* ---------- canvas sizing (fixed logical resolution, DPR-aware) ---------- */
  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.canvas.width = VW * dpr;
    this.canvas.height = VH * dpr;
    // Fit into the window with letterboxing, preserving 16:9
    const shell = this.canvas.parentElement;
    const availW = shell ? shell.clientWidth : VW;
    const availH = shell ? shell.clientHeight : VH;
    const scale = Math.min(availW / VW, availH / VH);
    this.canvas.style.width = VW * scale + 'px';
    this.canvas.style.height = VH * scale + 'px';
  }

  /* ---------- pointer (canvas UI + touch-to-start) ---------- */
  bindPointer(): void {
    const toLogical = (e: PointerEvent): { x: number; y: number } => {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (VW / Math.max(1, r.width)),
        y: (e.clientY - r.top) * (VH / Math.max(1, r.height)),
      };
    };
    this.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      this.audio.unlock();
      const p = toLogical(e);
      // Menu: tap anywhere (except buttons) starts
      if (this.state === 'menu') {
        for (const b of this.uiButtons) {
          if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
            b.action();
            return;
          }
        }
        this.startGame();
        return;
      }
      if (this.state === 'paused' || this.state === 'gameover' || this.state === 'victory') {
        for (const b of this.uiButtons) {
          if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
            b.action();
            return;
          }
        }
        if (this.state === 'victory' && this.victoryT < 1.2) return;
      }
    });
    this.canvas.addEventListener('pointermove', (e: PointerEvent) => {
      const p = toLogical(e);
      this.uiHover = null;
      for (const b of this.uiButtons) {
        if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
          this.uiHover = b;
          break;
        }
      }
      this.canvas.style.cursor = this.uiHover ? 'pointer' : 'default';
    });
  }

  /* ---------- main loop: fixed timestep update, rAF render ---------- */
  start(): void {
    this.buildLevel();
    let last = performance.now();
    let acc = 0;
    const loop = (now: number): void => {
      requestAnimationFrame(loop);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.25) dt = 0.25; // tab-switch clamp
      // FPS meter
      this.fpsT += dt;
      this.fpsN += 1;
      if (this.fpsT >= 0.5) {
        this.fps = this.fpsN / this.fpsT;
        this.fpsT = 0;
        this.fpsN = 0;
      }
      const step = CFG.fixedDt;
      acc += dt;
      let n = 0;
      while (acc >= step && n < 8) {
        this.update(step);
        acc -= step;
        n += 1;
      }
      this.render();
    };
    requestAnimationFrame(loop);
  }
}
