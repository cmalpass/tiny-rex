import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Game } from '../src/game';
import {
  Weather,
  ventState,
  GUST_DUR,
  GEYSER_PERIOD,
  GEYSER_ERUPT,
  GEYSER_BUBBLE,
  GEYSER_W,
  GEYSER_H,
  type GeyserVent,
} from '../src/weather';
import type { Player } from '../src/player';

const HAZARDS = [
  { type: 'lava', x: 2420, y: 520, w: 560 }, // big pool -> vent
  { type: 'lava', x: 5430, y: 520, w: 130 }, // too small -> no vent
  { type: 'spikes', x: 4330, y: 460, w: 70 }, // not lava -> no vent
];

function fakePlayer(x = 0, y = 400): { p: Player; damage: ReturnType<typeof vi.fn> } {
  const damage = vi.fn();
  const p = {
    dead: false,
    invulnT: 0,
    vx: 0,
    vy: 0,
    x,
    y,
    w: 24,
    h: 46,
    rect: { x, y, w: 24, h: 46 },
    damage,
  } as unknown as Player;
  return { p, damage };
}

describe('ventState', () => {
  it('erupts at the start of each cycle', () => {
    expect(ventState(0, 0)).toBe('erupting');
    expect(ventState(GEYSER_ERUPT - 0.01, 0)).toBe('erupting');
    expect(ventState(GEYSER_ERUPT + 0.01, 0)).not.toBe('erupting');
  });

  it('bubbles just before the next eruption', () => {
    expect(ventState(GEYSER_PERIOD - GEYSER_BUBBLE - 0.01, 0)).toBe('idle');
    expect(ventState(GEYSER_PERIOD - GEYSER_BUBBLE + 0.01, 0)).toBe('bubbling');
  });

  it('is idle in the middle of the cycle', () => {
    expect(ventState(GEYSER_PERIOD / 2, 0)).toBe('idle');
  });

  it('offsets by the vent phase', () => {
    // same cycle point, shifted by phase
    expect(ventState(2, 3)).toBe(ventState(5, 0));
  });
});

describe('Weather.apply', () => {
  it('creates a vent per large lava pool, centered on it', () => {
    const w = new Weather();
    w.rng = () => 0.5;
    w.apply('volcanic', HAZARDS, 100);
    expect(w.vents).toHaveLength(1);
    expect(w.vents[0].x).toBe(2420 + 560 / 2);
    expect(w.vents[0].surfaceY).toBe(520);
    expect(w.vents[0].phase).toBeCloseTo(0.5 * GEYSER_PERIOD);
  });

  it('spawns pollen motes for the meadow and nothing else', () => {
    const w = new Weather();
    w.rng = () => 0.5;
    w.apply('meadow', [], 100);
    expect(w.motes).toHaveLength(18);
    expect(w.vents).toHaveLength(0);
  });

  it('has no vents or motes in the frost theme', () => {
    const w = new Weather();
    w.apply('frost', HAZARDS, 100);
    expect(w.vents).toHaveLength(0);
    expect(w.motes).toHaveLength(0);
  });
});

describe('frost gusts', () => {
  it('starts a gust when the countdown elapses and fires onGust', () => {
    const w = new Weather();
    w.rng = () => 0.5; // dir: 0.5 is not < 0.5 -> +1
    const onGust = vi.fn();
    w.onGust = onGust;
    w.apply('frost', [], 100);
    w.gustT = 0.5;
    w.update(0.6, null);
    expect(w.gusts).toBe(1);
    expect(w.gusting).toBeCloseTo(GUST_DUR);
    expect(w.gustDir).toBe(1);
    expect(onGust).toHaveBeenCalledTimes(1);
  });

  it('pushes the player sideways while gusting', () => {
    const w = new Weather();
    w.rng = () => 0.5;
    w.apply('frost', [], 100);
    w.gustT = 0.1;
    const { p } = fakePlayer(100);
    w.update(0.2, p); // gust starts this frame
    w.update(0.5, p);
    expect(p.vx).toBeGreaterThan(10);
  });

  it('spawns streaks while gusting, unless reduced motion', () => {
    const w = new Weather();
    w.rng = () => 0.5;
    w.apply('frost', [], 100);
    w.gustT = 0.1;
    const { p } = fakePlayer(100);
    w.update(0.2, p);
    w.update(0.5, p);
    expect(w.streaks.length).toBeGreaterThan(0);

    const calm = new Weather();
    calm.rng = () => 0.5;
    calm.reducedMotion = true;
    calm.apply('frost', [], 100);
    calm.gustT = 0.1;
    calm.update(0.2, null);
    calm.update(0.5, null);
    expect(calm.streaks.length).toBe(0);
  });
});

