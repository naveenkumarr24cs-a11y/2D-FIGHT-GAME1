/**
 * ui.js – HUD, health bars, round timer, KO/win screens, bg-select screen.
 *
 * All drawing is done on the main canvas (ctx). Canvas is assumed to be
 * 1280×720 (CANVAS_W × CANVAS_H) with top-left origin.
 */

const CANVAS_W = 1280;
const CANVAS_H = 720;

// ── Fonts (require Orbitron/Rajdhani from Google Fonts, fall back to Arial) ──
const FONT_TITLE  = "900 56px 'Orbitron', monospace";
const FONT_HUD    = "700 16px 'Rajdhani', Arial";
const FONT_TIMER  = "700 30px 'Orbitron', monospace";
const FONT_NAME   = "600 15px 'Rajdhani', Arial";
const FONT_ROUND  = "900 72px 'Orbitron', monospace";
const FONT_FIGHT  = "900 48px 'Orbitron', monospace";
const FONT_SMALL  = "500 18px 'Rajdhani', Arial";

// Colour palette
const P1_COLOR    = '#38bdf8'; // sky-blue
const P2_COLOR    = '#f87171'; // red
const HP_GREEN    = '#22c55e';
const HP_YELLOW   = '#eab308';
const HP_RED      = '#ef4444';
const GOLD        = '#fbbf24';
const WHITE       = '#f1f5f9';
const DIM         = 'rgba(0,0,0,0.65)';

// Health bar geometry
const BAR_W  = 468;
const BAR_H  = 26;
const BAR_Y  = 28;
const P1_BAR_X = 28;               // left edge
const P2_BAR_X = CANVAS_W - 28 - BAR_W; // left edge of P2 bar

// Screen-flash particle effect
class HitParticle {
  constructor(x, y, heavy) {
    this.x     = x;
    this.y     = y;
    this.r     = heavy ? 28 : 16;
    this.maxR  = heavy ? 60 : 36;
    this.life  = heavy ? 0.28 : 0.18;
    this.t     = 0;
    this.color = heavy ? '#fbbf24' : '#f8fafc';
  }

  update(dt) { this.t += dt; }
  get done()  { return this.t >= this.life; }

