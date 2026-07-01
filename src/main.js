/**
 * main.js – Entry point: wires Engine, Input, Fighters, AI, Combat,
 * Background, and UI together, then runs the full match loop.
 *
 * Game-state flow:
 *   select_bg  →  round_intro  →  fighting  →  round_end
 *        ↑              ↑               ↓             ↓
 *        └──────────────┤        (if < 2 wins)        │
 *                       └──────── match_end ←──────────┘
 *
 * Serve with: python -m http.server 8080  (ES modules need an HTTP server)
 */

import { Engine }              from './engine.js';
import { Input }               from './input.js';
import { loadFighterAnimations }from './animationLoader.js';
import { Fighter }             from './fighter.js';
import { AIController }        from './ai.js';
import { CombatSystem }        from './combat.js';
import { Background }          from './background.js';
import { UI }                  from './ui.js';

// ── Constants ──────────────────────────────────────────────────────────────

const CANVAS_W  = 1280;
const CANVAS_H  = 720;
const GROUND_Y  = 628;     // bottom of fighters (floor level)
const P1_START  = { x: 360, y: GROUND_Y, facing:  1 };
const P2_START  = { x: 920, y: GROUND_Y, facing: -1 };

const ROUND_TIME     = 60;   // seconds per round
const ROUNDS_TO_WIN  = 2;    // best-of-3
const ROUND_INTRO_DUR = 2.4; // "ROUND N" screen duration (s)
const ROUND_END_DUR   = 3.0; // post-round freeze before next

// ── Exact file lists (from verified repo scan) ─────────────────────────────

const C1_PATH = 'Character Colour1/Outline/120x80_PNGSheets';
const C1_FILES = [
  '_Attack.png', '_Attack2.png', '_Attack2NoMovement.png', '_AttackCombo2hit.png',
  '_AttackComboNoMovement.png', '_AttackNoMovement.png', '_Crouch.png',
  '_CrouchAttack.png', '_CrouchFull.png', '_CrouchTransition.png',
  '_CrouchWalk.png', '_Dash.png', '_Death.png', '_DeathNoMovement.png',
  '_Fall.png', '_Hit.png', '_Idle.png', '_Jump.png', '_JumpFallInbetween.png',
  '_Roll.png', '_Run.png', '_Slide.png', '_SlideFull.png',
  '_SlideTransitionEnd.png', '_SlideTransitionStart.png', '_TurnAround.png',
  '_WallClimb.png', '_WallClimbNoMovement.png', '_WallHang.png', '_WallSlide.png',
];

const C2_PATH = 'Character Colour2/Outline/120x80_PNGSheets';
const C2_FILES = [
  '_Attack.png', '_Attack2.png', '_Attack2NoMovement.png', '_AttackCombo.png',
  '_AttackComboNoMovement.png', '_AttackNoMovement.png', '_Crouch.png',
  '_CrouchAll.png', '_CrouchAttack.png', '_CrouchTransition.png',
  '_CrouchWalk.png', '_Dash.png', '_Death.png', '_DeathNoMovement.png',
  '_Fall.png', '_Hit.png', '_Idle.png', '_Jump.png', '_JumpFallInbetween.png',
  '_Roll.png', '_Run.png', '_Slide.png', '_SlideAll.png',
  '_SlideTransitionEnd.png', '_SlideTransitionStart.png', '_TurnAround.png',
  '_WallClimb.png', '_WallClimbNoMovement.png', '_WallHang.png', '_WallSlide.png',
];

// ── GameState enum ─────────────────────────────────────────────────────────

const GS = Object.freeze({
  SELECT_BG:   'select_bg',
  ROUND_INTRO: 'round_intro',
  FIGHTING:    'fighting',
  ROUND_END:   'round_end',
  MATCH_END:   'match_end',
});

// ── Loading helpers ────────────────────────────────────────────────────────

function setLoaderProgress(pct, label = '') {
  const fill  = document.getElementById('loader-fill');
  const lbl   = document.getElementById('loader-label');
  if (fill) fill.style.width = `${Math.round(pct)}%`;
  if (lbl && label) lbl.textContent = label;
}

function hideLoadingScreen() {
  const el = document.getElementById('loading-screen');
  if (el) el.classList.add('hidden');
}

// ── Floor / ground visual ──────────────────────────────────────────────────

function drawFloor(ctx) {
  // Solid dark strip below fighters
  const grad = ctx.createLinearGradient(0, GROUND_Y, 0, CANVAS_H);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0.92)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, GROUND_Y, CANVAS_W, CANVAS_H - GROUND_Y);

  // Subtle horizon line
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(CANVAS_W, GROUND_Y);
  ctx.stroke();
}

// ── Prevent fighters overlapping ──────────────────────────────────────────

