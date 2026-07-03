/**
 * main.js – Entry point: wires Engine, Input, Fighters, AI, Combat,
 * Background, UI, and Netplay together, then runs the full match loop.
 *
 * Modes:
 *  - VS CPU   : existing single-player vs AI
 *  - Online   : 1v1 via WebSocket relay server (Input-Sharing Lockstep)
 *
 * Serve with: python -m http.server 8080
 * Server:     cd server && npm install && node server.js
 */

import { Engine }              from './engine.js';
import { Input }               from './input.js';
import { MobileControls, isTouchDevice } from './mobileControls.js';
import { loadColourAnimations } from './animationLoader.js';
import { Fighter }             from './fighter.js';
import { AIController }        from './ai.js';
import { CombatSystem }        from './combat.js';
import { Background }          from './background.js';
import { UI }                  from './ui.js';
import { LobbyUI }             from './lobby-ui.js';
import { NetplayClient, NetplayStatus } from './netplay.js';

// ── Constants ──────────────────────────────────────────────────────────────

const CANVAS_W  = 1280;
const CANVAS_H  = 720;
const GROUND_Y  = 628;
const P1_START  = { x: 360, y: GROUND_Y, facing:  1 };
const P2_START  = { x: 920, y: GROUND_Y, facing: -1 };

const ROUND_TIME      = 60;
const ROUNDS_TO_WIN   = 2;
const ROUND_INTRO_DUR = 2.4;
const ROUND_END_DUR   = 3.0;

// WebSocket server address (change for production deployment)
// WebSocket server URL — uses public server in production, localhost in dev
const IS_DEV = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const WS_SERVER = IS_DEV
  ? 'ws://localhost:8765'
  : 'wss://knight-fight-server.onrender.com';


// ── Asset lists ────────────────────────────────────────────────────────────

const COLOUR1_FILES = [
  '_Attack.png', '_Attack2.png', '_Attack2NoMovement.png', '_AttackCombo2hit.png',
  '_AttackComboNoMovement.png', '_AttackNoMovement.png', '_Crouch.png',
  '_CrouchAttack.png', '_CrouchFull.png', '_CrouchTransition.png',
  '_CrouchWalk.png', '_Dash.png', '_Death.png', '_DeathNoMovement.png',
  '_Fall.png', '_Hit.png', '_Idle.png', '_Jump.png', '_JumpFallInbetween.png',
  '_Roll.png', '_Run.png', '_Slide.png', '_SlideFull.png',
  '_SlideTransitionEnd.png', '_SlideTransitionStart.png', '_TurnAround.png',
  '_WallClimb.png', '_WallClimbNoMovement.png', '_WallHang.png', '_WallSlide.png',
];

const COLOUR2_FILES = [
  '_Attack.png', '_Attack2.png', '_Attack2NoMovement.png', '_AttackCombo.png',
  '_AttackComboNoMovement.png', '_AttackNoMovement.png', '_Crouch.png',
  '_CrouchAll.png', '_CrouchAttack.png', '_CrouchTransition.png',
  '_CrouchWalk.png', '_Dash.png', '_Death.png', '_DeathNoMovement.png',
  '_Fall.png', '_Hit.png', '_Idle.png', '_Jump.png', '_JumpFallInbetween.png',
  '_Roll.png', '_Run.png', '_Slide.png', '_SlideAll.png',
  '_SlideTransitionEnd.png', '_SlideTransitionStart.png', '_TurnAround.png',
  '_WallClimb.png', '_WallClimbNoMovement.png', '_WallHang.png', '_WallSlide.png',
];

const ROSTER = [
  { id: 'c1', name: 'KNIGHT BLUE', load: (onlyIdle) => loadColourAnimations('Character Colour1/Outline/120x80_PNGSheets', COLOUR1_FILES, 12, onlyIdle), color: '#38bdf8', scale: 2.2, shadowW: 45 },
  { id: 'c2', name: 'KNIGHT RED',  load: (onlyIdle) => loadColourAnimations('Character Colour2/Outline/120x80_PNGSheets', COLOUR2_FILES, 12, onlyIdle), color: '#ef4444', scale: 2.2, shadowW: 45 },
];

// ── Game states ────────────────────────────────────────────────────────────

