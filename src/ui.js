/**
 * ui.js – HUD, health bars, round timer, KO/win screens, character select screen.
 */

const CANVAS_W = 1280;
const CANVAS_H = 720;

const FONT_TITLE  = "900 56px 'Orbitron', monospace";
const FONT_HUD    = "700 16px 'Rajdhani', Arial";
const FONT_TIMER  = "700 30px 'Orbitron', monospace";
const FONT_NAME   = "600 15px 'Rajdhani', Arial";
const FONT_ROUND  = "900 72px 'Orbitron', monospace";
const FONT_FIGHT  = "900 48px 'Orbitron', monospace";
const FONT_SMALL  = "500 18px 'Rajdhani', Arial";

const P1_COLOR    = '#f0a500'; // Warm Amber
const P2_COLOR    = '#e8570a'; // Orange Red
const HP_GREEN    = '#7ec850'; // Leaf Green
const HP_YELLOW   = '#f0a500'; // Amber
const HP_RED      = '#dc2626'; // Crimson
const GOLD        = '#f0a500';
const WHITE       = '#f5e6c8'; // Cream white
const DIM         = 'rgba(0,0,0,0.65)';

const BAR_W  = 468;
const BAR_H  = 26;
const BAR_Y  = 28;
const P1_BAR_X = 28;
const P2_BAR_X = CANVAS_W - 28 - BAR_W;

class HitParticle {
  constructor(x, y, heavy, combo = 1) {
    this.x = x + (Math.random() - 0.5) * 40;
    this.y = y;
    this.heavy = heavy;
    this.combo = combo;
    this.life = 1.2; 
    this.t = 0;
  }
  update(dt) { this.t += dt; this.y -= dt * 60; }
  get done() { return this.t >= this.life; }
  draw(ctx) {
    const frac = this.t / this.life;
    const alpha = 1 - Math.pow(frac, 3);
    
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.textAlign = 'center';
    
    if (this.combo > 1) {
       const scale = 1 + Math.sin(this.t * 15) * 0.15;
       ctx.font = `900 ${28 + Math.min(this.combo * 2, 20)}px 'Orbitron', monospace`;
       const color = this.combo > 4 ? '#e8570a' : this.combo > 2 ? '#f0a500' : '#7ec850';
       
       ctx.shadowColor = color;
       ctx.shadowBlur = 6;
       ctx.fillStyle = WHITE;
       
       ctx.translate(this.x, this.y);
       ctx.scale(scale, scale);
       ctx.fillText(`${this.combo}x COMBO!`, 0, 0);
    } else if (this.heavy) {
       ctx.font = "900 24px 'Orbitron', monospace";
       ctx.shadowColor = '#000';
       ctx.shadowBlur = 0;
       ctx.shadowOffsetX = 3;
       ctx.shadowOffsetY = 3;
       ctx.fillStyle = WHITE;
       ctx.fillText("HEAVY!", this.x, this.y);
    }
    ctx.restore();
  }
}

export class UI {
  constructor() {
    this.particles      = [];
    this.screenShakeX   = 0;
    this.screenShakeY   = 0;
    this._shakeTimer    = 0;

    this._flashText     = '';
    this._flashTimer    = 0;
    this._flashDuration = 0;
    this._flashColor    = GOLD;

    this.trailP1 = 1.0;
    this.trailP2 = 1.0;

    // UI Start Screen Image
    this.uiBgStart = new Image();
    this.uiBgStart.src = 'background/bg_15/use15.png';
  }

