// Clip recorder — turns the living atlas into ready-to-post video.
// Like bouncing a mix down to a file: the atlas is the live set, this records it,
// cropped for Reels/TikTok (9:16), square posts (1:1) or YouTube (16:9),
// with your own track underneath and the Futurart signature on top.
// Everything happens in the browser (canvas.captureStream + MediaRecorder); nothing is uploaded.

const FORMATS = { vertical: [1080, 1920], square: [1080, 1080], wide: [1920, 1080] };
// H.264 MP4 first (Instagram/TikTok-ready); VP9-in-MP4 is skipped on purpose, as social apps reject it
const MIME = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1',
  'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

export class Recorder {
  constructor({ art, tourEl, brand, overlay, title, startJourney, stopJourney, toast }) {
    Object.assign(this, { art, tourEl, brand, overlay, title, startJourney, stopJourney, toast });
    this.active = false;
  }

  static supported() { return typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream; }
  static mime() { return MIME.find(m => MediaRecorder.isTypeSupported?.(m)) || ''; }

  // Which part of the screen to film: the full height, a 9:16 / 1:1 slice centred on the action
  crop(fmt) {
    const W = innerWidth, H = innerHeight, [ow, oh] = FORMATS[fmt], want = ow / oh;
    let w = W, h = W / want; if (h > H) { h = H; w = H * want; }
    let cx = W / 2, cy = H / 2;
    const t = this.tourEl;
    if (t && !t.hidden) { const r = t.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
    const x = Math.min(Math.max(cx - w / 2, 0), W - w), y = Math.min(Math.max(cy - h / 2, 0), H - h);
    return { x, y, w, h, s: ow / w };
  }

  async start({ fmt = 'vertical', seconds = 30, journey = null, audioFile = null, signature = true } = {}) {
    if (this.active) return;
    if (!Recorder.supported()) return this.toast('This browser cannot record video — try Chrome, Edge or Safari 17+.');
    const [ow, oh] = FORMATS[fmt];
    const out = Object.assign(document.createElement('canvas'), { width: ow, height: oh });
    const ctx = out.getContext('2d');
    const stream = out.captureStream(30);

    // Soundtrack: your own track, so posts never get muted for copyright
    let audio = null, actx = null;
    if (audioFile) {
      audio = new Audio(URL.createObjectURL(audioFile)); audio.loop = true;
      actx = new AudioContext(); const src = actx.createMediaElementSource(audio), dest = actx.createMediaStreamDestination();
      const gain = actx.createGain(); gain.gain.value = 1; src.connect(gain); gain.connect(dest); gain.connect(actx.destination);
      dest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));
    }

