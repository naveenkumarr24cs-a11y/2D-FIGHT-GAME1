/**
 * background.js – Parallax background loader and renderer.
 *
 * Layers are rendered back-to-front. Farther layers (lower index) move
 * slower; closer layers (higher index) move faster.
 * Falls back to the flat bg_N.png if layer images fail to load.
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
    this.layers    = [];         // array of HTMLImageElement|null
    this.scrollX   = 0;         // current parallax offset (-80 … +80)
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

    this.bgKey  = key;
    this.layers = [];

    const base = `background/${key}`;

    // Flat fallback
    this.flatImage = await loadImage(`${base}/${entry.flat}`);

    // Parallax layers (skip null results silently)
    if (entry.layers?.length) {
      const imgs = await Promise.all(
        entry.layers.map(f => loadImage(`${base}/${f}`))
      );
      this.layers = imgs.filter(Boolean);
    }

    console.log(`[BG] Loaded "${key}": ${this.layers.length} parallax layer(s)`);
  }

  /**
   * Update parallax scroll based on the midpoint between both fighters.
   * @param {number} p1x
   * @param {number} p2x
   * @param {number} canvasW
   */
  update(p1x, p2x, canvasW) {
    const mid  = (p1x + p2x) / 2;
    const norm = (mid - canvasW / 2) / (canvasW / 2); // −1 … +1
    // Smooth towards target
    const target   = norm * 90;
    this.scrollX += (target - this.scrollX) * 0.06;
  }

  /**
   * Render the background.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} canvasW
   * @param {number} canvasH
   */
  draw(ctx, canvasW, canvasH) {
    // Dark fallback fill
    ctx.fillStyle = '#0d0d18';
    ctx.fillRect(0, 0, canvasW, canvasH);

    if (this.layers.length > 0) {
      const n = this.layers.length;
      this.layers.forEach((layer, i) => {
        // Layer 0 = furthest (slowest parallax)
        // Layer n-1 = nearest (fastest parallax)
        const factor  = n === 1 ? 0.3 : i / (n - 1) * 0.75;
        const offsetX = this.scrollX * factor;

        // Expand canvas slightly to avoid edge gaps when scrolled
        const extra = 160;
        ctx.drawImage(layer,
          -extra / 2 + offsetX, 0,
          canvasW + extra, canvasH);
      });
    } else if (this.flatImage) {
      ctx.drawImage(this.flatImage, 0, 0, canvasW, canvasH);
    } else {
      // Gradient last-resort
      const g = ctx.createLinearGradient(0, 0, 0, canvasH);
      g.addColorStop(0, '#1a1a3e');
      g.addColorStop(1, '#0d0d18');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvasW, canvasH);
    }
  }
}
