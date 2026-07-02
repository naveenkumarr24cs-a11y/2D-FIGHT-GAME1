/**
 * fighter.js – Fighter subclass: wires animation states to loaded spritesheets,
 * handles P1 keyboard input, and draws itself with optional debug overlays.
 *
 * Fighter position (x, y) is the bottom-centre of the character in canvas coords.
 * Sprites are rendered scaled at DISPLAY_SCALE × the 120×80 frame size.
 */
import { Entity, STATES } from './entity.js';


/** Map each entity state to the animation key returned by animationLoader. */
const STATE_ANIM = {
  [STATES.IDLE]:          'idle',
  [STATES.WALK_FORWARD]:  'run',
  [STATES.WALK_BACKWARD]: 'run',       // same sprite, character faces opponent
  [STATES.JUMP]:          'jump',
  [STATES.FALL]:          'fall',
  [STATES.CROUCH]:        'crouch',
  [STATES.CROUCH_WALK]:   'crouch_walk',
  [STATES.DASH]:          'dash',
  [STATES.ROLL]:          'roll',
  [STATES.LIGHT_ATTACK]:  'light_attack',
  [STATES.HEAVY_ATTACK]:  'heavy_attack',
  [STATES.COMBO_ATTACK]:  'combo_attack',
  [STATES.CROUCH_ATTACK]: 'crouch_attack',
  [STATES.BLOCK_START]:   'block_start',
  [STATES.BLOCK_HOLD]:    'block_hold',
  [STATES.HURT]:          'hurt',
  [STATES.DEATH]:         'death',
  [STATES.TURNAROUND]:    'turnaround',
};

const WALK_SPEED  = 230;
const JUMP_VEL    = -720;

export class Fighter extends Entity {
  /**
   * @param {object} opts
   * @param {number} opts.x
   * @param {number} opts.y
   * @param {number} [opts.facing]
   * @param {Record<string,SpriteSheetAnimator>} [opts.animations]
   * @param {string} [opts.color]   Placeholder rect colour
   * @param {boolean}[opts.isPlayer]
   */
  constructor({ x, y, facing = 1, animations = {}, color = '#4af', isPlayer = false, displayScale = 2.2, shadowW = 50 }) {
    super({ x, y, facing, displayScale });
    this.animations = animations;
    this.color      = color;
    this.isPlayer   = isPlayer;
    this.displayScale = displayScale;
    this.shadowW = shadowW;

    this._prevAnimKey  = 'idle';
    this._currentAnim  = this.animations['idle'] || null;

    // Screen-shake per-fighter (heavy hits)
    this.shakeX     = 0;
    this.shakeY     = 0;
    this.shakeTimer = 0;
  }

  // ─── Input handling (P1 only) ─────────────────────────────────────────

  handleInput(input) {
    if (!this.canAct()) return;

    const moveR  = input.isHeld('right');
    const moveL  = input.isHeld('left');
    const crouch = input.isHeld('down');
    const block  = input.isHeld('block');

    // ── Attacks (highest priority; consume input immediately) ────────────
    if (input.isPressed('comboAttack')) {
      this.vx = 0;
      this.setState(STATES.COMBO_ATTACK);
      return;
    }
    if (input.isPressed('heavyAttack')) {
      this.vx = 0;
      this.setState(STATES.HEAVY_ATTACK);
      return;
    }
    if (input.isPressed('lightAttack')) {
      this.vx = 0;
      this.setState(crouch ? STATES.CROUCH_ATTACK : STATES.LIGHT_ATTACK);
      return;
    }

    // ── Jump ─────────────────────────────────────────────────────────────
    if (input.isPressed('up') && this.onGround) {
      this.vy = JUMP_VEL;
      this.onGround = false;
      this.vx = moveR ? WALK_SPEED : moveL ? -WALK_SPEED : 0;
      this.setState(STATES.JUMP);
      return;
    }

    // ── Block ─────────────────────────────────────────────────────────────
    if (block && this.onGround) {
      if (this.state !== STATES.BLOCK_HOLD && this.state !== STATES.BLOCK_START) {
        this.vx = 0;
        this.setState(STATES.BLOCK_START);
      }
      return;
    }
    if (!block && (this.state === STATES.BLOCK_HOLD || this.state === STATES.BLOCK_START)) {
      this.setState(STATES.IDLE);
    }

    // ── Roll (Dodge) ─────────────────────────────────────────────────────
    if (input.isPressed('roll') && this.onGround) {
      this.vx = (this.facing > 0 ? 1 : -1) * 500; 
      if (moveL) this.vx = -500;
      if (moveR) this.vx = 500;
      this.setState(STATES.ROLL);
      return;
    }

    // ── Crouch ────────────────────────────────────────────────────────────
    if (crouch && this.onGround) {
      if (moveR || moveL) {
        this.vx = moveR ? 110 : -110;
        this.setState(STATES.CROUCH_WALK);
      } else {
        this.vx = 0;
        this.setState(STATES.CROUCH);
      }
      return;
    }

    // ── Horizontal movement ───────────────────────────────────────────────
    if (this.onGround) {
      if (moveR && !moveL) {
        this.vx = WALK_SPEED;
        const fwd = this.facing > 0;
        this.setState(fwd ? STATES.WALK_FORWARD : STATES.WALK_BACKWARD);
      } else if (moveL && !moveR) {
        this.vx = -WALK_SPEED;
        const fwd = this.facing < 0;
        this.setState(fwd ? STATES.WALK_FORWARD : STATES.WALK_BACKWARD);
      } else {
        this.vx = 0;
        if (this.state === STATES.WALK_FORWARD ||
            this.state === STATES.WALK_BACKWARD ||
            this.state === STATES.CROUCH ||
            this.state === STATES.CROUCH_WALK) {
          this.setState(STATES.IDLE);
        }
      }
    }
  }

