import { Store } from './store';
import type { LevelTheme } from './level-data';
import type { SfxOptions } from './ctx';

interface ToneOpts {
  freq?: number;
  to?: number;
  dur?: number;
  type?: OscillatorType;
  vol?: number;
  delay?: number;
}

interface NoiseOpts {
  dur?: number;
  vol?: number;
  freq?: number;
  delay?: number;
}

/**
 * All audio is synthesized with the Web Audio API — no asset files.
 * The context is created lazily from the first user gesture, because
 * browsers only allow audio after one.
 */
export class AudioManager {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  muted: boolean;
  ambientOn = false;
  ambientNodes: { src: AudioBufferSourceNode; lfo: OscillatorNode; gain: GainNode } | null = null;
  chirpTimer = 0;

  /* --- Procedural chiptune music --- */
  private musicTheme: LevelTheme | null = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicNextT = 0; // AudioContext time of the next step (0 = unscheduled)
  private musicStep = 0;

  constructor() {
    this.muted = Store.get('tinyrex_muted', false);
  }

  /** Start the looping theme. Safe to call when the ctx isn't up yet. */
  startMusic(theme: LevelTheme): void {
    this.musicTheme = theme;
    if (this.musicTimer !== null) return; // already scheduling
    this.musicStep = 0;
    this.musicNextT = 0;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 60);
  }

  stopMusic(): void {
    this.musicTheme = null;
    this.musicNextT = 0;
    this.musicStep = 0;
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private scheduleMusic(): void {
    if (!this.ctx || !this.master || !this.musicTheme) return;
    const theme = this.musicTheme;
    const spb = 60 / MUSIC[theme].bpm;
    const step = spb / 2; // 8th notes
    if (this.musicNextT === 0) this.musicNextT = this.ctx.currentTime + 0.12;
    const lead = MUSIC[theme].lead;
    const bass = MUSIC[theme].bass;
    while (this.musicNextT < this.ctx.currentTime + 0.15) {
      if (!this.muted) {
        const idx = this.musicStep % lead.length;
        const ln = lead[idx];
        if (ln > 0) this.musicNote(midiToFreq(ln), this.musicNextT, step * 0.9, 'square', 0.045);
        const bn = bass[idx % bass.length];
        if (bn > 0) this.musicNote(midiToFreq(bn), this.musicNextT, step * 0.9, 'triangle', 0.06);
      }
      this.musicStep++;
      this.musicNextT += step;
    }
  }

  private musicNote(freq: number, t0: number, dur: number, type: OscillatorType, vol: number): void {
    const osc = this.ctx!.createOscillator();
    const g = this.ctx!.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
      this.ensureAmbient();
      return;
    }
    const AC =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.ensureAmbient();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    Store.set('tinyrex_muted', m);
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  /* Gentle wind: looped filtered noise, slowly swelling. Kept very quiet. */
  private ensureAmbient(): void {
    if (!this.ctx || this.ambientNodes) return;
    try {
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 320;
      filt.Q.value = 0.4;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.016;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.09;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.01;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      src.connect(filt);
      filt.connect(gain);
      gain.connect(this.master!);
      src.start();
      lfo.start();
      this.ambientNodes = { src, lfo, gain };
      this.ambientOn = true;
    } catch {
      /* ambience is optional */
    }
  }

  private tone(opts: ToneOpts): void {
    if (!this.ctx || this.muted) return;
    const { freq = 440, to = undefined, dur = 0.15, type = 'sine', vol = 0.2, delay = 0 } = opts;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(this.master!); // set together with ctx in unlock()
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noiseBurst(opts: NoiseOpts): void {
    if (!this.ctx || this.muted) return;
    const { dur = 0.2, vol = 0.2, freq = 800, delay = 0 } = opts;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master!);
    src.start(t0);
  }

  /* Ambient bird chirp, scheduled randomly by update() */
  private chirp(): void {
    if (!this.ctx || this.muted) return;
    const base = 1900 + Math.random() * 900;
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      this.tone({
        freq: base + Math.random() * 250,
        to: base * 1.25,
        dur: 0.07,
        type: 'sine',
        vol: 0.035,
        delay: i * 0.11,
      });
    }
  }

  play(name: string, opts?: SfxOptions): void {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'jump':
        this.tone({ freq: 320, to: 640, dur: 0.14, type: 'triangle', vol: 0.22 });
        break;
      case 'land':
        this.noiseBurst({ dur: 0.08, vol: 0.1, freq: 500 });
        break;
      case 'collect': {
        // Combo pickups climb in pitch so a streak feels like it's accelerating.
        const mul = 1 + (Math.max(1, opts?.comboStep ?? 1) - 1) * 0.08;
        this.tone({ freq: 920 * mul, dur: 0.08, type: 'sine', vol: 0.2 });
        this.tone({ freq: 1380 * mul, dur: 0.12, type: 'sine', vol: 0.2, delay: 0.06 });
        break;
      }
      case 'heart':
        if (opts?.healed) {
          // Warm two-note "mended" chime
          this.tone({ freq: 620, to: 880, dur: 0.12, type: 'sine', vol: 0.2 });
          this.tone({ freq: 880, to: 1320, dur: 0.16, type: 'sine', vol: 0.18, delay: 0.09 });
        } else {
          // Full health: bright coin-like chime
          this.tone({ freq: 1046, dur: 0.09, type: 'triangle', vol: 0.18 });
          this.tone({ freq: 1568, dur: 0.12, type: 'triangle', vol: 0.16, delay: 0.06 });
        }
        break;
      case 'bonus':
        [920, 1150, 1380, 1840].forEach((f, i) =>
          this.tone({ freq: f, dur: 0.12, type: 'sine', vol: 0.2, delay: i * 0.07 }),
        );
        break;
      case 'star': {
        // Sparkly chime for a victory star pop; each star climbs a little.
        const lift = 1 + (opts?.starIndex ?? 0) * 0.15;
        [1046, 1318, 1568].forEach((f, i) =>
          this.tone({ freq: f * lift, dur: 0.11, type: 'sine', vol: 0.22, delay: i * 0.055 }),
        );
        break;
      }
      case 'stomp':
        this.noiseBurst({ dur: 0.14, vol: 0.24, freq: 900 });
        this.tone({ freq: 220, to: 90, dur: 0.14, type: 'triangle', vol: 0.24 });
        break;
      case 'hurt':
        this.tone({ freq: 420, to: 140, dur: 0.28, type: 'sawtooth', vol: 0.16 });
        break;
      case 'die':
        [520, 392, 311, 208].forEach((f, i) =>
          this.tone({ freq: f, to: f * 0.8, dur: 0.22, type: 'triangle', vol: 0.2, delay: i * 0.14 }),
        );
        break;
      case 'checkpoint':
        [660, 880, 1320].forEach((f, i) =>
          this.tone({ freq: f, dur: 0.16, type: 'triangle', vol: 0.2, delay: i * 0.09 }),
        );
        break;
      case 'crumble':
        this.noiseBurst({ dur: 0.2, vol: 0.22, freq: 600 });
        break;
      case 'rock':
        this.noiseBurst({ dur: 0.3, vol: 0.3, freq: 300 });
        break;
      case 'rockfall':
        this.noiseBurst({ dur: 0.12, vol: 0.12, freq: 500 });
        break;
      case 'victory':
        [523, 659, 784, 1046, 784, 1046].forEach((f, i) =>
          this.tone({ freq: f, dur: i === 5 ? 0.4 : 0.16, type: 'triangle', vol: 0.22, delay: i * 0.13 }),
        );
        break;
      case 'ui':
        this.tone({ freq: 660, to: 880, dur: 0.07, type: 'square', vol: 0.08 });
        break;
      case 'pause':
        this.tone({ freq: 520, to: 390, dur: 0.12, type: 'triangle', vol: 0.14 });
        break;
      case 'spring':
        this.tone({ freq: 180, to: 760, dur: 0.22, type: 'triangle', vol: 0.22 });
        this.noiseBurst({ dur: 0.06, vol: 0.06, freq: 1200 });
        break;
      case 'plate':
        if (opts?.pressed) {
          this.tone({ freq: 220, to: 150, dur: 0.1, type: 'square', vol: 0.12 });
        } else {
          this.tone({ freq: 150, to: 240, dur: 0.1, type: 'square', vol: 0.1 });
        }
        break;
      case 'door':
        this.noiseBurst({ dur: 0.34, vol: 0.16, freq: 380 });
        this.tone({ freq: 90, to: 180, dur: 0.4, type: 'sawtooth', vol: 0.1 });
        break;
      case 'spit':
        this.tone({ freq: 340, to: 130, dur: 0.16, type: 'sawtooth', vol: 0.14 });
        this.noiseBurst({ dur: 0.08, vol: 0.08, freq: 700 });
        break;
      case 'fossil': {
        // Deep unearth thud followed by a warm two-note chime.
        this.noiseBurst({ dur: 0.1, vol: 0.14, freq: 420 });
        this.tone({ freq: 392, dur: 0.14, type: 'triangle', vol: 0.2, delay: 0.04 });
        this.tone({ freq: 587, dur: 0.2, type: 'sine', vol: 0.18, delay: 0.14 });
        break;
      }
      case 'cheat':
        [784, 988, 1175, 1568].forEach((f, i) =>
          this.tone({ freq: f, dur: 0.09, type: 'sine', vol: 0.16, delay: i * 0.05 }),
        );
        break;
    }
  }

  /* Schedules ambient chirps. */
  update(dt: number): void {
    if (!this.ambientOn) return;
    this.chirpTimer -= dt;
    if (this.chirpTimer <= 0) {
      if (Math.random() < 0.65) this.chirp();
      this.chirpTimer = 3.5 + Math.random() * 6;
    }
  }
}

