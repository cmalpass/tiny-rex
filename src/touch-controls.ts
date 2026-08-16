import type { Game } from './game';

/**
 * Binds the DOM touch buttons (#btn-left / #btn-right / #btn-jump) with
 * per-button pointer tracking so multi-touch works, plus the pause button.
 * Mirrors the original `bindTouchControls()`.
 */
export function bindTouchControls(game: Game): void {
  const show = (): void => {
    const el = document.getElementById('touch-controls');
    if (el) el.classList.add('visible');
  };
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) show();
  window.addEventListener('touchstart', show, { once: true, passive: true });

  const bindBtn = (id: string, name: 'left' | 'right' | 'jump'): void => {
    const el = document.getElementById(id);
    if (!el) return;
    const pointers = new Set<number>();
    const set = (down: boolean): void => game.input.touchBtn(name, down);
    el.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      if (el.setPointerCapture) {
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* noop */
        }
      }
      pointers.add(e.pointerId);
      set(true);
      el.classList.add('pressed');
    });
    const release = (e: PointerEvent): void => {
      if (!pointers.delete(e.pointerId)) return;
      el.classList.remove('pressed');
      if (pointers.size === 0) set(false);
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);
    el.addEventListener('contextmenu', (e: Event) => e.preventDefault());
  };

  bindBtn('btn-left', 'left');
  bindBtn('btn-right', 'right');
  bindBtn('btn-jump', 'jump');

  const pauseBtn = document.getElementById('pauseBtn');
  if (pauseBtn) {
    pauseBtn.addEventListener('pointerdown', (e: Event) => {
      e.preventDefault();
      game.audio.unlock();
      if (game.state === 'playing') game.pause();
      else if (game.state === 'paused') game.resume();
    });
    pauseBtn.addEventListener('contextmenu', (e: Event) => e.preventDefault());
  }
}
