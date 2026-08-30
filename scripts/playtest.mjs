#!/usr/bin/env node
/**
 * Tiny Rex — headless playtest harness.
 *
 * Drives the production build with a simple but honest bot: every 50 ms it
 * reads the live game state, dispatches real keyboard events, and tries to
 * win. A scenario fails on a softlock (no forward progress for 10 s), a page
 * error, or a timeout; hand-built levels must reach the victory state.
 *
 * Usage:
 *   node scripts/playtest.mjs              # all levels (0-4) + daily
 *   node scripts/playtest.mjs 0 2 4        # specific hand-built levels
 *   node scripts/playtest.mjs daily        # daily challenge only
 *   node scripts/playtest.mjs dusk-stress  # Duskfen late-tide respawn stress
 *
 * Expects a running preview server (default http://localhost:4173, override
 * with BASE_URL). Start one with:  npm run preview -- --port 4173 --strictPort
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:4173';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOT_DIR = '/tmp/tinyrex-e2e';

/** Per-scenario time budgets (ms) and pass rules. */
const LEVEL_BUDGET = [120_000, 150_000, 150_000, 200_000, 200_000];
const DAILY_BUDGET = 120_000;
const DAILY_MIN_PROGRESS = 0.5;

// ---------------------------------------------------------------------------
// In-page bot. Injected once; runs its own 50 ms tick loop and resolves with
// a verdict. All state reads + key dispatches happen in-page so nothing
// crosses the Playwright serialization boundary (getters would vanish).
// ---------------------------------------------------------------------------
const BOT_SOURCE = `
  ({ levelIdx, mode, maxMs, minProgress, stress }) => new Promise((resolve) => {
    const g = window.TINY_REX.game;
    const held = new Set();
    const key = (code, isDown) =>
      window.dispatchEvent(new KeyboardEvent(isDown ? 'keydown' : 'keyup', { code, key: code, bubbles: true, cancelable: true }));
    const hold = (code, on) => {
      if (on && !held.has(code)) { held.add(code); key(code, true); }
      else if (!on && held.has(code)) { held.delete(code); key(code, false); }
    };
    let jumpLockUntil = 0;
    // The engine's jump buffer only re-stamps on a Space keydown RISING edge
    // (a keydown while Space is already held is ignored). A held key therefore
    // swallows later stamps, so every jump press forces a fresh edge:
    // release-then-press. Safe because presses only fire while grounded or
    // falling (vy >= 0), where the release cannot trigger a jump cut.
    let spaceDown = false;
    const pressSpace = () => {
      if (spaceDown) key('Space', false);
      key('Space', true);
      spaceDown = true;
    };
    const releaseSpace = () => {
      if (spaceDown) { key('Space', false); spaceDown = false; }
    };
    // Two jump heights (variable-height engine: releasing early cuts vy by
    // 0.42 while vy < -140):
    //  - full: hold past the cut window -> 130 px apex, ~233 px flat reach
    //  - short: 100 ms hold -> ~68 px apex, ~149 px flat reach
    const jumpLog = [];
    let spaceReleaseTimer = 0;
    const scheduleSpaceRelease = (holdMs) => {
      if (spaceReleaseTimer) clearTimeout(spaceReleaseTimer);
      spaceReleaseTimer = setTimeout(() => {
        spaceReleaseTimer = 0;
        releaseSpace();
      }, holdMs);
    };
    const doJump = (holdMs, why) => {
      const now = performance.now();
      if (now < jumpLockUntil) return;
      jumpLockUntil = now + 380;
      const q = g.player;
      const standP = q && g.level
        ? g.level.platforms.find((pl) =>
            pl.active !== false && q.x + q.w > pl.x + 2 && q.x < pl.x + pl.w - 2 && Math.abs(q.y + q.h - pl.y) < 8)
        : null;
      jumpLog.push([
        Math.round(now - start), holdMs,
        q ? Math.round(q.x + q.w / 2) : -1,
        q ? Math.round(q.y + q.h) : -1,
        q ? (q.grounded ? 1 : 0) : -1,
        standP ? Math.round(standP.x) + '..' + Math.round(standP.x + standP.w) + '@' + Math.round(standP.y) + '/' + (standP.type || 'g') : 'none',
        why || '?',
      ]);
      pressSpace();
      scheduleSpaceRelease(holdMs);
    };
    const fullJump = (why) => doJump(350, why);
    const shortJump = (why) => doJump(100, why);
    // Back-compat alias for the stress scenario.
    const tapJump = fullJump;
    // Crumble-bridge hop: a dedicated press with its own 300 ms lock and a
    // 450 ms hold. The hold keeps Space down until well past the moment the
    // buffered press converts on landing, so the keyup never lands inside the
    // engine's variable-height cut window (an early keyup would cut the hop).
    // The lock is shorter than the hold on purpose: the only presses that
    // matter (one per slab approach, ~800 ms apart) never collide, and any
    // duplicate within 300 ms is a no-op that would not re-stamp the engine's
    // buffer anyway (a keydown while Space is already held is not a rising
    // edge).
    // 120 ms lock (was 300): the engine only honors a press within 130 ms of
    // the landing tick, so the last stamp before a slab landing must land in
    // that window; re-stamping every 120 ms keeps it fresh.
    let crumbleLockUntil = 0;
    const crumbleJump = (why) => {
      const t = performance.now();
      if (t < crumbleLockUntil) return;
      const q = g.player;
      // Mid-rise from a previous crumble hop: releasing Space would cut the
      // hop short; the in-flight hop is all we need, so skip re-stamping.
      if (spaceDown && q && q.vy < 0) { crumbleLockUntil = t + 60; return; }
      crumbleLockUntil = t + 120;
      jumpLog.push([
        Math.round(t - start), 450,
        q ? Math.round(q.x + q.w / 2) : -1,
        q ? Math.round(q.y + q.h) : -1,
        q ? (q.grounded ? 1 : 0) : -1,
        'crumble', why || 'crumbleChain',
      ]);
      pressSpace();
      scheduleSpaceRelease(450);
    };

    window.addEventListener('blur', () => jumpLog.push(['blur', Math.round(performance.now() - start)]));
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW')
        jumpLog.push(['keyup', e.code, Math.round(performance.now() - start)]);
    }, true);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW')
        jumpLog.push(['keydown', e.code, Math.round(performance.now() - start)]);
    }, true);
    const start = performance.now();
    let bestX = -Infinity;
    let lastProgress = start;
    let wasPlaying = false;
    let verdict = null;
    let verdictExtra = '';
    let dryStreak = 0;
    let arcHoldT0 = -1, arcHoldKey = -1; // timed wait while an enemy blocks the arc
    const finish = () => {
      held.forEach((c) => key(c, false));
      return {
        verdict,
        extra: verdictExtra,
        x: g.player ? Math.round(g.player.x + g.player.w / 2) : 0,
        width: g.level ? g.level.width : 0,
        ms: Math.round(performance.now() - start),
        state: g.state,
        debug: g.state === 'gameover' && g.level && g.player ? {
          hearts: g.player.hearts,
          player: [Math.round(g.player.x), Math.round(g.player.y)],
          enemies: g.level.enemies.map((e) => [e.type, Math.round(e.x), Math.round(e.y), e.dead]),
          hazards: g.level.hazards.map((h) => [h.type, Math.round(h.x), Math.round(h.w)]),
          projectiles: g.level.projectiles.map((p) => [Math.round(p.x), Math.round(p.y)]),
        } : null,
        jumpLog: jumpLog.slice(-1500),
      };
    };
    const done = (v, extra) => { verdict = v; verdictExtra = extra || ''; };

    if (mode === 'level') { g.selectLevel(levelIdx); }
    else if (mode === 'daily') { g.selectDaily(); }

    const timer = setInterval(() => {
      const now = performance.now();
      if (now - start > maxMs) {
        const p = g.player;
        const prog = p && g.level ? (p.x + p.w / 2) / g.level.width : 0;
        if (mode === 'daily' && prog >= minProgress) done('daily-progress');
        else done('timeout', 'progress=' + Math.round(prog * 100) + '%');
        return;
      }
      if (g.state === 'victory') return done('victory');
      if (g.state === 'gameover') return done('gameover');
      if (g.state !== 'playing' || !g.player || !g.level) {
        if (g.state === 'menu') { key('Space', true); setTimeout(() => key('Space', false), 60); }
        wasPlaying = false;
        return; // dying / paused: wait
      }

      const p = g.player, lvl = g.level;
      const px = p.x + p.w / 2, feet = p.y + p.h;

      // --- Landing safety -------------------------------------------------------
      // A full jump from run speed lands ~233 px ahead. If the landing body
      // does not overlap a solid platform at foot level, the jump is a
      // one-way trip, so rules that jump reactively (enemies, ground hazards)
      // check this.
      const supportedAt = (x) => lvl.platforms.some((pl) =>
        pl.active !== false && (pl.type || 'ground') !== 'crumble' &&
        pl.x < x + 23 && pl.x + pl.w > x - 23 && Math.abs(pl.y - feet) <= 30);
      const safelySupportedAt = (x) => lvl.platforms.some((pl) => {
        if (pl.active === false || (pl.type || 'ground') === 'crumble') return false;
        const margin = pl.w >= 220 ? 60 : 24;
        return x >= pl.x + margin && x <= pl.x + pl.w - margin &&
          Math.abs(pl.y - feet) <= 30;
      });
      const willLandInGap = () => !supportedAt(px + 233);

      if (stress) {
        // Late-tide stress: after a forced respawn the bot must stand on dry
        // ground (platform top <= 446) and make forward progress.
        const dry = p.grounded && feet <= 447;
        dryStreak = dry && px > stress.x + 80 ? dryStreak + 1 : 0;
        if (dry && px > stress.x + 180) return done('safe');
        if (dryStreak >= 4) return done('safe');
        if (now - lastProgress > 10_000) return done('stall', 'x=' + Math.round(px));
        if (px > bestX + 30) { bestX = px; lastProgress = now; }
        // Keep running right; jump over the bog pit edges.
        hold('ArrowRight', true); hold('ArrowLeft', false);
        let refuge = null;
        if (p.grounded) {
          const stand = lvl.platforms.find((pl) =>
            p.x + p.w > pl.x + 2 && p.x < pl.x + pl.w - 2 && Math.abs(feet - pl.y) < 8);
          // A late respawn can begin on ground already below the final tide.
          // Take the first reachable elevated refuge before the water drains
          // the remaining hearts; this also exercises the intended canopy
          // route instead of treating the drowned floor as safe.
          refuge = lvl.platforms
            .filter((pl) =>
              pl.active !== false &&
              pl.type !== 'ground' &&
              pl.type !== 'mover' &&
              pl.y <= 446 &&
              pl.y < feet - 20 &&
              pl.x + pl.w > p.x + 20 &&
              pl.x < p.x + 280)
            .sort((a, b) => a.x - b.x)[0];
          if (refuge && stand) {
            const rise = feet - refuge.y;
            const disc = 625 * 625 - 4 * 750 * rise;
            const dFull = disc >= 0
              ? 285 * ((625 + Math.sqrt(disc)) / 1500) * 0.98
              : 0;
            const fullWindow = dFull > 0
              ? [refuge.x + 24 - dFull, refuge.x + refuge.w - 24 - dFull]
              : [Infinity, -Infinity];
            const dShort = rise <= 68
              ? (285 * (0.233 + Math.sqrt(2 * (68.3 - rise) / 1500)) * 0.98)
              : 0;
            const shortWindow = dShort > 0
              ? [refuge.x + 24 - dShort, refuge.x + refuge.w - 24 - dShort]
              : [Infinity, -Infinity];
            if (px >= fullWindow[0] && px <= fullWindow[1]) fullJump('dryRefuge');
            else if (px >= shortWindow[0] && px <= shortWindow[1]) shortJump('dryRefugeShort');
          }
          const edge = stand ? stand.x + stand.w : Infinity;
          if (edge - (p.x + p.w) <= 110 && !refuge) tapJump();
        }
        return;
      }

      // Respawn reset: a fresh entry into the playing state (start, resume,
      // or after a death) means Rex was (re)placed at a checkpoint. Reset the
      // progress/stall clock so death-retry loops are never mistaken for
      // softlocks, even when the checkpoint sits within 50 px of bestX.
      if (!wasPlaying) { bestX = px; lastProgress = now; }
      wasPlaying = true;
      // Stall detection. A big backwards jump in x means a respawn: reset
      // the clock so death-retry loops aren't mistaken for softlocks.
      if (px < bestX - 50) { bestX = px; lastProgress = now; }
      if (px > bestX + 30) { bestX = px; lastProgress = now; }
      if (now - lastProgress > 10_000) return done('stall', 'x=' + Math.round(px));

      let wantRight = true, wantLeft = false;
      let wantJump = false; // full-height jump (also used by boss/wall/hazards)

      // --- Jump physics (matches the engine: v0=625, g=1500, run=285, drag) ---
      // Horizontal reach of a jump that lands on a surface rise px above the
      // feet (negative = below). Calibrated to the measured 233 px flat jump.
      const reach = (rise, short) => {
        if (short) {
          if (rise > 68) return 0; // a 100 ms hop peaks at ~68 px
          const t = 0.233 + Math.sqrt(2 * (68.3 - rise) / 1500);
          return 285 * t * 0.98;
        }
        const disc = 625 * 625 - 4 * 750 * rise;
        if (disc < 0) return 0;
        return 285 * ((625 + Math.sqrt(disc)) / 1500) * 0.98;
      };

      // px window in which a jump of reach d lands well inside t. The engine
      // accepts edge overlap, but a near-edge landing can be side-resolved
      // before the descending body reaches the platform top. Wide banks can
      // afford a larger margin; narrow ledges keep a usable aiming window.
      const okWindow = (t, d) => {
        const margin = t.w >= 220 ? 60 : 24;
        return [t.x + margin - d, t.x + t.w - margin - d];
      };
      const inWin = (w) => !!w && px >= w[0] && px <= w[1];

      // True when some platform's underside lies in this jump's ascent band
      // (body top rises from stand.y-42 up to apex px) and its x-range meets
      // the body's sweep (the body travels ~0.45 px right per px of rise),
      // which would clip the head, zero vy, and kill the jump.
      const headBlocked = (apex, ignored = null) => {
        if (!stand) return false;
        const top = stand.y - 46;
        const lo = top - apex;
        for (const pl of lvl.platforms) {
          if (pl.active === false) continue;
          // The platform being targeted is already above the player's head
          // when the jump begins; its underside is a landing surface, not a
          // ceiling that should veto the route.
          if (ignored && (pl === ignored || pl === ignored.platform ||
              (pl.x === ignored.x && pl.y === ignored.y && pl.w === ignored.w))) continue;
          const b = pl.y + pl.h;
          if (b >= top - 2 || b <= lo) continue;
          const travel = 0.45 * (top - b);
          if (pl.x + pl.w > p.x - 2 && pl.x < p.x + p.w + travel) return true;
        }
        return false;
      };

      // Measured velocity (px/s) of a mover, stashed on the platform object
      // so the jump planner can predict where it will be at landing.
      const moverVel = (pl) => {
        const tNow = performance.now();
        if (pl.__pt && tNow - pl.__pt < 500) {
          const dt = (tNow - pl.__pt) / 1000;
          pl.__vx = (pl.x - pl.__px) / dt;
          pl.__vy = (pl.y - pl.__py) / dt;
        }
        pl.__pt = tNow; pl.__px = pl.x; pl.__py = pl.y;
        return { x: pl.__vx || 0, y: pl.__vy || 0 };
      };

      // Sampled flight-vs-enemy test. Predicts each patrolling enemy along its
      // patrol (sin wave for pteros, linear + bounds for walkers) and checks
      // for body contact every ~8 px along the jump, touchdown included — a
      // hit at any point is knockback that shaves the landing (often into a
      // hazard). short=true switches to the 100 ms-hold arc, modeled at the
      // frame-quantized worst case (the release is processed one frame after
      // keyup, so the cut lands ~117 ms in: vy ~= 189, apex ~75 px, not 68).
      const arcBlocked = (d, rise, short, ignoredEnemy = null) => {
        const feetAt = (s) => {
          if (short && s > 32.6) {
            const t = (s - 32.6) / 279;
            return feet - 62.7 - (189 * t - 750 * t * t);
          }
          const t = s / 279;
          return feet - (625 * t - 750 * t * t);
        };
        for (const e of lvl.enemies) {
          if (e.dead || e === ignoredEnemy) continue;
          const sm = e.speedMult || 1;
          for (let s = 0; s <= d; s += 8) {
            const t = s / 279;
            let ex, ey;
            if (e.type === 'ptero') {
              const ph = e.phase + t * sm;
              ex = e.ax + Math.sin(ph * 0.9 + e.phase0) * e.range;
              ey = e.ay + Math.sin(ph * 1.7 + e.phase0 * 2) * 46;
            } else if (e.type === 'beetle') {
              ex = Math.max(e.minX, Math.min(e.maxX - e.w, e.x + e.dir * 62 * sm * t));
              ey = e.y;
            } else if (e.type === 'trike') {
              ex = Math.max(e.minX, Math.min(e.maxX - e.w, e.x + (e.vx || 0) * t));
              ey = Math.max(e.y, e.spawnY); // hops make y unpredictable; stay conservative
            } else {
              ex = e.x; ey = e.y;
            }
            const bFeet = feetAt(s);
            // True player box (17 half-width, 46 tall) plus a ~10 px margin:
            // the enemy's predicted position drifts a few px with frame delay,
            // and a near-miss still clips Rex mid-flight, so bias to block.
            if (Math.abs(px + s - (ex + e.w / 2)) < 17 + e.w / 2 + 10 &&
                bFeet - 54 < ey + e.h + 8 && bFeet > ey - 8) return true;
          }
        }
        return false;
      };

      // Onward reach: the px band on pl from which a jump still lands on some
      // forward platform — a hop into a narrow platform must not overshoot
      // the next window (a landing past it leaves no onward move).
      const onwardWindow = (pl) => {
        let lo = Infinity, hi = -Infinity;
        for (const q of lvl.platforms) {
          if (q === pl || q.active === false || q.type === 'mover') continue;
          const gap = q.x - (pl.x + pl.w);
          // Overlapping platforms are valid onward routes (notably the
          // static ledge into an x-mover). Only ignore platforms that end
          // well before this one or begin too far beyond its far edge.
          if (q.x < pl.x - 40 || gap > 270) continue;
          const r = pl.y - q.y;
          if (r > 130 || r < -140) continue;
          for (const d of [reach(r, false), reach(r, true)]) {
            if (d <= 0) continue;
            const w = okWindow(q, d);
            const a = Math.max(w[0], pl.x + 2), b = Math.min(w[1], pl.x + pl.w - 2);
            if (b > a) { lo = Math.min(lo, a); hi = Math.max(hi, b); }
          }
        }
        return hi > lo ? [lo, hi] : null;
      };

      // Jump the first tick the landing would sit on target. Runs right to
      // the window, prefers the quick short hop, and holds at a stand edge when
      // only an x-oscillating mover can catch us. E = px where body leaves stand.
      const aimAt = (target, rise, E) => {
        // stand is null when grounded with < 2 px overlap (edge landing);
        // fall back to the foot level so callers outside the if(stand) block
        // (the enemy rule) cannot crash here.
        const standY = stand ? stand.y : feet;
        // An x-mover whose top is at or just below foot level can be boarded
        // by walking off the stand edge — no jump, no prediction error. Hold
        // at the edge until it swings under us.
        if (target.type === 'mover' && (target.axis || 'x') === 'x' && target.cx !== undefined) {
          const drop = target.cy - standY;
          if (drop >= 0 && drop <= 55) {
            if (target.cx < E + 23 && target.cx + target.w > px + 20) { return 'run'; }
            // Brake before the edge while an x-mover is still out of reach.
            // Letting residual momentum carry Rex past the stand turns a
            // recoverable timing wait into an unrecoverable fall.
            if (px + 23 < E) return E - (px + 23) > 55 ? 'run' : 'wait';
            return 'wait';
          }
        }
        // A spitter on the same ledge within ~100 px ahead clips every forward
        // jump arc (its body sits in the takeoff band). Back off until the arc
        // clears; on a narrow ledge the back-off walk drops to the ground below,
        // where its lob flies over Rex's head.
        for (const e of lvl.enemies) {
          if (e.dead || e.type !== 'spitter') continue;
          const sd = e.x + e.w / 2 - px;
          if (sd > 10 && sd < 100 && Math.abs(e.y - p.y) < 70) return 'backoff';
        }
        // The reach model assumes full run speed. After knockback the bot fires
        // gap jumps too early and lands short in the pit; keep running until
        // vx recovers.
        // A recent enemy hop or landing can leave Rex a few px below top
        // speed; that is still enough for the calibrated jump reach. Waiting
        // for the exact cap risks walking off a ledge before the next tick.
        if (p.vx < 250) return 'run';
        const dFull = reach(rise, false);
        const dShort = reach(rise, true);
        const wF = dFull > 0 ? okWindow(target, dFull) : null;
        const wS = dShort > 0 ? okWindow(target, dShort) : null;
        // The landing model is optimistic by ~24 px near a target's edge: a
        // window landing predicted within 24 px of a STATIC target's edge
        // usually misses and drops into the gap (or under a floating target).
        // Keep running — the edge/spring rules handle the run-off.
        const supWin = (d) => d > 0 &&
          (target.type === 'mover' ||
            (px + d >= target.x + 24 && px + d <= target.x + target.w - 24));
        if (target.type !== 'mover' && !supWin(dFull) && !supWin(dShort)) return 'run';
        if (px + 23 <= E) {
          const fullArc = wF ? arcBlocked(dFull, rise, false) : false;
          const shortArc = wS ? arcBlocked(dShort, rise, true) : false;
          if (inWin(wS) && !headBlocked(76, target)) {
            if (!shortArc) { doJump(100, 'aimShort'); return 'jumped'; }
            // Short hop clipped: use the full window if it is open and clear.
            if (inWin(wF) && !headBlocked(130, target) && !fullArc) { doJump(350, 'aimFull'); return 'jumped'; }
            // Otherwise hold here until the short arc clears (the flyer's
            // bobbing lifts it out of the band within a couple of seconds).
            if (target.x !== arcHoldKey) { arcHoldKey = target.x; arcHoldT0 = now; }
            if (now - arcHoldT0 < 4000) { return 'wait'; }
            doJump(100, 'arcTimeoutS'); return 'jumped';
          }
          if (inWin(wF) && !headBlocked(130, target)) {
            if (!fullArc) { doJump(350, 'aimFull'); return 'jumped'; }
            // A low hop can slip under a flyer a full jump would clip: skip
            // the full window and run for the short one instead.
            if (dShort > 0 && wS && wS[0] > px - 2 && wS[0] < px + 60 && !shortArc) {
              return 'run';
            }
            // Otherwise hold at the window until the enemy leaves the arc
            // (a patrol passes in under a second); if it lingers, take the
            // clear option or gamble.
            if (target.x !== arcHoldKey) { arcHoldKey = target.x; arcHoldT0 = now; }
            if (now - arcHoldT0 < 4000) { return 'wait'; }
            if (!shortArc) { doJump(100, 'arcTimeoutS'); return 'jumped'; }
            doJump(350, 'arcTimeout'); return 'jumped';
          }
        }
        if (px + 23 >= E) {
          // Short hop first: at the stand edge a full hop tends to overshoot
          // the next platform's onward window; the short hop lands closer.
          if (inWin(wS) && !headBlocked(76, target) && !arcBlocked(dShort, rise, true)) { doJump(100, 'aimShortEdge'); return 'jumped'; }
          if (inWin(wF) && !headBlocked(130, target) && !arcBlocked(dFull, rise, false)) { doJump(350, 'aimFullEdge'); return 'jumped'; }
          if (target.type === 'mover' && (target.axis || 'x') === 'x') return 'wait';
          // past every window: best-effort jump, but only when the predicted
          // landing is supported and the head clears; otherwise walk off the
          // edge and fall below.
          const landX = px + reach(rise, false);
          const landY = standY - rise; // land rise px above the feet (below if negative)
          // Landing error is about 13 px, so the predicted landing center
          // must sit well INSIDE a platform — a landing near or past the
          // edge drops off it (into the pit/lava below).
          const supported = lvl.platforms.some((pl) =>
            pl.active !== false &&
            landX >= pl.x + 15 && landX <= pl.x + pl.w - 15 &&
            Math.abs(pl.y - landY) <= 24);
          if (!supported || headBlocked(130, target) || arcBlocked(dFull, rise, false)) return 'run';
         
          doJump(350, 'aimBest'); // last-resort best effort
          return 'jumped';
        }
        return 'run'; // keep running right to the takeoff window
      };

      const stand = p.grounded
        ? lvl.platforms.find((pl) =>
            pl.active !== false &&
            p.x + p.w > pl.x + 2 && p.x < pl.x + pl.w - 2 && Math.abs(feet - pl.y) < 8)
        : null;

      // --- Crumble chain ----------------------------------------------------------
      // Crumble slabs stop being solid the moment Rex lands on them, so he
      // can never stand still on one: the tick after landing is grounded
      // (stale) with no stand while coyote is still alive. Two press gates,
      // each stamping the engine's jump buffer so the press converts into a
      // hop:
      //   a) the stale-grounded tick right after a slab landing (coyote),
      //   b) mid-fall with the next slab's top within 40 px below the feet
      //      (the stamp is still fresh when the landing converts it).
      // crumbleJump holds Space 450 ms so the key is still down when the
      // buffered press converts — an early keyup would cut the jump height.
      if (!stand) {
        const slab = lvl.platforms.find((pl) =>
          pl.type === 'crumble' &&
          pl.x < p.x + p.w - 4 && pl.x + pl.w > p.x + 4 &&
          pl.y >= feet - 60 && pl.y <= feet + 50);
        const ccNext = slab ? lvl.platforms.some((pl) =>
            pl.active !== false &&
            pl.x >= p.x + p.w - 20 && pl.x < p.x + p.w + 280 &&
            Math.abs(pl.y - slab.y) <= 60) : false;
        if (slab) {
          const next = lvl.platforms.some((pl) =>
            pl.active !== false &&
            pl.x >= p.x + p.w - 20 && pl.x < p.x + p.w + 280 &&
            Math.abs(pl.y - slab.y) <= 60);
          const gateA = p.grounded; // stale tick on a just-deactivated slab
          const gateB = !p.grounded && p.vy > 0 &&
            feet >= slab.y - 40 && feet <= slab.y + 30;
          if (next && (gateA || gateB)) {
            wantRight = true; wantLeft = false;
            crumbleJump('crumbleChain');
          }
        }
      }

      // --- Pressure plate / door -------------------------------------------------
      // The door latches only when FULLY open (open >= 1, a 0.5 s cycle) and
      // starts closing the moment the plate is released, so the bot must hold
      // the plate for the entire open cycle — no early exit, or the door
      // oscillates and the bot ping-pongs between plate and gate forever.
      // Claim the plate before the lower-floor drop rule sees the ledge as
      // optional. The second gate is intentionally a little farther from its
      // approach edge than the first, so include the full plate approach.
      const door = lvl.doors.find((d) => !d.latched && d.x + d.w / 2 > px && d.x + d.w / 2 < px + 520);
      let holding = false, waitHold = false;
      if (door) {
        const plate = door.plate;
        // Take over only when the bot is at plate level (on the ledge the plate
        // sits on) or the plate is already pressed. Below the ledge, walking
        // with jumps disabled would stick the bot to the ledge wall — let the
        // normal target logic step it up instead.
        const atPlateLevel = !!plate && !!stand && Math.abs(stand.y - plate.y) < 8 &&
          px > plate.x - 70 && px < plate.x + plate.w + 70;
        if (plate && (plate.pressed || atPlateLevel)) {
          // Counter-steer while momentum is carrying Rex across the small
          // pressure-plate zone; friction alone can slide him off before the
          // door finishes its latch cycle.
          const cx = plate.x + plate.w / 2;
          if (px < cx - 8 || p.vx < -70) { wantRight = true; wantLeft = false; }
          else if (px > cx + 8 || p.vx > 70) { wantRight = false; wantLeft = true; }
          else { wantRight = false; wantLeft = false; }
          wantJump = false; holding = true;
        }
      }

      // Daily Rex ground segments are deliberately connected by short pits.
      // Take a dedicated, margin-aware jump for those gaps before optional
      // ledges can steal the target and leave Rex running off the bank.
      if (mode === 'daily' && stand && p.grounded && !holding && !waitHold && !wantJump) {
        const edge = stand.x + stand.w;
        const nextGround = lvl.platforms
          .filter((pl) => pl.active !== false && pl.type === 'ground' && pl.x >= edge - 8)
          .sort((a, b) => a.x - b.x)[0];
        const gap = nextGround ? nextGround.x - edge : 0;
        const landing = nextGround ? nextGround.x + 36 : 0;
        const takeoff = landing - reach(0, false);
        if (nextGround && gap > 0 && gap <= 180 && px >= takeoff && px <= edge - 10) {
          fullJump('dailyGap');
        }
      }

      // --- Boss (Molten Nest) ----------------------------------------------------
      // The Magma King charges toward whichever side Rex is on and only
      // staggers (stompable) when he clamps at a wall. His minX (2400) keeps
      // his body 100px clear of the entry pocket (2248..2300), so the pocket
      // is always body-safe. The fight:
      //   • hold the pocket until he staggers at the left wall, then full-jump
      //     right off it — the descent crosses his stomp band over his left
      //     half (stomp) and the bounce carries Rex to his right side;
      //   • from there, hop left back over him (a clank, no damage) and settle
      //     in the pocket again. One stomp per stagger, three to kill.
      const boss = lvl.boss;
      const ARENA_L = 2244, POCKET_L = 2248, POCKET_R = 2300;
      const inArena = px >= ARENA_L;
      if (boss && boss.state === 'dying') {
        // Gate just opened — run to the nest, don't go back to the pocket.
        wantRight = true; wantLeft = false;
      } else if (boss && !boss.dead) {
        if (!inArena) {
          // Entry: the pocket is body-safe (boss minX 2400), so just run in —
          // the hazard-jump clears the entry lava and lands Rex in the pocket.
          if (px > 1990 && px < ARENA_L) { wantRight = true; wantLeft = false; }
        } else {
          const bossL = boss.x, bossR = boss.x + boss.w;
          const stompWindow = boss.vulnerable && boss.x < 2600;
          if (stompWindow) {
            // Stomp: build rightward speed in the pocket and launch into the
            // boss's left half. If Rex is already past him (a chained bounce),
            // swing back left over him first.
            if (px - 17 >= bossR) { wantLeft = true; wantRight = false; }
            else if (px < POCKET_L) { wantRight = true; wantLeft = false; }
            else if (p.grounded && p.vx > 150) fullJump('bossStomp');
            else { wantRight = true; wantLeft = false; }
          } else if (px - 17 >= bossL && px > POCKET_R) {
            // Over or right of the boss while he's not stompable: hop left
            // back over him (clanks off his top, no damage) toward the pocket.
            if (p.grounded) fullJump('returnPocket');
            wantLeft = true; wantRight = false;
          } else {
            // Everything else (walk, telegraph, charge, right-side stagger):
            // hold the pocket — the only body-safe side.
            if (px > POCKET_R) { wantLeft = true; wantRight = false; }
            else if (px < POCKET_L) { wantRight = true; wantLeft = false; }
            else { wantLeft = false; wantRight = false; }
          }
        }
      }

      // An elevated optional ledge can have a safe lower landing directly
      // ahead. Jump to that floor rather than dropping onto an incidental
      // crumble slab that physically intercepts the fall.
      if (stand && !wantJump && !holding && stand.y < 460) {
        const dropOptions = [
         { x: px + reach(0, false), jump: fullJump, name: 'safeDrop' },
         { x: px + reach(0, true), jump: shortJump, name: 'safeDropShort' },
        ];
        const drop = dropOptions.find((option) => {
         const lower = lvl.platforms.find((pl) =>
           pl !== stand && pl.active !== false &&
           pl.y > stand.y + 24 && pl.y - stand.y <= 190 &&
           option.x >= pl.x + 24 && option.x <= pl.x + pl.w - 24);
         if (!lower) return false;
         return !lvl.hazards.some((hz) =>
           hz.type !== 'rocks' && hz.rect &&
           hz.rect.x < option.x + 20 && hz.rect.x + hz.rect.w > option.x - 20 &&
           hz.rect.y < lower.y + 12 && hz.rect.y + hz.rect.h > stand.y);
        });
        if (drop && px + 23 < stand.x + stand.w - 18 && p.vx >= 272) {
         drop.jump(drop.name);
        }
      }

      // --- Targeted jump (gaps, steps, stone chains) ------------------------------
      // Find the closest forward target — static platforms first (only if a
      // landing actually fits from this stand; movers swing in, so they are the
      // fallback) — and take off inside the window that lands on it.
      let target = null;
      if (stand && !wantJump && !holding) {
        const edge = stand.x + stand.w;
        const standLo = stand.x + 23, standHi = edge - 23;
        const jumpable = (pl, rise) => {
          for (const d of [reach(rise, false), reach(rise, true)]) {
            if (d <= 0) continue;
            const w = okWindow(pl, d);
            // The window must still be ahead of the body's center — a window
            // already behind us is a dead target (inWin compares px, not the
            // body edge, so px-space is the right liveness test).
            if (w && w[0] < standHi && w[1] > px) return true;
          }
          return false;
        };
        // A platform with no way on from its far edge is a trap — running off
        // it drops you in a hazard. Used to skip optional step-up detours.
        const isDeadEnd = (pl, depth) => {
          if (depth > 2) return false;
          // A platform containing the goal is a valid route endpoint even
          // when the level intentionally has no further platform exit.
          if (lvl.goal && lvl.goal.x >= pl.x && lvl.goal.x <= pl.x + pl.w) return false;
          let exits = 0, dead = 0;
          for (const q of lvl.platforms) {
            if (q === pl || q.active === false) continue;
            const gap = q.x - (pl.x + pl.w);
            if (gap < -8 || gap > 270) continue;
            const rise = pl.y - q.y;
            if (rise > 130 || rise < -200) continue;
            exits++;
            if (isDeadEnd(q, depth + 1)) dead++;
          }
          return exits === 0 || dead === exits;
        };
        const findTarget = (moversOnly) => {
          // A step-up whose jump window overlaps this stand means backing up
          // is a live plan — so a lower decoy across a hazard gap can be
          // skipped. When the drop is the only way forward there is no such
          // window and the target must be kept.
          let stepUpWindow = false;
          if (!moversOnly) {
            for (const q of lvl.platforms) {
              if (q === stand || q.active === false) continue;
              const riseU = stand.y - q.y;
              if (riseU <= 0 || riseU > 130) continue;
              const gapU = q.x - edge;
              const upU = q.x + q.w > p.x + p.w;
              const minGapU = upU ? -Infinity : -8;
              if (gapU < minGapU || gapU > 270) continue;
              const dU = reach(riseU, false);
              if (dU <= 0) continue;
              const wU = okWindow(q, dU);
              if (wU && wU[1] > standLo && wU[0] < standHi) { stepUpWindow = true; break; }
            }
          }
          let t = null, bestGap = Infinity;
          for (const pl of lvl.platforms) {
            if (pl === stand || pl.active === false) continue;
            if (pl.type === 'door') continue; // a gate the bot passes through, never a landing
            // A spring pad on the run path to this target launches Rex onto
            // it for free; aiming past the pad wastes the jump and can fly
            // under a floating target (or into the gap beyond).
            if (!moversOnly && (lvl.springs || []).some((s) =>
              s.x - 4 >= p.x + p.w - 20 && s.x - 4 <= pl.x &&
              s.y + 4 > stand.y - 30 && s.y - 26 < stand.y + 40)) continue;
            const isMover = pl.type === 'mover';
            if (moversOnly !== isMover) continue;
            const gap = pl.x - edge;
            const rise = stand.y - pl.y; // >0 = target is higher
            // A platform above the stand is a step-up target (crumble/ledge
            // hops) even when it starts before the stand's edge; the window
            // check below still enforces real reachability.
            const stepUp = !moversOnly && rise > 0 && pl.x + pl.w > p.x + p.w;
            const minGap = stepUp ? -Infinity : (moversOnly ? -40 : -8);
            if (gap < minGap || gap > 270 || gap >= bestGap) continue;
            if (rise > 130 || rise < -200) continue;
            if (stepUp) {
          if ((pl.type || 'ground') === 'crumble') {
            // A crumble crumbles on touch: take it only when the floor below
            // catches the drop and the shaft is hazard-free — otherwise it is
            // a one-way trip into the pit.
            const below = lvl.platforms.some((q) =>
              q.active !== false && q !== pl && q.y > pl.y + 24 && q.y <= pl.y + 170 &&
              q.x < pl.x + pl.w - 10 && q.x + q.w > pl.x + 10);
            // A crumble bridge spans an open gap (no floor below), but the next
            // slab/bank within hop reach carries the chain across (crumbleChain).
            const chained = lvl.platforms.some((q) =>
              q.active !== false && q !== pl &&
              q.x >= pl.x + pl.w - 20 && q.x < pl.x + pl.w + 280 &&
              Math.abs(q.y - pl.y) <= 60);
            const shaftHazard = lvl.hazards.some((hz) =>
              hz.type !== 'rocks' && hz.rect && hz.rect.y > pl.y && hz.rect.y < pl.y + 200 &&
              hz.rect.x < pl.x + pl.w - 8 && hz.rect.x + hz.rect.w > pl.x + 8);
            if ((!below && !chained) || shaftHazard) continue;
          } else if (isDeadEnd(pl, 0) &&
              !(pl.x < edge && pl.x + pl.w > p.x + p.w)) {
            continue; // optional detour into a trap
          }
        }
            // A lower platform reached across a gap that holds a hazard is a
            // trap: a hop from the stand edge re-lands on the stand's sliver
            // and drifts off into the hazard. Skip it only when a step-up's
            // window overlaps this stand (backing up is a live plan); when the
            // drop is the only way forward the target must be kept.
            if (!moversOnly && rise < -24) {
              const gapHazard = lvl.hazards.some((hz) =>
                hz.type !== 'rocks' && hz.rect &&
                hz.rect.y >= stand.y &&
                hz.rect.x < pl.x + 20 && hz.rect.x + hz.rect.w > edge - 20);
              if (gapHazard && stepUpWindow) continue;
            }
            if (!moversOnly && !jumpable(pl, rise)) continue; // static must fit from here
            bestGap = gap; t = pl;
          }
          return t;
        };
        target = findTarget(false) || findTarget(true);
        // A near-max ground gap with a mover in its flight path is a bridge
        // route, not a blind leap to the far bank. Use the mover explicitly
        // so its timing and landing margins remain under planner control.
        if (target && target.type !== 'mover' && stand && target.y === stand.y &&
            target.x - (stand.x + stand.w) > 150) {
          target = findTarget(true) || target;
        }
        // A low mover can sit in the direct jump's head path. Prefer that
        // mover as the intended bridge instead of running off the edge while
        // waiting for the static landing route to clear.
        if (target && target.type !== 'mover' && headBlocked(130, target)) {
          target = findTarget(true) || target;
        }
        if (target) {
          if (target.type === 'mover') {
            // Predict where the mover will be when this flight lands so the
            // takeoff window tracks its drift (measured velocity, linear
            // over the flight).
            const mv = moverVel(target);
            const tF = Math.max(reach(stand.y - target.y, false), reach(stand.y - target.y, true), 1) / 279;
            const cx = target.x, cy = target.y; // current body (for walk-catch)
            target = { x: target.x + mv.x * tF, y: target.y + mv.y * tF, w: target.w, type: 'mover', axis: target.axis, cx, cy, platform: target };
          }
          const aim = aimAt(target, stand.y - target.y, edge - 23);
          if (aim === 'wait') {
            waitHold = true;
            // Counter-steer at a stand edge so braking actually takes effect
            // before the next tick can move Rex into the gap.
            wantLeft = p.vx > 25 || (stand && px + 23 >= stand.x + stand.w - 30);
            wantRight = !wantLeft && p.vx < -25;
          }
          else if (aim === 'backoff') { wantLeft = true; wantRight = false; waitHold = true; }
        } else if (stand.type !== 'mover' && wantRight) {
          const toEdge = edge - (p.x + p.w);
          // A spring pad on the run path launches Rex before the edge matters;
          // an edge-jump would skip over it. Walk into the spring instead.
          const springOnPath = (lvl.springs || []).some((s) =>
            s.x - 4 <= edge + 40 && s.x + 52 >= p.x + p.w - 12 &&
            s.y + 4 > p.y && s.y - 26 < p.y + p.h);
          if (toEdge <= 70 && springOnPath) { }
          else if (toEdge <= 70) {
            // A spring/moving platform may be waiting out there — jump only
            // when the predicted landing is actually supported, otherwise walk
            // off the edge and fall to whatever is below.
            const landX = px + reach(0, false);
            const supported = lvl.platforms.some((pl) =>
              pl.active !== false &&
              landX >= pl.x + 15 && landX <= pl.x + pl.w - 15 &&
              Math.abs(pl.y - stand.y) <= 24);
            if (supported && p.vx >= 272) { fullJump('noTargetEdge'); }
            else {
              // Walk off the right edge: does the drop land on a floor below?
              // A jump would overshoot the drift, so this is a run-off.
              let edgeDrop = false;
              for (const pl of lvl.platforms) {
                if (pl.active === false || pl.type === 'mover') continue;
                if (pl.y <= stand.y + 24 || pl.y > stand.y + 300) continue;
                const t = Math.sqrt(2 * (pl.y - stand.y) / 1500);
                const xLand = edge + 21 + 279 * t;
                if (xLand < pl.x + 15 || xLand > pl.x + pl.w - 15) continue;
                if (pl.type === 'crumble' && !lvl.platforms.some((q) =>
                  q.active !== false && q !== pl && q.y > pl.y + 24 && q.y <= pl.y + 170 &&
                  q.x < pl.x + pl.w - 10 && q.x + q.w > pl.x + 10)) continue;
                const shaftHazard = lvl.hazards.some((hz) =>
                  hz.type !== 'rocks' && hz.rect && hz.rect.y >= stand.y && hz.rect.y < pl.y &&
                  hz.rect.x < xLand + 21 && hz.rect.x + hz.rect.w > edge - 21);
                if (shaftHazard) continue;
                edgeDrop = true; break;
              }
              if (edgeDrop) { }
              else {
                // Dead end ahead: if the floor below the LEFT edge is safe,
                // back up and drop off that way instead of drifting into the
                // pit in front.
                const leftSup = lvl.platforms.some((pl) =>
                  pl.active !== false && pl.type !== 'mover' &&
                  pl.y > stand.y + 24 && pl.y <= stand.y + 170 &&
                  pl.x < stand.x + 46 && pl.x + pl.w > stand.x - 60);
                const leftHazard = lvl.hazards.some((hz) =>
                  hz.type !== 'rocks' && hz.rect && hz.rect.y > stand.y && hz.rect.y < stand.y + 200 &&
                  hz.rect.x < stand.x + 40 && hz.rect.x + hz.rect.w > stand.x - 70);
                if (leftSup && !leftHazard) { wantLeft = true; wantRight = false; }
                else { }
              }
            }
          }
          // else: run on (crumble chains, flat runs)
        } else if (stand.type === 'mover' && !target) {
          wantRight = false; wantLeft = false; // ride until a target line opens
        }
      }

      // --- Wall ahead: a solid face at body height (crumble steps, ledges) ----------
      // The run lane is blocked when a platform's left face is just in front of
      // Rex and its top is above foot level. No auto step-up exists, so any
      // such face needs a jump.
      if (wantRight && p.grounded && !wantJump) {
        for (const pl of lvl.platforms) {
          if (pl.active === false) continue;
          const ahead = pl.x - (p.x + p.w);
          if (ahead < -8 || ahead > 34) continue;
          if (pl.y >= feet - 4) continue; // floor we're standing on / step down
          if (pl.y + pl.h <= p.y + 4) continue; // floats above the head
          wantJump = true;
          break;
        }
      }

      // --- Ground-level hazards ahead ----------------------------------------------
      // Jump only once the full-jump landing comes down past the hazard end.
      // If a full jump would bonk its head on a floating platform above, fall
      // back to a short hop once its landing clears the hazard; otherwise run
      // one more tick and re-evaluate.
      // Falling rocks expose a separate warning timer instead of a ground
      // hitbox. Treat the telegraph and any descending rock as a jump cue so
      // browser hardening exercises the intended readable counterplay.
      if (p.grounded && !holding && !waitHold && !wantJump) {
        for (const h of lvl.hazards) {
          if (h.type !== 'rocks') continue;
          const rockAhead = h.warnTimer > 0
            ? h.warnX > px - 35 && h.warnX < px + 210
            : h.rocks.some((r) => r.x > px - 35 && r.x < px + 210 && r.y > -10);
          if (!rockAhead) continue;
          const landX = px + reach(0, false);
          if (supportedAt(landX) && !headBlocked(130) && !arcBlocked(reach(0, false), 0, false)) {
            fullJump('rockfall');
            break;
          }
        }
      }
      for (const h of lvl.hazards) {
        const r = h.rect;
        if (h.type === 'rocks') continue;
        // Lava hitboxes sit below the ground line, so they are not inside the
        // normal spike band until Rex has already stepped off the bank. When a
        // predicted full jump lands on a platform beyond the lava's near edge,
        // leave early enough to use that platform instead of treating the
        // whole lava span as a single blind gap.
        const lavaAhead = h.type === 'lava' && r.y < feet + 80;
        const groundHazard = r.y + r.h > feet - 14 && r.y < feet + 24;
        if (lavaAhead || groundHazard) {
          const d = r.x - px;
          if (!(d > -12 && d < 150 && p.grounded && !waitHold)) continue;
          if (px + 23 > r.x + r.w) continue; // body already past the hazard
          const dFull = reach(0, false);
          const dShort = reach(0, true);
          if (lavaAhead && px + dFull > r.x + 10 && safelySupportedAt(px + dFull) &&
              !headBlocked(130) && !arcBlocked(dFull, 0, false)) {
            fullJump('lavaRoute');
            break;
          }
          const need = r.x + r.w + 25 - (dFull - 23); // landing 25 px past the hazard
          if (!headBlocked(130)) {
            if (px >= need && p.vx >= 272 && supportedAt(px + dFull)) { fullJump('hazard'); break; }
          } else if (p.vx >= 272 && px + dShort - 23 >= r.x + r.w && supportedAt(px + dShort)) {
            shortJump('hazardShort'); break;
          }
        }
      }

      // --- Ground enemy pre-hop --------------------------------------------------------
      // A patrolling beetle/trike in the run lane costs a heart and the knockback
      // shaves the next gap jump. A cheap short hop well before contact clears it
      // while preserving run speed — but only when the whole landing box comes
      // down well INSIDE a solid platform (never on a gap edge) with no hazard
      // in the landing band.
      if (p.grounded && !holding && !waitHold && !wantJump) {
        for (const e of lvl.enemies) {
          if (e.dead || (e.type !== 'beetle' && e.type !== 'trike')) continue;
          const d = e.x + e.w / 2 - px;
          if (!(d > 30 && d < 200) || Math.abs(e.y - p.y) >= 70) continue;
          // Use a full hop when the enemy is still far enough away that the
          // short arc would land inside its patrol. Keep the short hop for
          // close encounters so the bot does not overshoot a ledge.
          // Trikes hop unpredictably and can drift toward Rex between planner
          // ticks, so always use the long arc when there is a safe landing.
          let longHop = e.type === 'trike' || d > 120;
          let jumpReach = reach(0, longHop ? false : true);
          if (jumpReach <= 0) continue;
          const landingOnSolid = (distance) => lvl.platforms.some((pl) =>
            pl.active !== false && (pl.type || 'ground') !== 'crumble' &&
            pl.x + 8 <= px + distance - 23 && pl.x + pl.w - 8 >= px + distance + 23 &&
            Math.abs(pl.y - feet) <= 30);
          // A distant walker normally gets a full hop, but a full arc can
          // overshoot the shelf Rex is standing on near a gap. Prefer a
          // short hop when it still clears the enemy and lands on solid ground.
          if (longHop && !landingOnSolid(jumpReach)) {
            const shortReach = reach(0, true);
            if (shortReach > 0 && landingOnSolid(shortReach)) {
              longHop = false;
              jumpReach = shortReach;
            }
          }
          const landX = px + jumpReach;
          const landOk = landingOnSolid(jumpReach);
          if (!landOk) continue;
          const hazardIn = lvl.hazards.some((hz) => hz.type !== 'rocks' && hz.rect &&
            hz.rect.y + hz.rect.h > feet - 14 && hz.rect.y < feet + 24 &&
            hz.rect.x < landX + 23 && hz.rect.x + hz.rect.w > landX - 23);
          if (hazardIn) continue;
          if (arcBlocked(jumpReach, 0, !longHop, e)) continue;
          if (longHop) fullJump('enemyHop');
          else shortJump('enemyHop');
          break;
        }
      }

      // Emergency walker hop: when a walker is closing inside the next
      // short-hop window, a conservative arc-block result must not leave Rex
      // walking into it (especially when the walker guards a spike exit).
      // Prefer the full arc when its landing is solid and hazard-free.
      if (p.grounded && !holding && !waitHold && !wantJump) {
        for (const e of lvl.enemies) {
          if (e.dead || (e.type !== 'beetle' && e.type !== 'trike')) continue;
          const d = e.x + e.w / 2 - px;
          if (!(d > 40 && d < 155) || Math.abs(e.y - p.y) >= 80) continue;
          const full = reach(0, false);
          const landX = px + full;
          const landingOnSolid = lvl.platforms.some((pl) =>
            pl.active !== false &&
            (pl.type || 'ground') !== 'crumble' &&
            pl.x + 8 <= landX - 23 &&
            pl.x + pl.w - 8 >= landX + 23 &&
            Math.abs(pl.y - feet) <= 30);
          const hazardIn = lvl.hazards.some((hz) => hz.type !== 'rocks' && hz.rect &&
            hz.rect.y + hz.rect.h > feet - 14 && hz.rect.y < feet + 24 &&
            hz.rect.x < landX + 23 && hz.rect.x + hz.rect.w > landX - 23);
          if (landingOnSolid && !hazardIn && !headBlocked(130)) {
            fullJump('enemyEmergency');
            break;
          }
        }
      }

      // --- Enemies ahead -------------------------------------------------------------
      // If a platform sits under the jump arc, land on it deterministically —
      // that's the route past the enemy (e.g. the stone chain over the trike).
      // Otherwise take a full jump once the landing is safe, never from a spot
      // that lands in a ground gap.
      for (const e of lvl.enemies) {
        if (e.dead) continue;
        const d = e.x + e.w / 2 - px;
        if (!(d > 0 && d < 450) || Math.abs(e.y - p.y) >= 80 || !p.grounded || !stand) continue;
        if (holding) continue; // holding for the plate / door
        if (target) continue; // any target means the planner owns the timing
        const under = lvl.platforms.find((pl) =>
          pl.active !== false && (pl.type || 'ground') !== 'ground' && pl.type !== 'mover' &&
          pl.x < px + 280 && pl.x + pl.w > px + 30 &&
          pl.y <= feet - 20 && pl.y >= feet - 130) ||
          lvl.platforms.find((pl) =>
          pl.active !== false && (pl.type || 'ground') !== 'ground' &&
          pl.x < px + 280 && pl.x + pl.w > px + 30 &&
          pl.y <= feet - 20 && pl.y >= feet - 130);
        if (under) {
          const r = aimAt(under, feet - under.y, stand ? stand.x + stand.w - 23 : px);
          if (r === 'wait') wantRight = false;
        } else {
          // Blind jump only when a static platform catches the landing — a
          // mover may have drifted away by touchdown.
          const staticSup = lvl.platforms.some((pl) =>
            pl.active !== false && (pl.type || 'ground') !== 'crumble' && pl.type !== 'mover' &&
            pl.x < px + 256 && pl.x + pl.w > px + 210 && Math.abs(pl.y - feet) <= 30);
          if (staticSup) fullJump('enemyReact');
        }
      }

      // --- Glob dodge ------------------------------------------------------------------
      // A glob at body height (spitter lob at descent, boss spread) is a hit if
      // Rex stays put. A full jump clears it when the landing is supported;
      // skip rising lobes (apex sits above the jump) and globs not closing in.
      if (p.grounded && !holding && !waitHold && !wantJump) {
        for (const pr of lvl.projectiles) {
          if (!pr || pr.dead) continue;
          const ddx = pr.x - px;
          const ddy = pr.y - (feet - 11);
          if (!(ddx > -40 && ddx < 170) || !(ddy > -40 && ddy < 45)) continue;
          if (pr.vy < -80) continue; // rising lob: apex above the jump
          const closing = (pr.vx < -60 && ddx > 0) || (pr.vx > 60 && ddx < 0) || Math.abs(ddx) < 40;
          if (!closing) continue;
          if (!supportedAt(px + 233)) continue;
          if (arcBlocked(233, 0, false)) continue;
          fullJump('dodge');
          break;
        }
      }

      // Flyer overhead: a pteranodon's low dip clips Rex standing under its
      // patrol. Hold still until it sweeps clear — on a narrow stone there is
      // no room to back off.
      for (const e of lvl.enemies) {
        if (e.dead) continue;
        const ec = e.x + e.w / 2;
        if (Math.abs(ec - px) < 45 && e.y + e.h < feet - 8 && e.y + e.h > p.y - 6) {
          wantLeft = false; wantRight = false; waitHold = true;
        }
      }

      hold('ArrowLeft', wantLeft);
      hold('ArrowRight', wantRight);
      if (wantJump && p.grounded) fullJump('wantJump');
    }, 50);

    // Watch for the verdict (set by the tick above).
    const watch = setInterval(() => {
      if (verdict) {
        clearInterval(timer);
        clearInterval(watch);
        resolve(finish());
      }
    }, 100);

    // Hard backstop so a stuck bot can never hang the harness.
    setTimeout(() => {
      if (!verdict) {
        clearInterval(timer);
        clearInterval(watch);
        done('timeout', 'backstop state=' + g.state);
        resolve(finish());
      }
    }, maxMs + 20_000);
  })
`;

