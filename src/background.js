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

class WeatherSystem {
  constructor() {
    this.particles = [];
    this.weatherType = null;
    this.time = 0;
    this.thunderAlpha = 0;
  }
  
  setWeather(type, canvasW) {
    this.weatherType = type;
    this.particles = [];
    if (!type) return;
    
    const count = type === 'rain' ? 80 : type === 'snow' ? 120 : type === 'cherryBlossom' ? 150 : 120;
    for (let i = 0; i < count; i++) {
      this.spawnParticle(Math.random() * canvasW, Math.random() * 720);
    }
  }
  
  spawnParticle(x = Math.random() * 1280, y = -20) {
    if (this.weatherType === 'leaves') {
      const colors = ['#f0a500', '#7ec850', '#e8570a', '#c8e050'];
      this.particles.push({
        x, y,
        vy: 0.5 + Math.random() * 0.8,
        r: 2 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 0.5 + Math.random() * 0.5,
        swayOffset: Math.random() * Math.PI * 2,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.1,
        life: 1.0
      });
    } else if (this.weatherType === 'cherryBlossom') {
      const colors = ['#ffb7c5', '#ff9eb5', '#ffc2d1'];
      this.particles.push({
        x, y,
        vy: 0.7 + Math.random() * 0.6,
        r: 3 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 0.6 + Math.random() * 0.4,
        swayOffset: Math.random() * Math.PI * 2,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.15,
        life: 1.0
      });
    } else if (this.weatherType === 'rain') {
      this.particles.push({
        x, y,
        vy: 14 + Math.random() * 6,
        length: 12 + Math.random() * 10,
        alpha: 0.3 + Math.random() * 0.4
      });
    } else if (this.weatherType === 'snow') {
      this.particles.push({
        x, y,
        vx: -0.6 + Math.random() * 1.2,
        vy: 1.5 + Math.random() * 2.0,
        r: 2 + Math.random() * 3,
        alpha: 0.5 + Math.random() * 0.5,
        swayOffset: Math.random() * Math.PI * 2
      });
    }
  }
  