  draw(ctx) {
    const frac  = this.t / this.life;
    const r     = this.r + (this.maxR - this.r) * frac;
    const alpha = 1 - frac;
    ctx.save();
    ctx.globalAlpha = alpha * 0.75;
    ctx.strokeStyle = this.color;
    ctx.lineWidth   = 3;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

export class UI {
  constructor() {
    this.particles      = [];
    this.screenShakeX   = 0;
    this.screenShakeY   = 0;
    this._shakeTimer    = 0;

    // Text flash for KO, ROUND etc.
    this._flashText     = '';
    this._flashTimer    = 0;
    this._flashDuration = 0;
    this._flashColor    = GOLD;
  }

  // ── External triggers ─────────────────────────────────────────────────────

  triggerHit(x, y, heavy = false) {
    this.particles.push(new HitParticle(x, y, heavy));
    if (heavy) this.triggerScreenShake(0.28);
  }

  triggerScreenShake(duration = 0.25) {
    this._shakeTimer = Math.max(this._shakeTimer, duration);
  }

  flashText(text, duration = 1.8, color = GOLD) {
    this._flashText     = text;
    this._flashTimer    = duration;
    this._flashDuration = duration;
    this._flashColor    = color;
  }

  // ── Update ────────────────────────────────────────────────────────────────

  update(dt) {
    // Screen shake
    if (this._shakeTimer > 0) {
      this._shakeTimer -= dt;
      this.screenShakeX = (Math.random() - 0.5) * 14;
      this.screenShakeY = (Math.random() - 0.5) * 14;
    } else {
      this.screenShakeX = 0;
      this.screenShakeY = 0;
    }

    // Particles
    this.particles.forEach(p => p.update(dt));
    this.particles = this.particles.filter(p => !p.done);

    // Flash text timer
    if (this._flashTimer > 0) this._flashTimer -= dt;
  }

  // ── Draw ──────────────────────────────────────────────────────────────────

  /**
   * Draw entire HUD + overlays.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Entity} p1
   * @param {Entity} p2
   * @param {number} roundTimer
   * @param {string} gameState   The current GameState enum value
   * @param {number[]} roundWins  [p1wins, p2wins]
   * @param {{ selectedKey:string, keys:string[], difficulty:string }} extras
   */
  draw(ctx, p1, p2, roundTimer, gameState, roundWins, extras = {}) {
    // Hit particles (drawn in world space, before UI overlay)
    this.particles.forEach(p => p.draw(ctx));

    if (gameState === 'select_bg') {
      this._drawBgSelect(ctx, extras.selectedKey, extras.keys, extras.difficulty);
      return;
    }

    // HUD always visible during non-select states
    this._drawHealthBar(ctx, p1, P1_BAR_X, BAR_Y, true,  'PLAYER 1', P1_COLOR, roundWins[0]);
    this._drawHealthBar(ctx, p2, P2_BAR_X, BAR_Y, false, '  CPU  ',  P2_COLOR, roundWins[1]);
    this._drawTimer(ctx, roundTimer, CANVAS_W / 2, BAR_Y);
    this._drawDifficultyBadge(ctx, extras.difficulty);

    // Overlays
    if (gameState === 'round_intro') this._drawRoundIntro(ctx, roundWins);
    if (gameState === 'round_end')   this._drawRoundEnd(ctx, p1, p2);
    if (gameState === 'match_end')   this._drawMatchEnd(ctx, roundWins);

    // Flash text (KO, FIGHT!, etc.)
    if (this._flashTimer > 0) {
      const frac  = this._flashTimer / this._flashDuration;
      const scale = 1 + (1 - frac) * 0.15;
      const alpha = Math.min(1, frac * 3);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font        = FONT_FIGHT;
      ctx.textAlign   = 'center';
      ctx.fillStyle   = this._flashColor;
      ctx.shadowColor = this._flashColor;
      ctx.shadowBlur  = 30;
      ctx.translate(CANVAS_W / 2, CANVAS_H / 2 - 30);
      ctx.scale(scale, scale);
      ctx.fillText(this._flashText, 0, 0);
      ctx.restore();
    }
  }

  // ── Health bar ────────────────────────────────────────────────────────────

  _drawHealthBar(ctx, fighter, barX, barY, isLeft, label, accentColor, wins) {
    const hp     = Math.max(0, fighter.health / fighter.maxHealth);
    const fillW  = BAR_W * hp;
    const fillX  = isLeft ? barX : barX + BAR_W - fillW;

    // Background track
    ctx.fillStyle = 'rgba(10,10,20,0.85)';
    _roundRect(ctx, barX - 2, barY - 2, BAR_W + 4, BAR_H + 4, 4);
    ctx.fill();

    // Subtle "empty" bar
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(barX, barY, BAR_W, BAR_H);

    // HP fill
    const hpColor = hp > 0.5 ? HP_GREEN : hp > 0.25 ? HP_YELLOW : HP_RED;
    ctx.fillStyle = hpColor;
    ctx.fillRect(fillX, barY, fillW, BAR_H);

    // Glossy highlight
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(fillX, barY, fillW, BAR_H * 0.4);

    // Border
    ctx.strokeStyle = accentColor + '88';
    ctx.lineWidth   = 1.5;
    _roundRect(ctx, barX - 2, barY - 2, BAR_W + 4, BAR_H + 4, 4);
    ctx.stroke();

    // Name label
    ctx.font      = FONT_NAME;
    ctx.fillStyle = accentColor;
    ctx.textAlign = isLeft ? 'left' : 'right';
    ctx.fillText(label, isLeft ? barX : barX + BAR_W, barY - 6);

    // Numeric HP
    ctx.font      = "600 12px 'Rajdhani', Arial";
    ctx.fillStyle = WHITE;
    ctx.textAlign = isLeft ? 'right' : 'left';
    ctx.fillText(Math.ceil(fighter.health), isLeft ? barX + BAR_W - 4 : barX + 4, barY + BAR_H - 5);

    // Round wins pips
    for (let i = 0; i < 2; i++) {
      const pipX = isLeft
        ? barX + BAR_W - 16 - i * 18
        : barX + 6 + i * 18;
      ctx.beginPath();
      ctx.arc(pipX, barY - 12, 5, 0, Math.PI * 2);
      ctx.fillStyle = i < wins ? GOLD : 'rgba(255,255,255,0.12)';
      ctx.fill();
    }
  }

  // ── Timer ─────────────────────────────────────────────────────────────────

  _drawTimer(ctx, t, cx, y) {
    const sec = Math.ceil(Math.max(0, t));
    ctx.fillStyle = 'rgba(10,10,20,0.85)';
    _roundRect(ctx, cx - 34, y - 2, 68, BAR_H + 4, 4);
    ctx.fill();

    ctx.strokeStyle = sec <= 9 ? HP_RED + 'aa' : 'rgba(255,255,255,0.12)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    ctx.font      = FONT_TIMER;
    ctx.fillStyle = sec <= 9 ? HP_RED : WHITE;
    ctx.textAlign = 'center';
    ctx.fillText(sec.toString().padStart(2, '0'), cx, y + BAR_H - 4);

    if (sec <= 9) {
      ctx.shadowColor = HP_RED;
      ctx.shadowBlur  = 16;
      ctx.fillText(sec.toString().padStart(2, '0'), cx, y + BAR_H - 4);
      ctx.shadowBlur  = 0;
    }
  }

  // ── Difficulty badge ──────────────────────────────────────────────────────

  _drawDifficultyBadge(ctx, difficulty = 'medium') {
    const colors = { easy: '#86efac', medium: '#fbbf24', hard: '#f87171' };
    const col    = colors[difficulty] ?? '#fbbf24';
    ctx.font      = "600 11px 'Rajdhani', Arial";
    ctx.fillStyle = col + 'cc';
    ctx.textAlign = 'center';
    ctx.fillText(`[M] ${(difficulty ?? '').toUpperCase()}`, CANVAS_W / 2, BAR_Y + BAR_H + 14);
  }

  // ── Round intro ───────────────────────────────────────────────────────────

  _drawRoundIntro(ctx, roundWins) {
    const round = roundWins[0] + roundWins[1] + 1;
    ctx.fillStyle = DIM;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.save();
    ctx.font        = FONT_ROUND;
    ctx.textAlign   = 'center';
    ctx.fillStyle   = WHITE;
    ctx.shadowColor = P1_COLOR;
    ctx.shadowBlur  = 40;
    ctx.fillText(`ROUND  ${round}`, CANVAS_W / 2, CANVAS_H / 2 - 20);
    ctx.restore();
  }

  // ── Round end ─────────────────────────────────────────────────────────────

  _drawRoundEnd(ctx, p1, p2) {
    ctx.fillStyle = 'rgba(0,0,0,0.58)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    let text, color;
    if (p1.health <= 0 && p2.health > 0) {
      text  = 'CPU WINS!';     color = P2_COLOR;
    } else if (p2.health <= 0 && p1.health > 0) {
      text  = 'PLAYER 1 WINS!'; color = P1_COLOR;
    } else {
      text  = 'DRAW!';         color = GOLD;
    }

    ctx.save();
    ctx.font        = FONT_ROUND;
    ctx.textAlign   = 'center';
    ctx.fillStyle   = color;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 50;
    ctx.fillText(text, CANVAS_W / 2, CANVAS_H / 2 + 10);
    ctx.restore();
  }

  // ── Match end ─────────────────────────────────────────────────────────────

  _drawMatchEnd(ctx, roundWins) {
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const p1Won  = roundWins[0] >= 2;
    const winner = p1Won ? 'PLAYER 1' : 'CPU';
    const color  = p1Won ? P1_COLOR : P2_COLOR;

    ctx.save();
    ctx.font        = FONT_TITLE;
    ctx.textAlign   = 'center';
    ctx.fillStyle   = color;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 60;
    ctx.fillText(winner, CANVAS_W / 2, CANVAS_H / 2 - 40);

    ctx.shadowBlur  = 20;
    ctx.font        = FONT_FIGHT;
    ctx.fillStyle   = GOLD;
    ctx.shadowColor = GOLD;
    ctx.fillText('WINS THE MATCH!', CANVAS_W / 2, CANVAS_H / 2 + 30);
    ctx.restore();

    ctx.font      = FONT_SMALL;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.textAlign = 'center';
    ctx.fillText('Press  ENTER  to play again', CANVAS_W / 2, CANVAS_H / 2 + 110);
  }

  // ── Background select screen ──────────────────────────────────────────────

  _drawBgSelect(ctx, selectedKey, keys = [], difficulty = 'medium') {
    // Deep gradient backdrop
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    grad.addColorStop(0, '#06060f');
    grad.addColorStop(1, '#0f0f1e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Title
    ctx.save();
    ctx.font        = FONT_FIGHT;
    ctx.textAlign   = 'center';
    ctx.fillStyle   = WHITE;
    ctx.shadowColor = P1_COLOR;
    ctx.shadowBlur  = 30;
    ctx.fillText('SELECT  STAGE', CANVAS_W / 2, 70);
    ctx.restore();

    // Grid 5×3 of stage cards
    const cols = 5, rows = 3;
    const CW = 190, CH = 120, GAP = 14;
    const totalW = cols * CW + (cols - 1) * GAP;
    const totalH = rows * CH + (rows - 1) * GAP;
    const startX = (CANVAS_W - totalW) / 2;
    const startY = 110;

    keys.forEach((key, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const bx  = startX + col * (CW + GAP);
      const by  = startY + row * (CH + GAP);

      const isSelected = key === selectedKey;

      // Card background
      ctx.fillStyle = isSelected
        ? 'rgba(56,189,248,0.18)'
        : 'rgba(255,255,255,0.04)';
      _roundRect(ctx, bx, by, CW, CH, 6);
      ctx.fill();

      // Border
      ctx.strokeStyle = isSelected ? P1_COLOR : 'rgba(255,255,255,0.10)';
      ctx.lineWidth   = isSelected ? 2 : 1;
      ctx.stroke();

      // Glow for selected
      if (isSelected) {
        ctx.save();
        ctx.shadowColor = P1_COLOR;
        ctx.shadowBlur  = 24;
        ctx.strokeStyle = P1_COLOR;
        ctx.stroke();
        ctx.restore();
      }

      // Stage label
      const num = key.replace('bg_', 'Stage ');
      ctx.font      = isSelected
        ? "700 20px 'Rajdhani', Arial"
        : "600 17px 'Rajdhani', Arial";
      ctx.fillStyle = isSelected ? P1_COLOR : 'rgba(255,255,255,0.55)';
      ctx.textAlign = 'center';
      ctx.fillText(num, bx + CW / 2, by + CH / 2 + 7);
    });

    // Difficulty selector
    const diffY  = startY + totalH + 44;
    const levels = ['easy', 'medium', 'hard'];
    const dColors = { easy: '#86efac', medium: '#fbbf24', hard: '#f87171' };

    ctx.font      = "600 14px 'Rajdhani', Arial";
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.textAlign = 'center';
    ctx.fillText('[M] DIFFICULTY:', CANVAS_W / 2, diffY - 10);

    levels.forEach((lvl, i) => {
      const bx2 = CANVAS_W / 2 - 120 + i * 120;
      const by2 = diffY + 4;
      const sel  = lvl === difficulty;
      ctx.fillStyle = sel ? dColors[lvl] + '33' : 'rgba(255,255,255,0.04)';
      _roundRect(ctx, bx2 - 50, by2, 100, 32, 4);
      ctx.fill();
      ctx.strokeStyle = sel ? dColors[lvl] : 'rgba(255,255,255,0.1)';
      ctx.lineWidth   = sel ? 1.5 : 1;
      ctx.stroke();

      ctx.font      = "700 14px 'Rajdhani', Arial";
      ctx.fillStyle = sel ? dColors[lvl] : 'rgba(255,255,255,0.4)';
      ctx.textAlign = 'center';
      ctx.fillText(lvl.toUpperCase(), bx2, by2 + 22);
    });

    // Hint
    ctx.font      = "500 14px 'Rajdhani', Arial";
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.textAlign = 'center';
    ctx.fillText('←→↑↓  navigate  •  ENTER  confirm', CANVAS_W / 2, CANVAS_H - 26);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Canvas rounded-rectangle path helper (works in all browsers). */
function _roundRect(ctx, x, y, w, h, r) {
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
