import { describe, it, expect, beforeEach } from 'vitest';
import { CheatSystem } from '../src/cheats';
import type { GameKey } from '../src/input';
import { Game } from '../src/game';
import { getRuns, clearRuns, getGhostTrack } from '../src/store';

function pressSeq(sys: CheatSystem, keys: GameKey[], stepMs = 180, t0 = 1000): void {
  let t = t0;
  for (const k of keys) {
    sys.press(k, t);
    t += stepMs;
  }
}

describe('CheatSystem sequence detection', () => {
  it('fires the new surge code: down, down, jump', () => {
    const sys = new CheatSystem();
    expect(sys.press('down', 1000)).toBeNull();
    expect(sys.press('down', 1100)).toBeNull();
    expect(sys.press('primary', 1200)).toBe('surge');
  });

  it('does not false-fire on rapid jumping or movement wiggles', () => {
    const sys = new CheatSystem();
    // triple jump (the old accidental trigger)
    pressSeq(sys, ['primary', 'primary', 'primary'], 90);
    expect(sys.press('primary', 2000)).toBeNull();
    // running with wiggles
    pressSeq(sys, ['right', 'left', 'right', 'left', 'right', 'primary'], 120, 3000);
    // jump spam mixed with left/right
    pressSeq(sys, ['primary', 'right', 'primary', 'left', 'primary', 'primary'], 100, 4000);
  });

  it('still fires the Konami code', () => {
    const sys = new CheatSystem();
    pressSeq(sys, ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'primary'], 180, 5000);
    expect(sys.press('primary', 7000)).toBeNull();
  });
  it('konami fires on its final press', () => {
    const sys = new CheatSystem();
    const fired: string[] = [];
    for (const k of ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'primary'] as GameKey[]) {
      const r = sys.press(k, 10000);
      if (r) fired.push(r);
    }
    expect(fired).toEqual(['rainbow']);
  });

  it('respects per-code cooldowns', () => {
    const sys = new CheatSystem();
    // fires at t ≈ 1450
    pressSeq(sys, ['down', 'down', 'primary'], 150);
    // Re-run the exact sequence well inside the 12 s cooldown
    let firedInCooldown: string | null = null;
    let t = 3000;
    for (const k of ['down', 'down', 'primary'] as GameKey[]) {
      const r = sys.press(k, t);
      if (r) firedInCooldown = r;
      t += 150;
    }
    expect(firedInCooldown).toBeNull();
    // After the cooldown elapses it fires again
    t = 20_000;
    firedInCooldown = null;
    for (const k of ['down', 'down', 'primary'] as GameKey[]) {
      const r = sys.press(k, t);
      if (r) firedInCooldown = r;
      t += 150;
    }
    expect(firedInCooldown).toBe('surge');
  });

  it('maxhearts fires once per page load', () => {
    const sys = new CheatSystem();
    const seq: GameKey[] = ['down', 'down', 'up', 'up', 'left', 'right', 'primary'];
    let fired: string | null = null;
    for (const k of seq) {
      const r = sys.press(k, 10000);
      if (r) fired = r;
    }
    expect(fired).toBe('maxhearts');
    // Re-run the exact sequence far later (past the 60 s cooldown)
    fired = null;
    let t = 100_000;
    for (const k of seq) {
      const r = sys.press(k, t);
      if (r) fired = r;
      t += 150;
    }
    expect(fired).toBeNull();
  });
});

describe('cheat runs vs Hall of Claws', () => {
  function makeGame(): Game {
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    return new Game(canvas);
  }

  function konami(g: Game): void {
    for (const k of ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'primary'] as GameKey[]) {
      g.handleKey(k);
    }
  }

  beforeEach(() => {
    clearRuns();
    localStorage.clear();
  });

  it('a cheat-assisted victory is excluded from the Hall of Claws', () => {
    const g = makeGame();
    g.levelIdx = 0;
    g.handleKey('primary'); // start
    expect(g.state).toBe('playing');
    konami(g); // rainbow fires mid-run
    g.onPlayerVictory();
    expect(g.state).toBe('victory');
    expect(getRuns().length).toBe(0);
    expect(g.lastRun).toBeNull();
  });

  it('a clean victory is recorded in the Hall of Claws', () => {
    const g = makeGame();
    g.levelIdx = 0;
    g.handleKey('primary');
    g.onPlayerVictory();
    expect(getRuns().length).toBe(1);
    expect(g.lastRun).not.toBeNull();
  });

  it('a cheat run does not overwrite a stored ghost track', () => {
    const g = makeGame();
    g.levelIdx = 0;
    g.handleKey('primary');
    konami(g);
    g.onPlayerVictory();
    expect(getGhostTrack(0, 0)).toBeNull();
  });
});
