/**
 * lobby-ui.js — Canvas-drawn Lobby and Mode-Select UI for Knight Fight Game
 *
 * All UI is drawn on the game canvas — no HTML overlays needed.
 * Exports a LobbyUI class that main.js controls.
 */

const CANVAS_W = 1280;
const CANVAS_H = 720;

// Button definitions for mode select
const MODES = [
  { id: 'cpu',    label: 'VS CPU',      sub: 'Fight the AI',           icon: '🤖' },
  { id: 'create', label: 'CREATE ROOM', sub: 'Host an online match',    icon: '🌐' },
  { id: 'join',   label: 'JOIN ROOM',   sub: "Enter a friend's code",   icon: '🔑' },
];

// Numpad layout for join room on mobile
const NUMPAD = [
  ['A','B','C','D'],
  ['E','F','G','H'],
  ['I','J','K','L'],
  ['M','N','O','P'],
  ['Q','R','S','⌫'],
];


export class LobbyUI {
  constructor() {
    this._time       = 0;
    this._typedCode  = '';   // for join room code input
    this._hoveredBtn = -1;
    this._clickedBtn = null; // set externally
    this._bgImg      = new Image();
    this._bgImg.src  = 'background/bg_15/use15.png';

    // Track mouse
    this._mouseX = 0;
    this._mouseY = 0;
    window.addEventListener('mousemove', (e) => {
      const rect = document.getElementById('game-canvas').getBoundingClientRect();
      this._mouseX = (e.clientX - rect.left) * (CANVAS_W / rect.width);
      this._mouseY = (e.clientY - rect.top)  * (CANVAS_H / rect.height);
    });

    // Keyboard for code entry
    this._keyHandler = null;
  }

  update(dt) { this._time += dt; }

  // ── Draw: Mode Select ────────────────────────────────────────────────────

