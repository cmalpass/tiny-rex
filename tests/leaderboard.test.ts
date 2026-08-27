import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Game } from '../src/game';
import { Store, getRuns, addRun, topRuns, clearRuns, MAX_RUNS } from '../src/store';
import type { RunRecord } from '../src/store';
import { LEVELS } from '../src/level-data';

function makeGame(): Game {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  return new Game(canvas);
}

function run(over: Partial<RunRecord> = {}): RunRecord {
  return { score: 100, time: 60, level: 'Crystal Valley', difficulty: 'normal', date: 1700000000000, ...over };
}

describe('Hall of Claws store', () => {
  beforeEach(() => localStorage.clear());

  it('records runs newest-first', () => {
    addRun(run({ score: 100 }));
    addRun(run({ score: 200 }));
    expect(getRuns().map((r) => r.score)).toEqual([200, 100]);
  });

  it('caps the hall at MAX_RUNS and drops the oldest', () => {
    for (let i = 1; i <= MAX_RUNS + 5; i++) addRun(run({ score: i, date: i }));
    const runs = getRuns();
    expect(runs).toHaveLength(MAX_RUNS);
    expect(runs[0].score).toBe(MAX_RUNS + 5); // newest kept
    expect(runs[MAX_RUNS - 1].score).toBe(6); // the first five were dropped
  });

  it('topRuns sorts by score descending and limits to n', () => {
    for (const s of [30, 90, 60, 10, 75]) addRun(run({ score: s }));
    expect(topRuns(3).map((r) => r.score)).toEqual([90, 75, 60]);
    expect(topRuns(10)).toHaveLength(5);
  });

  it('topRuns breaks score ties by shorter time', () => {
    addRun(run({ score: 500, time: 90 }));
    addRun(run({ score: 500, time: 40 }));
    addRun(run({ score: 500, time: null }));
    expect(topRuns(3).map((r) => r.time)).toEqual([40, 90, null]);
  });

  it('guards against corrupted storage', () => {
    localStorage.setItem('tinyrex_runs', 'oops');
    expect(getRuns()).toEqual([]);
    addRun(run({ score: 5 }));
    expect(getRuns()).toHaveLength(1);
    localStorage.setItem('tinyrex_runs', JSON.stringify([{ score: 'nope' }]));
    expect(getRuns()).toEqual([]);
  });

  it('clearRuns empties the hall', () => {
    addRun(run());
    addRun(run({ score: 2 }));
    clearRuns();
    expect(getRuns()).toEqual([]);
  });
});

describe('Hall of Claws (Game)', () => {
  let game: Game;

  beforeEach(() => {
    localStorage.clear();
    game = makeGame();
  });

  it('carves a run into the hall when a level is beaten', () => {
    game.handleKey('primary');
    game.score = 250;
    game.elapsed = 42;
    game.player!.hearts = 1;
    game.onPlayerVictory();
    expect(getRuns()).toHaveLength(1);
    const r = getRuns()[0];
    expect(r.score).toBe(game.score); // includes end-of-run bonuses
    expect(r.time).toBe(42);
    expect(r.level).toBe(LEVELS[0].name);
    expect(r.difficulty).toBe(game.difficulty);
    expect(game.lastRunRank).toBe(1);
  });

  it('records daily runs under a Daily label', () => {
    game.selectDaily();
    game.handleKey('primary');
    game.score = 100;
    game.onPlayerVictory();
    expect(getRuns()[0].level).toMatch(/^Daily/);
  });

  it('ranks the finished run against prior scores', () => {
    addRun(run({ score: 900 }));
    addRun(run({ score: 400 }));
    game.handleKey('primary');
    // Final score lands between the two seeded runs: 300 + 400 heart bonus,
    // with a long elapsed time so the time bonus is 0.
    game.score = 300;
    game.elapsed = 241;
    game.player!.hearts = 1;
    game.onPlayerVictory();
    expect(getRuns()[0].score).toBe(700);
    expect(game.lastRunRank).toBe(2); // 900, 700, 400
  });

  it('fires a one-time personal-best burst when overtaking the stored best', () => {
    Store.set('tinyrex_best_0', { score: 300, time: 100 });
    game.loadRecords(); // pick the seeded best up (constructor already loaded records)
    const spy = vi.spyOn(game.audio, 'play');
    game.handleKey('primary');
    game.score = 301;
    game.update(0.016);
    expect(game.pbAnnounced).toBe(true);
    expect(spy).toHaveBeenCalledWith('personalBest');
    // Further score gains do not re-fire it
    game.score = 999;
    game.update(0.016);
    expect(spy.mock.calls.filter((c) => c[0] === 'personalBest')).toHaveLength(1);
  });

  it('does not fire the burst without a prior best', () => {
    const spy = vi.spyOn(game.audio, 'play');
    game.handleKey('primary');
    game.score = 500;
    game.update(0.016);
    expect(game.pbAnnounced).toBe(false);
    expect(spy).not.toHaveBeenCalledWith('personalBest');
  });

  it('fires on the victory frame when the final score overtakes the run-start best', () => {
    // onPlayerVictory updates this.best BEFORE the update() PB check runs, so the
    // baseline must be captured at run start — regression test for the E2E failure.
    Store.set('tinyrex_best_0', { score: 100, time: 60 });
    game.loadRecords();
    const spy = vi.spyOn(game.audio, 'play');
    game.handleKey('primary');
    // Stand the player on the ground inside the nest's rect (feet at the nest
    // base) and let one frame run the real victory path
    game.player!.x = game.level!.goal.x;
    game.player!.y = game.level!.goal.y - game.player!.h;
    game.update(0.016);
    expect(game.state).toBe('victory');
    expect(game.pbAnnounced).toBe(true);
    expect(spy).toHaveBeenCalledWith('personalBest');
  });

  it('resets the personal-best flag on a fresh run', () => {
    Store.set('tinyrex_best_0', { score: 300, time: 100 });
    game.loadRecords();
    game.handleKey('primary');
    game.score = 301;
    game.update(0.016);
    expect(game.pbAnnounced).toBe(true);
    game.state = 'victory';
    game.victoryT = 2;
    game.handleKey('primary'); // restart → fresh run
    expect(game.pbAnnounced).toBe(false);
  });

  it('toggles the hall screen from the menu with the hall key', () => {
    expect(game.state).toBe('menu');
    game.handleKey('hall');
    expect(game.menuScreen).toBe('hall');
    game.handleKey('hall');
    expect(game.menuScreen).toBe('main');
  });

  it('switches codex → hall → main with the hall key', () => {
    game.handleKey('codex');
    expect(game.menuScreen).toBe('codex');
    game.handleKey('hall');
    expect(game.menuScreen).toBe('hall');
    game.handleKey('hall');
    expect(game.menuScreen).toBe('main');
  });

  it('ignores the hall key while playing', () => {
    game.handleKey('primary');
    expect(game.state).toBe('playing');
    game.handleKey('hall');
    expect(game.state).toBe('playing');
    expect(game.menuScreen).toBe('main');
  });

  it('clears the hall with a two-tap confirm', () => {
    addRun(run({ score: 100 }));
    addRun(run({ score: 200 }));
    game.handleKey('hall');
    game.render();
    const find = (label: string) => game.uiButtons.find((b) => b.label === label)!;
    expect(find('Clear hall')).toBeDefined();
    find('Clear hall').action();
    expect(getRuns()).toHaveLength(2); // first tap only arms
    game.render();
    find('Tap again to clear').action();
    expect(getRuns()).toHaveLength(0);
    expect(game.hallClearArmed).toBe(false);
  });
});
