/**
 * Adaptive-soundtrack trigger logic, kept pure so it is unit-testable.
 * The audio manager fades its "urgent" and "shimmer" layers based on
 * what these flags say about the current run.
 */
export interface AdaptiveInput {
  hearts: number;
  playerX: number;
  bossAlive: boolean;
  hazards: { type: string; x: number; w: number }[];
  crystals: { x: number; collected: boolean }[];
}

/** How far ahead of Rex (px) a hazard counts as "coming up". */
export const DANGER_AHEAD = 420;
/** Uncollected crystals within this radius (px) light the shimmer layer. */
export const SHIMMER_RADIUS = 280;
/** ...and only when at least this many of them are nearby. */
export const SHIMMER_MIN = 4;

export function adaptiveFlags(i: AdaptiveInput): { urgent: boolean; shimmer: boolean } {
  const danger = i.hazards.some(
    (h) =>
      (h.type === 'spikes' || h.type === 'lava' || h.type === 'rocks') &&
      h.x + h.w >= i.playerX - 40 &&
      h.x <= i.playerX + DANGER_AHEAD,
  );
  const urgent = i.hearts <= 2 || danger || i.bossAlive;
  const near = i.crystals.reduce(
    (n, c) => n + (c.collected || Math.abs(c.x - i.playerX) > SHIMMER_RADIUS ? 0 : 1),
    0,
  );
  return { urgent, shimmer: near >= SHIMMER_MIN };
}
