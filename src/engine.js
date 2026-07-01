/**
 * engine.js – Game loop (requestAnimationFrame, delta-time) + canvas setup.
 * Scales the canvas display to fit the window while preserving a fixed
 * internal resolution (default 1280×720).
 */
export class Engine {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {number} width   Internal pixel width  (logical coords)
   * @param {number} height  Internal pixel height (logical coords)
   */
  constructor(canvas, width = 1280, height = 720) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.width   = width;
    this.height  = height;

    canvas.width  = width;
    canvas.height = height;

    this._running      = false;
    this._lastTime     = 0;
    this._updateCb     = null;
    this._rafId        = null;

    // Crisp pixel rendering (avoid sub-pixel blur)
    this.ctx.imageSmoothingEnabled = false;

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  /** Fit the canvas display inside the browser window, letterboxed. */
  _resize() {
    const ratio    = this.width / this.height;
    const winW     = window.innerWidth;
    const winH     = window.innerHeight - 60; // leave room for controls bar
    const winRatio = winW / winH;

    let dW, dH;
    if (winRatio > ratio) {
      dH = winH;
      dW = winH * ratio;
    } else {
      dW = winW;
      dH = winW / ratio;
    }

    this.canvas.style.width  = `${Math.floor(dW)}px`;
    this.canvas.style.height = `${Math.floor(dH)}px`;
  }

  /**
   * Start the game loop.
   * @param {function(dt: number): void} updateCallback  Called each frame with
   *   delta-time in seconds (capped at 50 ms to prevent spiral-of-death).
   */
  start(updateCallback) {
    this._updateCb = updateCallback;
    this._running  = true;
    this._lastTime = performance.now();
    this._rafId    = requestAnimationFrame(this._loop.bind(this));
  }

  stop() {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }

  _loop(timestamp) {
    if (!this._running) return;

    let dt = (timestamp - this._lastTime) / 1000;
    this._lastTime = timestamp;
    dt = Math.min(dt, 0.05); // Cap at 50 ms

    this.ctx.clearRect(0, 0, this.width, this.height);
    this._updateCb(dt);

    this._rafId = requestAnimationFrame(this._loop.bind(this));
  }
}
