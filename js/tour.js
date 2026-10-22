// ReAfronders · Virtual tour
// The wonder's particle swarm "learns" the real footage: each particle samples
// the colour under it and flows along the image's edges, then the video itself
// resolves out of the swarm. Think of it as a DJ blend: particles are the
// outgoing track, the footage is the incoming one, the Morph knob is the crossfader.

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hexRGB = (h) => { const n = parseInt((h || '#ffffff').slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

export class Tour {
  constructor({ getList, onClose, onChange, noise }) {
    this.getList = getList; this.onClose = onClose; this.onChange = onChange; this.noise = noise;
    this.el = document.getElementById('tour');
    this.video = document.getElementById('tour-video');
    this.c = document.getElementById('tour-canvas'); this.ctx = this.c.getContext('2d');
    this.sc = document.createElement('canvas'); this.sctx = this.sc.getContext('2d', { willReadFrequently: true });
    this.opts = { morph: 0.22, loop: 30, trans: 4, muted: true };
    try { Object.assign(this.opts, JSON.parse(localStorage.getItem('reafronders:tour') || '{}')); } catch { }
    this.playing = true; this.open = false; this.t = 0; this.frame = 0; this.pixels = null; this.sampleOK = false;
    this.bind();
    addEventListener('resize', () => this.open && this.resize());
  }

  saveOpts() { try { localStorage.setItem('reafronders:tour', JSON.stringify(this.opts)); } catch { } }

  bind() {
    const $ = (s) => this.el.querySelector(s);
    this.ui = { play: $('[data-t=play]'), mute: $('[data-t=mute]'), bar: $('.t-progress'), fill: $('.t-fill'), time: $('.t-time'),
      morph: $('#t-morph'), loop: $('#t-loop'), trans: $('#t-trans'), name: $('.t-name'), kick: $('.t-kick'), credit: $('.t-credit'), empty: $('.t-empty'), note: $('.t-note') };
    this.ui.morph.value = this.opts.morph; this.ui.loop.value = this.opts.loop; this.ui.trans.value = this.opts.trans;
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      ({ play: () => this.toggle(), mute: () => this.setMute(!this.opts.muted), prev: () => this.step(-1), next: () => this.step(1),
        remorph: () => this.restart(), full: () => this.fullscreen(), close: () => this.close() })[b.dataset.t]?.();
    });
    this.ui.bar.addEventListener('click', (e) => { const r = this.ui.bar.getBoundingClientRect(); this.seek(((e.clientX - r.left) / r.width) * this.opts.loop); });
    this.ui.morph.oninput = () => { this.opts.morph = +this.ui.morph.value; this.saveOpts(); };
    this.ui.loop.onchange = () => { this.opts.loop = +this.ui.loop.value; this.saveOpts(); };
    this.ui.trans.oninput = () => { this.opts.trans = +this.ui.trans.value; this.saveOpts(); };
    this.video.addEventListener('error', () => this.markNoVideo('Footage could not load — check the URL in Studio.'));
    addEventListener('keydown', (e) => {
      if (!this.open || e.target.matches('input, textarea, select')) return;
      const k = e.key.toLowerCase();
      if (k === ' ') { e.preventDefault(); this.toggle(); }
      else if (k === 'm') this.setMute(!this.opts.muted);
      else if (k === 'arrowright') this.step(1);
      else if (k === 'arrowleft') this.step(-1);
      else if (k === 'r') this.restart();
      else if (k === 'f') this.fullscreen();
      else if (k === 'escape') { e.stopImmediatePropagation(); this.close(); }
    }, true);
  }

  resize() {
    this.dpr = Math.min(devicePixelRatio || 1, 1.5);
    this.w = innerWidth; this.h = innerHeight;
    this.c.width = this.w * this.dpr; this.c.height = this.h * this.dpr; this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.sw = Math.ceil(this.w / 6); this.sh = Math.ceil(this.h / 6); this.sc.width = this.sw; this.sc.height = this.sh;
    const n = Math.round(Math.min(5200, (this.w * this.h) / 260));
    if (n !== this.n) this.alloc(n);
  }

  alloc(n) {
    this.n = n;
    this.x = new Float32Array(n); this.y = new Float32Array(n); this.px = new Float32Array(n); this.py = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.age = new Float32Array(n); this.life = new Float32Array(n);
    this.r = new Float32Array(n); this.g = new Float32Array(n); this.b = new Float32Array(n);
    this.hx = new Float32Array(n); this.hy = new Float32Array(n);
  }

  // origin: {x,y} screen point of the wonder on the map — the swarm bursts from there
  show(wonder, origin) {
    this.open = true; this.el.hidden = false; document.body.classList.add('touring');
    requestAnimationFrame(() => this.el.classList.add('in'));
    this.resize(); this.load(wonder, origin);
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame((t) => this.tick(t)); }
  }

  load(w, origin) {
    this.w0 = w; this.t = 0; this.pixels = null; this.sampleOK = false; this.hasVideo = false;
    this.base = hexRGB(w.art?.color); this.motion = w.art?.motion || 'orbit';
    const ox = origin?.x ?? this.w / 2, oy = origin?.y ?? this.h / 2;
    this.ox = ox; this.oy = oy;
    for (let i = 0; i < this.n; i++) {
      // every particle starts at the wonder's map point and blooms out to a "home" on screen
      this.hx[i] = Math.random() * this.w; this.hy[i] = Math.random() * this.h;
      this.x[i] = this.px[i] = ox; this.y[i] = this.py[i] = oy;
      this.vx[i] = this.vy[i] = 0; this.age[i] = Math.random() * 60; this.life[i] = 160 + Math.random() * 220;
      this.r[i] = this.base[0]; this.g[i] = this.base[1]; this.b[i] = this.base[2];
    }
    this.ctx.globalCompositeOperation = 'source-over'; this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = '#000'; this.ctx.fillRect(0, 0, this.w, this.h);

    const m = w.media || {};
    this.ui.kick.textContent = `${w.category} · virtual tour`;
    this.ui.name.textContent = w.name;
    this.ui.note.textContent = m.note || '';
    this.ui.credit.innerHTML = m.video ? `Footage: ${esc(m.credit || 'unknown')} · ${m.source ? `<a href="${esc(m.source)}" target="_blank" rel="noopener">${esc(m.license || 'source')}</a>` : esc(m.license || '')}` : '';
    this.video.pause(); this.video.removeAttribute('src'); this.video.innerHTML = '';
    this.video.style.opacity = 0;
    if (m.video) {
      this.hasVideo = true; this.ui.empty.hidden = true;
      this.video.crossOrigin = 'anonymous'; this.video.loop = true; this.video.muted = this.opts.muted; this.video.playsInline = true;
      const srcs = [[m.video, /\.webm(\?|$)/i.test(m.video) ? 'video/webm' : 'video/mp4']];
      if (m.fallback) srcs.push([m.fallback, 'video/mp4']);
      for (const [src, type] of srcs) { const s = document.createElement('source'); s.src = src; s.type = type; this.video.appendChild(s); }
      this.video.load();
      this.video.addEventListener('loadeddata', () => { this.video.currentTime = +m.start || 0; if (this.playing) this.video.play().catch(() => { }); }, { once: true });
    } else this.markNoVideo('Footage coming soon — add a video URL for this wonder in Studio → Edit → Virtual tour.');
    this.setMute(this.opts.muted, true); this.syncPlay();
    this.onChange?.(w);
  }

  markNoVideo(msg) { this.hasVideo = false; this.ui.empty.hidden = false; this.ui.empty.textContent = msg; this.video.style.opacity = 0; }

  toggle() { this.playing = !this.playing; this.syncPlay(); }
  syncPlay() {
    this.ui.play.textContent = this.playing ? '❚❚' : '▶'; this.ui.play.setAttribute('aria-label', this.playing ? 'Pause' : 'Play');
    if (this.hasVideo) this.playing ? this.video.play().catch(() => { }) : this.video.pause();
  }
  setMute(m, silent) {
    this.opts.muted = m; this.video.muted = m; this.ui.mute.textContent = m ? '🔇' : '🔊';
    this.ui.mute.setAttribute('aria-label', m ? 'Unmute' : 'Mute'); if (!silent) this.saveOpts();
  }
  restart() { this.t = 0; if (this.hasVideo) this.video.currentTime = +this.w0.media?.start || 0; }
  seek(s) { this.t = Math.max(0, Math.min(this.opts.loop - 0.01, s)); }
  step(d) {
    const list = this.getList(); if (!list.length) return;
    const i = list.findIndex(w => w.id === this.w0.id), w = list[(i + d + list.length) % list.length];
    this.load(w, { x: this.w / 2, y: this.h / 2 });
  }
  fullscreen() { try { document.fullscreenElement ? document.exitFullscreen() : this.el.requestFullscreen(); } catch { } }
  close() {
    this.open = false; this.el.classList.remove('in'); document.body.classList.remove('touring');
    this.video.pause(); cancelAnimationFrame(this.raf); this.raf = null;
    try { if (document.fullscreenElement === this.el) document.exitFullscreen(); } catch { }
    setTimeout(() => { if (!this.open) this.el.hidden = true; }, 500);
    this.onClose?.();
  }

  // sample the current video frame with the same "cover" crop the <video> uses
  sample() {
    const v = this.video; if (!this.hasVideo || v.readyState < 2 || !v.videoWidth) return;
    const s = Math.max(this.w / v.videoWidth, this.h / v.videoHeight), cw = this.w / s, ch = this.h / s;
    try {
      this.sctx.drawImage(v, (v.videoWidth - cw) / 2, (v.videoHeight - ch) / 2, cw, ch, 0, 0, this.sw, this.sh);
      this.pixels = this.sctx.getImageData(0, 0, this.sw, this.sh).data; this.sampleOK = true;
    } catch { this.sampleOK = false; this.pixels = null; } // tainted (no CORS) → plain crossfade
  }
  lum(ix, iy) {
    ix = Math.max(0, Math.min(this.sw - 1, ix)); iy = Math.max(0, Math.min(this.sh - 1, iy));
    const k = (iy * this.sw + ix) * 4, p = this.pixels; return p[k] * 0.3 + p[k + 1] * 0.59 + p[k + 2] * 0.11;
  }

  tick(now) {
    if (!this.open) return;
    this.raf = requestAnimationFrame((t) => this.tick(t));
    const dt = Math.min((now - this.last) / 1000, 0.25); this.last = now;
    const L = this.opts.loop, T = Math.min(this.opts.trans, L / 2 - 0.5);
    if (this.playing) { this.t += dt; if (this.t >= L) this.restart(); }
    const t = this.t;
    // envelope: 0 = pure particles, 1 = pure footage
    const env = this.hasVideo ? smooth(T * 0.35, T, t) * (1 - smooth(L - T, L - T * 0.25, t)) : 0;
    // how strongly particles adopt footage colours/edges
    const learn = this.hasVideo && this.sampleOK ? Math.max(smooth(0, T * 0.7, t) * (1 - smooth(L - T * 0.25, L, t)), 0) : 0;

    if (this.frame++ % 3 === 0) this.sample();
    this.video.style.opacity = env.toFixed(3);
    this.video.style.filter = `blur(${((1 - env) * 22).toFixed(1)}px) saturate(${(1 + (1 - env) * 0.6).toFixed(2)})`;

    const ctx = this.ctx, veil = env > 0.98 ? this.opts.morph : 1 - env * (1 - this.opts.morph);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(0,0,0,${0.06 + env * 0.25})`; ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
    const cx = this.w / 2, cy = this.h / 2, R = Math.min(this.w, this.h) * 0.32, nz = this.noise, tz = now * 0.00006;
    const P = this.pixels, sx = this.sw / this.w, sy = this.sh / this.h;
    ctx.globalAlpha = Math.max(0.04, veil) * 0.4;

    const BLOOM = 1.4, bloomK = t < BLOOM ? 1 - Math.pow(1 - t / BLOOM, 3) : 1;
    if (t < BLOOM) ctx.globalAlpha = 0.35;
    for (let i = 0; i < this.n; i++) {
      let x = this.x[i], y = this.y[i]; this.px[i] = x; this.py[i] = y;
      if (t < BLOOM) { // the swarm leaves the map point and fans out across the screen
        const sw = this.noise(i * 0.013, t * 2) * 60 * (1 - bloomK);
        this.x[i] = this.ox + (this.hx[i] - this.ox) * bloomK + sw; this.y[i] = this.oy + (this.hy[i] - this.oy) * bloomK - sw;
        ctx.strokeStyle = `rgb(${this.r[i] | 0},${this.g[i] | 0},${this.b[i] | 0})`;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(this.x[i] + 0.01, this.y[i]); ctx.stroke(); continue;
      }
      // flow: curl-ish noise + motion signature + (when learning) glide along image edges
      const a = nz(x * 0.003 + tz, y * 0.003 - tz) * Math.PI * 2;
      let ax = Math.cos(a) * 0.35, ay = Math.sin(a) * 0.35;
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) + 0.01, nx = dx / d, ny = dy / d, k = 1 - learn;
      switch (this.motion) {
        case 'cascade': ay += 0.5 * k; break;
        case 'orbit': ax += -ny * 0.6 * k - nx * 0.15 * k * (d > R); ay += nx * 0.6 * k - ny * 0.15 * k * (d > R); break;
        case 'sink': ax += (-ny * 0.6 - nx * 0.25) * k; ay += (nx * 0.6 - ny * 0.25) * k; break;
        case 'ripple': ax += nx * 0.3 * k; ay += ny * 0.3 * k; break;
        case 'mist': ay -= 0.3 * k; break;
        case 'zigzag': ax += (Math.sin(this.age[i] * 0.15) > 0 ? 0.5 : -0.5) * k; ay += 0.25 * k; break;
        default: ax -= nx * 0.08 * k * (d > R); ay -= ny * 0.08 * k * (d > R);
      }
      if (learn > 0 && P) {
        const ix = (x * sx) | 0, iy = (y * sy) | 0;
        const gx = this.lum(ix + 1, iy) - this.lum(ix - 1, iy), gy = this.lum(ix, iy + 1) - this.lum(ix, iy - 1);
        const gm = Math.hypot(gx, gy) + 0.001;
        ax += (-gy / gm) * 0.9 * learn; ay += (gx / gm) * 0.9 * learn; // tangent to edges, like brush strokes
        const q = (Math.max(0, Math.min(this.sh - 1, iy)) * this.sw + Math.max(0, Math.min(this.sw - 1, ix))) * 4;
        const m = 0.12 * learn;
        this.r[i] += (P[q] - this.r[i]) * m; this.g[i] += (P[q + 1] - this.g[i]) * m; this.b[i] += (P[q + 2] - this.b[i]) * m;
      } else {
        this.r[i] += (this.base[0] - this.r[i]) * 0.02; this.g[i] += (this.base[1] - this.g[i]) * 0.02; this.b[i] += (this.base[2] - this.b[i]) * 0.02;
      }
      this.vx[i] = this.vx[i] * 0.9 + ax; this.vy[i] = this.vy[i] * 0.9 + ay;
      x += this.vx[i] * (this.playing ? 1 : 0.15); y += this.vy[i] * (this.playing ? 1 : 0.15);
      this.age[i]++;
      if (this.age[i] > this.life[i] || x < -20 || y < -20 || x > this.w + 20 || y > this.h + 20) {
        // respawn: anywhere once the swarm has "learned" the scene, near centre before
        x = Math.random() * this.w; y = Math.random() * this.h;
        this.px[i] = x; this.py[i] = y; this.vx[i] = this.vy[i] = 0; this.age[i] = 0;
      }
      this.x[i] = x; this.y[i] = y;
      ctx.strokeStyle = `rgb(${this.r[i] | 0},${this.g[i] | 0},${this.b[i] | 0})`;
      ctx.beginPath(); ctx.moveTo(this.px[i], this.py[i]); ctx.lineTo(x + 0.01, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    this.ui.fill.style.width = `${(t / L) * 100}%`;
    const phase = !this.hasVideo ? 'particles' : t < T ? 'morphing in' : t > L - T ? 'dissolving' : 'footage';
    this.ui.time.textContent = `${Math.floor(t)}s / ${L}s · ${phase}`;
  }
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
