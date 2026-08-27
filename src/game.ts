import { CFG, VW, VH, TAU, FONT_STACK, DIFFICULTIES, STARS } from './config';
import type { Difficulty } from './config';
import { clamp, easeOutBack, fmtTime } from './util';
import { Store, getStats, getBest, getBestStars, getDailyBest, getDailyStars, getGhostEnabled, setGhostEnabled, getGhostTrack, saveGhostTrack, getFoundFossils, findFossil, getFoundNotes, findNote, getSkinId, setSkinId } from './store';
import type { GameStats } from './store';
import { AudioManager } from './audio';
import { Input } from './input';
import type { GameKey } from './input';
import { Background } from './background';
import { Camera } from './camera';
import { Level } from './level';
import { Player } from './player';
import { Particle, FloatingText } from './particles';
import type { ParticleType } from './particles';
import { LEVELS } from './level-data';
import type { LevelInfo } from './level-data';
import { generateDailyLevel, dailySeed, dailyLabel, rexCode } from './daily';
import { GhostRecorder, GhostPlayer } from './ghost';
import { drawDecor } from './decor';
import { Sprite, SKINS, skinUnlocked } from './sprite';
import { adaptiveFlags } from './adaptive';
import { Weather } from './weather';
import { NOTES, totalNotes as countNotes } from './lore';
import { drawPowerUpIcon, POWERUP_COLORS } from './powerup';
import type { PowerUpType } from './powerup';
import type { GameCtx } from './ctx';
import type { Checkpoint } from './checkpoint';
import type { Platform } from './platform';
import type { Hazard } from './hazard';
import { CheatSystem } from './cheats';
import type { CheatId } from './cheats';
import type { Door } from './door';

export type GameState = 'menu' | 'playing' | 'paused' | 'dying' | 'gameover' | 'victory';

interface UIButton {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  color?: string;
  /** Hit-testable but drawn by custom code (level cards, difficulty pills). */
  card?: boolean;
  action: () => void;
}

interface RunResults {
  crystals: number;
  totalCrystals: number;
  stomps: number;
  /** Heart pickups collected this run. */
  heartsGot: number;
  time: number;
  timeBonus: number;
  heartBonus: number;
  total: number;
  isBestScore: boolean;
  isBestTime: boolean;
  stars: number;
  isBestStars: boolean;
}

/** Victory reveal timeline (seconds of victoryT). */
const VICTORY_PANEL_T = 1.2; // celebration title ends, panel slides up
const VICTORY_STAR_T = 1.8; // first star pops
const VICTORY_STAR_STEP = 0.35;
const VICTORY_BUTTON_T = 2.9; // buttons fade in

