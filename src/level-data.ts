/** Declarative level content, ported verbatim from the original game.js ("Crystal Valley"). */

export type PlatformType = 'ground' | 'wood' | 'stone' | 'crumble' | 'mover' | 'door';
export type EnemyType = 'beetle' | 'trike' | 'ptero' | 'spitter';
export type HazardType = 'spikes' | 'lava' | 'rocks';
export type DecorType = 'tree' | 'bush' | 'rock' | 'flower' | 'crystalrock' | 'sign' | 'tuft';

export interface Point {
  x: number;
  y: number;
}

export interface PlatformDef {
  x: number;
  y: number;
  w: number;
  h: number;
  type?: PlatformType;
  amp?: number;
  speed?: number;
  phase?: number;
  axis?: 'x' | 'y';
}

export interface CrystalDef {
  x: number;
  y: number;
  bonus?: boolean;
}

export interface HazardDef {
  type: HazardType;
  x: number;
  y: number;
  w: number;
  interval?: number;
}

export interface EnemyDef {
  type: EnemyType;
  x: number;
  y: number;
  minX?: number;
  maxX?: number;
  dir?: number;
  range?: number;
}

export interface DecorDef {
  type: DecorType;
  x: number;
  y?: number;
  s?: number;
  color?: string;
}

export interface LevelDef {
  width: number;
  startX: number;
  startY: number;
  startGroundY: number;
  platforms: PlatformDef[];
  crystals: CrystalDef[];
  hazards: HazardDef[];
  checkpoints: Point[];
  enemies: EnemyDef[];
  /** Heart pickups (restore one heart, or pay points at full health). */
  hearts: Point[];
  goal: Point;
  decor: DecorDef[];
  /** Spring pads: {x, groundTopY}. Launch the player upward. */
  springs?: Point[];
  /** Hidden fossils: persistent meta-collectibles (id = "<levelIdx>:<i>"). */
  fossils?: Point[];
  /** Field-note pages: lore collectibles read in the menu codex (id = "<levelIdx>:<i>"). */
  notes?: Point[];
  /** Pressure plates: hold to keep the referenced door (index into `doors`) open. */
  plates?: { x: number; y: number; door: number }[];
  /** Sliding gates: {x, y, w, h}; y is the top, bottom meets the ground. */
  doors?: { x: number; y: number; w: number; h: number }[];
  /** Boss placement + patrol bounds (x is the left edge of the boss). */
  boss?: { x: number; y: number; minX: number; maxX: number };
  /** Stompable crystal orbs that stun the boss (boss arenas only). */
  orbs?: Point[];
  /**
   * Rising tide: the waterline climbs from `fromY` to `toY` at `rate` px/s
   * while the run is live. Standing in the water damages the player.
   */
  tide?: { fromY: number; toY: number; rate: number };
}

export type LevelTheme = 'meadow' | 'volcanic' | 'frost' | 'dusk';

export interface LevelInfo {
  id: number;
  name: string;
  /** Tracked-uppercase menu subtitle. */
  subtitle: string;
  theme: LevelTheme;
  def: LevelDef;
}

