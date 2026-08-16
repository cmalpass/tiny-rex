export type GameKey =
  | 'restart'
  | 'mute'
  | 'reducedMotion'
  | 'debug'
  | 'pause'
  | 'primary'
  | 'visibility';

export type TouchButtonName = 'left' | 'right' | 'jump';

/** Keyboard + touch-button input, with jump buffering for the player. */
export class Input {
  keys: Record<string, boolean> = Object.create(null) as Record<string, boolean>;
  touch = { left: false, right: false, jump: false };
  /** Game-time (seconds) of the last jump press; -1 when none. Consumed by Player. */
  jumpBufferT = -1;
  private _jumpHeld = false;
  onGameKey: ((key: GameKey) => void) | null = null;
  /**
   * Clock used to stamp jump-buffer presses. Game wires this to its own
   * (unpaused) game clock so buffering works across pause boundaries.
   */
  now: () => number = () => performance.now() / 1000;

  constructor() {
    this.bind();
  }

  get jumpHeld(): boolean {
    return this._jumpHeld || this.touch.jump;
  }

  private bind(): void {
    const prevent = (e: Event): void => e.preventDefault();
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) prevent(e);
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (e.code === 'KeyR') this.onGameKey?.('restart');
      if (e.code === 'KeyM') this.onGameKey?.('mute');
      if (e.code === 'KeyV') this.onGameKey?.('reducedMotion');
      if (e.code === 'F2') {
        e.preventDefault();
        this.onGameKey?.('debug');
      }
      if (['KeyP', 'Escape'].includes(e.code)) this.onGameKey?.('pause');
      if (e.code === 'Enter') this.onGameKey?.('primary');
      if (['Space', 'ArrowUp', 'KeyW'].includes(e.code) && !this._jumpHeld) {
        this._jumpHeld = true;
        this.jumpBufferT = this.now();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) this._jumpHeld = false;
    });
    window.addEventListener('blur', () => {
      this.keys = Object.create(null) as Record<string, boolean>;
      this._jumpHeld = false;
      this.touch.left = this.touch.right = this.touch.jump = false;
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.onGameKey?.('visibility');
    });
  }

  get left(): boolean {
    return !!(this.keys['ArrowLeft'] || this.keys['KeyA'] || this.touch.left);
  }

  get right(): boolean {
    return !!(this.keys['ArrowRight'] || this.keys['KeyD'] || this.touch.right);
  }

  set touchJump(v: boolean) {
    if (v && !this.touch.jump) this.jumpBufferT = this.now();
    this.touch.jump = v;
  }

  /** Called by the HTML touch buttons (multi-touch: each button tracks its own pointer). */
  touchBtn(name: TouchButtonName, down: boolean): void {
    if (name === 'jump') this.touchJump = down;
    else this.touch[name] = down;
  }
}
