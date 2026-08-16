import { Game } from './game';
import { CFG } from './config';
import { bindTouchControls } from './touch-controls';

declare global {
  interface Window {
    TINY_REX?: { game: Game; CFG: typeof CFG };
  }
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
window.TINY_REX = { game, CFG }; // debug/test handle
bindTouchControls(game);
game.start();

export { game };