// Layout notes: ground tops at y=460; pits are gaps between ground
// segments; lava sits in pits at y=520. ~7550px wide, 3–6 min run.
const LEVEL_1: LevelDef = {
  width: 7550,
  startX: 120,
  startY: 414, // 460 - player.h
  startGroundY: 460,
  platforms: [
    // ---- Section A: gentle opening (teach move + jump) ----
    // Give the opening crumble hop a forgiving landing margin before the
    // first beetle and the level's first real gap.
    { x: 0, y: 460, w: 1190, h: 120, type: 'ground' },
    { x: 320, y: 372, w: 130, h: 24, type: 'wood' },
    { x: 520, y: 300, w: 130, h: 24, type: 'wood' },
    { x: 760, y: 372, w: 130, h: 24, type: 'wood' },
    { x: 1010, y: 412, w: 48, h: 24, type: 'crumble' },
    { x: 1068, y: 364, w: 48, h: 24, type: 'crumble' },
    // ---- Section B: first enemies + small gaps ----
    { x: 1220, y: 460, w: 410, h: 120, type: 'ground' },
    { x: 1710, y: 460, w: 690, h: 120, type: 'ground' },
    { x: 1860, y: 372, w: 120, h: 24, type: 'stone' },
    { x: 2040, y: 312, w: 120, h: 24, type: 'stone' },
    { x: 2210, y: 372, w: 120, h: 24, type: 'stone' },
    // ---- Section C: spikes, bonus route, first lava pool ----
    // The bonus ledge's short drop lands on this bank; carry the bank to the
    // next section so a buffered short hop cannot fall through the seam.
    { x: 2480, y: 460, w: 400, h: 120, type: 'ground' },
    { x: 2580, y: 360, w: 160, h: 24, type: 'stone' },
    { x: 2880, y: 460, w: 300, h: 120, type: 'ground' },
    { x: 2820, y: 350, w: 110, h: 24, type: 'stone' },
    // elevated bonus route (hidden-ish, needs the jump chain)
    { x: 3080, y: 260, w: 110, h: 24, type: 'stone' },
    { x: 3220, y: 200, w: 130, h: 24, type: 'stone' },
    { x: 3200, y: 400, w: 110, h: 24, type: 'stone' }, // stepping stone over lava A
    { x: 3350, y: 460, w: 120, h: 120, type: 'ground' },
    // ---- Section D: moving platforms over the lava river ----
    // Broad landing stone keeps the mover route readable without making a
    // phase-sensitive miss drop Rex directly into the lava.
    // Start the first river stone just beyond the bank so Rex can launch
    // before the platform underside, rather than jumping into its edge.
    { x: 3520, y: 390, w: 290, h: 24, type: 'stone' },
    { x: 3540, y: 430, w: 110, h: 24, type: 'mover', axis: 'x', amp: 100, speed: 1.0 },
    { x: 3760, y: 390, w: 100, h: 24, type: 'stone' },
    // The y-mover is still a visible shortcut, but this low cap makes a
    // missed phase recoverable instead of turning the whole river into a
    // one-shot fall.
    { x: 3860, y: 390, w: 180, h: 24, type: 'stone' },
    { x: 3920, y: 430, w: 110, h: 24, type: 'mover', axis: 'y', amp: 90, speed: 1.2 },
    { x: 4080, y: 390, w: 100, h: 24, type: 'stone' },
    // A fixed cap keeps the far side of the mover readable: the moving
    // platform remains an optional shortcut, while a mistimed transfer still
    // has a recoverable stone instead of an unrecoverable lava drop.
    { x: 4230, y: 390, w: 110, h: 24, type: 'stone' },
    { x: 4230, y: 420, w: 110, h: 24, type: 'mover', axis: 'x', amp: 120, speed: 0.9 },
    // Bridge the small checkpoint seam so the patrol can be cleared with a
    // full hop instead of forcing a landing beside the trike at the edge.
    { x: 4470, y: 460, w: 410, h: 120, type: 'ground' },
    { x: 4650, y: 360, w: 120, h: 24, type: 'stone' },
    // ---- Section E: checkpoint 2, ptero & spike gauntlet ----
    { x: 4880, y: 460, w: 420, h: 120, type: 'ground' },
    { x: 5100, y: 320, w: 130, h: 24, type: 'stone' },
    // ---- Section F: falling rocks, lava pit B, last enemies ----
    { x: 5300, y: 460, w: 400, h: 120, type: 'ground' },
    { x: 5480, y: 350, w: 110, h: 24, type: 'stone' },
    { x: 5700, y: 390, w: 110, h: 24, type: 'stone' },
    { x: 5430, y: 412, w: 48, h: 24, type: 'crumble' },
    // Gap to the previous ground is 180 px: a full-speed jump clears ~233 px,
    // so this stays clearable (the old 250 px gap was unjumpable by anyone).
    { x: 5880, y: 460, w: 520, h: 120, type: 'ground' },
    { x: 6150, y: 360, w: 120, h: 24, type: 'stone' },
    // ---- Section G: home stretch ----
    { x: 6400, y: 460, w: 1150, h: 120, type: 'ground' },
  ],
  crystals: [
    // Section A
    { x: 190, y: 425 }, { x: 260, y: 425 },
    { x: 385, y: 335 },
    { x: 555, y: 263 }, { x: 605, y: 263 },
    { x: 825, y: 335 },
    { x: 1092, y: 327 },
    // Section B
    { x: 1350, y: 425 }, { x: 1420, y: 425 },
    { x: 1920, y: 335 }, { x: 2100, y: 275 }, { x: 2270, y: 335 },
    // Section C
    { x: 2520, y: 425 },
    { x: 2620, y: 323 }, { x: 2690, y: 323 },
    { x: 2930, y: 425 },     { x: 2875, y: 313 },
    { x: 3135, y: 223 }, { x: 3285, y: 160, bonus: true }, { x: 3330, y: 223 },
    { x: 3255, y: 363 },
    // Section D (river)
    { x: 3590, y: 340 }, { x: 3975, y: 250 }, { x: 4130, y: 340 }, { x: 4280, y: 350 },
    // Section E
    { x: 4520, y: 425 }, { x: 4710, y: 323 },
    { x: 4930, y: 425 }, { x: 5035, y: 323 }, { x: 5200, y: 425 },
    // Section F
    { x: 5535, y: 313 },
    { x: 6050, y: 425 }, { x: 6185, y: 323 }, { x: 6235, y: 323 }, { x: 6330, y: 425 },
    // Section G
    { x: 6550, y: 425 }, { x: 6650, y: 425 }, { x: 6750, y: 425 }, { x: 6900, y: 425 },
  ],
  enemies: [
    { type: 'beetle', x: 950, y: 432, minX: 850, maxX: 1100 },
    { type: 'beetle', x: 1450, y: 432, minX: 1290, maxX: 1600 },
    { type: 'trike', x: 1950, y: 424, minX: 1850, maxX: 2150 },
    // Keep a safe landing margin after the short spike route before the
    // patrol begins; the old patrol could overlap Rex on the first frame
    // after the 80 px ground gap.
    { type: 'trike', x: 3040, y: 424, minX: 3010, maxX: 3130 },
    // Keep the flyer above the lava jump's apex so the stepping-stone route
    // remains a readable hazard choice instead of a timing lottery.
    { type: 'ptero', x: 3250, y: 220, range: 90 },
    // Keep the river flyer above the jump corridor; its old dip could clip
    // Rex while leaving the vertical mover.
    { type: 'ptero', x: 3950, y: 145, range: 150 },
    { type: 'ptero', x: 4230, y: 120, range: 80 },
    { type: 'ptero', x: 4700, y: 120, range: 80 },
    { type: 'trike', x: 4800, y: 424, minX: 4770, maxX: 4920 },
    { type: 'beetle', x: 5150, y: 432, minX: 5050, maxX: 5280 },
    // Keep the checkpoint approach clear beneath this high flight path.
    { type: 'ptero', x: 5500, y: 120, range: 70 },
    { type: 'beetle', x: 6000, y: 432, minX: 5920, maxX: 6080 },
    { type: 'trike', x: 6350, y: 424, minX: 6300, maxX: 6400 },
    { type: 'beetle', x: 6900, y: 432, minX: 6700, maxX: 7050 },
  ],
  hazards: [
    { type: 'spikes', x: 2620, y: 460, w: 80 },
    { type: 'lava', x: 3180, y: 520, w: 170 },
    { type: 'lava', x: 3470, y: 520, w: 1000 },
    { type: 'spikes', x: 5100, y: 460, w: 70 },
    { type: 'rocks', x: 5380, y: 460, w: 240, interval: 2.0 },
    { type: 'lava', x: 5700, y: 520, w: 180 },
  ],
  checkpoints: [
    { x: 2330, y: 460 },
    { x: 3420, y: 460 },
    { x: 4560, y: 460 },
  ],
  hearts: [
    { x: 2660, y: 330 }, // stone ledge before the spikes
    { x: 5080, y: 428 }, // just past the spike gauntlet
  ],
  fossils: [
    { x: 3255, y: 163 }, // high bonus route — top of the jump chain
    { x: 3230, y: 363 }, // stepping stone over lava pool A
    { x: 5105, y: 283 }, // bonus ledge beyond the spike pit
  ],
  notes: [
    { x: 2400, y: 436 }, // by the first flag
    { x: 4630, y: 436 }, // by the last flag
    { x: 3264, y: 363 }, // beside the stepping stone over lava pool A
  ],
  goal: { x: 7150, y: 460 },
  decor: [
    { type: 'sign', x: 120 },
    { type: 'tree', x: 250, s: 1.0 }, { type: 'bush', x: 60 }, { type: 'flower', x: 180 },
    { type: 'flower', x: 430, color: '#c9a0ff' }, { type: 'flower', x: 700, color: '#ffd257' },
    { type: 'rock', x: 1050 }, { type: 'tree', x: 880, s: 1.15 },
    { type: 'tree', x: 1290, s: 0.9 }, { type: 'bush', x: 1560 }, { type: 'flower', x: 1680 },
    { type: 'tree', x: 1770, s: 1.1 }, { type: 'flower', x: 1830, color: '#ff8fa3' }, { type: 'bush', x: 2350 },
    { type: 'rock', x: 2440 }, { type: 'tree', x: 2540, s: 0.95 }, { type: 'flower', x: 2830 },
    { type: 'tree', x: 2920, s: 1.2 }, { type: 'crystalrock', x: 3060 }, { type: 'bush', x: 3120 },
    { type: 'rock', x: 3395 },
    { type: 'tree', x: 3420, s: 0.85 },
    { type: 'tree', x: 4520, s: 1.1 }, { type: 'flower', x: 4600 }, { type: 'bush', x: 4760 },
    { type: 'rock', x: 4940 }, { type: 'flower', x: 5250, color: '#c9a0ff' }, { type: 'tree', x: 5280, s: 0.9 },
    { type: 'rock', x: 5350 }, { type: 'tree', x: 5660, s: 1.05 },
    { type: 'crystalrock', x: 5980, s: 1.1 }, { type: 'tree', x: 6020, s: 1.0 }, { type: 'flower', x: 6100 },
    { type: 'tree', x: 6480, s: 1.2 }, { type: 'flower', x: 6520, color: '#ffd257' },
    { type: 'bush', x: 6700 }, { type: 'flower', x: 6820 }, { type: 'tree', x: 7000, s: 1.1 },
    { type: 'rock', x: 7300 }, { type: 'tree', x: 7420, s: 1.3 }, { type: 'flower', x: 7500 },
    { type: 'tuft', x: 300 }, { type: 'tuft', x: 900 }, { type: 'tuft', x: 2000 },
    { type: 'tuft', x: 3000 }, { type: 'tuft', x: 4100 }, { type: 'tuft', x: 5100 },
    { type: 'tuft', x: 6200 }, { type: 'tuft', x: 6600 },
  ],
};