  triggerHit(x, y, heavy = false, combo = 1) {
    this.particles.push(new HitParticle(x, y, heavy, combo));
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

  update(dt) {
    if (this._shakeTimer > 0) {
      this._shakeTimer -= dt;
      this.screenShakeX = (Math.random() - 0.5) * 14;
      this.screenShakeY = (Math.random() - 0.5) * 14;
    } else {
      this.screenShakeX = 0;
      this.screenShakeY = 0;
    }
    this.particles.forEach(p => p.update(dt));
    this.particles = this.particles.filter(p => !p.done);
    if (this._flashTimer > 0) this._flashTimer -= dt;
  }

  draw(ctx, p1, p2, roundTimer, gameState, roundWins, extras = {}) {
    this.particles.forEach(p => p.draw(ctx));

    const hp1 = Math.max(0, p1.health / p1.maxHealth);
    const hp2 = Math.max(0, p2.health / p2.maxHealth);
    
    // Decay health trails
    if (this.trailP1 > hp1) this.trailP1 -= 0.15 * (1/60); // approx dt
    else this.trailP1 = hp1;
    if (this.trailP2 > hp2) this.trailP2 -= 0.15 * (1/60);
    else this.trailP2 = hp2;

    if (gameState === 'cinematic_intro' || gameState === 'title') {
      this._drawCinematicIntro(ctx, extras.stateTimer ?? 0, p1, p2);
      return; // Skip normal UI during title/cinematic intro
    }

    const p2Label = extras.isOnline ? 'PLAYER 2' : '  CPU  ';
    this._drawHealthBar(ctx, hp1, this.trailP1, P1_BAR_X, BAR_Y, true,  'PLAYER 1', P1_COLOR, roundWins[0], p1.health);
    this._drawHealthBar(ctx, hp2, this.trailP2, P2_BAR_X, BAR_Y, false, p2Label,    P2_COLOR, roundWins[1], p2.health);
    this._drawTimer(ctx, roundTimer, CANVAS_W / 2, BAR_Y);

    if (gameState === 'round_intro') this._drawRoundIntro(ctx, roundWins, extras.stateTimer, extras.roundIntroDur);
    if (gameState === 'round_end')   this._drawRoundEnd(ctx, p1, p2);
    switch (gameState) {
      case 'match_end':
        this._drawMatchEnd(ctx, p1, p2, roundWins);
        break;
      case 'paused':
        this._drawPaused(ctx);
        break;
    }

    // Draw pause button during fighting
    if (gameState === 'fighting' || gameState === 'round_intro') {
      this._drawPauseButton(ctx);
    }

    if (this._flashTimer > 0) {
      const frac  = this._flashTimer / this._flashDuration;
      const scale = 1 + (1 - frac) * 0.15;
      const alpha = Math.min(1, frac * 3);
      
      const drawFlash = (ox, oy, col) => {
        ctx.fillStyle   = col;
        ctx.fillText(this._flashText, ox, oy);
      };

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font        = FONT_FIGHT;
      ctx.textAlign   = 'center';
      ctx.shadowBlur  = 0;
      ctx.translate(CANVAS_W / 2, CANVAS_H / 2 - 30);
      ctx.scale(scale, scale);
      
      if (this._flashText === 'FIGHT!') {
        drawFlash(0, 0, this._flashColor);
      } else {
        ctx.shadowColor = this._flashColor;
        ctx.shadowBlur  = 6;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        drawFlash(0, 0, this._flashColor);
      }
      
      ctx.restore();
    }
  }

  _drawHealthBar(ctx, hp, trailHp, barX, barY, isLeft, label, accentColor, wins, rawHealth) {
    const fillW  = BAR_W * hp;
    const trailW = BAR_W * trailHp;
    const fillX  = isLeft ? barX : barX + BAR_W - fillW;
    const trailX = isLeft ? barX : barX + BAR_W - trailW;

    ctx.save();
    
    // Pulse effect when health is critically low
    if (hp > 0 && hp < 0.25) {
      const pulse = 1 + Math.sin(performance.now() / 100) * 0.03;
      ctx.translate(barX + BAR_W/2, barY + BAR_H/2);
      ctx.scale(pulse, pulse);
      ctx.translate(-(barX + BAR_W/2), -(barY + BAR_H/2));
    }

    // Soft retro shadow instead of neon glow
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;

    ctx.fillStyle = 'rgba(10,10,20,0.85)';
    _roundRect(ctx, barX - 2, barY - 2, BAR_W + 4, BAR_H + 4, 4);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(barX, barY, BAR_W, BAR_H);

    // Trail
    if (trailW > fillW) {
      ctx.fillStyle = HP_RED; // red damage trail
      ctx.fillRect(trailX, barY, trailW, BAR_H);
    }

    const hpColor = hp > 0.5 ? HP_GREEN : hp > 0.25 ? HP_YELLOW : HP_RED;
    ctx.fillStyle = hpColor;
    ctx.fillRect(fillX, barY, fillW, BAR_H);

    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(fillX, barY, fillW, BAR_H * 0.4);

    ctx.strokeStyle = accentColor;
    ctx.lineWidth   = 2.0;
    _roundRect(ctx, barX - 2, barY - 2, BAR_W + 4, BAR_H + 4, 4);
    ctx.stroke();
    ctx.restore(); // end pulse/glow container

    ctx.save();
    // Hard drop shadows for text contrast
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    ctx.font      = FONT_NAME;
    ctx.fillStyle = accentColor;
    ctx.textAlign = isLeft ? 'left' : 'right';
    ctx.fillText(label, isLeft ? barX : barX + BAR_W, barY - 6);

    ctx.font      = "600 14px 'Rajdhani', Arial";
    ctx.fillStyle = WHITE;
    ctx.textAlign = isLeft ? 'right' : 'left';
    ctx.fillText(Math.ceil(rawHealth), isLeft ? barX + BAR_W - 4 : barX + 4, barY + BAR_H - 6);
    ctx.restore(); // end text shadows

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

  _drawPauseButton(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(10,10,20,0.85)';
    _roundRect(ctx, CANVAS_W/2 - 18, 75, 36, 36, 4);
    ctx.fill();
    ctx.fillStyle = WHITE;
    ctx.fillRect(CANVAS_W/2 - 7, 83, 5, 20);
    ctx.fillRect(CANVAS_W/2 + 2, 83, 5, 20);
    
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  _drawPaused(ctx) {
    ctx.save();
    // Dark overlay
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.font = FONT_FIGHT;
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'center';
    
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    ctx.fillText('PAUSED', CANVAS_W/2, 240);

    // Resume button
    ctx.fillStyle = 'rgba(20,20,30,0.95)';
    _roundRect(ctx, CANVAS_W/2 - 110, 320, 220, 50, 6);
    ctx.fill();
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Exit button
    ctx.fillStyle = 'rgba(20,20,30,0.95)';
    _roundRect(ctx, CANVAS_W/2 - 110, 390, 220, 50, 6);
    ctx.fill();
    ctx.strokeStyle = HP_RED;
    ctx.stroke();

    ctx.font = FONT_TIMER;
    ctx.fillStyle = WHITE;
    ctx.fillText('RESUME', CANVAS_W/2, 355);
    ctx.fillStyle = HP_RED;
    ctx.fillText('EXIT MATCH', CANVAS_W/2, 425);
    ctx.restore();
  }

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
      const pulse = 1 + Math.sin(performance.now() / 150) * 0.15;
      ctx.save();
      ctx.translate(cx, y + BAR_H - 4);
      ctx.scale(pulse, pulse);
      
      ctx.shadowColor = '#000';
      ctx.shadowBlur  = 0;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = HP_RED;
      ctx.fillText(sec.toString().padStart(2, '0'), 0, 0);
      
      ctx.restore();
    }
  }



  _drawCinematicIntro(ctx, stateTimer, p1, p2) {
    // Fill deep dark blue behind everything
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    
    if (this.uiBgStart && this.uiBgStart.complete) {
      ctx.drawImage(this.uiBgStart, 0, 0, CANVAS_W, CANVAS_H);
    }

    ctx.save();
    
    // Title Drop Position (No bounce animation)
    const targetY = CANVAS_H / 2 - 20;
    
    ctx.font = "900 70px 'Orbitron', monospace";
    ctx.textAlign = 'center';
    ctx.fillStyle = WHITE;
    
    // Clean solid drop shadow, strictly NO neon style
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 4;
    
    ctx.fillText("KNIGHT FIGHT GAME", CANVAS_W / 2, targetY);
    
    // Start Prompt Text (Blinking)
    const pulse = 0.5 + Math.sin(stateTimer * 5) * 0.5;
    ctx.globalAlpha = pulse;
    ctx.font = "900 28px 'Orbitron', monospace";
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5e6c8'; // Off-white/cream
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillText("CLICK TO START", CANVAS_W / 2, CANVAS_H - 120);
    ctx.globalAlpha = 1.0;
    
    ctx.restore();
  }

  _drawRoundIntro(ctx, roundWins, stateTimer, dur) {
    const round = roundWins[0] + roundWins[1] + 1;
    const introFrac = stateTimer / dur; 
    
    // Cinematic letterboxing animate in
    const barHeight = 80;
    const barAnimY = Math.max(0, 1 - introFrac * 6) * barHeight;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, barAnimY - barHeight, CANVAS_W, barHeight);
    ctx.fillRect(0, CANVAS_H - barAnimY, CANVAS_W, barHeight);

    // Sliding character cards
    const p1Offset = Math.max(0, 1 - introFrac * 3) * -400; 
    const p2Offset = Math.max(0, 1 - introFrac * 3) * 400;

    ctx.save();
    ctx.translate(p1Offset, 0);
    ctx.fillStyle = 'rgba(14,165,233,0.15)'; // P1_COLOR tint
    ctx.fillRect(0, CANVAS_H/2 - 60, CANVAS_W/2, 120);
    ctx.font = "900 64px 'Orbitron', monospace";
    ctx.textAlign = 'right';
    ctx.fillStyle = P1_COLOR;
    ctx.fillText("PLAYER 1", CANVAS_W/2 - 40, CANVAS_H/2 + 20);
    ctx.restore();

    ctx.save();
    ctx.translate(p2Offset, 0);
    ctx.fillStyle = 'rgba(220,38,38,0.15)'; // P2_COLOR tint
    ctx.fillRect(CANVAS_W/2, CANVAS_H/2 - 60, CANVAS_W/2, 120);
    ctx.font = "900 64px 'Orbitron', monospace";
    ctx.textAlign = 'left';
    ctx.fillStyle = P2_COLOR;
    ctx.fillText("CPU", CANVAS_W/2 + 40, CANVAS_H/2 + 20);
    ctx.restore();

    ctx.save();
    ctx.font        = FONT_ROUND;
    ctx.textAlign   = 'center';
    ctx.fillStyle   = WHITE;
    ctx.shadowColor = GOLD;
    ctx.shadowBlur  = 40;
    ctx.fillText(`ROUND  ${round}`, CANVAS_W / 2, CANVAS_H / 2 - 100);
    ctx.restore();
  }

