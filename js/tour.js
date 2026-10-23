// ReAfronders · Virtual tour (floating loop player)
// The player is a card that floats beside the wonder's pin on the map and follows
// it as the map moves. Inside, the wonder's particle swarm "learns" the real
// footage — each particle samples the colour under it and flows along the image's
// edges — then the video resolves out of the swarm and later dissolves back.
// DJ terms: particles = outgoing track, footage = incoming track, Veil = wet/dry.
import { BRAND } from './config.js?v=20261023a';

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hexRGB = (h) => { const n = parseInt((h || '#ffffff').slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isMobile = () => innerWidth <= 720;

export class Tour {
  // anchorOf(w) → [x,y] screen point of a wonder; avoidRects() → [DOMRect] to keep clear of
  constructor({ getList, onClose, onChange, noise, anchorOf, avoidRects }) {
    Object.assign(this, { getList, onClose, onChange, noise, anchorOf, avoidRects: avoidRects || (() => []) });
    this.el = document.getElementById('tour');
    this.stage = this.el.querySelector('.t-stage');
    this.video = document.getElementById('tour-video');
    this.photos = this.el.querySelector('.t-photos'); this.ph = [...this.photos.querySelectorAll('img')]; this.front = 0;
    this.c = document.getElementById('tour-canvas'); this.ctx = this.c.getContext('2d');
    this.leader = document.getElementById('tour-leader');
    this.sc = document.createElement('canvas'); this.sctx = this.sc.getContext('2d', { willReadFrequently: true });
    this.opts = { morph: 0.22, loop: 30, trans: 4, muted: true };
    try { Object.assign(this.opts, JSON.parse(localStorage.getItem('reafronders:tour') || '{}')); } catch { }
    this.playing = true; this.open = false; this.expanded = false; this.journey = null;
    this.t = 0; this.frame = 0; this.pixels = null; this.sampleOK = false;
    this.pos = null; this.scale = 0; this.scaleTarget = 0;
    this.bind();
    addEventListener('resize', () => this.open && this.layout(true));
  }

  saveOpts() { try { localStorage.setItem('reafronders:tour', JSON.stringify(this.opts)); } catch { } }

  bind() {
    const $ = (s) => this.el.querySelector(s);
    this.ui = { play: $('[data-t=play]'), mute: $('[data-t=mute]'), bar: $('.t-progress'), fill: $('.t-fill'), time: $('.t-time'),
      morph: $('#t-morph'), loop: $('#t-loop'), trans: $('#t-trans'), name: $('.t-name'), kick: $('.t-kick'), credit: $('.t-credit'),
      empty: $('.t-empty'), note: $('.t-note'), expand: $('[data-t=expand]'), controls: $('.t-controls') };
    this.ui.morph.value = this.opts.morph; this.ui.loop.value = this.opts.loop; this.ui.trans.value = this.opts.trans;
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      ({ play: () => this.toggle(), mute: () => this.setMute(!this.opts.muted), prev: () => this.step(-1), next: () => this.step(1),
        remorph: () => this.restart(), expand: () => this.setExpanded(!this.expanded), full: () => this.fullscreen(), close: () => this.close() })[b.dataset.t]?.();
    });
    this.ui.bar.addEventListener('click', (e) => { const r = this.ui.bar.getBoundingClientRect(); this.seek(((e.clientX - r.left) / r.width) * this.loopLen()); });
    this.ui.morph.oninput = () => { this.opts.morph = +this.ui.morph.value; this.saveOpts(); };
    this.ui.loop.onchange = () => { this.opts.loop = +this.ui.loop.value; this.saveOpts(); };
    this.ui.trans.oninput = () => { this.opts.trans = +this.ui.trans.value; this.saveOpts(); };
    // a broken video falls back to the photo loop when there is one
    this.video.addEventListener('error', (e) => {
      const srcs = this.video.querySelectorAll('source');
      if (e.target.tagName === 'SOURCE' && e.target !== srcs[srcs.length - 1]) return; // the browser will try the next source
      if (!this.hasVideo) return;
      if (this.images?.length) this.usePhotos(); else this.markNoVideo('Footage could not load — check the URL in Studio.');
    }, true);
    addEventListener('keydown', (e) => {
      if (!this.open || this.journey || e.target.matches('input, textarea, select')) return;
      const k = e.key.toLowerCase();
      if (k === ' ') { e.preventDefault(); this.toggle(); }
      else if (k === 'm') this.setMute(!this.opts.muted);
      else if (k === 'arrowright') this.step(1);
      else if (k === 'arrowleft') this.step(-1);
      else if (k === 'r') this.restart();
      else if (k === 'x') this.setExpanded(!this.expanded);
      else if (k === 'f') this.fullscreen();
      else if (k === 'escape') { e.stopImmediatePropagation(); this.expanded ? this.setExpanded(false) : this.close(); }
    }, true);
  }

  // ── sizing & placement ──────────────────────────────────────────────────
  // Card width scales with the screen: ~36% of width, capped by height, 260–620 px.
  cardWidth() {
    if (this.expanded) return innerWidth;
    if (isMobile()) return innerWidth - 32;
    return Math.round(clamp(Math.min(innerWidth * 0.36, innerHeight * 0.5 * 16 / 9), 260, 620));
  }
  layout(force) {
    const W = this.cardWidth();
    if (!force && W === this.cw) return;
    this.cw = W;
    this.el.style.width = this.expanded ? '100vw' : `${W}px`;
    this.el.classList.toggle('compact', !this.expanded && W < 440);
    const sw = this.expanded ? innerWidth : W, sh = this.expanded ? innerHeight : Math.round(W * 9 / 16);
    this.stage.style.height = `${sh}px`;
    this.resizeCanvas(sw, sh);
  }
  resizeCanvas(w, h) {
    this.dpr = Math.min(devicePixelRatio || 1, 1.5);
    this.w = w; this.h = h;
    this.c.width = w * this.dpr; this.c.height = h * this.dpr; this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.sw = Math.ceil(w / 6); this.sh = Math.ceil(h / 6); this.sc.width = this.sw; this.sc.height = this.sh;
    const n = Math.round(clamp((w * h) / 120, 600, 5200));
    if (n !== this.n) { this.alloc(n); if (this.w0) this.seed(this.w / 2, this.h / 2); }
  }
  // choose the side of the pin with the most room, avoiding panels; ease toward it
  target(ax, ay) {
    const W = this.el.offsetWidth, H = this.el.offsetHeight, vw = innerWidth, vh = innerHeight;
    const m = 16, top = this.journey ? 16 : 72, gap = 34;
    if (isMobile()) return [m, ay < vh * 0.5 ? vh - H - m : top];
    const avoid = this.avoidRects().filter(Boolean);
    const cands = [[ax + gap, ay - H * 0.42], [ax - gap - W, ay - H * 0.42], [ax - W * 0.5, ay - gap - H], [ax - W * 0.5, ay + gap],
      [ax + gap, ay - H + 30], [ax + gap, ay - 30], [ax - gap - W, ay - H + 30], [ax - gap - W, ay - 30]];
    let best = null, bestScore = Infinity;
    for (const [x0, y0] of cands) {
      const x = clamp(x0, m, vw - W - m), y = clamp(y0, top, vh - H - m);
      let s = Math.hypot(x - x0, y - y0) * 2;
      if (ax > x - 10 && ax < x + W + 10 && ay > y - 10 && ay < y + H + 10) s += 5000; // never cover the pin
      for (const r of avoid) { const ox = Math.max(0, Math.min(x + W, r.right) - Math.max(x, r.left)), oy = Math.max(0, Math.min(y + H, r.bottom) - Math.max(y, r.top)); s += (ox * oy) / 40; }
      if (s < bestScore) { bestScore = s; best = [x, y]; }
    }
    return best;
  }
  follow() {
    if (!this.w0) return;
    const a = this.anchorOf(this.w0); if (!a) return;
    const [ax, ay] = a; this.anchor = a;
    this.scale += (this.scaleTarget - this.scale) * 0.16;
    if (this.expanded) {
      this.el.style.transform = `translate(0px,0px) scale(${this.scale.toFixed(3)})`; this.el.style.transformOrigin = `${ax}px ${ay}px`;
      this.leader.style.opacity = 0; return;
    }
    const [tx, ty] = this.target(ax, ay);
    if (!this.pos) this.pos = [tx, ty];
    this.pos[0] += (tx - this.pos[0]) * 0.14; this.pos[1] += (ty - this.pos[1]) * 0.14;
    const [x, y] = this.pos, W = this.el.offsetWidth, H = this.el.offsetHeight;
    this.el.style.transformOrigin = `${ax - x}px ${ay - y}px`;
    this.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${this.scale.toFixed(3)})`;
    // leader line: pin → nearest point on the card's edge
    const nx = clamp(ax, x, x + W), ny = clamp(ay, y, y + H);
    const L = this.leader, line = L.querySelector('line'), dot = L.querySelector('circle');
    line.setAttribute('x1', ax); line.setAttribute('y1', ay); line.setAttribute('x2', nx); line.setAttribute('y2', ny);
    dot.setAttribute('cx', ax); dot.setAttribute('cy', ay);
    L.style.opacity = Math.max(0, this.scale - 0.3).toFixed(2);
  }

  setExpanded(on) {
    this.expanded = on; this.el.classList.toggle('expanded', on); document.body.classList.toggle('touring-full', on);
    this.ui.expand.textContent = on ? '⤡' : '⤢'; this.ui.expand.setAttribute('aria-label', on ? 'Float beside the site' : 'Expand to full screen');
    this.layout(true); this.pos = null;
  }

  alloc(n) {
    this.n = n;
    for (const k of ['x', 'y', 'px', 'py', 'vx', 'vy', 'age', 'life', 'r', 'g', 'b', 'hx', 'hy']) this[k] = new Float32Array(n);
  }

  // ── open / load ─────────────────────────────────────────────────────────
  // journey: { dwell, onDone } — non-interactive: plays one pass then reports back
  show(wonder, { journey = null } = {}) {
    this.journey = journey; this.el.classList.toggle('kiosk', !!journey);
    if (journey && this.expanded) this.setExpanded(false);
    this.open = true; this.el.hidden = false; this.leader.hidden = false; document.body.classList.add('touring');
    this.layout(true); this.pos = null; this.scale = 0.05; this.scaleTarget = 1;
    this.load(wonder);
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame((t) => this.tick(t)); }
  }

  seed(ox, oy) {
    this.ox = ox; this.oy = oy;
    for (let i = 0; i < this.n; i++) {
      this.hx[i] = Math.random() * this.w; this.hy[i] = Math.random() * this.h;
      this.x[i] = this.px[i] = ox; this.y[i] = this.py[i] = oy;
      this.vx[i] = this.vy[i] = 0; this.age[i] = Math.random() * 60; this.life[i] = 160 + Math.random() * 220;
      this.r[i] = this.base[0]; this.g[i] = this.base[1]; this.b[i] = this.base[2];
    }
  }

  load(w) {
    this.current = w;
    this.w0 = w; this.t = 0; this.pixels = null; this.sampleOK = false; this.hasVideo = false; this.hasPhotos = false; this.doneSent = false;
    this.images = (w.media?.images || []).filter(x => x && x.url); this.slot = -1;
    this.base = hexRGB(w.art?.color); this.motion = w.art?.motion || 'orbit';
    this.leader.style.setProperty('--c', w.art?.color || '#fff');
    // the swarm bursts from the pin: convert the pin to stage coordinates
    const a = this.anchorOf(w) || [innerWidth / 2, innerHeight / 2];
    const tgt = this.expanded ? [0, 0] : (this.pos || this.target(a[0], a[1]));
    this.seed(clamp(a[0] - tgt[0], -this.w * 0.3, this.w * 1.3), clamp(a[1] - tgt[1], -this.h * 0.3, this.h * 1.3));
    this.ctx.globalCompositeOperation = 'source-over'; this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = '#000'; this.ctx.fillRect(0, 0, this.w, this.h);

    const m = w.media || {};
    this.ui.kick.textContent = this.journey?.caption || `${w.category} · virtual tour`;
    this.ui.name.textContent = w.name;
    this.ui.note.textContent = m.note || '';
    this.ui.credit.innerHTML = m.video ? `Footage: ${esc(m.credit || 'unknown')} · ${m.source ? `<a href="${esc(m.source)}" target="_blank" rel="noopener">${esc(m.license || 'source')}</a>` : esc(m.license || '')}${licenseLink(m.license, w.name)}` : '';
    this.video.pause(); this.video.removeAttribute('src'); this.video.innerHTML = '';
    this.video.style.opacity = 0; this.photos.style.opacity = 0; this.ph.forEach(im => { im.style.opacity = 0; im.removeAttribute('src'); });
    if (m.video) {
      this.hasVideo = true; this.ui.empty.hidden = true;
      this.video.crossOrigin = 'anonymous'; this.video.loop = true; this.video.muted = this.opts.muted; this.video.playsInline = true;
      const srcs = [[m.video, /\.webm(\?|$)/i.test(m.video) ? 'video/webm' : 'video/mp4']];
      if (m.fallback) srcs.push([m.fallback, 'video/mp4']);
      for (const [src, type] of srcs) { const s = document.createElement('source'); s.src = src; s.type = type; this.video.appendChild(s); }
      this.video.load();
      this.video.addEventListener('loadeddata', () => { this.video.currentTime = +m.start || 0; if (this.playing) this.video.play().catch(() => { }); }, { once: true });
    } else if (this.images.length) this.usePhotos();
    else this.markNoVideo(m.note || (this.journey ? 'Footage coming soon' : 'Footage coming soon — add a video or photos in Studio → Edit → Virtual tour.'));
    this.setMute(this.journey ? true : this.opts.muted, true); this.playing = true; this.syncPlay();
    if (!this.journey) this.onChange?.(w);
  }

  markNoVideo(msg) { this.hasVideo = false; this.hasPhotos = false; this.ui.empty.hidden = false; this.ui.empty.textContent = msg; this.video.style.opacity = 0; }
  get hasMedia() { return this.hasVideo || this.hasPhotos; }

  // ── photo "virtual camera": each image gets an equal share of the loop, a slow
  // push-in with drift (Ken Burns), and a crossfade into the next ─────────────
  usePhotos() {
    this.hasVideo = false; this.hasPhotos = true; this.ui.empty.hidden = true; this.video.style.opacity = 0; this.slot = -1;
    this.ph[0].src = this.images[0].url; if (this.images[1]) this.ph[1].src = this.images[1].url;
  }
  showPhoto(i) {
    const img = this.images[i], back = this.ph[1 - this.front];
    const swap = () => { back.style.opacity = 1; this.ph[this.front].style.opacity = 0; this.front = 1 - this.front; };
    if (back.getAttribute('src') !== img.url) { back.onload = swap; back.src = img.url; } else if (back.complete) swap(); else back.onload = swap;
    const n = this.images.length;
    this.ui.credit.innerHTML = `Photo ${n > 1 ? `${i + 1}/${n}: ` : ''}${esc(img.credit || 'unknown')} · ${img.source ? `<a href="${esc(img.source)}" target="_blank" rel="noopener">${esc(img.license || 'source')}</a>` : esc(img.license || '')}${licenseLink(img.license, this.current?.name)}`;
  }
  kenBurns(t, L) {
    const n = this.images.length, slotLen = L / n, slot = Math.min(n - 1, Math.floor(t / slotLen));
    if (slot !== this.slot) { this.slot = slot; this.showPhoto(slot); const nx = this.images[slot + 1]; if (nx) setTimeout(() => { const b = this.ph[1 - this.front]; if (b.getAttribute('src') !== nx.url) b.src = nx.url; }, 1400); }
    const k = (t - slot * slotLen) / slotLen, dir = slot % 2 ? -1 : 1;
    const img = this.ph[this.front];
    img.style.transform = `scale(${(1.06 + 0.12 * k).toFixed(4)}) translate(${(dir * 2.5 * k).toFixed(3)}%, ${(((slot % 3) - 1) * 1.8 * k).toFixed(3)}%)`;
  }
  source() { return this.hasVideo ? this.video : this.ph[this.front]; }

  loopLen() {
    if (!this.journey) return this.opts.loop;
    return this.hasMedia ? this.journey.dwell : Math.max(5, this.journey.dwell * 0.5);
  }
  toggle() { this.playing = !this.playing; this.syncPlay(); }
  syncPlay() {
    this.ui.play.textContent = this.playing ? '❚❚' : '▶'; this.ui.play.setAttribute('aria-label', this.playing ? 'Pause' : 'Play');
    if (this.hasVideo) this.playing ? this.video.play().catch(() => { }) : this.video.pause();
  }
  setMute(m, silent) {
    if (!this.journey) this.opts.muted = m;
    this.video.muted = m; this.ui.mute.textContent = m ? '🔇' : '🔊';
    this.ui.mute.setAttribute('aria-label', m ? 'Unmute' : 'Mute'); if (!silent) this.saveOpts();
  }
  restart() { this.t = 0; if (this.hasVideo) this.video.currentTime = +this.w0.media?.start || 0; }
  seek(s) { this.t = clamp(s, 0, this.loopLen() - 0.01); }
  step(d) {
    const list = this.getList(); if (!list.length) return;
    const i = list.findIndex(w => w.id === this.w0.id), w = list[(i + d + list.length) % list.length];
    this.load(w);
  }
  fullscreen() {
    try {
      if (document.fullscreenElement) return document.exitFullscreen();
      if (!this.expanded) this.setExpanded(true);
      this.el.requestFullscreen();
    } catch { }
  }
  // shrink back into the pin; resolves when the animation is done
  dismiss() {
    this.scaleTarget = 0;
    return new Promise(r => setTimeout(() => { this.hide(); r(); }, 520));
  }
  hide() {
    this.open = false; this.el.hidden = true; this.leader.hidden = true; document.body.classList.remove('touring', 'touring-full');
    this.video.pause(); cancelAnimationFrame(this.raf); this.raf = null;
  }
  close() {
    if (this.expanded) this.setExpanded(false);
    try { if (document.fullscreenElement === this.el) document.exitFullscreen(); } catch { }
    this.dismiss().then(() => this.onClose?.());
  }

  // sample the current video frame with the same "cover" crop the <video> uses
  sample() {
    if (!this.hasMedia) return;
    const v = this.source(), vw = v.videoWidth || v.naturalWidth, vh = v.videoHeight || v.naturalHeight;
    if (!vw || (this.hasVideo && v.readyState < 2) || (!this.hasVideo && !v.complete)) return;
    const s = Math.max(this.w / vw, this.h / vh), cw = this.w / s, ch = this.h / s;
    try {
      this.sctx.drawImage(v, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, this.sw, this.sh);
      this.pixels = this.sctx.getImageData(0, 0, this.sw, this.sh).data; this.sampleOK = true;
    } catch { this.sampleOK = false; this.pixels = null; } // tainted (no CORS) → plain crossfade
  }
  lum(ix, iy) {
    ix = clamp(ix, 0, this.sw - 1); iy = clamp(iy, 0, this.sh - 1);
    const k = (iy * this.sw + ix) * 4, p = this.pixels; return p[k] * 0.3 + p[k + 1] * 0.59 + p[k + 2] * 0.11;
  }

  tick(now) {
    if (!this.open) return;
    this.raf = requestAnimationFrame((t) => this.tick(t));
    const dt = Math.min((now - this.last) / 1000, 0.25); this.last = now;
    this.layout(false); this.follow();
    const L = this.loopLen(), T = Math.min(this.opts.trans, L / 3);
    if (this.playing) {
      this.t += dt;
      if (this.t >= L) {
        if (this.journey) { this.t = L; if (!this.doneSent) { this.doneSent = true; this.journey.onDone?.(); } }
        else this.restart();
      }
    }
    const t = this.t;
    // envelope: 0 = pure particles, 1 = pure footage
    if (this.hasPhotos) this.kenBurns(t, L);
    const env = this.hasMedia ? smooth(T * 0.35, T, t) * (1 - smooth(L - T, L - T * 0.25, t)) : 0;
    // how strongly particles adopt footage colours/edges
    const learn = this.hasMedia && this.sampleOK ? Math.max(smooth(0, T * 0.7, t) * (1 - smooth(L - T * 0.25, L, t)), 0) : 0;

    if (this.frame++ % 3 === 0) this.sample();
    const layer = this.hasPhotos ? this.photos : this.video;
    layer.style.opacity = env.toFixed(3);
    layer.style.filter = `blur(${((1 - env) * 18).toFixed(1)}px) saturate(${(1 + (1 - env) * 0.6).toFixed(2)})`;

    const ctx = this.ctx, veil = env > 0.98 ? this.opts.morph : 1 - env * (1 - this.opts.morph);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(0,0,0,${0.07 + env * 0.25})`; ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 1; ctx.lineCap = 'round';
    const cx = this.w / 2, cy = this.h / 2, R = Math.min(this.w, this.h) * 0.32, nz = this.noise, tz = now * 0.00006;
    const P = this.pixels, sx = this.sw / this.w, sy = this.sh / this.h, fs = 900 / Math.max(this.w, 300);
    ctx.globalAlpha = Math.max(0.05, veil) * 0.42;

    const BLOOM = 1.3, bloomK = t < BLOOM ? 1 - Math.pow(1 - t / BLOOM, 3) : 1;
    if (t < BLOOM) ctx.globalAlpha = 0.38;
    for (let i = 0; i < this.n; i++) {
      let x = this.x[i], y = this.y[i]; this.px[i] = x; this.py[i] = y;
      if (t < BLOOM) { // the swarm pours out of the pin and fans across the card
        const sw = this.noise(i * 0.013, t * 2) * 40 * (1 - bloomK);
        this.x[i] = this.ox + (this.hx[i] - this.ox) * bloomK + sw; this.y[i] = this.oy + (this.hy[i] - this.oy) * bloomK - sw;
        ctx.strokeStyle = `rgb(${this.r[i] | 0},${this.g[i] | 0},${this.b[i] | 0})`;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(this.x[i] + 0.01, this.y[i]); ctx.stroke(); continue;
      }
      // flow: noise + motion signature + (when learning) glide along image edges
      const a = nz(x * 0.003 * fs + tz, y * 0.003 * fs - tz) * Math.PI * 2;
      let ax = Math.cos(a) * 0.3, ay = Math.sin(a) * 0.3;
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) + 0.01, nx = dx / d, ny = dy / d, k = 1 - learn;
      switch (this.motion) {
        case 'cascade': ay += 0.45 * k; break;
        case 'orbit': ax += -ny * 0.5 * k - nx * 0.12 * k * (d > R); ay += nx * 0.5 * k - ny * 0.12 * k * (d > R); break;
        case 'sink': ax += (-ny * 0.5 - nx * 0.2) * k; ay += (nx * 0.5 - ny * 0.2) * k; break;
        case 'ripple': ax += nx * 0.25 * k; ay += ny * 0.25 * k; break;
        case 'mist': ay -= 0.25 * k; break;
        case 'bloom': { const p = Math.sin(this.age[i] * 0.08); ax += (nx * p * 0.5 - ny * 0.2) * k; ay += (ny * p * 0.5 + nx * 0.2) * k; break; }
        case 'zigzag': ax += (Math.sin(this.age[i] * 0.15) > 0 ? 0.45 : -0.45) * k; ay += 0.2 * k; break;
        default: ax -= nx * 0.07 * k * (d > R); ay -= ny * 0.07 * k * (d > R);
      }
      if (learn > 0 && P) {
        const ix = (x * sx) | 0, iy = (y * sy) | 0;
        const gx = this.lum(ix + 1, iy) - this.lum(ix - 1, iy), gy = this.lum(ix, iy + 1) - this.lum(ix, iy - 1);
        const gm = Math.hypot(gx, gy) + 0.001;
        ax += (-gy / gm) * 0.8 * learn; ay += (gx / gm) * 0.8 * learn; // tangent to edges, like brush strokes
        const q = (clamp(iy, 0, this.sh - 1) * this.sw + clamp(ix, 0, this.sw - 1)) * 4;
        const mm = 0.12 * learn;
        this.r[i] += (P[q] - this.r[i]) * mm; this.g[i] += (P[q + 1] - this.g[i]) * mm; this.b[i] += (P[q + 2] - this.b[i]) * mm;
      } else {
        this.r[i] += (this.base[0] - this.r[i]) * 0.02; this.g[i] += (this.base[1] - this.g[i]) * 0.02; this.b[i] += (this.base[2] - this.b[i]) * 0.02;
      }
      this.vx[i] = this.vx[i] * 0.9 + ax; this.vy[i] = this.vy[i] * 0.9 + ay;
      x += this.vx[i] * (this.playing ? 1 : 0.15); y += this.vy[i] * (this.playing ? 1 : 0.15);
      this.age[i]++;
      if (this.age[i] > this.life[i] || x < -20 || y < -20 || x > this.w + 20 || y > this.h + 20) {
        x = Math.random() * this.w; y = Math.random() * this.h;
        this.px[i] = x; this.py[i] = y; this.vx[i] = this.vy[i] = 0; this.age[i] = 0;
      }
      this.x[i] = x; this.y[i] = y;
      ctx.strokeStyle = `rgb(${this.r[i] | 0},${this.g[i] | 0},${this.b[i] | 0})`;
      ctx.beginPath(); ctx.moveTo(this.px[i], this.py[i]); ctx.lineTo(x + 0.01, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    this.ui.fill.style.width = `${(t / L) * 100}%`;
    const phase = !this.hasMedia ? 'particles' : t < T ? 'morphing in' : t > L - T ? 'dissolving' : this.hasPhotos ? 'photos' : 'footage';
    this.ui.time.textContent = `${Math.floor(t)}s / ${Math.round(L)}s · ${phase}`;
  }
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Footage the artist owns (licence starts with ©) gets a direct licensing link
function licenseLink(license, place) {
  if (!/^©/.test(license || '') || !BRAND?.email) return '';
  const subject = encodeURIComponent(`Footage licence: ${place || 'Futurart'}`);
  return ` <a class="lic" href="mailto:${BRAND.email}?subject=${subject}">License this footage</a>`;
}