// Level 2 — "Volcanic Depths": a night-time lava field. Same ground line
// (y=460) and pacing as the valley, but harder: a long lava moat, a twin
// falling-rock gauntlet, and denser ptero traffic.
const LEVEL_2: LevelDef = {
  width: 7550,
  startX: 120,
  startY: 414, // 460 - player.h
  startGroundY: 460,
  platforms: [
    // ---- Section A: night opening (teach the mood, first crystal arc) ----
    { x: 0, y: 460, w: 1100, h: 120, type: 'ground' },
    { x: 400, y: 372, w: 120, h: 24, type: 'stone' },
    { x: 620, y: 300, w: 120, h: 24, type: 'stone' },
    { x: 840, y: 372, w: 120, h: 24, type: 'stone' },
    // ---- Section B: first enemies over the basalt shelf ----
    { x: 1250, y: 460, w: 420, h: 120, type: 'ground' },
    { x: 1820, y: 460, w: 560, h: 120, type: 'ground' },
    { x: 1950, y: 360, w: 130, h: 24, type: 'stone' },
    { x: 2200, y: 300, w: 130, h: 24, type: 'stone' },
    // Widen the far moat landing so the calibrated full arc lands well
    // inside the stone instead of clipping its left edge.
    { x: 2400, y: 360, w: 180, h: 24, type: 'stone' },
    // ---- Section C: the lava moat (stepping stones → mover → stone → y-mover) ----
    { x: 2560, y: 430, w: 100, h: 24, type: 'stone' },
    // Broaden the second moat step so the standard full arc lands away from
    // its left lip instead of clipping into the lava before the bank.
    { x: 2740, y: 430, w: 180, h: 24, type: 'stone' },
    // A broad landing deck keeps the first moving-platform approach forgiving
    // after the lava moat; the mover remains available as the intended shortcut.
    { x: 3000, y: 460, w: 500, h: 120, type: 'ground' },
    { x: 3540, y: 420, w: 100, h: 24, type: 'mover', axis: 'x', amp: 90, speed: 1.1 },
    { x: 3700, y: 390, w: 180, h: 24, type: 'stone' },
    { x: 3880, y: 430, w: 110, h: 24, type: 'mover', axis: 'y', amp: 80, speed: 1.3 },
    // Extend the far shelf under the vertical mover so a late jump still
    // lands on solid basalt instead of falling through the narrow seam.
    { x: 3980, y: 460, w: 620, h: 120, type: 'ground' },
    // ---- Section D: spike ledges between the shelf and the rockfall ----
    { x: 4560, y: 460, w: 420, h: 120, type: 'ground' },
    { x: 4660, y: 360, w: 120, h: 24, type: 'stone' },
    { x: 5000, y: 460, w: 420, h: 120, type: 'ground' },
    // A fixed basalt bridge keeps the late lava seam readable and
    // recoverable without requiring a pixel-perfect takeoff.
    { x: 5430, y: 460, w: 130, h: 24, type: 'stone' },
    // ---- Section E: twin falling-rock gauntlet ----
    { x: 5560, y: 460, w: 360, h: 120, type: 'ground' },
    { x: 5660, y: 350, w: 110, h: 24, type: 'stone' },
    { x: 6060, y: 460, w: 400, h: 120, type: 'ground' },
    { x: 6240, y: 360, w: 120, h: 24, type: 'stone' },
    // A fixed bridge removes the phase-sensitive final lava leap while
    // preserving the raised stone as an optional crystal route.
    { x: 6460, y: 390, w: 150, h: 24, type: 'stone' },
    // ---- Section F: home stretch to the ember nest ----
    { x: 6600, y: 460, w: 950, h: 120, type: 'ground' },
    { x: 6760, y: 372, w: 130, h: 24, type: 'stone' },
    { x: 6980, y: 312, w: 130, h: 24, type: 'stone' },
  ],
  crystals: [
    // Section A
    { x: 190, y: 425 }, { x: 260, y: 425 },
    { x: 460, y: 335 }, { x: 680, y: 263 }, { x: 900, y: 335 },
    // Section B
    { x: 1350, y: 425 }, { x: 1620, y: 425 },
    { x: 2015, y: 323 }, { x: 2265, y: 263 }, { x: 2515, y: 323 },
    // Moat
    { x: 3150, y: 425 }, { x: 3430, y: 383 }, { x: 3750, y: 353 }, { x: 3935, y: 293 },
    // Section C/D
    { x: 4180, y: 425 }, { x: 4330, y: 425 }, { x: 4720, y: 425 }, { x: 4720, y: 323 },
    // Section D
    { x: 5090, y: 425 }, { x: 5300, y: 425 },
    // Section E
    { x: 5610, y: 425 }, { x: 5715, y: 313 }, { x: 5880, y: 425 },
    { x: 6130, y: 425 }, { x: 6300, y: 323 },
    // Section F
    { x: 6700, y: 425 }, { x: 6825, y: 335 }, { x: 7045, y: 275, bonus: true },
    { x: 7170, y: 425 }, { x: 7320, y: 425 },
  ],
  enemies: [
    { type: 'beetle', x: 950, y: 432, minX: 850, maxX: 1100 },
    { type: 'beetle', x: 1500, y: 432, minX: 1290, maxX: 1650 },
    { type: 'trike', x: 2000, y: 424, minX: 1860, maxX: 2360 },
    { type: 'trike', x: 3080, y: 424, minX: 3020, maxX: 3290 },
    { type: 'ptero', x: 3500, y: 190, range: 70 },  // high patrol leaves the x-mover jump lane readable
    { type: 'ptero', x: 3950, y: 120, range: 100 }, // skyline patrol stays clear of the y-mover exit
    { type: 'beetle', x: 4700, y: 432, minX: 4600, maxX: 4930 },
    { type: 'ptero', x: 4750, y: 120, range: 90 },
    // The spike exit and lava bridge already provide the timing challenge;
    // leave this short shelf clear for a readable transition into the rocks.
    { type: 'ptero', x: 5700, y: 120, range: 90 },
    // The twin rockfall lane already supplies the timing challenge; removing
    // the overlapping patrol keeps the recovery shelf from becoming a blind
    // double-hit immediately after the bridge.
    { type: 'ptero', x: 6150, y: 120, range: 100 },
    { type: 'trike', x: 6300, y: 424, minX: 6090, maxX: 6440 },
    { type: 'beetle', x: 6800, y: 432, minX: 6650, maxX: 7100 },
    // Keep the final flyer as skyline atmosphere rather than a surprise
    // collision in the optional high-ledge landing corridor.
    { type: 'ptero', x: 7050, y: 100, range: 120 },
  ],
  hazards: [
    { type: 'spikes', x: 4330, y: 460, w: 70 },
    // The late shelf leads directly into the falling-rock gauntlet; keep its
    // landing readable instead of stacking a near-invisible spike hitbox at
    // the checkpoint exit.
    { type: 'lava', x: 2420, y: 520, w: 560 },
    { type: 'lava', x: 5430, y: 520, w: 130 },
    { type: 'lava', x: 6470, y: 520, w: 130 },
    { type: 'rocks', x: 5600, y: 460, w: 240, interval: 2.2 },
    { type: 'rocks', x: 6100, y: 460, w: 220, interval: 2.6 },
  ],
  checkpoints: [
    { x: 2340, y: 460 },
    { x: 4380, y: 460 },
    { x: 6420, y: 460 },
  ],
  hearts: [
    { x: 4300, y: 428 }, // safe ground after the lava moat
    { x: 6340, y: 332 }, // stone ledge above the rock gauntlet
  ],
  fossils: [
    { x: 2830, y: 393 }, // stepping stone mid-moat, lava on both sides
    { x: 5685, y: 313 }, // stone above the twin falling-rock gauntlet
    { x: 7010, y: 275 }, // high stone of the home-stretch jump chain
  ],
  notes: [
    { x: 2270, y: 436 }, // by the first flag
    { x: 5719, y: 313 }, // beside the stone above the twin falling-rock gauntlet
    { x: 6380, y: 436 }, // by the last flag
  ],
  goal: { x: 7350, y: 460 },
  decor: [
    { type: 'sign', x: 120 },
    { type: 'crystalrock', x: 260, s: 1.0 }, { type: 'flower', x: 700, color: '#c9a0ff' },
    { type: 'tuft', x: 400 }, { type: 'rock', x: 950 }, { type: 'bush', x: 1550 },
    { type: 'crystalrock', x: 1700, s: 1.1 }, { type: 'tuft', x: 1400 }, { type: 'tuft', x: 2500 },
    { type: 'rock', x: 2950 }, { type: 'tuft', x: 3200 },
    { type: 'crystalrock', x: 4050, s: 0.9 }, { type: 'rock', x: 4950 }, { type: 'bush', x: 4600 },
    { type: 'tuft', x: 4200 }, { type: 'crystalrock', x: 5500, s: 1.2 },
    { type: 'flower', x: 5200, color: '#ff8fa3' }, { type: 'tuft', x: 5300 },
    { type: 'tuft', x: 6100 }, { type: 'rock', x: 6550 },
    { type: 'crystalrock', x: 7450, s: 1.0 }, { type: 'tuft', x: 6800 },
  ],
};

