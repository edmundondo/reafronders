// ReAfronders · app shell: map, story panel, tour, and the Studio editor.
import { Art, PALETTES, MODES, MOTIONS } from './art.js';
import { createStore, slugify } from './store.js';

const CATEGORIES = ['waterfall', 'mountain', 'gorge', 'rock', 'cave', 'wetland', 'river', 'lake', 'forest', 'desert', 'savanna', 'coast', 'volcano', 'landform'];
const DEFAULT_PALETTE = ['#2EC4B6', '#F4D35E', '#EE964B', '#C2185B', '#7BDFF2'];
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isMobile = () => window.innerWidth <= 720;

const state = { countries: [], wonders: [], presentation: {} };
const view = { focus: null, selected: null, picking: false, tour: null, studio: false, draft: null, draftOriginal: null, edCountry: null };
let store, geo, art, baseScale = 1, tween = null, frameNo = 0;

const svg = d3.select('#map');
const gC = svg.append('g'), gL = svg.append('g'), gW = svg.append('g');
const projection = d3.geoMercator();
const path = d3.geoPath(projection);

// ── helpers ────────────────────────────────────────────────────────────────
const featureOf = (iso) => geo.features.find(f => f.id === iso);
const countryOf = (iso) => state.countries.find(c => c.iso_a3 === iso);
const countryName = (iso) => countryOf(iso)?.name || featureOf(iso)?.properties.name || iso;
const visibleWonders = () => state.wonders.filter(w => w.visible !== false && (countryOf(w.country_iso)?.active !== false));
const wondersIn = (iso, all = false) => state.wonders.filter(w => w.country_iso === iso && (all || w.visible !== false)).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
const activeIsos = () => [...new Set(visibleWonders().map(w => w.country_iso))];

function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms); }

function extent() {
  const w = innerWidth, h = innerHeight;
  if (isMobile()) return [[16, 96], [w - 16, h * 0.54]];
  const left = 420, right = view.studio ? 440 : 24;
  return [[left, 80], [w - right, h - 24]];
}
function fitParams(target) {
  const p = d3.geoMercator().fitExtent(extent(), target);
  return { s: p.scale(), t: p.translate() };
}
const africaFC = () => ({ type: 'FeatureCollection', features: geo.features.filter(f => !['CPV', 'MUS', 'SYC'].includes(f.id)) });

function flyTo(target, animate = true) {
  const to = fitParams(target);
  if (target !== null && view.focus) { const f = featureOf(view.focus); if (f && d3.geoArea(f) < 0.002) to.s = Math.min(to.s, baseScale * 8); }
  if (!animate) { projection.scale(to.s).translate(to.t); redraw(true); return; }
  const from = { s: projection.scale(), t: projection.translate() };
  const iS = d3.interpolateNumber(from.s, to.s), iX = d3.interpolateNumber(from.t[0], to.t[0]), iY = d3.interpolateNumber(from.t[1], to.t[1]);
  tween = { start: performance.now(), dur: 1300, step: (k) => { projection.scale(iS(k)).translate([iX(k), iY(k)]); } };
}

// ── map drawing ────────────────────────────────────────────────────────────
function drawCountries() {
  gC.selectAll('path').data(geo.features, d => d.id).join('path')
    .attr('class', 'country')
    .on('mousemove', (ev, d) => {
      const n = wondersIn(d.id).length;
      tip(ev, `${countryName(d.id)}${n ? ` · ${n} wonder${n > 1 ? 's' : ''}` : ' · not mapped yet'}`);
    })
    .on('mouseleave', hideTip)
    .on('click', (ev, d) => { if (view.picking) return; stopTour(); focus(d.id); });
}

