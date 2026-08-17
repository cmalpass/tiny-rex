/** Lifetime play statistics shown on the main menu. */
export interface GameStats {
  runs: number;
  deaths: number;
  crystals: number;
  victories: number;
  /** Epoch ms of the first play; null before the first run. */
  firstPlayed: number | null;
}

export function getStats(): GameStats {
  return Store.get('tinyrex_stats', { runs: 0, deaths: 0, crystals: 0, victories: 0, firstPlayed: null });
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
