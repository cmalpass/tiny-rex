import { Store } from './store';

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

  constructor() {
    this.muted = Store.get('tinyrex_muted', false);
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

  play(name: string): void {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'jump':
        this.tone({ freq: 320, to: 640, dur: 0.14, type: 'triangle', vol: 0.22 });
        break;
      case 'land':
        this.noiseBurst({ dur: 0.08, vol: 0.1, freq: 500 });
        break;
      case 'collect':
        this.tone({ freq: 920, dur: 0.08, type: 'sine', vol: 0.2 });
        this.tone({ freq: 1380, dur: 0.12, type: 'sine', vol: 0.2, delay: 0.06 });
        break;
      case 'bonus':
        [920, 1150, 1380, 1840].forEach((f, i) =>
          this.tone({ freq: f, dur: 0.12, type: 'sine', vol: 0.2, delay: i * 0.07 }),
        );
        break;
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