function redraw(rebuildMask = false) {
  const act = new Set(activeIsos());
  gC.selectAll('path').attr('d', path)
    .classed('active', d => act.has(d.id)).classed('focus', d => d.id === view.focus);

  const vw = visibleWonders();
  const ws = gW.selectAll('g.wonder').data(vw, d => d.id).join(enter => {
    const g = enter.append('g').attr('class', 'wonder').attr('tabindex', 0).attr('role', 'button');
    g.append('circle').attr('class', 'ring').attr('r', 7);
    g.append('circle').attr('class', 'core');
    g.append('text').attr('x', 10).attr('dy', '0.35em');
    g.on('click', (ev, d) => { ev.stopPropagation(); if (view.picking) return; stopTour(); select(d.id); })
      .on('keydown', (ev, d) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(d.id); } })
      .on('mousemove', (ev, d) => tip(ev, `${d.name} — ${d.category}`)).on('mouseleave', hideTip);
    return g;
  });
  ws.attr('transform', d => { const p = projection([d.lng, d.lat]); return `translate(${p[0]},${p[1]})`; })
    .classed('sel', d => d.id === view.selected)
    .attr('aria-label', d => `${d.name}, ${countryName(d.country_iso)}`);
  ws.select('.ring').attr('stroke', d => d.art?.color || '#fff').style('animation-delay', (d, i) => `${(i * 0.37) % 2.6}s`);
  ws.select('.core').attr('r', d => d.id === view.selected ? 5.5 : 3.6).attr('fill', d => d.art?.color || '#fff');
  ws.select('text').text(d => d.name).style('display', d => d.country_iso === view.focus ? null : 'none');
  // nudge colliding labels apart (simple greedy stack)
  const placed = [];
  ws.filter(d => d.country_iso === view.focus).sort((a, b) => a.lat - b.lat).each(function (d) {
    const [x, y] = projection([d.lng, d.lat]), w = d.name.length * 6.4 + 12; let off = 0;
    const hit = (o) => placed.some(b => x < b.x + b.w && x + w > b.x && y + o - 7 < b.y + 7 && y + o + 7 > b.y - 7);
    for (let k = 0; k < 8 && hit(off); k++) off = k % 2 ? -(Math.ceil((k + 1) / 2) * 14) : Math.ceil((k + 1) / 2) * 14;
    const flip = x + w > innerWidth - 8;
    placed.push({ x: flip ? x - w : x, y: y + off, w });
    d3.select(this).select('text').attr('y', off).attr('x', flip ? -10 : 10).attr('text-anchor', flip ? 'end' : 'start');
  });

  // country labels at continent scale
  const labels = view.focus ? [] : [...act].map(iso => ({ iso, f: featureOf(iso) })).filter(d => d.f);
  gL.selectAll('text').data(labels, d => d.iso).join('text').attr('class', 'clabel')
    .attr('text-anchor', 'start')
    .attr('transform', d => { const b = path.bounds(d.f), c = path.centroid(d.f); return `translate(${b[1][0] + 10},${c[1] + 5})`; })
    .text(d => `${countryName(d.iso)} · ${wondersIn(d.iso).length}`);

  const zoom = projection.scale() / baseScale;
  const radius = Math.max(5, Math.min(46, 5 * Math.sqrt(zoom) * 1.6));
  const list = vw.filter(w => !view.focus || w.country_iso === view.focus || zoom < 2).map(w => {
    const p = projection([w.lng, w.lat]);
    return { id: w.id, x: p[0], y: p[1], color: w.art?.color || '#ffffff', intensity: w.art?.intensity ?? 0.8, motion: w.art?.motion || 'orbit' };
  });
  if (art.emitters.length !== list.length || art.emitters.some((e, i) => e.id !== list[i].id || e.color !== list[i].color)) art.setEmitters(list, radius);
  else { art.emitters = list; art.chain = list; art.radius = radius; }
  art.setSelected(view.selected);
  if (rebuildMask) art.setMasks(path, geo.features, view.focus ? featureOf(view.focus) : null);
}

// ── tooltip ────────────────────────────────────────────────────────────────
function tip(ev, text) { const t = $('#tip'); t.textContent = text; t.style.left = `${ev.clientX + 14}px`; t.style.top = `${ev.clientY + 12}px`; t.style.opacity = 1; }
function hideTip() { $('#tip').style.opacity = 0; }

// ── navigation ─────────────────────────────────────────────────────────────
function focus(iso, { keepSelection = false } = {}) {
  view.focus = iso; if (!keepSelection) view.selected = null;
  const c = countryOf(iso);
  art.setCountryPalette(iso ? (c?.palette?.length ? c.palette : DEFAULT_PALETTE) : null);
  flyTo(iso ? featureOf(iso) : africaFC());
  if (view.studio && iso && view.edCountry !== iso) { view.edCountry = iso; view.draft = null; renderStudio(); }
  renderPanel(); renderCrumbs();
}
function select(id) {
  const w = state.wonders.find(x => x.id === id); if (!w) return;
  if (view.focus !== w.country_iso) focus(w.country_iso, { keepSelection: true });
  view.selected = id; redraw(); renderPanel(); renderCrumbs();
}
function home() { stopTour(); focus(null); }

