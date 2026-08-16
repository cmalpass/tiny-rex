import { TAU } from './config';
import type { Enemy } from './enemy';
import type { PlayerState } from './player';

/** The state fields Sprite.drawRex reads (Player satisfies this structurally). */
export interface RexView {
  x: number;
  y: number;
  w: number;
  h: number;
  facing: number;
  state: PlayerState;
  runPhase: number;
  vy: number;
  squashX: number;
  squashY: number;
  invulnT: number;
  dead: boolean;
  /** Death-tumble rotation (radians); 0 outside the dead state. */
  rot: number;
}

/** Procedural character & enemy art. */
export const Sprite = {
  /* Rex the baby T-rex. (0,0) = hitbox bottom-center. */
  drawRex(ctx: CanvasRenderingContext2D, p: RexView, t: number): void {
    const blink = p.invulnT > 0 && Math.floor(t * 14) % 2 === 0;
    if (blink) return; // flashing while invulnerable
    const dead = p.dead;
    const victory = p.state === 'victory';
    const run = p.state === 'run';
    const jump = p.state === 'jump' || p.state === 'fall';
    const phase = p.runPhase;
    // Squash & stretch anchored at the feet
    ctx.save();
    ctx.translate(p.x + p.w / 2, p.y + p.h);
    if (dead) ctx.rotate(p.rot);
    ctx.scale(p.squashX * p.facing, p.squashY);
    const bob = run ? Math.abs(Math.sin(phase)) * 3 : Math.sin(t * 3) * 1.5;
    const legA = run ? Math.sin(phase) * 7 : 0;
    const legB = run ? Math.sin(phase + Math.PI) * 7 : 0;
    const tailWag = run ? Math.sin(phase * 1.5) * 4 : Math.sin(t * 2.4) * 2;
    const breathe = 1 + Math.sin(t * 3) * 0.02;

    // Tail (behind body)
    ctx.fillStyle = '#59b25f';
    ctx.beginPath();
    ctx.moveTo(-12, -12);
    ctx.quadraticCurveTo(-26, -14 + tailWag, -32, -26 + tailWag);
    ctx.quadraticCurveTo(-24, -20 + tailWag, -12, -20);
    ctx.closePath();
    ctx.fill();

    // Legs
    ctx.fillStyle = '#4c9d52';
    const footY = 0;
    ctx.beginPath();
    ctx.ellipse(-6 + legA, footY - 4 + Math.max(0, legA * 0.2), 7, 6, 0, 0, TAU);
    ctx.ellipse(8 + legB, footY - 4 + Math.max(0, legB * 0.2), 7, 6, 0, 0, TAU);
    ctx.fill();

    // Body
    ctx.fillStyle = '#59b25f';
    ctx.beginPath();
    ctx.ellipse(0, -20 + bob * 0.4, 15, 13 * breathe, 0, 0, TAU);
    ctx.fill();
    // Cream belly
    ctx.fillStyle = '#f7ecd4';
    ctx.beginPath();
    ctx.ellipse(3, -17 + bob * 0.4, 9, 8 * breathe, 0, 0, TAU);
    ctx.fill();

    // Tiny arms
    ctx.strokeStyle = '#4c9d52';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    const armUp = victory ? -14 : 0;
    ctx.beginPath();
    ctx.moveTo(8, -22 + bob * 0.4);
    ctx.lineTo(14, -18 + bob * 0.4 + armUp);
    ctx.moveTo(5, -22 + bob * 0.4);
    ctx.lineTo(10, -16 + bob * 0.4 + armUp);
    ctx.stroke();

    // Head (large)
    const hy = -34 + bob;
    ctx.fillStyle = '#59b25f';
    ctx.beginPath();
    ctx.ellipse(2, hy, 14.5, 13, 0, 0, TAU);
    ctx.fill();
    // Snout
    ctx.beginPath();
    ctx.ellipse(12, hy + 4, 8.5, 6.5, 0, 0, TAU);
    ctx.fill();
    // Nostril
    ctx.fillStyle = '#2f6e36';
    ctx.beginPath();
    ctx.arc(16, hy + 2, 1.2, 0, TAU);
    ctx.fill();
    // Smile
    ctx.strokeStyle = '#2f6e36';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(11, hy + 5, 4.5, 0.15 * Math.PI, 0.75 * Math.PI);
    ctx.stroke();
    // Eye
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(5, hy - 3.5, 5.2, 6, 0, 0, TAU);
    ctx.fill();
    if (dead) {
      // X eyes
      ctx.strokeStyle = '#2f6e36';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(2.5, hy - 6);
      ctx.lineTo(7.5, hy - 1);
      ctx.moveTo(7.5, hy - 6);
      ctx.lineTo(2.5, hy - 1);
      ctx.stroke();
    } else if (p.state === 'hurt') {
      ctx.fillStyle = '#2f6e36';
      ctx.beginPath();
      ctx.arc(5.5, hy - 3, 2.2, 0, TAU);
      ctx.fill();
    } else if (jump) {
      // wide eyes in the air
      ctx.fillStyle = '#2f6e36';
      ctx.beginPath();
      ctx.arc(6, hy - 3.5, 3.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(7, hy - 4.5, 1.1, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = '#2f6e36';
      const lookY = p.vy < -50 ? -1 : 0;
      ctx.beginPath();
      ctx.arc(6, hy - 3 + lookY, 2.8, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(7, hy - 4 + lookY, 1.1, 0, TAU);
      ctx.fill();
    }
    // Rosy cheek
    ctx.fillStyle = 'rgba(255,140,150,0.65)';
    ctx.beginPath();
    ctx.ellipse(9, hy + 3.5, 3.4, 2.4, 0, 0, TAU);
    ctx.fill();
    // Head spikes (baby-sized)
    ctx.fillStyle = '#4c9d52';
    for (let i = 0; i < 3; i++) {
      const sx2 = -8 + i * 6;
      ctx.beginPath();
      ctx.moveTo(sx2, hy - 11);
      ctx.lineTo(sx2 + 3, hy - 17 + i * 1.5);
      ctx.lineTo(sx2 + 6, hy - 11);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  },

  drawBeetle(ctx: CanvasRenderingContext2D, e: Enemy): void {
    ctx.save();
    ctx.translate(e.x + e.w / 2, e.y + e.h);
    ctx.scale(e.dir * (1 + e.squash * 0.2), 1 - e.squash * 0.35);
    const hop = Math.sin(e.phase * 2) * 1.5;
    // legs
    ctx.strokeStyle = '#3a2018';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      const lo = Math.sin(e.phase + i * 2) * 3;
      ctx.beginPath();
      ctx.moveTo(i * 8, -8);
      ctx.lineTo(i * 8 + lo, 0);
      ctx.stroke();
    }
    // body dome
    ctx.fillStyle = '#7a3b2e';
    ctx.beginPath();
    ctx.ellipse(0, -14 + hop, 17, 12 - e.squash * 4, 0, 0, TAU);
    ctx.fill();
    // shell plates
    ctx.strokeStyle = '#5c2c22';
    ctx.lineWidth = 2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.arc(0, -14 + hop, 15 - Math.abs(i) * 4, -0.75 * Math.PI, -0.25 * Math.PI);
      ctx.stroke();
    }
    // head
    ctx.fillStyle = '#5c2c22';
    ctx.beginPath();
    ctx.ellipse(14, -12 + hop, 8, 7, 0, 0, TAU);
    ctx.fill();
    // eye
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(17, -14 + hop, 3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#241511';
    ctx.beginPath();
    ctx.arc(18, -14 + hop, 1.5, 0, TAU);
    ctx.fill();
    // antennae
    ctx.strokeStyle = '#3a2018';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(18, -18 + hop);
    ctx.quadraticCurveTo(22, -24 + hop, 25, -23 + hop);
    ctx.moveTo(16, -19 + hop);
    ctx.quadraticCurveTo(18, -26 + hop, 21, -27 + hop);
    ctx.stroke();
    ctx.restore();
  },

  drawTrike(ctx: CanvasRenderingContext2D, e: Enemy): void {
    ctx.save();
    ctx.translate(e.x + e.w / 2, e.y + e.h);
    ctx.scale(e.dir * (1 + e.squash * 0.15), 1 - e.squash * 0.3);
    const air = !e.grounded;
    const legA = air ? 4 : Math.sin(e.phase) * 4;
    // legs
    ctx.fillStyle = '#5d7690';
    ctx.beginPath();
    ctx.ellipse(-10 + legA, -4, 6, 5, 0, 0, TAU);
    ctx.ellipse(10 - legA, -4, 6, 5, 0, 0, TAU);
    ctx.fill();
    // tail
    ctx.strokeStyle = '#7d97ad';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-14, -16);
    ctx.quadraticCurveTo(-22, -18 + Math.sin(e.phase) * 2, -24, -12);
    ctx.stroke();
    // body
    ctx.fillStyle = '#7d97ad';
    ctx.beginPath();
    ctx.ellipse(0, -16, 17, 13, 0, 0, TAU);
    ctx.fill();
    // belly
    ctx.fillStyle = '#c3d3e0';
    ctx.beginPath();
    ctx.ellipse(2, -13, 10, 8, 0, 0, TAU);
    ctx.fill();
    // head
    ctx.beginPath();
    ctx.ellipse(15, -24, 10, 9, 0, 0, TAU);
    ctx.fill();
    // frill
    ctx.fillStyle = '#6b86a0';
    ctx.beginPath();
    ctx.ellipse(8, -28, 8, 10, -0.3, 0, TAU);
    ctx.fill();
    // horns
    ctx.fillStyle = '#f2e9d8';
    for (const [hx, hy, hl] of [[19, -30, 6], [22, -27, 5], [16, -32, 4]]) {
      ctx.beginPath();
      ctx.moveTo(hx - 2, hy);
      ctx.lineTo(hx, hy - hl);
      ctx.lineTo(hx + 2, hy);
      ctx.closePath();
      ctx.fill();
    }
    // eye
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(18, -26, 3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#20303f';
    ctx.beginPath();
    ctx.arc(19, -26, 1.5, 0, TAU);
    ctx.fill();
    // cheek
    ctx.fillStyle = 'rgba(255,150,160,0.5)';
    ctx.beginPath();
    ctx.arc(14, -22, 2.5, 0, TAU);
    ctx.fill();
    ctx.restore();
  },

  drawPtero(ctx: CanvasRenderingContext2D, e: Enemy): void {
    ctx.save();
    ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
    const flap = Math.sin(e.phase * 9);
    const dir = Math.cos(e.phase * 0.9 + e.phase0) >= 0 ? 1 : -1;
    ctx.scale(dir, 1);
    // wings
    ctx.fillStyle = '#e8a0b4';
    ctx.save();
    ctx.rotate(-flap * 0.7);
    ctx.beginPath();
    ctx.moveTo(-2, -2);
    ctx.quadraticCurveTo(-16, -12, -24, -4);
    ctx.quadraticCurveTo(-14, 0, -2, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.rotate(flap * 0.5);
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.quadraticCurveTo(14, -8, 22, -2);
    ctx.quadraticCurveTo(12, 2, 2, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // body
    ctx.fillStyle = '#f2b8c6';
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 9, 0, 0, TAU);
    ctx.fill();
    // belly
    ctx.fillStyle = '#fde3ea';
    ctx.beginPath();
    ctx.ellipse(1, 3, 9, 5, 0, 0, TAU);
    ctx.fill();
    // head
    ctx.fillStyle = '#f2b8c6';
    ctx.beginPath();
    ctx.arc(13, -4, 7, 0, TAU);
    ctx.fill();
    // crest
    ctx.fillStyle = '#e88aa5';
    ctx.beginPath();
    ctx.moveTo(8, -9);
    ctx.quadraticCurveTo(2, -16, 10, -14);
    ctx.quadraticCurveTo(12, -11, 12, -8);
    ctx.closePath();
    ctx.fill();
    // beak
    ctx.fillStyle = '#f2c14e';
    ctx.beginPath();
    ctx.moveTo(18, -4);
    ctx.lineTo(26, -2);
    ctx.lineTo(18, 0);
    ctx.closePath();
    ctx.fill();
    // eye
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(15, -5, 3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#3a2530';
    ctx.beginPath();
    ctx.arc(16, -5, 1.5, 0, TAU);
    ctx.fill();
    ctx.restore();
  },
};