const GS = Object.freeze({
  TITLE:          'title',          // start screen with CLICK TO START
  MODE_SELECT:    'mode_select',    // VS CPU / Create / Join
  LOBBY_CREATE:   'lobby_create',   // host waiting for opponent
  LOBBY_JOIN:     'lobby_join',     // joiner entering code
  LOBBY_WAIT:     'lobby_wait',     // both connected, loading
  CINEMATIC_INTRO:'cinematic_intro',
  ROUND_INTRO:    'round_intro',
  FIGHTING:       'fighting',
  PAUSED:         'paused',
  ROUND_END:      'round_end',
  MATCH_END:      'match_end',
  OPPONENT_LEFT:  'opponent_left',
});

// ── Helpers ────────────────────────────────────────────────────────────────

function hideLoadingScreen() {
  const el = document.getElementById('loading-screen');
  if (el) el.classList.add('hidden');
}

function pushApart(p1, p2) {
  const minDist = (p1.hurtW + p2.hurtW) / 2 + 4;
  const dx      = p2.x - p1.x;
  const dist    = Math.abs(dx);
  if (dist < minDist) {
    const push = (minDist - dist) / 2;
    const dir  = dx >= 0 ? 1 : -1;
    p1.x -= dir * push;
    p2.x += dir * push;
    p1.x = Math.max(80, Math.min(1200, p1.x));
    p2.x = Math.max(80, Math.min(1200, p2.x));
  }
}

// ── Init ───────────────────────────────────────────────────────────────────

