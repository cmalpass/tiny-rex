import { describe, it, expect, beforeEach } from 'vitest';
import { CFG } from '../src/config';
import { Game } from '../src/game';
import { LEVEL_DATA, LEVELS } from '../src/level-data';
import { Store, getGhostEnabled, getFoundFossils, getSkinId, type GameStats } from '../src/store';
import type { RexView } from '../src/sprite';

function makeGame(): Game {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  return new Game(canvas);
}

describe('Game state machine', () => {
  let game: Game;

  beforeEach(() => {
    game = makeGame();
  });

  it('boots in the menu state', () => {
    expect(game.state).toBe('menu');
    expect(game.player).toBeNull();
    expect(game.level).toBeNull();
  });

  it('starts a run from the menu with the primary key', () => {
    game.handleKey('primary');
    expect(game.state).toBe('playing');
    expect(game.player).not.toBeNull();
    expect(game.level).not.toBeNull();
    expect(game.score).toBe(0);
    expect(game.checkpoint).toEqual({ x: LEVEL_DATA.startX, y: LEVEL_DATA.startGroundY });
  });

  it('pauses and resumes with the pause key', () => {
    game.handleKey('primary');
    expect(game.state).toBe('playing');
    game.handleKey('pause');
    expect(game.state).toBe('paused');
    game.handleKey('pause');
    expect(game.state).toBe('playing');
  });

  it('pauses automatically when the tab is hidden', () => {
    game.handleKey('primary');
    game.handleKey('visibility');
    expect(game.state).toBe('paused');
  });

  it('restart resets the run in place', () => {
    game.handleKey('primary');
    game.score = 500;
    game.crystalsGot = 7;
    game.deaths = 2;
    game.handleKey('restart');
    expect(game.state).toBe('playing');
    expect(game.score).toBe(0);
    expect(game.crystalsGot).toBe(0);
    expect(game.deaths).toBe(0);
  });

  it('respawns at the checkpoint after game over', () => {
    game.handleKey('primary');
    game.checkpoint = { x: 2330, y: 460 };
    game.state = 'gameover';
    game.handleKey('primary');
    expect(game.state).toBe('playing');
    expect(game.player!.x).toBe(2330);
    expect(game.player!.y).toBe(460 - game.player!.h - 2);
    expect(game.player!.invulnT).toBeGreaterThan(0); // respawn i-frames
  });

  it('ignores primary during the victory intro', () => {
    game.handleKey('primary');
    game.state = 'victory';
    game.victoryT = 0.5;
    game.handleKey('primary');
    expect(game.state).toBe('victory'); // still in the confetti intro
    game.victoryT = 2;
    game.handleKey('primary');
    expect(game.state).toBe('playing');
  });

  it('returns to the menu from any end state', () => {
    game.handleKey('primary');
    game.toMenu();
    expect(game.state).toBe('menu');
    expect(game.player).toBeNull();
    expect(game.level).not.toBeNull(); // rebuilt for the next run
  });

  it('tracks score with floating text', () => {
    expect(game.score).toBe(0);
    game.addScore(100, 0, 0);
    game.addScore(50, 10, 10);
    expect(game.score).toBe(150);
    expect(game.texts).toHaveLength(2);
  });

  it('enters the dying state on death', () => {
    game.handleKey('primary');
    game.onPlayerDeath();
    expect(game.state).toBe('dying');
    expect(game.deaths).toBe(1);
  });

  it('routes touch buttons through the input state', () => {
    expect(game.input.left).toBe(false);
    game.input.touchBtn('left', true);
    expect(game.input.left).toBe(true);
    game.input.touchBtn('left', false);
    expect(game.input.left).toBe(false);
  });

  it('stamps jump touches on the game clock', () => {
    game.time = 5;
    game.input.touchBtn('jump', true);
    expect(game.input.jumpBufferT).toBe(5);
    expect(game.input.jumpHeld).toBe(true);
    game.input.touchBtn('jump', false);
    expect(game.input.jumpHeld).toBe(false);
  });
});

