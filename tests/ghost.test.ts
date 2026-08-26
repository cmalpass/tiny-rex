import { describe, it, expect, beforeEach } from 'vitest';
import { GhostRecorder, GhostPlayer, MIN_TRACK_POINTS } from '../src/ghost';
import type { GhostTrack } from '../src/ghost';
import { Store, getGhostTrack, saveGhostTrack, getGhostEnabled, setGhostEnabled } from '../src/store';

function mkTrack(
  pts: Array<[number, number, number]>,
  score = 100,
  time = 10,
  date = -1,
): GhostTrack {
  return { date, score, time, pts: pts.map(([t, x, y]) => ({ t, x, y })) };
}

describe('GhostRecorder', () => {
  it('decimates to ~10 Hz at 60 fps sampling, keeping the trailing point fresh', () => {
    const r = new GhostRecorder();
    // Simulate a 60 fps frame stream for 0.6 s
    for (let i = 0; i <= 36; i++) r.sample(i / 60, i, 0);
    // ~10 Hz → 6–7 pushes over 0.6 s (±1 for float boundaries)
    expect(r.count).toBeGreaterThanOrEqual(6);
    expect(r.count).toBeLessThanOrEqual(8);
    const t = r.finish(9, 0.6)!;
    expect(t.pts[0].t).toBe(0);
    for (let i = 1; i < t.pts.length; i++) {
      const gap = t.pts[i].t - t.pts[i - 1].t;
      expect(gap).toBeGreaterThanOrEqual(0.1 - 1e-9);
      expect(gap).toBeLessThanOrEqual(0.2 + 1e-9);
    }
    // Trailing point tracks the latest position even before the next push
    expect(t.pts[t.pts.length - 1].x).toBe(36);
  });

  it('discards runs shorter than the minimum track length', () => {
    const r = new GhostRecorder();
    for (let i = 0; i < MIN_TRACK_POINTS - 1; i++) r.sample(i * 0.2, i * 10, 0);
    expect(r.finish(1, 1)).toBeNull();
    r.sample((MIN_TRACK_POINTS - 1) * 0.2, (MIN_TRACK_POINTS - 1) * 10, 0);
    const t = r.finish(1, 1);
    expect(t).not.toBeNull();
    expect(t!.pts.length).toBe(MIN_TRACK_POINTS);
  });

  it('caps the track length so storage stays small', () => {
    const r = new GhostRecorder();
    for (let i = 0; i < 6001; i++) r.sample(i * 0.2, i, 0);
    expect(r.count).toBe(6000);
  });
});

describe('GhostPlayer', () => {
  it('interpolates linearly between samples', () => {
    const g = new GhostPlayer(mkTrack([[0, 0, 414], [1, 100, 414], [2, 200, 400]]));
    g.update(0.5);
    expect(g.x).toBeCloseTo(50);
    expect(g.y).toBeCloseTo(414);
    g.update(1.5);
    expect(g.x).toBeCloseTo(150);
    g.update(3); // past the end → clamped at the final sample
    expect(g.x).toBeCloseTo(200);
    expect(g.y).toBeCloseTo(400);
  });

  it('tracks facing from the sample direction', () => {
    const g = new GhostPlayer(mkTrack([[0, 100, 414], [1, 0, 414]]));
    g.update(0.5);
    expect(g.facing).toBe(-1);
    expect(g.view.facing).toBe(-1);
  });

  it('view reports a run pose mid-track and idle at the end', () => {
    const g = new GhostPlayer(mkTrack([[0, 0, 414], [1, 100, 414]]));
    g.update(0.5);
    expect(g.view.state).toBe('run');
    expect(g.moving).toBe(true);
    g.update(99);
    expect(g.view.state).toBe('idle');
    expect(g.moving).toBe(false);
  });
});

describe('ghost persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips per level', () => {
    const t = mkTrack([[0, 0, 0], [1, 10, 0], [2, 20, 0], [3, 30, 0]]);
    saveGhostTrack(2, t);
    expect(getGhostTrack(2, 0)).toEqual(t);
    expect(getGhostTrack(0, 0)).toBeNull();
  });

  it('daily tracks are only valid for the seed they were recorded on', () => {
    const t = mkTrack([[0, 0, 0], [1, 10, 0], [2, 20, 0], [3, 30, 0]], 50, 10, 20260826);
    saveGhostTrack(-1, t);
    expect(getGhostTrack(-1, 20260826)).toEqual(t);
    expect(getGhostTrack(-1, 20260827)).toBeNull();
  });

  it('rejects malformed stored tracks', () => {
    Store.set('tinyrex_ghost_1', { date: -1, score: 1, time: 1, pts: [{ t: 0, x: 0, y: 0 }] });
    expect(getGhostTrack(1, 0)).toBeNull();
    Store.set('tinyrex_ghost_1', 'garbage');
    expect(getGhostTrack(1, 0)).toBeNull();
  });

  it('toggle persists and defaults on', () => {
    expect(getGhostEnabled()).toBe(true);
    setGhostEnabled(false);
    expect(getGhostEnabled()).toBe(false);
    setGhostEnabled(true);
    expect(getGhostEnabled()).toBe(true);
  });
});