async function init() {
  const canvas  = document.getElementById('game-canvas');
  const engine  = new Engine(canvas, CANVAS_W, CANVAS_H);
  const input   = new Input();
  // MobileControls writes touch state directly into input._keys
  const mobileControls = new MobileControls(input._keys);
  const ui      = new UI();
  const combat  = new CombatSystem();
  const lobbyUI = new LobbyUI();
  const netplay = new NetplayClient();

  // ── Load background manifest ─────────────────────────────────────────────
  let bgManifest = {};
  try {
    bgManifest = await fetch('./bg-manifest.json').then(r => r.json());
  } catch (e) {
    console.error('[Main] Could not fetch bg-manifest.json', e);
  }
  const bgKeys = Object.keys(bgManifest);
  hideLoadingScreen();

  // ── Load characters ──────────────────────────────────────────────────────
  const c1 = ROSTER[0];
  const c2 = ROSTER[1];
  const [p1Anims, p2Anims] = await Promise.all([c1.load(false), c2.load(false)]);

  // ── Fighter instances ────────────────────────────────────────────────────
  let p1 = new Fighter({
    x: P1_START.x, y: P1_START.y, facing: P1_START.facing,
    animations: p1Anims, color: c1.color, isPlayer: true,
    displayScale: c1.scale, shadowW: c1.shadowW
  });
  let p2 = new Fighter({
    x: P2_START.x, y: P2_START.y, facing: P2_START.facing,
    animations: p2Anims, color: c2.color, isPlayer: false,
    displayScale: c2.scale, shadowW: c2.shadowW
  });

  let background   = new Background(bgManifest);
  let ai           = new AIController(p2, p1, 'hard');

  // ── Game state variables ─────────────────────────────────────────────────
  let gameState    = GS.TITLE;
  let stateTimer   = 0;
  let roundTimer   = ROUND_TIME;
  let roundWins    = [0, 0];
  let isFirstMatch = true;
  let selectedBgKey = 'bg_1';

  // Online multiplayer state
  let isOnline      = false;
  let localSlot     = 1;     // which slot we are (1=P1, 2=P2)
  let frameCount    = 0;     // deterministic frame counter
  let prevLocalMask = 0;     // for isPressed detection on remote side
  let prevRemoteMask= 0;
  let opponentJoined = false;
  let joinErrorMsg   = '';
  let joinTypedCode  = '';
  let rollbackSnapshots   = [];   // { frame, p1, p2, roundTimer, combos... }
  let localInputHistory   = [];   // localInputHistory[frame] = mask
  let remoteInputHistory  = [];   // remoteInputHistory[frame] = mask
  const MAX_SNAPSHOTS     = 128;

  // Combo tracking
  let p1Combo = 0, p1ComboTimer = 0;
  let p2Combo = 0, p2ComboTimer = 0;

  // ── Input: mode select click handling ────────────────────────────────────
  document._startClicked = false;
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (CANVAS_W / rect.width);
    const my = (e.clientY - rect.top)  * (CANVAS_H / rect.height);

    if (gameState === GS.TITLE) {
      document._startClicked = true;
      if (document.documentElement.requestFullscreen)
        document.documentElement.requestFullscreen().catch(() => {});
      return;
    }

    // Allow clicking through the cinematic intro to start the fight
    if (gameState === GS.CINEMATIC_INTRO) {
      document._startClicked = true;
      return;
    }

    if (gameState === GS.FIGHTING || gameState === GS.ROUND_INTRO) {
      // Pause button check (Top center below timer: x = center - 35 to center + 35, y = 60 to 130)
      if (mx >= CANVAS_W/2 - 35 && mx <= CANVAS_W/2 + 35 && my >= 60 && my <= 130) {
        gameState = GS.PAUSED;
        return;
      }
    }

    if (gameState === GS.PAUSED) {
      // Resume button check
      if (mx >= CANVAS_W/2 - 110 && mx <= CANVAS_W/2 + 110) {
        if (my >= 320 && my <= 370) {
          gameState = GS.FIGHTING;
          return;
        }
        // Exit button check
        if (my >= 390 && my <= 440) {
          roundWins = [0, 0];
          isFirstMatch = true;
          if (isOnline) netplay.disconnect();
          isOnline = false;
          gameState = GS.MODE_SELECT;
          return;
        }
      }
      return;
    }

    if (gameState === GS.MODE_SELECT) {
      const mode = lobbyUI.getHoveredMode(mx, my);
      if (!mode) return; // clicked outside buttons
      if (mode === 'cpu')    { isOnline = false; startFirstMatch(); }
      if (mode === 'create') { startCreateRoom(); }
      if (mode === 'join')   { gameState = GS.LOBBY_JOIN; joinTypedCode = ''; joinErrorMsg = ''; }
    }

    // MATCH_END — tap anywhere to play again (mobile has no keyboard)
    if (gameState === GS.MATCH_END) {
      roundWins = [0, 0];
      if (isOnline) { netplay.disconnect(); isOnline = false; gameState = GS.MODE_SELECT; }
      else { startFirstMatch(); }
      return;
    }

    // OPPONENT_LEFT — tap anywhere to return to menu
    if (gameState === GS.OPPONENT_LEFT) {
      netplay.disconnect();
      isOnline = false;
      gameState = GS.MODE_SELECT;
      return;
    }

    // LOBBY_JOIN — numpad click handler
    if (gameState === GS.LOBBY_JOIN) {
      const key = lobbyUI.getNumpadKey(mx, my);
      if (key !== null) {
        if (key === '⌫') {
          joinTypedCode = joinTypedCode.slice(0, -1);
        } else if (key === '✔JOIN') {
          if (joinTypedCode.length === 6) handleJoinRoom(joinTypedCode);
        } else if (key === '✔BACK') {
          gameState = GS.MODE_SELECT;
        } else if (joinTypedCode.length < 6) {
          joinTypedCode += key;
        }
        return;
      }
    }

    // LOBBY_CREATE — tap BACK button to cancel
    if (gameState === GS.LOBBY_CREATE) {
      if (lobbyUI.getCreateRoomBackHit(mx, my)) {
        netplay.disconnect();
        gameState = GS.MODE_SELECT;
        return;
      }
    }
  });

  canvas.addEventListener('touchstart', (e) => {
    if (gameState === GS.TITLE || gameState === GS.CINEMATIC_INTRO) {
      document._startClicked = true;
      return;
    }

    // On mobile, tap anywhere on MATCH_END screen to play again
    if (gameState === GS.MATCH_END) {
      roundWins = [0, 0];
      if (isOnline) { netplay.disconnect(); isOnline = false; gameState = GS.MODE_SELECT; }
      else { startFirstMatch(); }
      return;
    }

    // On mobile, tap anywhere on OPPONENT_LEFT to go back to menu
    if (gameState === GS.OPPONENT_LEFT) {
      netplay.disconnect();
      isOnline = false;
      gameState = GS.MODE_SELECT;
      return;
    }

    // On mobile, handle MODE_SELECT taps via canvas coordinates
    if (gameState === GS.MODE_SELECT) {
      const rect = canvas.getBoundingClientRect();
      const t = e.changedTouches[0];
      const mx = (t.clientX - rect.left) * (CANVAS_W / rect.width);
      const my = (t.clientY - rect.top)  * (CANVAS_H / rect.height);
      const mode = lobbyUI.getHoveredMode(mx, my);
      if (mode === 'cpu')    { isOnline = false; startFirstMatch(); }
      if (mode === 'create') { startCreateRoom(); }
      if (mode === 'join')   { gameState = GS.LOBBY_JOIN; joinTypedCode = ''; joinErrorMsg = ''; }
      return;
    }

    // Pause menu tap handling on mobile
    if (gameState === GS.PAUSED) {
      const rect = canvas.getBoundingClientRect();
      const t = e.changedTouches[0];
      const mx = (t.clientX - rect.left) * (CANVAS_W / rect.width);
      const my = (t.clientY - rect.top)  * (CANVAS_H / rect.height);
      if (mx >= CANVAS_W/2 - 110 && mx <= CANVAS_W/2 + 110) {
        if (my >= 320 && my <= 370) { gameState = GS.FIGHTING; return; }
        if (my >= 390 && my <= 440) {
          roundWins = [0, 0]; isFirstMatch = true;
          if (isOnline) netplay.disconnect();
          isOnline = false; gameState = GS.MODE_SELECT; return;
        }
      }
      return;
    }

    // LOBBY_JOIN — numpad touch handler
    if (gameState === GS.LOBBY_JOIN) {
      const rect = canvas.getBoundingClientRect();
      const t = e.changedTouches[0];
      const mx = (t.clientX - rect.left) * (CANVAS_W / rect.width);
      const my = (t.clientY - rect.top)  * (CANVAS_H / rect.height);
      const key = lobbyUI.getNumpadKey(mx, my);
      if (key === null) return;
      if (key === '⌫') {
        joinTypedCode = joinTypedCode.slice(0, -1);
      } else if (key === '✔JOIN') {
        if (joinTypedCode.length === 6) handleJoinRoom(joinTypedCode);
      } else if (key === '✔BACK') {
        gameState = GS.MODE_SELECT;
      } else if (joinTypedCode.length < 6) {
        joinTypedCode += key;
      }
      e.preventDefault();
      return;
    }

    // LOBBY_CREATE — tap BACK button to cancel
    if (gameState === GS.LOBBY_CREATE) {
      const rect = canvas.getBoundingClientRect();
      const t = e.changedTouches[0];
      const mx = (t.clientX - rect.left) * (CANVAS_W / rect.width);
      const my = (t.clientY - rect.top)  * (CANVAS_H / rect.height);
      if (lobbyUI.getCreateRoomBackHit(mx, my)) {
        netplay.disconnect();
        gameState = GS.MODE_SELECT;
        return;
      }
    }
  });


  // ── Input: keyboard ──────────────────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F1') { p1.debug = !p1.debug; p2.debug = !p2.debug; return; }

    if (e.code === 'Escape') {
      if (gameState === GS.LOBBY_CREATE || gameState === GS.LOBBY_JOIN) {
        netplay.disconnect();
        gameState = GS.MODE_SELECT;
      } else if (gameState === GS.FIGHTING || gameState === GS.ROUND_INTRO) {
        // Pause during game
        if (!isOnline) gameState = GS.PAUSED;
      } else if (gameState === GS.PAUSED) {
        // Unpause
        gameState = GS.FIGHTING;
      }
      return;
    }

    if (e.code === 'Space' && (gameState === GS.TITLE || gameState === GS.CINEMATIC_INTRO)) {
      document._startClicked = true;
      return;
    }

    if (gameState === GS.LOBBY_JOIN) {
      if (e.key === 'Backspace') {
        joinTypedCode = joinTypedCode.slice(0, -1);
      } else if (e.key === 'Enter' && joinTypedCode.length === 6) {
        handleJoinRoom(joinTypedCode);
      } else if (joinTypedCode.length < 6 && /^[A-Za-z0-9]$/.test(e.key)) {
        joinTypedCode += e.key.toUpperCase();
      }
      return;
    }

    if (gameState === GS.MATCH_END && e.code === 'Enter') {
      roundWins = [0, 0];
      if (isOnline) {
        netplay.disconnect();
        isOnline = false;
        gameState = GS.MODE_SELECT;
      } else {
        startFirstMatch();
      }
    }
    if (gameState === GS.OPPONENT_LEFT && e.code === 'Enter') {
      netplay.disconnect();
      isOnline = false;
      gameState = GS.MODE_SELECT;
    }
  });

  // ── Netplay callbacks ────────────────────────────────────────────────────
  netplay.onOpponentJoined = () => { opponentJoined = true; };
  netplay.onOpponentReady  = () => {};
  netplay.onStart = (slot) => {
    localSlot = slot;
    console.log(`[Netplay] Match started. I am Player ${slot}`);
    startOnlineMatch();
  };
  netplay.onOpponentLeft = () => {
    if (gameState === GS.FIGHTING || gameState === GS.ROUND_INTRO || gameState === GS.ROUND_END) {
      gameState = GS.OPPONENT_LEFT;
    }
  };
  netplay.onError = (msg) => {
    joinErrorMsg = msg;
    console.error('[Netplay Error]', msg);
  };
  netplay.onPing = (ms) => {};

  // ── Room management ──────────────────────────────────────────────────────
  async function startCreateRoom() {
    gameState = GS.LOBBY_CREATE;
    opponentJoined = false;
    try {
      await netplay.connect(WS_SERVER);
      await netplay.createRoom();
      netplay.onOpponentJoined = () => {
        opponentJoined = true;
        // Signal we are ready (assets already loaded)
        setTimeout(() => netplay.signalReady(), 500);
      };
    } catch (e) {
      joinErrorMsg = 'Could not connect to server.';
      gameState = GS.MODE_SELECT;
    }
  }

  async function handleJoinRoom(code) {
    joinErrorMsg = '';
    try {
      await netplay.connect(WS_SERVER);
      netplay.joinRoom(code);
      gameState = GS.LOBBY_WAIT;
      // Signal we are ready immediately
      setTimeout(() => netplay.signalReady(), 300);
    } catch (e) {
      joinErrorMsg = 'Could not connect to server.';
    }
  }

  // ── Match flow ─────────────────────────────────────────────────────────────
  async function startFirstMatch() {
    // VS CPU: skip cinematic intro — title screen already served that role
    isFirstMatch = false;
    await startRound();
  }

  async function startOnlineMatch() {
    isOnline = true;
    isFirstMatch = true;
    // Use the server-provided map seed for deterministic map selection
    await startRound();
  }

  async function startRound() {
    gameState = 'loading';
    selectedBgKey = bgKeys.length ? bgKeys[Math.floor(Math.random() * bgKeys.length)] : 'bg_1';

    // In online: both clients must pick the SAME map.
    // Host (P1) picks the map. A real implementation would sync this via server.
    // For now we seed with the same map always when online.
    if (isOnline) selectedBgKey = bgKeys[0] ?? 'bg_1';

    await background.load(selectedBgKey);

    p1.reset(P1_START.x, P1_START.y, P1_START.facing);
    p2.reset(P2_START.x, P2_START.y, P2_START.facing);
    p1.update(0, p2.x);
    p2.update(0, p1.x);

    roundTimer = ROUND_TIME;
    frameCount = 0;
    rollbackSnapshots  = [];
    localInputHistory  = [];
    remoteInputHistory = [];
    prevLocalMask  = 0;
    prevRemoteMask = 0;

    // Only show cinematic intro for online matches.
    // For VS CPU, title screen already served as the intro.
    if (isFirstMatch && isOnline) {
      gameState = GS.CINEMATIC_INTRO;
      stateTimer = 0;
      isFirstMatch = false;
    } else {
      gameState = GS.ROUND_INTRO;
      stateTimer = 0;
      ui.flashText(selectedBgKey.replace('bg_', 'STAGE '), ROUND_INTRO_DUR * 0.7, '#f8fafc');
      // Show controls bar briefly when fight starts
      const cb = document.getElementById('controls-bar');
      if (cb) {
        cb.style.display = 'flex';
        setTimeout(() => { cb.style.display = 'none'; }, 5000);
      }
    }
  }

  function endRound() {
    if (p1.health > p2.health)      roundWins[0]++;
    else if (p2.health > p1.health)  roundWins[1]++;
    if (roundWins[0] >= ROUNDS_TO_WIN || roundWins[1] >= ROUNDS_TO_WIN) {
      gameState = GS.MATCH_END;
    } else {
      gameState  = GS.ROUND_END;
      stateTimer = ROUND_END_DUR;
    }
  }

  // ── Snapshot helpers (for rollback) ──────────────────────────────────────
  function saveFrameSnapshot(frame) {
    rollbackSnapshots[frame % MAX_SNAPSHOTS] = {
      frame,
      p1:          p1.saveSnapshot(),
      p2:          p2.saveSnapshot(),
      roundTimer,
      p1Combo, p1ComboTimer,
      p2Combo, p2ComboTimer,
    };
  }

  function restoreFrameSnapshot(frame) {
    const snap = rollbackSnapshots[frame % MAX_SNAPSHOTS];
    if (!snap || snap.frame !== frame) return false;
    p1.restoreSnapshot(snap.p1);
    p2.restoreSnapshot(snap.p2);
    roundTimer    = snap.roundTimer;
    p1Combo       = snap.p1Combo;
    p1ComboTimer  = snap.p1ComboTimer;
    p2Combo       = snap.p2Combo;
    p2ComboTimer  = snap.p2ComboTimer;
    return true;
  }

  // ── Fixed timestep for online determinism ────────────────────────────────
  const FIXED_DT   = 1 / 60;
  let   accumulator = 0;

  // ── Main loop ─────────────────────────────────────────────────────────────
  engine.start((dt) => {
    ui.update(dt);
    lobbyUI.update(dt);

    const ctx = engine.ctx;

    // Always flush keyboard state every frame
    input.update();

    // Sync mobile overlay visibility to current game state
    mobileControls.setState(gameState);

    // ── Title screen ────────────────────────────────────────────────────────
    if (gameState === GS.TITLE) {
      ui.draw(ctx, p1, p2, roundTimer, gameState, roundWins, { stateTimer, roundIntroDur: ROUND_INTRO_DUR });
      if (document._startClicked) {
        document._startClicked = false;
        gameState = GS.MODE_SELECT;
      }
      return;
    }

    // ── Mode select ─────────────────────────────────────────────────────────
    if (gameState === GS.MODE_SELECT) {
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      lobbyUI.drawModeSelect(ctx);
      return;
    }

    // ── Paused ──────────────────────────────────────────────────────────────
    if (gameState === GS.PAUSED) {
      // Just render the scene without running physics
      ctx.save();
      ctx.translate(ui.screenShakeX, ui.screenShakeY);
      background.draw(ctx, CANVAS_W, CANVAS_H);
      if (p1.x < p2.x) { p1.draw(ctx); p2.draw(ctx); } else { p2.draw(ctx); p1.draw(ctx); }
      ctx.restore();
      ui.draw(ctx, p1, p2, roundTimer, gameState, roundWins, { stateTimer, roundIntroDur: ROUND_INTRO_DUR });
      return;
    }

    // ── Online lobby screens ─────────────────────────────────────────────────
    if (gameState === GS.LOBBY_CREATE) {
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      lobbyUI.drawCreateRoom(ctx, netplay.roomId, opponentJoined);
      return;
    }

    if (gameState === GS.LOBBY_JOIN) {
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      lobbyUI.drawJoinRoom(ctx, joinTypedCode, joinErrorMsg);
      return;
    }

    if (gameState === GS.LOBBY_WAIT) {
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
      lobbyUI.drawConnected(ctx, netplay.ping, 'Waiting for match to start...');
      return;
    }

    // ── Opponent left ────────────────────────────────────────────────────────
    if (gameState === GS.OPPONENT_LEFT) {
      background.draw(ctx, CANVAS_W, CANVAS_H);
      if (p1.x < p2.x) { p1.draw(ctx); p2.draw(ctx); } else { p2.draw(ctx); p1.draw(ctx); }
      lobbyUI.drawOpponentLeft(ctx);
      return;
    }

    // ── Active game: run fixed timestep only during online play ─────────────
    if (isOnline && gameState === GS.FIGHTING) {
      accumulator += Math.min(dt, 0.1);
      while (accumulator >= FIXED_DT) {
        accumulator -= FIXED_DT;
        runOnlineFrame(FIXED_DT);
      }
    } else {
      runOfflineFrame(dt);
    }

    // ── Render ───────────────────────────────────────────────────────────────
    ctx.save();
    ctx.translate(ui.screenShakeX, ui.screenShakeY);
    background.draw(ctx, CANVAS_W, CANVAS_H);

    if (gameState !== GS.CINEMATIC_INTRO) {
      if (p1.x < p2.x) { p1.draw(ctx); p2.draw(ctx); }
      else              { p2.draw(ctx); p1.draw(ctx); }
    }
    ctx.restore();

    ui.draw(ctx, p1, p2, roundTimer, gameState, roundWins, {
      stateTimer,
      roundIntroDur: ROUND_INTRO_DUR,
    });

    // Show ping badge during online match
    if (isOnline && gameState === GS.FIGHTING) {
      lobbyUI.drawPingBadge(ctx, netplay.ping);
    }
  });

  // ── Offline (VS CPU) frame ────────────────────────────────────────────────
  function runOfflineFrame(dt) {
    switch (gameState) {
      case GS.CINEMATIC_INTRO:
        stateTimer += dt;
        if (document._startClicked) {
          document._startClicked = false;
          gameState = GS.ROUND_INTRO;
          stateTimer = 0;
          ui.flashText(selectedBgKey.replace('bg_', 'STAGE '), ROUND_INTRO_DUR * 0.7, '#f8fafc');
          // Only show PC keyboard cheatsheet on non-touch devices
          if (!isTouchDevice) {
            const cb = document.getElementById('controls-bar');
            if (cb) {
              cb.className = 'cb-show';
              setTimeout(() => {
                cb.className = 'cb-fade';
                setTimeout(() => { cb.className = ''; }, 700);
              }, 5000);
            }
          }
        }
        break;

      case GS.ROUND_INTRO:
        stateTimer += dt;
        p1.update(dt); p2.update(dt);
        if (stateTimer >= ROUND_INTRO_DUR) {
          ui.flashText('FIGHT!', 0.9, '#fbbf24');
          gameState = GS.FIGHTING;
        }
        break;

      case GS.FIGHTING: {
        p1.handleInput(input);
        ai.update(dt);
        if (p1.onGround && p1.canAct()) p1.facing = p2.x > p1.x ? 1 : -1;
        if (p2.onGround && p2.canAct()) p2.facing = p1.x > p2.x ? 1 : -1;
        p1.update(dt, p2.x);
        p2.update(dt, p1.x);
        pushApart(p1, p2);
        background.update(p1.x, p2.x, CANVAS_W);
        if (p1ComboTimer > 0) { p1ComboTimer -= dt; if (p1ComboTimer <= 0) p1Combo = 0; }
        if (p2ComboTimer > 0) { p2ComboTimer -= dt; if (p2ComboTimer <= 0) p2Combo = 0; }
        combat.check(p1, p2, (hit) => {
          p1Combo++; p1ComboTimer = 2.0; p2Combo = 0;
          const heavy = hit.damage >= 20;
          ui.triggerHit((p1.getHitbox()?.x ?? p1.x) + 30, p2.y - 90, heavy, p1Combo);
          if (heavy) { p1.triggerShake(0.15); p2.triggerShake(0.22); }
        });
        combat.check(p2, p1, (hit) => {
          p2Combo++; p2ComboTimer = 2.0; p1Combo = 0;
          const heavy = hit.damage >= 20;
          ui.triggerHit((p2.getHitbox()?.x ?? p2.x) + 30, p1.y - 90, heavy, p2Combo);
          if (heavy) { p2.triggerShake(0.15); p1.triggerShake(0.22); }
        });
        roundTimer -= dt;
        const d1 = p1.health <= 0, d2 = p2.health <= 0;
        if (d1 || d2) {
          if (d2 && !d1) ui.flashText('K.O.!', 2.0, c1.color);
          else if (d1)   ui.flashText('K.O.!', 2.0, c2.color);
          engine.setSlowMo(0.25, 0.6);
          endRound();
        } else if (roundTimer <= 0) {
          ui.flashText('TIME!', 1.8, '#f8fafc');
          endRound();
        }
        break;
      }

      case GS.ROUND_END:
        p1.update(dt); p2.update(dt);
        stateTimer -= dt;
        if (stateTimer <= 0) startRound();
        break;

      case GS.MATCH_END:
        p1.update(dt); p2.update(dt);
        break;
    }
  }

  // ── Online (1v1) frame — Full Rollback Netcode ────────────────────────────
  function runOnlineFrame(dt) {
    // Non-fighting states handled by offline logic
    if (gameState !== GS.FIGHTING) { runOfflineFrame(dt); return; }

    // Tell netplay what frame we're on (for prediction accuracy)
    netplay.setCurrentFrame(frameCount);

    // 1. Save snapshot BEFORE inputs are applied (needed for rollback)
    saveFrameSnapshot(frameCount);

    // 2. Determine which fighter belongs to local vs remote player
    const localFighter  = localSlot === 1 ? p1 : p2;
    const remoteFighter = localSlot === 1 ? p2 : p1;

    // 3. Read local input, store in history, send to server
    const localMask = input.serialize();
    localInputHistory[frameCount]  = localMask;
    netplay.storeAndSendLocalInput(frameCount, localMask);

    // 4. Get delayable local input and predicted/confirmed remote input
    const myInputMask     = netplay.getLocalInput(frameCount);
    const remoteInputMask = netplay.getRemoteInput(frameCount);
    remoteInputHistory[frameCount] = remoteInputMask;

    // 5. Check if the server sent us a corrected remote input that mispredicts
    const rb = netplay.consumeRollback();
    if (rb) {
      const rbFrame = Math.max(0, rb.toFrame);
      const canRollback = rbFrame <= frameCount && rbFrame >= frameCount - MAX_SNAPSHOTS;

      if (canRollback && restoreFrameSnapshot(rbFrame)) {
        console.log(`[Rollback] frame=${frameCount} → restoring to frame ${rbFrame}, re-simulating ${frameCount - rbFrame} frames`);

        // Re-simulate every frame from rbFrame up to (but not including) current
        for (let f = rbFrame; f < frameCount; f++) {
          const lm = localInputHistory[f]  ?? 0;
          const rm = remoteInputHistory[f] ?? 0;
          const lPrev = localInputHistory[f - 1]  ?? 0;
          const rPrev = remoteInputHistory[f - 1] ?? 0;

          const lInput = Input.deserialize(lm, lPrev);
          const rInput = Input.deserialize(rm, rPrev);

          localFighter.handleInput(lInput);
          remoteFighter.applyRemoteInput(rInput);
          if (p1.onGround && p1.canAct()) p1.facing = p2.x > p1.x ? 1 : -1;
          if (p2.onGround && p2.canAct()) p2.facing = p1.x > p2.x ? 1 : -1;
          p1.update(FIXED_DT, p2.x);
          p2.update(FIXED_DT, p1.x);
          pushApart(p1, p2);
          if (p1ComboTimer > 0) { p1ComboTimer -= FIXED_DT; if (p1ComboTimer <= 0) p1Combo = 0; }
          if (p2ComboTimer > 0) { p2ComboTimer -= FIXED_DT; if (p2ComboTimer <= 0) p2Combo = 0; }
          combat.check(p1, p2, () => {});
          combat.check(p2, p1, () => {});
          roundTimer -= FIXED_DT;
        }

        // Update remote history with the now-confirmed inputs
        remoteInputHistory[frameCount] = netplay.getRemoteInput(frameCount);
      }
    }

    // 6. Apply this frame's inputs
    const myInput     = Input.deserialize(myInputMask,     prevLocalMask);
    const remoteInput = Input.deserialize(remoteInputMask, prevRemoteMask);
    prevLocalMask  = myInputMask;
    prevRemoteMask = remoteInputMask;

    localFighter.handleInput(myInput);
    remoteFighter.applyRemoteInput(remoteInput);

    // 7. Physics
    if (p1.onGround && p1.canAct()) p1.facing = p2.x > p1.x ? 1 : -1;
    if (p2.onGround && p2.canAct()) p2.facing = p1.x > p2.x ? 1 : -1;
    p1.update(dt, p2.x);
    p2.update(dt, p1.x);
    pushApart(p1, p2);
    background.update(p1.x, p2.x, CANVAS_W);

    // 8. Combo timers
    if (p1ComboTimer > 0) { p1ComboTimer -= dt; if (p1ComboTimer <= 0) p1Combo = 0; }
    if (p2ComboTimer > 0) { p2ComboTimer -= dt; if (p2ComboTimer <= 0) p2Combo = 0; }

    // 9. Combat
    combat.check(p1, p2, (hit) => {
      p1Combo++; p1ComboTimer = 2.0; p2Combo = 0;
      const heavy = hit.damage >= 20;
      ui.triggerHit((p1.getHitbox()?.x ?? p1.x) + 30, p2.y - 90, heavy, p1Combo);
      if (heavy) { p1.triggerShake(0.15); p2.triggerShake(0.22); }
    });
    combat.check(p2, p1, (hit) => {
      p2Combo++; p2ComboTimer = 2.0; p1Combo = 0;
      const heavy = hit.damage >= 20;
      ui.triggerHit((p2.getHitbox()?.x ?? p2.x) + 30, p1.y - 90, heavy, p2Combo);
      if (heavy) { p2.triggerShake(0.15); p1.triggerShake(0.22); }
    });

    // 10. Round end
    roundTimer -= dt;
    const d1 = p1.health <= 0, d2 = p2.health <= 0;
    if (d1 || d2) {
      if (d2 && !d1) ui.flashText('K.O.!', 2.0, c1.color);
      else if (d1)   ui.flashText('K.O.!', 2.0, c2.color);
      engine.setSlowMo(0.25, 0.6);
      endRound();
    } else if (roundTimer <= 0) {
      ui.flashText('TIME!', 1.8, '#f8fafc');
      endRound();
    }

    frameCount++;
  }

  // ── Start title ────────────────────────────────────────────────────────────
  // Pre-load a background for title screen visuals
  await background.load(bgKeys[0] ?? 'bg_1');
  gameState = GS.TITLE;
}

init().catch((err) => {
  console.error('[Main] Fatal init error:', err);
});
