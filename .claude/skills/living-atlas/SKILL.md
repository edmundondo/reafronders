---
name: living-atlas
description: Build or extend a Refik Anadol-style generative "living atlas" — particle-flow map of a region with per-site emitters, footage/photo loops that morph out of the particles, a floating player, a looping kiosk Journey, a Studio editor and a Supabase backend on GitHub Pages. Use to replicate ReAfronders for another country, continent or theme, or to add countries, heritage, flora and fauna.
---

# Living Atlas (ReAfronders pattern) — v2

A static site (no build step) plus a Supabase backend. The reference implementation is
`edmundondo/reafronders` (frontend) + `edmundondo/reafrondersbe` (backend). Copy those
when they're available; this file is the recipe for rebuilding or adapting them. For finding facts
and media, use the companion skill **open-media-harvest**.

Think of it as a DJ rig: the map is the platter, the particles are the groove, each site is a needle drop,
the Studio is the mixer, and the Journey is a pre-planned set that plays itself.

## 0. Decide the scope (ask once, then build)

- Region and countries. The **default country mix** is:
  - 6–10 top natural wonders
  - **every UNESCO World Heritage site** (natural and cultural)
  - **1 signature plant** (national flower or tree, or an iconic endemic)
  - **1 signature animal** (national animal, or an iconic or endangered endemic)
- Palettes: one 5-swatch **colour story per country, drawn from its land**, e.g. Okavango greens and blues, Namib dune reds.
- Repos: a frontend repo (GitHub Pages) and a backend repo (Supabase migrations and seed).
- Supabase project: check for table-name clashes. A free-tier project may be **hibernated**, and every query then
  times out until it's restored in the dashboard; tell the user rather than retrying.
- If a request looks truncated or could mean several scopes, ask one multiple-choice question before a large batch.

## 1. Map data (free, public domain)

```bash
npm i world-atlas@2.0.2 topojson-client@3.1.0 topojson-simplify@3.0.3 i18n-iso-countries@7.11.0
```
Filter `countries-50m.json` to the region's ISO-3 codes, presimplify with `quantile(t, 0.25)`, round coordinates to
3 dp, and write `data/<region>.geojson`. Africa came out at about 58 KB for 56 territories.

## 2. Content: one JSON is the source of truth

`data/seed.json` holds `{ presentation, countries[], wonders[] }`. **Keep the frontend and backend copies byte-identical.**

- **Country:** `iso_a3, name, region, tagline, palette[5], active, sort_order`. The country must exist before its wonders (foreign key).
- **Wonder:** `slug, country_iso, name, local_name, scientific_name, category, lat, lng, summary, uniqueness, stat_label, stat_value, unesco, visible, sort_order, art{color,intensity,motion}, media{video,fallback,images[{url,credit,license,source}],credit,license,source,start,note}, citations[urls]`.
- **Categories:** `waterfall mountain gorge rock cave wetland river lake forest desert savanna coast volcano landform heritage flora fauna`.
- **Motions:**
  - waterfall → `cascade`
  - cave or sinkhole → `sink`
  - granite, rock or heritage → `orbit`
  - wetland, lake or coast → `ripple`
  - herds and big game → `herd`
  - mountains → `mist`
  - zigzag gorges → `zigzag`
  - plants → `bloom`
- **Facts:**
  - Two independent sources: the UNESCO page for World Heritage sites, plus Wikipedia, Wikidata, GBIF or a park authority.
  - Hedge with "~" or "often cited".
  - Never copy text; write your own one-line summary and uniqueness.
  - Record the sources in `citations`.
  - For widespread species, use a representative point and say so in `uniqueness`.
- **Shared sites** (e.g. Victoria Falls between Zambia and Zimbabwe, Chimanimani between Zimbabwe and Mozambique): add the entry
  once, under the country already on the map, and mention the other country. Don't duplicate pins.
- `scripts/build-seed.mjs` turns the JSON into an idempotent `supabase/seed.sql` (upserts on `slug`).

## 3. Backend (Supabase)

Tables are `countries`, `wonders`, `presentation(id='default', settings jsonb)` and `editors(user_id → auth.users)`, with
`is_editor()` as a SECURITY DEFINER SQL function. RLS: the public can read active countries, visible wonders and the
presentation; editors can do everything; nobody can insert themselves into editors.

- Test migrations and seed in PGlite (`@electric-sql/pglite`). Stub `auth.users`, `auth.uid()` and the anon/authenticated
  roles, then check: anon inserts are refused, non-editors are blocked, editors can write, the seed re-runs safely,
  and invalid categories are rejected.
- **Supabase MCP gotchas:**
  - Don't use `$$` bodies. Write functions with single-quoted bodies.
  - Send DDL and upserts in **batches of about 10 KB** (about 5 wonders each, or one country at a time).
  - After any timeout, query the catalogue or row counts to see what actually landed before retrying.
