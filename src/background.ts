import { VW, VH, TAU } from './config';
import { mulberry32 } from './util';
import type { LevelTheme } from './level-data';

interface Mountain {
  x: number;
  w: number;
  h: number;
  peak: number;
}

interface Hill {
  x: number;
  w: number;
  h: number;
}

interface Cloud {
  x: number;
  y: number;
  s: number;
  drift: number;
}

interface Star {
  x: number;
  y: number;
  r: number;
  tw: number;
}

/** Procedural parallax background: sky, sun/moon, mountains, clouds/embers, volcanoes, hills. */
export class Background {
  private readonly farMtns: Mountain[] = [];
  private readonly hills: Hill[] = [];
  private readonly clouds: Cloud[] = [];
  private readonly stars: Star[] = [];
  /** Current palette: meadow = day valley, volcanic = night ember field. */
  theme: LevelTheme = 'meadow';
  /** Calm mode: suppress ambient life (petals, birds, extra embers). */
  calm = false;

  constructor() {
    const rng = mulberry32(20260816);
    // Far mountains
    let x = -200;
    while (x < 5200) {
      const w = 260 + rng() * 300;
      const h = 120 + rng() * 150;
      this.farMtns.push({ x, w, h, peak: 0.3 + rng() * 0.4 });
      x += w * (0.55 + rng() * 0.3);
    }
    // Mid hills
    x = -200;
    while (x < 5200) {
      const w = 200 + rng() * 260;
      const h = 70 + rng() * 90;
      this.hills.push({ x, w, h });
      x += w * 0.6;
    }
    // Clouds
    for (let i = 0; i < 14; i++) {
      this.clouds.push({
        x: rng() * 5000,
        y: 30 + rng() * 150,
        s: 0.7 + rng() * 1.1,
        drift: 4 + rng() * 8,
      });
    }
  }

  private static readonly PALETTES = {
    meadow: {
      skyTop: '#7ec8f2', skyMid: '#b8e4f8', skyBot: '#eaf7e2',
      mtn: '#9fc3e0', hill: '#7fb069',
    },
    volcanic: {
      skyTop: '#140c26', skyMid: '#2b1740', skyBot: '#4a2138',
      mtn: '#362544', hill: '#4d2f52',
    },
    frost: {
      skyTop: '#7fb5e6', skyMid: '#bfe0f5', skyBot: '#eef7fc',
      mtn: '#9db8d6', hill: '#cfe3f0',
    },
  } as const;

