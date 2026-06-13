<div align="center">

# 🌍 TERRAFIRM

### The global business atlas — a live, keyless map of the world's companies

A dark, full-bleed 3D globe that becomes a street map as you zoom in, rendering the world's businesses on top of live, free, keyless data.

[**🚀 Live Demo**](https://terra-firm-rouge.vercel.app) · [Report a Bug](https://github.com/ronak-create/TerraFirm/issues/new?template=bug_report.md) · [Request a Feature](https://github.com/ronak-create/TerraFirm/issues/new?template=feature_request.md)

![License](https://img.shields.io/github/license/ronak-create/TerraFirm?color=blue)
![Stars](https://img.shields.io/github/stars/ronak-create/TerraFirm?style=social)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![MapLibre](https://img.shields.io/badge/MapLibre%20GL-v5-396CB2?logo=maplibre&logoColor=white)

</div>


A dark, full-bleed **3D globe that becomes a street map** as you zoom in, rendering
the world's businesses on top of live, free, keyless data. Spin the globe to see
major companies; dive into any city to see real local businesses with logos and
names; watch regions shade themselves by business density.

> Every data source is free, live, and requires **no API key or token**.

---

## Quick start

```bash
npm install
npm run dev      # → http://localhost:5173
```

```bash
npm run build    # static bundle in dist/  (Netlify / Vercel / GitHub Pages ready)
npm run preview  # serve the production build locally
npm run test     # unit tests for the pure data transforms
npm run smoke    # live check that Wikidata + Overpass are reachable
```

No `.env`, no tokens, nothing to sign up for.

---

## Deploy

TERRAFIRM is a **static SPA** — `npm run build` emits a `dist/` folder of plain
files that any static host or CDN serves. There's no server, no database, nothing
to keep running, so it scales to as many visitors as your CDN handles (see
[Scaling](#scaling-many-visitors-at-once) below).

| Host | How |
| --- | --- |
| **Vercel** | Import the repo — `vercel.json` sets the build, SPA routing, and cache headers. Or `npx vercel --prod`. |
| **Netlify** | Import the repo — `netlify.toml` does the same. Or `npx netlify deploy --prod`. |
| **Cloudflare Pages** | Build command `npm run build`, output dir `dist`. `public/_redirects` handles SPA routing. |
| **GitHub Pages** | `npm run build` then publish `dist/`. For a **project** page (`user.github.io/repo`), set `base: '/repo/'` in `vite.config.ts` first. |

The included configs set two things every host needs for an SPA:

- **SPA fallback** — every route serves `index.html` (the app is client-routed).
- **Cache headers** — hashed `assets/*` are immutable (cached a year);
  `companies.seed.json` is `stale-while-revalidate` so revisits are instant.

### Social share image

`public/og.png` (the link-preview card) is generated from `scripts/og.svg`:

```bash
npm run og        # re-render public/og.png after editing scripts/og.svg
```

When you point a real domain at the deploy, set the absolute `og:url` / `og:image`
and `canonical` URLs in `index.html` (there's a commented block showing exactly which).

### Scaling (many visitors at once)

Because the app is static, **the site itself never "hangs" under load** — the CDN
serves the same cached files to everyone. The only shared resources are the public
data APIs, and those are hit **directly from each visitor's browser (their own IP)**,
not from one server, so there's no single bottleneck that 100 simultaneous users
could overwhelm:

- **Companies** come from the bundled `companies.seed.json` snapshot — **zero API
  calls** on load, so the company layer is instant no matter how busy Wikidata is.
- **Street businesses** come from Overpass, which rate-limits per IP. The app fails
  over across **four mirrors**, backs off with jitter on `429/504`, caches every
  cell for 15 min, and only fetches at zoom ≥ 13 — so an individual user degrades
  gracefully rather than the site going down.

For storefront-scale coverage **without depending on Overpass at all**, host the
[Overture Places](#upgrade-path--heavier-data-without-hammering-overpass) PMTiles
file as a static asset on your own CDN (details below) — that removes the last
shared third-party dependency entirely.

---

## How it works

TERRAFIRM renders three **altitude tiers**, driven entirely by the map's zoom:

| Tier | Zoom | What you see | Data source |
| --- | --- | --- | --- |
| **ORBIT** | 0–8 | Rotating globe, country tint, the world's biggest companies as logo markers (more appear as you zoom) | Wikidata + Natural Earth |
| **REGIONAL** | 9–12 | H3 hexagon shading — a **unique colour per area**, opacity scaled to business density | H3 over accumulated points |
| **STREET** | ≥13 | Every named local business, clustered, with logo/monogram + name | Overpass (live OSM) |

- **Basemap**: [OpenFreeMap](https://openfreemap.org) `dark` style, recoloured after
  load to near-black water (`#05090F`) with amber/cyan accents.
- **Globe → map**: MapLibre GL JS v5 with `projection: globe`. The globe flattens
  into a normal pan/zoom street map automatically as you zoom in.
- **Markers**: HTML markers, only created for what's on screen. Logos lazy-load and
  fall back to a generated monogram so an image is **never** broken. Businesses are
  clustered client-side with [supercluster](https://github.com/mapbox/supercluster);
  cluster bubbles zoom in on click.
- **Region colour**: hue is a deterministic hash of the H3 cell id (every area gets
  its own colour); opacity encodes density. Below zoom 9 it swaps to a per-country tint.

### Live status

The bottom status bar shows a **LIVE** indicator:

- `scanning` (amber pulse) — fetching the visible cells from Overpass
- `live` (cyan) — current viewport is cached/fresh, with the last sync time
- `unreachable` (red dot) — Overpass is busy; the app backs off and retries
- The **⟳ refresh** button force-expires the visible cells and re-fetches.

---

## Data sources & etiquette

Overpass and Nominatim are **shared community infrastructure**. TERRAFIRM is built
to be a good citizen:

- **Overpass** is only queried at **STREET zoom (≥ 13)** — small z13 cells that return
  fast — after the map has been **idle 600 ms** (`moveend` + debounce). Big regional
  queries are deliberately *avoided*: over a shared mirror they queue for 30–60s and
  `504`, so the **REGIONAL density hexes are fed from the bundled company HQs +
  accumulated street businesses instead** (zero network, never empty). Only **uncached**
  cells are fetched, each cached in **IndexedDB** with a **15-minute TTL**. Queries are
  capped (`out center 400`, `[timeout:20]`), in-flight requests are **aborted** on view
  change, and the client **backs off with jitter** on `429/504` and **fails over** across
  **four mirror endpoints** (started at random so visitors don't all hit the same one).
- **Global business search** — typing any business name queries **Nominatim**, which
  indexes every *named* POI and address in OSM worldwide. A POI hit becomes a real
  marker + detail panel (website, phone, hours, address pulled from OSM `extratags`),
  so the tiniest shop is locatable by name even if it isn't in the current viewport.
- **Wikidata** is queried once on startup (top ~2,000 companies by sitelink count) and
  cached in IndexedDB for **24 h**, so revisits start instantly. The SPARQL ranks
  companies in a cheap bounded subquery before hydrating details, keeping it under the
  WDQS 60 s budget.
- **Nominatim** searches are debounced to **≤ 1 req/sec** with an identifying `email`
  param, per its usage policy.

All caching lives in `src/data/cache.ts` (a tiny dependency-free IndexedDB k/v store
with TTL and an in-memory fast path; it degrades to memory-only in private mode).

Legally required attribution (`© OpenStreetMap contributors · Wikidata`) is always
visible in the footer.

---

## Project layout

```
src/
  config.ts            all tunables: TTLs, zoom thresholds, marker budgets, endpoints
  types.ts             Entity / Company / Business — source-agnostic shapes
  data/
    cache.ts           IndexedDB k/v store with TTL
    wikidata.ts        SPARQL query + bindings → Company[]  (pure transform)
    overpass.ts        slippy-tile maths + query + JSON → Business[]  (pure transform)
    nominatim.ts       geocoding search
    countries.ts       world borders + deterministic per-country hue
    logos.ts           favicon / Commons / monogram resolution + LRU
    transforms.test.ts unit tests for the pure transforms
  map/
    MapView.tsx        orchestrates the map, fetching, clustering, rendering
    style.ts           dark-theme recolouring of the OpenFreeMap style
    layers.ts          country + H3 shading sources/layers
    h3.ts              businesses → H3 hex GeoJSON (colour + density)
    markers.ts         diffing HTML-marker manager (logos, monograms, clusters)
    cluster.ts         supercluster wrapper for businesses
    camera.ts          globe auto-spin + fly-to (respects reduced-motion)
    mapBus.ts          lets search/panel drive the camera
  state/store.ts       zustand store
  ui/                  SearchBar · StatusBar · AltitudeRail · Panel · Toasts
```

The fetchers are typed, support `AbortController`, retry/back off, and keep their
JSON→domain transforms as **pure, unit-testable functions**.

---

## Upgrade path — heavier data without hammering Overpass

The `Business` type is deliberately **source-agnostic**, so a new adapter can populate
it identically to the Overpass one. The intended upgrade is the
[**Overture Maps Foundation Places**](https://overturemaps.org/) dataset — **60M+ free
business POIs**, downloadable as GeoParquet / PMTiles — for full offline-scale coverage:

1. Convert Overture Places to **PMTiles** and host the file (static, no server).
2. Add it as a MapLibre vector source and read features from the visible tiles.
3. Map each feature to `Business` in a new `src/data/overture.ts` adapter — the rest
   of the app (clustering, panel, markers, H3 shading) is unchanged.

Other drop-in sources that fit the same `Business`/`Company` shape:

- **People Data Labs Free Company Dataset** (~22M companies: name, domain, industry,
  size, locality) — great for a richer company baseline; import into Postgres/Supabase
  and expose a bbox endpoint. Note it's company/locality-level, not per-storefront
  lat/lng, so it complements (not replaces) the OSM/Overture POI layer.
- **Public registries** — UK Companies House, US Data.gov / city open-data portals,
  Australia ABR — for authoritative legal company data per country.

---

## Accessibility & mobile

- Keyboard accessible (search has full arrow/enter/escape navigation; markers and
  controls are focusable buttons).
- `prefers-reduced-motion` is respected — the globe doesn't auto-spin and fly-tos are
  instant.
- Responsive: the panel goes full-width and the altitude rail hides on small screens;
  touch pan/pinch work out of the box.

---

## Attribution

- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
- Company data from [Wikidata](https://www.wikidata.org) (CC0)
- Base tiles by [OpenFreeMap](https://openfreemap.org)
- Country borders from [Natural Earth](https://www.naturalearthdata.com/)


---

## Contributing

Contributions are welcome and appreciated! Whether it is a bug fix, a new data source, or a documentation improvement, please read the [Contributing Guide](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) before you start.

Good places to begin:

- Browse the [open issues](https://github.com/ronak-create/TerraFirm/issues), especially those labelled `good first issue` and `help wanted`.
- Open an [issue](https://github.com/ronak-create/TerraFirm/issues/new/choose) to report a bug or propose a feature.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of notable changes to the project.

## License

Distributed under the MIT License. See [LICENSE.md](LICENSE.md) for more information.

## Acknowledgements

- [OpenStreetMap](https://www.openstreetmap.org) contributors for the map data.
- [Wikidata](https://www.wikidata.org) for the company data.
- [OpenFreeMap](https://openfreemap.org) for the base tiles.
- [Natural Earth](https://www.naturalearthdata.com) for country borders.
- [MapLibre GL JS](https://maplibre.org), [H3](https://h3geo.org), and [supercluster](https://github.com/mapbox/supercluster) for the rendering stack.