- Add the first editor with `insert into editors select id from auth.users where email = '…'`.
- Run `get_advisors(security)` afterwards and report only the findings caused by your own changes.

## 4. Frontend modules (plain ES modules, d3 from cdnjs)

| File | Role |
|---|---|
| `js/art.js` | Curl-noise particle field clipped to the land mask. Wonders are emitters with motion signatures. Exposure adapts to density, and each colour gets one stroke. Modes: flow / pulse (BPM-locked) / constellation. |
| `js/app.js` | Mercator map with tweens (`flyTo(target, animate, {dur, ext, maxZoom})`), label nudging, story panel (scientific name, sources), Studio (wonders incl. photo-loop editor / presentation / data), Journey. |
| `js/tour.js` | The floating loop player: video, or a photo loop when there's no video or it fails. |
| `js/store.js` | Same API for `supabase` and `local` modes; writes require the editor role. |
| `js/config.js` | Supabase URL + anon key (safe to publish; RLS guards writes). |

**Floating player:** about 36% of the screen width (260–620 px; full width on phones). For each frame it scores 8
positions around the pin (never cover it, avoid panels, stay on screen), eases toward the best one and draws a
dashed leader line. ⤢ expands it; F goes fullscreen.

**Morph:** particles burst from the pin, sample the media (with the same cover crop the video uses), adopt its
colours, flow along the luminance edges, then the media fades in through a blur and later dissolves back.
**Photo loop:** each of 2–3 `media.images` gets an equal share of the loop, a slow push-in with drift, and a 1.4 s
crossfade, with per-photo credits.

**Journey (kiosk):** eight movements: A→Z (category, then name), East→West, South→North, Spiral outward
(clockwise angle + 2·r/rmax), then the four reversed, looping forever. A comet travels a Bézier route between
sites. URL params: `?journey=<category|all>&dwell=<s>`, `?tour=<slug>`, `?country=<ISO3>`, `?local`.

**Cache-busting:** keep `?v=<stamp>` on the CSS, the app entry, every relative import and the `seed.json` fetch,
and bump it on each release.

## 5. Media (free, licensed, CORS-friendly)

Follow **open-media-harvest**:
- Licences: CC0, PD, CC BY or CC BY-SA only.
- Read each description to confirm the place, and label stand-ins.
- Prefer real video; otherwise use 2–3 photos.
- Morph-ready hosts: `upload.wikimedia.org` (normalise `thumb.wikimedia.org` URLs to
  `upload.wikimedia.org/wikipedia/commons/thumb/...`) and `inaturalist-open-data.s3.amazonaws.com`.
- Commons videos: use the `…480p.vp9.webm` derivative as `video` and `…360p.mpeg4.mov` as `fallback`.

## 6. Test

Use Playwright (Chromium is preinstalled; never download browsers).
- Route `cdnjs d3` to the local `node_modules/d3/dist/d3.min.js` and abort fonts.
- Route the media hosts to local test files (an `ffmpeg testsrc2` VP9 clip and `mandelbrot` / `cellauto` JPEGs),
  sending `Access-Control-Allow-Origin: *`.
- Check the continent view, each new country view, a heritage, flora and fauna panel, a photo-loop tour,
  a swarm-only tour, a journey for a category, and a Studio edit/save of the new fields.
- The only console errors should be the aborted fonts.

## 7. Ship (when the session can't push but the user's Mac is linked with GitKraken)

1. Commit in the cloud clone as **Claude <noreply@anthropic.com>**. Commits are SSH-signed automatically
   (`commit.gpgsign`), and GitHub shows them as Verified.
2. Run `git bundle create /mnt/user-data/outputs/x.bundle <old>..main`, then `device_commit_files` it to
   `~/Documents/GitHub/_bundles/` (remote tools can't write into `.git`, `.claude` or `.github`; git can).
3. On the Mac shell, run `git pull --ff-only ../_bundles/x.bundle main`. Then clear any stale `.git/*.lock` /
   `tmp_obj_*` files (they need delete permission on the folder) and delete the bundle.
4. Push with the GitKraken plugin. Verify with `git ls-remote` (the SHA must match) and a marker in
   `raw.githubusercontent.com/<owner>/<repo>/<sha>/...`.
5. Refresh the cloud clone's `origin/main` (`git fetch … && git update-ref refs/remotes/origin/main FETCH_HEAD`)
   so nothing shows as unpushed.
6. Never rewrite published history unless the user explicitly says so. For a rewrite, temporarily set
   `remote.origin.push=+refs/heads/main:refs/heads/main`, push, then unset it.

## 8. Report back

Say:
- what's live (with URLs)
- counts per country
- which media are stand-ins, and which entries are swarm-only
- corrections made to the input claims
- advisor warnings that were already there
- what only the user can do: the Pages toggle, the Auth redirect, waking a hibernated project, supplying footage
