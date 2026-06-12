// Central tunables for TERRAFIRM. Tweak these to change refresh cadence,
// zoom thresholds, marker budgets, and data endpoints.

export const CONFIG = {
  // --- Endpoints (all free, keyless) ---
  basemapStyle: 'https://tiles.openfreemap.org/styles/dark',
  wikidataEndpoint: 'https://query.wikidata.org/sparql',
  nominatimEndpoint: 'https://nominatim.openstreetmap.org/search',
  // Multiple public mirrors — the client fails over and sticks to whichever
  // answers, so one mirror being rate-limited (429) doesn't break the app.
  // Higher-capacity / more lenient mirrors first; the main overpass-api.de endpoint
  // is the most hammered (429/504 under load), so it's no longer tried first.
  overpassEndpoints: [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.osm.ch/api/interpreter',
    'https://overpass-api.de/api/interpreter',
  ],
  // Low-res world borders for country-level shading (Natural Earth, ~700KB).
  countriesGeoJson:
    'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson',

  // --- Caching / refresh ---
  cellCacheTTL: 15 * 60 * 1000, // 15 min — the "refresh period" for live business cells
  wikidataCacheTTL: 24 * 60 * 60 * 1000, // 24h
  countriesCacheTTL: 30 * 24 * 60 * 60 * 1000, // 30d (borders rarely change)

  // --- Wikidata ---
  companyLimit: 2000,
  minSitelinks: 12, // prominence floor; keeps the query light

  // --- Overpass ---
  overpassMaxResults: 400,
  overpassTimeout: 20, // seconds, server-side
  fetchTileZoom: 13, // slippy-tile zoom used to tile the world into fetch cells
  fetchDebounceMs: 600, // idle time after moveend before fetching

  // --- Zoom tiers ---
  zoom: {
    orbitMax: 8, // < 9  : ORBIT  (globe + country shading + major companies)
    regionMax: 13, // 9–12 : REGIONAL (H3 hex shading + companies)
    // >= 13 : STREET (live Overpass businesses)
    densityMin: 9, // at/above this we fetch (coarse) businesses so the hexes fill
  },

  // --- Rendering budgets ---
  maxMarkers: 320,
  logoCacheSize: 600,

  // --- Logos ---
  // The third-party favicon service (Google s2 → gstatic) 404s for a large share
  // of domains — defunct sites, universities, country TLDs — which spams the
  // console, and it rate-limits when a viewport asks for hundreds at once. So it's
  // OFF: an entity shows its Wikidata logo (P154) when present, otherwise a clean
  // generated monogram. Zero third-party image requests, nothing to rate-limit,
  // an image is never broken. Flip to true only if you accept the 404 noise.
  useFaviconService: false,

  // --- Overture Maps Places (optional, zero-API scale path) ---
  // Point `placesPmtilesUrl` at a hosted Overture Places PMTiles file to replace
  // the live Overpass API with your own static vector tiles: no rate limits, no
  // shared dependency, scales to as many visitors as your CDN serves. Leave it ''
  // to use Overpass (the keyless default that works out of the box). When set, the
  // street + density layers read POIs straight from the visible vector tiles and
  // feed the exact same markers / clustering / hex pipeline.
  overture: {
    placesPmtilesUrl: '',
    /** Vector-tile layer name inside the PMTiles (tippecanoe `-l`, planetiler, etc.). */
    sourceLayer: 'place',
    /** Property keys to read, in priority order — tolerant of how the file was tiled. */
    nameKeys: ['name', '@name', 'names.primary', 'primaryname'],
    categoryKeys: ['category', 'categories.primary', 'class', 'subclass'],
    websiteKeys: ['website', 'websites', 'socials'],
  },
} as const;

export type ViewTier = 'ORBIT' | 'REGIONAL' | 'STREET';

export function tierForZoom(zoom: number): ViewTier {
  if (zoom < CONFIG.zoom.orbitMax + 1) return 'ORBIT';
  if (zoom < CONFIG.zoom.regionMax) return 'REGIONAL';
  return 'STREET';
}
