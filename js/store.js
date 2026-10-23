// Data layer — one interface, two "sound systems":
//  • supabase: the club PA (shared, live, everyone hears it)
//  • local:    headphones (your browser only; export/import JSON to share)
import { CONFIG } from './config.js?v=20261022i';

const LS_KEY = 'reafronders:v1';
const lsGet = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; } };
const lsSet = (v) => { try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch { /* private mode */ } };
const lsDel = () => { try { localStorage.removeItem(LS_KEY); } catch { } };

export const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);
const WONDER_COLS = ['slug', 'country_iso', 'name', 'local_name', 'category', 'lat', 'lng', 'summary', 'uniqueness', 'stat_label', 'stat_value', 'unesco', 'visible', 'sort_order', 'art', 'media', 'scientific_name', 'citations'];
const COUNTRY_COLS = ['iso_a3', 'name', 'region', 'tagline', 'palette', 'active', 'sort_order'];
const pick = (o, keys) => Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]));

export async function createStore() {
  const seed = await (await fetch('data/seed.json?v=20261022i')).json();
  const forceLocal = new URLSearchParams(location.search).has('local');
  let sb = null, session = null, isEditor = false, mode = 'local', live = new Set();

  if (!forceLocal && CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) {
    try {
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
      sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
      mode = 'supabase';
      session = (await sb.auth.getSession()).data.session;
      isEditor = await checkEditor();
    } catch (e) { console.warn('Supabase unavailable, using local data', e); sb = null; mode = 'local'; }
  }

  async function checkEditor() {
    if (!sb || !session) return false;
    const { data } = await sb.from('editors').select('user_id').eq('user_id', session.user.id).maybeSingle();
    return !!data;
  }

  async function load() {
    if (mode === 'supabase') {
      const [c, w, p] = await Promise.all([
        sb.from('countries').select('*').order('sort_order'),
        sb.from('wonders').select('*').order('sort_order'),
        sb.from('presentation').select('settings').eq('id', 'default').maybeSingle(),
      ]);
      if (!c.error && !w.error) {
        // Supabase is authoritative for every country it holds (edits and deletions stick);
        // countries not loaded into it yet still appear from the published seed.json.
        live = new Set([...c.data.map(x => x.iso_a3), ...w.data.map(x => x.country_iso)]);
        const countries = [...c.data, ...seed.countries.filter(x => !live.has(x.iso_a3))].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const wonders = [...w.data, ...seed.wonders.filter(x => !live.has(x.country_iso)).map(x => ({ ...x, id: x.id || x.slug }))];
        return { countries, wonders, presentation: { ...seed.presentation, ...(p.data?.settings || {}) } };
      }
      console.warn('Supabase read failed — falling back to seed', c.error || w.error);
    }
    const saved = lsGet();
    const base = saved || seed;
    return {
      countries: base.countries,
      wonders: base.wonders.map(w => ({ ...w, id: w.id || w.slug })),
      presentation: { ...seed.presentation, ...(base.presentation || {}) },
    };
  }

  const canPublish = () => mode === 'local' || isEditor;

  // First edit to a country that is still seed-only: copy the whole country into Supabase,
  // so it becomes live with all its wonders (not just the one being edited).
  async function adopt(state, iso, skipSlug) {
    if (live.has(iso)) return null;
    const country = state.countries.find(c => c.iso_a3 === iso);
    if (country) { const r = await sb.from('countries').upsert(pick(country, COUNTRY_COLS), { onConflict: 'iso_a3' }); if (r.error) return r.error.message; }
    const rows = state.wonders.filter(x => x.country_iso === iso && x.slug !== skipSlug).map(x => pick(x, WONDER_COLS));
    if (rows.length) { const r = await sb.from('wonders').upsert(rows, { onConflict: 'slug' }); if (r.error) return r.error.message; }
    live.add(iso); return null;
  }

  return {
    get mode() { return mode; }, get session() { return session; }, get isEditor() { return isEditor; },
    canPublish, load, seed,

    // Persist the whole state (local) or the changed row (supabase)
    async saveWonder(state, w) {
      if (mode === 'local') { lsSet(state); return { ok: true }; }
      if (!isEditor) return { ok: false, msg: 'Preview only — sign in as an editor to publish.' };
      const err = await adopt(state, w.country_iso, w.slug); if (err) return { ok: false, msg: err };
      const country = state.countries.find(c => c.iso_a3 === w.country_iso);
      if (country) { const r = await sb.from('countries').upsert(pick(country, COUNTRY_COLS), { onConflict: 'iso_a3' }); if (r.error) return { ok: false, msg: r.error.message }; }
      const { data, error } = await sb.from('wonders').upsert(pick(w, WONDER_COLS), { onConflict: 'slug' }).select().single();
      if (error) return { ok: false, msg: error.message };
      Object.assign(w, data); return { ok: true };
    },
    async deleteWonder(state, w) {
      if (mode === 'local') { lsSet(state); return { ok: true }; }
      if (!isEditor) return { ok: false, msg: 'Preview only — sign in as an editor to publish.' };
      if (!live.has(w.country_iso)) { const err = await adopt(state, w.country_iso, w.slug); return err ? { ok: false, msg: err } : { ok: true }; }
      const { error } = await sb.from('wonders').delete().eq('slug', w.slug);
      return error ? { ok: false, msg: error.message } : { ok: true };
    },
    async saveCountry(state, c) {
      if (mode === 'local') { lsSet(state); return { ok: true }; }
      if (!isEditor) return { ok: false, msg: 'Preview only — sign in as an editor to publish.' };
      const err = await adopt(state, c.iso_a3); if (err) return { ok: false, msg: err };
      const { error } = await sb.from('countries').upsert(pick(c, COUNTRY_COLS), { onConflict: 'iso_a3' });
      return error ? { ok: false, msg: error.message } : { ok: true };
    },
    async savePresentation(state) {
      if (mode === 'local') { lsSet(state); return { ok: true }; }
      if (!isEditor) return { ok: false, msg: 'Preview only — sign in as an editor to publish.' };
      const { error } = await sb.from('presentation').upsert({ id: 'default', settings: state.presentation });
      return error ? { ok: false, msg: error.message } : { ok: true };
    },
    resetLocal() { lsDel(); },
    importLocal(obj) { lsSet(obj); },

    async signIn(email) {
      if (!sb) return { ok: false, msg: 'Supabase is not configured (js/config.js).' };
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split('#')[0] } });
      return error ? { ok: false, msg: error.message } : { ok: true, msg: 'Magic link sent — check your inbox.' };
    },
    async signOut() { if (sb) await sb.auth.signOut(); session = null; isEditor = false; },
  };
}
