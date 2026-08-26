/** Declarative level content, ported verbatim from the original game.js ("Crystal Valley"). */

export type PlatformType = 'ground' | 'wood' | 'stone' | 'crumble' | 'mover';
export type EnemyType = 'beetle' | 'trike' | 'ptero';
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
}

export type LevelTheme = 'meadow' | 'volcanic';

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
    { x: 0, y: 460, w: 1150, h: 120, type: 'ground' },
    { x: 320, y: 372, w: 130, h: 24, type: 'wood' },
    { x: 520, y: 300, w: 130, h: 24, type: 'wood' },
    { x: 760, y: 372, w: 130, h: 24, type: 'wood' },
    { x: 1010, y: 412, w: 48, h: 24, type: 'crumble' },
    { x: 1068, y: 364, w: 48, h: 24, type: 'crumble' },
    // ---- Section B: first enemies + small gaps ----
    { x: 1230, y: 460, w: 400, h: 120, type: 'ground' },
    { x: 1710, y: 460, w: 690, h: 120, type: 'ground' },
    { x: 1860, y: 372, w: 120, h: 24, type: 'stone' },
    { x: 2040, y: 312, w: 120, h: 24, type: 'stone' },
    { x: 2210, y: 372, w: 120, h: 24, type: 'stone' },
    // ---- Section C: spikes, bonus route, first lava pool ----
    { x: 2480, y: 460, w: 320, h: 120, type: 'ground' },
    { x: 2580, y: 360, w: 160, h: 24, type: 'stone' },
    { x: 2880, y: 460, w: 270, h: 120, type: 'ground' },
    { x: 2950, y: 350, w: 110, h: 24, type: 'stone' },
    // elevated bonus route (hidden-ish, needs the jump chain)
    { x: 3080, y: 260, w: 110, h: 24, type: 'stone' },
    { x: 3220, y: 200, w: 130, h: 24, type: 'stone' },
    { x: 3200, y: 400, w: 110, h: 24, type: 'stone' }, // stepping stone over lava A
    { x: 3350, y: 460, w: 120, h: 120, type: 'ground' },
    // ---- Section D: moving platforms over the lava river ----
    { x: 3470, y: 390, w: 100, h: 24, type: 'stone' },
    { x: 3540, y: 430, w: 110, h: 24, type: 'mover', axis: 'x', amp: 100, speed: 1.0 },
    { x: 3760, y: 390, w: 100, h: 24, type: 'stone' },
    { x: 3920, y: 430, w: 110, h: 24, type: 'mover', axis: 'y', amp: 90, speed: 1.2 },
    { x: 4080, y: 390, w: 100, h: 24, type: 'stone' },
    { x: 4230, y: 420, w: 110, h: 24, type: 'mover', axis: 'x', amp: 120, speed: 0.9 },
    { x: 4470, y: 460, w: 330, h: 120, type: 'ground' },
    { x: 4650, y: 360, w: 120, h: 24, type: 'stone' },
    // ---- Section E: checkpoint 2, ptero & spike gauntlet ----
    { x: 4880, y: 460, w: 420, h: 120, type: 'ground' },
    { x: 4970, y: 360, w: 130, h: 24, type: 'stone' },
    // ---- Section F: falling rocks, lava pit B, last enemies ----
    { x: 5300, y: 460, w: 400, h: 120, type: 'ground' },
    { x: 5480, y: 350, w: 110, h: 24, type: 'stone' },
    { x: 5430, y: 412, w: 48, h: 24, type: 'crumble' },
    { x: 5950, y: 460, w: 450, h: 120, type: 'ground' },
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
    { x: 2930, y: 425 }, { x: 3005, y: 313 },
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
    { type: 'trike', x: 2930, y: 424, minX: 2895, maxX: 3060 },
    { type: 'ptero', x: 3250, y: 320, range: 90 },
    { type: 'ptero', x: 3950, y: 290, range: 150 },
    { type: 'ptero', x: 4230, y: 250, range: 130 },
    { type: 'ptero', x: 4700, y: 240, range: 120 },
    { type: 'trike', x: 4700, y: 424, minX: 4500, maxX: 4780 },
    { type: 'beetle', x: 5150, y: 432, minX: 5050, maxX: 5280 },
    { type: 'ptero', x: 5500, y: 250, range: 110 },
    { type: 'beetle', x: 6100, y: 432, minX: 5990, maxX: 6350 },
    { type: 'trike', x: 6250, y: 424, minX: 6050, maxX: 6380 },
    { type: 'beetle', x: 6900, y: 432, minX: 6700, maxX: 7050 },
  ],
  hazards: [
    { type: 'spikes', x: 2620, y: 460, w: 80 },
    { type: 'lava', x: 3150, y: 520, w: 200 },
    { type: 'lava', x: 3470, y: 520, w: 1000 },
    { type: 'spikes', x: 5000, y: 460, w: 70 },
    { type: 'rocks', x: 5380, y: 460, w: 240, interval: 2.0 },
    { type: 'lava', x: 5700, y: 520, w: 250 },
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
    { x: 2450, y: 360, w: 130, h: 24, type: 'stone' },
    // ---- Section C: the lava moat (stepping stones → mover → stone → y-mover) ----
    { x: 2560, y: 430, w: 100, h: 24, type: 'stone' },
    { x: 2780, y: 430, w: 100, h: 24, type: 'stone' },
    { x: 3000, y: 460, w: 300, h: 120, type: 'ground' },
    { x: 3380, y: 420, w: 100, h: 24, type: 'mover', axis: 'x', amp: 90, speed: 1.1 },
    { x: 3700, y: 390, w: 100, h: 24, type: 'stone' },
    { x: 3880, y: 430, w: 110, h: 24, type: 'mover', axis: 'y', amp: 80, speed: 1.3 },
    { x: 4100, y: 460, w: 320, h: 120, type: 'ground' },
    // ---- Section D: spike ledges between the shelf and the rockfall ----
    { x: 4560, y: 460, w: 380, h: 120, type: 'ground' },
    { x: 4660, y: 360, w: 120, h: 24, type: 'stone' },
    { x: 5000, y: 460, w: 420, h: 120, type: 'ground' },
    // ---- Section E: twin falling-rock gauntlet ----
    { x: 5560, y: 460, w: 360, h: 120, type: 'ground' },
    { x: 5660, y: 350, w: 110, h: 24, type: 'stone' },
    { x: 6060, y: 460, w: 400, h: 120, type: 'ground' },
    { x: 6240, y: 360, w: 120, h: 24, type: 'stone' },
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
    { type: 'ptero', x: 3500, y: 320, range: 90 },
    { type: 'ptero', x: 3950, y: 280, range: 120 },
    { type: 'beetle', x: 4700, y: 432, minX: 4600, maxX: 4930 },
    { type: 'ptero', x: 4750, y: 250, range: 110 },
    { type: 'trike', x: 5200, y: 424, minX: 5040, maxX: 5400 },
    { type: 'ptero', x: 5700, y: 260, range: 100 },
    { type: 'beetle', x: 5800, y: 432, minX: 5580, maxX: 5910 },
    { type: 'ptero', x: 6150, y: 250, range: 130 },
    { type: 'trike', x: 6300, y: 424, minX: 6090, maxX: 6440 },
    { type: 'beetle', x: 6800, y: 432, minX: 6650, maxX: 7100 },
    { type: 'ptero', x: 7050, y: 240, range: 120 },
  ],
  hazards: [
    { type: 'spikes', x: 4330, y: 460, w: 70 },
    { type: 'spikes', x: 5100, y: 460, w: 80 },
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

export const LEVELS: LevelInfo[] = [
  { id: 0, name: 'Crystal Valley', subtitle: 'CRYSTAL VALLEY', theme: 'meadow', def: LEVEL_1 },
  { id: 1, name: 'Volcanic Depths', subtitle: 'VOLCANIC DEPTHS', theme: 'volcanic', def: LEVEL_2 },
];

/** Backward-compatible handle for the original level (Crystal Valley). */
export const LEVEL_DATA: LevelDef = LEVEL_1;
