# ReAfronders — a living atlas of Africa's natural wonders

A generative art map in the spirit of Refik Anadol's machine-intelligence work. Thousands of light particles drift in curl-noise currents across the shape of Africa and gather around each natural wonder. Every wonder has its own colour and motion: Victoria Falls *cascades*, Chinhoyi's Sleeping Pool *sinks* in a spiral, the Matobo granite *orbits*, and Mount Nyangani rises as *mist*.

**7 countries, 85 entries.** Zimbabwe (15), Botswana (10), South Africa (19), Namibia (11), Malawi (10), Zambia (11) and Mozambique (9). Each country has its top natural wonders, every UNESCO World Heritage site, a signature plant and a signature animal, with a colour palette taken from its land. Any other African country can be added from the built-in **Studio**.

Backend (Supabase): **[reafrondersbe](https://github.com/edmundondo/reafrondersbe)**

## How it works, in DJ terms

| Control | What it does | DJ analogy |
|---|---|---|
| **Mode: Flow** | Particles ride a curl-noise field shaped by the land | The groove |
| **Mode: Pulse** | Every wonder kicks light outward on the beat | Sidechain to the kick |
| **Mode: Constellation** | Light travels wonder-to-wonder along threads | A transition between tracks |
| Flow speed | How fast the field moves | Pitch fader |
| Trail length | How long strokes linger | Reverb tail |
| Glow | Bloom / halo strength | Master gain |
| Vortex pull | How hard orbit and sink motions swirl | Filter resonance |
| Pulse BPM | Tempo of Pulse mode (default 112) | The BPM counter |

## Studio: add, remove, restyle

Press **Studio** (or `S`):
- **Wonders:** tick to show or hide, **Edit**, or ✕ to remove (tap twice to confirm). **+ Add wonder** opens a form where **⌖ Pick on map** places it with a click. Colour, motion and intensity preview live.
- **Country presentation:** tagline, region, a 5-swatch colour story, and whether the country appears publicly.
- **Presentation:** mode, palette, particles, speed, trail, glow, vortex, BPM, borders, labels, opening view. Changes are live, and **Save as default** stores them.
- **Data:** editor sign-in (magic link), Export or Import JSON, reset.

Where edits are saved:
- **No Supabase configured:** in your browser. Export JSON to share them.
- **Supabase configured and you're an editor:** in the database, live for every visitor.
- **Supabase configured, not an editor:** a preview only.

Keys: `J` journey · `E` exhibit (fullscreen journey for a projector or LED wall) · `Esc` back.
URL tricks: `?country=ZWE` opens on a country, `?country=` opens on the whole continent, `?local` ignores Supabase.

## Virtual tours (30-second footage loops)

Open any wonder and press **▶ Enter virtual tour**, or link straight to one with `?tour=victoria-falls`. The player is a **floating card** that sits beside the wonder's pin, connected to it by a dashed leader line. It sizes itself to the screen (about a third of the width, 260–620 px; full width on phones), picks whichever side of the pin has room, and follows the pin while the map moves. Press **⤢** (X) to expand it to full screen, or **⛶** (F) for true fullscreen. Here's what happens over the loop:

1. **Bloom (0–1.4 s):** the wonder's particles burst out from its point on the map.
2. **Learn (to ~4 s):** each particle samples the colour under it in the footage and flows along the image's edges, like brush strokes painting the scene.
3. **Resolve:** the real footage sharpens up out of the swarm.
4. **Dissolve:** near the end of the loop it melts back into particles, then the cycle restarts.

| Control | What it does | DJ analogy |
|---|---|---|
| ⏮ ⏭ | Previous / next wonder | Load the next deck |
| ❚❚ / ▶ (Space) | Pause / play | Cue |
| 🔇 / 🔊 (M) | Sound | Channel mute |
| ⟲ Morph (R) | Replay the particles-to-footage morph | Spin-back |
| Veil | How much particle "veil" stays over the footage | Wet/dry |
| Blend | Length of the morph, 1–8 s | Crossfader curve |
| Loop | 15 / 30 / 45 / 60 s | Loop length |
| ⛶ (F) | Fullscreen, for projection | Lights down |

**Media now:**
- **Video:** Victoria Falls, Batoka Gorge (stand-in aerial), Mana Pools (Boswell the elephant), and Hwange (stand-in Mana Pools herd).
- **Photo loops** for nine more: 2–3 openly licensed photos each, with a slow drift and crossfade, morphing in and out of the particles like footage.
- **Swarm only:** the Chimanimani Mountains and the Cave Squeaker, which have no open media yet.

Every photo and clip credit shows on screen.

**To add or swap footage:** go to **Studio → Edit** on a wonder, then **Virtual tour footage**. Paste a direct `.webm`/`.mp4` URL plus credit, licence, source page and start time, then **▶ Preview tour**. Wikimedia Commons links allow the colour-morph. Other hosts without CORS will just crossfade.

## Journey: a non-interactive display

Press **Journey** (`J`), or **Exhibit** (`E`) for fullscreen. You can also link straight to it, e.g. `?journey=all&dwell=12` or `?journey=waterfall&dwell=20`, and leave it running on a screen, projector or LED wall.

The camera flies from site to site. A comet of light travels a curved route between them and leaves a fading trail. At each stop, the loop player floats up beside the pin, plays the particle-to-footage morph, then shrinks back into the pin. The set has eight movements and then loops forever:

| # | Movement | Order |
|---|---|---|
| I | A → Z | by category, then name (only the chosen category, if one is set) |
| II | East → West | longitude, descending: following the sun |
| III | South → North | latitude, ascending |
| IV | Spiral outward | clockwise from north, spiralling out from the centre of the sites |
| V–VIII | The same four in reverse | Spiral inward → North→South → West→East → Z→A |

Each movement opens with a title card ("Movement II · East → West"). Set the category and the seconds per site in **Studio → Presentation → Journey**. Sites without footage get half the time. To stop, move the mouse and click **■ Stop journey**, or press `Esc`.

## Host it on GitHub Pages (free)

1. Push this repo.
2. **Settings → Pages → Deploy from a branch → `main` / root**.
3. It goes live at `https://edmundondo.github.io/reafronders/`.

There's no build step: plain HTML, CSS and ES modules. To run it locally: `python3 -m http.server` in this folder, then open http://localhost:8000.

## Connect Supabase

Follow the backend README, then paste your Project URL and publishable/anon key into `js/config.js`. Those keys are safe to publish because Row Level Security decides who can write.

## Files

```
index.html          page shell
css/style.css       smoked-glass UI over the artwork
js/art.js           the generative engine (simplex curl noise, emitters, bloom)
js/app.js           map, story panel, tour, Studio editor
js/tour.js          floating loop player: particle↔footage morph, pin-anchored, controls
js/store.js         data layer: Supabase or local browser storage
js/config.js        your Supabase URL + key
data/seed.json      All country content (same file as the backend seed)
data/africa.geojson 56 African territories, from Natural Earth via world-atlas (public domain)
```

## Replicate it

- **Skill:** `.claude/skills/living-atlas/SKILL.md` is the complete recipe: map data, schema and RLS, the art engine, the floating player, Journey, the footage rules, testing and shipping.
- **Skill:** `.claude/skills/open-media-harvest/SKILL.md` covers the open-data rules: licences, relevance, location truth, two sources, and review before merge.
- **Agent:** `.claude/agents/media-harvester.md` finds and verifies footage, photos and facts using the harvester in `reafrondersbe/tools/harvest` (Wikidata, Commons, UNESCO, GBIF, iNaturalist, NASA).
- **Agent:** `.claude/agents/atlas-replicator.md` extends the atlas or clones it to a new country, region or theme. It researches verified sites, sources CC footage, writes the seed, tests and ships. Try asking Claude Code in this repo to "use the atlas-replicator agent to add Botswana".

## Open-source credits

[D3](https://d3js.org) (ISC) · [Natural Earth](https://www.naturalearthdata.com) (public domain) via [world-atlas](https://github.com/topojson/world-atlas) · [supabase-js](https://github.com/supabase/supabase-js) (MIT) · Simplex noise after Stefan Gustavson (public domain) · Fonts: Instrument Serif and Space Grotesk (OFL).

MIT licensed.
