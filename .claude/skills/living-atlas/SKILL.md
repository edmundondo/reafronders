---
name: living-atlas
description: Build or extend a Refik Anadol-style generative "living atlas" — particle-flow map of a region with per-site emitters, footage loops that morph out of the particles, a floating player, a looping kiosk Journey, a Studio editor and a Supabase backend on GitHub Pages. Use to replicate ReAfronders for another country, continent or theme, or to add a country's wonders.
---

# Living Atlas (ReAfronders pattern)

A static site (no build step) plus a Supabase backend. The reference implementation is
`edmundondo/reafronders` (frontend) + `edmundondo/reafrondersbe` (backend). Copy those
when they're available; this file is the recipe for rebuilding or adapting them.

Think of it as a DJ rig: the map is the platter, the particles are the groove, each site is a needle drop,
the Studio is the mixer, and the Journey is a pre-planned set that plays itself.

## 0. Decide the scope (ask once, then build)

- Region and first country (e.g. "Africa", starting with "Zimbabwe").
- Theme of the sites: natural wonders by default, but it could be music venues, mines, markets, and so on.
- Repos: a frontend repo (GitHub Pages) and a backend repo (Supabase migrations and seed).
- Supabase project: check that table names won't clash with what's already there.
  A free-tier project may be **hibernated**, and every query then times out until it's restored in the dashboard.

## 1. Map data (free, public domain)

```bash
npm i world-atlas@2.0.2 topojson-client@3.1.0 topojson-simplify@3.0.3 i18n-iso-countries@7.11.0
```
Filter `countries-50m.json` to the region's ISO-3 codes (map world-atlas numeric ids with
`i18n-iso-countries.numericToAlpha3`), presimplify with `quantile(t, 0.25)`, round coordinates to 3 dp,
and write `data/<region>.geojson`. Africa came out at about 58 KB for 56 territories. Handle unnamed
territories (e.g. Somaliland) by name.

## 2. Content: one JSON is the source of truth

`data/seed.json` holds `{ presentation, countries[], wonders[] }`. Each wonder has:
`slug, country_iso, name, local_name, category, lat, lng, summary, uniqueness, stat_label, stat_value,
unesco, visible, sort_order, art{color,intensity,motion}, media{video,fallback,credit,license,source,start,note}`.

- motions: `cascade | orbit | ripple | sink | zigzag | herd | mist`. Match the site:
  waterfalls cascade, caves sink, rock and granite orbit, wetlands ripple, herds herd, mountains mist.
- Facts: check every figure (heights, areas, UNESCO years) and hedge with "~" or "often cited"
  where sources disagree. Leave out man-made sites from a "natural" list.
- The backend `scripts/build-seed.mjs` turns the JSON into an idempotent `supabase/seed.sql` (upserts on `slug`).

## 3. Backend (Supabase)

Tables are `countries`, `wonders` (with an `art` jsonb and a `media` jsonb), `presentation(id='default', settings jsonb)`
and `editors(user_id → auth.users)`. Use `is_editor()` as a SECURITY DEFINER SQL function.

RLS: the public can read active countries, visible wonders and the presentation; editors can do everything;
nobody can insert themselves into editors.

- Test the schema locally with PGlite (`@electric-sql/pglite`). Stub `auth.users`, `auth.uid()` and
  the anon/authenticated roles, then check four things: anon inserts are refused, signed-in
  non-editors are blocked, editors can write, and the seed can be re-run safely.
- Leave out `create extension pgcrypto`: `gen_random_uuid()` is core in PG13+.
- **Supabase MCP gotcha:** `execute_sql` and `apply_migration` can hang until they time out on
  `$$` dollar-quoted bodies. Write function bodies with single quotes, and send DDL in small batches
  (tables, then functions, then triggers and policies). After any timeout, query the catalogue
  to see what actually landed before retrying.
- Add the first editor by email:
  `insert into editors select id from auth.users where email = '…'`.
- Run `get_advisors(security)` afterwards and report only the findings that come from your own changes.

## 4. Frontend modules (plain ES modules, d3 from cdnjs)

