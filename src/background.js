/**
 * background.js – Static background loader and renderer.
 *
 * Loads a single composite background image (useX.png) per stage
 * and renders it statically to fill the canvas.
 */

function loadImage(src) {
  return new Promise((resolve) => {
    const img   = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => { console.warn(`[BG] Failed: ${src}`); resolve(null); };
    img.src     = src;
  });
}

export class Background {
  constructor(manifest) {
    this.manifest  = manifest;   // bg-manifest.json data
    this.bgKey     = null;
    this.flatImage = null;
  }

  /**
   * Load a background by its manifest key (e.g. "bg_1").
   * @param {string} key
   */
  async load(key) {
    const entry = this.manifest[key];
    if (!entry) {
      console.warn(`[BG] No manifest entry for "${key}"`);
      return;
    }

    this.bgKey = key;
    const base = `background/${key}`;

    // Load composite image (e.g. use1.png)
    this.flatImage = await loadImage(`${base}/${entry.flat}`);

    console.log(`[BG] Loaded "${key}": static background`);
  }

  /**
   * Update parallax scroll - disabled for static backgrounds.
   */
  update(p1x, p2x, canvasW) {
    // No-op for static backgrounds
  }

  /**
   * Render the background.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} canvasW
   * @param {number} canvasH
   */
  draw(ctx, canvasW, canvasH) {
    if (this.flatImage) {
      ctx.drawImage(this.flatImage, 0, 0, canvasW, canvasH);
    } else {
      // Dark fallback fill
      ctx.fillStyle = '#0d0d18';
      ctx.fillRect(0, 0, canvasW, canvasH);
    }
  }
}

