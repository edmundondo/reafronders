---
name: open-media-harvest
description: Harvest sites, species, facts and openly licensed video/photos for one or many countries from open databases (Wikidata, Wikimedia Commons, UNESCO, GBIF, iNaturalist, NASA, Wikipedia, optional Protected Planet) using the ReAfronders criteria, then review and merge into the atlas. Use when asked to find footage/media, add countries, heritage, flora or fauna, or import a ranked list.
---

# Open media harvest (ReAfronders criteria) — v2

The code is `reafrondersbe/tools/harvest/`:

| File | Does |
|---|---|
| `harvest.mjs` | Discovers candidates and finds media. Runs in Node or a browser. |
| `countries.json` | ISO codes and Wikidata items for batch runs. |
| `import-triplets.mjs` | Imports rank → landmark/flora/fauna lists. |
| `merge.mjs` | Merges approved candidates only. |

Companion skill: **living-atlas** (data model, player, shipping).
Crate-digging analogy: harvest pulls every record that might fit; review is the DJ deciding what plays.

## Criteria (do not relax without the user's say-so)
1. **Official open APIs only.** Use APIs, not HTML scraping. Send a User-Agent with a contact address and keep requests polite.
2. **Licences.** Allow CC0, public domain, CC BY and CC BY-SA. Exclude NC and ND by default, since exhibitions can be commercial. Never use "All rights reserved", news-agency, stock or YouTube media.
3. **Relevance.**
   - A free-text hit must name the site or species as a **whole word**. "Khami" must not match "Khamis"; the scorer uses Unicode word boundaries.
   - Trusted media is tied to the item: its Commons category, Wikidata P10/P18, or a GBIF or iNaturalist occurrence.
   - Commons categories are often empty or wrongly named. Fall back to a search, then filter by description.
4. **Location truth.**
   - Read each description before using a file. "Mphafa waterhole" turned out to be in South Africa, and "Tucker's Falls, Chimanimani" is on the Mozambique side.
   - Drop maps, logos, office buildings, hotels, bus stations and banknotes, unless the banknote *is* the story (e.g. the Epworth rocks).
   - Label stand-ins in `media.note`.
5. **Facts.**
   - Use two independent sources per claim. For a World Heritage site, the UNESCO page (`whc.unesco.org/en/list/<id>/`) is one.
   - Coordinates must agree within 25 km.
   - Hedge contested numbers ("~", "often cited").
   - Write summaries in your own words and put the URLs in `citations`.
6. **AI-generated lists are unverified.** Re-check every superlative and every local name. The Cave Squeaker isn't "EDGE #1", and an unconfirmed Ndebele name was dropped.
7. **Morph-ready hosts** (CORS checked):
   - `upload.wikimedia.org`. Normalise `thumb.wikimedia.org/...` to `upload.wikimedia.org/wikipedia/commons/thumb/...` with `normaliseCommonsUrl`.
   - `inaturalist-open-data.s3.amazonaws.com`.
   - For Commons videos, use the `…480p.vp9.webm` derivative as `video` and `…360p.mpeg4.mov` as `fallback`.
8. **When there's no video,** use 2–3 photos in `media.images[]` with url, credit, license and source, for the photo loop. If there's no open media at all, keep the swarm only and say so in `media.note`.
9. **Nothing publishes automatically.** A human approves, or the user approves the batch in chat.

## Country mix (default)
Per country:
- 6–10 top natural wonders, ranked by Wikidata notability (sitelinks), UNESCO status and fame.
- Every UNESCO World Heritage site.
- 1 signature plant: national flower or tree, or an iconic endemic.
- 1 signature animal: national animal, or an iconic or endangered endemic.

Write a 5-swatch palette from the land, and a one-line tagline. Add **shared sites** once (under the country already on the map) and mention the neighbour.

## Run it
- **GitHub (no local setup):** in `reafrondersbe`, go to Actions → "Harvest open data" → Run workflow.
  - Set **countries** to e.g. `BWA,ZAF,MWI,ZMB,NAM,MOZ` for a batch, or fill in the single-country fields.
  - It commits `data/candidates/<ISO3>.json` for each country.
- **Node:**
  - Batch: `node tools/harvest/harvest.mjs --countries BWA,ZAF`
  - Single: `--iso3 ZWE --iso2 ZW --qid Q954 --country Zimbabwe --extra "Great Zimbabwe" --extra "Gloriosa superba" [--only "A,B"] [--max-media 60]`
- **Browser** (when the shell has no network): use the user's built-in browser on any https page (e.g. the GitHub Pages site).
  1. `fetch` the module from `raw.githubusercontent.com/<owner>/reafrondersbe/<sha>/tools/harvest/harvest.mjs`.
  2. `import()` it as a Blob URL.
  3. Start the work in a background promise that stores results on `window`, then poll in later calls (each call times out after 45 s).
  - Hidden tabs throttle timers, so the module skips its pacing in browsers.
  - Only Wikimedia hosts get the `Api-User-Agent` header (GBIF and iNaturalist reject it).
  - UNESCO XML is Node-only, so in a browser cross-check UNESCO via Wikidata P757 and the `whc.unesco.org/en/list/<id>/` page.
  - Wikidata times out on big UNIONs, so keep the queries split.
  - Return results in chunks under about 20 KB.

## Review → ship
1. For each chosen item:
   - Confirm the facts from 2 sources.
   - Pick 1 video or 2–3 photos, after reading the descriptions.
   - Write the `summary` and `uniqueness`.
   - Set the category and motion: `bloom` for flora; `herd`/`ripple` for fauna; `orbit` for heritage; `cascade` for waterfalls; `sink` for caves; `mist` for mountains; `ripple` for wetlands, lakes and coasts.
   - Add `citations`.
2. Add the **country row first** (foreign key). Then either merge (`merge.mjs` on approved candidates) or edit both `data/seed.json` copies identically. Run `node scripts/build-seed.mjs`.
3. Supabase: send upserts **one country (about 10 KB) per call**, with no `$$`. Verify counts per country.
4. Test with Playwright (route the media hosts to local CORS test files), bump the `?v=` stamp, and ship (signed, as Claude) via the living-atlas bundle → GitKraken route. Then load the live site to confirm the real media.

## Report
List per country:
- what was added
- the media source for each entry (video, photos or swarm-only), plus stand-ins
- claims corrected
- notable candidates left for the user to approve
