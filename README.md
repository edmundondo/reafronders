# ReAfronders — a living atlas of Africa's natural wonders

A generative art map in the spirit of Refik Anadol's machine-intelligence work. Thousands of light particles drift in curl-noise currents across the shape of Africa and gather around each natural wonder. Every wonder has its own colour and motion: Victoria Falls *cascades*, Chinhoyi's Sleeping Pool *sinks* in a spiral, the Matobo granite *orbits*, and Mount Nyangani rises as *mist*.

**Starts with Zimbabwe (11 wonders).** Any other African country can be added from the built-in **Studio**.

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

Keys: `T` tour · `E` exhibition (fullscreen auto-tour, made for a projector or LED wall) · `Esc` back.
URL tricks: `?country=ZWE` opens on a country, `?country=` opens on the whole continent, `?local` ignores Supabase.

## Virtual tours (30-second footage loops)

Open any wonder and press **▶ Enter virtual tour**, or link straight to one with `?tour=victoria-falls`. Here's what happens over the loop:

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

**Footage now:** Victoria Falls, Batoka Gorge (stand-in aerial), Mana Pools (Boswell the elephant), and Hwange (stand-in Mana Pools herd). All of it comes from Wikimedia Commons under CC licences, and the credits show on screen. The other seven wonders show "footage coming soon" with a living particle swarm.

**To add or swap footage:** go to **Studio → Edit** on a wonder, then **Virtual tour footage**. Paste a direct `.webm`/`.mp4` URL plus credit, licence, source page and start time, then **▶ Preview tour**. Wikimedia Commons links allow the colour-morph. Other hosts without CORS will just crossfade.

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
js/tour.js          virtual-tour viewer: particle↔footage morph + controls
js/store.js         data layer: Supabase or local browser storage
js/config.js        your Supabase URL + key
data/seed.json      Zimbabwe content (same file as the backend seed)
data/africa.geojson 56 African territories, from Natural Earth via world-atlas (public domain)
```

## Open-source credits

[D3](https://d3js.org) (ISC) · [Natural Earth](https://www.naturalearthdata.com) (public domain) via [world-atlas](https://github.com/topojson/world-atlas) · [supabase-js](https://github.com/supabase/supabase-js) (MIT) · Simplex noise after Stefan Gustavson (public domain) · Fonts: Instrument Serif and Space Grotesk (OFL).

MIT licensed.
