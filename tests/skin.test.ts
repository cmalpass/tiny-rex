import { describe, it, expect, beforeEach } from 'vitest';
import { SKINS, getSkin, skinUnlocked, Sprite, type RexView } from '../src/sprite';
import { Store, getSkinId, setSkinId } from '../src/store';

function makeView(skin?: string): RexView {
  return {
    x: 0,
    y: 0,
    w: 34,
    h: 46,
    facing: 1,
    state: 'idle',
    runPhase: 0,
    vy: 0,
    squashX: 1,
    squashY: 1,
    invulnT: 0,
    dead: false,
    rot: 0,
    skin,
  };
}

describe('Skin table', () => {
  it('ships four skins with unique ids and full palettes', () => {
    expect(SKINS).toHaveLength(4);
    const ids = SKINS.map((s) => s.id);
    expect(new Set(ids).size).toBe(4);
    expect(ids).toEqual(['classic', 'ember', 'glacier', 'mint']);
    for (const s of SKINS) {
      expect(s.name.length).toBeGreaterThan(0);
      for (const c of [s.body, s.dark, s.belly, s.line]) {
        expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  it('resolves known ids and falls back to Classic', () => {
    expect(getSkin('ember').id).toBe('ember');
    expect(getSkin('nope').id).toBe('classic');
    expect(getSkin(undefined).id).toBe('classic');
  });

  it('gates Mint behind 3 fossils and leaves the rest free', () => {
    expect(skinUnlocked('classic', [])).toBe(true);
    expect(skinUnlocked('ember', [])).toBe(true);
    expect(skinUnlocked('glacier', [])).toBe(true);
    expect(skinUnlocked('mint', [])).toBe(false);
    expect(skinUnlocked('mint', ['0:0', '1:0'])).toBe(false);
    expect(skinUnlocked('mint', ['0:0', '1:0', '2:0'])).toBe(true);
  });

  it('draws every skin without crashing, rainbow overrides all', () => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    for (const s of SKINS) {
      expect(() => Sprite.drawRex(ctx, makeView(s.id), 0.25)).not.toThrow();
    }
    expect(() => Sprite.drawRex(ctx, makeView('ember'), 0.5)).not.toThrow();
    const rainbow = makeView('glacier');
    rainbow.rainbow = true;
    expect(() => Sprite.drawRex(ctx, rainbow, 1.25)).not.toThrow();
  });
});

describe('Skin persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to Classic and round-trips a chosen skin', () => {
    expect(getSkinId()).toBe('classic');
    setSkinId('ember');
    expect(getSkinId()).toBe('ember');
    expect(Store.get<string | null>('tinyrex_skin', null)).toBe('ember');
  });

  it('rejects unknown ids on write and read', () => {
    setSkinId('rainbow');
    expect(getSkinId()).toBe('classic');
    localStorage.setItem('tinyrex_skin', 'totally-bogus');
    expect(getSkinId()).toBe('classic');
  });
});