describe('volcanic geysers', () => {
  it('erupts on schedule and damages a player standing in the column', () => {
    const w = new Weather();
    w.rng = () => 0.5;
    w.apply('volcanic', HAZARDS, 100);
    const v = w.vents[0];
    // choose t so the cycle is just inside the eruption window
    const t = ((GEYSER_PERIOD - v.phase) % GEYSER_PERIOD) + 0.1;
    w.t = t;
    const col = w.columnRect(v);
    const { p, damage } = fakePlayer(col.x + col.w / 2 - 12, col.y + col.h - 50);
    w.update(0.016, p);
    expect(v.state).toBe('erupting');
    expect(damage).toHaveBeenCalledTimes(1);
    expect(damage.mock.calls[0][1]).toBe('lava');
    expect(p.vy).toBe(-300); // kicked out of the column
  });

  it('does not damage players outside the column or while invulnerable', () => {
    const w = new Weather();
    w.rng = () => 0.5;
    w.apply('volcanic', HAZARDS, 100);
    const v = w.vents[0];
    const t = ((GEYSER_PERIOD - v.phase) % GEYSER_PERIOD) + 0.1;
    w.t = t;
    const col = w.columnRect(v);
    const far = fakePlayer(col.x + 400);
    w.update(0.016, far.p);
    expect(far.damage).not.toHaveBeenCalled();

    const inv = fakePlayer(col.x + col.w / 2 - 12, col.y + 10);
    inv.p.invulnT = 0.5;
    w.update(0.016, inv.p);
    expect(inv.damage).not.toHaveBeenCalled();
  });

  it('column geometry matches the tuning constants', () => {
    const w = new Weather();
    const v: GeyserVent = { x: 100, surfaceY: 500, phase: 0, state: 'idle' };
    const r = w.columnRect(v);
    expect(r).toEqual({ x: 100 - GEYSER_W / 2, y: 500 - GEYSER_H, w: GEYSER_W, h: GEYSER_H });
  });
});

describe('meadow drift', () => {
  it('sways the player and keeps motes near them', () => {
    const w = new Weather();
    w.rng = () => 0.5;
    w.apply('meadow', [], 100);
    const { p } = fakePlayer(100);
    const x0 = p.x;
    for (let i = 0; i < 120; i++) w.update(1 / 60, p); // 2s
    expect(Math.abs(p.vx)).toBeGreaterThan(0);
    for (const m of w.motes) {
      expect(Math.abs(m.x - p.x)).toBeLessThanOrEqual(530);
    }
    expect(p.x).toBe(x0); // drift is a force, not a teleport
  });
});

describe('Game integration', () => {
  let game: Game;

  function makeGame(): Game {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    return new Game(canvas);
  }

  beforeEach(() => {
    localStorage.clear();
    game = makeGame();
  });

  it('configures weather for the level being started', () => {
    game.handleKey('primary'); // Crystal Valley (meadow)
    expect(game.weather.theme).toBe('meadow');
    expect(game.weather.motes.length).toBe(18);

    game.levelIdx = 1;
    game.handleKey('restart'); // Volcanic Depths
    expect(game.weather.theme).toBe('volcanic');
    expect(game.weather.vents.length).toBeGreaterThanOrEqual(1);

    game.levelIdx = 2;
    game.handleKey('restart'); // Frostpeak Pass
    expect(game.weather.theme).toBe('frost');
    expect(game.weather.gustT).toBeGreaterThan(0);
  });

  it('pushes the player on a gust while playing', () => {
    game.levelIdx = 2;
    game.handleKey('primary');
    game.weather.gustT = 0;
    game.update(0.016); // gust kicks in
    game.update(0.2); // force applied on the following frame
    expect(Math.abs(game.player!.vx)).toBeGreaterThan(0);
    expect(game.weather.gusts).toBe(1);
  });
});