| File | Role |
|---|---|
| `js/art.js` | Simplex curl-noise particle field clipped to a low-res land mask. Wonders are emitters with motion signatures. Exposure adapts to density, so crowded areas never clip to white; one stroke per colour bucket; bloom is a CSS-blurred low-res copy. Modes: flow / pulse (BPM-locked) / constellation. |
| `js/app.js` | d3 Mercator map with projection tweens (`flyTo(target, animate, {dur, ext, maxZoom})`), label collision nudging, story panel, Studio (wonders / presentation / data), Journey engine. |
| `js/tour.js` | Floating loop player, described below. |
| `js/store.js` | Same API for `supabase` and `local` modes (localStorage + JSON export/import). Writes require the editor role. |
| `js/config.js` | Supabase URL + anon key. These are safe to publish because RLS guards writes. |

**Floating player:** the card is about 36% of the screen width (260–620 px; full width on phones).
For each frame it scores 8 candidate positions around the pin: never cover the pin, avoid open panels,
stay inside the viewport. It eases toward the best one and draws a dashed leader line from the pin to the
card edge. ⤢ expands it to full screen.

**Morph:** particles burst from the pin, sample the video frame (with the same cover crop the video uses),
adopt its colours, and flow tangent to the luminance edges. The video fades in through a blur.
Near the end of the loop it dissolves back into particles. Controls: Veil, Blend, Loop length.

**Journey (kiosk):** eight movements:
1. A→Z (category, then name)
2. East→West (longitude descending)
3. South→North (latitude ascending)
4. Spiral outward: key = clockwise angle from north + 2·(r/rmax) around the centroid of the sites
5. Movements 4→1 again, each order reversed

Each movement opens with a title card. Between stops, a comet emitter travels a quadratic-Bézier
route (spiral routes bend away from the centroid; other routes alternate sides) and leaves fading
route lines. On arrival the camera zooms close (via `closeExtent`, which leaves room for the card),
the player shows with `{journey:{dwell, onDone}}`, then `dismiss()` shrinks it back into the pin.
URL: `?journey=<category|all>&dwell=<s>`; `?tour=<slug>`; `?country=<ISO3>`; `?local`.

**Cache-busting:** keep `?v=<stamp>` on the CSS, the app entry and every relative import, and bump it
on each release. Otherwise browsers keep running old modules after a Pages deploy.

## 5. Footage (free, licensed, CORS-friendly)

The morph needs pixel access, so the footage host must send CORS headers. **Wikimedia Commons works**
with `crossOrigin="anonymous"`.

- Search from a page on commons.wikimedia.org, because direct fetches from tools are often blocked:
  `api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=<q> filemime:video&prop=imageinfo|videoinfo&viprop=derivatives&iiprop=url|extmetadata&origin=*`.
- Use the `…480p.vp9.webm` derivative as `video` and `…360p.mpeg4.mov` as `fallback` (for Safari).
- Read each file's description to confirm it really shows that place. A clip titled "Mphafa
  waterhole" turned out to be filmed in South Africa, not Zimbabwe.
- Mark stand-ins in `media.note`, and always fill `credit`, `license` and `source` (CC BY / BY-SA require attribution).
- Verify sampling: draw a frame to a canvas and call `getImageData`; a non-tainted average colour means the morph works.

## 6. Test

Use Playwright (Chromium is preinstalled; don't download browsers). Route `cdnjs d3` to the local
`node_modules/d3/dist/d3.min.js`, abort font requests, and route `upload.wikimedia.org` to a local
`ffmpeg -f lavfi -i testsrc2` VP9 clip with `Access-Control-Allow-Origin: *`.

Screenshot these at 1440×900 and 390×844: continent view, country view, wonder panel, floating player,
expanded player, a journey title card, a journey stay, a journey travel, and Studio.
Check that the only console errors are the deliberately aborted fonts.

## 7. Ship

- When the session's git proxy refuses pushes but the user's Mac is linked with GitKraken, follow
  `device-bridge-git-push`: copy the files into the connected clone, commit only those paths,
  clear stale `.git/*.lock` files (after getting delete permission), push with the GitKraken
  plugin, then verify with `git ls-remote` plus a content marker in raw.githubusercontent.com.
- GitHub Pages: deploy from a branch → `main` / root.
- Supabase Auth → URL Configuration → add the Pages URL as a redirect, so magic-link sign-in comes back to the site.
- Never commit a service-role key; only the anon or publishable key goes in `config.js`.

## 8. Report back

Say what's live (with URLs), which footage is a stand-in, which advisor warnings were
already there, and what only the user can do (Pages toggle, Auth redirect, waking a hibernated project).