  _drawRoundEnd(ctx, p1, p2) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  _drawMatchEnd(ctx, roundWins, p1, p2) {
    const p1Won = roundWins[0] >= 2;
    const winner = p1Won ? 'PLAYER 1' : 'CPU';
    const color  = p1Won ? P1_COLOR : P2_COLOR;
    
    // Cinematic letterbox & slight darkening
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CANVAS_W, 80);
    ctx.fillRect(0, CANVAS_H - 80, CANVAS_W, 80);
    
    ctx.save();
    ctx.font        = FONT_TITLE;
    ctx.textAlign   = 'center';
    ctx.fillStyle   = color;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 60;
    
    // Scaled up text
    ctx.translate(CANVAS_W/2, CANVAS_H/2 - 40);
    ctx.scale(1.2, 1.2);
    ctx.fillText(winner, 0, 0);
    
    ctx.shadowBlur  = 20;
    ctx.font        = FONT_FIGHT;
    ctx.fillStyle   = GOLD;
    ctx.shadowColor = GOLD;
    ctx.fillText('WINS THE MATCH!', 0, 70);
    ctx.restore();

    ctx.font      = FONT_SMALL;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.textAlign = 'center';
    ctx.fillText('Press  ENTER  to play again', CANVAS_W / 2, CANVAS_H / 2 + 130);
  }
}

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