// Level 3 — "Frostpeak Pass": a cold alpine pass. Springs launch Rex up to
// crystal ledges, pressure plates hold the ancient gates open, and spitter
// plants lob globs of sludge across the trail. Same ground line (y=460),
// ~8000px wide, the longest and most vertical of the three runs.
const LEVEL_3: LevelDef = {
  width: 8000,
  startX: 120,
  startY: 414, // 460 - player.h
  startGroundY: 460,
  platforms: [
    // ---- Section A: alpine opening (teach the mood) ----
    { x: 0, y: 460, w: 1500, h: 120, type: 'ground' },
    { x: 380, y: 372, w: 120, h: 24, type: 'stone' },
    { x: 620, y: 300, w: 120, h: 24, type: 'stone' },
    { x: 860, y: 372, w: 120, h: 24, type: 'stone' },
    // ---- Section B: the spring gardens (teach springs) ----
    { x: 1500, y: 460, w: 1000, h: 120, type: 'ground' },
    { x: 1860, y: 300, w: 130, h: 24, type: 'stone' }, // spring 1 ledge
    { x: 2380, y: 300, w: 200, h: 24, type: 'stone' }, // spring 2 ledge (wide enough to catch a full-speed spring launch)
    // ---- Section C: gate of the pass (spring → plate → door) ----
    { x: 2720, y: 460, w: 1360, h: 120, type: 'ground' },
    { x: 3150, y: 320, w: 150, h: 24, type: 'stone' }, // plate ledge
    // ---- Section D: spitter meadow ----
    // Carry the lower shelf through the late transition; the raised stone
    // remains an optional shortcut, while a missed hop never becomes a
    // one-life drop before the rockfall ridge.
    { x: 4080, y: 460, w: 1440, h: 120, type: 'ground' },
    { x: 4500, y: 380, w: 100, h: 24, type: 'stone' }, // spitter perch
    { x: 4900, y: 380, w: 100, h: 24, type: 'stone' }, // spitter perch
    { x: 4000, y: 390, w: 90, h: 24, type: 'mover', axis: 'x', amp: 60, speed: 1.0 }, // over gap
    // ---- Section E: rockfall ridge + bonus spring ledge ----
    { x: 5520, y: 460, w: 1080, h: 120, type: 'ground' },
    // Widen the late gap catch so a mistimed hop still lands safely before
    // the rockfall ridge.
    { x: 5360, y: 380, w: 230, h: 24, type: 'stone' },
    { x: 5900, y: 300, w: 130, h: 24, type: 'stone' }, // bonus spring ledge
    // ---- Section F: second gate, final spitter, goal ----
    { x: 6800, y: 460, w: 1200, h: 120, type: 'ground' },
    // Extend left to catch the spring's descending arc reliably.
    { x: 7160, y: 350, w: 190, h: 24, type: 'stone' }, // plate ledge
    { x: 7450, y: 380, w: 100, h: 24, type: 'stone' }, // spitter perch
  ],
  springs: [
    { x: 1750, y: 460 },
    { x: 2300, y: 460 },
    { x: 3000, y: 460 },
    { x: 5800, y: 460 },
    // Launch onto the pressure-plate ledge, not the lower spitter perch.
    { x: 6900, y: 460 },
  ],
  plates: [
    { x: 3200, y: 320, door: 0 },
    // Place the plate under the spring's reliable landing window so Rex can
    // hold it immediately instead of sliding off the ledge before it latches.
    { x: 7210, y: 350, door: 1 },
  ],
  doors: [
    { x: 3650, y: 310, w: 40, h: 150 },
    { x: 7600, y: 310, w: 40, h: 150 },
  ],
  crystals: [
    // Section A
    { x: 190, y: 425 }, { x: 260, y: 425 },
    { x: 440, y: 335 }, { x: 680, y: 263 }, { x: 920, y: 335 },
    { x: 1330, y: 380 }, { x: 1400, y: 360 }, { x: 1470, y: 380 }, // gap arc
    // Section B (spring gardens)
    { x: 1600, y: 425 },
    { x: 1774, y: 260 }, // spring 1 apex
    { x: 1925, y: 263 }, // spring 1 ledge
    { x: 2150, y: 425 },
    { x: 2324, y: 260 }, // spring 2 apex
    { x: 2445, y: 263 }, // spring 2 ledge
    // Section C (gate)
    { x: 2800, y: 425 }, { x: 2900, y: 425 },
    { x: 3024, y: 260 }, // spring 3 apex
    { x: 3225, y: 283 }, // plate ledge
    { x: 3750, y: 425 }, { x: 3830, y: 425 },
    { x: 4045, y: 353 }, // mover over gap
    // Section D (spitter meadow)
    { x: 4200, y: 425 }, { x: 4400, y: 425 },
    { x: 4550, y: 343 }, { x: 4950, y: 343 }, // perch grabs
    { x: 5150, y: 425 },
    // Section E (rockfall ridge)
    { x: 5445, y: 343 }, // gap stone
    { x: 5650, y: 425 },
    { x: 5824, y: 260 }, // bonus spring apex
    { x: 5965, y: 263, bonus: true }, // bonus ledge
    { x: 6250, y: 425 }, { x: 6450, y: 425 },
    { x: 6650, y: 380 }, { x: 6700, y: 360 }, { x: 6750, y: 380 }, // gap arc
    // Section F (second gate)
    { x: 6900, y: 425 },
    { x: 7074, y: 260 }, // spring apex
    { x: 7275, y: 283 }, // plate ledge
    { x: 7500, y: 343 }, // final perch
    { x: 7750, y: 425 },
  ],
  enemies: [
    { type: 'beetle', x: 1000, y: 432, minX: 900, maxX: 1250 },
    { type: 'spitter', x: 4540, y: 342 },
    { type: 'spitter', x: 4940, y: 342 },
    { type: 'beetle', x: 5200, y: 432, minX: 5100, maxX: 5280 },
    // Keep the ridge guard clear of the rockfall's first safe landing.
    { type: 'beetle', x: 5450, y: 432, minX: 5380, maxX: 5510 },
    { type: 'trike', x: 6250, y: 424, minX: 6200, maxX: 6520 },
    // Keep the final perch's glob threat local to the gate approach so the
    // lower route is not hit by projectiles fired before the spring jump.
    { type: 'spitter', x: 7490, y: 342, range: 90 },
    // Keep the final collectible's guard beyond the nest so the goal approach
    // remains a clean victory beat after the gate and spitter sequence.
    { type: 'beetle', x: 7920, y: 432, minX: 7880, maxX: 7990 },
  ],
  hazards: [
    { type: 'spikes', x: 3450, y: 460, w: 80 },
    { type: 'rocks', x: 5700, y: 460, w: 220, interval: 2.6 },
    { type: 'spikes', x: 6350, y: 460, w: 70 },
  ],
  checkpoints: [
    { x: 2780, y: 460 },
    { x: 4180, y: 460 },
    { x: 6860, y: 460 },
  ],
  hearts: [
    { x: 3720, y: 428 }, // just past the first gate
    { x: 7720, y: 428 }, // past the final gate, near the goal
  ],
  fossils: [
    { x: 3860, y: 425 }, // just behind the first gate
    { x: 5925, y: 263 }, // bonus spring ledge, high above the rockfall ridge
    { x: 7700, y: 425 }, // behind the final gate, patrolled by a beetle
  ],
  notes: [
    { x: 2850, y: 436 }, // by the first flag
    { x: 5891, y: 263 }, // beside the bonus spring ledge, high above the rockfall ridge
    { x: 7666, y: 425 }, // beside the fossil behind the final gate
  ],
  goal: { x: 7850, y: 460 },
  decor: [
    { type: 'sign', x: 120 },
    { type: 'crystalrock', x: 280, s: 1.0 }, { type: 'rock', x: 520 },
    { type: 'tuft', x: 420 }, { type: 'crystalrock', x: 980, s: 0.9 }, { type: 'tuft', x: 1150 },
    { type: 'tuft', x: 1550 }, { type: 'flower', x: 1700, color: '#c9a0ff' },
    { type: 'tuft', x: 2100 }, { type: 'crystalrock', x: 2450, s: 1.05 },
    { type: 'tuft', x: 2850 }, { type: 'rock', x: 3050 }, { type: 'tuft', x: 3400 },
    { type: 'crystalrock', x: 3800, s: 1.15 }, { type: 'tuft', x: 4250 }, { type: 'rock', x: 4700 },
    { type: 'tuft', x: 5050 }, { type: 'crystalrock', x: 5350, s: 0.9 }, { type: 'tuft', x: 5850 },
    { type: 'rock', x: 6150 }, { type: 'tuft', x: 6300 }, { type: 'crystalrock', x: 6550, s: 1.0 },
    { type: 'tuft', x: 6950 }, { type: 'flower', x: 7100, color: '#ff8fa3' },
    { type: 'tuft', x: 7350 }, { type: 'crystalrock', x: 7900, s: 1.2 },
  ],
};