function renderCrumbs() {
  const el = $('#crumbs'); const parts = [`<button data-go="africa">Africa</button>`];
  if (view.focus) parts.push(`<button data-go="country">${esc(countryName(view.focus))}</button>`);
  const w = state.wonders.find(x => x.id === view.selected); if (w) parts.push(`<span>${esc(w.name)}</span>`);
  el.innerHTML = parts.join(' <span aria-hidden="true">/</span> ');
  el.onclick = (e) => { const g = e.target.dataset.go; if (g === 'africa') home(); if (g === 'country') { view.selected = null; redraw(); renderPanel(); renderCrumbs(); } };
}

// ── story panel ────────────────────────────────────────────────────────────
function renderPanel() {
  const el = $('#panel'); const w = state.wonders.find(x => x.id === view.selected);
  if (w) {
    el.innerHTML = `
      <button class="back" data-act="back">← ${esc(countryName(w.country_iso))}</button>
      <div class="kicker">${esc(w.category)} · ${esc(countryName(w.country_iso))}</div>
      <h2>${esc(w.name)}</h2>
      ${w.local_name ? `<div class="local">${esc(w.local_name)}</div>` : ''}
      <div class="chips">${w.unesco ? '<span class="chip unesco">UNESCO World Heritage</span>' : ''}<span class="chip">${esc(w.art?.motion || 'orbit')}</span></div>
      ${w.stat_value ? `<div class="stat"><b>${esc(w.stat_value)}</b><span>${esc(w.stat_label || '')}</span></div>` : ''}
      <p>${esc(w.summary)}</p>
      ${w.uniqueness ? `<p class="unique">${esc(w.uniqueness)}</p>` : ''}
      <p class="note">${Math.abs(w.lat).toFixed(3)}°${w.lat < 0 ? 'S' : 'N'}, ${Math.abs(w.lng).toFixed(3)}°${w.lng < 0 ? 'W' : 'E'}</p>`;
  } else if (view.focus) {
    const c = countryOf(view.focus), list = wondersIn(view.focus);
    el.innerHTML = `
      <div class="kicker">${esc(c?.region || 'Africa')}</div>
      <h1>${esc(countryName(view.focus))}</h1>
      ${c?.tagline ? `<div class="tagline">${esc(c.tagline)}</div>` : ''}
      ${list.length ? `<ul class="wlist">${list.map(x => `<li><button data-id="${esc(x.id)}"><span class="swatch" style="color:${esc(x.art?.color || '#fff')};background:${esc(x.art?.color || '#fff')}"></span>${esc(x.name)}<small>${esc(x.category)}</small></button></li>`).join('')}</ul>`
        : `<p class="empty">No wonders mapped here yet.</p><button data-act="studio" class="accent">Add the first wonder in Studio</button>`}`;
  } else {
    const isos = activeIsos();
    el.innerHTML = `
      <div class="kicker">Africa · ${geo.features.length} territories</div>
      <h1>A living atlas of natural wonders</h1>
      <div class="tagline">Every particle is a breath of the land: rivers of colour that gather where the earth does something extraordinary.</div>
      <ul class="wlist">${isos.map(iso => `<li><button data-iso="${iso}"><span class="swatch" style="color:var(--accent);background:var(--accent)"></span>${esc(countryName(iso))}<small>${wondersIn(iso).length} wonders</small></button></li>`).join('')}</ul>
      <p class="note">Click any country to enter it. More nations unlock as you add them in Studio.</p>`;
  }
  el.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return; stopTour();
    if (b.dataset.id) select(b.dataset.id);
    if (b.dataset.iso) focus(b.dataset.iso);
    if (b.dataset.act === 'back') { view.selected = null; redraw(); renderPanel(); renderCrumbs(); }
    if (b.dataset.act === 'studio') openStudio(true);
  };
}

// ── tour & exhibition ──────────────────────────────────────────────────────
function startTour() {
  const list = visibleWonders(); if (!list.length) return;
  let i = Math.max(0, list.findIndex(w => w.id === view.selected));
  const next = () => { const w = list[i++ % list.length]; select(w.id); };
  next(); view.tour = setInterval(next, 9000); $('#btn-tour').classList.add('on');
}
function stopTour() { if (view.tour) { clearInterval(view.tour); view.tour = null; $('#btn-tour').classList.remove('on'); } }
function toggleExhibit() {
  const on = !document.body.classList.contains('exhibit');
  document.body.classList.toggle('exhibit', on);
  if (on) { closeStudio(); try { document.documentElement.requestFullscreen?.(); } catch { } if (!view.tour) startTour(); }
  else { try { if (document.fullscreenElement) document.exitFullscreen(); } catch { } }
}

