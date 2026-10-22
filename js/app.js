// ReAfronders · app shell: map, story panel, tour, and the Studio editor.
import { Art, PALETTES, MODES, MOTIONS } from './art.js?v=20261022h';
import { createStore, slugify } from './store.js?v=20261022h';
import { Tour } from './tour.js?v=20261022h';
import { Recorder } from './recorder.js?v=20261022h';
import { BRAND } from './config.js?v=20261022h';

const CATEGORIES = ['waterfall', 'mountain', 'gorge', 'rock', 'cave', 'wetland', 'river', 'lake', 'forest', 'desert', 'savanna', 'coast', 'volcano', 'landform', 'heritage', 'flora', 'fauna'];
const DEFAULT_PALETTE = ['#2EC4B6', '#F4D35E', '#EE964B', '#C2185B', '#7BDFF2'];
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isMobile = () => window.innerWidth <= 720;

const state = { countries: [], wonders: [], presentation: {} };
const view = { focus: null, selected: null, picking: false, studio: false, draft: null, draftOriginal: null, edCountry: null, traveller: null };
const J = { token: null, travel: null, routes: [] };
let rec, store, geo, art, tour, baseScale = 1, tween = null, frameNo = 0;

const svg = d3.select('#map');
const gC = svg.append('g'), gR = svg.append('g'), gL = svg.append('g'), gW = svg.append('g');
const projection = d3.geoMercator();
const path = d3.geoPath(projection);

// ── helpers ────────────────────────────────────────────────────────────────
const featureOf = (iso) => geo.features.find(f => f.id === iso);
// Frame a country on its mainland: drop far-off islands (e.g. South Africa's Prince Edward Islands) that would shrink the view
const fitOf = (iso) => {
  const f = featureOf(iso); if (!f || f.geometry.type !== 'MultiPolygon') return f;
  const P = (c) => ({ type: 'Polygon', coordinates: c }), size = (c) => { const [[a, b], [x, y]] = d3.geoBounds(P(c)); return (x - a) * (y - b); };
  const polys = f.geometry.coordinates, main = polys.reduce((a, b) => size(b) > size(a) ? b : a), c = d3.geoCentroid(P(main));
  return { ...f, geometry: { type: 'MultiPolygon', coordinates: polys.filter(p => d3.geoDistance(d3.geoCentroid(P(p)), c) < 0.25) } };
};
const countryOf = (iso) => state.countries.find(c => c.iso_a3 === iso);
const countryName = (iso) => countryOf(iso)?.name || featureOf(iso)?.properties.name || iso;
const visibleWonders = () => state.wonders.filter(w => w.visible !== false && (countryOf(w.country_iso)?.active !== false));
const wondersIn = (iso, all = false) => state.wonders.filter(w => w.country_iso === iso && (all || w.visible !== false)).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
const activeIsos = () => [...new Set(visibleWonders().map(w => w.country_iso))];

function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms); }

function extent() {
  const w = innerWidth, h = innerHeight;
  if (document.body.classList.contains('journey')) return isMobile() ? [[16, 16], [w - 16, h - 16]] : [[40, 40], [w - 40, h - 40]];
  if (isMobile()) return [[16, 96], [w - 16, h * 0.54]];
  const left = 420, right = view.studio ? 440 : 24;
  return [[left, 80], [w - right, h - 24]];
}
function fitParams(target, ext) {
  const p = d3.geoMercator().fitExtent(ext || extent(), target);
  return { s: p.scale(), t: p.translate() };
}
const africaFC = () => ({ type: 'FeatureCollection', features: geo.features.filter(f => !['CPV', 'MUS', 'SYC'].includes(f.id)) });

