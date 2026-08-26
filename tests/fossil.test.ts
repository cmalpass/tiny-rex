import { describe, it, expect } from 'vitest';
import { Fossil } from '../src/fossil';
import { LEVELS } from '../src/level-data';
import { Level } from '../src/level';
import { makeCtx } from './mock-ctx';
import { Store, getFoundFossils, findFossil } from '../src/store';

describe('Fossil entity', () => {
  it('exposes a collision rect centred on its position', () => {
    const f = new Fossil(300, 400, '0:0');
    expect(f.rect).toEqual({ x: 285, y: 387, w: 30, h: 26 });
    expect(f.collected).toBe(false);
    expect(f.id).toBe('0:0');
  });

  it('draws without error at several animation phases', () => {
    const f = new Fossil(300, 400, '0:0');
    const ctx = document.createElement('canvas').getContext('2d')!;
    for (const t of [0, 0.5, 1.2, 3.9, 9.7]) f.draw(ctx, t);
  });

  it('builds stable "levelIdx:i" ids from level data', () => {
    const level = new Level(LEVELS[1].def, makeCtx(), 1, 1);
    expect(level.fossils).toHaveLength(3);
    expect(level.fossils.map((f) => f.id)).toEqual(['1:0', '1:1', '1:2']);
  });

  it('re-collects after a respawn reset', () => {
    const level = new Level(LEVELS[0].def, makeCtx(), 1, 0);
    const f = level.fossils[0];
    f.collected = true;
    level.reset();
    expect(f.collected).toBe(false);
  });
});

describe('Fossil store (persistent codex)', () => {
  it('round-trips discoveries and ignores duplicates', () => {
    localStorage.clear();
    expect(getFoundFossils()).toEqual([]);
    findFossil('0:0');
    findFossil('0:0'); // duplicate is a no-op
    findFossil('2:1');
    expect(getFoundFossils()).toEqual(['0:0', '2:1']);
    expect(Store.get<string[] | null>('tinyrex_fossils', null)).toEqual(['0:0', '2:1']);
  });

  it('guards against corrupted storage', () => {
    localStorage.clear();
    localStorage.setItem('tinyrex_fossils', 'not-an-array');
    expect(getFoundFossils()).toEqual([]);
    // A corrupted read still allows new discoveries
    findFossil('1:2');
    expect(getFoundFossils()).toEqual(['1:2']);
  });
});
