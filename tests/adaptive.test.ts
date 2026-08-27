import { describe, expect, it } from 'vitest';
import { adaptiveFlags, DANGER_AHEAD, SHIMMER_MIN, SHIMMER_RADIUS } from '../src/adaptive';

const base = {
  hearts: 3,
  playerX: 1000,
  bossAlive: false,
  hazards: [] as { type: string; x: number; w: number }[],
  crystals: [] as { x: number; collected: boolean }[],
};

describe('adaptiveFlags', () => {
  it('is calm at the start of a clean run', () => {
    expect(adaptiveFlags(base)).toEqual({ urgent: false, shimmer: false });
  });

  it('goes urgent at two or fewer hearts', () => {
    expect(adaptiveFlags({ ...base, hearts: 2 }).urgent).toBe(true);
    expect(adaptiveFlags({ ...base, hearts: 1 }).urgent).toBe(true);
    expect(adaptiveFlags({ ...base, hearts: 3 }).urgent).toBe(false);
  });

  it('goes urgent when a hazard looms ahead', () => {
    const ahead = { type: 'spikes', x: 1300, w: 80 };
    expect(adaptiveFlags({ ...base, hazards: [ahead] }).urgent).toBe(true);
    // Just inside the window edge
    const atEdge = { type: 'lava', x: base.playerX + DANGER_AHEAD - 5, w: 40 };
    expect(adaptiveFlags({ ...base, hazards: [atEdge] }).urgent).toBe(true);
  });

  it('ignores hazards far away or behind', () => {
    const far = { type: 'spikes', x: base.playerX + DANGER_AHEAD + 60, w: 80 };
    const behind = { type: 'lava', x: base.playerX - 800, w: 80 };
    expect(adaptiveFlags({ ...base, hazards: [far, behind] }).urgent).toBe(false);
  });

  it('a hazard slightly behind still counts (40px tail)', () => {
    const tail = { type: 'rocks', x: base.playerX - 60, w: 40 }; // right edge at playerX-20
    expect(adaptiveFlags({ ...base, hazards: [tail] }).urgent).toBe(true);
    const past = { type: 'rocks', x: base.playerX - 120, w: 40 }; // right edge at playerX-80
    expect(adaptiveFlags({ ...base, hazards: [past] }).urgent).toBe(false);
  });

  it('goes urgent while the boss is alive', () => {
    expect(adaptiveFlags({ ...base, bossAlive: true }).urgent).toBe(true);
  });

  it('shimmers over crystal-dense stretches', () => {
    const crystals = Array.from({ length: SHIMMER_MIN }, (_, i) => ({ x: base.playerX + i * 50, collected: false }));
    expect(adaptiveFlags({ ...base, crystals }).shimmer).toBe(true);
    const sparse = crystals.slice(0, SHIMMER_MIN - 1);
    expect(adaptiveFlags({ ...base, crystals: sparse }).shimmer).toBe(false);
  });

  it('only counts uncollected crystals within the radius', () => {
    const inRadius = { x: base.playerX + SHIMMER_RADIUS - 10, collected: false };
    const outOfRadius = { x: base.playerX + SHIMMER_RADIUS + 10, collected: false };
    const collected = { x: base.playerX, collected: true };
    const few = Array.from({ length: SHIMMER_MIN - 1 }, (_, i) => ({ x: base.playerX - 200 + i * 30, collected: false }));
    // inRadius + few reaches the minimum; outOfRadius and collected do not count
    expect(adaptiveFlags({ ...base, crystals: [...few, inRadius] }).shimmer).toBe(true);
    expect(adaptiveFlags({ ...base, crystals: [...few, outOfRadius, collected] }).shimmer).toBe(false);
  });

  it('layers can be active together', () => {
    const crystals = Array.from({ length: SHIMMER_MIN }, (_, i) => ({ x: base.playerX + 40 + i * 60, collected: false }));
    const flags = adaptiveFlags({ ...base, hearts: 1, crystals });
    expect(flags).toEqual({ urgent: true, shimmer: true });
  });
});
