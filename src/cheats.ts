import type { GameKey } from './input';

export type CheatId = 'rainbow' | 'god' | 'maxhearts' | 'surge';

interface CheatDef {
  id: CheatId;
  /** Key sequence; the final press must be a key the player holds briefly (jump). */
  seq: GameKey[];
  /** Max gap between consecutive presses (ms). */
  windowMs: number;
  /** Minimum time between activations (ms). */
  cooldownMs: number;
  /** Can only fire once per page load. */
  once?: boolean;
}

export const CHEATS: CheatDef[] = [
  // Classic Konami code → rainbow Rex
  { id: 'rainbow', seq: ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'primary'], windowMs: 900, cooldownMs: 3000 },
  // God mode toggle
  { id: 'god', seq: ['left', 'left', 'right', 'right', 'up', 'up', 'primary'], windowMs: 900, cooldownMs: 3000 },
  // Max hearts (one time)
  { id: 'maxhearts', seq: ['down', 'down', 'up', 'up', 'left', 'right', 'primary'], windowMs: 900, cooldownMs: 60000, once: true },
  // Score surge: triple-tap jump
  { id: 'surge', seq: ['primary', 'primary', 'primary'], windowMs: 560, cooldownMs: 12000 },
];

/**
 * Detects cheat-code key sequences in a rolling press buffer. The Game feeds
 * every gameplay key press in; matched codes fire at most once per cooldown.
 */
export class CheatSystem {
  private buffer: { key: GameKey; t: number }[] = [];
  private readonly lastFired = new Map<CheatId, number>();
  private readonly firedOnce = new Set<CheatId>();

  /** Feed a key press (with a monotonic ms timestamp); returns the fired cheat, if any. */
  press(key: GameKey, now: number): CheatId | null {
    this.buffer.push({ key, t: now });
    if (this.buffer.length > 32) this.buffer.splice(0, this.buffer.length - 32);
    for (const c of CHEATS) {
      if (c.once && this.firedOnce.has(c.id)) continue;
      const last = this.lastFired.get(c.id);
      if (last !== undefined && now - last < c.cooldownMs) continue;
      if (this.endsWith(c)) {
        this.lastFired.set(c.id, now);
        if (c.once) this.firedOnce.add(c.id);
        this.buffer.splice(this.buffer.length - c.seq.length);
        return c.id;
      }
    }
    return null;
  }

  private endsWith(c: CheatDef): boolean {
    const n = c.seq.length;
    if (this.buffer.length < n) return false;
    const start = this.buffer.length - n;
    for (let i = 0; i < n; i++) {
      if (this.buffer[start + i].key !== c.seq[i]) return false;
      if (i > 0 && this.buffer[start + i].t - this.buffer[start + i - 1].t > c.windowMs) return false;
    }
    return true;
  }
}