  /**
   * Drive this fighter from a deserialized remote input object.
   * Used for the remote player during online play.
   * Mirrors handleInput() but accepts Input.deserialize() output.
   * @param {object} inputObj — returned by Input.deserialize(mask, prevMask)
   */
  applyRemoteInput(inputObj) {
    this.handleInput(inputObj);
  }

  // ─── Update ───────────────────────────────────────────────────────────

  update(dt, opponentX = null) {
    // Face opponent while free to do so
    if (opponentX !== null && this.onGround && this.canAct() &&
        this.state !== STATES.WALK_FORWARD &&
        this.state !== STATES.WALK_BACKWARD) {
      this.facing = opponentX > this.x ? 1 : -1;
    }

    super.update(dt);

    // Jump → Fall transition
    if (this.state === STATES.JUMP && this.vy > 0) {
      this.setState(STATES.FALL);
    }

    // ── Animation update ─────────────────────────────────────────────────
    const animKey = STATE_ANIM[this.state] ?? 'idle';
    if (animKey !== this._prevAnimKey) {
      this._currentAnim = this.animations[animKey] ?? this.animations['idle'] ?? null;
      if (this._currentAnim) this._currentAnim.reset();
      this._prevAnimKey = animKey;
    }
    if (this._currentAnim) this._currentAnim.update(dt);

    // Per-fighter screen shake
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      this.shakeX = (Math.random() - 0.5) * 8;
      this.shakeY = (Math.random() - 0.5) * 8;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  triggerShake(duration = 0.18) {
    this.shakeTimer = duration;
  }

  // ─── Draw ─────────────────────────────────────────────────────────────

  draw(ctx) {
    const flipped = this.facing < 0;
    const w = this._currentAnim?.frameW || this._currentAnim?.image?.width || 120;
    const h = this._currentAnim?.frameH || this._currentAnim?.image?.height || 80;
    const displayW = w * this.displayScale;
    const displayH = h * this.displayScale;
    
    const drawX   = this.x - displayW / 2 + this.shakeX;
    const drawY   = this.y - displayH    + this.shakeY;

    // Draw shadow
    if (this.state !== STATES.DEATH || this.stateTimer < 1.5) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(1, 0.25);
      const rad = ctx.createRadialGradient(0, 0, 0, 0, 0, this.shadowW);
      rad.addColorStop(0, 'rgba(0,0,0,0.6)');
      rad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rad;
      ctx.beginPath();
      ctx.arc(0, 0, this.shadowW, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (this._currentAnim?.image) {
      // Death: fade out
      if (this.state === STATES.DEATH) {
        const alpha = Math.max(0, 1 - (this.stateTimer - 1.5) / 1.5);
        ctx.globalAlpha = Math.min(1, alpha);
      }
      this._currentAnim.draw(ctx, drawX, drawY, displayW, displayH, flipped);
      ctx.globalAlpha = 1;
    } else {
      // Placeholder rectangle
      ctx.fillStyle = this.color;
      ctx.globalAlpha = this.state === STATES.DEATH ? 0.35 : 1;
      ctx.fillRect(drawX + displayW * 0.15, drawY + displayH * 0.2,
                   displayW * 0.7, displayH * 0.75);
      ctx.globalAlpha = 1;

      // Placeholder: direction indicator
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      const tx = this.x + this.facing * 18;
      ctx.arc(tx, this.y - 80, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Debug overlays ───────────────────────────────────────────────────
    if (this.debug) {
      const hb = this.getHurtbox();
      ctx.strokeStyle = 'rgba(0,255,0,0.8)';
      ctx.lineWidth   = 2;
      ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);

      const atk = this.getHitbox();
      if (atk) {
        ctx.strokeStyle = 'rgba(255,60,60,0.9)';
        ctx.fillStyle   = 'rgba(255,60,60,0.2)';
        ctx.fillRect(atk.x, atk.y, atk.w, atk.h);
        ctx.strokeRect(atk.x, atk.y, atk.w, atk.h);
      }

      // State label
      ctx.fillStyle  = 'yellow';
      ctx.font       = '11px monospace';
      ctx.textAlign  = 'center';
      ctx.fillText(this.state, this.x, drawY - 4);
    }
  }

  reset(x, y, facing) {
    super.reset(x, y, facing);
    this._prevAnimKey = 'idle';
    this._currentAnim = this.animations['idle'] || null;
    this.shakeTimer   = 0;
    this.shakeX       = 0;
    this.shakeY       = 0;
  }

  /**
   * Save a compact snapshot of physics/combat state for rollback.
   * Only saves what's needed to re-simulate — NOT animation state.
   */
  saveSnapshot() {
    return {
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      health: this.health,
      state: this.state,
      stateTimer: this.stateTimer,
      onGround: this.onGround,
      facing: this.facing,
      hitActive: this.hitActive,
      hasHitOpponent: this.hasHitOpponent,
      invincible: this.invincible,
      invincibleTimer: this.invincibleTimer,
    };
  }

  /**
   * Restore a snapshot saved by saveSnapshot().
   */
  restoreSnapshot(snap) {
    this.x               = snap.x;
    this.y               = snap.y;
    this.vx              = snap.vx;
    this.vy              = snap.vy;
    this.health          = snap.health;
    this.state           = snap.state;
    this.stateTimer      = snap.stateTimer;
    this.onGround        = snap.onGround;
    this.facing          = snap.facing;
    this.hitActive       = snap.hitActive;
    this.hasHitOpponent  = snap.hasHitOpponent;
    this.invincible      = snap.invincible ?? false;
    this.invincibleTimer = snap.invincibleTimer ?? 0;
  }
}