function flyTo(target, animate = true, { dur = 1300, ext = null, maxZoom = 8 } = {}) {
  const to = fitParams(target, ext);
  if (to.s > baseScale * maxZoom) { // cap zoom, keep the target centred in the extent
    const e = ext || extent(), c = d3.geoCentroid(target), k = (baseScale * maxZoom) / to.s;
    const p = d3.geoMercator().scale(to.s).translate(to.t)(c), mid = [(e[0][0] + e[1][0]) / 2, (e[0][1] + e[1][1]) / 2];
    to.s *= k; to.t = [mid[0] - (p[0] - to.t[0]) * k, mid[1] - (p[1] - to.t[1]) * k];
  }
  if (!animate) { projection.scale(to.s).translate(to.t); redraw(true); return; }
  const from = { s: projection.scale(), t: projection.translate() };
  const iS = d3.interpolateNumber(from.s, to.s), iX = d3.interpolateNumber(from.t[0], to.t[0]), iY = d3.interpolateNumber(from.t[1], to.t[1]);
  tween = { start: performance.now(), dur, step: (k) => { projection.scale(iS(k)).translate([iX(k), iY(k)]); } };
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
    .on('click', (ev, d) => { if (view.picking) return; focus(d.id); });
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
    g.on('click', (ev, d) => { ev.stopPropagation(); if (view.picking) return; select(d.id); })
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
  // Continent view: country labels stack in a column out at sea, with leader lines, so neighbours never collide
  const labels = view.focus ? [] : [...act].map(iso => ({ iso, f: featureOf(iso) })).filter(d => d.f)
    .map(d => ({ ...d, c: path.centroid(fitOf(d.iso)), b: path.bounds(fitOf(d.iso)) })).sort((a, b) => a.c[1] - b.c[1]);
  const colX = labels.length ? Math.max(...labels.map(d => d.b[1][0])) + 28 : 0;
  let yPrev = -Infinity; for (const d of labels) { d.y = Math.max(d.c[1], yPrev + 22); yPrev = d.y; }
  gL.selectAll('path.cline').data(labels, d => d.iso).join('path').attr('class', 'cline')
    .attr('d', d => `M${d.c[0]},${d.c[1]} L${colX - 14},${d.y - 4} L${colX - 4},${d.y - 4}`);
  gL.selectAll('text').data(labels, d => d.iso).join('text').attr('class', 'clabel')
    .attr('text-anchor', 'start')
    .attr('transform', d => `translate(${colX},${d.y})`)
    .text(d => `${countryName(d.iso)} · ${wondersIn(d.iso).length}`);

  redrawEmitters(vw);
  if (rebuildMask) art.setMasks(path, geo.features, view.focus ? featureOf(view.focus) : null);
}

// particle emitters (wonders + the journey's travelling comet)
function redrawEmitters(vw = visibleWonders()) {
  const zoom = projection.scale() / baseScale;
  const radius = Math.max(5, Math.min(46, 5 * Math.sqrt(zoom) * 1.6));
  const list = vw.filter(w => !view.focus || w.country_iso === view.focus || zoom < 2).map(w => {
    const p = projection([w.lng, w.lat]);
    return { id: w.id, x: p[0], y: p[1], color: w.art?.color || '#ffffff', intensity: w.art?.intensity ?? 0.8, motion: w.art?.motion || 'orbit' };
  });
  if (view.traveller) { const t = view.traveller, p = projection([t.lng, t.lat]); list.push({ id: '__traveller', x: p[0], y: p[1], color: t.color, intensity: 3.2, motion: 'ripple' }); }
  if (art.emitters.length !== list.length || art.emitters.some((e, i) => e.id !== list[i].id || e.color !== list[i].color)) art.setEmitters(list, radius);
  else { art.emitters = list; art.chain = list; art.radius = radius; }
  art.setSelected(view.selected);
  // journey routes follow the map
  gR.selectAll('path').data(J.routes, d => d.id).join('path').attr('class', 'route')
    .attr('d', d => d3.line()(d.pts.slice(0, Math.max(2, Math.ceil(d.pts.length * d.k))).map(q => projection(q))))
    .style('color', d => d.color).attr('stroke', d => d.color).style('opacity', d => d.op);
}

// ── tooltip ────────────────────────────────────────────────────────────────
function tip(ev, text) { const t = $('#tip'); t.textContent = text; t.style.left = `${ev.clientX + 14}px`; t.style.top = `${ev.clientY + 12}px`; t.style.opacity = 1; }
function hideTip() { $('#tip').style.opacity = 0; }

