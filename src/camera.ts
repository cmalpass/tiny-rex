import { CFG, VW } from './config';
import { clamp } from './util';
import type { Player } from './player';
import type { GameCtx } from './ctx';

export class Camera {
  x = 0;
  y = 0;
  shake = 0;
  ox = 0;
  oy = 0;

  /**
   * Smooth horizontal follow with slight look-ahead in the facing
   * direction, clamped so level edges are never revealed.
   */
  update(dt: number, player: Player, levelW: number, game: GameCtx): void {
    const target = player.x + player.w / 2 - VW * 0.44 + player.facing * CFG.camera.lookAhead;
    this.x += (target - this.x) * Math.min(1, CFG.camera.lerp * dt);
    this.x = clamp(this.x, 0, Math.max(0, levelW - VW));
    // Screen shake decays quickly; disabled with reduced motion.
    this.shake = Math.max(0, this.shake - this.shake * 8 * dt - 0.2 * dt);
    if (game.reducedMotion) {
      this.ox = 0;
      this.oy = 0;
    } else {
      this.ox = (Math.random() * 2 - 1) * this.shake;
      this.oy = (Math.random() * 2 - 1) * this.shake * 0.7;
    }
  }

  addShake(m: number): void {
    this.shake = Math.min(CFG.camera.maxShake, Math.max(this.shake, m));
  }
}
