import { clamp } from './util';
import type { RexView } from './sprite';

/** One recorded player position. t = seconds since run start. */
export interface GhostPoint {
  t: number;
  x: number;
  y: number;
}

export interface GhostTrack {
  /** Daily Rex: the dailySeed() the track was recorded on; hand-built: -1. */
  date: number;
  score: number;
  time: number;
  pts: GhostPoint[];
}

/** Seconds between stored samples (~10 Hz). */
const SAMPLE_DT = 0.1;
/** Hard cap (~10 min at 10 Hz) so the persisted track stays small. */
const MAX_POINTS = 6000;
/** Tracks shorter than this are discarded (accidental taps, instant deaths). */
export const MIN_TRACK_POINTS = 4;

/** Records the player position during a run, decimated to ~10 Hz. */
export class GhostRecorder {
  private pts: GhostPoint[] = [];
  /** Time of the last pushed point; the trailing point's position keeps
   * tracking the player between pushes without advancing this. */
  private lastPushT = -1;

  /**
   * Sample the player (call every frame). Positions land on the trailing
   * point until a full SAMPLE_DT elapses, then a new point is pushed.
   */
  sample(t: number, x: number, y: number): void {
    const last = this.pts[this.pts.length - 1];
    if (last && t - this.lastPushT < SAMPLE_DT) {
      last.x = x;
      last.y = y;
      return;
    }
    if (this.pts.length >= MAX_POINTS) return;
    this.pts.push({ t, x, y });
    this.lastPushT = t;
  }

  get count(): number {
    return this.pts.length;
  }

  /** Build the track, or null when the run is too short to be useful. */
  finish(score: number, time: number): GhostTrack | null {
    if (this.pts.length < MIN_TRACK_POINTS) return null;
    return { date: 0, score, time, pts: this.pts };
  }
}

/** Replays a recorded track: linear interpolation between 10 Hz samples. */
export class GhostPlayer {
  x = 0;
  y = 0;
  facing = 1;
  runPhase = 0;
  private idx = 0;
  private pts: GhostPoint[];
  private endT: number;
  private finished = false;

  constructor(track: GhostTrack) {
    this.pts = track.pts;
    this.endT = track.pts[track.pts.length - 1].t;
    this.x = track.pts[0].x;
    this.y = track.pts[0].y;
  }

  /** Advance the replay to game time t (clamped past the track's end). */
  update(t: number): void {
    const pts = this.pts;
    while (this.idx < pts.length - 2 && pts[this.idx + 1].t <= t) this.idx++;
    const a = pts[this.idx];
    const b = pts[this.idx + 1];
    const span = b.t - a.t;
    const k = span > 0 ? clamp((t - a.t) / span, 0, 1) : 1;
    if (Math.abs(b.x - a.x) / Math.max(span, 0.001) > 1) {
      this.facing = b.x > a.x ? 1 : -1;
    }
    this.x = a.x + (b.x - a.x) * k;
    this.y = a.y + (b.y - a.y) * k;
    this.runPhase = t * 12;
    this.finished = t >= this.endT;
  }

  /** True while the replay still has samples left to play out. */
  get moving(): boolean {
    return !this.finished;
  }

  /** RexView for Sprite.drawRex (Player satisfies the same shape). */
  get view(): RexView {
    return {
      x: this.x,
      y: this.y,
      w: 34,
      h: 46,
      facing: this.facing,
      state: this.finished ? 'idle' : 'run',
      runPhase: this.runPhase,
      vy: 0,
      squashX: 1,
      squashY: 1,
      invulnT: 0,
      dead: false,
      rot: 0,
    };
  }
}