// Molten Nest — the endgame: a short lava gauntlet into a walled boss arena.
// The Magma King guards the nest gate; defeating him latches the door open.
const LEVEL_4: LevelDef = {
  width: 3950,
  startX: 120,
  startY: 414,
  startGroundY: 460,
  platforms: [
    // ---- Approach: lava pits + a high fossil ledge ----
    { x: 0, y: 460, w: 900, h: 120, type: 'ground' },
    { x: 1020, y: 460, w: 500, h: 120, type: 'ground' },
    { x: 1650, y: 460, w: 530, h: 120, type: 'ground' },
    { x: 1300, y: 330, w: 120, h: 24, type: 'stone' }, // high ledge (fossil)
    // ---- Boss arena (walled) ----
    { x: 2244, y: 150, w: 40, h: 190, type: 'stone' }, // left wall (gap under = entry)
    { x: 2244, y: 460, w: 1100, h: 120, type: 'ground' }, // arena floor (runs under left wall)
    { x: 3344, y: 150, w: 40, h: 190, type: 'stone' }, // right wall (gap under = exit)
    // Orb perches. The left perch sits just right of the Magma King's left-wall
    // position so the pocket stomp arc (left edge 2282→~2467) clears its face and
    // the post-stomp bounce (landing left edge ~2586) comes down onto its top.
    { x: 2560, y: 320, w: 110, h: 24, type: 'stone' },
    { x: 3150, y: 320, w: 110, h: 24, type: 'stone' },
    { x: 2720, y: 250, w: 120, h: 24, type: 'stone' },
    // ---- Exit: nest gate + goal ----
    // Carry the exit floor under the arena wall so the post-boss victory run
    // cannot catch the forty-pixel seam as Rex leaves the room.
    { x: 3344, y: 460, w: 606, h: 120, type: 'ground' },
  ],
  crystals: [
    { x: 560, y: 420 }, { x: 700, y: 420 }, { x: 840, y: 420 },
    { x: 1180, y: 420 }, { x: 1330, y: 290 }, { x: 1390, y: 290 },
    { x: 1780, y: 420 }, { x: 2020, y: 420 },
    { x: 2400, y: 420 }, { x: 3240, y: 420 }, // arena floor
    { x: 2736, y: 212 }, { x: 2824, y: 212 }, // high perch
    { x: 3480, y: 420 },
  ],
  hazards: [
    { type: 'lava', x: 900, y: 520, w: 120 },
    { type: 'lava', x: 1520, y: 520, w: 130 },
    { type: 'lava', x: 2180, y: 520, w: 64 },
  ],
  checkpoints: [
    { x: 2100, y: 460 }, // just before the arena
  ],
  enemies: [
    { type: 'beetle', x: 1150, y: 432, minX: 1040, maxX: 1480 },
  ],
  hearts: [
    { x: 3560, y: 428 }, // in front of the nest gate
  ],
  fossils: [
    { x: 1352, y: 296 }, // high ledge in the approach
    { x: 3320, y: 428 }, // arena nook between boss patrol and right wall
    { x: 3720, y: 428 }, // behind the gate, near the nest
  ],
  notes: [
    { x: 2110, y: 436 }, // by the flag before the arena
    { x: 3286, y: 428 }, // arena nook beside the right wall
    { x: 3686, y: 428 }, // behind the gate, near the nest
  ],
  // minX (2400) keeps the Magma King's body 100px clear of the entry pocket
  // (2248..2300), so a full jump off the pocket crosses his stomp band over
  // his left half instead of clipping his left edge on the way up.
  boss: { x: 2760, y: 356, minX: 2400, maxX: 3160 },
  orbs: [
    { x: 2615, y: 286 }, // above the left perch (2560..2670)
    { x: 3205, y: 286 },
    { x: 2780, y: 216 },
  ],
  doors: [
    { x: 3600, y: 300, w: 36, h: 160 }, // nest gate — latches open on boss defeat
  ],
  goal: { x: 3780, y: 460 },
  decor: [
    { type: 'sign', x: 120 },
    { type: 'rock', x: 300 }, { type: 'crystalrock', x: 460, s: 0.9 },
    { type: 'rock', x: 2000 }, { type: 'crystalrock', x: 2060, s: 1.0 },
    { type: 'crystalrock', x: 2600, s: 1.1 },
    { type: 'crystalrock', x: 3700, s: 1.2 }, { type: 'rock', x: 3850 },
  ],
};

