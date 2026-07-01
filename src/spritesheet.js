/**
 * spritesheet.js – Generic sprite-sheet animator.
 *
 * Supports two sheet formats:
 *   • Single-row strip  (Colour1/Colour2 120×80 assets):
 *       frameCount = image.width / frameW   (no scan needed)
 *   • Multi-row grid   (CHARACTER 2 128×128 / 15-col × 8-row sheets):
 *       detectFrames = true  → alpha-scans each cell row-major and stops
 *       at the first all-transparent trailing cell.
 */
export class SpriteSheetAnimator {
  /**
   * @param {object} opts
   * @param {HTMLImageElement} opts.image
   * @param {number}  opts.frameW      Width of one frame in pixels
   * @param {number}  opts.frameH      Height of one frame in pixels
   * @param {number}  opts.cols        Number of columns in the sheet
   * @param {number}  [opts.rows=1]    Number of rows (1 for strip sheets)
   * @param {number}  [opts.fps=12]    Playback speed
   * @param {boolean} [opts.loop=true] Whether the animation loops
   * @param {boolean} [opts.detectFrames=false]  Run alpha-scan to find
   *                                   actual used-frame count (multi-row)
   */
  constructor({
    image, frameW, frameH,
    cols, rows = 1,
    fps = 12, loop = true,
    detectFrames = false
  }) {
    this.image  = image;
    this.frameW = frameW;
    this.frameH = frameH;
    this.cols   = cols;
    this.rows   = rows;
    this.fps    = fps;
    this.loop   = loop;

    this.currentFrame = 0;
    this.elapsed      = 0;
    this.done         = false;

    if (detectFrames && rows > 1) {
      this.frameCount = this._detectFrameCount();
      console.log(`[Sprite] alpha-scan → ${this.frameCount} frames (${image.src.split('/').pop()})`);
    } else {
      // Strip: width / frameW
      this.frameCount = cols;
    }
  }

  /** Alpha-scan each grid cell row-major; stop at first empty trailing cell. */
  _detectFrameCount() {
    try {
      const off = document.createElement('canvas');
      off.width  = this.image.width;
      off.height = this.image.height;
      const ctx  = off.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(this.image, 0, 0);

      const total = this.cols * this.rows;
      for (let i = 0; i < total; i++) {
        const col = i % this.cols;
        const row = Math.floor(i / this.cols);
        const data = ctx.getImageData(
          col * this.frameW, row * this.frameH,
          this.frameW, this.frameH
        ).data;

        let alphaSum = 0;
        for (let p = 3; p < data.length; p += 4) alphaSum += data[p];
        if (alphaSum === 0) return Math.max(1, i); // first empty cell → stop
      }
      return total;
    } catch (e) {
      // CORS or security error (shouldn't happen on local server)
      console.warn('[Sprite] alpha-scan blocked, using full cell count:', e.message);
      return this.cols * this.rows;
    }
  }

  /** Advance animation clock by dt seconds. */
  update(dt) {
    if (this.done) return;
    this.elapsed += dt;
    const frameDur = 1 / this.fps;

    while (this.elapsed >= frameDur) {
      this.elapsed -= frameDur;
      if (this.currentFrame < this.frameCount - 1) {
        this.currentFrame++;
      } else if (this.loop) {
        this.currentFrame = 0;
      } else {
        this.done = true;
        break;
      }
    }
  }

  /** Reset to frame 0. */
  reset() {
    this.currentFrame = 0;
    this.elapsed      = 0;
    this.done         = false;
  }

  /**
   * Draw the current frame.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x         Top-left X in canvas coords
   * @param {number} y         Top-left Y in canvas coords
   * @param {number} displayW  Drawn width  (scaled)
   * @param {number} displayH  Drawn height (scaled)
   * @param {boolean} flipped  Mirror horizontally
   */
  draw(ctx, x, y, displayW, displayH, flipped = false) {
    const col = this.currentFrame % this.cols;
    const row = Math.floor(this.currentFrame / this.cols);
    const sx  = col * this.frameW;
    const sy  = row * this.frameH;

    ctx.save();
    if (flipped) {
      ctx.translate(x + displayW, y);
      ctx.scale(-1, 1);
      ctx.drawImage(this.image, sx, sy, this.frameW, this.frameH,
                    0, 0, displayW, displayH);
    } else {
      ctx.drawImage(this.image, sx, sy, this.frameW, this.frameH,
                    x, y, displayW, displayH);
    }
    ctx.restore();
  }

  get isComplete() { return this.done; }
}