/* Chiptune melodies per theme (MIDI note numbers, 0 = rest). 32 steps = 4 bars of 8ths. */
const midiToFreq = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);

const MUSIC: Record<LevelTheme, { bpm: number; lead: number[]; bass: number[] }> = {
  meadow: {
    bpm: 108,
    lead: [69, 72, 76, 81, 76, 72, 69, 76, 66, 69, 73, 78, 81, 78, 73, 69, 69, 72, 76, 73, 72, 69, 66, 62, 64, 66, 69, 73, 72, 69, 64, 0],
    bass: [45, 0, 57, 0, 45, 0, 57, 0, 42, 0, 54, 0, 42, 0, 54, 0, 38, 0, 50, 0, 38, 0, 50, 0, 40, 0, 52, 0, 40, 0, 52, 0],
  },
  volcanic: {
    bpm: 92,
    lead: [57, 60, 64, 67, 64, 60, 57, 55, 54, 57, 60, 64, 60, 57, 54, 52, 55, 57, 60, 62, 60, 57, 55, 52, 52, 54, 57, 60, 57, 54, 52, 0],
    bass: [33, 0, 45, 0, 33, 0, 45, 0, 30, 0, 42, 0, 30, 0, 42, 0, 31, 0, 43, 0, 31, 0, 43, 0, 40, 0, 52, 0, 40, 0, 52, 0],
  },
  frost: {
    bpm: 100,
    lead: [72, 76, 79, 84, 79, 76, 72, 71, 69, 72, 76, 79, 76, 72, 69, 67, 69, 72, 76, 74, 72, 69, 67, 64, 66, 69, 72, 76, 72, 69, 66, 0],
    bass: [48, 0, 60, 0, 48, 0, 60, 0, 45, 0, 57, 0, 45, 0, 57, 0, 43, 0, 55, 0, 43, 0, 55, 0, 41, 0, 53, 0, 41, 0, 53, 0],
  },
};