// ── presentation ───────────────────────────────────────────────────────────
function applyPresentation() {
  const P = state.presentation;
  art.apply(P);
  svg.classed('no-borders', !P.showBorders).classed('no-labels', !P.showLabels);
}

// ── Studio ─────────────────────────────────────────────────────────────────
function openStudio(newWonder = false) {
  view.studio = true; $('#studio').hidden = false; $('#btn-studio').classList.add('on');
  view.edCountry = view.focus || view.edCountry || state.countries[0]?.iso_a3 || 'ZWE';
  if (newWonder) view.draft = blankWonder(view.edCountry);
  renderStudio(); flyTo(view.focus ? featureOf(view.focus) : africaFC());
}
function closeStudio() { cancelPick(); revertDraft(); view.studio = false; $('#studio').hidden = true; $('#btn-studio').classList.remove('on'); flyTo(view.focus ? featureOf(view.focus) : africaFC()); }

function blankWonder(iso) {
  const f = featureOf(iso), c = f ? d3.geoCentroid(f) : [25, 0];
  return { id: null, slug: '', country_iso: iso, name: '', local_name: '', category: 'landform', lat: +c[1].toFixed(4), lng: +c[0].toFixed(4), summary: '', uniqueness: '', stat_label: '', stat_value: '', unesco: false, visible: true, sort_order: wondersIn(iso, true).length + 1, art: { color: '#F4D35E', intensity: 0.8, motion: 'orbit' } };
}
function revertDraft() {
  if (view.draft && view.draftOriginal) { const w = state.wonders.find(x => x.id === view.draftOriginal.id); if (w) Object.assign(w, structuredClone(view.draftOriginal)); }
  view.draft = null; view.draftOriginal = null; redraw();
}

function renderStudio() {
  if (!view.studio) return;
  $('#source').textContent = store.mode === 'supabase' ? (store.isEditor ? '● Supabase · editor' : '○ Supabase · view only') : '● Local browser';
  renderWondersTab(); renderLookTab(); renderDataTab();
}