describe('Menu: level & difficulty selection', () => {
  let game: Game;

  beforeEach(() => {
    localStorage.clear();
    game = makeGame();
  });

  it('boots on level 1 with the meadow theme', () => {
    expect(game.levelIdx).toBe(0);
    expect(game.bg.theme).toBe('meadow');
  });

  it('cycles levels with the arrow keys and re-themes the backdrop', () => {
    game.handleKey('right');
    expect(game.levelIdx).toBe(1);
    expect(game.bg.theme).toBe('volcanic');
    game.handleKey('left');
    expect(game.levelIdx).toBe(0);
    expect(game.bg.theme).toBe('meadow');
  });

  it('persists the selected level for the next boot', () => {
    game.handleKey('right');
    expect(Store.get('tinyrex_level', -1)).toBe(1);
    const next = new Game(document.createElement('canvas'));
    expect(next.levelIdx).toBe(1);
    expect(next.bg.theme).toBe('volcanic');
  });

  it('cycles difficulty and persists the choice', () => {
    game.selectDifficulty('normal');
    game.handleKey('down');
    expect(game.difficulty).toBe('hard');
    game.handleKey('down');
    expect(game.difficulty).toBe('easy');
    expect(Store.get('tinyrex_difficulty', 'none')).toBe('easy');
  });

  it('selects a difficulty directly from the pill', () => {
    game.selectDifficulty('hard');
    expect(game.maxHearts).toBe(2);
    expect(Store.get('tinyrex_difficulty', 'none')).toBe('hard');
  });

  it('starts easy runs with five hearts and hard runs with two', () => {
    game.selectDifficulty('easy');
    game.handleKey('primary');
    expect(game.player!.maxHearts).toBe(5);
    expect(game.player!.hearts).toBe(5);
    game.toMenu();
    game.selectDifficulty('hard');
    game.handleKey('primary');
    expect(game.player!.maxHearts).toBe(2);
    expect(game.player!.hearts).toBe(2);
  });
});

describe('Run end: stars & per-level records', () => {
  let game: Game;

  beforeEach(() => {
    localStorage.clear();
    game = makeGame();
  });

  it('awards three stars for a clean finish and stores the best', () => {
    game.handleKey('primary');
    const total = game.level!.totalCrystals;
    game.crystalsGot = total;
    game.player!.hearts = game.player!.maxHearts; // ≥2 hearts → heart star
    game.elapsed = 100;
    game.onPlayerVictory();
    expect(game.state).toBe('victory');
    expect(game.results!.stars).toBe(3);
    expect(game.results!.isBestStars).toBe(true);
    expect(game.bestStars).toBe(3);
    // Per-level record persisted
    const best = Store.get<{ score: number; time: number | null } | null>('tinyrex_best_0', null);
    expect(best!.score).toBe(game.score);
    expect(best!.time).toBe(100);
    // Lifetime stats updated
    expect(game.stats.victories).toBe(1);
    expect(game.stats.crystals).toBe(total);
  });

  it('awards a single star for a bare finish', () => {
    game.handleKey('primary');
    game.crystalsGot = 0;
    game.player!.hearts = 1; // no heart star, no crystal star
    game.onPlayerVictory();
    expect(game.results!.stars).toBe(1);
    expect(game.results!.isBestStars).toBe(true); // 1 > 0
  });

  it('does not re-flag best stars on a repeat finish', () => {
    game.handleKey('primary');
    game.player!.hearts = 1;
    game.onPlayerVictory();
    expect(game.results!.stars).toBe(1);
    // Repeat the same finish → no new best
    game.victoryT = 2;
    game.handleKey('primary');
    game.player!.hearts = 1;
    game.onPlayerVictory();
    expect(game.results!.stars).toBe(1);
    expect(game.results!.isBestStars).toBe(false);
  });

  it('tracks deaths in the lifetime stats', () => {
    game.handleKey('primary');
    game.onPlayerDeath();
    expect(game.stats.deaths).toBe(1);
    expect(Store.get<GameStats | null>('tinyrex_stats', null)!.deaths).toBe(1);
  });

  it('unlocks a new max heart every three hearts collected, capped at five', () => {
    game.handleKey('primary');
    const p = game.player!;
    expect(p.maxHearts).toBe(3); // normal difficulty
    game.collectHeart(0, 0);
    game.collectHeart(0, 0);
    expect(p.maxHearts).toBe(3); // first two only pay points / heal
    game.collectHeart(0, 0); // third → unlock
    expect(p.maxHearts).toBe(4);
    expect(p.hearts).toBe(4); // the new heart is granted immediately
    for (let i = 0; i < 3; i++) game.collectHeart(0, 0); // sixth → unlock
    expect(p.maxHearts).toBe(5);
    for (let i = 0; i < 3; i++) game.collectHeart(0, 0); // ninth → capped
    expect(p.maxHearts).toBe(5);
    expect(game.heartsGot).toBe(9);
  });

  it('plays a chime for each star as the victory panel reveals', () => {
    game.handleKey('primary');
    game.player!.hearts = game.player!.maxHearts; // heart star
    game.crystalsGot = game.level!.totalCrystals; // crystal star
    game.onPlayerVictory();
    expect(game.results!.stars).toBe(3);
    expect(game.starChime).toBe(0);
    // Star chimes fire at 1.8 s, 2.15 s and 2.5 s on the victory clock
    game.victoryT = 2.0;
    game.update(0.016);
    expect(game.starChime).toBe(1);
    game.victoryT = 2.4;
    game.update(0.016);
    expect(game.starChime).toBe(2);
    game.victoryT = 2.7;
    game.update(0.016);
    expect(game.starChime).toBe(3);
  });
});

