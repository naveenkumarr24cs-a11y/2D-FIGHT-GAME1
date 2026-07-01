/**
 * combat.js – Hit detection, damage values, blocking, combo windows.
 *
 * Call CombatSystem.check(attacker, defender, onHit) once per ordered pair
 * per frame (check p1→p2 then p2→p1).
 */
import { STATES } from './entity.js';

/** Base damage per attack state */
const DAMAGE = {
  [STATES.LIGHT_ATTACK]:  10,
  [STATES.CROUCH_ATTACK]:  8,
  [STATES.HEAVY_ATTACK]:  22,
  [STATES.COMBO_ATTACK]:  32,
};

/** Knockback per attack (applied in the direction away from attacker) */
const KNOCKBACK = {
  [STATES.LIGHT_ATTACK]:  { x: 220, y:    0 },
  [STATES.CROUCH_ATTACK]: { x: 160, y: -120 },
  [STATES.HEAVY_ATTACK]:  { x: 380, y: -160 },
  [STATES.COMBO_ATTACK]:  { x: 440, y: -220 },
};

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

export class CombatSystem {
  /**
   * Check whether attacker's active hitbox intersects defender's hurtbox
   * and apply damage / knockback when it does.
   *
   * @param {Entity}   attacker
   * @param {Entity}   defender
   * @param {function} onHit   Called with { attacker, defender, damage, isBlocked }
   *                           when a hit lands.
   */
  check(attacker, defender, onHit) {
    if (!attacker.hitActive)      return;
    if (attacker.hasHitOpponent)  return;   // only one hit per swing
    if (defender.state === STATES.DEATH) return;

    const hitbox  = attacker.getHitbox();
    const hurtbox = defender.getHurtbox();
    if (!hitbox) return;

    if (!rectsOverlap(hitbox, hurtbox)) return;

    // Register hit (prevent double-counting this swing)
    attacker.hasHitOpponent = true;

    // Blocking: defender must be in a block state AND facing the attacker
    const defenderFacingAttacker =
      Math.sign(attacker.x - defender.x) === defender.facing;
    const isBlocked = defender.isBlocking() && defenderFacingAttacker;

    const damage = DAMAGE[attacker.state] ?? 10;
    const kb     = KNOCKBACK[attacker.state] ?? { x: 200, y: 0 };
    // Direction: push defender away from attacker
    const kbDir  = defender.x >= attacker.x ? 1 : -1;

    defender.applyHit(
      damage,
      kb.x * kbDir,
      isBlocked ? 0 : kb.y,
      isBlocked
    );

    if (onHit) onHit({ attacker, defender, damage, isBlocked });
  }
}