function renderWondersTab() {
  const el = $('.tab[data-tab="wonders"]'), iso = view.edCountry;
  const c = countryOf(iso), list = wondersIn(iso, true), d = view.draft;
  const opts = [...geo.features].sort((a, b) => a.properties.name.localeCompare(b.properties.name))
    .map(f => `<option value="${f.id}" ${f.id === iso ? 'selected' : ''}>${countryOf(f.id) ? '★ ' : ''}${esc(countryOf(f.id)?.name || f.properties.name)}</option>`).join('');
  const pal = c?.palette?.length ? c.palette : DEFAULT_PALETTE;

  el.innerHTML = d ? wonderForm(d) : `
    <div class="field"><label for="ed-country">Country</label><select id="ed-country">${opts}</select></div>
    <ul class="ed-list">${list.length ? list.map(w => `
      <li class="${w.visible === false ? 'hid' : ''}">
        <input type="checkbox" data-vis="${esc(w.id)}" ${w.visible !== false ? 'checked' : ''} title="Show / hide" aria-label="Show ${esc(w.name)}">
        <span class="swatch" style="color:${esc(w.art?.color)};background:${esc(w.art?.color)}"></span>
        <span class="nm">${esc(w.name)}</span>
        <button data-edit="${esc(w.id)}">Edit</button>
        <button class="danger" data-del="${esc(w.id)}" aria-label="Remove ${esc(w.name)}">✕</button>
      </li>`).join('') : '<li class="empty">No wonders yet for this country.</li>'}
    </ul>
    <div class="btnrow"><button class="accent" data-act="add">+ Add wonder</button></div>
    <hr>
    <div class="lbl">Country presentation</div>
    <div class="field"><label for="c-tag">Tagline</label><input type="text" id="c-tag" value="${esc(c?.tagline || '')}" placeholder="One poetic line about this land"></div>
    <div class="field"><label for="c-region">Region</label><input type="text" id="c-region" value="${esc(c?.region || '')}" placeholder="e.g. Southern Africa"></div>
    <div class="field"><span class="lbl">Colour story (5 swatches)</span><div class="row" style="flex:none">${pal.map((p, i) => `<input type="color" data-pal="${i}" value="${esc(p)}" aria-label="Palette colour ${i + 1}">`).join('')}</div></div>
    <label class="check"><input type="checkbox" id="c-active" ${c?.active !== false ? 'checked' : ''}> Show this country on the public map</label>
    <div class="btnrow"><button data-act="save-country">Save country</button></div>`;

  el.onchange = el.oninput = null;
  if (d) return bindWonderForm(el);

  $('#ed-country', el).onchange = (e) => { view.edCountry = e.target.value; focus(e.target.value); renderStudio(); };
  el.onclick = async (e) => {
    const b = e.target.closest('button'); const box = e.target.closest('input[data-vis]');
    if (box) {
      const w = state.wonders.find(x => x.id === box.dataset.vis); w.visible = box.checked;
      redraw(); renderPanel(); renderWondersTab(); const r = await store.saveWonder(state, w); if (!r.ok) toast(r.msg);
      return;
    }
    if (!b) return;
    if (b.dataset.act === 'add') { view.draft = blankWonder(iso); view.draftOriginal = null; renderWondersTab(); }
    if (b.dataset.edit) { const w = state.wonders.find(x => x.id === b.dataset.edit); view.draftOriginal = structuredClone(w); view.draft = structuredClone(w); select(w.id); renderWondersTab(); }
    if (b.dataset.del) {
      const w = state.wonders.find(x => x.id === b.dataset.del);
      if (!confirmInline(b)) return;
      state.wonders = state.wonders.filter(x => x !== w); if (view.selected === w.id) view.selected = null;
      redraw(true); renderPanel(); renderCrumbs(); renderWondersTab();
      const r = await store.deleteWonder(state, w); toast(r.ok ? `Removed ${w.name}` : r.msg);
    }
    if (b.dataset.act === 'save-country') {
      const cc = ensureCountry(iso);
      cc.tagline = $('#c-tag', el).value.trim(); cc.region = $('#c-region', el).value.trim(); cc.active = $('#c-active', el).checked;
      cc.palette = $$('input[data-pal]', el).map(i => i.value.toUpperCase());
      art.setCountryPalette(cc.palette); redraw(true); renderPanel();
      const r = await store.saveCountry(state, cc); toast(r.ok ? `Saved ${cc.name}` : r.msg);
    }
  };
  el.oninput = (e) => { // live palette preview
    if (e.target.dataset.pal !== undefined) art.setCountryPalette($$('input[data-pal]', el).map(i => i.value));
  };
}

// two-tap delete (no browser dialogs)
function confirmInline(btn) {
  if (btn.dataset.armed) return true;
  btn.dataset.armed = '1'; btn.textContent = 'Sure?'; setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = '✕'; } }, 2500);
  return false;
}

function ensureCountry(iso) {
  let c = countryOf(iso);
  if (!c) { c = { iso_a3: iso, name: featureOf(iso)?.properties.name || iso, region: '', tagline: '', palette: [...DEFAULT_PALETTE], active: true, sort_order: state.countries.length + 1 }; state.countries.push(c); }
  return c;
}