// ── navigation ─────────────────────────────────────────────────────────────
function focus(iso, { keepSelection = false } = {}) {
  view.focus = iso; if (!keepSelection) view.selected = null;
  const c = countryOf(iso);
  art.setCountryPalette(iso ? (c?.palette?.length ? c.palette : DEFAULT_PALETTE) : null);
  flyTo(iso ? fitOf(iso) : africaFC());
  if (view.studio && iso && view.edCountry !== iso) { view.edCountry = iso; view.draft = null; renderStudio(); }
  renderPanel(); renderCrumbs();
}
function select(id) {
  const w = state.wonders.find(x => x.id === id); if (!w) return;
  if (view.focus !== w.country_iso) focus(w.country_iso, { keepSelection: true });
  view.selected = id; redraw(); renderPanel(); renderCrumbs();
}
function home() { focus(null); }

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
      ${w.scientific_name ? `<div class="sci"><i>${esc(w.scientific_name)}</i></div>` : ''}
      <div class="chips">${w.unesco ? '<span class="chip unesco">UNESCO World Heritage</span>' : ''}<span class="chip">${esc(w.art?.motion || 'orbit')}</span></div>
      ${w.stat_value ? `<div class="stat"><b>${esc(w.stat_value)}</b><span>${esc(w.stat_label || '')}</span></div>` : ''}
      <p>${esc(w.summary)}</p>
      ${w.uniqueness ? `<p class="unique">${esc(w.uniqueness)}</p>` : ''}
      <button class="accent tour-btn" data-act="tour">${w.media?.video ? '▶ Enter virtual tour' : w.media?.images?.length ? `▶ Enter virtual tour · ${w.media.images.length} photo${w.media.images.length > 1 ? 's' : ''}` : '◌ Virtual tour (swarm only — media coming)'}</button>
      ${(w.citations || []).length ? `<details class="srcs"><summary>Sources (${w.citations.length})</summary><ul>${w.citations.map(u => { let h = u; try { h = new URL(u).hostname.replace(/^www\./, ''); } catch { } return `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(h)}</a></li>`; }).join('')}</ul></details>` : ''}
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
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.id) select(b.dataset.id);
    if (b.dataset.iso) focus(b.dataset.iso);
    if (b.dataset.act === 'back') { view.selected = null; redraw(); renderPanel(); renderCrumbs(); }
    if (b.dataset.act === 'studio') openStudio(true);
    if (b.dataset.act === 'tour') openTour(view.selected);
  };
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
  renderStudio(); flyTo(view.focus ? fitOf(view.focus) : africaFC());
}
function closeStudio() { cancelPick(); revertDraft(); view.studio = false; $('#studio').hidden = true; $('#btn-studio').classList.remove('on'); flyTo(view.focus ? fitOf(view.focus) : africaFC()); }

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
  const a = d.art || {}, m = d.media || {};
  return `
    <div class="lbl">${d.id ? 'Edit wonder' : 'New wonder'} · ${esc(countryName(d.country_iso))}</div>
    <div class="field"><label for="w-name">Name *</label><input type="text" id="w-name" value="${esc(d.name)}" required></div>
    <div class="field"><label for="w-local">Local name / meaning</label><input type="text" id="w-local" value="${esc(d.local_name || '')}"></div>
    <div class="field"><label for="w-sci">Scientific name (flora / fauna)</label><input type="text" id="w-sci" value="${esc(d.scientific_name || '')}" placeholder="e.g. Gloriosa superba"></div>
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
    <div class="field"><label for="w-cite">Sources (one URL per line — aim for 2+ independent)</label><textarea id="w-cite" placeholder="https://whc.unesco.org/en/list/364/">${esc((d.citations || []).join('\n'))}</textarea></div>
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
    <hr>
    <div class="lbl">Virtual tour footage</div>
    <p class="note">A ~30 s loop. Use a direct .webm or .mp4 link; Wikimedia Commons files allow the colour-morph. Other hosts may only crossfade.</p>
    <div class="field"><label for="m-video">Video URL</label><input type="text" id="m-video" value="${esc(m.video || '')}" placeholder="https://upload.wikimedia.org/...webm"></div>
    <div class="field"><label for="m-fallback">Fallback URL (mp4, for Safari/iPhone)</label><input type="text" id="m-fallback" value="${esc(m.fallback || '')}"></div>
    <div class="row">
      <div class="field"><label for="m-credit">Credit</label><input type="text" id="m-credit" value="${esc(m.credit || '')}" placeholder="Filmmaker"></div>
      <div class="field"><label for="m-license">Licence</label><input type="text" id="m-license" value="${esc(m.license || '')}" placeholder="CC BY-SA 4.0"></div>
    </div>
    <div class="field"><label for="m-source">Source page</label><input type="text" id="m-source" value="${esc(m.source || '')}"></div>
    <div class="row">
      <div class="field"><label for="m-start">Start at (s)</label><input type="number" id="m-start" min="0" step="0.5" value="${esc(m.start ?? 0)}"></div>
      <div class="field"><label for="m-note">Note</label><input type="text" id="m-note" value="${esc(m.note || '')}" placeholder="e.g. stand-in footage"></div>
    </div>
    <div class="field"><label for="m-images">Photo loop — one per line: url | credit | licence | source page</label><textarea id="m-images" placeholder="https://upload.wikimedia.org/... | Photographer | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:...">${esc((m.images || []).map(i => [i.url, i.credit, i.license, i.source].map(x => x || '').join(' | ')).join('\n'))}</textarea></div>
    <p class="note">Used when there is no video (or it fails). Find openly licensed media with the harvester: <code>reafrondersbe/tools/harvest</code>.</p>
    <div class="btnrow" style="margin-bottom:12px"><button data-act="preview-tour">▶ Preview tour</button></div>
    <div class="btnrow"><button class="accent" data-act="save">Save wonder</button><button data-act="cancel">Cancel</button></div>`;
}

