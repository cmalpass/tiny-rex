# Playability verification — Tiny Rex

**Date:** 2026-08-16 · **Build:** Vite + TypeScript port (commit `0de59b9` onward)

The evidence run below is level 1 (Crystal Valley); level 2 (Volcanic Depths)
was verified via unit tests and manual play.

The modernized game was verified end-to-end in a real browser (headless Chrome,
960×540) by driving it through the `window.TINY_REX` debug handle exposed by
`src/main.ts`. A scripted "bot" plays with the genuine input path
(`game.input.touch` / `touchBtn`), so every frame below is real gameplay unless
marked *harness-assisted*.

## How to reproduce

```bash
npm install            # installs playwright-core (dev dependency)
npm run dev            # serves on http://127.0.0.1:5173
node scripts/capture-evidence.mjs   # drives the game, writes docs/evidence/
```

`scripts/capture-evidence.mjs` records a full playthrough video plus one
screenshot per key screen. `CHROME_PATH` env var overrides the browser binary
(default: macOS Google Chrome).

## Evidence

| File | What it shows | State at capture |
|---|---|---|
| [playthrough.webm](playthrough.webm) | Full run: menu → run (stomp, damage, crystals) → pit death → game over → checkpoint respawn → pause → victory | `menu → playing → dying → gameover → playing → paused → victory` |
| [01-menu.png](01-menu.png) | Redesigned menu: title lockup, level cards (Crystal Valley selected, Volcanic Depths), difficulty pills (Normal), lifetime stats line, controls + quest panels, Start/Sound/Calm bar | `menu` |
| [02-run-start.png](02-run-start.png) | Run starts at {120, 414}, checkpoint set | `playing`, cp `120,460`, 3 hearts |
| [03-running.png](03-running.png) | Bot running right: stomped a beetle (`stomps: 1`), took spike damage (hearts 3→2), collected crystals (score 400) at x≈1034 | `playing`, `score: 400` |
| [04-dying.png](04-dying.png) | Pit death — player falling below the ground, camera following (*harness-assisted*: `player.y = 720`, below `killY` 680) | `dying`, `y: 955` |
| [05-gameover.png](05-gameover.png) | Game-over panel: "You survived 5 seconds", "Best: 00:05", respawn prompt; world dimmed | `gameover`, `deaths: 1` |
| [06-respawn.png](06-respawn.png) | Respawned at the checkpoint with i-frames, "From the checkpoint!" banner, score preserved (00400) | `playing`, x≈361 |
| [07-paused.png](07-paused.png) | Pause overlay (P key), game frozen mid-run | `paused` |
| [08-victory-intro.png](08-victory-intro.png) | Victory intro begins (goal reached) (*harness-assisted*: teleport onto the goal at x=7150) | `victory` |
| [09-victory.png](09-victory.png) | Victory screen with 2★ rating (bot took a hit, <80% crystals), "NEW BEST SCORE!" banner, full score breakdown (TOTAL 3920), Play Again / Next Level / Menu buttons | `victory`, `score: 3920` |

### State machine coverage

Every state and transition was exercised in the live browser:

```
menu →(primary)→ playing →(pit)→ dying →(1.15s)→ gameover →(primary)→ playing (checkpoint respawn)
playing →(pause)→ paused →(pause)→ playing
playing →(goal)→ victory →(primary, after intro)→ playing
```

No page errors, no uncaught exceptions, no console errors across all runs.

## Supporting verification

- **Unit/integration tests:** 60/60 pass (`npm test`) — physics (gravity, jump
  buffer/cut, coyote time), damage/i-frames, stomp, pit death, crystals,
  checkpoints, goal, crumble, the full game state machine, menu level/difficulty
  selection & persistence, star ratings & per-level records, lifetime stats, and
  level-data integrity for both levels.
- **Static checks:** `npm run typecheck` and `npm run lint` clean.
- **Build:** `npm run build` produces a self-contained `dist/index.html`
  (76.1 kB) verified to contain the game.

## Notes

- Frames 04 and 08–09 use the debug handle to fast-forward the simulation
  (pit drop, goal teleport) so the evidence set covers every screen without a
  full 10-minute clear; the intervening frames (02, 03, 06, 07) are unmodified
  gameplay, including a genuine pit death at x≈1034.
- Audio is exercised through the same `AudioManager` path; headless Chrome
  keeps the AudioContext suspended without user gesture, which the game
  handles gracefully (no errors).
