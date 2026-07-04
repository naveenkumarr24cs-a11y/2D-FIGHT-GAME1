/**
 * netplay.js — Knight Fight Game: Low-Latency Netplay Client v2
 *
 * Key improvements over v1:
 *
 * 1. BINARY PROTOCOL
 *    Input packets are 6 bytes (uint32 frame + uint16 keys) instead of ~50-byte JSON.
 *    This cuts serialization time and reduces bytes-on-wire by ~8x.
 *
 * 2. ADAPTIVE INPUT DELAY
 *    Input delay automatically adjusts every second based on measured ping:
 *      delay = clamp(ceil(ping / 16), 1, 6)
 *    At 30ms ping → 2 frames. At 60ms ping → 4 frames. At 16ms ping → 1 frame.
 *    This gives you the minimum artificial lag for your connection quality.
 *
 * 3. FULL ROLLBACK NETCODE
 *    - Every frame, both players' inputs are recorded in parallel ring buffers.
 *    - Remote inputs are predicted (repeat last known input) when not yet arrived.
 *    - When confirmed remote input arrives and differs from prediction: rollback.
 *    - Rollback restores the snapshot at that frame, then re-simulates ALL frames
 *      up to the current frame using the now-correct inputs.
 *    - This corrects mispredictions without visible hitching (max 8 frames).
 *
 * 4. FAST PING
 *    Binary ping every 1s (vs 5s JSON before). RTT is measured with 4-sample
 *    rolling average for accuracy.
 *
 * 5. INPUT HISTORY
 *    Both local and remote input histories are stored so rollback re-simulation
 *    can replay the correct sequence of inputs for every frame.
 */

const BUFFER_SIZE  = 256;      // ring buffer capacity (must be power of 2)
const BUFFER_MASK  = BUFFER_SIZE - 1;
const MAX_ROLLBACK = 20;       // max frames to roll back (needs to cover one-way latency)
                               // At 60fps: 300ms RTT = 150ms one-way = ~9 frames minimum
                               // Set to 20 for safety margin on high-latency connections
const MIN_DELAY    = 2;        // minimum input delay frames (must be >= ceil(server_RTT/16))
const MAX_DELAY    = 10;       // maximum adaptive input delay (increased for high-latency)

export const NetplayStatus = Object.freeze({
  DISCONNECTED: 'disconnected',
  CONNECTING:   'connecting',
  WAITING:      'waiting',
  PLAYING:      'playing',
  ERROR:        'error',
});

export class NetplayClient {
  constructor() {
    this._ws            = null;
    this._pc            = null;   // WebRTC RTCPeerConnection
    this._dataChannel   = null;   // WebRTC RTCDataChannel for game inputs
    this._pingInterval  = null;
    this.status         = NetplayStatus.DISCONNECTED;
    this.roomId         = null;
    this.playerSlot     = null;   // 1 or 2
    this.mapSeed        = null;   // shared random seed for deterministic map pick

    // ── Ping / Adaptive Delay ────────────────────────────────────────────
    this.ping           = 0;
    this._pingTs        = 0;
    this._rttSamples    = [];     // rolling window of RTT samples
    this.inputDelay     = 3;      // current adaptive input delay (frames)
    this._delayLocked   = false;  // locked to true once match starts — no mid-match changes

    // ── Input ring buffers ───────────────────────────────────────────────
    // Uint16 arrays indexed by (frame & BUFFER_MASK)
    this._localInputs   = new Uint16Array(BUFFER_SIZE);  // local history
    this._remoteInputs  = new Uint16Array(BUFFER_SIZE);  // remote history
    this._confirmed     = new Uint8Array(BUFFER_SIZE);   // 1 = real, 0 = predicted

    this._lastRemoteFrame = -1;
    this._currentFrame    = 0;  // set by main loop via setCurrentFrame()

    // ── Rollback ────────────────────────────────────────────────────────
    // null, or { toFrame: number } — cleared by consumeRollback()
    this._pendingRollback = null;

    // ── Callbacks ────────────────────────────────────────────────────────
    this.onOpponentJoined = null;
    this.onOpponentReady  = null;
    this.onStart          = null;
    this.onOpponentLeft   = null;
    this.onError          = null;
  }

