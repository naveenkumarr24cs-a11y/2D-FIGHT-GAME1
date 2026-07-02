/**
 * input.js – Keyboard state tracker for Player 1.
 * Call input.update() once at the START of each frame (before reading).
 * Actions map multiple key codes to a named action.
 */
export class Input {
  constructor() {
    this._keys      = {};
    this._frameKeys = {};
    this._prevKeys  = {};

    // Map action name → array of key codes
    this.bindings = {
      right:       ['ArrowRight', 'KeyD'],
      left:        ['ArrowLeft',  'KeyA'],
      up:          ['ArrowUp',    'KeyW'],
      down:        ['ArrowDown',  'KeyS'],
      lightAttack: ['KeyJ'],
      heavyAttack: ['KeyK'],
      comboAttack: ['KeyL'],
      block:       ['ShiftLeft', 'ShiftRight'],
      roll:        ['Space', 'KeyC'],
    };

    window.addEventListener('keydown', (e) => {
      this._keys[e.code] = true;
      if (e.key === ' ') this._keys['Space'] = true;
      // Prevent arrow-key page scroll
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code) || e.key === ' ') {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this._keys[e.code] = false;
      if (e.key === ' ') this._keys['Space'] = false;
    });
    // Touch events are handled by MobileControls (src/mobileControls.js)
    // which writes directly into this._keys
  }


  /** Snapshot previous frame state – call once per frame before reading. */
  update() {
    this._prevKeys  = this._frameKeys;
    this._frameKeys = { ...this._keys };
  }

  /** True every frame the action key is held. */
  isHeld(action) {
    return (this.bindings[action] ?? []).some(k => !!this._frameKeys[k]);
  }

  /** True only on the frame the action key transitions down. */
  isPressed(action) {
    return (this.bindings[action] ?? []).some(k => this._frameKeys[k] && !this._prevKeys[k]);
  }

  /** True only on the frame the action key transitions up. */
  isReleased(action) {
    return (this.bindings[action] ?? []).some(k => !this._frameKeys[k] && this._prevKeys[k]);
  }

  /** Raw key-code check (for menu navigation, etc.). */
  keyPressed(code) {
    return !!this._frameKeys[code] && !this._prevKeys[code];
  }

  keyHeld(code) {
    return !!this._keys[code];
  }

  /**
   * Serialize current input state to a 9-bit integer bitmask for network transmission.
   * Bit layout:
   *   0=right, 1=left, 2=up, 3=down, 4=lightAttack,
   *   5=heavyAttack, 6=comboAttack, 7=block, 8=roll
   */
  serialize() {
    const actions = ['right','left','up','down','lightAttack','heavyAttack','comboAttack','block','roll'];
    let mask = 0;
    for (let i = 0; i < actions.length; i++) {
      if (this.isHeld(actions[i])) mask |= (1 << i);
    }
    return mask;
  }

  /**
   * Deserialize a bitmask back into an object usable like an Input instance.
   * Returns a plain object with isHeld(action) and isPressed(action) methods.
   * NOTE: isPressed() is not meaningful for remote input (we don't have prev state).
   * @param {number} mask
   * @param {number} [prevMask=0] — previous frame mask for pressed detection
   */
  static deserialize(mask, prevMask = 0) {
    const actions = ['right','left','up','down','lightAttack','heavyAttack','comboAttack','block','roll'];
    return {
      isHeld:    (action) => !!(mask    & (1 << actions.indexOf(action))),
      isPressed: (action) => !!(mask    & (1 << actions.indexOf(action))) &&
                             !(prevMask & (1 << actions.indexOf(action))),
      isReleased:(action) => !(mask     & (1 << actions.indexOf(action))) &&
                             !!(prevMask & (1 << actions.indexOf(action))),
      mask,
    };
  }
}
