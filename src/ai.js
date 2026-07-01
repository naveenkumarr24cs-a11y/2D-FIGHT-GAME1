/**
 * ai.js – AI bot controller for Player 2.
 *
 * Implements a behaviour-based FSM (not ML). Difficulty changes:
 *   • Reaction delay (how long before re-evaluating the situation)
 *   • Block chance (probability of blocking an incoming hit)
 *   • Aggression (probability of attacking when in range)
 *
 * The AI operates in named behavioural states (approach / attack / retreat /
 * block / idle) and only calls setState on the fighter when the fighter can
 * actually act, preventing state-machine violations.
 */
import { STATES } from './entity.js';

const DIFFICULTY = {
  //            reactionBase  reactionJitter  blockChance  aggression  walkSpeed
  easy:   { reactionBase: 0.55, reactionJitter: 0.20, blockChance: 0.06, aggression: 0.25, walkSpeed: 150 },
  medium: { reactionBase: 0.28, reactionJitter: 0.10, blockChance: 0.45, aggression: 0.65, walkSpeed: 220 },
  hard:   { reactionBase: 0.08, reactionJitter: 0.05, blockChance: 0.82, aggression: 0.90, walkSpeed: 270 },
};

const ATTACK_RANGE      = 140; // px – try to attack within this distance
const MIN_SAFE_DIST     = 90;  // px – retreat if closer than this AND low HP
const APPROACH_STOP_DIST = 110;

export class AIController {
  /**
   * @param {Fighter} self    AI-controlled fighter
   * @param {Fighter} target  The human player
   * @param {'easy'|'medium'|'hard'} difficulty
   */
  constructor(self, target, difficulty = 'medium') {
    this.self   = self;
    this.target = target;
    this.cfg    = DIFFICULTY[difficulty] ?? DIFFICULTY.medium;

    this._decisionTimer = 0;
    this._decisionDelay = this.cfg.reactionBase;
    this._aiState       = 'idle';   // 'idle' | 'approach' | 'attack' | 'retreat' | 'block'
    this._aiStateTimer  = 0;
    this._pendingAttack = null;     // 'light' | 'heavy' | 'combo'
    this._specialCD     = 0;
    this._heavyCD       = 0;
  }

  setDifficulty(level) {
    this.cfg = DIFFICULTY[level] ?? DIFFICULTY.medium;
  }

  update(dt) {
    const s = this.self;
    const t = this.target;

    if (s.state === STATES.DEATH) return;
    if (t.state === STATES.DEATH) return;

    // Cool down special moves
    this._specialCD = Math.max(0, this._specialCD - dt);
    this._heavyCD   = Math.max(0, this._heavyCD   - dt);
    this._aiStateTimer += dt;

    // Keep the fighter facing its target
    if (s.canAct()) {
      s.facing = t.x > s.x ? 1 : -1;
    }

    // Accumulate decision timer; re-evaluate on expiry
    this._decisionTimer += dt;
    if (this._decisionTimer >= this._decisionDelay) {
      this._decisionTimer = 0;
      this._decisionDelay = this.cfg.reactionBase +
        (Math.random() * this.cfg.reactionJitter * 2 - this.cfg.reactionJitter);
      this._decide();
    }

    this._execute(dt);
  }

  // ——— Decision tree ————————————————————————————————————————————————

  _decide() {
    const s    = this.self;
    const t    = this.target;
    const dist = Math.abs(t.x - s.x);
    const hpRatio = s.health / s.maxHealth;

    // React to opponent's active attack—block or dodge
    if (t.isAttacking() && t.hitActive) {
      if (Math.random() < this.cfg.blockChance) {
        this._setAiState('block');
        return;
      }
      if (Math.random() < 0.35) {
        this._setAiState('retreat');
        return;
      }
    }

    // Low HP → retreat if opponent is very close
    if (hpRatio < 0.25 && dist < MIN_SAFE_DIST + 40) {
      this._setAiState('retreat');
      return;
    }

    if (dist > ATTACK_RANGE + 80) {
      // Far — approach
      this._setAiState('approach');
    } else if (dist <= ATTACK_RANGE) {
      // In range — decide whether to attack or not
      if (Math.random() < this.cfg.aggression) {
        this._setAiState('attack');
        // Choose attack type with weighted random
        if (this._specialCD <= 0 && Math.random() < 0.22) {
          this._pendingAttack = 'combo';
          this._specialCD     = 4.5 + Math.random() * 2;
        } else if (this._heavyCD <= 0 && Math.random() < 0.38) {
          this._pendingAttack = 'heavy';
          this._heavyCD       = 1.8 + Math.random();
        } else {
          this._pendingAttack = 'light';
        }
      } else {
        // Passive—oscillate
        this._setAiState(Math.random() < 0.4 ? 'retreat' : 'idle');
      }
    } else {
      // Medium distance—approach or idle
      this._setAiState(Math.random() < 0.65 ? 'approach' : 'idle');
    }
  }

  _setAiState(state) {
    if (this._aiState !== state) {
      this._aiState      = state;
      this._aiStateTimer = 0;
    }
  }

  // ——— Execution ———————————————————————————————————————————————————

  _execute(dt) {
    const s          = this.self;
    const t          = this.target;
    const toTarget   = Math.sign(t.x - s.x); // direction toward target

    switch (this._aiState) {

      case 'approach':
        if (s.canAct()) {
          const dist = Math.abs(t.x - s.x);
          if (dist > APPROACH_STOP_DIST) {
            s.vx = toTarget * (this.cfg.walkSpeed ?? 220);
            s.setState(STATES.WALK_FORWARD);
          } else {
            s.vx = 0;
            s.setState(STATES.IDLE);
            this._setAiState('idle');
          }
        }
        break;

      case 'attack':
        if (s.canAct() && this._pendingAttack) {
          s.vx = 0;
          switch (this._pendingAttack) {
            case 'combo': s.setState(STATES.COMBO_ATTACK);  break;
            case 'heavy': s.setState(STATES.HEAVY_ATTACK);  break;
            default:      s.setState(STATES.LIGHT_ATTACK);  break;
          }
          this._pendingAttack = null;
          this._setAiState('idle');
        }
        break;

      case 'retreat':
        if (s.canAct()) {
          s.vx = -toTarget * (this.cfg.walkSpeed ?? 220);
          s.setState(STATES.WALK_BACKWARD);
        }
        // Cap retreat duration
        if (this._aiStateTimer > 0.55) this._setAiState('idle');
        break;

      case 'block':
        if (s.canAct() && s.state !== STATES.BLOCK_HOLD && s.state !== STATES.BLOCK_START) {
          s.vx = 0;
          s.setState(STATES.BLOCK_START);
        }
        if (this._aiStateTimer > 0.55) {
          if (s.state === STATES.BLOCK_HOLD || s.state === STATES.BLOCK_START) {
            s.setState(STATES.IDLE);
          }
          this._setAiState('idle');
        }
        break;

      case 'idle':
      default:
        if (s.canAct()) {
          s.vx = 0;
          if (s.state === STATES.WALK_FORWARD ||
              s.state === STATES.WALK_BACKWARD ||
              s.state === STATES.CROUCH_WALK) {
            s.setState(STATES.IDLE);
          }
        }
        break;
    }
  }
}
