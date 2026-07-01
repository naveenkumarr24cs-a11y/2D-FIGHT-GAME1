/**
 * entity.js – Base Fighter class: physics, state machine, hitbox/hurtbox.
 *
 * Coordinate system:
 *   x = horizontal centre of the fighter (world coords)
 *   y = bottom of the fighter (floor level when on ground)
 *   Positive x → right, positive y → down.
 *
 * The state machine controls animation selection and combat legality;
 * velocity is set externally (by input or AI) and applied here.
 */

export const STATES = Object.freeze({
  IDLE:          'idle',
  WALK_FORWARD:  'walk_forward',
  WALK_BACKWARD: 'walk_backward',
  JUMP:          'jump',
  FALL:          'fall',
  CROUCH:        'crouch',
  CROUCH_WALK:   'crouch_walk',
  DASH:          'dash',
  ROLL:          'roll',
  LIGHT_ATTACK:  'light_attack',
  HEAVY_ATTACK:  'heavy_attack',
  COMBO_ATTACK:  'combo_attack',
  CROUCH_ATTACK: 'crouch_attack',
  BLOCK_START:   'block_start',
  BLOCK_HOLD:    'block_hold',
  HURT:          'hurt',
  DEATH:         'death',
  TURNAROUND:    'turnaround',
});

// How long (seconds) each timed state lasts before auto-transitioning
const STATE_DURATIONS = {
  [STATES.LIGHT_ATTACK]:  0.35,
  [STATES.HEAVY_ATTACK]:  0.55,
  [STATES.COMBO_ATTACK]:  0.65,
  [STATES.CROUCH_ATTACK]: 0.35,
  [STATES.BLOCK_START]:   0.12,
  [STATES.HURT]:          0.40, // overridden by applyHit
  [STATES.DASH]:          0.22,
  [STATES.TURNAROUND]:    0.15,
};

// Normalised hit-window [start, end] within a state's duration
const HITBOX_WINDOWS = {
  [STATES.LIGHT_ATTACK]:  [0.25, 0.60],
  [STATES.HEAVY_ATTACK]:  [0.30, 0.70],
  [STATES.COMBO_ATTACK]:  [0.20, 0.75],
  [STATES.CROUCH_ATTACK]: [0.25, 0.60],
};

const GRAVITY      = 1800; // px / s²
const FLOOR_DAMP   = 0.78; // horizontal velocity damping per frame on ground
const FLOOR_STOP   = 6;   // vx magnitude below which we zero out

export class Entity {
  constructor({ x, y, facing = 1, maxHealth = 100 }) {
    this.x       = x;
    this.y       = y;          // bottom of character
    this.groundY = y;
    this.vx      = 0;
    this.vy      = 0;
    this.facing  = facing;    // 1 = right, -1 = left
    this.onGround = true;

    // Hurtbox half-dimensions (relative to x/y)
    this.hurtW = 54;
    this.hurtH = 128;

    this.maxHealth = maxHealth;
    this.health    = maxHealth;

    this.state         = STATES.IDLE;
    this.prevState     = STATES.IDLE;
    this.stateTimer    = 0;
    this.stateDuration = 0;

    // Attack hit tracking
    this.hitActive      = false;
    this.hasHitOpponent = false;

    this.debug = false;
  }

  // ─── State machine ─────────────────────────────────────────────────────

  /**
   * Transition to a new state.
   * No-ops if the state is unchanged or the fighter is dead.
   */
  setState(newState) {
    if (newState === this.state)  return;
    if (this.state === STATES.DEATH) return;

    this.prevState     = this.state;
    this.state         = newState;
    this.stateTimer    = 0;
    this.stateDuration = STATE_DURATIONS[newState] ?? 0;
    this.hitActive      = false;
    this.hasHitOpponent = false;
  }

  /** True during any attack state. */
  isAttacking() {
    return this.state === STATES.LIGHT_ATTACK  ||
           this.state === STATES.HEAVY_ATTACK  ||
           this.state === STATES.COMBO_ATTACK  ||
           this.state === STATES.CROUCH_ATTACK;
  }

  /** True while holding a block state. */
  isBlocking() {
    return this.state === STATES.BLOCK_START ||
           this.state === STATES.BLOCK_HOLD;
  }

  /**
   * True when the entity can accept new commands.
   * (False during attacks, hurt, death, dash, roll, turnaround.)
   */
  canAct() {
    return this.state !== STATES.HURT          &&
           this.state !== STATES.DEATH         &&
           this.state !== STATES.LIGHT_ATTACK  &&
           this.state !== STATES.HEAVY_ATTACK  &&
           this.state !== STATES.COMBO_ATTACK  &&
           this.state !== STATES.CROUCH_ATTACK &&
           this.state !== STATES.DASH          &&
           this.state !== STATES.ROLL          &&
           this.state !== STATES.TURNAROUND;
  }

  // ─── Physics update ────────────────────────────────────────────────────