  drawModeSelect(ctx) {
    this._drawBg(ctx);

    // Title
    ctx.save();
    ctx.font = "900 62px 'Orbitron', monospace";
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#000';
    ctx.shadowOffsetX = 4; ctx.shadowOffsetY = 4; ctx.shadowBlur = 0;
    ctx.fillText('KNIGHT FIGHT GAME', CANVAS_W / 2, 130);

    ctx.font = "700 18px 'Orbitron', monospace";
    ctx.fillStyle = '#f5e6c8';
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 6;
    ctx.fillText('SELECT MODE', CANVAS_W / 2, 170);
    ctx.restore();

    // On mobile (portrait), use a stacked vertical layout
    const isMobile = window.innerWidth < window.innerHeight;

    if (isMobile) {
      const mBtnW = CANVAS_W * 0.80;
      const mBtnH = 120;
      const mGap  = 28;
      const mStartX = CANVAS_W / 2 - mBtnW / 2;
      const mStartY = 220;

      this._hoveredBtn = -1;
      this._mobileLayout = { btnW: mBtnW, btnH: mBtnH, gap: mGap, startX: mStartX, startY: mStartY };

      MODES.forEach((mode, i) => {
        const by = mStartY + i * (mBtnH + mGap);

        // Store for hit-test in getHoveredMode
        ctx.fillStyle = 'rgba(5,5,20,0.80)';
        ctx.strokeStyle = 'rgba(245,230,200,0.35)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.roundRect(mStartX, by, mBtnW, mBtnH, 14);
        ctx.fill(); ctx.stroke();

        ctx.font = "52px serif";
        ctx.textAlign = 'left';
        ctx.globalAlpha = 0.9;
        ctx.fillText(mode.icon, mStartX + 28, by + 72);
        ctx.globalAlpha = 1;

        ctx.font = "900 26px 'Orbitron', monospace";
        ctx.textAlign = 'left';
        ctx.fillStyle = '#f5e6c8';
        ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
        ctx.fillText(mode.label, mStartX + 90, by + 50);

        ctx.font = "600 18px 'Rajdhani', Arial";
        ctx.fillStyle = 'rgba(245,230,200,0.65)';
        ctx.shadowBlur = 0;
        ctx.fillText(mode.sub, mStartX + 90, by + 80);
      });

      return;
    }

    // Desktop: horizontal layout
    const btnW = 340, btnH = 110;
    const gap  = 30;
    const totalW = MODES.length * btnW + (MODES.length - 1) * gap;
    const startX = (CANVAS_W - totalW) / 2;
    const btnY   = CANVAS_H / 2 - btnH / 2 + 30;
    this._mobileLayout = null;

    this._hoveredBtn = -1;
    MODES.forEach((mode, i) => {
      const bx = startX + i * (btnW + gap);
      const hovered = this._mouseX >= bx && this._mouseX <= bx + btnW &&
                      this._mouseY >= btnY && this._mouseY <= btnY + btnH;
      if (hovered) this._hoveredBtn = i;

      ctx.save();
      const alpha = hovered ? 1.0 : 0.85;
      const scale = hovered ? 1.04 : 1.0;
      ctx.translate(bx + btnW / 2, btnY + btnH / 2);
      ctx.scale(scale, scale);
      ctx.translate(-(bx + btnW / 2), -(btnY + btnH / 2));

      // Button bg
      ctx.fillStyle = hovered ? 'rgba(240,165,0,0.22)' : 'rgba(5,5,20,0.75)';
      ctx.strokeStyle = hovered ? '#f0a500' : 'rgba(245,230,200,0.3)';
      ctx.lineWidth = hovered ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.roundRect(bx, btnY, btnW, btnH, 12);
      ctx.fill();
      ctx.stroke();

      // Icon
      ctx.font = "48px serif";
      ctx.textAlign = 'center';
      ctx.globalAlpha = alpha;
      ctx.fillText(mode.icon, bx + 55, btnY + 60);

      // Label
      ctx.font = "900 20px 'Orbitron', monospace";
      ctx.fillStyle = hovered ? '#f0a500' : '#f5e6c8';
      ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
      ctx.fillText(mode.label, bx + btnW / 2 + 10, btnY + 48);

      // Sub label
      ctx.font = "600 13px 'Rajdhani', Arial";
      ctx.fillStyle = 'rgba(245,230,200,0.65)';
      ctx.shadowBlur = 0;
      ctx.fillText(mode.sub, bx + btnW / 2 + 10, btnY + 74);

      ctx.restore();
    });

    return { buttons: MODES.map((m, i) => ({ id: m.id, index: i })) };
  }

  /**
   * Returns the hovered mode id.
   * If mx/my are provided, performs a direct hit-test (for touch events).
   */
  getHoveredMode(mx, my) {
    // Mobile vertical layout hit-test
    if (mx !== undefined && my !== undefined) {
      const isMobile = window.innerWidth < window.innerHeight;
      if (isMobile && this._mobileLayout) {
        const { btnW, btnH, gap, startX, startY } = this._mobileLayout;
        for (let i = 0; i < MODES.length; i++) {
          const by = startY + i * (btnH + gap);
          if (mx >= startX && mx <= startX + btnW && my >= by && my <= by + btnH) {
            return MODES[i].id;
          }
        }
        return null;
      }
      // Desktop horizontal layout hit-test
      const btnW = 340, btnH = 110, gap = 30;
      const totalW = MODES.length * btnW + (MODES.length - 1) * gap;
      const startX = (CANVAS_W - totalW) / 2;
      const btnY   = CANVAS_H / 2 - btnH / 2 + 30;
      for (let i = 0; i < MODES.length; i++) {
        const bx = startX + i * (btnW + gap);
        if (mx >= bx && mx <= bx + btnW && my >= btnY && my <= btnY + btnH) {
          return MODES[i].id;
        }
      }
      return null;
    }
    return this._hoveredBtn >= 0 ? MODES[this._hoveredBtn].id : null;
  }