function readForm(el) {
  const d = view.draft, v = (id) => $(id, el).value;
  Object.assign(d, {
    name: v('#w-name').trim(), local_name: v('#w-local').trim() || null, scientific_name: v('#w-sci').trim() || null,
    citations: v('#w-cite').split('\n').map(x => x.trim()).filter(x => /^https?:\/\//.test(x)), category: v('#w-cat'), sort_order: +v('#w-order') || 0,
    lat: +v('#w-lat'), lng: +v('#w-lng'), summary: v('#w-sum').trim(), uniqueness: v('#w-uni').trim() || null,
    stat_label: v('#w-sl').trim() || null, stat_value: v('#w-sv').trim() || null,
    unesco: $('#w-unesco', el).checked, visible: $('#w-vis', el).checked,
    art: { color: v('#w-color').toUpperCase(), motion: v('#w-motion'), intensity: +v('#w-int') },
    media: Object.fromEntries(Object.entries({ images: v('#m-images').split('\n').map(l => l.split('|').map(x => x.trim())).filter(([u]) => /^https?:\/\//.test(u || '')).map(([url, credit, license, source]) => ({ url, credit, license, source })), video: v('#m-video').trim(), fallback: v('#m-fallback').trim(), credit: v('#m-credit').trim(), license: v('#m-license').trim(), source: v('#m-source').trim(), start: +v('#m-start') || 0, note: v('#m-note').trim() }).filter(([k, x]) => x !== '' && !(k === 'start' && x === 0) && !(Array.isArray(x) && !x.length))),
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
    if (b.dataset.act === 'preview-tour') { const d = readForm(el); openTour(null, { ...d, id: d.id || '__draft' }); }
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
    <hr>
    <div class="lbl">Journey (non-interactive display)</div>
    <p class="note">Flies site to site in 8 movements: A→Z, East→West, South→North, Spiral out, then the same in reverse, on a loop. Link: <code>?journey=${esc(P.journeyCategory || 'all')}&amp;dwell=${P.journeyDwell || 12}</code></p>
    <div class="field"><label for="p-jcat">Category</label><select id="p-jcat" data-k="journeyCategory"><option value="all">All categories</option>${[...new Set(visibleWonders().map(w => w.category))].sort().map(c => `<option value="${c}" ${c === P.journeyCategory ? 'selected' : ''}>${c} (${visibleWonders().filter(w => w.category === c).length})</option>`).join('')}</select></div>
    <div class="slider"><label for="p-journeyDwell">Seconds per site</label><output id="po-journeyDwell">${P.journeyDwell || 12}s</output><input type="range" id="p-journeyDwell" data-k="journeyDwell" min="6" max="30" step="1" value="${P.journeyDwell || 12}"></div>
    <div class="btnrow" style="margin-bottom:14px"><button data-act="journey">▶ Start journey</button><button data-act="journey-full">⛶ Exhibit (fullscreen)</button></div>
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
    if (b.dataset.act === 'journey') startJourney();
    if (b.dataset.act === 'journey-full') startJourney({ fullscreen: true });
    if (b.dataset.act === 'reset-look') { state.presentation = { ...store.seed.presentation }; applyPresentation(); renderLookTab(); }
  };
}
const formatOut = (k, v) => ({ journeyDwell: v + 's', particles: (+v).toLocaleString(), speed: (+v).toFixed(2) + '×', trail: (+v).toFixed(3), glow: (+v).toFixed(2), vortex: (+v).toFixed(2), bpm: v + ' bpm' }[k] ?? v);

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

// ── virtual tour (floating player) ─────────────────────────────────────────
const closeUp = (w, r = 1.3) => d3.geoCircle().center([w.lng, w.lat]).radius(r)();
function openTour(id, draft) {
  const w = draft || state.wonders.find(x => x.id === id); if (!w) return;
  hideTip();
  if (!draft) { if (view.focus !== w.country_iso) focus(w.country_iso, { keepSelection: true }); view.selected = w.id; renderPanel(); renderCrumbs(); }
  flyTo(closeUp(w), true, { dur: 1100, maxZoom: 11 });
  tour.show(w);
}

// ── Journey: non-interactive site-to-site display ──────────────────────────
// Like a DJ set in eight movements: four orderings, then the same four played
// backwards, looping forever. Each stop: travel → arrive → footage loop → dissolve.
const angleCW = (dx, dy) => ((Math.atan2(dx, dy) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2); // clockwise from north
function spiralOrder(list) {
  const c = [d3.mean(list, w => w.lng), d3.mean(list, w => w.lat)];
  const r = list.map(w => Math.hypot(w.lng - c[0], w.lat - c[1])), rmax = Math.max(...r, 1e-6);
  return list.map((w, i) => ({ w, k: angleCW(w.lng - c[0], w.lat - c[1]) + 2 * (r[i] / rmax) })).sort((a, b) => a.k - b.k).map(d => d.w);
}
const FORWARD = [
  { n: 'I', label: 'A → Z', sub: (c) => c === 'all' ? 'every category, alphabetical' : `${c} · alphabetical`, order: l => [...l].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)) },
  { n: 'II', label: 'East → West', sub: () => 'following the sun', order: l => [...l].sort((a, b) => b.lng - a.lng) },
  { n: 'III', label: 'South → North', sub: () => 'against the current', order: l => [...l].sort((a, b) => a.lat - b.lat) },
  { n: 'IV', label: 'Spiral outward', sub: () => 'from the heart of the land', order: spiralOrder, spiral: true },
];
const MOVEMENTS = [...FORWARD, ...[
  { n: 'V', label: 'Spiral inward', sub: () => 'back to the heart', of: 3 },
  { n: 'VI', label: 'North → South', sub: () => 'with the current', of: 2 },
  { n: 'VII', label: 'West → East', sub: () => 'towards the sunrise', of: 1 },
  { n: 'VIII', label: 'Z → A', sub: (c) => c === 'all' ? 'every category, reversed' : `${c} · reversed`, of: 0 },
].map(m => ({ ...m, spiral: FORWARD[m.of].spiral, order: l => FORWARD[m.of].order(l).reverse() }))];

const jCat = () => state.presentation.journeyCategory || 'all';
const jDwell = () => +state.presentation.journeyDwell || 12;
const journeyList = () => visibleWonders().filter(w => jCat() === 'all' || w.category === jCat());
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const closeExtent = () => isMobile() ? [[16, 24], [innerWidth - 16, innerHeight * 0.4]] : [[60, 60], [innerWidth * 0.42, innerHeight - 60]];

function startJourney({ fullscreen = false } = {}) {
  if (J.token) return;
  if (!journeyList().length) return toast(`No visible wonders in “${jCat()}”.`);
  if (view.studio) closeStudio();
  if (tour.open) tour.hide();
  J.token = {}; document.body.classList.add('journey');
  $('#journey-hud').hidden = false; $('#journey-stop').hidden = false; $('#btn-journey').classList.add('on');
  if (fullscreen) { try { document.documentElement.requestFullscreen?.()?.catch?.(() => { }); } catch { } }
  runJourney(J.token).catch(err => { console.error(err); stopJourney(); });
}
function stopJourney() {
  if (!J.token) return;
  J.token = null; J.travel = null; J.routes = []; view.traveller = null;
  document.body.classList.remove('journey', 'awake');
  $('#journey-hud').hidden = true; $('#journey-stop').hidden = true; $('#journey-title').classList.remove('show'); $('#btn-journey').classList.remove('on');
  if (tour.open) tour.hide();
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch { }
  view.selected = null; focus(null);
}

async function runJourney(token) {
  const alive = () => J.token === token;
  let prev = null;
  while (alive()) {
    for (const mv of MOVEMENTS) {
      const order = mv.order(journeyList()); if (!order.length) return stopJourney();
      await titleCard(mv, order); if (!alive()) return;
      for (let i = 0; i < order.length; i++) {
        const w = order[i]; hud(mv, w, i, order.length);
        if (prev && prev.id !== w.id) { await travel(prev, w, mv, i, token); if (!alive()) return; }
        await arrive(w); if (!alive()) return;
        await stay(w, mv); if (!alive()) return;
        prev = w;
      }
    }
  }
}

async function titleCard(mv, order) {
  const el = $('#journey-title');
  el.innerHTML = `<div><span class="n">Movement ${mv.n}</span><span class="t">${esc(mv.label)}</span><span class="s">${esc(mv.sub(jCat()))} · ${order.length} site${order.length > 1 ? 's' : ''}</span></div>`;
  view.selected = null; redraw();
  flyTo({ type: 'FeatureCollection', features: order.map(w => ({ type: 'Feature', geometry: closeUp(w, 1.2) })) }, true, { dur: 1800, maxZoom: 6 });
  el.classList.add('show'); await sleep(2800); el.classList.remove('show'); await sleep(500);
}

function hud(mv, w, i, n) {
  $('#journey-hud .j-move').textContent = `${mv.n} · ${mv.label}${jCat() === 'all' ? '' : ' · ' + jCat()}`;
  $('#journey-hud .j-site').textContent = `${w.name}`;
  $('#journey-hud .j-steps').innerHTML = Array.from({ length: n }, (_, k) => `<i class="${k < i ? 'done' : k === i ? 'now' : ''}"></i>`).join('');
}

// a curved flight between two sites; spirals bend away from the centre, others alternate
function travel(a, b, mv, i, token) {
  const A = [a.lng, a.lat], B = [b.lng, b.lat], dist = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1e-6;
  const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  let nrm = [-(B[1] - A[1]) / dist, (B[0] - A[0]) / dist];
  if (mv.spiral) {
    const L = journeyList(), c = [d3.mean(L, w => w.lng), d3.mean(L, w => w.lat)];
    if (nrm[0] * (M[0] - c[0]) + nrm[1] * (M[1] - c[1]) < 0) nrm = [-nrm[0], -nrm[1]];
  } else if (i % 2) nrm = [-nrm[0], -nrm[1]];
  const C = [M[0] + nrm[0] * dist * 0.32, M[1] + nrm[1] * dist * 0.32];
  const pts = d3.range(41).map(k => { const t = k / 40, u = 1 - t; return [u * u * A[0] + 2 * u * t * C[0] + t * t * B[0], u * u * A[1] + 2 * u * t * C[1] + t * t * B[1]]; });
  const route = { id: `${a.id}>${b.id}>${performance.now()}`, pts, k: 0, op: 1, color: b.art?.color || '#fff' };
  J.routes.forEach(r => r.op *= 0.55); J.routes = [...J.routes.filter(r => r.op > 0.08), route].slice(-6);
  const dur = Math.min(5200, Math.max(2200, 1800 + dist * 650));
  view.selected = null; view.focus = null; art.setCountryPalette(null);
  flyTo({ type: 'FeatureCollection', features: [closeUp(a, 0.9), closeUp(b, 0.9), d3.geoCircle().center(C).radius(0.6)()].map(g => ({ type: 'Feature', geometry: g })) }, true, { dur: dur * 0.55, maxZoom: 7 });
  return new Promise(res => { J.travel = { start: performance.now(), dur, pts, route, color: route.color, res, token }; });
}

async function arrive(w) {
  view.focus = w.country_iso; view.selected = w.id;
  const c = countryOf(w.country_iso); art.setCountryPalette(c?.palette?.length ? c.palette : DEFAULT_PALETTE);
  flyTo(closeUp(w), true, { dur: 1300, ext: closeExtent(), maxZoom: 12 });
  await sleep(1350);
}

function stay(w, mv) {
  return new Promise(res => {
    tour.show(w, { journey: { dwell: jDwell(), caption: `${mv.n} · ${mv.label}`, onDone: () => tour.dismiss().then(res) } });
  });
}

// advance the travelling comet (called from the main loop)
function stepTravel(now) {
  const T = J.travel; if (!T) return;
  if (T.token !== J.token) { J.travel = null; view.traveller = null; return; }
  const k = Math.min(1, (now - T.start) / T.dur), e = d3.easeCubicInOut(k);
  const f = e * (T.pts.length - 1), i = Math.floor(f), r = f - i, p0 = T.pts[i], p1 = T.pts[Math.min(i + 1, T.pts.length - 1)];
  view.traveller = { lng: p0[0] + (p1[0] - p0[0]) * r, lat: p0[1] + (p1[1] - p0[1]) * r, color: T.color };
  T.route.k = e;
  if (k >= 1) { J.travel = null; view.traveller = null; T.res(); }
}

// ── main loop ──────────────────────────────────────────────────────────────
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 16.67, 2.5); last = now;
  stepTravel(now);
  if (tween) {
    const k = Math.min(1, (now - tween.start) / tween.dur); tween.step(d3.easeCubicInOut(k));
    const done = k >= 1; redraw(done || frameNo % 5 === 0); if (done) tween = null;
  } else if (J.token) redraw(false);
  if (!document.hidden && !(tour && tour.open && tour.expanded)) art.frame(dt);
  frameNo++; requestAnimationFrame(loop);
}

// ── boot ───────────────────────────────────────────────────────────────────
// A hidden or collapsed window can report a 0×0 viewport: wait for real size before drawing
const hasSize = () => innerWidth > 0 && innerHeight > 0;
const waitForSize = () => new Promise(res => { if (hasSize()) return res(); const f = () => { if (hasSize()) { removeEventListener('resize', f); res(); } }; addEventListener('resize', f); });

async function init() {
  store = await createStore();
  await waitForSize();
  const [data, g] = await Promise.all([store.load(), fetch('data/africa.geojson').then(r => r.json())]);
  Object.assign(state, data); geo = g;
  art = new Art($('#art'), $('#bloom'));
  tour = new Tour({
    noise: art.noise,
    getList: () => visibleWonders().sort((a, b) => a.country_iso.localeCompare(b.country_iso) || (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    anchorOf: (w) => projection([w.lng, w.lat]),
    avoidRects: () => J.token ? [] : [$('#panel'), view.studio ? $('#studio') : null].filter(Boolean).map(el => el.getBoundingClientRect()),
    onChange: (w) => { if (w.id !== '__draft' && w.id !== view.selected && state.wonders.some(x => x.id === w.id)) { select(w.id); flyTo(closeUp(w), true, { dur: 1100, maxZoom: 11 }); } },
    onClose: () => { last = performance.now(); },
  });
  const deep = new URLSearchParams(location.search).get('tour');
  baseScale = fitParams(africaFC()).s;
  applyPresentation(); drawCountries(); flyTo(africaFC(), false);
  renderPanel(); renderCrumbs();
  requestAnimationFrame(loop);
  const start = new URLSearchParams(location.search).get('country') ?? state.presentation.focusCountry;
  if (start && featureOf(start)) setTimeout(() => focus(start), 900);
  if (deep) { const w = state.wonders.find(x => x.slug === deep); if (w) setTimeout(() => openTour(w.id), 1400); }
  const qp = new URLSearchParams(location.search);
  if (qp.has('journey')) {
    if (qp.get('journey')) state.presentation.journeyCategory = qp.get('journey');
    if (qp.get('dwell')) state.presentation.journeyDwell = +qp.get('dwell');
    setTimeout(() => startJourney(), 1600);
  }

  // ── Clip recorder (Reels / TikTok / YouTube) ──
  rec = new Recorder({
    art, tourEl: $('#tour'), brand: BRAND, toast,
    title: () => tour.open ? (tour.current?.name || '') : J.token ? $('.j-site').textContent : view.selected ? (state.wonders.find(w => w.id === view.selected)?.name || '') : view.focus ? countryName(view.focus) : 'Africa',
    overlay: (ctx) => {   // pins (the SVG map isn't in the canvas, so redraw the dots + focused labels)
      for (const w of visibleWonders()) {
        const p = projection([w.lng, w.lat]); if (!p || p[0] < -20 || p[1] < -20 || p[0] > innerWidth + 20 || p[1] > innerHeight + 20) continue;
        ctx.beginPath(); ctx.arc(p[0], p[1], w.id === view.selected ? 5 : 3.4, 0, 7); ctx.fillStyle = w.art?.color || '#fff'; ctx.fill();
        ctx.beginPath(); ctx.arc(p[0], p[1], 8, 0, 7); ctx.strokeStyle = (w.art?.color || '#fff') + '99'; ctx.lineWidth = 1; ctx.stroke();
        if (w.country_iso === view.focus && !tour.open) { ctx.font = '500 11px "Space Grotesk", system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillText(w.name, p[0] + 10, p[1] + 4); }
      }
    },
    startJourney: (spec) => { const cat = spec.split(':')[1] || 'all'; state.presentation.journeyCategory = cat; startJourney(); },
    stopJourney,
  });
  $('#btn-record').onclick = () => {
    if (!Recorder.supported()) return toast('This browser cannot record video — try Chrome, Edge or Safari 17+.');
    const sel = $('#rec-what'); const cats = [...new Set(visibleWonders().map(w => w.category))].sort();
    sel.innerHTML = `<option value="view">What's on screen now${tour.open ? ` · ${esc(tour.current?.name || 'tour')}` : ''}</option><option value="journey:all">Journey · all categories</option>` + cats.map(c => `<option value="journey:${c}">Journey · ${c}</option>`).join('');
    $('#rec-dialog').showModal();
  };
  $('#rec-dialog').addEventListener('close', async () => {
    if ($('#rec-dialog').returnValue !== 'go') return;
    const what = $('#rec-what').value, opts = { fmt: $('#rec-fmt').value, seconds: +$('#rec-len').value, journey: what.startsWith('journey') ? what : null, audioFile: $('#rec-audio').files[0] || null, signature: $('#rec-sign').checked };
    for (const n of [3, 2, 1]) { toast(`Recording in ${n}…`); await sleep(1000); }
    rec.start(opts);
  });

  $('#btn-africa').onclick = home;
  $('#btn-journey').onclick = () => J.token ? stopJourney() : startJourney();
  $('#btn-exhibit').onclick = () => startJourney({ fullscreen: true });
  $('#journey-stop').onclick = stopJourney;
  let wake; addEventListener('pointermove', () => { if (!J.token) return; document.body.classList.add('awake'); clearTimeout(wake); wake = setTimeout(() => document.body.classList.remove('awake'), 2500); });
  $('#btn-studio').onclick = () => view.studio ? closeStudio() : openStudio();
  $('#studio-close').onclick = closeStudio;
  $$('.tabs button').forEach(b => b.onclick = () => {
    $$('.tabs button').forEach(x => x.setAttribute('aria-selected', x === b));
    $$('.tab').forEach(t => t.hidden = t.dataset.tab !== b.dataset.tab);
  });
  addEventListener('resize', () => { if (!hasSize()) return; art.resize(); baseScale = fitParams(africaFC()).s; flyTo(view.focus ? fitOf(view.focus) : africaFC(), false); });

  addEventListener('keydown', (e) => {
    if (rec?.active && e.key === 'Escape') { rec.stop(); return; }
    if (J.token) { if (e.key === 'Escape' || e.key === 'j' || e.key === 'J') stopJourney(); return; }
    if (tour?.open) return;
    if (e.target.matches('input, textarea, select')) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.key === 'Escape') { if (view.picking) cancelPick(); else if (view.selected) { view.selected = null; redraw(); renderPanel(); renderCrumbs(); } else if (view.focus) home(); }
    if (e.key === 's' || e.key === 'S') view.studio ? closeStudio() : openStudio();
    if (e.key === 'j' || e.key === 'J') startJourney();
    if (e.key === 'e' || e.key === 'E') startJourney({ fullscreen: true });
  });
}
init().catch(err => { console.error(err); $('#panel').innerHTML = `<h2>Couldn't start</h2><p>${esc(err.message)}</p><p class="note">If you opened index.html straight from disk, serve the folder instead (e.g. <code>python3 -m http.server</code>).</p>`; });
