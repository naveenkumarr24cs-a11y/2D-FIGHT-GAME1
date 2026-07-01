/**
 * input.js – Keyboard state tracker for Player 1.
 * Call input.update() once at the START of each frame (before reading).
 * Actions map multiple key codes to a named action.
 */
export class Input {
  constructor() {
    this._keys     = {};
    this._prevKeys = {};

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
    };

    window.addEventListener('keydown', (e) => {
      this._keys[e.code] = true;
      // Prevent arrow-key page scroll
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this._keys[e.code] = false;
    });
  }

  /** Snapshot previous frame state – call once per frame before reading. */
  update() {
    this._prevKeys = { ...this._keys };
  }

  /** True every frame the action key is held. */
  isHeld(action) {
    return (this.bindings[action] ?? []).some(k => !!this._keys[k]);
  }

  /** True only on the frame the action key transitions down. */
  isPressed(action) {
    return (this.bindings[action] ?? []).some(k => this._keys[k] && !this._prevKeys[k]);
  }

  /** True only on the frame the action key transitions up. */
  isReleased(action) {
    return (this.bindings[action] ?? []).some(k => !this._keys[k] && this._prevKeys[k]);
  }

  /** Raw key-code check (for menu navigation, etc.). */
  keyPressed(code) {
    return !!this._keys[code] && !this._prevKeys[code];
  }

  keyHeld(code) {
    return !!this._keys[code];
  }
}
