import { TAU, FONT_STACK } from './config';
import type { DecorDef } from './level-data';

/** Trees, bushes, rocks, flowers, crystal rocks, the "next" sign, grass tufts. */
export function drawDecor(ctx: CanvasRenderingContext2D, d: DecorDef, t: number, groundY: number): void {
  const x = d.x, y = d.y === undefined ? groundY : d.y, s = d.s || 1;
  if (d.type === 'tree') {
    ctx.fillStyle = '#8a5f3c';
    ctx.fillRect(x - 6 * s, y - 46 * s, 12 * s, 46 * s);
    const sway = Math.sin(t * 1.4 + x) * 2 * s;
    ctx.fillStyle = '#4f9d4a';
    ctx.beginPath();
    ctx.arc(x + sway, y - 66 * s, 30 * s, 0, TAU);
    ctx.arc(x - 22 * s + sway, y - 50 * s, 22 * s, 0, TAU);
    ctx.arc(x + 22 * s + sway, y - 50 * s, 22 * s, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#63b45c';
    ctx.beginPath();
    ctx.arc(x - 8 * s + sway, y - 72 * s, 14 * s, 0, TAU);
    ctx.fill();
  } else if (d.type === 'bush') {
    ctx.fillStyle = '#5da854';
    ctx.beginPath();
    ctx.ellipse(x, y - 10 * s, 22 * s, 13 * s, 0, 0, TAU);
    ctx.arc(x - 14 * s, y - 14 * s, 12 * s, 0, TAU);
    ctx.arc(x + 14 * s, y - 14 * s, 12 * s, 0, TAU);
    ctx.fill();
  } else if (d.type === 'rock') {
    ctx.fillStyle = '#a89f91';
    ctx.beginPath();
    ctx.moveTo(x - 16 * s, y);
    ctx.lineTo(x - 8 * s, y - 16 * s);
    ctx.lineTo(x + 6 * s, y - 20 * s);
    ctx.lineTo(x + 16 * s, y - 6 * s);
    ctx.lineTo(x + 14 * s, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8d8478';
    ctx.beginPath();
    ctx.moveTo(x - 8 * s, y - 16 * s);
    ctx.lineTo(x + 6 * s, y - 20 * s);
    ctx.lineTo(x + 4 * s, y - 8 * s);
    ctx.closePath();
    ctx.fill();
  } else if (d.type === 'flower') {
    const sway = Math.sin(t * 2 + x) * 2;
    ctx.strokeStyle = '#4f9d4a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + sway, y - 10, x + sway, y - 18);
    ctx.stroke();
    ctx.fillStyle = d.color || '#ff8fa3';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + t * 0.3;
      ctx.beginPath();
      ctx.arc(x + sway + Math.cos(a) * 5, y - 18 + Math.sin(a) * 5, 3.4, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#ffd257';
    ctx.beginPath();
    ctx.arc(x + sway, y - 18, 3, 0, TAU);
    ctx.fill();
  } else if (d.type === 'crystalrock') {
    ctx.fillStyle = '#9a8fae';
    ctx.beginPath();
    ctx.moveTo(x - 20 * s, y);
    ctx.lineTo(x - 10 * s, y - 24 * s);
    ctx.lineTo(x + 2 * s, y - 14 * s);
    ctx.lineTo(x + 12 * s, y - 28 * s);
    ctx.lineTo(x + 22 * s, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#b9a8e8';
    ctx.beginPath();
    ctx.moveTo(x - 10 * s, y - 24 * s);
    ctx.lineTo(x - 4 * s, y - 40 * s);
    ctx.lineTo(x + 2 * s, y - 14 * s);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 12 * s, y - 28 * s);
    ctx.lineTo(x + 18 * s, y - 46 * s);
    ctx.lineTo(x + 20 * s, y - 20 * s);
    ctx.closePath();
    ctx.fill();
  } else if (d.type === 'sign') {
    ctx.fillStyle = '#8a5f3c';
    ctx.fillRect(x - 3, y - 44, 6, 44);
    ctx.fillStyle = '#b07f4a';
    ctx.fillRect(x - 24, y - 62, 48, 24);
    ctx.strokeStyle = '#6d4a28';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 24, y - 62, 48, 24);
    ctx.fillStyle = '#fff';
    ctx.font = '800 13px ' + FONT_STACK;
    ctx.textAlign = 'center';
    ctx.fillText('→', x, y - 45);
  } else if (d.type === 'tuft') {
    const sway = Math.sin(t * 2.2 + x) * 2;
    ctx.strokeStyle = '#5da854';
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * 4, y);
      ctx.quadraticCurveTo(x + i * 5 + sway, y - 8, x + i * 6 + sway, y - 13);
      ctx.stroke();
    }
  }
}
