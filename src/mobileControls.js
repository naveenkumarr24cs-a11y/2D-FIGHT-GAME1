/**
 * mobileControls.js – Standalone touch UI for mobile devices.
 *
 * Detects touch devices, builds the joystick + action-button DOM,
 * wires touch events directly into the Input class's _keys map,
 * and exposes setState(gameState) to show/hide/dim based on game flow.
 *
 * ONLY shows during: round_intro, fighting, round_end, paused (dimmed)
 * HIDDEN during:     title, mode_select, lobby_*, match_end, opponent_left
 */

export const isTouchDevice =
  ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

export class MobileControls {
  /**
   * @param {object} keys – Reference to Input._keys (written to directly)
   */
  constructor(keys) {
    this._keys = keys;
    this._root = null;
    this._joyZone = null;
    this._joyStick = null;
    this._joyTouchId = null;
    this._originX = 0;
    this._originY = 0;
    this._visible = false;

    if (isTouchDevice) {
      this._build();
      this._wireJoystick();
      this._wireButtons();
    }
  }

  // ─── DOM Construction ───────────────────────────────────────────────────

  _build() {
    // Root overlay
    const root = document.createElement('div');
    root.id = 'mobile-controls';
    root.className = 'mc-hidden';

    // ── Joystick (left side) ──────────────────────────────────────────────
    const joyZone = document.createElement('div');
    joyZone.id = 'mc-joystick-zone';

    const joyBase = document.createElement('div');
    joyBase.id = 'mc-joystick-base';

    const joyStick = document.createElement('div');
    joyStick.id = 'mc-joystick-stick';

    joyBase.appendChild(joyStick);
    joyZone.appendChild(joyBase);

    // ── Action buttons (right side, diamond layout) ───────────────────────
    const btnArea = document.createElement('div');
    btnArea.id = 'mc-btn-area';

    const BTNS = [
      { id: 'mc-btn-heavy',  key: 'KeyK',      icon: '⚔',  label: 'HEAVY', cls: 'mc-btn-top'    },
      { id: 'mc-btn-light',  key: 'KeyJ',      icon: '🗡',  label: 'LIGHT', cls: 'mc-btn-left'   },
      { id: 'mc-btn-combo',  key: 'KeyL',      icon: '💥',  label: 'COMBO', cls: 'mc-btn-right'  },
      { id: 'mc-btn-roll',   key: 'Space',     icon: '🌀',  label: 'ROLL',  cls: 'mc-btn-bot-l'  },
      { id: 'mc-btn-block',  key: 'ShiftLeft', icon: '🛡',  label: 'BLOCK', cls: 'mc-btn-bot-r'  },
    ];

    BTNS.forEach(({ id, key, icon, label, cls }) => {
      const btn = document.createElement('div');
      btn.id = id;
      btn.className = `mc-btn ${cls}`;
      btn.setAttribute('data-key', key);
      btn.setAttribute('aria-label', label);

      const iconEl = document.createElement('span');
      iconEl.className = 'mc-btn-icon';
      iconEl.textContent = icon;

      const labelEl = document.createElement('span');
      labelEl.className = 'mc-btn-label';
      labelEl.textContent = label;

      btn.appendChild(iconEl);
      btn.appendChild(labelEl);
      btnArea.appendChild(btn);
    });


    root.appendChild(joyZone);
    root.appendChild(btnArea);
    document.body.appendChild(root);

    this._root     = root;
    this._joyZone  = joyZone;
    this._joyStick = joyStick;
  }

  // ─── Joystick Touch Logic ───────────────────────────────────────────────

  _wireJoystick() {
    const zone = this._joyZone;

    const update = (clientX, clientY) => {
      const dx   = clientX - this._originX;
      const dy   = clientY - this._originY;
      const max  = 50;
      const dist = Math.min(Math.hypot(dx, dy), max);
      const ang  = Math.atan2(dy, dx);
      const px   = Math.cos(ang) * dist;
      const py   = Math.sin(ang) * dist;

      // Move stick knob visually
      this._joyStick.style.transform = `translate(${px}px, ${py}px)`;

      // Clear direction keys
      this._keys['ArrowLeft']  = false;
      this._keys['ArrowRight'] = false;
      this._keys['ArrowUp']    = false;
      this._keys['ArrowDown']  = false;

      const dead = 16;
      if (dist > dead) {
        if (px >  dead) this._keys['ArrowRight'] = true;
        if (px < -dead) this._keys['ArrowLeft']  = true;
        if (py >  dead) this._keys['ArrowDown']  = true;
        if (py < -dead) this._keys['ArrowUp']    = true;
      }
    };

    const onStart = (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this._joyTouchId = t.identifier;
      const rect = zone.getBoundingClientRect();
      this._originX = rect.left + rect.width  / 2;
      this._originY = rect.top  + rect.height / 2;
      update(t.clientX, t.clientY);
    };

    const onMove = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyTouchId) update(t.clientX, t.clientY);
      }
    };

    const onEnd = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyTouchId) {
          this._joyTouchId = null;
          this._joyStick.style.transform = 'translate(0px,0px)';
          this._keys['ArrowLeft']  = false;
          this._keys['ArrowRight'] = false;
          this._keys['ArrowUp']    = false;
          this._keys['ArrowDown']  = false;
        }
      }
    };

    zone.addEventListener('touchstart',  onStart, { passive: false });
    zone.addEventListener('touchmove',   onMove,  { passive: false });
    zone.addEventListener('touchend',    onEnd,   { passive: false });
    zone.addEventListener('touchcancel', onEnd,   { passive: false });
  }

  // ─── Action Button Touch Logic ──────────────────────────────────────────

  _wireButtons() {
    document.querySelectorAll('.mc-btn').forEach(btn => {
      const code = btn.getAttribute('data-key');

      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this._keys[code] = true;
        btn.classList.add('mc-btn--active');
      }, { passive: false });

      const release = (e) => {
        e.preventDefault();
        this._keys[code] = false;
        btn.classList.remove('mc-btn--active');
      };
      btn.addEventListener('touchend',    release, { passive: false });
      btn.addEventListener('touchcancel', release, { passive: false });
    });
  }

  // ─── State Visibility ───────────────────────────────────────────────────

  /**
   * Call every frame with the current GS state string.
   * Controls are visible during fights, dimmed when paused, hidden otherwise.
   * @param {string} state
   */
  setState(state) {
    if (!this._root) return;

    const SHOW = ['round_intro', 'fighting', 'round_end'];
    const DIM  = ['paused'];

    if (SHOW.includes(state)) {
      this._root.className = 'mc-visible';
    } else if (DIM.includes(state)) {
      this._root.className = 'mc-dim';
    } else {
      this._root.className = 'mc-hidden';
    }
  }
}