function wonderForm(d) {
  const a = d.art || {};
  return `
    <div class="lbl">${d.id ? 'Edit wonder' : 'New wonder'} · ${esc(countryName(d.country_iso))}</div>
    <div class="field"><label for="w-name">Name *</label><input type="text" id="w-name" value="${esc(d.name)}" required></div>
    <div class="field"><label for="w-local">Local name / meaning</label><input type="text" id="w-local" value="${esc(d.local_name || '')}"></div>
    <div class="row">
      <div class="field"><label for="w-cat">Category</label><select id="w-cat">${CATEGORIES.map(c => `<option ${c === d.category ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label for="w-order">Order</label><input type="number" id="w-order" value="${esc(d.sort_order)}"></div>
    </div>
    <div class="row">
      <div class="field"><label for="w-lat">Latitude</label><input type="number" step="0.0001" id="w-lat" value="${esc(d.lat)}"></div>
      <div class="field"><label for="w-lng">Longitude</label><input type="number" step="0.0001" id="w-lng" value="${esc(d.lng)}"></div>
    </div>
    <div class="btnrow" style="margin:-4px 0 12px"><button data-act="pick">⌖ Pick on map</button></div>
    <div class="field"><label for="w-sum">Brief description *</label><textarea id="w-sum">${esc(d.summary)}</textarea></div>
    <div class="field"><label for="w-uni">What makes it unique</label><textarea id="w-uni">${esc(d.uniqueness || '')}</textarea></div>
    <div class="row">
      <div class="field"><label for="w-sl">Stat label</label><input type="text" id="w-sl" value="${esc(d.stat_label || '')}" placeholder="Height"></div>
      <div class="field"><label for="w-sv">Stat value</label><input type="text" id="w-sv" value="${esc(d.stat_value || '')}" placeholder="2,592 m"></div>
    </div>
    <label class="check"><input type="checkbox" id="w-unesco" ${d.unesco ? 'checked' : ''}> UNESCO World Heritage</label>
    <label class="check"><input type="checkbox" id="w-vis" ${d.visible !== false ? 'checked' : ''}> Visible on map</label>
    <hr>
    <div class="lbl">How it's presented (live)</div>
    <div class="row" style="margin:8px 0 12px"><input type="color" id="w-color" value="${esc(a.color || '#F4D35E')}" aria-label="Wonder colour">
      <select id="w-motion" aria-label="Motion">${MOTIONS.map(m => `<option ${m === a.motion ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
    <div class="slider"><label for="w-int">Intensity</label><output id="o-int">${(a.intensity ?? 0.8).toFixed(2)}</output><input type="range" id="w-int" min="0.1" max="2" step="0.05" value="${a.intensity ?? 0.8}"></div>
    <div class="btnrow"><button class="accent" data-act="save">Save wonder</button><button data-act="cancel">Cancel</button></div>`;
}

function readForm(el) {
  const d = view.draft, v = (id) => $(id, el).value;
  Object.assign(d, {
    name: v('#w-name').trim(), local_name: v('#w-local').trim() || null, category: v('#w-cat'), sort_order: +v('#w-order') || 0,
    lat: +v('#w-lat'), lng: +v('#w-lng'), summary: v('#w-sum').trim(), uniqueness: v('#w-uni').trim() || null,
    stat_label: v('#w-sl').trim() || null, stat_value: v('#w-sv').trim() || null,
    unesco: $('#w-unesco', el).checked, visible: $('#w-vis', el).checked,
    art: { color: v('#w-color').toUpperCase(), motion: v('#w-motion'), intensity: +v('#w-int') },
  });
  return d;
}

function bindWonderForm(el) {
  el.oninput = (e) => {
    const d = readForm(el); $('#o-int', el).textContent = d.art.intensity.toFixed(2);
    if (d.id) { const w = state.wonders.find(x => x.id === d.id); if (w && ['w-color', 'w-motion', 'w-int', 'w-lat', 'w-lng'].includes(e.target.id)) { Object.assign(w, { art: { ...d.art }, lat: d.lat, lng: d.lng }); redraw(); } }
  };
  el.onchange = el.oninput;
  el.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'pick') startPick();
    if (b.dataset.act === 'cancel') { cancelPick(); revertDraft(); renderWondersTab(); }
    if (b.dataset.act === 'save') {
      const d = readForm(el);
      if (!d.name || !d.summary) return toast('Name and brief description are required.');
      if (!(d.lat >= -40 && d.lat <= 40 && d.lng >= -30 && d.lng <= 60)) return toast('Those coordinates are outside Africa.');
      cancelPick(); ensureCountry(d.country_iso);
      if (!d.slug) { let s = slugify(d.name) || 'wonder'; if (state.wonders.some(w => w.slug === s)) s = `${s}-${d.country_iso.toLowerCase()}`; d.slug = s; }
      let w = d.id ? state.wonders.find(x => x.id === d.id) : null;
      if (w) Object.assign(w, d); else { w = { ...d, id: d.slug }; state.wonders.push(w); }
      view.draft = null; view.draftOriginal = null;
      const r = await store.saveWonder(state, w);
      if (store.mode === 'supabase' && r.ok && w.id !== d.id && w.id) { /* id replaced by uuid from DB */ }
      redraw(true); select(w.id); renderWondersTab(); toast(r.ok ? `Saved ${w.name}` : r.msg);
    }
  };
}

function startPick() { view.picking = true; svg.classed('picking', true); $('#pickhint').hidden = false; }
function cancelPick() { view.picking = false; svg.classed('picking', false); $('#pickhint').hidden = true; }
svg.node().addEventListener('click', (ev) => {
  if (!view.picking || !view.draft) return;
  ev.stopPropagation();
  const [lng, lat] = projection.invert(d3.pointer(ev, svg.node()));
  $('#w-lat').value = lat.toFixed(4); $('#w-lng').value = lng.toFixed(4);
  $('.tab[data-tab="wonders"]').dispatchEvent(new Event('input')); cancelPick(); toast('Location set');
}, true);

function renderLookTab() {
  const el = $('.tab[data-tab="look"]'), P = state.presentation;
  const slider = (k, label, min, max, step, fmt = (v) => v) => `<div class="slider"><label for="p-${k}">${label}</label><output id="po-${k}">${fmt(P[k])}</output><input type="range" id="p-${k}" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${P[k]}"></div>`;
  el.innerHTML = `
    <div class="field"><label for="p-mode">Mode</label><select id="p-mode" data-k="mode">${Object.entries(MODES).map(([k, v]) => `<option value="${k}" ${k === P.mode ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="field"><label for="p-palette">Palette</label><select id="p-palette" data-k="palette">${Object.entries(PALETTES).map(([k, v]) => `<option value="${k}" ${k === P.palette ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
    ${slider('particles', 'Particles', 1000, 14000, 500, v => (+v).toLocaleString())}
    ${slider('speed', 'Flow speed', 0.2, 2.5, 0.05, v => (+v).toFixed(2) + '×')}
    ${slider('trail', 'Trail length', 0.7, 0.985, 0.005, v => (+v).toFixed(3))}
    ${slider('glow', 'Glow', 0, 1.5, 0.05, v => (+v).toFixed(2))}
    ${slider('vortex', 'Vortex pull', 0, 2.5, 0.05, v => (+v).toFixed(2))}
    ${slider('bpm', 'Pulse BPM', 60, 180, 1, v => v + ' bpm')}
    <label class="check"><input type="checkbox" data-k="showBorders" ${P.showBorders ? 'checked' : ''}> Country borders</label>
    <label class="check"><input type="checkbox" data-k="showLabels" ${P.showLabels ? 'checked' : ''}> Wonder labels</label>
    <div class="field" style="margin-top:10px"><label for="p-focus">Opening view</label><select id="p-focus" data-k="focusCountry"><option value="">Whole continent</option>${state.countries.map(c => `<option value="${c.iso_a3}" ${c.iso_a3 === P.focusCountry ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <p class="note">Changes are live. Save to make them the default for every visitor${store.mode === 'local' ? ' (on this browser)' : ''}.</p>
    <div class="btnrow"><button class="accent" data-act="save-look">Save as default</button><button data-act="reset-look">Reset look</button></div>`;
  el.oninput = el.onchange = (e) => {
    const k = e.target.dataset.k; if (!k) return;
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'range' ? +e.target.value : e.target.value;
    state.presentation[k] = v; const o = $(`#po-${k}`, el); if (o) o.textContent = e.target.closest('.slider').querySelector('output').textContent = formatOut(k, v);
    applyPresentation();
  };
  el.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'save-look') { const r = await store.savePresentation(state); toast(r.ok ? 'Presentation saved' : r.msg); }
    if (b.dataset.act === 'reset-look') { state.presentation = { ...store.seed.presentation }; applyPresentation(); renderLookTab(); }
  };
}
const formatOut = (k, v) => ({ particles: (+v).toLocaleString(), speed: (+v).toFixed(2) + '×', trail: (+v).toFixed(3), glow: (+v).toFixed(2), vortex: (+v).toFixed(2), bpm: v + ' bpm' }[k] ?? v);

function renderDataTab() {
  const el = $('.tab[data-tab="data"]');
  const sbBlock = store.mode === 'supabase'
    ? (store.session
      ? `<p>Signed in as <b>${esc(store.session.user.email)}</b> — ${store.isEditor ? 'you can publish changes.' : 'not an editor yet (add your user id to <code>editors</code>).'}</p><button data-act="signout">Sign out</button>`
      : `<div class="field"><label for="d-email">Editor sign-in (magic link)</label><input type="email" id="d-email" placeholder="you@example.com"></div><button class="accent" data-act="signin">Send magic link</button>`)
    : `<p>Running from <code>data/seed.json</code>. Your edits are saved in this browser. To share edits with everyone, connect Supabase in <code>js/config.js</code>.</p>`;
  el.innerHTML = `
    <div class="lbl">Source</div>${sbBlock}<hr>
    <div class="lbl">Move data around</div>
    <p class="note">Export downloads the current wonders and look as JSON. Drop it into <code>reafrondersbe/data/seed.json</code> and run the seed script to load it into Supabase.</p>
    <div class="btnrow">
      <button data-act="export">Export JSON</button>
      <label class="check" style="margin:0"><button data-act="import" type="button">Import JSON</button><input type="file" id="d-file" accept="application/json" hidden></label>
      ${store.mode === 'local' ? '<button class="danger" data-act="reset">Reset to seed</button>' : ''}
    </div>`;
  el.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const a = b.dataset.act;
    if (a === 'signin') { const r = await store.signIn($('#d-email', el).value.trim()); toast(r.msg); }
    if (a === 'signout') { await store.signOut(); renderStudio(); toast('Signed out'); }
    if (a === 'export') {
      const out = { presentation: state.presentation, countries: state.countries, wonders: state.wonders.map(({ id, created_at, updated_at, ...w }) => w) };
      const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
      Object.assign(document.createElement('a'), { href: url, download: 'reafronders-seed.json' }).click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    if (a === 'import') $('#d-file', el).click();
    if (a === 'reset') { if (!confirmInline(b)) return; store.resetLocal(); location.reload(); }
  };
  $('#d-file', el).onchange = async (e) => {
    try {
      const obj = JSON.parse(await e.target.files[0].text());
      if (!Array.isArray(obj.wonders) || !Array.isArray(obj.countries)) throw new Error('Missing wonders/countries');
      state.countries = obj.countries; state.wonders = obj.wonders.map(w => ({ ...w, id: w.id || w.slug }));
      state.presentation = { ...store.seed.presentation, ...(obj.presentation || {}) };
      if (store.mode === 'local') store.importLocal(state);
      applyPresentation(); redraw(true); renderPanel(); renderStudio();
      toast(store.mode === 'local' ? `Imported ${state.wonders.length} wonders` : 'Imported for preview — save each item to publish');
    } catch (err) { toast('Import failed: ' + err.message); }
  };
}

// ── main loop ──────────────────────────────────────────────────────────────
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 16.67, 2.5); last = now;
  if (tween) {
    const k = Math.min(1, (now - tween.start) / tween.dur); tween.step(d3.easeCubicInOut(k));
    const done = k >= 1; redraw(done || frameNo % 5 === 0); if (done) tween = null;
  }
  if (!document.hidden) art.frame(dt);
  frameNo++; requestAnimationFrame(loop);
}

