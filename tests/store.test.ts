import { describe, it, expect, beforeEach } from 'vitest';
import {
  Store,
  getBest,
  getBestStars,
  getDailyBest,
  getDailyStars,
  getStats,
  getRuns,
  addRun,
  MAX_RUNS,
  getSkinId,
  setSkinId,
  type RunRecord,
} from '../src/store';

function mkRun(i: number): RunRecord {
  return { score: i, time: 10 + i, level: 'Crystal Valley', difficulty: 'normal', date: Date.now() + i };
}

describe('best records survive corrupt storage', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a valid best', () => {
    Store.set('tinyrex_best_2', { score: 4200, time: 71.5 });
    expect(getBest(2)).toEqual({ score: 4200, time: 71.5 });
  });

  it('degrades corrupt types to a zero state', () => {
    for (const junk of ['garbage', 12, true, [1, 2], { score: 'fast', time: null }, { score: NaN, time: -5 }, { time: 'soon' }]) {
      Store.set('tinyrex_best_2', junk);
      const b = getBest(2);
      expect(Number.isFinite(b.score)).toBe(true);
      expect(b.score).toBeGreaterThanOrEqual(0);
      expect(b.time === null || b.time > 0).toBe(true);
    }
  });

  it('keeps a partial record (score only)', () => {
    Store.set('tinyrex_best_2', { score: 900 });
    expect(getBest(2)).toEqual({ score: 900, time: null });
  });

  it('reads the legacy level-0 key as a plain score', () => {
    Store.set('tinyrex_best_score', 3333);
    expect(getBest(0)).toEqual({ score: 3333, time: null });
    // a modern key still wins over the legacy one
    Store.set('tinyrex_best_0', { score: 500, time: 20 });
    expect(getBest(0)).toEqual({ score: 500, time: 20 });
  });

  it('validates the daily best the same way', () => {
    Store.set('tinyrex_best_daily', 'oops');
    expect(getDailyBest()).toEqual({ score: 0, time: null });
    Store.set('tinyrex_best_daily', { score: 100, time: 12.5 });
    expect(getDailyBest()).toEqual({ score: 100, time: 12.5 });
  });
});

describe('star ratings clamp to 0–3', () => {
  beforeEach(() => localStorage.clear());

  it.each([
    [-5, 0],
    [0, 0],
    [2.4, 2],
    [2.6, 3],
    [7, 3],
    ['x', 0],
    [NaN, 0],
  ])('clamps %p to %p', (stored, expected) => {
    Store.set('tinyrex_stars_1', stored);
    expect(getBestStars(1)).toBe(expected);
    Store.set('tinyrex_stars_daily', stored);
    expect(getDailyStars()).toBe(expected);
  });
});

describe('lifetime stats normalize corrupt values', () => {
  beforeEach(() => localStorage.clear());

  it('returns zeros for missing or junk stats', () => {
    expect(getStats()).toEqual({ runs: 0, deaths: 0, crystals: 0, victories: 0, hearts: 0, firstPlayed: null, allClear: false });
    Store.set('tinyrex_stats', 'junk');
    const s = getStats();
    expect(s.runs).toBe(0);
    expect(typeof s.victories).toBe('number');
    expect(s.allClear).toBe(false);
  });

  it('persists and normalizes the all-clear flag', () => {
    expect(getStats().allClear).toBe(false); // absent field → false
    Store.set('tinyrex_stats', { runs: 3, deaths: 1, crystals: 10, victories: 5, hearts: 2, firstPlayed: 123, allClear: true });
    expect(getStats().allClear).toBe(true);
    Store.set('tinyrex_stats', 'junk');
    expect(getStats().allClear).toBe(false); // corrupt → false
  });
});

describe('Hall of Claws run log', () => {
  beforeEach(() => localStorage.clear());

  it('filters corrupt entries out of a mixed array', () => {
    Store.set('tinyrex_runs', [mkRun(1), null, 'junk', { score: 'nope' }, { score: 2, level: 42 }, { score: 3, level: 'Frostpeak' }]);
    const runs = getRuns();
    expect(runs.length).toBe(2);
    expect(runs[0].score).toBe(1);
  });

  it('caps the log at MAX_RUNS, keeping the newest', () => {
    for (let i = 0; i < MAX_RUNS + 5; i++) addRun(mkRun(i));
    const runs = getRuns();
    expect(runs.length).toBe(MAX_RUNS);
    expect(runs[0].score).toBe(MAX_RUNS + 4); // newest first (104)
    expect(runs[MAX_RUNS - 1].score).toBe(5); // oldest five (0–4) dropped
  });
});

describe('skin selection', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to classic and rejects unknown ids', () => {
    expect(getSkinId()).toBe('classic');
    Store.set('tinyrex_skin', 'rainbow-fox');
    expect(getSkinId()).toBe('classic');
    setSkinId('ember');
    expect(getSkinId()).toBe('ember');
    setSkinId('nope');
    expect(getSkinId()).toBe('classic');
  });
});
