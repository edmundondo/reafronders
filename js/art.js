// ReAfronders · generative engine
// Analogy: the map is a turntable platter. Ambient particles are the vinyl's
// groove noise (always flowing); each wonder is a needle drop — an emitter with
// its own motion. Presentation settings are the mixer: speed = pitch, trail =
// reverb tail, glow = master gain, bpm = the pulse everything can lock to.

// ── Simplex noise (Gustavson, public domain) ────────────────────────────────
export function makeNoise(seed = 7) {
  const p = new Uint8Array(256).map((_, i) => i);
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; }
  const perm = new Uint8Array(512); for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const G = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  return function (xin, yin) {
    const s = (xin + yin) * F2, i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2, x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255; let n = 0, tt, g;
    tt = 0.5 - x0 * x0 - y0 * y0; if (tt > 0) { g = G[perm[ii + perm[jj]] & 7]; tt *= tt; n += tt * tt * (g[0] * x0 + g[1] * y0); }
    tt = 0.5 - x1 * x1 - y1 * y1; if (tt > 0) { g = G[perm[ii + i1 + perm[jj + j1]] & 7]; tt *= tt; n += tt * tt * (g[0] * x1 + g[1] * y1); }
    tt = 0.5 - x2 * x2 - y2 * y2; if (tt > 0) { g = G[perm[ii + 1 + perm[jj + 1]] & 7]; tt *= tt; n += tt * tt * (g[0] * x2 + g[1] * y2); }
    return 70 * n;
  };
}

export const PALETTES = {
  zambezi:  { label: 'Zambezi Dusk',   bg: [4, 7, 14],   ambient: ['#1b6f8a', '#2ec4b6', '#3a86ff', '#9bf6ff', '#f4d35e'] },
  savanna:  { label: 'Savanna Gold',   bg: [12, 7, 3],   ambient: ['#7f4f24', '#bb3e03', '#ee9b00', '#e9d8a6', '#ca6702'] },
  kalahari: { label: 'Kalahari Night', bg: [6, 4, 16],   ambient: ['#3a0ca3', '#7209b7', '#f72585', '#4cc9f0', '#b5179e'] },
  baobab:   { label: 'Baobab Green',   bg: [3, 10, 6],   ambient: ['#1b4332', '#40916c', '#95d5b2', '#d8f3dc', '#ffb703'] },
  mono:     { label: 'Monochrome',     bg: [2, 2, 3],    ambient: ['#3d3d3d', '#7a7a7a', '#bdbdbd', '#ffffff', '#9e9e9e'] },
  country:  { label: "Country's own palette", bg: [4, 6, 10], ambient: null },
};
export const MODES = { flow: 'Flow — curl-noise rivers', pulse: 'Pulse — locks to BPM', constellation: 'Constellation — wonders connected' };
export const MOTIONS = ['cascade', 'orbit', 'ripple', 'sink', 'zigzag', 'herd', 'mist', 'bloom'];