// ---------------------------------------------------------------------------

async function waitServer(url) {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No preview server at ${url}. Start one first: npm run preview -- --port 4173 --strictPort`);
}

/**
 * Duskfen late-tide stress: force the water to its final level, respawn at
 * the spawn point and every checkpoint, and require the bot to stand on dry
 * ground (top <= 446) with forward progress within 15 s each time.
 */
async function runDuskStress(browser) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || String(e)));
  await page.goto(BASE_URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.TINY_REX && window.TINY_REX.game);

  await page.evaluate(() => {
    const g = window.TINY_REX.game;
    g.selectLevel(4);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(() => window.TINY_REX.game.state === 'playing', null, { timeout: 8000 });

  const cps = await page.evaluate(() => {
    const g = window.TINY_REX.game;
    return [
      { name: 'spawn', x: g.level.start.x, idx: 0 },
      ...g.level.checkpoints.map((c, i) => ({ name: 'cp' + (i + 1), x: c.x, idx: i + 1 })),
    ];
  });

  const results = [];
  for (const cp of cps) {
    await page.evaluate((idx) => {
      const g = window.TINY_REX.game;
      g.setCheckpointAt(idx);
      g.level.waterY = g.level.tide.toY; // final waterline (452)
      g.level.tideWarned = true;
      if (g.state === 'playing') g.respawn();
    }, cp.idx);
    const t0 = Date.now();
    let result;
    try {
      result = await Promise.race([
        page.evaluate(`(${BOT_SOURCE})(${JSON.stringify({ levelIdx: 4, mode: 'level', maxMs: 15_000, minProgress: 0, stress: { x: cp.x } })})`),
        new Promise((_, rej) => setTimeout(() => rej(new Error('stress bot hung')), 22_000)),
      ]);
    } catch (e) {
      result = { verdict: 'error', extra: String(e), x: 0, width: 0, ms: 0, state: '?' };
    }
    const ok = result.verdict === 'safe';
    results.push({
      name: `dusk-${cp.name}`,
      ok,
      detail: ok ? 'safe on dry ground' : `verdict=${result.verdict} ${result.extra}`,
      ms: Date.now() - t0,
    });
    if (!ok) {
      try { await page.screenshot({ path: `${SHOT_DIR}/dusk-${cp.name}.png` }); } catch { /* ignore */ }
      break;
    }
  }
  try { await page.screenshot({ path: `${SHOT_DIR}/dusk-stress.png` }); } catch { /* ignore */ }
  await context.close();
  return { results, errors };
}

async function runScenario(browser, name, opts) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || String(e)));
  await page.goto(BASE_URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.TINY_REX && window.TINY_REX.game);

  let result;
  try {
    result = await Promise.race([
      page.evaluate(`(${BOT_SOURCE})(${JSON.stringify(opts)})`),
      new Promise((_, rej) => setTimeout(() => rej(new Error('bot evaluate hung')), opts.maxMs + 25_000)),
    ]);
  } catch (e) {
    result = { verdict: 'error', extra: String(e), x: 0, width: 0, ms: 0, state: '?' };
  }

  const shot = `${SHOT_DIR}/${name}.png`;
  try { await page.screenshot({ path: shot }); } catch { /* page may be gone */ }
  if (result.jumpLog) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(`${SHOT_DIR}/${name}.jumps.json`, JSON.stringify(result.jumpLog, null, 1));
  }
  let ok;
  let detail;
  if (opts.mode === 'daily') {
    ok = result.verdict === 'victory' || result.verdict === 'daily-progress';
    detail = result.verdict === 'victory'
      ? `victory in ${Math.round(result.ms / 1000)}s`
      : result.verdict === 'daily-progress'
        ? `reached ${Math.round((result.x / result.width) * 100)}% (no softlock)`
        : `verdict=${result.verdict} ${result.extra}`;
  } else {
    ok = result.verdict === 'victory';
    detail = result.verdict === 'victory'
      ? `victory in ${Math.round(result.ms / 1000)}s`
      : `verdict=${result.verdict} ${result.extra}`;
  }
  if (errors.length) {
    ok = false;
    detail += ` | page errors: ${errors.join(' ; ')}`;
  }
  await context.close();
  return { name, ok, detail, shot, errors, debug: result.debug };
}

const arg = process.argv.slice(2);
const stressMode = arg.includes('dusk-stress');
let scenarios = [];
if (stressMode) {
  scenarios = [];
} else if (arg.includes('daily')) {
  scenarios = [{ name: 'daily', mode: 'daily', levelIdx: 0, maxMs: DAILY_BUDGET, minProgress: DAILY_MIN_PROGRESS }];
} else if (arg.length) {
  for (const a of arg) {
    const n = Number(a);
    if (!Number.isInteger(n) || n < 0 || n > 4) throw new Error(`Unknown scenario: ${a}`);
    scenarios.push({ name: `level-${n}`, mode: 'level', levelIdx: n, maxMs: LEVEL_BUDGET[n] });
  }
} else {
  for (let n = 0; n < 5; n++) scenarios.push({ name: `level-${n}`, mode: 'level', levelIdx: n, maxMs: LEVEL_BUDGET[n] });
  scenarios.push({ name: 'daily', mode: 'daily', levelIdx: 0, maxMs: DAILY_BUDGET, minProgress: DAILY_MIN_PROGRESS });
}

mkdirSync(SHOT_DIR, { recursive: true });
await waitServer(BASE_URL);
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});

let failed = 0;
console.log(`\nTiny Rex playtest @ ${BASE_URL}\n`);
if (stressMode) {
  const { results, errors } = await runDuskStress(browser);
  for (const res of results) {
    const secs = (res.ms / 1000).toFixed(1);
    const detail = errors.length ? `${res.detail} | page errors: ${errors.join(' ; ')}` : res.detail;
    console.log(`  ${res.ok ? 'PASS' : 'FAIL'}  ${res.name.padEnd(12)} ${secs.padStart(7)}s  ${detail}`);
    if (!res.ok || errors.length) failed++;
  }
} else {
  console.log(`(${scenarios.length} scenario(s))\n`);
  for (const s of scenarios) {
    const t0 = Date.now();
    const res = await runScenario(browser, s.name, {
      levelIdx: s.levelIdx,
      mode: s.mode,
      maxMs: s.maxMs,
      minProgress: s.minProgress ?? 0,
    });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`  ${res.ok ? 'PASS' : 'FAIL'}  ${res.name.padEnd(12)} ${secs.padStart(7)}s  ${res.detail}`);
    if (!res.ok && res.debug) console.log('    debug:', JSON.stringify(res.debug));
    if (!res.ok) failed++;
  }
}
await browser.close();

console.log(failed ? `\n${failed} scenario(s) FAILED — screenshots in ${SHOT_DIR}` : `\nAll scenarios passed — screenshots in ${SHOT_DIR}`);
process.exit(failed ? 1 : 0);