    const mime = Recorder.mime();
    const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: fmt === 'wide' ? 10e6 : 8e6, audioBitsPerSecond: 192e3 });
    const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    this.active = true; document.body.classList.add('recording');
    const pill = this.pill(); const t0 = performance.now(), dur = seconds * 1000;

    const label = journey ? `journey-${journey.split(':')[1] || 'all'}` : (this.title() || 'atlas');
    if (journey) this.startJourney(journey);
    if (audio) { await actx.resume(); audio.currentTime = 0; audio.play().catch(() => { }); }

    const frame = () => {
      if (!this.active) return;
      const el = performance.now() - t0;
      this.compose(ctx, ow, oh, fmt, signature, el, dur);
      pill.textContent = `● REC ${Math.ceil((dur - el) / 1000)}s · Esc to stop`;
      if (el >= dur) return this.stop();
      requestAnimationFrame(frame);
    };
    rec.start(1000); requestAnimationFrame(frame);
    this.rec = rec; this.audio = audio; this.actx = actx; this.journey = journey;

    return new Promise(res => {
      rec.onstop = () => {
        const type = (mime || 'video/webm').split(';')[0], ext = type.includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(chunks, { type });
        const name = `futurart-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${fmt}-${seconds}s.${ext}`;
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name }); document.body.appendChild(a); a.click(); a.remove();
        this.toast(ext === 'mp4' ? `Saved ${name}` : `Saved ${name} — Instagram wants MP4: convert free with HandBrake or “ffmpeg -i in.webm out.mp4”.`);
        res(name);
      };
    });
  }

  stop() {
    if (!this.active) return;
    this.active = false; document.body.classList.remove('recording');
    try { this.rec?.state !== 'inactive' && this.rec.stop(); } catch { }
    this.audio?.pause(); this.actx?.close?.();
    document.getElementById('rec-pill')?.remove();
    if (this.journey) this.stopJourney();
  }

  pill() {
    const p = Object.assign(document.createElement('div'), { id: 'rec-pill', role: 'status' });
    p.onclick = () => this.stop(); document.body.appendChild(p); return p;
  }

  // One output frame: art + bloom + pins + floating tour (footage, photos, particles) + signature
  compose(ctx, ow, oh, fmt, signature, el, dur) {
    const { c, b } = this.art, cr = this.crop(fmt), dpr = c.width / innerWidth;
    ctx.save();
    ctx.fillStyle = '#05080d'; ctx.fillRect(0, 0, ow, oh);
    ctx.drawImage(c, cr.x * dpr, cr.y * dpr, cr.w * dpr, cr.h * dpr, 0, 0, ow, oh);
    // Bloom: blur at low resolution (cheap), then scale up — same look as the on-screen CSS blur
    const bs = b.width / innerWidth, bw = Math.max(1, Math.round(cr.w * bs)), bh = Math.max(1, Math.round(cr.h * bs));
    const sm = this.small ||= document.createElement('canvas'); if (sm.width !== bw || sm.height !== bh) { sm.width = bw; sm.height = bh; }
    const sx = sm.getContext('2d'); sx.clearRect(0, 0, bw, bh); sx.filter = `blur(${(10 * bs).toFixed(1)}px) saturate(1.3)`;
    sx.drawImage(b, cr.x * bs, cr.y * bs, cr.w * bs, cr.h * bs, 0, 0, bw, bh); sx.filter = 'none';
    ctx.globalCompositeOperation = 'screen'; ctx.drawImage(sm, 0, 0, ow, oh); ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(cr.s, 0, 0, cr.s, -cr.x * cr.s, -cr.y * cr.s);
    this.overlay?.(ctx);
    const t = this.tourEl, touring = t && !t.hidden;
    if (touring && fmt !== 'vertical') this.drawTour(ctx, t.querySelector('.t-stage').getBoundingClientRect(), true);
    ctx.restore();
    // Vertical: the footage takes the top ~58% edge to edge, the living map flows beneath it
    if (touring && fmt === 'vertical') {
      const h = Math.round(oh * 0.58);
      this.drawTour(ctx, { left: 0, top: 0, width: ow, height: h }, false);
      const g = ctx.createLinearGradient(0, h - 120, 0, h + 40); g.addColorStop(0, 'rgba(5,8,13,0)'); g.addColorStop(1, 'rgba(5,8,13,1)');
      ctx.fillStyle = g; ctx.globalAlpha = 0.85; ctx.fillRect(0, h - 120, ow, 160); ctx.globalAlpha = 1;
    }
    if (signature) this.sign(ctx, ow, oh, el, dur);
  }

  // Draw the tour (footage / photos + particle veil) into a rectangle; `card` adds the rounded frame and title
  drawTour(ctx, stage, card) {
    const t = this.tourEl;
    ctx.save();
    ctx.beginPath(); if (card && ctx.roundRect) ctx.roundRect(stage.left, stage.top, stage.width, stage.height, 10); else ctx.rect(stage.left, stage.top, stage.width, stage.height); ctx.clip();
    ctx.fillStyle = '#000'; ctx.fillRect(stage.left, stage.top, stage.width, stage.height);
    const cover = (src, sw, sh, alpha) => {
      if (!sw || !sh || alpha <= 0.01) return;
      const s = Math.max(stage.width / sw, stage.height / sh), w = sw * s, h = sh * s;
      ctx.globalAlpha = alpha; ctx.drawImage(src, stage.left + (stage.width - w) / 2, stage.top + (stage.height - h) / 2, w, h);
    };
    const o = (e) => { const x = parseFloat(e.style.opacity); return Number.isFinite(x) ? x : 1; };
    const op = (e) => o(e) * o(e.parentElement);
    const v = t.querySelector('video');
    if (v.readyState >= 2) cover(v, v.videoWidth, v.videoHeight, o(v));
    t.querySelectorAll('.t-ph').forEach(im => im.complete && im.naturalWidth && cover(im, im.naturalWidth, im.naturalHeight, op(im)));
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'screen';
    const tc = t.querySelector('canvas'), sr = t.querySelector('.t-stage').getBoundingClientRect();
    if (tc?.width) { const s = Math.max(stage.width / sr.width, stage.height / sr.height), w = sr.width * s, h = sr.height * s; ctx.drawImage(tc, stage.left + (stage.width - w) / 2, stage.top + (stage.height - h) / 2, w, h); }
    ctx.globalCompositeOperation = 'source-over';
    if (!card) { ctx.restore(); return; }
    // title, as on screen
    const name = t.querySelector('.t-name')?.textContent || '';
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(stage.left, stage.top, stage.width, 64);
    ctx.fillStyle = '#fff'; ctx.font = `400 26px "Instrument Serif", Georgia, serif`; ctx.fillText(name, stage.left + 16, stage.top + 40);
    ctx.restore();
  }

  // Signature: Futurart by Edward Mundondo + Instagram handle, with the current site name
  sign(ctx, ow, oh, el, dur) {
    const B = this.brand, u = ow / 1080, a = Math.min(1, el / 800, (dur - el) / 600 + 0.3);
    ctx.save(); ctx.globalAlpha = Math.max(0, a);
    const g = ctx.createLinearGradient(0, oh - 260 * u, 0, oh); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = g; ctx.fillRect(0, oh - 260 * u, ow, 260 * u);
    const site = this.title(); ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
    if (site) { ctx.font = `400 ${Math.round(58 * u)}px "Instrument Serif", Georgia, serif`; ctx.fillText(site, 56 * u, oh - 150 * u); }
    ctx.font = `600 ${Math.round(30 * u)}px "Space Grotesk", system-ui, sans-serif`; ctx.fillStyle = '#F4D35E';
    ctx.fillText(B.name, 56 * u, oh - 96 * u);
    ctx.font = `400 ${Math.round(26 * u)}px "Space Grotesk", system-ui, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillText(`${B.instagram}  ·  ${B.site}`, 56 * u, oh - 56 * u);
    ctx.restore();
  }
}
