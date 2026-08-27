import { TAU } from './config';

export interface NoteEntry {
  title: string;
  text: string;
  /** Shown in the codex for undiscovered notes. */
  hint: string;
}

/**
 * The dino-archaeologist's field notes: 3 per hand-built level (12 total).
 * Discovered in the world, read on the menu codex screen.
 */
export const NOTES: NoteEntry[][] = [
  // Crystal Valley
  [
    {
      title: 'Day 1 — A grown valley',
      text: 'The valley is older than it looks. Under the meadow grass I found a geode the size of an egg, and inside it a perfect crystal seed. Whatever made this valley grew things on purpose.',
      hint: 'Rest by the first flag',
    },
    {
      title: 'Day 3 — The gardeners',
      text: 'The beetles here do not attack. They graze. I watched a trike nap in the shadow of a geode. This is not a habitat, it is a garden — and someone was tending it.',
      hint: 'Rest by the last flag',
    },
    {
      title: 'Day 5 — A bone that was a tool',
      text: 'At the top of the jump chain I found a fossil. It is not a dino bone — it is a tool, worn smooth by a grip. The valley\u2019s builders had hands. Or something like hands.',
      hint: 'Take the high route over the lava',
    },
  ],
  // Volcanic Depths
  [
    {
      title: 'Day 12 — The geyser clock',
      text: 'The geysers erupt on a schedule. I counted: every six minutes, same vent, same arc. Volcanoes do not keep schedules. People do.',
      hint: 'Rest by the first flag',
    },
    {
      title: 'Day 14 — The waiting ribcage',
      text: 'Behind the lava moat I found a fossil ribcage fused into a cooling flow. The animal stood its ground when the lava came. It did not run. It was waiting for something to arrive.',
      hint: 'Stand above the falling rocks',
    },
    {
      title: 'Day 17 — A creature that counted',
      text: 'The falling rocks have a pattern too. Count the bubbles before the vent, count your steps after. The deep passages were built for a creature that could count.',
      hint: 'Rest by the last flag',
    },
  ],
  // Frostpeak Pass
  [
    {
      title: 'Day 21 — The mountain breathes',
      text: 'The wind gusts are stronger than physics should allow. They blow on the minute, always from the west, always from the pass. I am no longer sure the mountain is asleep.',
      hint: 'Rest by the first flag',
    },
    {
      title: 'Day 24 — The egg in the ice',
      text: 'I found a fossil egg in the ice shelf. It is not empty. Something small is moving in there, and it has been dreaming for a hundred thousand years. I did not dig any deeper.',
      hint: 'Take the high route over the spike pit',
    },
    {
      title: 'Day 27 — Warm snow',
      text: 'Past the final gate the snow is warm to the touch. Something large sleeps beneath this peak, and the gates keep the draft out. I left it sleeping. Some things are better that way.',
      hint: 'Go behind the last gate',
    },
  ],
  // Molten Nest
  [
    {
      title: 'Day 30 — The king is a teacher',
      text: 'The Magma King does not charge in anger. He charges in a pattern, and he warns you with a glow. Even a boss is a teacher. I wrote down the rhythm of his strikes.',
      hint: 'Rest by the flag before the arena',
    },
    {
      title: 'Day 33 — A lullaby of light',
      text: 'The crystal orbs are not weapons. They are a lullaby. When all three burn bright the King slows his breath and the arena goes quiet. Whoever built this nest built a way to put him to sleep.',
      hint: 'In the arena nook by the right wall',
    },
    {
      title: 'Day 35 — The empty nest',
      text: 'After the last battle the nest was not empty. Under the ash lay a single warm egg. I am leaving it here, guarded. Some things are too big for a journal, so I am writing it down anyway.',
      hint: 'Behind the gate, near the nest',
    },
  ],
];

export function totalNotes(): number {
  return NOTES.reduce((n, level) => n + level.length, 0);
}

/**
 * A field-note page: a persistent meta-collectible. Found once (stored
 * across runs by id "<levelIdx>:<i>"), re-collectable for score on later
 * runs — the codex keeps the first discovery.
 */
export class FieldNote {
  x: number;
  y: number;
  w = 26;
  h = 30;
  id: string;
  collected = false;
  phase = Math.random() * TAU;

  constructor(x: number, y: number, id: string) {
    this.x = x;
    this.y = y;
    this.id = id;
  }

  get rect(): { x: number; y: number; w: number; h: number } {
    return { x: this.x - 13, y: this.y - 15, w: 26, h: 30 };
  }

  draw(ctx: CanvasRenderingContext2D, t: number): void {
    const bob = Math.sin(t * 1.7 + this.phase) * 2.5;
    const sway = Math.sin(t * 1.3 + this.phase) * 0.14;
    const cx = this.x;
    const cy = this.y + bob;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.1 + this.phase);
    ctx.save();
    ctx.translate(cx, cy);
    // cool parchment glow (fossils glow warm, notes glow cool)
    ctx.globalAlpha = 0.2 + 0.16 * pulse;
    ctx.fillStyle = '#cfe6ff';
    ctx.beginPath();
    ctx.arc(0, 0, 17 + 2 * pulse, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.rotate(sway);
    // page
    const grad = ctx.createLinearGradient(0, -12, 0, 12);
    grad.addColorStop(0, '#fbf6ea');
    grad.addColorStop(1, '#e7dcc2');
    ctx.fillStyle = grad;
    this.roundedPage(ctx, -10, -12, 20, 24, 3);
    ctx.fill();
    // ruled lines
    ctx.strokeStyle = 'rgba(90,110,150,0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-6, -6 + i * 5);
      ctx.lineTo(6, -6 + i * 5);
      ctx.stroke();
    }
    // wax seal
    ctx.fillStyle = '#c0555f';
    ctx.beginPath();
    ctx.arc(5, 8, 2.6, 0, TAU);
    ctx.fill();
    // outline
    ctx.strokeStyle = 'rgba(110,100,70,0.5)';
    ctx.lineWidth = 1;
    this.roundedPage(ctx, -10, -12, 20, 24, 3);
    ctx.stroke();
    ctx.restore();
    // sparkle
    if (Math.sin(t * 1.9 + this.phase * 3) > 0.88) {
      ctx.save();
      ctx.translate(cx + 11, cy - 13);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-3.5, 0);
      ctx.lineTo(3.5, 0);
      ctx.moveTo(0, -3.5);
      ctx.lineTo(0, 3.5);
      ctx.stroke();
      ctx.restore();
    }
  }

  private roundedPage(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
}