function pushApart(p1, p2) {
  const minDist = (p1.hurtW + p2.hurtW) / 2 + 4;
  const dx      = p2.x - p1.x;
  const dist    = Math.abs(dx);
  if (dist < minDist) {
    const push = (minDist - dist) / 2;
    const dir  = dx >= 0 ? 1 : -1;
    p1.x -= dir * push;
    p2.x += dir * push;
    // Clamp to canvas
    p1.x = Math.max(80, Math.min(1200, p1.x));
    p2.x = Math.max(80, Math.min(1200, p2.x));
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function init() {
  const canvas = document.getElementById('game-canvas');
  const engine = new Engine(canvas, CANVAS_W, CANVAS_H);
  const input  = new Input();
  const ui     = new UI();
  const combat = new CombatSystem();

  // ── Load assets ──────────────────────────────────────────────────────────

  setLoaderProgress(5, 'Loading background manifest…');
  let bgManifest;
  try {
    bgManifest = await fetch('./bg-manifest.json').then(r => r.json());
  } catch (e) {
    console.error('[Main] Could not fetch bg-manifest.json – are you on a local server?', e);
    bgManifest = {};
  }

  setLoaderProgress(12, 'Loading Player 1 sprites…');
  const p1Anims = await loadFighterAnimations(C1_PATH, C1_FILES);
  console.log('[Main] P1 animation states:', Object.keys(p1Anims).sort().join(', '));

  setLoaderProgress(55, 'Loading Player 2 sprites…');
  const p2Anims = await loadFighterAnimations(C2_PATH, C2_FILES);
  console.log('[Main] P2 animation states:', Object.keys(p2Anims).sort().join(', '));

  setLoaderProgress(90, 'Initialising game…');

  // ── Create fighters ───────────────────────────────────────────────────────

  const p1 = new Fighter({
    x: P1_START.x, y: P1_START.y, facing: P1_START.facing,
    animations: p1Anims, color: '#38bdf8', isPlayer: true,
  });

  const p2 = new Fighter({
    x: P2_START.x, y: P2_START.y, facing: P2_START.facing,
    animations: p2Anims, color: '#f87171', isPlayer: false,
  });

  // ── Background ────────────────────────────────────────────────────────────

  const background = new Background(bgManifest);
  const bgKeys     = Object.keys(bgManifest);
  let selectedBgIdx = 0;
  let selectedBgKey = bgKeys[0] ?? 'bg_1';

  // Load first background
  if (bgKeys.length) await background.load(selectedBgKey);

  setLoaderProgress(100, 'Ready!');
  await new Promise(r => setTimeout(r, 300)); // brief "ready" moment
  hideLoadingScreen();

  // ── AI ────────────────────────────────────────────────────────────────────

  const difficulties = ['easy', 'medium', 'hard'];
  let   diffIdx      = 1; // start medium
  const ai = new AIController(p2, p1, difficulties[diffIdx]);

  // ── Game state ────────────────────────────────────────────────────────────

  let gameState  = GS.SELECT_BG;
  let stateTimer = 0;
  let roundTimer = ROUND_TIME;
  let roundWins  = [0, 0];  // [p1, p2]

  // ── Keyboard menu controls ────────────────────────────────────────────────

  window.addEventListener('keydown', async (e) => {
    // Toggle hitbox debug
    if (e.code === 'F1') {
      p1.debug = !p1.debug;
      p2.debug = !p2.debug;
      return;
    }

    // Cycle difficulty (works on any screen)
    if (e.code === 'KeyM') {
      diffIdx = (diffIdx + 1) % difficulties.length;
      ai.setDifficulty(difficulties[diffIdx]);
      return;
    }

    if (gameState === GS.SELECT_BG) {
      const cols = 5;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        selectedBgIdx = (selectedBgIdx + 1) % bgKeys.length;
      } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        selectedBgIdx = (selectedBgIdx - 1 + bgKeys.length) % bgKeys.length;
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        selectedBgIdx = Math.min(bgKeys.length - 1, selectedBgIdx + cols);
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        selectedBgIdx = Math.max(0, selectedBgIdx - cols);
      } else if (e.code === 'Enter') {
        selectedBgKey = bgKeys[selectedBgIdx];
        await background.load(selectedBgKey);
        startMatch();
      }
      selectedBgKey = bgKeys[selectedBgIdx];
    } else if (gameState === GS.MATCH_END && e.code === 'Enter') {
      gameState = GS.SELECT_BG;
    }
  });

  // ── Round helpers ─────────────────────────────────────────────────────────

  function startMatch() {
    roundWins = [0, 0];
    startRound();
  }

  function startRound() {
    p1.reset(P1_START.x, P1_START.y, P1_START.facing);
    p2.reset(P2_START.x, P2_START.y, P2_START.facing);
    roundTimer = ROUND_TIME;
    gameState  = GS.ROUND_INTRO;
    stateTimer = 0;
  }

  function endRound() {
    // Determine winner (higher HP wins; tie = no win point)
    if (p1.health > p2.health)      roundWins[0]++;
    else if (p2.health > p1.health)  roundWins[1]++;

    if (roundWins[0] >= ROUNDS_TO_WIN || roundWins[1] >= ROUNDS_TO_WIN) {
      gameState  = GS.MATCH_END;
    } else {
      gameState  = GS.ROUND_END;
      stateTimer = ROUND_END_DUR;
    }
  }

  // ── Game loop ─────────────────────────────────────────────────────────────

  engine.start((dt) => {
    ui.update(dt);

    // ── State updates ──────────────────────────────────────────────────────

    switch (gameState) {

      case GS.ROUND_INTRO: {
        stateTimer += dt;
        if (stateTimer >= ROUND_INTRO_DUR) {
          ui.flashText('FIGHT!', 0.9, '#38bdf8');
          gameState = GS.FIGHTING;
        }
        break;
      }

      case GS.FIGHTING: {
        input.update();
        p1.handleInput(input);
        ai.update(dt);

        // Force facing toward opponent
        if (p1.onGround && p1.canAct()) p1.facing = p2.x > p1.x ? 1 : -1;
        if (p2.onGround && p2.canAct()) p2.facing = p1.x > p2.x ? 1 : -1;

        p1.update(dt, p2.x);
        p2.update(dt, p1.x);

        pushApart(p1, p2);
        background.update(p1.x, p2.x, CANVAS_W);

        // ── Hit detection ────────────────────────────────────────────────
        combat.check(p1, p2, (hit) => {
          const heavy = hit.damage >= 20;
          // Midpoint between hitbox and defender
          const hx = (p1.getHitbox()?.x ?? p1.x) + 30;
          const hy = p2.y - 90;
          ui.triggerHit(hx, hy, heavy);
          if (heavy) { p1.triggerShake(0.15); p2.triggerShake(0.22); }
          if (!hit.isBlocked) ui.flashText(heavy ? 'HEAVY HIT!' : '', 0.5, '#fbbf24');
        });

        combat.check(p2, p1, (hit) => {
          const heavy = hit.damage >= 20;
          const hx = (p2.getHitbox()?.x ?? p2.x) + 30;
          const hy = p1.y - 90;
          ui.triggerHit(hx, hy, heavy);
          if (heavy) { p2.triggerShake(0.15); p1.triggerShake(0.22); }
          if (!hit.isBlocked && heavy) ui.flashText('', 0.5, '#fbbf24');
        });

        // ── Round end check ──────────────────────────────────────────────
        roundTimer -= dt;
        const p1Dead = p1.health <= 0;
        const p2Dead = p2.health <= 0;
        if (p1Dead || p2Dead) {
          if (p2Dead && !p1Dead) ui.flashText('K.O.!', 2.0, '#38bdf8');
          else if (p1Dead)       ui.flashText('K.O.!', 2.0, '#f87171');
          endRound();
        } else if (roundTimer <= 0) {
          ui.flashText('TIME!', 1.8, '#fbbf24');
          endRound();
        }
        break;
      }

      case GS.ROUND_END: {
        // Fighters still animate in their final states
        p1.update(dt);
        p2.update(dt);
        stateTimer -= dt;
        if (stateTimer <= 0) startRound();
        break;
      }

      case GS.MATCH_END:
      case GS.SELECT_BG:
        // No per-frame updates needed
        break;
    }

    // ── Draw ───────────────────────────────────────────────────────────────

    const ctx = engine.ctx;

    // Camera shake (translate entire canvas)
    ctx.save();
    ctx.translate(ui.screenShakeX, ui.screenShakeY);

    // Background
    background.draw(ctx, CANVAS_W, CANVAS_H);

    // Floor shadow
    if (gameState !== GS.SELECT_BG) drawFloor(ctx);

    // Fighters
    if (gameState !== GS.SELECT_BG) {
      // Draw farther fighter first for correct overlap
      if (p1.x < p2.x) { p1.draw(ctx); p2.draw(ctx); }
      else              { p2.draw(ctx); p1.draw(ctx); }
    }

    ctx.restore(); // end shake

    // UI (no shake – always crisp)
    ui.draw(ctx, p1, p2, roundTimer, gameState, roundWins, {
      selectedKey: selectedBgKey,
      keys:        bgKeys,
      difficulty:  difficulties[diffIdx],
    });
  });
}

init().catch((err) => {
  console.error('[Main] Fatal init error:', err);
  document.getElementById('loader-label').textContent =
    'Error: ' + err.message + ' (Is this running on a local server?)';
  document.getElementById('loader-fill').style.background = '#ef4444';
});
