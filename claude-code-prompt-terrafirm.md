# CLAUDE CODE PROMPT — copy everything below this line

Build a production-grade web app called **TERRAFIRM** — a global business atlas. It renders a dark 3D globe that seamlessly becomes a real street map as you zoom in, shows every business in the visible area with its logo and name, shades regions by business density with unique colors, and opens a detail panel when a business is clicked. All data sources must be free, live, and require no paid API keys.

## Tech stack (use exactly this)

- **Vite + React + TypeScript**
- **MapLibre GL JS v5** with `projection: 'globe'` — this gives a true 3D globe at low zoom that automatically flattens into a normal pan/zoom street map as you zoom in. Do NOT use three.js, Google Maps, or Mapbox (needs a token).
- Basemap tiles: **OpenFreeMap** (`https://tiles.openfreemap.org/styles/dark` style URL — free, keyless, production-allowed). Customize the style after load: near-black water (#05090F), dark land, muted labels, amber/cyan accent colors.
- **supercluster** for client-side clustering of business points.
- **h3-js** for hexagonal region shading.
- State: zustand. Styling: plain CSS or Tailwind, dark theme only.

## Data layers (all free, all live)

### Layer 1 — Major companies (zoom 0–8, "ORBIT/REGIONAL" view)
- Query **Wikidata SPARQL** (`https://query.wikidata.org/sparql`, free, CORS-enabled) at app startup for companies with: headquarters coordinates (P159 → P625), official website (P856), industry (P452), employees (P1128), inception (P571), logo image (P154). Fetch the top ~2,000 by sitelink count or revenue. Cache the result in IndexedDB with a 24h TTL so startup is instant on revisit.
- These render as logo markers at low zoom, sized by prominence; only the biggest are visible fully zoomed out, more appear as you zoom (use a rank threshold tied to zoom level).

### Layer 2 — Every local business (zoom ≥ 13, "STREET" view)
- Fetch the visible viewport's businesses from the **Overpass API** (`https://overpass-api.de/api/interpreter`, fallback mirror `https://overpass.kumi.systems/api/interpreter`).
- Query nodes/ways with a `name` plus any of: `shop=*`, `amenity` (cafe, restaurant, bar, fast_food, bank, pharmacy, cinema, hotel, fuel, clinic, etc.), `office=*`, `craft=*`, `tourism` (hotel, museum, gallery).
- Viewport-driven fetching rules (be a good citizen — Overpass is shared infrastructure):
  - Only fetch when zoom ≥ 13 and the map has been idle for 600 ms (`moveend` + debounce).
  - Tile the world into fetch cells (e.g., z13 slippy tiles); fetch only uncached cells intersecting the viewport; cache cells in IndexedDB with a TTL (configurable, default 15 minutes — this is the "refresh period").
  - Cap each query (`out body 400;`), set `[timeout:20]`, abort in-flight requests when the viewport changes, exponential backoff on 429/504.
- A visible **LIVE** indicator in the status bar shows: scanning (amber pulse) / live, N businesses, last refresh time (cyan) / unreachable (gray). A manual refresh button force-expires the current cells.

### Logos
- For any business/company with a website: `https://www.google.com/s2/favicons?domain={domain}&sz=64` (keyless). For Wikidata companies prefer their P154 logo image via Wikimedia Commons thumb URL.
- Fallback: a generated monogram avatar (initials on a dark circle) — never a broken image.
- Render markers as HTML markers (MapLibre `Marker`) or a symbol layer with dynamically loaded images; lazy-load logos only for on-screen markers; LRU-cache loaded images.

### Geocoding search
- Search bar queries **Nominatim** (`https://nominatim.openstreetmap.org/search`, debounced ≥ 1 req/sec, proper `User-Agent`/`Referer`) for places AND filters the loaded company list by name. Selecting a place flies the camera there; selecting a company flies to it and opens its panel.

## Region shading (unique color per area)

- At zoom 9–13, aggregate fetched business points into **H3 hexagons** (resolution scaled to zoom, e.g., res 6–8). Render them as a translucent fill layer where:
  - **Color hue is deterministic per hex cell ID** (hash the H3 index → hue), so every area has its own unique color, and
  - **Opacity encodes business density** (more businesses = stronger shading).
- At zoom < 9, swap to country-level shading: fetch a world countries GeoJSON once (e.g., from a CDN like Natural Earth on GitHub raw), color each country with a deterministic unique hue at low opacity.
- Shading layers sit under the marker layers and fade in/out smoothly between zoom tiers.

## UI requirements

- Full-bleed map. Top bar: wordmark + search input with results dropdown. Bottom status bar (monospace): live indicator, current view tier (ORBIT / REGIONAL / STREET), entity count, center coordinates, last-sync time. Right-side vertical "altitude" rail showing the three tiers, lighting up as you zoom.
- **Detail panel** (slides in from the right, 400px, mobile = full width) on marker click:
  - Live OSM business: logo/monogram, name, category, full address, opening hours, phone, website link, cuisine, coordinates, "Source: OpenStreetMap" attribution, and an "Open in OSM" link (`https://www.openstreetmap.org/node/{id}`).
  - Wikidata company: logo, name, industry, HQ, founded, employees, website, "Source: Wikidata" link.
  - Clicking a marker also eases the camera to it.
- Clusters render as a count bubble; clicking a cluster zooms into it.
- Loading skeletons, error toasts (e.g., "Overpass busy — retrying in 8s"), and an attribution line: "© OpenStreetMap contributors · Wikidata" (legally required for OSM).
- Keyboard accessible, `prefers-reduced-motion` respected, works on mobile (touch pan/pinch).

## Architecture & quality

- Clean module split: `src/map/` (style, layers, camera), `src/data/overpass.ts`, `src/data/wikidata.ts`, `src/data/logos.ts`, `src/data/cache.ts` (IndexedDB w/ TTL), `src/state/`, `src/ui/` (Panel, SearchBar, StatusBar, AltitudeRail).
- All fetchers typed, with AbortController support, retries, and unit-testable pure transform functions (Overpass JSON → Business[], Wikidata bindings → Company[]).
- Config file for tunables: refresh TTL, zoom thresholds, max markers, Overpass endpoints.
- README with: how it works, data source etiquette/rate limits, how to swap in heavier sources later (note: **Overture Maps Foundation's Places dataset** — 60M+ free business POIs downloadable as GeoParquet/PMTiles — is the upgrade path for full offline-scale coverage without hammering Overpass; design the Business type so an Overture adapter can slot in).
- `npm run dev` must work immediately; include a `npm run build` that produces a static deployable bundle (Netlify/Vercel/GitHub Pages ready).

## Acceptance checklist (verify each before finishing)

1. Page loads to a rotating dark globe with major-company logo markers, no console errors.
2. Zooming into any city on Earth (test: Mumbai, Tokyo, a random small town) fetches and displays real nearby businesses with logos/monograms + names within a few seconds.
3. Regions show unique-colored shading whose intensity tracks business density; country tint visible when zoomed out.
4. Clicking any marker opens the panel with real data and a working website link when available.
5. Search "Vadodara" flies there; search "Nestlé" finds the company.
6. Status bar live indicator + last-sync timer update correctly; manual refresh re-fetches.
7. Panning quickly doesn't spam Overpass (network tab shows debounced, cached, aborted requests).
8. Mobile layout usable; OSM attribution visible.

Build it completely — don't stub the data layer with mock data.