  update(dt) {
    if (this.state === STATES.DEATH) {
      // Slide to a stop
      this.vx *= 0.85;
      this.x  += this.vx * dt;
      return;
    }

    this.stateTimer += dt;

    // Auto-transition timed states
    if (this.stateDuration > 0 && this.stateTimer >= this.stateDuration) {
      this._onStateEnd();
    }

    // Update hit-active window
    const hitWin = HITBOX_WINDOWS[this.state];
    if (hitWin && this.stateDuration > 0) {
      const t = this.stateTimer / this.stateDuration;
      this.hitActive = t >= hitWin[0] && t <= hitWin[1];
    } else {
      this.hitActive = false;
    }

    // Gravity
    if (!this.onGround) this.vy += GRAVITY * dt;

    // Integrate
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Ground collision
    if (this.y >= this.groundY) {
      this.y  = this.groundY;
      this.vy = 0;
      if (!this.onGround) {
        this.onGround = true;
        if (this.state === STATES.JUMP || this.state === STATES.FALL) {
          this.setState(STATES.IDLE);
          this.vx = 0;
        }
      }
    }

    // Ground friction (only applies when no intentional movement)
    if (this.onGround && (this.state === STATES.HURT || this.state === STATES.IDLE)) {
      this.vx *= FLOOR_DAMP;
      if (Math.abs(this.vx) < FLOOR_STOP) this.vx = 0;
    }

    // Canvas boundary clamp (overridden by main.js push-apart logic)
    this.x = Math.max(80, Math.min(1200, this.x));
  }

  _onStateEnd() {
    switch (this.state) {
      case STATES.LIGHT_ATTACK:
      case STATES.HEAVY_ATTACK:
      case STATES.COMBO_ATTACK:
      case STATES.CROUCH_ATTACK:
        this.vx = 0;
        this.setState(this.onGround ? STATES.IDLE : STATES.FALL);
        break;

      case STATES.HURT:
        this.setState(this.health <= 0 ? STATES.DEATH : STATES.IDLE);
        break;

      case STATES.BLOCK_START:
        this.setState(STATES.BLOCK_HOLD);
        break;

      case STATES.DASH:
        this.vx = 0;
        this.setState(STATES.IDLE);
        break;

      case STATES.TURNAROUND:
        this.setState(STATES.IDLE);
        break;

      default:
        break;
    }
  }

  // ─── Combat ────────────────────────────────────────────────────────────

  /**
   * Apply a hit from an opponent.
   * @param {number}  damage
   * @param {number}  knockbackX   Signed knockback velocity (already directed)
   * @param {number}  knockbackY   Knockback vertical velocity (negative = upward)
   * @param {boolean} isBlocked
   */
  applyHit(damage, knockbackX, knockbackY, isBlocked) {
    if (this.state === STATES.DEATH) return;

    const actualDmg = isBlocked ? Math.ceil(damage * 0.2) : damage;
    this.health = Math.max(0, this.health - actualDmg);

    if (!isBlocked) {
      this.vx = knockbackX;
      this.vy = knockbackY;
      if (knockbackY < 0) this.onGround = false;

      // Hurt duration scales with damage
      const hurtDur = damage >= 20 ? 0.60 : 0.40;
      this.setState(STATES.HURT);
      this.stateDuration = hurtDur;
    }

    if (this.health <= 0) {
      this.setState(STATES.DEATH);
      this.vx = knockbackX * 0.4;
    }
  }

  // ─── Hitboxes ──────────────────────────────────────────────────────────

  /** Hurtbox rectangle {x,y,w,h} in world coords. */
  getHurtbox() {
    return {
      x: this.x - this.hurtW / 2,
      y: this.y - this.hurtH,
      w: this.hurtW,
      h: this.hurtH,
    };
  }

  /**
   * Hitbox rectangle for the current attack, or null if not active.
   * Extends in the facing direction from the body centre.
   */
  getHitbox() {
    if (!this.hitActive) return null;

    const reach = this.state === STATES.COMBO_ATTACK ? 100
                : this.state === STATES.HEAVY_ATTACK ? 90
                : 72;
    const offsetX = this.facing > 0
      ? this.hurtW / 2
      : -(this.hurtW / 2 + reach);

    return {
      x: this.x + offsetX,
      y: this.y - 110,
      w: reach,
      h: 65,
    };
  }

  // ─── Reset ─────────────────────────────────────────────────────────────

  reset(x, y, facing) {
    this.x       = x;
    this.y       = y;
    this.groundY = y;
    this.facing  = facing ?? this.facing;
    this.vx      = 0;
    this.vy      = 0;
    this.health  = this.maxHealth;
    this.onGround       = true;
    this.state          = STATES.IDLE;
    this.prevState      = STATES.IDLE;
    this.stateTimer     = 0;
    this.stateDuration  = 0;
    this.hitActive      = false;
    this.hasHitOpponent = false;
  }
}
