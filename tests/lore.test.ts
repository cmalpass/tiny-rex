import { describe, it, expect, beforeEach } from 'vitest';
import { FieldNote, NOTES, totalNotes } from '../src/lore';
import { LEVELS } from '../src/level-data';
import { Level } from '../src/level';
import { makeCtx } from './mock-ctx';
import { Store, getFoundNotes, findNote } from '../src/store';
import { Game } from '../src/game';

function makeGame(): Game {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  return new Game(canvas);
}

describe('FieldNote entity', () => {
  it('exposes a collision rect centred on its position', () => {
    const n = new FieldNote(300, 400, '0:0');
    expect(n.rect).toEqual({ x: 287, y: 385, w: 26, h: 30 });
    expect(n.collected).toBe(false);
    expect(n.id).toBe('0:0');
  });

  it('draws without error at several animation phases', () => {
    const n = new FieldNote(300, 400, '0:0');
    const ctx = document.createElement('canvas').getContext('2d')!;
    for (const t of [0, 0.5, 1.2, 3.9, 9.7]) n.draw(ctx, t);
  });

  it('builds stable "levelIdx:i" ids from level data', () => {
    const level = new Level(LEVELS[2].def, makeCtx(), 1, 2);
    expect(level.notes).toHaveLength(3);
    expect(level.notes.map((n) => n.id)).toEqual(['2:0', '2:1', '2:2']);
  });

  it('re-collects after a respawn reset', () => {
    const level = new Level(LEVELS[0].def, makeCtx(), 1, 0);
    const n = level.notes[0];
    n.collected = true;
    level.reset();
    expect(n.collected).toBe(false);
  });
});

describe('Field note content', () => {
  it('has exactly 3 notes per hand-built level (12 total)', () => {
    expect(NOTES.length).toBe(LEVELS.length);
    for (const levelNotes of NOTES) expect(levelNotes).toHaveLength(3);
    expect(totalNotes()).toBe(12);
  });

  it('every note has a title, a paragraph of text and a hint', () => {
    for (const levelNotes of NOTES) {
      for (const n of levelNotes) {
        expect(n.title.length).toBeGreaterThan(4);
        expect(n.text.length).toBeGreaterThanOrEqual(40);
        expect(n.hint.length).toBeGreaterThan(4);
      }
    }
  });

  it('places every marker on solid ground', () => {
    for (let i = 0; i < LEVELS.length; i++) {
      for (let j = 0; j < (LEVELS[i].def.notes?.length ?? 0); j++) {
        const n = LEVELS[i].def.notes![j];
        const supported = (LEVELS[i].def.platforms ?? []).some(
          (p) =>
            p.x <= n.x + 13 &&
            p.x + p.w >= n.x - 13 &&
            p.y >= n.y - 10 &&
            p.y <= n.y + 45,
        );
        expect(supported, `note ${i}:${j} at ${n.x},${n.y} has ground below`).toBe(true);
      }
    }
  });
});

describe('Field-note store (persistent codex)', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips discoveries and ignores duplicates', () => {
    expect(getFoundNotes()).toEqual([]);
    findNote('0:0');
    findNote('0:0'); // duplicate is a no-op
    findNote('3:2');
    expect(getFoundNotes()).toEqual(['0:0', '3:2']);
    expect(Store.get<string[] | null>('tinyrex_notes', null)).toEqual(['0:0', '3:2']);
  });

  it('guards against corrupted storage', () => {
    localStorage.setItem('tinyrex_notes', 'not-an-array');
    expect(getFoundNotes()).toEqual([]);
    findNote('1:1');
    expect(getFoundNotes()).toEqual(['1:1']);
  });
});

describe('Field-note discovery (Game)', () => {
  let game: Game;

  beforeEach(() => {
    localStorage.clear();
    game = makeGame();
  });

  it('collecting a note records it in the persistent codex and scores', () => {
    game.handleKey('primary'); // start level 0
    const note = game.level!.notes[0];
    game.player!.x = note.x - 12;
    game.player!.y = note.y - 20;
    game.player!.vy = 0;
    game.update(0.016);
    expect(note.collected).toBe(true);
    expect(game.notesFound).toContain('0:0');
    expect(getFoundNotes()).toContain('0:0');
    expect(game.score).toBeGreaterThan(0);
  });

  it('re-collecting a note does not duplicate the codex entry', () => {
    game.handleKey('primary');
    const note = game.level!.notes[0];
    game.player!.x = note.x - 12;
    game.player!.y = note.y - 20;
    game.player!.vy = 0;
    game.update(0.016);
    // Pick it up again from a fresh level build
    game.handleKey('restart');
    const note2 = game.level!.notes[0];
    game.player!.x = note2.x - 12;
    game.player!.y = note2.y - 20;
    game.player!.vy = 0;
    game.update(0.016);
    expect(note2.collected).toBe(true);
    expect(game.notesFound.filter((id) => id === '0:0')).toHaveLength(1);
    expect(getFoundNotes().filter((id) => id === '0:0')).toHaveLength(1);
  });

  it('loads previously discovered notes on boot', () => {
    findNote('2:1');
    const g2 = makeGame();
    expect(g2.notesFound).toContain('2:1');
  });

  it('toggles the codex screen from the menu with the codex key', () => {
    expect(game.state).toBe('menu');
    expect(game.menuScreen).toBe('main');
    game.handleKey('codex');
    expect(game.menuScreen).toBe('codex');
    game.handleKey('codex');
    expect(game.menuScreen).toBe('main');
  });

  it('ignores the codex key while playing', () => {
    game.handleKey('primary');
    expect(game.state).toBe('playing');
    game.handleKey('codex');
    expect(game.state).toBe('playing');
    expect(game.menuScreen).toBe('main');
  });
});