describe('Ghost race', () => {
  let game: Game;

  beforeEach(() => {
    localStorage.clear();
    game = makeGame();
  });

  it('records a track on a new best score and replays it on the next run', () => {
    game.handleKey('primary');
    expect(game.ghostOn).toBe(true);
    for (let i = 0; i < 12; i++) game.update(0.1); // ~1.2 s of play
    game.onPlayerVictory();
    expect(game.results!.isBestScore).toBe(true);
    const stored = Store.get<{ pts: unknown[] } | null>('tinyrex_ghost_0', null);
    expect(stored).not.toBeNull();
    expect(stored!.pts.length).toBeGreaterThanOrEqual(4);

    // The next run replays the stored ghost
    game.victoryT = 2;
    game.handleKey('primary');
    const ghost = (game as unknown as { ghost: { x: number } | null }).ghost;
    expect(ghost).not.toBeNull();
    expect(ghost!.x).toBeGreaterThan(0);
  });

  it('skips the ghost when the toggle is off', () => {
    game.handleKey('primary');
    for (let i = 0; i < 12; i++) game.update(0.1);
    game.onPlayerVictory();
    expect(Store.get('tinyrex_ghost_0', null)).not.toBeNull();

    game.handleKey('ghost');
    expect(game.ghostOn).toBe(false);
    expect(getGhostEnabled()).toBe(false);

    game.victoryT = 2;
    game.handleKey('primary');
    expect((game as unknown as { ghost: unknown }).ghost).toBeNull();
  });
});

describe('Fossil discoveries', () => {
  let game: Game;

  beforeEach(() => {
    localStorage.clear();
    game = makeGame();
  });

  it('counts every hidden fossil for the HUD and menu', () => {
    expect(game.totalFossils()).toBe(
      LEVELS.reduce((n, l) => n + (l.def.fossils?.length ?? 0), 0),
    );
    expect(game.totalFossils()).toBe(12);
  });

  it('awards score on pickup and persists the first discovery', () => {
    game.handleKey('primary');
    const f = game.level!.fossils[0];
    expect(f.id).toBe('0:0');
    game.collectFossil(f.x, f.y, f.id);
    expect(game.score).toBe(150);
    expect(game.fossilsFound).toContain('0:0');
    expect(getFoundFossils()).toContain('0:0');
    expect(Store.get<string[] | null>('tinyrex_fossils', null)).toContain('0:0');
  });

  it('pays score on re-collection but records the discovery once', () => {
    game.handleKey('primary');
    game.collectFossil(0, 0, '0:1');
    game.collectFossil(0, 0, '0:1');
    expect(game.score).toBe(300);
    expect(game.fossilsFound.filter((id) => id === '0:1')).toHaveLength(1);
    expect(getFoundFossils()).toEqual(['0:1']);
  });

  it('collects fossils through player collisions during play', () => {
    game.handleKey('primary');
    const f = game.level!.fossils[0]; // (3255, 163) on the stone ledge {3220, 200, 130}
    // Land the player standing on the ledge, overlapping the fossil.
    game.player!.x = 3245;
    game.player!.y = 200 - game.player!.h;
    game.player!.vx = 0;
    game.player!.vy = 0;
    game.update(0.05);
    expect(f.collected).toBe(true);
    expect(game.score).toBeGreaterThanOrEqual(150);
  });

  it('re-collects fossils after a respawn reset', () => {
    game.handleKey('primary');
    const f = game.level!.fossils[0];
    f.collected = true;
    game.level!.reset();
    expect(f.collected).toBe(false);
  });

  it('announces the Mint unlock when the third fossil is unearthed', () => {
    game.handleKey('primary');
    game.collectFossil(0, 0, '0:0');
    game.collectFossil(0, 0, '1:0');
    game.collectFossil(0, 0, '2:0');
    expect(game.fossilsFound).toHaveLength(3);
    expect(game.status.msg).toBe('Mint Rex unlocked! Pick it on the menu');
  });
});

