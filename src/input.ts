export type GameKey =
  | 'codex'
  | 'hall'
  | 'skinPrev'
  | 'skinNext'
  | 'restart'
  | 'mute'
  | 'reducedMotion'
  | 'ghost'
  | 'debug'
  | 'pause'
  | 'primary'
  | 'visibility'
  | 'left'
  | 'right'
  | 'up'
  | 'down';

export type TouchButtonName = 'left' | 'right' | 'jump';

export interface PadState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  primary: boolean;
}

/** Keyboard + touch + gamepad input, with jump buffering for the player. */
export class Input {
  keys: Record<string, boolean> = Object.create(null) as Record<string, boolean>;
  touch = { left: false, right: false, jump: false };
  pad: PadState = { left: false, right: false, up: false, down: false, jump: false, primary: false };
  private padPrev = { jump: false, primary: false };
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
    return this._jumpHeld || this.touch.jump || this.pad.jump;
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
      if (e.code === 'KeyG') this.onGameKey?.('ghost');
      if (e.code === 'KeyC') this.onGameKey?.('codex');
      if (e.code === 'KeyL') this.onGameKey?.('hall');
      if (e.code === 'BracketLeft') this.onGameKey?.('skinPrev');
      if (e.code === 'BracketRight') this.onGameKey?.('skinNext');
      if (e.code === 'F2') {
        e.preventDefault();
        this.onGameKey?.('debug');
      }
      if (['KeyP', 'Escape'].includes(e.code)) this.onGameKey?.('pause');
      if (e.code === 'Enter' || e.code === 'Space') this.onGameKey?.('primary');
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.onGameKey?.('left');
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.onGameKey?.('right');
      if (e.code === 'ArrowDown' || e.code === 'KeyS') this.onGameKey?.('down');
      if (e.code === 'ArrowUp' || e.code === 'KeyW') this.onGameKey?.('up');
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
      this.pad.left = this.pad.right = this.pad.up = this.pad.down = false;
      this.pad.jump = this.pad.primary = false;
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.onGameKey?.('visibility');
    });
  }

  get left(): boolean {
    return !!(this.keys['ArrowLeft'] || this.keys['KeyA'] || this.touch.left || this.pad.left);
  }

  get right(): boolean {
    return !!(this.keys['ArrowRight'] || this.keys['KeyD'] || this.touch.right || this.pad.right);
  }

  /**
   * Poll connected gamepads (call once per frame). Maps stick axes to
   * movement/nav and A/B/X to jump/primary. Edge-triggers the jump buffer
   * and the primary game-key on button presses.
   */
  pollGamepad(): void {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    let gp: Gamepad | null = null;
    try {
      for (const p of navigator.getGamepads()) {
        if (p && p.connected) {
          gp = p;
          break;
        }
      }
    } catch {
      return;
    }
    const clear = (): void => {
      this.pad.left = this.pad.right = this.pad.up = this.pad.down = false;
      this.pad.jump = this.pad.primary = false;
    };
    if (!gp) {
      clear();
      return;
    }
    const ax = gp.axes[0] ?? 0;
    const ay = gp.axes[1] ?? 0;
    this.pad.left = ax < -0.4;
    this.pad.right = ax > 0.4;
    this.pad.up = ay < -0.4;
    this.pad.down = ay > 0.4;
    const btn = (i: number): boolean => !!(gp.buttons[i] && gp.buttons[i].pressed);
    this.pad.jump = btn(0) || btn(3); // A or X
    this.pad.primary = btn(1) || btn(9); // B or start
    // Rising edge: stamp the jump buffer and fire the primary game-key.
    if (this.pad.jump && !this.padPrev.jump) this.jumpBufferT = this.now();
    if (this.pad.primary && !this.padPrev.primary) this.onGameKey?.('primary');
    this.padPrev.jump = this.pad.jump;
    this.padPrev.primary = this.pad.primary;
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