  update(dt, canvasW, canvasH) {
    if (!this.weatherType) return;
    this.time += dt;
    
    if (this.weatherType === 'rain') {
      if (Math.random() < 0.003) { // Occasional thunder
        this.thunderAlpha = 0.8 + Math.random() * 0.2;
      }
      if (this.thunderAlpha > 0) {
        this.thunderAlpha -= dt * 3.0; // Fast fade
        if (this.thunderAlpha < 0) this.thunderAlpha = 0;
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      
      if (this.weatherType === 'leaves' || this.weatherType === 'cherryBlossom') {
        p.y += p.vy;
        p.x += Math.sin(this.time * (this.weatherType === 'cherryBlossom' ? 2.0 : 1.5) + p.swayOffset) * (this.weatherType === 'cherryBlossom' ? 1.2 : 0.8);
        p.rot += p.rotSpeed;
        if (p.y > canvasH - 92) {
           p.life -= 0.03;
           if (p.life <= 0) {
              this.particles.splice(i, 1);
              this.spawnParticle(Math.random() * canvasW);
           }
        }
      } else if (this.weatherType === 'rain') {
        p.y += p.vy;
        p.x -= 2;
        if (p.y > canvasH) {
           this.particles.splice(i, 1);
           this.spawnParticle(Math.random() * canvasW + 200, -20);
        }
      } else if (this.weatherType === 'snow') {
        p.y += p.vy;
        p.x += p.vx + Math.sin(this.time * 1.0 + p.swayOffset) * 0.5;
        if (p.y > canvasH) {
           this.particles.splice(i, 1);
           this.spawnParticle(Math.random() * canvasW);
        }
      }
    }
  }
  
  draw(ctx) {
    if (!this.weatherType) return;
    ctx.save();
    
    if (this.weatherType === 'rain' && this.thunderAlpha > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, this.thunderAlpha)})`;
      ctx.fillRect(0, 0, 1280, 720);
    }

    for (const p of this.particles) {
      if (this.weatherType === 'leaves' || this.weatherType === 'cherryBlossom') {
        ctx.globalAlpha = p.alpha * p.life;
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        if (this.weatherType === 'cherryBlossom') {
           ctx.ellipse(0, 0, p.r, p.r * 0.6, 0, 0, Math.PI * 2);
        } else {
           ctx.moveTo(0, -p.r);
           ctx.lineTo(p.r*0.6, 0);
           ctx.lineTo(0, p.r);
           ctx.lineTo(-p.r*0.6, 0);
        }
        ctx.fill();
        ctx.rotate(-p.rot);
        ctx.translate(-p.x, -p.y);
      } else if (this.weatherType === 'rain') {
        ctx.globalAlpha = p.alpha;
        ctx.strokeStyle = '#a8d8f0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - 2, p.y + p.length);
        ctx.stroke();
      } else if (this.weatherType === 'snow') {
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = '#e8f4ff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

export class Background {
  constructor(manifest) {
    this.manifest  = manifest;   // bg-manifest.json data
    this.bgKey     = null;
    this.flatImage = null;
    this.weather   = new WeatherSystem();
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

    // Assign random weather
    const weathers = ['leaves', 'rain', 'snow', 'cherryBlossom', null];
    let wType;
    if (key === 'bg_1') wType = 'cherryBlossom';
    else if (key === 'bg_2') wType = 'rain';
    else if (key === 'bg_3') wType = 'snow';
    else wType = weathers[Math.floor(Math.random() * weathers.length)];
    
    // We assume CANVAS_W is 1280.
    this.weather.setWeather(wType, 1280);

    console.log(`[BG] Loaded "${key}": static background`);
  }

  /**
   * Update parallax scroll - disabled for static backgrounds.
   */
  update(p1x, p2x, canvasW) {
    this.weather.update(0.016, 1280, 720);
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
    
    this.weather.draw(ctx);
    this._drawFloorTiles(ctx, canvasW, canvasH, 628);
  }

  _getTilePattern(ctx) {
    if (this._tilePattern) return this._tilePattern;
    
    const tCanvas = document.createElement('canvas');
    tCanvas.width = 128;
    tCanvas.height = 64;
    const tctx = tCanvas.getContext('2d');

    // Natural brown dirt base
    tctx.fillStyle = '#4a3219';
    tctx.fillRect(0, 0, 128, 64);

    // Procedural darker dirt/rock speckles for texture
    tctx.fillStyle = '#382210';
    for (let i = 0; i < 40; i++) {
      // Deterministic pseudo-randomness for stable tiling
      const val = (Math.sin(i * 12.345) * 10000);
      const randX = (val - Math.floor(val)) * 128;
      const val2 = (Math.cos(i * 67.89) * 10000);
      const randY = (val2 - Math.floor(val2)) * 64;
      tctx.fillRect(Math.floor(randX), Math.floor(randY), 4, 3);
    }
    
    // Lighter dirt flecks
    tctx.fillStyle = '#614424';
    for (let i = 0; i < 25; i++) {
      const val = (Math.sin(i * 98.76) * 10000);
      const randX = (val - Math.floor(val)) * 128;
      const val2 = (Math.cos(i * 54.321) * 10000);
      const randY = (val2 - Math.floor(val2)) * 64;
      tctx.fillRect(Math.floor(randX), Math.floor(randY), 2, 2);
    }

    // Lush green grass top layer
    tctx.fillStyle = '#3a7d22';
    tctx.fillRect(0, 0, 128, 6);
    
    // Jagged grass edges hanging down
    for (let x = 0; x < 128; x += 4) {
      // Stable pseudo-random drop length
      const val = (Math.sin(x * 1.23) * 10000);
      const drop = Math.floor((val - Math.floor(val)) * 6) + 3; // 3 to 8 pixels
      
      tctx.fillStyle = '#3a7d22'; // Base green
      tctx.fillRect(x, 6, 4, drop);
      
      // Light green grass highlight at the very top
      tctx.fillStyle = '#4da12e';
      tctx.fillRect(x, 0, 4, 2);
      
      // Tiny random light green blades sticking down slightly
      if (drop > 5) {
        tctx.fillRect(x, 2, 2, 4);
      }
    }

    this._tilePattern = ctx.createPattern(tCanvas, 'repeat');
    return this._tilePattern;
  }

  _drawFloorTiles(ctx, w, h, groundY) {
    ctx.save();
    
    // Shift context so floor starts at groundY
    ctx.translate(0, groundY);
    
    // Fill the floor area with the natural dirt/grass pattern
    ctx.fillStyle = this._getTilePattern(ctx);
    ctx.fillRect(0, 0, w, h - groundY);
    
    // Add a cinematic gradient that fades the deep dirt into pure darkness at the bottom
    const grad = ctx.createLinearGradient(0, 0, 0, h - groundY);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.4, 'rgba(0,0,0,0.4)');
    grad.addColorStop(1, 'rgba(0,0,0,0.9)');
    
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h - groundY);
    
    ctx.restore();
  }
}