/** Rotating tips shown on the pause screen. */
const PAUSE_TIPS = [
  'Stomp an enemy, then hold jump to bounce higher.',
  'Chain crystals within 2s to grow a combo bonus.',
  'Hearts mend one wound — at full health they pay points.',
  'Touch the flags: checkpoints save your progress.',
  'The golden crystal is worth 5× the amber ones.',
  'A falling rock telegraphs its landing with a shadow.',
  'Calm mode (V) tames particles for a mellow run.',
  'Lava flicks you clear — jump up out of it.',
  'Shatter all 3 orbs to stun the Magma King — then stomp!',
  'The Magma King is only vulnerable after his charge slams.',
];

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
  readonly weather = new Weather();
  level: Level | null = null;
  player: Player | null = null;
  state: GameState = 'menu'; // menu | playing | paused | dying | gameover | victory
  time = 0; // game (unpaused) clock
  elapsed = 0; // run timer
  score = 0;
  crystalsGot = 0;
  /** Stomp count for the current run (GameCtx). */
  stomps = 0;
  /** Crystal combo: consecutive pickups within the combo window. */
  combo = 0;
  /** Game time of the last crystal collected (-1 = none yet). */
  lastCrystalT = -1;
  /** Heart pickups collected this run. */
  heartsGot = 0;
  /** Star-secure toasts already shown this run. */
  private star80Shown = false;
  private star100Shown = false;
  deaths = 0;
  /** Hearts lost this run (god mode and bubble saves don't count). 0 = flawless. */
  hits = 0;
  private lastUrgent = false;
  private lastShimmer = false;
  particles: Particle[] = [];
  texts: FloatingText[] = [];
  status = { msg: '', color: '#fff', t: 0 };
  debug = false;
  reducedMotion = Store.get('tinyrex_reduced', false);
  fps = 60;
  fpsT = 0;
  fpsN = 0;
  victoryT = 0;
  /** Victory stars already chimed (matches the staggered star pops). */
  starChime = 0;
  results: RunResults | null = null;
  /** Cheat: Rex is invulnerable while on. */
  godMode = false;
  /** Cheat: rainbow Rex skin (persists across runs). */
  rainbow = false;
  /** Cosmetic skin id (see SKINS); Mint unlocks at 3 fossils. */
  skin: string = getSkinId();
  /** True once the Magma King falls this run (Molten Nest victory flourish). */
  bossSlain = false;
  /** Ghost race: replay the stored best run alongside the player. */
  ghostOn: boolean = getGhostEnabled();
  /** Fossil ids discovered so far (persistent meta-progress). */
  fossilsFound: string[] = getFoundFossils();
  /** Field-note ids discovered so far (persistent meta-progress). */
  notesFound: string[] = getFoundNotes();
  /** Menu sub-screen: the main menu or the field-notes codex. */
  menuScreen: 'main' | 'codex' = 'main';
  private ghost: GhostPlayer | null = null;
  private ghostRec: GhostRecorder | null = null;
  /** Cheat queue: apply max hearts once a player exists. */
  private maxHeartsCheat = false;
  private readonly cheats = new CheatSystem();
  /** Selected level index (persisted). */
  levelIdx: number = clamp(Store.get('tinyrex_level', 0), 0, LEVELS.length - 1);
  /** Daily Rex is selected instead of a hand-built level. */
  daily = false;
  /** Cached generated daily level (regenerated when the date seed changes). */
  private dailyInfo: LevelInfo | null = null;
  private dailyInfoSeed = 0;
  /** Active difficulty (persisted). */
  difficulty: Difficulty = Store.get<Difficulty>('tinyrex_difficulty', 'normal');
  /** Best score/time for the selected level. */
  best = { score: 0, time: null as number | null };
  /** Best star rating for the selected level (0–3). */
  bestStars = 0;
  /** Lifetime play statistics (refreshed from storage on menu entry). */
  stats: GameStats = getStats();
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
    this.weather.onGust = () => this.audio.play('wind');
    this.bindPointer();
    this.resize();
    this.loadRecords();
    this.bg.theme = this.currentInfo().theme;
    window.addEventListener('resize', () => this.resize());
  }

  /** Max hearts for the active difficulty. */
  get maxHearts(): number {
    return DIFFICULTIES[this.difficulty].hearts;
  }

  /** The LevelInfo for the active selection (Daily Rex or a hand-built level). */
  currentInfo(): LevelInfo {
    if (this.daily) {
      const seed = dailySeed();
      if (!this.dailyInfo || this.dailyInfoSeed !== seed) {
        this.dailyInfo = generateDailyLevel(seed);
        this.dailyInfoSeed = seed;
      }
      return this.dailyInfo;
    }
    return LEVELS[this.levelIdx];
  }

  /** (Re)load records + lifetime stats from storage for the active selection. */
  loadRecords(): void {
    if (this.daily) {
      this.best = getDailyBest();
      this.bestStars = getDailyStars();
    } else {
      this.best = getBest(this.levelIdx);
      this.bestStars = getBestStars(this.levelIdx);
    }
    this.stats = getStats();
  }

  /* ---------- level & difficulty selection ---------- */
  cycleLevel(dir: number): void {
    const n = LEVELS.length;
    this.daily = false;
    this.levelIdx = (this.levelIdx + dir + n) % n;
    Store.set('tinyrex_level', this.levelIdx);
    this.loadRecords();
    this.bg.theme = LEVELS[this.levelIdx].theme;
    this.audio.play('ui');
  }

  selectLevel(idx: number): void {
    if (idx < 0 || idx >= LEVELS.length) return;
    this.daily = false;
    if (idx === this.levelIdx) {
      this.loadRecords();
      this.bg.theme = LEVELS[idx].theme;
      return;
    }
    this.levelIdx = idx;
    Store.set('tinyrex_level', idx);
    this.loadRecords();
    this.bg.theme = LEVELS[idx].theme;
    this.audio.play('ui');
  }

  /** Select today's Daily Rex challenge. */
  selectDaily(): void {
    if (this.daily) return;
    this.daily = true;
    this.loadRecords();
    this.bg.theme = this.currentInfo().theme;
    this.audio.play('ui');
  }

  cycleDifficulty(dir: number): void {
    const order: Difficulty[] = ['easy', 'normal', 'hard'];
    const i = order.indexOf(this.difficulty);
    this.difficulty = order[(i + dir + order.length) % order.length];
    Store.set('tinyrex_difficulty', this.difficulty);
    this.audio.play('ui');
  }

  selectDifficulty(d: Difficulty): void {
    if (d === this.difficulty) return;
    this.difficulty = d;
    Store.set('tinyrex_difficulty', d);
    this.audio.play('ui');
  }

  /** Toggle the ghost race (menu button or G key). */
  toggleGhost(): void {
    this.ghostOn = !this.ghostOn;
    setGhostEnabled(this.ghostOn);
    this.audio.play('ui');
  }

  /** Choose a cosmetic skin (Mint needs 3 fossils). */
  selectSkin(id: string): void {
    if (!skinUnlocked(id, this.fossilsFound)) {
      this.audio.play('ui');
      return;
    }
    if (id === this.skin) return;
    this.skin = id;
    setSkinId(id);
    if (this.player) this.player.skin = id;
    if (this.ghost) this.ghost.skin = id;
    this.audio.play('ui');
  }

  /** Cycle skins with [ / ] on the menu; locked skins are skipped. */
  cycleSkin(dir: 1 | -1): void {
    let idx = SKINS.findIndex((s) => s.id === this.skin);
    if (idx < 0) idx = 0;
    for (let i = 1; i <= SKINS.length; i++) {
      const cand = SKINS[(((idx + dir * i) % SKINS.length) + SKINS.length) % SKINS.length];
      if (cand.id !== this.skin && skinUnlocked(cand.id, this.fossilsFound)) {
        this.selectSkin(cand.id);
        return;
      }
    }
  }

  /** Advance to the next level and start a fresh run. */
  nextLevel(): void {
    this.levelIdx = (this.levelIdx + 1) % LEVELS.length;
    Store.set('tinyrex_level', this.levelIdx);
    this.loadRecords();
    this.startGame();
  }

  /* ---------- lifecycle ---------- */
  buildLevel(): void {
    const info = this.currentInfo();
    // Daily levels have no fossils; the sentinel keeps fossil ids stable.
    this.level = new Level(info.def, this, DIFFICULTIES[this.difficulty].enemySpeed, this.daily ? -1 : this.levelIdx);
    this.bg.theme = info.theme;
    this.weather.reducedMotion = this.reducedMotion;
    this.weather.apply(info.theme, this.level!.hazards, this.level!.start.x);
  }

  /** Total hidden fossils across the hand-built levels. */
  totalFossils(): number {
    return LEVELS.reduce((n, l) => n + (l.def.fossils?.length ?? 0), 0);
  }

  /** Total field notes across the hand-built levels. */
  totalNotes(): number {
    return countNotes();
  }

  startGame(): void {
    this.buildLevel();
    this.player = new Player(this.level!.start.x, this.level!.start.y, this);
    this.player.maxHearts = this.maxHearts;
    this.player.hearts = this.maxHearts;
    this.player.rainbow = this.rainbow;
    this.player.skin = this.skin;
    if (this.maxHeartsCheat) {
      this.maxHeartsCheat = false;
      this.player.maxHearts = Game.MAX_HEARTS_CAP;
      this.player.hearts = this.player.maxHearts;
    }
    // Fresh run: clear any stale jump press (e.g. Space that started the game).
    this.input.jumpBufferT = -1;
    this.score = 0;
    this.crystalsGot = 0;
    this.stomps = 0;
    this.combo = 0;
    this.lastCrystalT = -1;
    this.heartsGot = 0;
    this.star80Shown = false;
    this.star100Shown = false;
    this.bossSlain = false;
    this.deaths = 0;
    this.hits = 0;
    this.lastUrgent = false;
    this.lastShimmer = false;
    this.elapsed = 0;
    this.time = 0;
    this.particles = [];
    this.texts = [];
    this.checkpoint = null;
    this.results = null;
    this.victoryT = 0;
    // Ghost race: record this run and replay the stored best alongside it
    this.ghostRec = new GhostRecorder();
    this.ghost = null;
    if (this.ghostOn) {
      const track = getGhostTrack(this.daily ? -1 : this.levelIdx, this.daily ? dailySeed() : 0);
      if (track) {
        this.ghost = new GhostPlayer(track);
        this.ghost.skin = this.skin;
      }
    }
    this.camera.x = 0;
    this.camera.shake = 0;
    this.state = 'playing';
    this.updatePauseButton();
    this.setCheckpointAt(0);
    this.addStatus(this.daily ? 'Daily challenge — beat your best!' : 'Find your way to the glowing nest!', '#fff');
    this.audio.unlock();
    this.audio.startMusic(this.currentInfo().theme);
    // Lifetime stats
    const s = getStats();
    s.runs += 1;
    s.firstPlayed = s.firstPlayed ?? Date.now();
    Store.set('tinyrex_stats', s);
    this.stats = s;
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
    // Cheat codes: every press in the menu or in play feeds the detector.
    if (this.state === 'menu' || this.state === 'playing') {
      const fired = this.cheats.press(k, performance.now());
      if (fired) this.applyCheat(fired);
    }
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
    if (k === 'ghost') {
      this.toggleGhost();
      return;
    }
    if ((k === 'skinPrev' || k === 'skinNext') && this.state === 'menu') {
      this.cycleSkin(k === 'skinNext' ? 1 : -1);
      return;
    }
    if (k === 'codex' && this.state === 'menu') {
      this.menuScreen = this.menuScreen === 'codex' ? 'main' : 'codex';
      this.audio.play('ui');
      return;
    }
    if (k === 'debug') {
      this.debug = !this.debug;
      return;
    }
    switch (this.state) {
      case 'menu':
        if (k === 'left') this.cycleLevel(-1);
        else if (k === 'right') this.cycleLevel(1);
        else if (k === 'up') this.cycleDifficulty(-1);
        else if (k === 'down') this.cycleDifficulty(1);
        else if (k === 'primary') this.startGame();
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
        if (k === 'primary' && this.victoryT > VICTORY_PANEL_T) this.startGame();
        else if (k === 'restart') this.startGame();
        break;
    }
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.updatePauseButton();
    this.audio.stopMusic();
    this.audio.play('pause');
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.updatePauseButton();
    this.audio.startMusic(this.currentInfo().theme);
    this.audio.play('ui');
  }

  addStatus(msg: string, color?: string): void {
    this.status = { msg, color: color || '#fff', t: 2.4 };
  }

  /** Apply a matched cheat code (see CHEATS in src/cheats.ts). */
  private applyCheat(id: CheatId): void {
    this.audio.play('cheat');
    const p = this.player;
    if (id === 'rainbow') {
      this.rainbow = !this.rainbow;
      if (p) p.rainbow = this.rainbow;
      if (this.state === 'playing') this.addStatus(this.rainbow ? 'Rainbow Rex, on!' : 'Rainbow Rex, off', '#ff9ff0');
    } else if (id === 'god') {
      this.godMode = !this.godMode;
      if (this.state === 'playing') this.addStatus(this.godMode ? 'God mode, on!' : 'God mode, off', '#8fe3ff');
      if (p) this.burst(p.x + p.w / 2, p.y + p.h / 2, 16, ['#8fe3ff', '#fff'], 'dot', 160);
    } else if (id === 'maxhearts') {
      if (p) {
        p.maxHearts = Game.MAX_HEARTS_CAP;
        p.hearts = p.maxHearts;
        this.burst(p.x + p.w / 2, p.y + p.h / 2, 16, ['#ff8fa3', '#fff'], 'dot', 160);
      } else {
        this.maxHeartsCheat = true; // applies when the next run starts
      }
      if (this.state === 'playing') this.addStatus('Max hearts!', '#ff8fa3');
    } else if (id === 'surge') {
      if (this.state === 'playing' && p) {
        this.score += 1000;
        this.texts.push(new FloatingText(p.x + p.w / 2, p.y - 18, '+1000', '#8fe3ff'));
        this.addStatus('Score surge +1000!', '#8fe3ff');
      }
    }
  }

  addShake(m: number): void {
    this.camera.addShake(m);
  }

  addScore(v: number, x: number, y: number): void {
    this.score += v;
    this.texts.push(new FloatingText(x, y, '+' + v, '#ffe28a'));
  }

  /**
   * Crystal pickup (GameCtx): base value plus a combo bonus for chaining
   * pickups inside the window, with rising SFX pitch and a combo tag.
   */
  collectCrystal(x: number, y: number, bonus: boolean): void {
    const base = bonus ? CFG.score.bonusCrystal : CFG.score.crystal;
    if (this.lastCrystalT >= 0 && this.time - this.lastCrystalT <= CFG.combo.window) {
      this.combo = Math.min(this.combo + 1, CFG.combo.maxSteps);
    } else {
      this.combo = 1;
    }
    this.lastCrystalT = this.time;
    const total = base + (this.combo - 1) * CFG.combo.bonus;
    this.addScore(total, x, y - 14);
    this.burst(x, y, bonus ? 18 : 10, bonus ? ['#ffe28a', '#fff', '#ffb84d'] : ['#ffe9b0', '#fff'], 'dot', 150);
    if (bonus) this.addShake(2);
    this.audio.play(bonus ? 'bonus' : 'collect', this.combo > 1 ? { comboStep: this.combo } : undefined);
    if (this.combo > 1) this.texts.push(new FloatingText(x, y - 34, 'COMBO ×' + this.combo, '#8fe3ff'));
  }

  /** Max hearts the player can unlock mid-run (every 3 hearts collected). */
  static readonly MAX_HEARTS_CAP = 5;

  /** Heart pickup (GameCtx): restores a heart, or pays points at full health. */
  collectHeart(x: number, y: number): void {
    const p = this.player!;
    this.heartsGot += 1;
    if (this.heartsGot % 3 === 0 && p.maxHearts < Game.MAX_HEARTS_CAP) {
      p.maxHearts += 1;
      p.hearts = p.maxHearts;
      this.addStatus('Max hearts +1!', '#ff8fa3');
      this.audio.play('heart', { healed: true });
      this.burst(x, y, 16, ['#ff8fa3', '#ffd9e2', '#fff'], 'dot', 160);
      return;
    }
    if (p.hearts < p.maxHearts) {
      p.hearts += 1;
      this.addStatus('Heart restored!', '#ff8fa3');
      this.audio.play('heart', { healed: true });
      this.burst(x, y, 12, ['#ff8fa3', '#ffd9e2', '#fff'], 'dot', 140);
      const s = getStats();
      s.hearts += 1;
      Store.set('tinyrex_stats', s);
      this.stats = s;
    } else {
      this.addScore(CFG.score.heartFull, x, y - 14);
      this.addStatus('Full health +' + CFG.score.heartFull, '#ffe28a');
      this.audio.play('heart');
      this.burst(x, y, 10, ['#ff8fa3', '#ffd9e2'], 'dot', 130);
    }
  }

  /** Fossil pickup (GameCtx): persistent discovery + re-collectable score. */
  collectFossil(x: number, y: number, id: string): void {
    const first = !this.fossilsFound.includes(id);
    if (first) {
      findFossil(id);
      this.fossilsFound = getFoundFossils();
    }
    this.addScore(CFG.score.fossil, x, y - 14);
    this.audio.play('fossil');
    if (first) {
      this.addStatus('Fossil found! ' + this.fossilsFound.length + '/' + this.totalFossils(), '#e8dcc0');
      this.addShake(2);
      this.burst(x, y, 22, ['#f4ecd9', '#e8dcc0', '#cbb98f', '#fff'], 'dot', 170);
      this.texts.push(new FloatingText(x, y - 34, 'NEW FOSSIL!', '#f4ecd9'));
      if (this.fossilsFound.length === 3) {
        this.addStatus('Mint Rex unlocked! Pick it on the menu', '#63e0a8');
        this.audio.play('star');
      }
    } else {
      this.burst(x, y, 10, ['#f4ecd9', '#e8dcc0'], 'dot', 130);
    }
  }

  /** Field-note pickup (GameCtx): persistent discovery + re-collectable score. */
  collectNote(x: number, y: number, id: string): void {
    const first = !this.notesFound.includes(id);
    if (first) {
      findNote(id);
      this.notesFound = getFoundNotes();
    }
    this.addScore(CFG.score.fossil, x, y - 14);
    this.audio.play('note');
    if (first) {
      this.addStatus('Field note found! ' + this.notesFound.length + '/' + this.totalNotes(), '#cfe6ff');
      this.addShake(2);
      this.burst(x, y, 22, ['#fbf6ea', '#cfe6ff', '#e7dcc2', '#fff'], 'dot', 170);
      this.texts.push(new FloatingText(x, y - 34, 'NEW NOTE!', '#cfe6ff'));
    } else {
      this.burst(x, y, 10, ['#fbf6ea', '#cfe6ff'], 'dot', 130);
    }
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
        life: type === 'ember' ? 0.6 + Math.random() * 0.5 : 0.35 + Math.random() * 0.4,
        size: type === 'chunk' ? 5 : type === 'dust' ? 4 : type === 'ember' ? 2.6 : 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        grav: type === 'dust' ? 60 : type === 'chunk' ? 500 : type === 'ember' ? 340 : 260,
        type,
        rot: Math.random() * TAU,
        vrot: (Math.random() - 0.5) * 10,
      }));
    }
  }

  /** The player lost a heart: counts against a flawless run. */
  onPlayerHit(): void {
    this.hits += 1;
  }

  /**
   * Crossfade the adaptive music layers: drums tense up when hearts run low,
   * hazards loom ahead, or the boss is in the arena; the shimmer pad sparkles
   * over crystal-dense stretches. Called every frame while playing; the
   * audio manager only moves the gains when a flag actually changed.
   */
  private updateAdaptive(): void {
    const p = this.player!;
    const lvl = this.level!;
    const flags = adaptiveFlags({
      hearts: p.hearts,
      playerX: p.x,
      bossAlive: lvl.boss !== null && !lvl.boss.dead,
      hazards: lvl.hazards,
      crystals: lvl.crystals,
    });
    if (flags.urgent === this.lastUrgent && flags.shimmer === this.lastShimmer) return;
    this.lastUrgent = flags.urgent;
    this.lastShimmer = flags.shimmer;
    this.audio.setAdaptive(flags.urgent, flags.shimmer);
  }

  onPlayerDeath(): void {
    this.deaths += 1;
    this.hits += 1;
    const s = getStats();
    s.deaths += 1;
    Store.set('tinyrex_stats', s);
    this.stats = s;
    this.state = 'dying';
    this.dyingT = 0;
    this.audio.stopMusic();
  }

  onPlayerVictory(): void {
    this.state = 'victory';
    this.victoryT = 0;
    this.starChime = 0;
    this.uiButtons = []; // no menu buttons linger during the celebration
    this.audio.play('victory', { flawless: this.hits === 0 });
    this.audio.setAdaptive(false, false); // let the run's tension settle
    this.addShake(4);
    // Confetti from above the nest (molten palette when the boss fell)
    const palette = this.bossSlain
      ? ['#ffd257', '#ff6b35', '#ff9d3f', '#7ec8f2', '#fff']
      : ['#ffd257', '#7ec8f2', '#ff8fa3', '#9ff0a8', '#fff'];
    const confettiN = (this.reducedMotion ? 30 : 90) + (this.bossSlain ? 50 : 0);
    for (let i = 0; i < confettiN; i++) {
      const x = this.level!.goal.x - 120 + Math.random() * 240;
      this.particles.push(new Particle({
        x,
        y: -20 - Math.random() * 120,
        vx: (Math.random() - 0.5) * 60,
        vy: 60 + Math.random() * 120,
        life: 1.6 + Math.random() * 1.2,
        size: 5,
        color: palette[i % palette.length],
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
    // Star rating: finish = 1★, +1 for ≥2 hearts left, +1 for ≥80% crystals
    const need = Math.ceil(this.level!.totalCrystals * STARS.crystalPct);
    const stars =
      1 +
      (this.player!.hearts >= STARS.heartThreshold ? 1 : 0) +
      (this.crystalsGot >= need ? 1 : 0);
    const isBestStars = stars > this.bestStars;
    if (isBestStars) {
      this.bestStars = stars;
      Store.set(this.daily ? 'tinyrex_stars_daily' : 'tinyrex_stars_' + this.levelIdx, stars);
    }
    // Per-level records (merge best score & best time)
    const prev = this.daily ? getDailyBest() : getBest(this.levelIdx);
    const isBestScore = this.score > prev.score;
    const isBestTime = prev.time === null || this.elapsed < prev.time;
    const newBest = {
      score: Math.max(prev.score, this.score),
      time: isBestTime ? this.elapsed : prev.time,
    };
    if (isBestScore || isBestTime) {
      Store.set(this.daily ? 'tinyrex_best_daily' : 'tinyrex_best_' + this.levelIdx, newBest);
      this.best = newBest;
    }
    // Ghost race: keep this run's track when it sets a new best score
    const rec = this.ghostRec;
    this.ghostRec = null;
    if (rec && isBestScore) {
      const track = rec.finish(this.score, this.elapsed);
      if (track) {
        track.date = this.daily ? dailySeed() : -1;
        saveGhostTrack(this.daily ? -1 : this.levelIdx, track);
      }
    }
    // Lifetime stats
    const s = getStats();
    s.victories += 1;
    s.crystals += this.crystalsGot;
    Store.set('tinyrex_stats', s);
    this.stats = s;
    this.audio.stopMusic();
    this.results = {
      crystals: this.crystalsGot,
      totalCrystals: this.level!.totalCrystals,
      stomps: this.stomps,
      heartsGot: this.heartsGot,
      time: this.elapsed,
      timeBonus,
      heartBonus,
      total: this.score,
      isBestScore,
      isBestTime,
      stars,
      isBestStars,
    };
  }

  onBossDefeated(): void {
    if (this.bossSlain) return; // fired once per boss death
    this.bossSlain = true;
    const boss = this.level?.boss;
    const bx = boss ? boss.x + boss.w / 2 : VW / 2;
    const by = boss ? boss.y + boss.h / 2 : 240;
    this.addScore(CFG.score.boss, bx, by);
    this.addShake(10);
    // Big molten eruption from the boss
    for (let i = 0; i < (this.reducedMotion ? 24 : 60); i++) {
      const s = 120 + Math.random() * 320;
      this.burst(bx + (Math.random() - 0.5) * 100, by, 1, ['#ff6b35', '#ffd257', '#ff9d3f'], 'ember', s);
    }
    this.audio.play('boss');
    this.audio.stopMusic();
    this.addStatus('THE MAGMA KING FALLS! The nest is open.', '#ffd257');
    // Latch the nest gate open (Molten Nest only has a door).
    for (const d of this.level?.doors ?? []) d.latched = true;
  }

  update(dt: number): void {
    this.input.pollGamepad();
    this.audio.update(dt);
    if (this.state === 'playing') {
      this.time += dt;
      this.elapsed += dt;
      this.ghostRec?.sample(this.elapsed, this.player!.x, this.player!.y);
      this.ghost?.update(this.elapsed);
      this.level!.update(dt, this.time, this.player!);
      this.player!.update(dt, this.time, this.input, this.level!);
      this.weather.update(dt, this.player!);
      this.camera.update(dt, this.player!, this.level!.width, this);
      this.updateAdaptive();
      // track crystal count
      this.crystalsGot = this.level!.crystals.filter((c) => c.collected).length;
      // Combo expires once the window elapses without another pickup
      if (this.combo > 0 && this.time - this.lastCrystalT > CFG.combo.window) this.combo = 0;
      // Star-secure toasts (one-time, mid-run delight)
      const need = Math.ceil(this.level!.totalCrystals * STARS.crystalPct);
      if (!this.star80Shown && this.crystalsGot >= need) {
        this.star80Shown = true;
        this.addStatus('★ Star secured — 80% of the crystals!', '#ffd257');
      }
      if (!this.star100Shown && this.level!.totalCrystals > 0 && this.crystalsGot === this.level!.totalCrystals) {
        this.star100Shown = true;
        this.addStatus('✦ Perfect run — every crystal!', '#ffe28a');
      }
      if (this.player!.state === 'victory' && this.state === 'playing') {
        this.state = 'victory';
      }
    } else if (this.state === 'dying') {
      this.time += dt;
      this.dyingT += dt;
      this.level!.update(dt, this.time, this.player!);
      this.player!.update(dt, this.time, this.input, this.level!);
      this.weather.update(dt, this.player!);
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
      // Staggered star chimes, synced with the star pops in drawVictory
      if (this.results) {
        while (
          this.starChime < this.results.stars &&
          this.victoryT >= VICTORY_STAR_T + this.starChime * VICTORY_STAR_STEP
        ) {
          this.audio.play('star', { starIndex: this.starChime });
          this.starChime += 1;
        }
      }
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
    this.bg.calm = this.reducedMotion;
    ctx.save();
    // Crisp scaling: work in logical pixels
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!this.level) this.buildLevel();
    if (this.state === 'menu') {
      if (this.menuScreen === 'codex') this.renderCodex(ctx);
      else this.renderMenu(ctx);
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
    for (const h of this.level!.hearts) {
      if (!h.collected) h.draw(ctx, this.time);
    }
    for (const f of this.level!.fossils) {
      if (!f.collected) f.draw(ctx, this.time);
    }
    for (const n of this.level!.notes) {
      if (!n.collected) n.draw(ctx, this.time);
    }
    // Power-up capsules (enemy drops)
    for (const pw of this.level!.powerups) {
      if (pw.collected) continue;
      if (pw.x + 30 < camX - 40 || pw.x - 30 > camX + VW + 40) continue;
      pw.draw(ctx, this.time);
    }
    for (const e of this.level!.enemies) {
      if (e.dead) continue;
      if (e.x + e.w < camX - 60 || e.x > camX + VW + 60) continue;
      if (e.type === 'beetle') Sprite.drawBeetle(ctx, e);
      else if (e.type === 'trike') Sprite.drawTrike(ctx, e);
      else if (e.type === 'spitter') Sprite.drawSpitter(ctx, e, this.time);
      else Sprite.drawPtero(ctx, e);
    }

    // Magma King (Molten Nest boss arena) — drawn after enemies, before the player
    const boss = this.level!.boss;
    if (boss) {
      if (boss.x + boss.w > camX - 200 && boss.x < camX + VW + 200) boss.draw(ctx, this.time);
    }

    // Springs & pressure plates (under the player)
    for (const s of this.level!.springs) {
      if (s.x + s.w > camX - 40 && s.x < camX + VW + 40) s.draw(ctx, this.time);
    }
    for (const pl of this.level!.plates) {
      if (pl.x + pl.w > camX - 40 && pl.x < camX + VW + 40) pl.draw(ctx);
    }

    // Ghost race replay (translucent, with a small tag)
    if (this.ghost) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      Sprite.drawRex(ctx, this.ghost.view, this.time);
      ctx.restore();
      ctx.font = '800 9px ' + FONT_STACK;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(205,228,255,0.55)';
      ctx.fillText('GHOST', this.ghost.x + 17, this.ghost.y - 8);
    }

    // Player
    if (this.player) Sprite.drawRex(ctx, this.player, this.time);

    // Goo globs fly in front of Rex
    for (const pr of this.level!.projectiles) pr.draw(ctx, this.time);

    // Particles & floating text
    for (const p of this.particles) p.draw(ctx);
    for (const t of this.texts) t.draw(ctx);
    this.weather.draw(ctx, camX);

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
    if (p.type === 'door') {
      (p as Door).draw(ctx, this.time);
      return;
    }
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
    const heartsN = this.player ? this.player.maxHearts : this.maxHearts;
    const heartsFull = this.player ? this.player.hearts : 0;
    // Panel (wide enough for the largest difficulty's heart row)
    ctx.fillStyle = 'rgba(20,30,45,0.55)';
    this.roundRect(ctx, 10, 10, 300, 62, 12);
    ctx.fill();
    // Hearts
    for (let i = 0; i < heartsN; i++) {
      const hx = 34 + i * 30, hy = 32;
      const full = i < heartsFull;
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
    // Crystals (placed after the heart row)
    const cx = 34 + heartsN * 30 + 16;
    ctx.save();
    ctx.translate(cx, 32);
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
    ctx.fillText('× ' + (this.crystalsGot || 0) + '/' + (this.level ? this.level.totalCrystals : 0), cx + 14, 38);
    // Score, time & fossil count (right)
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(20,30,45,0.55)';
    this.roundRect(ctx, VW - 190, 10, 180, 84, 12);
    ctx.fill();
    ctx.fillStyle = '#ffe28a';
    ctx.font = '800 19px ' + FONT_STACK;
    ctx.fillText('Score ' + this.score, VW - 24, 34);
    ctx.fillStyle = '#cfe8ff';
    ctx.font = '700 15px ' + FONT_STACK;
    ctx.fillText('Time ' + fmtTime(this.elapsed), VW - 24, 56);
    // Fossil meta-progress with a tiny bone glyph
    ctx.font = '700 13px ' + FONT_STACK;
    const fossilTxt = 'Fossils ' + this.fossilsFound.length + '/' + this.totalFossils();
    const fossilW = ctx.measureText(fossilTxt).width;
    ctx.fillText(fossilTxt, VW - 24, 80);
    ctx.save();
    ctx.translate(VW - 24 - fossilW - 16, 75);
    ctx.fillStyle = '#e8dcc0';
    ctx.fillRect(-6, -1.8, 12, 3.6);
    for (const kx of [-7, 7]) {
      for (const ky of [-2.2, 2.2]) {
        ctx.beginPath();
        ctx.arc(kx, ky, 2.2, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
    // Active power-up chips (under the heart panel, left)
    if (this.player) {
      const p = this.player;
      const chips: { type: PowerUpType; frac: number }[] = [];
      if (p.magnetT > 0) chips.push({ type: 'magnet', frac: p.magnetT / CFG.powerup.magnetDur });
      if (p.doubleJumpT > 0) chips.push({ type: 'double', frac: p.doubleJumpT / CFG.powerup.doubleJumpDur });
      if (p.bubble) chips.push({ type: 'bubble', frac: 1 });
      let chipX = 22;
      for (const chip of chips) {
        ctx.fillStyle = 'rgba(20,30,45,0.6)';
        this.roundRect(ctx, chipX, 80, 46, 26, 8);
        ctx.fill();
        ctx.strokeStyle = POWERUP_COLORS[chip.type];
        ctx.lineWidth = 1.5;
        this.roundRect(ctx, chipX, 80, 46, 26, 8);
        ctx.stroke();
        drawPowerUpIcon(ctx, chip.type, chipX + 14, 93);
        // Remaining-time bar (full for the one-hit bubble)
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        this.roundRect(ctx, chipX + 27, 87, 14, 4, 2);
        ctx.fill();
        ctx.fillStyle = POWERUP_COLORS[chip.type];
        this.roundRect(ctx, chipX + 27, 87, Math.max(2, 14 * chip.frac), 4, 2);
        ctx.fill();
        chipX += 54;
      }
    }
    // Progress toward the nest (top centre, between the panels)
    if (this.player && this.level) this.drawProgress(ctx);
    // Magma King: health bar + orb indicators (top centre, under the track)
    const boss = this.player ? this.level?.boss : null;
    if (boss && !boss.dead) {
      const bw = 240, bx = VW / 2 - bw / 2, by = 44;
      ctx.fillStyle = 'rgba(30,16,10,0.62)';
      this.roundRect(ctx, bx - 16, by - 16, bw + 32, 56, 12);
      ctx.fill();
      ctx.font = '900 11px ' + FONT_STACK;
      ctx.textAlign = 'center';
      ctx.fillStyle = boss.state === 'stunned' || boss.state === 'stagger' ? '#8fd8ff' : '#ff9d3f';
      ctx.fillText(
        boss.state === 'stunned' || boss.state === 'stagger' ? 'MAGMA KING — STOMP!' : 'MAGMA KING',
        VW / 2, by - 3,
      );
      // HP bar
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      this.roundRect(ctx, bx, by + 4, bw, 10, 5);
      ctx.fill();
      const hpFrac = boss.hp / boss.maxHp;
      if (hpFrac > 0) {
        const hg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
        hg.addColorStop(0, '#ff6b35');
        hg.addColorStop(1, '#ffd257');
        ctx.fillStyle = hg;
        this.roundRect(ctx, bx, by + 4, Math.max(10, bw * hpFrac), 10, 5);
        ctx.fill();
      }
      // Orb pips (shattered = hollow)
      for (let i = 0; i < boss.orbs.length; i++) {
        const o = boss.orbs[i];
        const ox = VW / 2 + (i - (boss.orbs.length - 1) / 2) * 22;
        ctx.beginPath();
        ctx.arc(ox, by + 28, 5, 0, TAU);
        if (o.alive) {
          ctx.fillStyle = '#8fd8ff';
          ctx.fill();
        } else {
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }
    // Combo chip while a crystal chain is alive
    if (this.combo > 1) {
      const label = 'COMBO ×' + this.combo;
      ctx.font = '800 14px ' + FONT_STACK;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(20,30,45,0.6)';
      this.roundRect(ctx, VW - 32 - tw, 80, tw + 18, 22, 11);
      ctx.fill();
      ctx.textAlign = 'right';
      ctx.fillStyle = '#8fe3ff';
      ctx.fillText(label, VW - 23, 96);
    }
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

  /** Thin track from spawn to the nest, with checkpoint notches and a Rex marker. */
  drawProgress(ctx: CanvasRenderingContext2D): void {
    const bx = 340, bw = 400, by = 24, bh = 9;
    const goalX = Math.max(1, this.level!.goal.x);
    const prog = clamp(this.player!.x / goalX, 0, 1);
    // frame
    ctx.fillStyle = 'rgba(20,30,45,0.55)';
    this.roundRect(ctx, bx - 6, by - 5, bw + 26, bh + 10, 10);
    ctx.fill();
    // track
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    this.roundRect(ctx, bx, by, bw, bh, 5);
    ctx.fill();
    // travelled fill
    if (prog > 0.004) {
      const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      g.addColorStop(0, '#8fe3ff');
      g.addColorStop(1, '#ffd257');
      ctx.fillStyle = g;
      this.roundRect(ctx, bx, by, Math.max(bh, bw * prog), bh, 5);
      ctx.fill();
    }
    // checkpoint notches
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const cp of this.level!.checkpoints) {
      const nx = bx + (cp.x / goalX) * bw;
      ctx.fillRect(nx - 1, by - 2, 2, bh + 4);
    }
    // the nest, waiting at the end
    ctx.fillStyle = '#c98a4b';
    ctx.beginPath();
    ctx.ellipse(bx + bw + 11, by + bh / 2, 7, 5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#8a5f3c';
    ctx.beginPath();
    ctx.ellipse(bx + bw + 11, by + bh / 2 + 1, 4, 2.4, 0, 0, TAU);
    ctx.fill();
    // Rex marker
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(bx + bw * prog, by + bh / 2, 5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#5da854';
    ctx.beginPath();
    ctx.arc(bx + bw * prog, by + bh / 2, 3.4, 0, TAU);
    ctx.fill();
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

  /** Centered text with manual letter tracking (portable across browsers). */
  drawTracked(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, spacing: number, stroke: boolean): void {
    const chars = [...text];
    const widths = chars.map((c) => ctx.measureText(c).width);
    let x = cx - (widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1)) / 2;
    const prevAlign = ctx.textAlign;
    ctx.textAlign = 'left';
    for (let i = 0; i < chars.length; i++) {
      if (stroke) ctx.strokeText(chars[i], x, y);
      ctx.fillText(chars[i], x, y);
      x += widths[i] + spacing;
    }
    ctx.textAlign = prevAlign;
  }

  /** Five-pointed star outline centred at (cx, cy) with outer radius r. */
  starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  /** Rounded, semi-transparent info panel with an uppercase heading and divider. */
  drawInfoPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, heading: string): void {
    ctx.fillStyle = 'rgba(16,26,40,0.62)';
    this.roundRect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 14);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '800 13px ' + FONT_STACK;
    ctx.textAlign = 'left';
    ctx.fillText(heading, x + 20, y + 30);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 20, y + 42);
    ctx.lineTo(x + w - 20, y + 42);
    ctx.stroke();
  }

  drawUIButton(ctx: CanvasRenderingContext2D, b: UIButton): void {
    if (b.card) return;
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
    // A rotating tip keeps the pause screen from feeling static
    const tip = PAUSE_TIPS[Math.floor(this.time / 9) % PAUSE_TIPS.length];
    ctx.fillStyle = '#ffd257';
    ctx.font = '700 14px ' + FONT_STACK;
    ctx.textAlign = 'center';
    ctx.fillText('Tip: ' + tip, VW / 2, py + 92);
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
    const t = this.victoryT;

    if (t < VICTORY_PANEL_T) {
      // Phase 1 — celebration: confetti, nest hops, and a title that bounces in
      // while the white flash from the goal fades.
      const k = this.reducedMotion
        ? clamp(t / 0.4, 0, 1)
        : easeOutBack(clamp(t / 0.7, 0, 1));
      const bossWin = this.bossSlain;
      const title = bossWin ? 'THE MAGMA KING FALLS!' : 'You made it home!';
      ctx.save();
      ctx.translate(VW / 2, VH * 0.3);
      ctx.scale(k, k);
      ctx.textAlign = 'center';
      ctx.font = (bossWin ? '800 38px ' : '800 50px ') + FONT_STACK;
      ctx.lineWidth = 8;
      ctx.strokeStyle = 'rgba(25,55,30,0.55)';
      ctx.strokeText(title, 0, 0);
      ctx.fillStyle = bossWin ? '#ffd257' : '#9ff0a8';
      ctx.fillText(title, 0, 0);
      ctx.restore();
      if (t > 0.55) {
        ctx.globalAlpha = clamp((t - 0.55) / 0.4, 0, 0.8);
        ctx.textAlign = 'center';
        ctx.font = '600 16px ' + FONT_STACK;
        ctx.fillStyle = '#dce8f5';
        ctx.fillText('Recounting the run…', VW / 2, VH * 0.3 + 46);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = 'rgba(255,255,255,' + clamp(VICTORY_PANEL_T - t, 0, 1) * 0.5 + ')';
      ctx.fillRect(0, 0, VW, VH);
      return;
    }

    // Phase 2 — the results panel slides up over the still-celebrating scene,
    // stats stagger in, and the star rating pops one star at a time.
    const ease = 1 - Math.pow(1 - clamp((t - VICTORY_PANEL_T) / 0.4, 0, 1), 3);
    ctx.save();
    ctx.globalAlpha = ease;
    ctx.translate(0, (1 - ease) * 40);
    const { py } = this.drawPanel(ctx, 'You Made It Home!', '#9ff0a8');
    ctx.textAlign = 'center';
    ctx.font = '700 15px ' + FONT_STACK;
    ctx.fillStyle = '#dce8f5';
    ctx.fillText(
      'Run: ' + this.deaths + ' deaths · ' + this.stomps + ' stomps' + (this.daily ? '  ·  Rex code ' + rexCode(dailySeed()) : ''),
      VW / 2,
      py + 88,
    );
    // Star rating (1 for finishing, +1 for ≥2 hearts, +1 for ≥80% crystals)
    const stars = r.stars ?? 0;
    for (let i = 0; i < 3; i++) {
      const sx = VW / 2 + (i - 1) * 48;
      const sy = py + 120;
      const popT = t - (VICTORY_STAR_T + i * VICTORY_STAR_STEP);
      const scale = i < stars && popT >= 0 ? easeOutBack(clamp(popT / 0.3, 0, 1)) : 1;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(scale, scale);
      this.starPath(ctx, 0, 0, 20);
      if (i < stars) {
        ctx.fillStyle = '#ffd257';
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,80,0,0.55)';
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      }
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      // Quick sparkle flash right after a star lands
      if (i < stars && popT >= 0 && popT < 0.45 && !this.reducedMotion) {
        const a = 1 - popT / 0.45;
        ctx.strokeStyle = 'rgba(255,235,170,' + a.toFixed(2) + ')';
        ctx.lineWidth = 2;
        for (let s = 0; s < 4; s++) {
          const ang = (s / 4) * TAU + TAU / 8;
          const r1 = 26 + popT * 30;
          const r2 = r1 + 8;
          ctx.beginPath();
          ctx.moveTo(sx + Math.cos(ang) * r1, sy + Math.sin(ang) * r1);
          ctx.lineTo(sx + Math.cos(ang) * r2, sy + Math.sin(ang) * r2);
          ctx.stroke();
        }
      }
    }
    if (r.isBestStars) {
      const bestIn = clamp((t - (VICTORY_STAR_T + 3 * VICTORY_STAR_STEP)) / 0.3, 0, 1);
      if (bestIn > 0) {
        ctx.globalAlpha = ease * bestIn;
        ctx.font = '800 14px ' + FONT_STACK;
        ctx.fillStyle = '#ffd257';
        ctx.fillText('NEW BEST STARS!', VW / 2, py + 158);
        ctx.globalAlpha = ease;
      }
    }
    ctx.font = '700 15px ' + FONT_STACK;
    const lines: [string, string][] = [
      ['Crystals', r.crystals + ' / ' + r.totalCrystals + (r.crystals === r.totalCrystals ? '  ✦ all!' : '')],
      ['Stomps', String(r.stomps)],
      ...(r.heartsGot > 0 ? [[`Hearts`, '× ' + r.heartsGot] as [string, string]] : []),
      ...(this.bossSlain ? [['Magma King', 'defeated!  +' + CFG.score.boss] as [string, string]] : []),
      ['Time', fmtTime(r.time) + (r.isBestTime ? '  (best!)' : '   best ' + (this.best.time === null ? '—' : fmtTime(this.best.time)))],
      ['Health bonus', '+' + r.heartBonus],
      ['Time bonus', '+' + r.timeBonus],
    ];
    lines.forEach((ln, i) => {
      const rowIn = clamp((t - (VICTORY_PANEL_T + 0.15 + i * 0.08)) / 0.25, 0, 1);
      // 16px rows: a 7th line (Magma King) still clears the TOTAL row
      const y = py + 180 + i * 16;
      ctx.textAlign = 'left';
      ctx.globalAlpha = ease * rowIn;
      ctx.fillStyle = 'rgba(220,232,245,0.8)';
      ctx.fillText(ln[0], VW / 2 - 190, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffe28a';
      ctx.fillText(ln[1], VW / 2 + 190, y);
    });
    const totalIn = clamp((t - (VICTORY_PANEL_T + 0.15 + lines.length * 0.08)) / 0.3, 0, 1);
    ctx.globalAlpha = ease * totalIn;
    ctx.textAlign = 'center';
    ctx.font = '800 24px ' + FONT_STACK;
    ctx.fillStyle = '#fff';
    ctx.fillText('TOTAL  ' + r.total + (r.isBestScore ? '  ★ New Best!' : '   best ' + this.best.score), VW / 2, py + 290);
    ctx.globalAlpha = ease;
    // Play Again · Next Level · Menu
    const btnIn = clamp((t - VICTORY_BUTTON_T) / 0.35, 0, 1);
    if (btnIn > 0) {
      const by = py + 308;
      const hasNext = !this.daily && this.levelIdx < LEVELS.length - 1;
      this.uiButtons = [
        { x: hasNext ? VW / 2 - 245 : VW / 2 - 220, y: by, w: hasNext ? 150 : 200, h: 52, label: 'Play Again', action: () => this.startGame() },
        ...(hasNext
          ? [{ x: VW / 2 - 75, y: by, w: 150, h: 52, label: 'Next Level', action: () => this.nextLevel() }]
          : []),
        { x: hasNext ? VW / 2 + 105 : VW / 2 + 20, y: by, w: hasNext ? 150 : 200, h: 52, label: 'Menu', action: () => this.toMenu() },
      ];
      for (const b of this.uiButtons) {
        ctx.save();
        ctx.globalAlpha = ease * btnIn;
        this.drawUIButton(ctx, b);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  renderMenu(ctx: CanvasRenderingContext2D): void {
    // Scenic backdrop: slow auto-pan through the valley (theme-aware)
    const camX = (Math.sin(this.time * 0.06) * 0.5 + 0.5) * 900;
    this.bg.draw(ctx, camX, this.time);
    // Draw a slice of the level floor for grounding
    const volcanic = this.bg.theme === 'volcanic';
    const frost = this.bg.theme === 'frost';
    ctx.fillStyle = volcanic ? '#42304a' : frost ? '#8fa8c4' : '#8a5f3c';
    ctx.fillRect(0, 460, VW, 80);
    ctx.fillStyle = volcanic ? '#5c4258' : frost ? '#e8f4fc' : '#5da854';
    ctx.fillRect(0, 460, VW, 12);
    ctx.fillStyle = volcanic ? '#8a5a78' : frost ? '#ffffff' : '#6fbe62';
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
      x: 300,
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
      rainbow: this.rainbow,
      skin: this.skin,
    };
    Sprite.drawRex(ctx, fakeP, this.time);
    // Title block (gently floating, theme-aware)
    ctx.textAlign = 'center';
    const bounce = Math.sin(this.time * 2) * 4;
    ctx.font = '800 64px ' + FONT_STACK;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = volcanic ? 'rgba(60,25,20,0.85)' : 'rgba(30,50,30,0.85)';
    ctx.strokeText('TINY REX', VW / 2, 118 + bounce);
    const tg = ctx.createLinearGradient(0, 56, 0, 124);
    if (volcanic) {
      tg.addColorStop(0, '#ffd9a0');
      tg.addColorStop(1, '#ff7a5c');
    } else if (frost) {
      tg.addColorStop(0, '#eaf7ff');
      tg.addColorStop(1, '#7fb5e6');
    } else {
      tg.addColorStop(0, '#c8f0a0');
      tg.addColorStop(1, '#5da854');
    }
    ctx.fillStyle = tg;
    ctx.fillText('TINY REX', VW / 2, 118 + bounce);
    // Subtitle: selected level name, tracked uppercase for a clean lockup
    const lvl = this.currentInfo();
    ctx.font = '800 22px ' + FONT_STACK;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(60,40,20,0.6)';
    this.drawTracked(ctx, lvl.subtitle, VW / 2, 156 + bounce * 0.4, 7, true);
    ctx.fillStyle = '#ffe28a';
    this.drawTracked(ctx, lvl.subtitle, VW / 2, 156 + bounce * 0.4, 7, false);
    // Per-level records
    ctx.font = '600 13px ' + FONT_STACK;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(
      'Best Score  ' + (this.best.score || '—') + '   ·   Best Time  ' + (this.best.time === null ? '—' : fmtTime(this.best.time)),
      VW / 2,
      182,
    );
    // Lifetime stats
    const since = this.stats.firstPlayed ? new Date(this.stats.firstPlayed).toLocaleDateString() : '—';
    ctx.font = '600 12px ' + FONT_STACK;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(
      'PLAYS ' + this.stats.runs + '  ·  DEATHS ' + this.stats.deaths + '  ·  CRYSTALS ' + this.stats.crystals + '  ·  HEARTS ' + this.stats.hearts + '  ·  FOSSILS ' + this.fossilsFound.length + '/' + this.totalFossils() + '  ·  NOTES ' + this.notesFound.length + '/' + this.totalNotes() + '  ·  SINCE ' + since,
      VW / 2,
      205,
    );
    // Controls panel (left)
    const cpx = 34, cpy = 232, cpw = 240, cph = 238;
    this.drawInfoPanel(ctx, cpx, cpy, cpw, cph, 'CONTROLS');
    const rows: Array<[string, string]> = [
      ['Move', 'A / D · ← →'],
      ['Jump', 'W / ↑ / Space'],
      ['Pause', 'P / Esc'],
      ['Restart', 'R'],
      ['Levels', '← / →'],
      ['Difficulty', '↑ / ↓'],
      ['Mute · Calm · Ghost', 'M · V · G'],
      ['Gamepad', 'A jump · B go'],
      ['Skin', '[ / ]'],
      ['Debug', 'F2'],
    ];
    ctx.font = '600 13px ' + FONT_STACK;
    rows.forEach(([label, keys], i) => {
      const y = cpy + 62 + i * 19;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#cfe0f2';
      ctx.fillText(label, cpx + 20, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#9fd8ff';
      ctx.fillText(keys, cpx + cpw - 20, y);
    });
    // Quest panel (right), rows vertically centred against the controls list
    const qx = VW - 274, qy = 232, qw = 240, qh = 238;
    this.drawInfoPanel(ctx, qx, qy, qw, qh, 'YOUR QUEST');
    const quest = [
      'Reach the glowing nest',
      'Collect amber crystals',
      'Stomp beetles, trikes & pteros',
      'Watch for lava, spikes & rocks',
      'Touch flags to save progress',
      'Unearth the hidden fossils',
    ];
    ctx.font = '600 13px ' + FONT_STACK;
    quest.forEach((r, i) => {
      const y = qy + 100 + i * 19;
      ctx.fillStyle = '#ffd257';
      ctx.beginPath();
      ctx.arc(qx + 26, y - 4.5, 2.5, 0, TAU);
      ctx.fill();
      ctx.textAlign = 'left';
      ctx.fillStyle = '#cfe0f2';
      ctx.fillText(r, qx + 38, y);
    });
    // Level cards (one per level + Daily Rex, centred row)
    const cardY = 232, cardH = 150;
    const cardCount = LEVELS.length + 1;
    const cardGap = 14;
    const cardW = Math.floor((680 - cardGap * (cardCount - 1)) / cardCount);
    const cardX0 = VW / 2 - (cardW * cardCount + cardGap * (cardCount - 1)) / 2;
    const cardAccents = ['#9ff0a8', '#ff9d7a', '#8fd8ff', '#ff7a5c'];
    for (let i = 0; i < cardCount; i++) {
      const isDaily = i === LEVELS.length;
      const cx0 = cardX0 + i * (cardW + cardGap);
      const cw = cardW;
      const selected = isDaily ? this.daily : i === this.levelIdx && !this.daily;
      const accent = isDaily ? '#c9a0ff' : cardAccents[i % cardAccents.length];
      ctx.fillStyle = 'rgba(16,26,40,0.66)';
      this.roundRect(ctx, cx0, cardY, cw, cardH, 14);
      ctx.fill();
      ctx.fillStyle = accent;
      this.roundRect(ctx, cx0, cardY, cw, 6, 3);
      ctx.fill();
      // Name
      ctx.font = '800 13px ' + FONT_STACK;
      ctx.fillStyle = selected ? '#ffe28a' : accent;
      this.drawTracked(ctx, isDaily ? 'DAILY' : LEVELS[i].subtitle, cx0 + cw / 2, cardY + 36, 1.5, false);
      // Star progress
      const bStars = isDaily ? getDailyStars() : getBestStars(i);
      for (let s = 0; s < 3; s++) {
        this.starPath(ctx, cx0 + cw / 2 + (s - 1) * 30, cardY + 64, 10);
        if (s < bStars) {
          ctx.fillStyle = '#ffd257';
          ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      // Fossil dots (hand-built levels only: one per hidden fossil)
      if (!isDaily) {
        const fCount = LEVELS[i].def.fossils?.length ?? 0;
        for (let f = 0; f < fCount; f++) {
          const found = this.fossilsFound.includes(i + ':' + f);
          const fx = cx0 + cw / 2 + (f - (fCount - 1) / 2) * 18;
          ctx.fillStyle = found ? '#f4ecd9' : 'rgba(255,255,255,0.16)';
          ctx.fillRect(fx - 5, cardY + 82, 10, 2.6);
          for (const kx of [-5, 5]) {
            for (const ky of [-2.4, 2.4]) {
              ctx.beginPath();
              ctx.arc(fx + kx, cardY + 83.3 + ky, 2.4, 0, TAU);
              ctx.fill();
            }
          }
        }
      }
      // Records
      const bb = isDaily ? getDailyBest() : getBest(i);
      ctx.font = '600 12px ' + FONT_STACK;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(220,232,245,0.85)';
      ctx.fillText('Score ' + (bb.score || '—'), cx0 + cw / 2, cardY + 104);
      ctx.fillText('Time ' + (bb.time === null ? '—' : fmtTime(bb.time)), cx0 + cw / 2, cardY + 122);
      ctx.font = '600 11px ' + FONT_STACK;
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(isDaily ? dailyLabel(dailySeed()) : 'TAP · ←/→', cx0 + cw / 2, cardY + 138);
      if (selected) {
        ctx.strokeStyle = isDaily ? '#c9a0ff' : '#ffd257';
        ctx.lineWidth = 3;
        this.roundRect(ctx, cx0 - 2, cardY - 2, cw + 4, cardH + 4, 16);
        ctx.stroke();
      }
    }
    // Difficulty pills
    const pills: Array<{ d: Difficulty; x: number; label: string }> = [
      { d: 'easy', x: 335, label: 'EASY' },
      { d: 'normal', x: 435, label: 'NORMAL' },
      { d: 'hard', x: 535, label: 'HARD' },
    ];
    pills.forEach((p) => {
      const active = this.difficulty === p.d;
      ctx.fillStyle = active ? '#ffd257' : 'rgba(255,255,255,0.14)';
      this.roundRect(ctx, p.x, 394, 90, 30, 15);
      ctx.fill();
      if (!active) {
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        this.roundRect(ctx, p.x + 0.5, 394.5, 89, 29, 15);
        ctx.stroke();
      }
      ctx.fillStyle = active ? 'rgba(30,20,10,0.9)' : 'rgba(255,255,255,0.8)';
      ctx.font = '800 12px ' + FONT_STACK;
      this.drawTracked(ctx, p.label, p.x + 45, 413, 2, false);
    });
    // Skin picker (right of the difficulty pills)
    ctx.font = '700 11px ' + FONT_STACK;
    ctx.fillStyle = '#cfe0f2';
    this.drawTracked(ctx, 'REX SKIN', 686, 413, 2, false);
    SKINS.forEach((s, i) => {
      const sx = 746 + i * 48;
      const unlocked = skinUnlocked(s.id, this.fossilsFound);
      ctx.save();
      if (!unlocked) ctx.globalAlpha = 0.35;
      this.roundRect(ctx, sx, 394, 40, 30, 8);
      ctx.fillStyle = s.body;
      ctx.fill();
      // mini Rex head: spikes + eye
      ctx.fillStyle = s.dark;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(sx + 11 + k * 5, 402);
        ctx.lineTo(sx + 13.5 + k * 5, 397 + k * 1.2);
        ctx.lineTo(sx + 16 + k * 5, 402);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(sx + 26, 407, 3.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = s.line;
      ctx.beginPath();
      ctx.arc(sx + 27, 407, 1.6, 0, TAU);
      ctx.fill();
      ctx.restore();
      if (!unlocked) {
        // padlock over locked skins
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(sx + 20, 406, 3.6, Math.PI, 0);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        this.roundRect(ctx, sx + 15, 406, 10, 8, 2);
        ctx.fill();
      } else if (this.skin === s.id) {
        ctx.strokeStyle = '#ffd257';
        ctx.lineWidth = 2;
        this.roundRect(ctx, sx + 1, 395, 38, 28, 7);
        ctx.stroke();
      }
    });
    if (!skinUnlocked('mint', this.fossilsFound)) {
      ctx.font = '600 10px ' + FONT_STACK;
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.textAlign = 'center';
      ctx.fillText('3 fossils to unlock Mint', 842, 436);
    }
    // Bottom bar: Start + toggles (sitting on the ground strip for contrast)
    this.uiButtons = [
      // Tappable level cards (drawn above, hit-tested here)
      ...LEVELS.map((li, i) => ({
        x: cardX0 + i * (cardW + cardGap),
        y: cardY,
        w: cardW,
        h: cardH,
        label: li.name,
        card: true,
        action: () => this.selectLevel(i),
      })),
      // Daily Rex card
      {
        x: cardX0 + LEVELS.length * (cardW + cardGap),
        y: cardY,
        w: cardW,
        h: cardH,
        label: 'Daily Challenge',
        card: true,
        action: () => this.selectDaily(),
      },
      // Tappable difficulty pills (drawn above)
      ...pills.map((p) => ({ x: p.x, y: 394, w: 90, h: 30, label: p.label, card: true, action: () => this.selectDifficulty(p.d) })),
      // Tappable skin swatches (drawn above)
      ...SKINS.map((s, i) => ({ x: 746 + i * 48, y: 394, w: 40, h: 30, label: s.name, card: true, action: () => this.selectSkin(s.id) })),
      {
        x: 38, y: 474, w: 150, h: 40, label: 'Ghost: ' + (this.ghostOn ? 'On' : 'Off') + ' · G',
        color: '#8fa8ba',
        action: () => this.toggleGhost(),
      },
      {
        x: 202, y: 474, w: 168, h: 40, label: 'Field Notes · C',
        color: '#8fa8ba',
        action: () => {
          this.menuScreen = 'codex';
          this.audio.play('ui');
        },
      },
      { x: VW / 2 - 100, y: 470, w: 200, h: 48, label: 'Start Game', action: () => this.startGame() },
      {
        x: 648, y: 474, w: 132, h: 40, label: (this.audio.muted ? 'Sound: Off' : 'Sound: On') + ' · M',
        color: '#8fa8ba',
        action: () => {
          this.audio.setMuted(!this.audio.muted);
          this.audio.play('ui');
          this.updateMuteButton();
        },
      },
      {
        x: 792, y: 474, w: 130, h: 40, label: (this.reducedMotion ? 'Calm: On' : 'Calm: Off') + ' · V',
        color: '#8fa8ba',
        action: () => {
          this.reducedMotion = !this.reducedMotion;
          Store.set('tinyrex_reduced', this.reducedMotion);
          this.audio.play('ui');
        },
      },
    ];
    for (const b of this.uiButtons) this.drawUIButton(ctx, b);
    // Start hint under the button
    const pulse = 0.55 + 0.35 * Math.sin(this.time * 3.4);
    ctx.globalAlpha = pulse;
    ctx.font = '700 12px ' + FONT_STACK;
    ctx.fillStyle = '#fff';
    this.drawTracked(ctx, 'ENTER · SPACE · TAP', VW / 2, 534, 2, false);
    ctx.globalAlpha = 1;
  }

  /** The field-notes codex: one parchment column per level. */
  renderCodex(ctx: CanvasRenderingContext2D): void {
    // Scenic backdrop (same auto-pan as the menu), dimmed for reading
    const camX = (Math.sin(this.time * 0.06) * 0.5 + 0.5) * 900;
    this.bg.draw(ctx, camX, this.time);
    ctx.fillStyle = 'rgba(8,12,22,0.8)';
    ctx.fillRect(0, 0, VW, VH);
    // Header
    ctx.textAlign = 'center';
    ctx.font = '800 34px ' + FONT_STACK;
    ctx.fillStyle = '#f4ecd9';
    this.drawTracked(ctx, 'FIELD NOTES', VW / 2, 50, 3, false);
    ctx.font = '600 13px ' + FONT_STACK;
    ctx.fillStyle = 'rgba(220,210,180,0.75)';
    ctx.fillText(this.notesFound.length + '/' + this.totalNotes() + ' recovered', VW / 2, 72);
    // One panel per hand-built level
    const pw = 224, gap = 14, py = 92, ph = 388;
    const x0 = (VW - (pw * LEVELS.length + gap * (LEVELS.length - 1))) / 2;
    LEVELS.forEach((li, i) => {
      const px = x0 + i * (pw + gap);
      this.drawInfoPanel(ctx, px, py, pw, ph, li.subtitle);
      const found = (n: number) => this.notesFound.includes(i + ':' + n);
      NOTES[i].forEach((entry, n) => {
        const ey = py + 62 + n * 108;
        // divider above entries 2 and 3
        if (n > 0) {
          ctx.strokeStyle = 'rgba(255,255,255,0.12)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px + 16, ey - 10);
          ctx.lineTo(px + pw - 16, ey - 10);
          ctx.stroke();
        }
        if (found(n)) {
          ctx.textAlign = 'left';
          ctx.font = '800 12px ' + FONT_STACK;
          ctx.fillStyle = '#ffd257';
          ctx.fillText(entry.title, px + 16, ey);
          ctx.font = '600 10.5px ' + FONT_STACK;
          ctx.fillStyle = '#d8cfae';
          this.wrapText(ctx, entry.text, px + 16, ey + 16, pw - 32, 13);
        } else {
          ctx.textAlign = 'center';
          ctx.font = '800 24px ' + FONT_STACK;
          ctx.fillStyle = 'rgba(255,255,255,0.28)';
          ctx.fillText('???', px + pw / 2, ey + 22);
          ctx.font = '600 10px ' + FONT_STACK;
          ctx.fillStyle = 'rgba(220,210,180,0.55)';
          ctx.fillText(entry.hint, px + pw / 2, ey + 44);
        }
      });
    });
    // Back button
    this.uiButtons = [
      {
        x: VW / 2 - 110, y: 490, w: 220, h: 36, label: 'Back to menu · C',
        color: '#8fa8ba',
        action: () => {
          this.menuScreen = 'main';
          this.audio.play('ui');
        },
      },
    ];
    for (const b of this.uiButtons) this.drawUIButton(ctx, b);
  }

  /** Word-wrap helper; draws the text line by line, returns the count drawn. */
  wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
    const words = text.split(' ');
    let line = '';
    let lines = 0;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y + lines * lineHeight);
        lines += 1;
        line = w;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, x, y + lines * lineHeight);
    return lines + 1;
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
