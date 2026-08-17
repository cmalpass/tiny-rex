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
  } as const;

  draw(ctx: CanvasRenderingContext2D, camX: number, t: number): void {
    const P = Background.PALETTES[this.theme];
    const night = this.theme === 'volcanic';

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
      // Sun with soft glow
      const sx = 150 - camX * 0.02, sy = 86;
      const sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 90);
      sg.addColorStop(0, 'rgba(255,244,200,0.9)');
      sg.addColorStop(1, 'rgba(255,244,200,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(sx - 90, sy - 90, 180, 180);
      ctx.fillStyle = '#ffe9a8';
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
      // Snow cap (day) / faint ember rim (night)
      ctx.fillStyle = night ? 'rgba(255,140,60,0.28)' : 'rgba(255,255,255,0.75)';
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