  /**
   * Hit-test the on-canvas numpad in join room screen.
   * Returns the character tapped, '⌫' for backspace, or null.
   */
  getNumpadKey(mx, my) {
    if (!this._numpadLayout) return null;
    const { startX, startY, keyW, keyH, gap } = this._numpadLayout;
    for (let row = 0; row < NUMPAD.length; row++) {
      for (let col = 0; col < NUMPAD[row].length; col++) {
        const kx = startX + col * (keyW + gap);
        const ky = startY + row * (keyH + gap);
        if (mx >= kx && mx <= kx + keyW && my >= ky && my <= ky + keyH) {
          return NUMPAD[row][col];
        }
      }
    }
    // Hit-test the JOIN button
    if (this._joinBtnLayout) {
      const { x, y, w, h } = this._joinBtnLayout;
      if (mx >= x && mx <= x + w && my >= y && my <= y + h) return '✔JOIN';
    }
    // Hit-test the BACK button
    if (this._backBtnLayout) {
      const { x, y, w, h } = this._backBtnLayout;
      if (mx >= x && mx <= x + w && my >= y && my <= y + h) return '✔BACK';
    }
    return null;
  }

  // ── Draw: Create Room (lobby waiting) ────────────────────────────────────

  drawCreateRoom(ctx, roomId, opponentJoined) {
    this._drawBg(ctx);
    ctx.save();

    // Title
    ctx.font = "900 36px 'Orbitron', monospace";
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5e6c8';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
    ctx.fillText('ONLINE MATCH — HOST', CANVAS_W / 2, 120);

    // Room Code box
    const boxW = 560, boxH = 160;
    const boxX = CANVAS_W / 2 - boxW / 2, boxY = 200;
    ctx.fillStyle = 'rgba(5,5,20,0.82)';
    ctx.strokeStyle = '#f0a500';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 14);
    ctx.fill(); ctx.stroke();

    ctx.font = "600 16px 'Orbitron', monospace";
    ctx.fillStyle = 'rgba(245,230,200,0.6)';
    ctx.fillText('SHARE THIS CODE WITH YOUR OPPONENT:', CANVAS_W / 2, boxY + 38);

    ctx.font = "900 72px 'Orbitron', monospace";
    ctx.fillStyle = '#f0a500';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3;
    ctx.letterSpacing = '12px';
    ctx.fillText(roomId || '------', CANVAS_W / 2, boxY + 122);
    ctx.letterSpacing = '0px';
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

    // Status
    const pulse = 0.55 + Math.sin(this._time * 3) * 0.45;
    ctx.globalAlpha = opponentJoined ? 1.0 : pulse;
    ctx.font = "700 22px 'Orbitron', monospace";
    ctx.fillStyle = opponentJoined ? '#7ec850' : '#f5e6c8';
    ctx.shadowColor = opponentJoined ? '#7ec850' : 'transparent';
    ctx.shadowBlur = opponentJoined ? 8 : 0;
    ctx.fillText(
      opponentJoined ? '✔  OPPONENT CONNECTED! LOADING...' : '⏳  Waiting for opponent to join...',
      CANVAS_W / 2, boxY + 220
    );
    ctx.globalAlpha = 1;

    // Cancel hint
    const isMobile = window.innerWidth < window.innerHeight;
    ctx.font = "500 14px 'Rajdhani', Arial";
    ctx.fillStyle = 'rgba(245,230,200,0.4)';
    ctx.shadowBlur = 0;
    ctx.fillText(
      isMobile ? 'Tap bottom of screen to cancel' : 'Press  ESC  to cancel',
      CANVAS_W / 2, CANVAS_H - 50
    );