// ── boot ───────────────────────────────────────────────────────────────────
async function init() {
  store = await createStore();
  const [data, g] = await Promise.all([store.load(), fetch('data/africa.geojson').then(r => r.json())]);
  Object.assign(state, data); geo = g;
  art = new Art($('#art'), $('#bloom'));
  baseScale = fitParams(africaFC()).s;
  applyPresentation(); drawCountries(); flyTo(africaFC(), false);
  renderPanel(); renderCrumbs();
  requestAnimationFrame(loop);
  const start = new URLSearchParams(location.search).get('country') ?? state.presentation.focusCountry;
  if (start && featureOf(start)) setTimeout(() => focus(start), 900);

  $('#btn-africa').onclick = home;
  $('#btn-tour').onclick = () => view.tour ? stopTour() : startTour();
  $('#btn-exhibit').onclick = toggleExhibit;
  $('#btn-studio').onclick = () => view.studio ? closeStudio() : openStudio();
  $('#studio-close').onclick = closeStudio;
  $$('.tabs button').forEach(b => b.onclick = () => {
    $$('.tabs button').forEach(x => x.setAttribute('aria-selected', x === b));
    $$('.tab').forEach(t => t.hidden = t.dataset.tab !== b.dataset.tab);
  });
  addEventListener('resize', () => { art.resize(); baseScale = fitParams(africaFC()).s; flyTo(view.focus ? featureOf(view.focus) : africaFC(), false); });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) document.body.classList.remove('exhibit'); });
  addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.key === 'Escape') { if (view.picking) cancelPick(); else if (document.body.classList.contains('exhibit')) toggleExhibit(); else if (view.selected) { view.selected = null; redraw(); renderPanel(); renderCrumbs(); } else if (view.focus) home(); }
    if (e.key === 's' || e.key === 'S') view.studio ? closeStudio() : openStudio();
    if (e.key === 't' || e.key === 'T') view.tour ? stopTour() : startTour();
    if (e.key === 'e' || e.key === 'E') toggleExhibit();
  });
}
init().catch(err => { console.error(err); $('#panel').innerHTML = `<h2>Couldn't start</h2><p>${esc(err.message)}</p><p class="note">If you opened index.html straight from disk, serve the folder instead (e.g. <code>python3 -m http.server</code>).</p>`; });
