---
name: open-media-harvest
description: Harvest sites, species, facts and openly licensed video/photos for a country from open databases (Wikidata, Wikimedia Commons, UNESCO, GBIF, iNaturalist, NASA, Wikipedia, optional Protected Planet) using the ReAfronders criteria, then review and merge into the atlas. Use when asked to find footage/media, add heritage/flora/fauna, or import a ranked list.
---

# Open media harvest (ReAfronders criteria)

The code is `reafrondersbe/tools/harvest/`:

| File | Does |
|---|---|
| `harvest.mjs` | Discovers candidates and finds media. Runs in Node or a browser. |
| `import-triplets.mjs` | Imports rank → landmark/flora/fauna lists, e.g. AI "top 30s". |
| `merge.mjs` | Merges only the reviewed, approved candidates into `data/seed.json`. |

Crate-digging analogy: harvest pulls every record that might fit; review is the DJ deciding what plays.

## Criteria (do not relax without the user's say-so)
1. **Official open APIs only.** Use APIs, not HTML scraping. Send a User-Agent with a contact address and keep requests polite.
2. **Licences.** Allow CC0, public domain, CC BY and CC BY-SA. Exclude NC and ND by default, since exhibitions can be commercial. Never use "All rights reserved", news-agency, stock or YouTube media.
3. **Relevance.** A free-text search hit must name the site or species in its title or description. Media tied to the item (its Commons category, Wikidata P10/P18, a GBIF or iNaturalist occurrence) counts as trusted.
4. **Location truth.** Read each file description before using it. Label stand-ins in `media.note`, e.g. "Stand-in: Mana Pools herd". A clip called "Mphafa waterhole" turned out to be filmed in South Africa.
5. **Facts.** Use two independent sources per claim, and coordinates must agree within 25 km. Hedge contested numbers ("~", "often cited"). Write summaries in your own words and cite the URLs in `citations`.
6. **AI-generated lists are unverified.** Re-check every superlative ("#1", "rarest"). For example, the Cave Squeaker isn't "EDGE #1", and an unconfirmed Ndebele name was dropped.
7. **Morph-ready hosts** (CORS checked): `upload.wikimedia.org`, `thumb.wikimedia.org` and `inaturalist-open-data.s3.amazonaws.com`. Use Commons transcodes `…480p.vp9.webm` as `video` and `…360p.mpeg4.mov` as `fallback`.
8. **When there's no video,** use 2–3 photos in `media.images[]` with url, credit, license and source. The player turns them into a drifting photo loop with the same particle morph.
9. **Nothing publishes automatically.** A human sets `review.approved: true`.

## Run it
- **GitHub (no local setup):** in `reafrondersbe`, go to Actions → "Harvest open data" → Run workflow. Enter the ISO-3, ISO-2, Wikidata QID (Zimbabwe is Q954, Botswana Q963, South Africa Q258, Tanzania Q924) and any extras. It commits `data/candidates/<ISO3>.json`.
- **Node:** `node tools/harvest/harvest.mjs --iso3 ZWE --iso2 ZW --qid Q954 --country Zimbabwe --extra "Great Zimbabwe" --extra "Gloriosa superba" [--only "A,B"] [--max-media 60]`
- **Browser** (when the shell has no network): open any https page in the user's built-in browser, fetch the module from `raw.githubusercontent.com/<owner>/reafrondersbe/<sha>/tools/harvest/harvest.mjs`, import it as a Blob URL, and call `harvest()` in a background promise; poll `window.RES` (the tool times out after 45 s).
  - Hidden tabs throttle timers, so the module skips its pacing in browsers.
  - UNESCO XML is Node-only.
  - Wikidata's public endpoint times out on big UNION queries, so keep the queries split.

## Review → ship
1. Open the candidates file. For each one worth adding:
   - Pick 1 video or 2–3 photos.
   - Read the descriptions to confirm the location.
   - Write the `summary` and `uniqueness`.
   - Set the category: natural types, `heritage`, `flora` or `fauna`.
   - Set the motion: `bloom` for plants, `herd` or `ripple` for animals, `orbit` for heritage.
   - Set `review.approved: true`.
2. Run `node tools/harvest/merge.mjs data/candidates/ZWE.json`, then `node scripts/build-seed.mjs`. Keep `data/seed.json` identical in both repos.
3. Supabase: send the upserts in batches of about 5 rows (avoid `$$`). Then select counts to verify.
4. Test with Playwright: route media hosts to local test files that send `Access-Control-Allow-Origin: *`. Bump the `?v=` cache stamp, push (signed, as Claude), and verify the live site loads the real media.

## Report
List what was added, which items are stand-ins or have no media, which claims were corrected, and the notable candidates left for the user to approve (e.g. Khami #365).