    ctx.restore();
  }

  // ── Draw: Join Room ──────────────────────────────────────────────────────

  drawJoinRoom(ctx, typedCode, errorMsg) {
    this._drawBg(ctx);
    ctx.save();

    ctx.font = "900 36px 'Orbitron', monospace";
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5e6c8';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
    ctx.fillText('ONLINE MATCH — JOIN', CANVAS_W / 2, 90);

    const boxW = 560, boxH = 120;
    const boxX = CANVAS_W / 2 - boxW / 2, boxY = 130;

    ctx.fillStyle = 'rgba(5,5,20,0.82)';
    ctx.strokeStyle = errorMsg ? '#ef4444' : '#f0a500';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 14);
    ctx.fill(); ctx.stroke();

    ctx.font = "600 15px 'Orbitron', monospace";
    ctx.fillStyle = 'rgba(245,230,200,0.6)';
    ctx.fillText('ENTER ROOM CODE:', CANVAS_W / 2, boxY + 32);

    const codeDisplay = typedCode.padEnd(6, '_').split('').join(' ');
    ctx.font = "900 52px 'Orbitron', monospace";
    ctx.fillStyle = '#f0a500';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
    ctx.fillText(codeDisplay, CANVAS_W / 2, boxY + 100);
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

    if (errorMsg) {
      ctx.font = "700 16px 'Orbitron', monospace";
      ctx.fillStyle = '#ef4444';
      ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 8;
      ctx.fillText(`✗  ${errorMsg}`, CANVAS_W / 2, boxY + 145);
    }

    // ── On-canvas Numpad (always shown for mobile) ──────────────────────
    const isMobile = window.innerWidth < window.innerHeight;
    const keyW = isMobile ? 140 : 110;
    const keyH = isMobile ? 72 : 60;
    const kGap = isMobile ? 16 : 14;
    const totalKW = 4 * keyW + 3 * kGap;
    const kStartX = CANVAS_W / 2 - totalKW / 2;
    const kStartY = isMobile ? 290 : 310;

    this._numpadLayout = { startX: kStartX, startY: kStartY, keyW, keyH, gap: kGap };

    NUMPAD.forEach((row, ri) => {
      row.forEach((key, ci) => {
        const kx = kStartX + ci * (keyW + kGap);
        const ky = kStartY + ri * (keyH + kGap);
        const isBS = key === '⌫';

        ctx.fillStyle = isBS ? 'rgba(180,30,30,0.7)' : 'rgba(20,20,50,0.85)';
        ctx.strokeStyle = isBS ? '#ef4444' : 'rgba(245,230,200,0.3)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.roundRect(kx, ky, keyW, keyH, 10);
        ctx.fill(); ctx.stroke();

        ctx.font = isBS ? `700 ${keyH*0.45}px serif` : `900 ${keyH*0.44}px 'Orbitron', monospace`;
        ctx.fillStyle = isBS ? '#fca5a5' : '#f5e6c8';
        ctx.shadowBlur = 0;
        ctx.textAlign = 'center';
        ctx.fillText(key, kx + keyW / 2, ky + keyH * 0.66);
      });
    });

    // JOIN button
    const joinEnabled = typedCode.length === 6;
    const joinY = kStartY + NUMPAD.length * (keyH + kGap) + 12;
    const joinW = totalKW * 0.55, joinH = keyH;
    const joinX = CANVAS_W / 2 - joinW / 2;
    this._joinBtnLayout = { x: joinX, y: joinY, w: joinW, h: joinH };

    ctx.fillStyle = joinEnabled ? 'rgba(60,180,80,0.85)' : 'rgba(40,60,40,0.5)';
    ctx.strokeStyle = joinEnabled ? '#7ec850' : 'rgba(245,230,200,0.15)';
    ctx.lineWidth = joinEnabled ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(joinX, joinY, joinW, joinH, 12);
    ctx.fill(); ctx.stroke();

    ctx.font = `900 ${keyH*0.42}px 'Orbitron', monospace`;
    ctx.fillStyle = joinEnabled ? '#d1fae5' : 'rgba(245,230,200,0.3)';
    ctx.shadowBlur = joinEnabled ? 6 : 0;
    ctx.shadowColor = '#7ec850';
    ctx.textAlign = 'center';
    ctx.fillText('JOIN ✔', CANVAS_W / 2, joinY + joinH * 0.66);
    ctx.shadowBlur = 0;

    // BACK button
    const backW = totalKW * 0.35, backH = keyH * 0.75;
    const backX = CANVAS_W / 2 + joinW / 2 + kGap;
    const backY = joinY + (joinH - backH) / 2;
    this._backBtnLayout = { x: backX, y: backY, w: backW, h: backH };

    ctx.fillStyle = 'rgba(60,60,80,0.7)';
    ctx.strokeStyle = 'rgba(245,230,200,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(backX, backY, backW, backH, 10);
    ctx.fill(); ctx.stroke();

    ctx.font = `700 ${backH*0.42}px 'Rajdhani', Arial`;
    ctx.fillStyle = 'rgba(245,230,200,0.55)';
    ctx.fillText('◀ BACK', backX + backW / 2, backY + backH * 0.68);

    if (!isMobile) {
      ctx.font = "600 14px 'Rajdhani', Arial";
      ctx.fillStyle = 'rgba(245,230,200,0.4)';
      ctx.fillText('Or type on keyboard and press ENTER', CANVAS_W / 2, CANVAS_H - 50);
    }

    ctx.restore();
  }

  // ── Draw: Connected / Starting ───────────────────────────────────────────

  drawConnected(ctx, ping, loadingMsg) {
    this._drawBg(ctx);
    ctx.save();

    ctx.font = "900 40px 'Orbitron', monospace";
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7ec850';
    ctx.shadowColor = '#7ec850'; ctx.shadowBlur = 12;
    ctx.fillText('OPPONENT CONNECTED!', CANVAS_W / 2, CANVAS_H / 2 - 60);

    ctx.font = "700 22px 'Orbitron', monospace";
    ctx.fillStyle = '#f5e6c8';
    ctx.shadowBlur = 0;
    ctx.fillText(`Ping: ${ping}ms`, CANVAS_W / 2, CANVAS_H / 2);

    const pulse = 0.6 + Math.sin(this._time * 4) * 0.4;
    ctx.globalAlpha = pulse;
    ctx.font = "700 18px 'Rajdhani', Arial";
    ctx.fillStyle = '#f5e6c8';
    ctx.fillText(loadingMsg || 'Loading assets...', CANVAS_W / 2, CANVAS_H / 2 + 60);
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // ── Draw: Opponent left ──────────────────────────────────────────────────

  drawOpponentLeft(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.font = "900 46px 'Orbitron', monospace";
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ef4444';
    ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 10;
    ctx.fillText('OPPONENT DISCONNECTED', CANVAS_W / 2, CANVAS_H / 2 - 30);

    ctx.font = "700 22px 'Orbitron', monospace";
    ctx.fillStyle = '#f5e6c8';
    ctx.shadowBlur = 0;
    ctx.fillText('Press  ENTER  to return to menu', CANVAS_W / 2, CANVAS_H / 2 + 40);
    ctx.restore();
  }

  // ── Ping Badge (draw during gameplay) ────────────────────────────────────

  drawPingBadge(ctx, ping) {
    const color = ping < 60 ? '#7ec850' : ping < 120 ? '#f0a500' : '#ef4444';
    ctx.save();
    ctx.font = "700 13px 'Rajdhani', Arial";
    ctx.textAlign = 'right';
    ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = 4;
    ctx.fillText(`● ${ping}ms`, CANVAS_W - 10, 20);
    ctx.restore();
  }

  // ── Helper: bg ──────────────────────────────────────────────────────────

  _drawBg(ctx) {
    if (this._bgImg.complete && this._bgImg.naturalWidth > 0) {
      ctx.drawImage(this._bgImg, 0, 0, CANVAS_W, CANVAS_H);
    } else {
      ctx.fillStyle = '#070714';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
    // Dark overlay
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
}
