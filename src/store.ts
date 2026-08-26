import type { GhostTrack } from './ghost';
import { MIN_TRACK_POINTS } from './ghost';

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
  };
}

/** Best score/time for one level (falls back to the legacy global key for level 0). */
export function getBest(idx: number): { score: number; time: number | null } {
  const b = Store.get<{ score: number; time: number | null } | null>('tinyrex_best_' + idx, null);
  if (b) return b;
  if (idx === 0) return Store.get('tinyrex_best_score', { score: 0, time: null as number | null });
  return { score: 0, time: null };
}

export function getBestStars(idx: number): number {
  return Store.get('tinyrex_stars_' + idx, 0);
}

/** Best score/time for today's Daily Rex challenge. */
export function getDailyBest(): { score: number; time: number | null } {
  return Store.get('tinyrex_best_daily', { score: 0, time: null as number | null });
}

/** Best star rating for the current Daily Rex challenge (0–3). */
export function getDailyStars(): number {
  return Store.get('tinyrex_stars_daily', 0);
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
  const t = Store.get<GhostTrack | null>(key, null);
  if (!t || !Array.isArray(t.pts) || t.pts.length < MIN_TRACK_POINTS) return null;
  if (idx === -1 && t.date !== date) return null;
  return t;
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
