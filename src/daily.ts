/**
 * Daily Rex: one procedurally generated level per calendar day.
 * The generator is fully deterministic (mulberry32 seeded by YYYYMMDD) and
 * emits the same LevelDef shape as the hand-built levels, so collision,
 * scoring, stars, and tooling all work unchanged.
 */
import { mulberry32 } from './util';
import type { LevelDef, LevelInfo, LevelTheme, PlatformDef } from './level-data';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** YYYYMMDD of the local date (default: today). One level per day. */
export function dailySeed(date: Date = new Date()): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

/** Menu/victory label for a daily seed, e.g. "Daily · Aug 26". */
export function dailyLabel(seed: number): string {
  const m = Math.floor((seed % 10000) / 100) - 1;
  return `Daily · ${MONTHS[m] ?? '?'} ${seed % 100}`;
}

/** Shareable seed: uppercase base36, zero-padded to 6 chars. */
export function rexCode(seed: number): string {
  return seed.toString(36).toUpperCase().padStart(6, '0');
}

/** Inverse of rexCode; null when the code is malformed. */
export function parseRexCode(code: string): number | null {
  if (!/^[0-9A-Z]{1,6}$/.test(code)) return null;
  const n = parseInt(code, 36);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

const THEMES: LevelTheme[] = ['meadow', 'volcanic', 'frost'];
const GY = 460; // ground top, same as the hand-built levels
const FLOWER_COLORS = ['#ff8fa3', '#c9a0ff', '#ffd257'];

interface Segment {
  x0: number;
  x1: number;
  hasSpikes: boolean;
  hasRocks: boolean;
  tier1: PlatformDef | null;
}

/** Deterministic daily level: same seed → identical LevelDef. */
export function generateDailyLevel(seed: number): LevelInfo {
  const rnd = mulberry32(seed);
  const ri = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
  const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  const theme = THEMES[seed % THEMES.length];

  const def: LevelDef = {
    width: 0,
    startX: 120,
    startY: 414,
    startGroundY: GY,
    platforms: [],
    crystals: [],
    hazards: [],
    checkpoints: [],
    enemies: [],
    hearts: [],
    goal: { x: 0, y: GY },
    decor: [{ type: 'sign', x: 120 }],
  };
  const segs: Segment[] = [];
  let x = 0;

  const ground = (w: number) => {
    def.platforms.push({ x, y: GY, w, h: 120, type: 'ground' });
    x += w;
  };

  // ---- Opening ground ----
  ground(900);

  const segCount = ri(8, 10);
  for (let i = 0; i < segCount; i++) {
    // Pit (always jumpable: ≤140px; sometimes lava in the bottom)
    const pit = ri(60, 140);
    x += pit;
    if (rnd() < 0.5) def.hazards.push({ type: 'lava', x: x - pit, y: 520, w: pit });

    const w = ri(360, 700);
    const seg: Segment = { x0: x, x1: x + w, hasSpikes: false, hasRocks: false, tier1: null };
    ground(w);
    segs.push(seg);

    // Spikes (mid-run segments only)
    if (i >= 3 && rnd() < 0.3) {
      seg.hasSpikes = true;
      def.hazards.push({ type: 'spikes', x: seg.x0 + ri(80, Math.max(81, w - 170)), y: GY, w: ri(70, 90) });
    }
    // Falling rocks on wide, spike-free stretches
    if (!seg.hasSpikes && w >= 450 && rnd() < 0.15) {
      seg.hasRocks = true;
      def.hazards.push({ type: 'rocks', x: seg.x0 + w / 2 - 100, y: GY, w: 200, interval: 2.2 });
    }

    // Tier-1 platform (reachable straight from the ground)
    if (i >= 1 && rnd() < 0.8) {
      const pw = ri(110, 130);
      const t1: PlatformDef = {
        // Leave a readable run-up after each pit before the first step.
        x: seg.x0 + ri(140, Math.max(141, w - pw - 40)),
        y: GY - ri(50, 80),
        w: pw,
        h: 24,
        type: rnd() < 0.6 ? 'wood' : 'stone',
      };
      def.platforms.push(t1);
      seg.tier1 = t1;
      def.crystals.push({ x: t1.x + t1.w / 2, y: t1.y - 35 });
      // Tier-2 platform above a tier-1 (step ≤110px)
      if (rnd() < 0.45) {
        // Keep the upper tier after the lower one. A tier that starts behind
        // its approach slab can be mistaken for the primary target, causing
        // a full jump from the floor to overshoot both platforms.
        const t2Min = t1.x + t1.w + 20;
        const t2Max = Math.min(t1.x + t1.w + 140, seg.x1 - 140);
        if (t2Max >= t2Min) {
          const t2: PlatformDef = {
            x: ri(t2Min, t2Max),
            y: t1.y - ri(40, 70),
            w: ri(100, 120),
            h: 24,
            type: 'stone',
          };
          def.platforms.push(t2);
          def.crystals.push({ x: t2.x + t2.w / 2, y: t2.y - 35, bonus: rnd() < 0.35 });
        }
      }
    }
    const floorHazard = def.hazards.find((h) =>
      (h.type === 'spikes' || h.type === 'rocks') && h.x >= seg.x0 && h.x < seg.x1);
    if (floorHazard) {
      // A floor hazard directly below a tier platform can turn the intended
      // landing into an unavoidable hit. Relocate it to open floor space so
      // every generated hazard retains readable counterplay.
      const candidates: number[] = [];
      for (let sx = seg.x0 + 40; sx <= seg.x1 - floorHazard.w - 40; sx += 10) candidates.push(sx);
      const originalX = floorHazard.x;
      const open = candidates
        .filter((sx) => !def.platforms.some((pl) =>
          pl.y < GY && pl.x < sx + floorHazard.w + 12 && pl.x + pl.w > sx - 12))
        .sort((a, b) => Math.abs(a - originalX) - Math.abs(b - originalX))[0];
      if (open !== undefined) floorHazard.x = open;
      else {
        // A wide rockfall may have no clear floor slot in a compact segment.
        // Omit it rather than making the only elevated route random damage.
        const hazardIndex = def.hazards.indexOf(floorHazard);
        if (hazardIndex >= 0) def.hazards.splice(hazardIndex, 1);
        if (floorHazard.type === 'rocks') seg.hasRocks = false;
        else seg.hasSpikes = false;
      }
    }

    // Ground crystal (skip when spikes occupy the floor); every segment is
    // guaranteed at least one crystal so no daily run is content-light.
    const segCrystalsBefore = def.crystals.length;
    if (!seg.hasSpikes && rnd() < 0.7) {
      def.crystals.push({ x: seg.x0 + ri(40, w - 60), y: GY - 35 });
    }
    if (def.crystals.length === segCrystalsBefore) {
      def.crystals.push({ x: seg.x0 + w / 2, y: GY - 35 });
    }

    // Enemy: one per segment, never in the first two
    if (i >= 2) {
      const roll = rnd();
      if (roll < 0.55) {
        def.enemies.push({ type: 'ptero', x: seg.x0 + w / 2, y: ri(250, 300), range: ri(100, 150) });
      } else {
        let patrol = ri(120, Math.min(250, w - 120));
        let ex = seg.x0 + ri(60, Math.max(61, w - patrol - 60));
        // Do not place a ground walker directly under the landing line from
        // an elevated ledge. The player is still airborne while dropping to
        // the lower floor, so this otherwise creates an unavoidable collision
        // before the enemy-hop counterplay becomes available.
        const elevatedEnds = def.platforms
          .filter((pl) => pl.y < GY && pl.x >= seg.x0 && pl.x < seg.x1)
          .map((pl) => pl.x + pl.w);
        if (elevatedEnds.length) {
          const clearStart = Math.max(...elevatedEnds) + 160;
          if (clearStart + patrol > seg.x1 - 24 && clearStart < seg.x1 - 124) {
            patrol = Math.max(120, seg.x1 - clearStart - 24);
          }
          if (clearStart + patrol <= seg.x1 - 24 && ex < clearStart) ex = clearStart;
        }
        const type = rnd() < 0.5 ? 'beetle' : 'trike';
        def.enemies.push({ type, x: ex + patrol / 2, y: type === 'beetle' ? 432 : 424, minX: ex, maxX: ex + patrol });
      }
    }

    // Checkpoints at ~30/60/85% progress, on spike- and rock-free segments
    const frac = (i + 1) / segCount;
    if (!seg.hasSpikes && !seg.hasRocks && (frac > 0.28 && frac < 0.42 || frac > 0.55 && frac < 0.7 || frac > 0.82)) {
      def.checkpoints.push({ x: seg.x0 + w / 2, y: GY });
    }

    // Springs: occasionally on the floor
    if (i === 2 || (i === 6 && rnd() < 0.7)) {
      def.springs = def.springs ?? [];
      def.springs.push({ x: seg.x0 + ri(60, w - 100), y: GY });
    }

    // Hearts at ~45% and ~75%
    const hf = (i + 1) / segCount;
    if (!seg.hasSpikes && (Math.abs(hf - 0.45) < 0.11 || Math.abs(hf - 0.75) < 0.11)) {
      def.hearts.push({ x: seg.x0 + w / 2, y: GY - 32 });
    }

    // Decor (theme-appropriate, on this segment's floor)
    const n = ri(3, 5);
    for (let d = 0; d < n; d++) {
      const dx = seg.x0 + ri(20, w - 40);
      const roll = rnd();
      if (theme === 'meadow') {
        if (roll < 0.4) def.decor.push({ type: 'tree', x: dx, s: ri(85, 125) / 100 });
        else if (roll < 0.6) def.decor.push({ type: 'bush', x: dx });
        else if (roll < 0.85) def.decor.push({ type: 'flower', x: dx, color: pick(FLOWER_COLORS) });
        else def.decor.push({ type: 'tuft', x: dx });
      } else if (theme === 'volcanic') {
        if (roll < 0.5) def.decor.push({ type: 'rock', x: dx });
        else if (roll < 0.85) def.decor.push({ type: 'crystalrock', x: dx, s: ri(90, 115) / 100 });
        else def.decor.push({ type: 'tuft', x: dx });
      } else {
        if (roll < 0.5) def.decor.push({ type: 'crystalrock', x: dx, s: ri(90, 120) / 100 });
        else if (roll < 0.8) def.decor.push({ type: 'rock', x: dx });
        else def.decor.push({ type: 'tuft', x: dx });
      }
    }
  }

  // ---- Home stretch: safe run to the nest ----
  x += ri(60, 100);
  const homeStart = x;
  const homeW = ri(650, 900);
  ground(homeW);

  // Guarantee at least one checkpoint: prefer a mid-run safe segment,
  // otherwise the (always hazard-free) home stretch.
  if (def.checkpoints.length === 0) {
    const safe = segs.filter((s) => !s.hasSpikes && !s.hasRocks);
    const pick = safe[Math.floor(safe.length / 2)];
    def.checkpoints.push(pick ? { x: (pick.x0 + pick.x1) / 2, y: GY } : { x: homeStart + 100, y: GY });
  }
  def.decor.push({ type: 'tuft', x: x - homeW + 100 });
  def.decor.push({ type: theme === 'meadow' ? 'flower' : 'crystalrock', x: x - homeW + 200 });
  def.goal = { x: x - 120, y: GY };
  def.width = x;

  return { id: -1, name: 'Daily Challenge', subtitle: 'DAILY CHALLENGE', theme, def };
}