export class Art {
  constructor(canvas, bloom) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.b = bloom; this.bctx = bloom.getContext('2d');
    this.noise = makeNoise(1980);
    this.settings = {}; this.emitters = []; this.chain = [];
    this.mask = null; this.focusMask = null; this.focusBounds = null; this.selected = null;
    this.t = 0; this.lastBeat = 0; this.n = 0; this.running = true;
    this.resize();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.w = window.innerWidth; this.h = window.innerHeight;
    this.c.width = this.w * this.dpr; this.c.height = this.h * this.dpr;
    this.b.width = Math.ceil(this.w / 3); this.b.height = Math.ceil(this.h / 3);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.clear();
  }

  clear() { const [r, g, b] = this.bgRGB(); this.ctx.fillStyle = `rgb(${r},${g},${b})`; this.ctx.fillRect(0, 0, this.w, this.h); }
  bgRGB() { return (PALETTES[this.settings.palette] || PALETTES.zambezi).bg; }

  // Masks: a low-res stencil of the continent (and focused country) so particles know where "land" is.
  setMasks(path, landFeatures, focusFeature) {
    const ms = 0.25, mw = Math.ceil(this.w * ms), mh = Math.ceil(this.h * ms);
    const draw = (features) => {
      const oc = new OffscreenCanvasShim(mw, mh); const x = oc.ctx;
      x.setTransform(ms, 0, 0, ms, 0, 0); x.fillStyle = '#fff'; x.beginPath();
      const p = path.context(x); features.forEach(f => p(f)); x.fill(); path.context(null);
      const d = x.getImageData(0, 0, mw, mh).data, m = new Uint8Array(mw * mh);
      for (let i = 0; i < m.length; i++) m[i] = d[i * 4] > 40 ? 1 : 0;
      return m;
    };
    this.ms = ms; this.mw = mw; this.mh = mh;
    const area = (m) => { let c = 0; for (let i = 0; i < m.length; i++) c += m[i]; return c / (ms * ms); };
    this.mask = draw(landFeatures); this.landArea = area(this.mask);
    if (focusFeature) { this.focusMask = draw([focusFeature]); this.focusArea = area(this.focusMask); const b = path.bounds(focusFeature); this.focusBounds = b; }
    else { this.focusMask = null; this.focusBounds = null; }
    const lb = path.bounds({ type: 'FeatureCollection', features: landFeatures }); this.landBounds = lb;
  }
  inMask(m, x, y) {
    if (!m) return true; const ix = (x * this.ms) | 0, iy = (y * this.ms) | 0;
    return ix >= 0 && iy >= 0 && ix < this.mw && iy < this.mh && m[iy * this.mw + ix] === 1;
  }

  // emitters: [{x,y,color,intensity,motion,id}], radius: px spread
  setEmitters(emitters, radius) { this.emitters = emitters; this.radius = radius; this.chain = emitters; this.rebuildColors(); }
  setSelected(id) { this.selected = id; }
  setCountryPalette(pal) { this.countryPalette = pal && pal.length ? pal : null; this.rebuildColors(); }

  apply(settings) {
    const prevN = this.n, prevPal = this.settings.palette;
    this.settings = { ...settings };
    if (prevPal !== settings.palette) this.clear();
    if ((settings.particles | 0) !== prevN) this.alloc(settings.particles | 0);
    this.rebuildColors();
  }

  rebuildColors() {
    const pal = PALETTES[this.settings.palette] || PALETTES.zambezi;
    const amb = pal.ambient || this.countryPalette || PALETTES.zambezi.ambient;
    const cp = this.countryPalette || amb;
    this.colors = [...amb, ...cp, ...this.emitters.map(e => e.color || '#ffffff')];
    this.ambN = amb.length; this.cpN = cp.length;
    this.buckets = this.colors.map(() => []);
    if (this.n) for (let i = 0; i < this.n; i++) this.spawn(i, true);
  }

  alloc(n) {
    this.n = n;
    this.x = new Float32Array(n); this.y = new Float32Array(n);
    this.px = new Float32Array(n); this.py = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n);
    this.age = new Float32Array(n); this.life = new Float32Array(n);
    this.kind = new Int16Array(n);   // -1 ambient, -2 focus-ambient, >=0 emitter index
    this.col = new Int16Array(n); this.u = new Float32Array(n);
  }

  pickEmitter() {
    const E = this.emitters; if (!E.length) return -1;
    let tot = 0; for (const e of E) tot += (e.intensity ?? 0.8) * (e.id === this.selected ? 3 : 1);
    let r = Math.random() * tot;
    for (let i = 0; i < E.length; i++) { r -= (E[i].intensity ?? 0.8) * (E[i].id === this.selected ? 3 : 1); if (r <= 0) return i; }
    return E.length - 1;
  }

  spawn(i, scatter = false) {
    const share = this.emitters.length ? (this.settings.mode === 'constellation' ? 0.45 : 0.35) : 0;
    const roll = Math.random();
    this.vx[i] = 0; this.vy[i] = 0; this.age[i] = scatter ? Math.random() * 120 : 0;
    if (roll < share) {
      const k = this.pickEmitter(), e = this.emitters[k], R = this.radius;
      this.kind[i] = k; this.col[i] = this.ambN + this.cpN + k; this.life[i] = 50 + Math.random() * 110;
      const a = Math.random() * Math.PI * 2, rr = R * Math.sqrt(Math.random());
      let x = e.x + Math.cos(a) * rr, y = e.y + Math.sin(a) * rr;
      if (e.motion === 'cascade') { x = e.x + (Math.random() - 0.5) * R * 1.6; y = e.y - R * 0.7 + Math.random() * R * 0.2; }
      if (e.motion === 'sink') { x = e.x + Math.cos(a) * R * 1.6; y = e.y + Math.sin(a) * R * 1.6; }
      if (this.settings.mode === 'constellation') { this.u[i] = Math.random(); this.life[i] = 160 + Math.random() * 200; }
      this.x[i] = this.px[i] = x; this.y[i] = this.py[i] = y; return;
    }
    // ambient: half of them crowd into the focused country, wearing its colours
    const useFocus = this.focusMask && Math.random() < 0.5;
    const m = useFocus ? this.focusMask : this.mask, b = useFocus ? this.focusBounds : (this.landBounds || [[0, 0], [this.w, this.h]]);
    let x = 0, y = 0;
    for (let t = 0; t < 24; t++) {
      x = b[0][0] + Math.random() * (b[1][0] - b[0][0]); y = b[0][1] + Math.random() * (b[1][1] - b[0][1]);
      if (this.inMask(m, x, y)) break;
    }
    this.kind[i] = useFocus ? -2 : -1;
    this.col[i] = useFocus ? this.ambN + ((Math.random() * this.cpN) | 0) : (Math.random() * this.ambN) | 0;
    this.life[i] = 80 + Math.random() * 220;
    this.x[i] = this.px[i] = x; this.y[i] = this.py[i] = y;
  }

  curl(x, y, sc, tz) {
    const e = 0.5, n = this.noise;
    const a = n(x * sc, (y + e) * sc + tz), b = n(x * sc, (y - e) * sc + tz);
    const c = n((x + e) * sc + tz, y * sc), d = n((x - e) * sc + tz, y * sc);
    return [(a - b) / (2 * e * sc), -(c - d) / (2 * e * sc)];
  }

  frame(dt = 1) {
    if (!this.n) return;
    const S = this.settings, ctx = this.ctx, speed = S.speed ?? 1, vort = S.vortex ?? 1;
    this.t += 0.0016 * speed * dt;
    const tz = this.t, sc = 0.0042, mode = S.mode || 'flow';
    // beat clock (pulse mode): envelope = kick drum decay
    const bpm = S.bpm || 112, beatPos = (performance.now() / 1000) * (bpm / 60);
    const phase = beatPos % 1, env = Math.exp(-phase * 5);
    const kick = mode === 'pulse' && Math.floor(beatPos) !== this.lastBeat; this.lastBeat = Math.floor(beatPos);

    // fade = trail length
    const [r, g, b] = this.bgRGB();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(${r},${g},${b},${Math.max(0.02, 1 - (S.trail ?? 0.92))})`;
    ctx.fillRect(0, 0, this.w, this.h);

    // constellation threads
    if (mode === 'constellation' && this.chain.length > 1) {
      ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 0.6;
      ctx.strokeStyle = `rgba(255,255,255,${0.05 + 0.04 * Math.sin(this.t * 40)})`;
      ctx.beginPath(); this.chain.forEach((e, k) => k ? ctx.lineTo(e.x, e.y) : ctx.moveTo(e.x, e.y)); ctx.stroke();
    }

    const B = this.buckets; for (const a of B) a.length = 0;
    const E = this.emitters, R = this.radius || 10;
    for (let i = 0; i < this.n; i++) {
      let x = this.x[i], y = this.y[i]; this.px[i] = x; this.py[i] = y;
      const k = this.kind[i];
      let [fx, fy] = this.curl(x, y, k >= 0 ? sc * 2.2 : sc, tz);
      let ax = fx * 0.9, ay = fy * 0.9, damp = 0.86;
      if (k >= 0) {
        const e = E[k]; if (!e) { this.spawn(i); continue; }
        const dx = x - e.x, dy = y - e.y, d = Math.hypot(dx, dy) + 0.001, nx = dx / d, ny = dy / d;
        ax *= 0.45; ay *= 0.45;
        if (mode === 'constellation' && E.length > 1) {
          const n2 = E[(k + 1) % E.length]; this.u[i] += 0.004 * speed * dt;
          const u = this.u[i] % 1, wob = Math.sin(u * Math.PI) * R * 0.8 * this.noise(i * 0.1, this.t * 20);
          const tx = e.x + (n2.x - e.x) * u, ty = e.y + (n2.y - e.y) * u, len = Math.hypot(n2.x - e.x, n2.y - e.y) + 0.001;
          x = tx + (-(n2.y - e.y) / len) * wob; y = ty + ((n2.x - e.x) / len) * wob;
          this.x[i] = x; this.y[i] = y;
        } else {
          switch (e.motion) {
            case 'cascade': ax += (Math.random() - 0.5) * 0.3; ay += 0.9; break;
            case 'orbit':   ax += -ny * 1.3 * vort - nx * 0.25 * (d > R); ay += nx * 1.3 * vort - ny * 0.25 * (d > R); break;
            case 'ripple':  ax += nx * 0.7; ay += ny * 0.7; break;
            case 'sink':    ax += (-ny * 1.0 - nx * 0.7) * vort; ay += (nx * 1.0 - ny * 0.7) * vort; if (d < 2) this.age[i] = 1e9; break;
            case 'zigzag':  ax += (Math.sin(this.age[i] * 0.18) > 0 ? 0.9 : -0.9); ay += 0.55; break;
            case 'herd':    ax = fx * 0.8 - nx * 0.12 * (d > R * 1.4); ay = fy * 0.8 - ny * 0.12 * (d > R * 1.4); damp = 0.93; break;
            case 'mist':    ax += fx * 0.6; ay += -0.35; damp = 0.92; break;
            case 'bloom': { const p = Math.sin(this.age[i] * 0.09 + k); ax += nx * p * 0.8 - ny * 0.3 * vort; ay += ny * p * 0.8 + nx * 0.3 * vort; if (d > R * 2.4) this.age[i] = 1e9; break; }
          }
          if (kick) { ax += nx * 4; ay += ny * 4; }
          this.vx[i] = this.vx[i] * damp + ax * speed * 0.6; this.vy[i] = this.vy[i] * damp + ay * speed * 0.6;
          x += this.vx[i] * dt; y += this.vy[i] * dt; this.x[i] = x; this.y[i] = y;
          if (d > R * 4.5) this.age[i] = 1e9;
        }
      } else {
        this.vx[i] = this.vx[i] * damp + ax * speed * 0.55; this.vy[i] = this.vy[i] * damp + ay * speed * 0.55;
        x += this.vx[i] * dt; y += this.vy[i] * dt; this.x[i] = x; this.y[i] = y;
        if (!this.inMask(this.mask, x, y)) this.age[i] = 1e9;
      }
      this.age[i] += dt;
      if (this.age[i] > this.life[i]) { this.spawn(i); continue; }
      B[this.col[i]].push(i);
    }

    // draw: one stroke per colour (cheap, silky)
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    // density-aware exposure: crowded areas get lighter strokes so light never clips to white
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const shareE = E.length ? (mode === 'constellation' ? 0.45 : 0.35) : 0, nAmb = this.n * (1 - shareE);
    const fA = this.focusMask ? 0.5 : 0;
    const ambExp = clamp((this.landArea || 4e5) / (nAmb * (1 - fA) + 1) / 350, 0.2, 1) * (this.focusMask ? 0.55 : 1);
    const focExp = this.focusMask ? clamp((this.focusArea || 1e5) / (nAmb * fA + 1) / 350, 0.2, 1) : 1;
    const emExp = E.length ? clamp((Math.PI * 4 * R * R) / ((this.n * shareE) / E.length + 1) / 60, 0.1, 1) : 1;
    const pulse = mode === 'pulse' ? 0.35 + 0.65 * env : 1, ambA = (mode === 'constellation' ? 0.2 : 0.34) * ambExp;
    for (let c = 0; c < B.length; c++) {
      const L = B[c]; if (!L.length) continue;
      const isEm = c >= this.ambN + this.cpN, isFocus = !isEm && c >= this.ambN;
      ctx.strokeStyle = this.colors[c];
      ctx.globalAlpha = isEm ? 0.8 * emExp * pulse : (isFocus ? 0.5 * focExp : ambA) * (mode === 'pulse' ? 0.6 + 0.4 * env : 1);
      ctx.lineWidth = isEm ? 1.3 : 0.9;
      ctx.beginPath();
      for (const i of L) { ctx.moveTo(this.px[i], this.py[i]); ctx.lineTo(this.x[i] + 0.01, this.y[i]); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    // bloom pass (CSS-blurred low-res copy = cheap "glow")
    this.bctx.clearRect(0, 0, this.b.width, this.b.height);
    this.bctx.drawImage(this.c, 0, 0, this.b.width, this.b.height);
    this.b.style.opacity = String((S.glow ?? 0.8) * (mode === 'pulse' ? 0.6 + 0.4 * env : 1));
  }
}

// Offscreen canvas that also works in older Safari
class OffscreenCanvasShim {
  constructor(w, h) {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    this.ctx = c.getContext('2d', { willReadFrequently: true });
  }
}