describe('Rex skins', () => {
  let game: Game;

  beforeEach(() => {
    localStorage.clear();
    game = makeGame();
  });

  it('selects and persists a skin from the menu', () => {
    expect(game.skin).toBe('classic');
    game.selectSkin('ember');
    expect(game.skin).toBe('ember');
    expect(getSkinId()).toBe('ember');
    // No-op when unchanged (no double SFX path to worry about)
    game.selectSkin('ember');
    expect(game.skin).toBe('ember');
  });

  it('rejects Mint until 3 fossils are found', () => {
    game.selectSkin('mint');
    expect(game.skin).toBe('classic');
    expect(getSkinId()).toBe('classic');
  });

  it('lets the player wear the chosen skin, and the ghost too', () => {
    game.selectSkin('glacier');
    // Store a ghost track so a ghost is replayed on the next run
    Store.set('tinyrex_ghost_0', {
      date: 0,
      score: 100,
      time: 5,
      pts: [
        { t: 0, x: 40, y: 400 },
        { t: 0.1, x: 44, y: 400 },
        { t: 0.2, x: 48, y: 400 },
        { t: 0.3, x: 52, y: 400 },
      ],
    });
    game.handleKey('primary');
    expect(game.player!.skin).toBe('glacier');
    const ghost = (game as unknown as { ghost: { view: RexView } | null }).ghost;
    expect(ghost).not.toBeNull();
    expect(ghost!.view.skin).toBe('glacier');
  });

  it('cycles with the bracket keys on the menu, skipping locked skins', () => {
    game.handleKey('skinNext');
    expect(game.skin).toBe('ember');
    game.handleKey('skinNext');
    expect(game.skin).toBe('glacier');
    // Mint is locked: wrap around to Classic instead
    game.handleKey('skinNext');
    expect(game.skin).toBe('classic');
    game.handleKey('skinPrev');
    expect(game.skin).toBe('glacier');
  });

  it('cycles into Mint once it is unlocked', () => {
    game.fossilsFound = ['0:0', '1:0', '2:0'];
    game.handleKey('skinNext');
    expect(game.skin).toBe('ember');
    game.handleKey('skinNext');
    expect(game.skin).toBe('glacier');
    game.handleKey('skinNext');
    expect(game.skin).toBe('mint');
  });

  it('ignores skin keys while playing', () => {
    game.selectSkin('ember');
    game.handleKey('primary');
    expect(game.state).toBe('playing');
    game.handleKey('skinNext');
    expect(game.skin).toBe('ember');
  });
});

describe('Magma King (Molten Nest)', () => {
  let game: Game;
  const DT = 1 / 60;

  beforeEach(() => {
    localStorage.clear();
    game = makeGame();
  });

  it('spawns the Magma King with three orbs when Molten Nest starts', () => {
    game.selectLevel(3);
    game.startGame();
    const boss = game.level!.boss!;
    expect(boss).not.toBeNull();
    expect(boss.hp).toBe(boss.maxHp);
    expect(boss.orbs).toHaveLength(3);
  });

  it('defeating the boss awards the boss score, latches the gate, and opens the victory', () => {
    game.selectLevel(3);
    game.startGame();
    const boss = game.level!.boss!;
    const door = game.level!.doors[0];
    const p = game.player!;
    // Drop onto the boss's head while it is staggered.
    boss.state = 'stagger';
    boss.hp = 1;
    p.x = boss.x + 40;
    p.y = boss.y - 42;
    p.vy = 300;
    for (let i = 0; i < 300 && !boss.dead; i++) game.update(DT);
    expect(boss.dead).toBe(true);
    expect(game.bossSlain).toBe(true);
    expect(game.score).toBeGreaterThanOrEqual(CFG.score.boss);
    expect(door.latched).toBe(true);
    // Run to the nest for the victory ceremony.
    p.x = game.level!.goal.x;
    p.y = game.level!.goal.y - p.h;
    p.vy = 0;
    for (let i = 0; i < 30 && game.state !== 'victory'; i++) game.update(DT);
    expect(game.state).toBe('victory');
  });
});