// Duskfen — Level 5. A drowned valley at twilight: the tide creeps in from
// the first second and, by the end of the run, has submerged the low ground
// (tops at 460) entirely. Safe route: keep to the canopy and elevated ledges
// (tops <= 446), which the waterline never reaches.
const LEVEL_5: LevelDef = {
  width: 7600,
  startX: 120,
  startY: 414,
  startGroundY: 460,
  tide: { fromY: 520, toY: 452, rate: 0.5 },
  platforms: [
    // ---- Section A: the fen's edge — dry intro (teach move + jump) ----
    { x: 0, y: 460, w: 1500, h: 120, type: 'ground' },
    { x: 320, y: 372, w: 130, h: 24, type: 'wood' },
    { x: 520, y: 300, w: 130, h: 24, type: 'wood' },
    { x: 760, y: 372, w: 130, h: 24, type: 'wood' },
    // ---- Section B: beetle bog — lowland with a water pit ----
    { x: 1500, y: 460, w: 520, h: 120, type: 'ground' },
    { x: 2140, y: 460, w: 1060, h: 120, type: 'ground' },
    { x: 2045, y: 398, w: 90, h: 24, type: 'wood' }, // step over the pit
    { x: 1780, y: 318, w: 120, h: 24, type: 'stone' }, // high fossil ledge
    { x: 1900, y: 420, w: 90, h: 24, type: 'wood' }, // dry hop (late-tide safe)
    { x: 2400, y: 420, w: 90, h: 24, type: 'wood' }, // dry hop
    { x: 2800, y: 420, w: 90, h: 24, type: 'wood' }, // dry hop
    // ---- Section C: the canopy — elevated route (always dry) ----
    { x: 3200, y: 460, w: 1400, h: 120, type: 'ground' },
    { x: 3300, y: 398, w: 140, h: 24, type: 'wood' },
    { x: 3540, y: 344, w: 140, h: 24, type: 'wood' },
    { x: 3790, y: 290, w: 150, h: 24, type: 'wood' }, // crown of the canopy
    { x: 4050, y: 344, w: 140, h: 24, type: 'wood' },
    { x: 4290, y: 398, w: 140, h: 24, type: 'wood' },
    // ---- Section D: flooded lowland — bridge, plate & door ----
    { x: 4600, y: 460, w: 600, h: 120, type: 'ground' },
    { x: 5560, y: 460, w: 1440, h: 120, type: 'ground' },
    { x: 4700, y: 420, w: 100, h: 24, type: 'wood' }, // dry hop
    { x: 4950, y: 420, w: 100, h: 24, type: 'wood' }, // plate ledge (dry hop)
    { x: 5230, y: 430, w: 80, h: 20, type: 'crumble' }, // the crumble bridge
    { x: 5350, y: 430, w: 80, h: 20, type: 'crumble' },
    { x: 5470, y: 430, w: 90, h: 20, type: 'crumble' },
    { x: 6020, y: 330, w: 110, h: 24, type: 'stone' }, // fossil perch before the vale hops
    // ---- Section E: the drowned vale — dry hops to the spring & nest rock ----
    { x: 7140, y: 460, w: 460, h: 120, type: 'ground' },
    { x: 6200, y: 420, w: 110, h: 24, type: 'wood' }, // dry hop
    { x: 6500, y: 420, w: 110, h: 24, type: 'wood' }, // dry hop
    { x: 6800, y: 420, w: 110, h: 24, type: 'wood' }, // dry hop
    { x: 7160, y: 340, w: 220, h: 24, type: 'stone' }, // the nest rock (goal)
  ],
  springs: [
    { x: 3255, y: 460 }, // up into the canopy
    { x: 6950, y: 460 }, // the final launch onto the nest rock
  ],
  plates: [
    { x: 4980, y: 420, door: 0 },
  ],
  doors: [
    { x: 5150, y: 310, w: 40, h: 150 }, // the sunken gate
  ],
  crystals: [
    // Section A
    { x: 190, y: 425 }, { x: 260, y: 425 },
    { x: 385, y: 335 }, { x: 585, y: 263 }, { x: 825, y: 335 },
    { x: 1100, y: 425 }, { x: 1240, y: 425 }, { x: 1380, y: 425 },
    // Section B
    { x: 1560, y: 425 }, { x: 1660, y: 425 },
    { x: 1840, y: 282 }, // high ledge
    { x: 2090, y: 362 }, // pit arc
    { x: 2300, y: 425 }, { x: 2430, y: 425 }, { x: 2600, y: 425 },
    { x: 2870, y: 425 }, { x: 3050, y: 425 },
    // Section C (canopy)
    { x: 3350, y: 362 }, { x: 3590, y: 308 }, { x: 3860, y: 254 },
    { x: 4100, y: 308 }, { x: 4340, y: 362 },
    { x: 3400, y: 425 }, { x: 4000, y: 425 }, { x: 4230, y: 425 },
    // Section D
    { x: 4680, y: 425 }, { x: 4800, y: 384 }, { x: 5000, y: 384 },
    { x: 5250, y: 393 }, { x: 5370, y: 393 }, { x: 5490, y: 393 }, // bridge
    { x: 5620, y: 425 }, { x: 5850, y: 425 },
    // Section E
    { x: 6100, y: 425 }, { x: 6300, y: 384 }, { x: 6500, y: 384 },
    { x: 6700, y: 425 }, { x: 6900, y: 425 },
    { x: 7050, y: 340 }, { x: 7160, y: 300 }, // spring flight
    { x: 7280, y: 304 }, { x: 7380, y: 304 }, // on the nest rock
  ],
  hazards: [
    { type: 'lava', x: 2020, y: 520, w: 120 }, // the bog pit (the tide will drown it)
    { type: 'spikes', x: 5750, y: 460, w: 70 }, // sunken teeth on the low ground
  ],
  // Checkpoints sit on the dry-hop ledges (tops <= 446) so a late respawn —
  // when the tide has submerged the low ground — is never a death trap.
  checkpoints: [
    { x: 1900, y: 420 }, // the bog (dry hop before the pit)
    { x: 4290, y: 398 }, // the canopy edge
    { x: 6200, y: 420 }, // the drowned vale (dry hop)
  ],
  enemies: [
    { type: 'beetle', x: 2500, y: 432, minX: 2350, maxX: 2900 },
    { type: 'ptero', x: 3700, y: 240, range: 140 },
    { type: 'spitter', x: 4080, y: 306 },
    { type: 'ptero', x: 4350, y: 250, range: 120 },
    { type: 'trike', x: 5700, y: 424, minX: 5600, maxX: 6000 },
    // Give the late checkpoint a clean exit before the vale beetle patrol.
    { type: 'beetle', x: 6400, y: 432, minX: 6350, maxX: 6600 },
    // Keep the final flight above the dry-hop arc so the spring approach
    // stays readable instead of turning into a blind midair collision.
    { type: 'ptero', x: 6600, y: 160, range: 130 },
  ],
  hearts: [
    { x: 2700, y: 428 }, // the bog
    { x: 3990, y: 425 }, // under the canopy
    { x: 5620, y: 425 }, // past the crumble bridge
    { x: 6900, y: 425 }, // by the final spring
    { x: 7240, y: 306 }, // on the nest rock
  ],
  fossils: [
    { x: 1842, y: 294 }, // high ledge in the bog
    { x: 3855, y: 256 }, // crown of the canopy
    { x: 6075, y: 306 }, // perch before the vale hops
  ],
  notes: [
    { x: 2210, y: 436 }, // the bog
    { x: 3560, y: 310 }, // mid-canopy
    { x: 7350, y: 428 }, // on the nest ground
  ],
  goal: { x: 7280, y: 340 },
  decor: [
    { type: 'sign', x: 120 },
    { type: 'tree', x: 220, s: 1.1 }, { type: 'flower', x: 420, color: '#c9a0ff' },
    { type: 'tuft', x: 650 }, { type: 'tree', x: 900, s: 0.95 },
    { type: 'crystalrock', x: 1150, s: 1.0 }, { type: 'tuft', x: 1400 },
    { type: 'tuft', x: 1550 }, { type: 'tree', x: 1950, s: 1.05 }, { type: 'bush', x: 2180 },
    { type: 'tuft', x: 2350 }, { type: 'bush', x: 2650 }, { type: 'tuft', x: 2950 },
    { type: 'flower', x: 3100, color: '#ff8fa3' }, { type: 'tree', x: 3450, s: 1.2 },
    { type: 'tuft', x: 3650 }, { type: 'tree', x: 3950, s: 1.1 }, { type: 'tuft', x: 4150 },
    { type: 'bush', x: 4400 }, { type: 'tuft', x: 4550 }, { type: 'rock', x: 4680 },
    { type: 'tuft', x: 4880 }, { type: 'bush', x: 5100 }, { type: 'tuft', x: 5420 },
    { type: 'rock', x: 5520 }, { type: 'tuft', x: 5700 }, { type: 'tree', x: 5950, s: 1.05 },
    { type: 'tuft', x: 6150 }, { type: 'bush', x: 6400 }, { type: 'tuft', x: 6650 },
    { type: 'rock', x: 6850 }, { type: 'tuft', x: 7050 }, { type: 'crystalrock', x: 7450, s: 1.15 },
    { type: 'tuft', x: 7520 },
  ],
};

export const LEVELS: LevelInfo[] = [
  { id: 0, name: 'Crystal Valley', subtitle: 'CRYSTAL VALLEY', theme: 'meadow', def: LEVEL_1 },
  { id: 1, name: 'Volcanic Depths', subtitle: 'VOLCANIC DEPTHS', theme: 'volcanic', def: LEVEL_2 },
  { id: 2, name: 'Frostpeak Pass', subtitle: 'FROSTPEAK PASS', theme: 'frost', def: LEVEL_3 },
  { id: 3, name: 'Molten Nest', subtitle: 'MOLTEN NEST', theme: 'volcanic', def: LEVEL_4 },
  { id: 4, name: 'Duskfen', subtitle: 'DUSKFEN', theme: 'dusk', def: LEVEL_5 },
];

/** Backward-compatible handle for the original level (Crystal Valley). */
export const LEVEL_DATA: LevelDef = LEVEL_1;