  draw(ctx: CanvasRenderingContext2D, camX: number, t: number): void {
    const P = Background.PALETTES[this.theme];
    const night = this.theme === 'volcanic';
    const frost = this.theme === 'frost';

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, VH);
    sky.addColorStop(0, P.skyTop);
    sky.addColorStop(0.55, P.skyMid);
    sky.addColorStop(1, P.skyBot);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VW, VH);

    // Stars (night only)
    if (night) {
      for (const s of this.stars) {
        const sx = ((s.x - camX * 0.05) % (VW + 100) + VW + 100) % (VW + 100) - 50;
        const a = 0.35 + 0.45 * Math.sin(t * 1.4 + s.tw);
        ctx.fillStyle = `rgba(255,244,214,${a.toFixed(2)})`;
        ctx.fillRect(sx, s.y, s.r, s.r);
      }
      // Moon with soft glow
      const mx = 780 - camX * 0.02, my = 84;
      const mg = ctx.createRadialGradient(mx, my, 8, mx, my, 80);
      mg.addColorStop(0, 'rgba(255,236,200,0.75)');
      mg.addColorStop(1, 'rgba(255,236,200,0)');
      ctx.fillStyle = mg;
      ctx.fillRect(mx - 80, my - 80, 160, 160);
      ctx.fillStyle = '#f4e3c2';
      ctx.beginPath();
      ctx.arc(mx, my, 26, 0, TAU);
      ctx.fill();
      ctx.fillStyle = P.skyTop;
      ctx.beginPath();
      ctx.arc(mx + 10, my - 6, 22, 0, TAU);
      ctx.fill();
    } else {
      // Sun with soft glow (a pale, cold sun on the frostpeak)
      const sx = 150 - camX * 0.02, sy = 86;
      const warm = frost ? 'rgba(255,255,255,0.85)' : 'rgba(255,244,200,0.9)';
      const sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 90);
      sg.addColorStop(0, warm);
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(sx - 90, sy - 90, 180, 180);
      ctx.fillStyle = frost ? '#f8fbff' : '#ffe9a8';
      ctx.beginPath();
      ctx.arc(sx, sy, 34, 0, TAU);
      ctx.fill();
    }

    // Far mountains (parallax 0.12)
    ctx.fillStyle = P.mtn;
    for (const m of this.farMtns) {
      if (m.x + m.w < camX * 0.12 - 50 || m.x > camX * 0.12 + VW + 50) continue;
      const px = m.x - camX * 0.12;
      ctx.beginPath();
      ctx.moveTo(px, 420);
      ctx.lineTo(px + m.w * m.peak, 420 - m.h);
      ctx.lineTo(px + m.w, 420);
      ctx.closePath();
      ctx.fill();
      // Snow cap (day) / faint ember rim (night) / bright cap (frost)
      ctx.fillStyle = night ? 'rgba(255,140,60,0.28)' : frost ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.moveTo(px + m.w * m.peak, 420 - m.h);
      ctx.lineTo(px + m.w * m.peak - m.w * 0.09, 420 - m.h + 26);
      ctx.lineTo(px + m.w * m.peak + m.w * 0.09, 420 - m.h + 26);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = P.mtn;
    }
    // Clouds drift slowly, parallax 0.2 — white by day, drifting embers at night
    for (const c of this.clouds) {
      const cx = ((c.x + t * c.drift - camX * 0.2) % 5200 + 5200) % 5200 - 200;
      if (cx < -160 || cx > VW + 160) continue;
      if (night) {
        const a = 0.4 + 0.3 * Math.sin(t * 2 + c.x);
        ctx.fillStyle = `rgba(255,128,54,${a.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(cx, c.y + Math.sin(t * 0.8 + c.x) * 6, 2.2 * c.s, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.beginPath();
        ctx.ellipse(cx, c.y, 42 * c.s, 16 * c.s, 0, 0, TAU);
        ctx.ellipse(cx - 26 * c.s, c.y + 6 * c.s, 26 * c.s, 12 * c.s, 0, 0, TAU);
        ctx.ellipse(cx + 30 * c.s, c.y + 5 * c.s, 30 * c.s, 13 * c.s, 0, 0, TAU);
        ctx.fill();
      }
    }
    // Volcanoes (parallax 0.3)
    this.drawVolcano(ctx, camX * 0.3, 1500, t, 1.0);
    this.drawVolcano(ctx, camX * 0.3, 4200, t, 0.8);
    // Mid hills (parallax 0.5)
    ctx.fillStyle = P.hill;
    for (const h of this.hills) {
      const px = h.x - camX * 0.5;
      if (px + h.w < -50 || px > VW + 50) continue;
      ctx.beginPath();
      ctx.ellipse(px + h.w / 2, 520, h.w / 2, h.h, 0, Math.PI, TAU);
      ctx.fill();
    }

    // Ambient life (skipped in calm mode)
    if (!this.calm) {
      if (night) this.drawEmbers(ctx, t);
      else if (frost) this.drawSnow(ctx, t);
      else {
        this.drawBirds(ctx, t);
        this.drawPetals(ctx, t);
      }
    }
  }

  /** Drifting snowflakes for the frostpeak pass. */
  private drawSnow(ctx: CanvasRenderingContext2D, t: number): void {
    for (let i = 0; i < 26; i++) {
      const speed = 26 + (i % 5) * 9;
      const y = ((t * speed + i * 173) % (VH + 40)) - 20;
      const sway = Math.sin(t * 1.1 + i * 1.7) * 22;
      const x = ((i * 251) % (VW + 80)) + sway - 40;
      const r = 1.4 + (i % 3) * 0.9;
      ctx.fillStyle = i % 4 === 0 ? 'rgba(255,255,255,0.95)' : 'rgba(235,246,255,0.8)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }

  /** Occasional birds crossing the valley sky. */
  private drawBirds(ctx: CanvasRenderingContext2D, t: number): void {
    for (let i = 0; i < 2; i++) {
      const period = 16 + i * 7;
      const prog = ((t + i * 6.5) % period) / period;
      const x = -40 + prog * (VW + 80);
      const y = 74 + i * 34 + Math.sin(t * 1.4 + i * 2) * 10;
      const flap = Math.sin(t * 10 + i * 2.1) * 5;
      ctx.strokeStyle = 'rgba(70,84,96,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 9, y - flap * 0.6);
      ctx.quadraticCurveTo(x - 4, y - 4 - flap, x, y);
      ctx.quadraticCurveTo(x + 4, y - 4 - flap, x + 9, y - flap * 0.6);
      ctx.stroke();
    }
  }

  /** Petals drifting down the meadow on a lazy breeze. */
  private drawPetals(ctx: CanvasRenderingContext2D, t: number): void {
    const span = VW + 120;
    for (let i = 0; i < 9; i++) {
      const px = (((i * 173 + t * (22 + (i % 4) * 7)) % span) + span) % span - 60;
      const sway = Math.sin(t * 1.6 + i * 1.7) * 18;
      const py = (((i * 97 + t * (30 + (i % 3) * 9)) % (VH + 40)) + VH + 40) % (VH + 40) - 20;
      const a = 0.5 + 0.25 * Math.sin(t * 2.2 + i);
      ctx.save();
      ctx.translate(px + sway, py);
      ctx.rotate(Math.sin(t * 1.1 + i * 2.3) * 0.9);
      ctx.globalAlpha = a;
      ctx.fillStyle = i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#ffc9d6' : '#ffd9e2';
      ctx.beginPath();
      ctx.ellipse(0, 0, 5, 2.6, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** Extra embers spiralling up from below (night). */
  private drawEmbers(ctx: CanvasRenderingContext2D, t: number): void {
    const span = VW + 80;
    const riseSpan = VH * 0.92;
    for (let i = 0; i < 14; i++) {
      const px = (((i * 131 + t * (7 + (i % 3) * 4)) % span) + span) % span - 40;
      const rise = ((i * 71 + t * (20 + (i % 4) * 8)) % riseSpan + riseSpan) % riseSpan;
      const py = VH - rise;
      const a = 0.25 + 0.5 * Math.abs(Math.sin(t * 3 + i * 1.9));
      ctx.fillStyle = `rgba(255,${140 + (i % 3) * 40},60,${a.toFixed(2)})`;
      ctx.fillRect(px, py, 2.4, 2.4);
    }
  }

  private drawVolcano(ctx: CanvasRenderingContext2D, off: number, worldX: number, t: number, scale: number): void {
    const x = worldX - off;
    if (x < -400 || x > VW + 400) return;
    const night = this.theme === 'volcanic';
    ctx.fillStyle = night ? '#241830' : '#b0826a';
    ctx.beginPath();
    ctx.moveTo(x - 170 * scale, 520);
    ctx.lineTo(x - 40 * scale, 250 - 40 * scale);
    ctx.lineTo(x + 40 * scale, 250 - 40 * scale);
    ctx.lineTo(x + 170 * scale, 520);
    ctx.closePath();
    ctx.fill();
    // lava streak (brighter when the volcano theme is active)
    ctx.strokeStyle = night ? '#ff8a3c' : '#e0703a';
    ctx.lineWidth = (night ? 6 : 5) * scale;
    ctx.beginPath();
    ctx.moveTo(x - 12 * scale, 255 - 40 * scale);
    ctx.lineTo(x + 4 * scale, 330);
    ctx.lineTo(x - 6 * scale, 400);
    ctx.stroke();
    // crater smoke puffs
    for (let i = 0; i < 4; i++) {
      const tt = (t * 0.25 + i * 0.25) % 1;
      ctx.globalAlpha = 0.5 * (1 - tt);
      ctx.fillStyle = '#e8e2d8';
      ctx.beginPath();
      ctx.arc(x + Math.sin(tt * 6 + i) * 14 * scale, 240 - 40 * scale - tt * 90, (6 + tt * 16) * scale, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