  // ── Connection ───────────────────────────────────────────────────────────

  connect(serverUrl) {
    return new Promise((resolve, reject) => {
      this.status = NetplayStatus.CONNECTING;
      try {
        this._ws = new WebSocket(serverUrl);
        this._ws.binaryType = 'arraybuffer';  // receive binary as ArrayBuffer
      } catch (e) {
        this.status = NetplayStatus.ERROR;
        reject(e);
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
        this._ws.close();
      }, 5000);

      this._ws.onopen = () => {
        clearTimeout(timeout);
        this.status = NetplayStatus.DISCONNECTED;
        resolve();
      };

      this._ws.onclose = () => {
        this.status = NetplayStatus.DISCONNECTED;
        if (this.onOpponentLeft) this.onOpponentLeft();
      };

      this._ws.onerror = () => {
        clearTimeout(timeout);
        this.status = NetplayStatus.ERROR;
        if (this.onError) this.onError('Connection failed. Is the server running?');
        reject(new Error('WebSocket error'));
      };

      this._ws.onmessage = (evt) => {
        if (evt.data instanceof ArrayBuffer) {
          this._handleBinary(evt.data);
        } else {
          try { this._handleJSON(JSON.parse(evt.data)); } catch {}
        }
      };
    });
  }

  // ── Room ops ─────────────────────────────────────────────────────────────

  createRoom() {
    return new Promise((resolve) => {
      this._pendingCreate = resolve;
      this._sendJSON({ type: 'create' });
    });
  }

  joinRoom(roomId) {
    this._sendJSON({ type: 'join', roomId });
  }

  signalReady() {
    this._sendJSON({ type: 'ready' });
    this.status = NetplayStatus.WAITING;
  }

  // ── Frame interface ──────────────────────────────────────────────────────

  /** Call every frame to tell the netplay system what frame we're on. */
  setCurrentFrame(frame) {
    this._currentFrame = frame;
  }

  /**
   * Store local input and send to server.
   * Schedules it `inputDelay` frames in the future.
   */
  storeAndSendLocalInput(currentFrame, inputMask) {
    const targetFrame = currentFrame + this.inputDelay;
    this._localInputs[targetFrame & BUFFER_MASK] = inputMask;
    this._sendInputBinary(targetFrame, inputMask);
  }

  /** Get local player's input for a specific frame. */
  getLocalInput(frame) {
    return this._localInputs[frame & BUFFER_MASK] ?? 0;
  }

  /**
   * Get remote player's input for a specific frame.
   * If not yet confirmed, predicts by repeating last known input.
   * Schedules a rollback if a later confirmed input contradicts past prediction.
   */
  getRemoteInput(frame) {
    const idx = frame & BUFFER_MASK;

    if (this._confirmed[idx]) {
      return this._remoteInputs[idx];
    }

    // Prediction: repeat last known remote input (player probably held the button)
    const lastKnown = this._lastRemoteFrame >= 0
      ? this._remoteInputs[this._lastRemoteFrame & BUFFER_MASK]
      : 0;

    this._remoteInputs[idx] = lastKnown;
    return lastKnown;
  }

  /**
   * Returns and clears any pending rollback request.
   * Main loop must handle this by restoring snapshot and re-simulating.
   * @returns {{ toFrame: number }|null}
   */
  consumeRollback() {
    const rb = this._pendingRollback;
    this._pendingRollback = null;
    return rb;
  }

  get isHost() { return this.playerSlot === 1; }

  /** Returns true if the remote input for this frame has been confirmed (not predicted). */
  isConfirmed(frame) {
    return !!this._confirmed[frame & BUFFER_MASK];
  }

  disconnect() {
    if (this._pingInterval) { clearInterval(this._pingInterval); this._pingInterval = null; }
    if (this._dataChannel) { this._dataChannel.close(); this._dataChannel = null; }
    if (this._pc) { this._pc.close(); this._pc = null; }
    if (this._ws) { this._ws.close(); this._ws = null; }
    this.status         = NetplayStatus.DISCONNECTED;
    this._delayLocked   = false;   // allow delay to adapt again after disconnect
    this._lastRemoteFrame = -1;
    this._pendingRollback = null;
  }

  // ── Binary message handler ────────────────────────────────────────────────

  _handleBinary(buffer) {
    const data = new DataView(buffer);

    // 6-byte input packet: uint32 frame + uint16 keys
    if (buffer.byteLength === 6) {
      const frame = data.getUint32(0, true);  // little-endian
      const keys  = data.getUint16(4, true);
      this._receiveRemoteInput(frame, keys);
      return;
    }

    // 8-byte ping-pong: marker[0]=0xFF, pong[1]=0x01, ts[2..5]
    if (buffer.byteLength === 8 && data.getUint8(0) === 0xFF) {
      if (data.getUint8(1) === 0x00) {
        // Ping received — echo back as pong over P2P channel
        data.setUint8(1, 0x01);
        if (this._dataChannel && this._dataChannel.readyState === 'open') {
          this._dataChannel.send(buffer);
        }
      } else if (data.getUint8(1) === 0x01) {
        // Pong received — calculate RTT
        const sentTs = data.getUint32(2, true);
        const now    = Date.now() & 0xFFFFFFFF;
        const rtt    = (now - sentTs + 0x100000000) & 0xFFFFFFFF; // handle wrapping
        this._updatePing(rtt);
      }
      return;
    }
  }

  // ── JSON message handler ──────────────────────────────────────────────────

  _handleJSON(msg) {
    switch (msg.type) {
      case 'created':
        this.roomId     = msg.roomId;
        this.playerSlot = msg.playerSlot;
        this.status     = NetplayStatus.WAITING;
        if (this._pendingCreate) { this._pendingCreate(msg.roomId); this._pendingCreate = null; }
        break;

      case 'joined':
        this.playerSlot = msg.playerSlot;
        this.status     = NetplayStatus.WAITING;
        break;

      case 'opponent_joined':
        if (this.onOpponentJoined) this.onOpponentJoined();
        break;

      case 'opponent_ready':
        if (this.onOpponentReady) this.onOpponentReady();
        break;

      case 'start':
        this.mapSeed      = msg.mapSeed ?? null;
        this.status       = NetplayStatus.CONNECTING; // Waiting for WebRTC connection
        this._setupWebRTC();
        break;

      case 'webrtc_offer':
        if (!this._pc) this._setupWebRTC();
        this._pc.setRemoteDescription(msg.offer)
          .then(() => this._pc.createAnswer())
          .then(answer => this._pc.setLocalDescription(answer))
          .then(() => this._sendJSON({ type: 'webrtc_answer', answer: this._pc.localDescription }));
        break;

      case 'webrtc_answer':
        if (this._pc) this._pc.setRemoteDescription(msg.answer);
        break;

      case 'webrtc_ice':
        if (this._pc && msg.candidate) this._pc.addIceCandidate(msg.candidate).catch(e => console.error(e));
        break;

      // JSON input fallback (legacy or control frame)
      case 'input':
        this._receiveRemoteInput(msg.frame, msg.keys ?? 0);
        break;

      case 'opponent_left':
        this.status = NetplayStatus.DISCONNECTED;
        if (this.onOpponentLeft) this.onOpponentLeft();
        break;

      case 'error':
        if (this.onError) this.onError(msg.msg);
        break;
    }
  }

  // ── Remote input storage + rollback detection ─────────────────────────────

  _receiveRemoteInput(frame, keys) {
    const idx = frame & BUFFER_MASK;

    // Detect misprediction: we already predicted this frame's input
    // and now the real value has arrived and it's different.
    const alreadyPredicted = !this._confirmed[idx] &&
                              frame <= this._currentFrame;
    if (alreadyPredicted && this._remoteInputs[idx] !== keys) {
      // Schedule rollback to the earliest mispredicted frame
      const toFrame = Math.max(0, frame);
      if (!this._pendingRollback || this._pendingRollback.toFrame > toFrame) {
        this._pendingRollback = { toFrame };
      }
    }

    this._remoteInputs[idx] = keys;
    this._confirmed[idx]    = 1;
    if (frame > this._lastRemoteFrame) this._lastRemoteFrame = frame;
  }

  // ── Ping / Adaptive Delay ─────────────────────────────────────────────────

  _updatePing(rtt) {
    this._rttSamples.push(rtt);
    if (this._rttSamples.length > 8) this._rttSamples.shift();  // 8-sample window

    // Use median RTT (more stable than mean)
    const sorted = [...this._rttSamples].sort((a, b) => a - b);
    const medianRtt = sorted[Math.floor(sorted.length / 2)];

    this.ping = Math.round(medianRtt / 2);  // one-way latency

    // Adaptive input delay: 1 frame covers ~16ms at 60fps
    // We need at least ceil(ping/16) frames of delay to avoid rollbacks
    // Fix 8: never change delay mid-match — only update before match starts
    if (this._delayLocked) return;

    const needed = Math.ceil(this.ping / 16);
    const newDelay = Math.max(MIN_DELAY, Math.min(MAX_DELAY, needed));

    if (newDelay !== this.inputDelay) {
      console.log(`[Netplay] Ping ${this.ping}ms → adjusting input delay: ${this.inputDelay} → ${newDelay} frames`);
      this.inputDelay = newDelay;
    }
  }

  // ── WebRTC Setup ──────────────────────────────────────────────────────────

  _setupWebRTC() {
    this._pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    this._pc.onicecandidate = (e) => {
      if (e.candidate) this._sendJSON({ type: 'webrtc_ice', candidate: e.candidate });
    };

    if (this.isHost) {
      // Host creates the data channel (unreliable/unordered for lowest latency game data)
      this._setupDataChannel(this._pc.createDataChannel('game_data', { ordered: false, maxRetransmits: 0 }));
      this._pc.createOffer().then(offer => this._pc.setLocalDescription(offer))
        .then(() => this._sendJSON({ type: 'webrtc_offer', offer: this._pc.localDescription }));
    } else {
      // Guest waits for data channel from host
      this._pc.ondatachannel = (e) => this._setupDataChannel(e.channel);
    }
  }

  _setupDataChannel(channel) {
    this._dataChannel = channel;
    this._dataChannel.binaryType = 'arraybuffer';
    
    this._dataChannel.onopen = () => {
      console.log('🔗 WebRTC DataChannel opened! P2P connection established.');
      this.status       = NetplayStatus.PLAYING;
      this._delayLocked = true;
      if (this.onStart) this.onStart(this.playerSlot);

      // Start ping loop over P2P channel
      this._pingInterval = setInterval(() => {
        if (this._dataChannel.readyState !== 'open') return;
        const buf = new ArrayBuffer(8);
        const view = new DataView(buf);
        view.setUint8(0, 0xFF);
        view.setUint8(1, 0x00);
        view.setUint32(2, Date.now() & 0xFFFFFFFF, true);
        this._dataChannel.send(buf);
      }, 1000);
    };

    this._dataChannel.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) this._handleBinary(e.data);
    };

    this._dataChannel.onclose = () => this.disconnect();
  }

  // ── Send helpers ──────────────────────────────────────────────────────────

  /** Send a 6-byte binary input packet — fastest possible. */
  _sendInputBinary(frame, keys) {
    if (!this._dataChannel || this._dataChannel.readyState !== 'open') return;
    const buf = new ArrayBuffer(6);
    const view = new DataView(buf);
    view.setUint32(0, frame, true);   // little-endian
    view.setUint16(4, keys,  true);
    this._dataChannel.send(buf);
  }

  _sendJSON(obj) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(obj));
    }
  }
}
