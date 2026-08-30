import type { Difficulty } from './config';
import type { GhostTrack } from './ghost';
import { MIN_TRACK_POINTS, MAX_POINTS } from './ghost';
import { SKINS } from './sprite';

const MAX_STARS = 3;

function cleanScore(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0;
}

function cleanTime(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Corrupt/legacy best records degrade to a clean zero state instead of
 * leaking NaN into scoring (e.g. a score of `Infinity` from an old build).
 */
function cleanBest(v: unknown): { score: number; time: number | null } {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return { score: v, time: null };
  if (!v || typeof v !== 'object') return { score: 0, time: null };
  const b = v as { score?: unknown; time?: unknown };
  return { score: cleanScore(b.score), time: cleanTime(b.time) };
}

function cleanStars(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 0;
  return Math.min(MAX_STARS, Math.max(0, n));
}

const SKIN_IDS: string[] = SKINS.map((s) => s.id);

/** Lifetime play statistics shown on the main menu. */
export interface GameStats {
  runs: number;
  deaths: number;
  crystals: number;
  victories: number;
  /** Hearts restored from pickups, all-time. */
  hearts: number;
  /** Epoch ms of the first play; null before the first run. */
  firstPlayed: number | null;
  /** True once every handcrafted level has been completed at least once. */
  allClear: boolean;
}

export function getStats(): GameStats {
  // Normalize so stats saved before a field existed still read safely.
  const s = Store.get<Partial<GameStats>>('tinyrex_stats', {});
  return {
    runs: s.runs ?? 0,
    deaths: s.deaths ?? 0,
    crystals: s.crystals ?? 0,
    victories: s.victories ?? 0,
    hearts: s.hearts ?? 0,
    firstPlayed: s.firstPlayed ?? null,
    allClear: s.allClear ?? false,
  };
}

/** Best score/time for one level (falls back to the legacy global key for level 0). */
export function getBest(idx: number): { score: number; time: number | null } {
  const b = Store.get<unknown>('tinyrex_best_' + idx, null);
  if (b) return cleanBest(b);
  if (idx === 0) return cleanBest(Store.get<unknown>('tinyrex_best_score', null));
  return { score: 0, time: null };
}

export function getBestStars(idx: number): number {
  return cleanStars(Store.get<unknown>('tinyrex_stars_' + idx, 0));
}

/** Best score/time for today's Daily Rex challenge. */
export function getDailyBest(): { score: number; time: number | null } {
  return cleanBest(Store.get<unknown>('tinyrex_best_daily', null));
}

/** Best star rating for the current Daily Rex challenge (0–3). */
export function getDailyStars(): number {
  return cleanStars(Store.get<unknown>('tinyrex_stars_daily', 0));
}

/** Ghost race toggle (default on). */
export function getGhostEnabled(): boolean {
  return Store.get('tinyrex_ghost_on', true);
}

export function setGhostEnabled(on: boolean): void {
  Store.set('tinyrex_ghost_on', on);
}

/**
 * Best-run ghost track for a selection. idx = level index for hand-built
 * levels, -1 for Daily Rex (whose track is only valid for the seed it was
 * recorded on, `date`).
 */
export function getGhostTrack(idx: number, date: number): GhostTrack | null {
  const key = idx === -1 ? 'tinyrex_ghost_daily' : 'tinyrex_ghost_' + idx;
  const t = Store.get<unknown>(key, null);
  if (!t || typeof t !== 'object') return null;
  const track = t as GhostTrack;
  if (idx === -1 && track.date !== date) return null;
  if (
    !Array.isArray(track.pts) ||
    track.pts.length < MIN_TRACK_POINTS ||
    track.pts.length > MAX_POINTS
  ) return null;
  if (typeof track.score !== 'number' || !Number.isFinite(track.score)) return null;
  if (typeof track.time !== 'number' || !Number.isFinite(track.time) || track.time <= 0) return null;
  // Every sample must be finite and the clock must never run backwards —
  // a broken track would make GhostPlayer interpolate NaN or jump in time.
  let prevT = -Infinity;
  for (const p of track.pts) {
    if (!p || typeof p.t !== 'number' || typeof p.x !== 'number' || typeof p.y !== 'number') return null;
    if (!Number.isFinite(p.t) || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    if (p.t < prevT) return null;
    prevT = p.t;
  }
  return track;
}

export function saveGhostTrack(idx: number, track: GhostTrack): void {
  const key = idx === -1 ? 'tinyrex_ghost_daily' : 'tinyrex_ghost_' + idx;
  Store.set(key, track);
}

/**
 * Found fossil ids ("<levelIdx>:<i>"), persistent across runs. A fossil can
 * be re-collected for score on later runs, but only the first discovery
 * counts toward the codex.
 */
export function getFoundFossils(): string[] {
  const v = Store.get<string[] | null>('tinyrex_fossils', null);
  return Array.isArray(v) ? v : [];
}

/** Record a fossil discovery; no-op when it is already in the codex. */
export function findFossil(id: string): void {
  const found = getFoundFossils();
  if (found.includes(id)) return;
  Store.set('tinyrex_fossils', [...found, id]);
}

/**
 * Found field-note ids ("<levelIdx>:<i>"), persistent across runs. A note
 * can be re-collected for score on later runs, but only the first
 * discovery counts toward the codex.
 */
export function getFoundNotes(): string[] {
  const v = Store.get<string[] | null>('tinyrex_notes', null);
  return Array.isArray(v) ? v : [];
}

/** Record a note discovery; no-op when it is already in the codex. */
export function findNote(id: string): void {
  const found = getFoundNotes();
  if (found.includes(id)) return;
  Store.set('tinyrex_notes', [...found, id]);
}

/** One finished run, kept in the Hall of Claws leaderboard. */
export interface RunRecord {
  score: number;
  /** Run time in seconds, or null when untracked. */
  time: number | null;
  /** Display name of the level (e.g. "Crystal Valley" or "Daily · Aug 26"). */
  level: string;
  difficulty: Difficulty;
  /** Epoch ms when the run finished. */
  date: number;
}

/** Number of runs the Hall of Claws keeps (newest kept, oldest dropped). */
export const MAX_RUNS = 100;

/** All recorded runs, newest first; corrupt storage reads as empty. */
export function getRuns(): RunRecord[] {
  const v = Store.get<RunRecord[] | null>('tinyrex_runs', null);
  if (!Array.isArray(v)) return [];
  return v.filter((r) => r && typeof r.score === 'number' && typeof r.level === 'string');
}

/** Append a finished run to the hall, keeping the newest MAX_RUNS. */
export function addRun(r: RunRecord): void {
  Store.set('tinyrex_runs', [r, ...getRuns()].slice(0, MAX_RUNS));
}

/** The top n runs by score (ties broken by shorter time). */
export function topRuns(n: number): RunRecord[] {
  return [...getRuns()]
    .sort((a, b) => b.score - a.score || (a.time ?? 1e9) - (b.time ?? 1e9))
    .slice(0, n);
}

export function clearRuns(): void {
  Store.set('tinyrex_runs', []);
}

/** Selected Rex skin id; unknown/corrupt values fall back to Classic. */
export function getSkinId(): string {
  const v = Store.get<string | null>('tinyrex_skin', null);
  return v && SKIN_IDS.includes(v) ? v : 'classic';
}

/** Persist the selected Rex skin (validated against SKINS). */
export function setSkinId(id: string): void {
  Store.set('tinyrex_skin', SKIN_IDS.includes(id) ? id : 'classic');
}

/** Safe localStorage wrapper (settings + best records). */
export const Store = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode */
    }
  },
};
