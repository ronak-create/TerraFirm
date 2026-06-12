// Overpass API: viewport-driven fetching of every named local business.
// Be a good citizen — tile the world into z13 cells, fetch only uncached cells,
// cache each in IndexedDB with a TTL, cap results, and back off on 429/504.

import { CONFIG } from '../config';
import type { Business, LngLatBounds } from '../types';
import { cacheGet, cacheSet } from './cache';
import { domainFromUrl } from './logos';

// --- Slippy-tile maths --------------------------------------------------------
export interface Tile {
  z: number;
  x: number;
  y: number;
}

export function lngLatToTile(lon: number, lat: number, z: number): Tile {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n);
  return { z, x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

export function tileToBounds(t: Tile): LngLatBounds {
  const n = 2 ** t.z;
  const lon = (x: number) => (x / n) * 360 - 180;
  const lat = (y: number) => {
    const r = Math.PI - (2 * Math.PI * y) / n;
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(r) - Math.exp(-r)));
  };
  return { west: lon(t.x), east: lon(t.x + 1), north: lat(t.y), south: lat(t.y + 1) };
}

/** All z-cells intersecting a viewport (capped so a world-view pan can't explode). */
export function tilesForBounds(b: LngLatBounds, z: number, max = 12): Tile[] {
  const tl = lngLatToTile(b.west, b.north, z);
  const br = lngLatToTile(b.east, b.south, z);
  const tiles: Tile[] = [];
  for (let x = tl.x; x <= br.x; x++) {
    for (let y = tl.y; y <= br.y; y++) {
      tiles.push({ z, x, y });
      if (tiles.length >= max) return tiles;
    }
  }
  return tiles;
}

/**
 * Slippy-tile zoom to fetch at, for a given *map* zoom. Coarser tiles when zoomed
 * out so a big regional viewport still fits inside the tile cap (and fills the
 * density hexes); fine z13 tiles at street level for per-business detail.
 */
export function fetchTileZoomForViewport(mapZoom: number): number {
  // Floor of 11 keeps each regional bbox small enough that Overpass doesn't 504 on
  // the query; ceil is the street zoom (13).
  return Math.max(11, Math.min(CONFIG.fetchTileZoom, Math.round(mapZoom) + 1));
}

export const cellKey = (t: Tile): string => `cell:${t.z}/${t.x}/${t.y}`;

export function parseCellKey(key: string): Tile | null {
  const m = key.match(/^cell:(\d+)\/(\d+)\/(\d+)$/);
  return m ? { z: +m[1], x: +m[2], y: +m[3] } : null;
}

/** True if a tile's bounds overlap the given bounds (no antimeridian handling). */
export function tileIntersects(t: Tile, b: LngLatBounds): boolean {
  const tb = tileToBounds(t);
  return !(tb.east < b.west || tb.west > b.east || tb.north < b.south || tb.south > b.north);
}

// --- Query building -----------------------------------------------------------
// Full street-level filter set (zoom 13): nodes *and* ways, all categories.
const FULL_FILTERS = [
  'node["shop"]',
  'way["shop"]',
  'node["amenity"~"^(cafe|restaurant|bar|fast_food|pub|bank|pharmacy|cinema|theatre|hotel|fuel|clinic|hospital|doctors|marketplace|nightclub|food_court|ice_cream)$"]',
  'way["amenity"~"^(cafe|restaurant|bar|fast_food|pub|bank|pharmacy|cinema|theatre|hotel|fuel|clinic|hospital|doctors|marketplace|nightclub|food_court|ice_cream)$"]',
  'node["office"]',
  'way["office"]',
  'node["craft"]',
  'way["craft"]',
  'node["tourism"~"^(hotel|museum|gallery|guest_house|hostel|motel|attraction)$"]',
  'way["tourism"~"^(hotel|museum|gallery|guest_house|hostel|motel|attraction)$"]',
];

// Light filter set for coarse REGIONAL tiles: nodes only (ways are far more
// expensive to resolve with `out center` over a big bbox → 504s), and only the
// high-signal categories. Plenty for the density hexes; keeps the query cheap.
const LIGHT_FILTERS = [
  'node["shop"]',
  'node["amenity"~"^(cafe|restaurant|bar|fast_food|pub|bank|pharmacy|hotel|fuel|hospital|marketplace)$"]',
  'node["office"]',
];

function buildQuery(b: LngLatBounds, light: boolean): string {
  const bbox = `${b.south},${b.west},${b.north},${b.east}`;
  const filters = light ? LIGHT_FILTERS : FULL_FILTERS;
  const body = filters.map((f) => `${f}["name"](${bbox});`).join('\n  ');
  return `[out:json][timeout:${CONFIG.overpassTimeout}];
(
  ${body}
);
out center ${CONFIG.overpassMaxResults};`;
}

// --- Overpass JSON → Business[] (pure, unit-testable) -------------------------
interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function categoryOf(tags: Record<string, string>): string | undefined {
  const raw = tags.shop || tags.amenity || tags.office || tags.craft || tags.tourism;
  if (!raw) return undefined;
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function addressOf(tags: Record<string, string>): string | undefined {
  const parts = [
    [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
    tags['addr:suburb'],
    tags['addr:city'] || tags['addr:town'] || tags['addr:village'],
    tags['addr:postcode'],
    tags['addr:state'],
    tags['addr:country'],
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

export function elementsToBusinesses(elements: OverpassElement[]): Business[] {
  const out: Business[] = [];
  for (const el of elements) {
    const tags = el.tags;
    if (!tags || !tags.name) continue;
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;

    const website = tags.website || tags['contact:website'] || tags.url;
    out.push({
      id: `osm:${el.type}/${el.id}`,
      kind: 'business',
      source: 'osm',
      osmType: el.type,
      osmId: el.id,
      name: tags.name,
      lat,
      lon,
      website,
      domain: domainFromUrl(website),
      category: categoryOf(tags),
      address: addressOf(tags),
      openingHours: tags.opening_hours,
      phone: tags.phone || tags['contact:phone'],
      cuisine: tags.cuisine?.replace(/_/g, ' '),
    });
  }
  return out;
}

// --- Fetching with endpoint fallback + backoff --------------------------------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Index of the endpoint that last succeeded; tried first on subsequent cells.
 * Starts random so visitors don't all hammer the same mirror first (which is what
 * gets one mirror to 429/504 under load).
 */
let preferredEndpoint = Math.floor(Math.random() * CONFIG.overpassEndpoints.length);

async function fetchOnce(query: string, endpoint: string, signal: AbortSignal): Promise<Business[]> {
  const res = await fetch(endpoint, {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal,
  });
  if (res.status === 429 || res.status === 504 || res.status === 503) {
    throw Object.assign(new Error(`Overpass ${res.status}`), { retryable: true, status: res.status });
  }
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const json = (await res.json()) as { elements?: OverpassElement[] };
  return elementsToBusinesses(json.elements ?? []);
}

/** Fetch a single cell (cache-first). Throws on hard failure so callers can toast. */
export async function fetchCell(tile: Tile, signal: AbortSignal, force = false): Promise<Business[]> {
  const key = cellKey(tile);
  if (!force) {
    const cached = await cacheGet<Business[]>(key);
    if (cached) return cached;
  }

  // Coarse regional tiles use the cheap node-only query; street z13 tiles the full one.
  const query = buildQuery(tileToBounds(tile), tile.z < CONFIG.fetchTileZoom);
  const endpoints = CONFIG.overpassEndpoints;
  let lastErr: unknown;

  // Start from the endpoint that worked last time, so a struggling endpoint isn't
  // re-tried first on every single cell.
  for (let attempt = 0; attempt < endpoints.length * 2; attempt++) {
    const idx = (preferredEndpoint + attempt) % endpoints.length;
    const endpoint = endpoints[idx];
    try {
      const businesses = await fetchOnce(query, endpoint, signal);
      preferredEndpoint = idx; // remember the winner
      await cacheSet(key, businesses, CONFIG.cellCacheTTL);
      return businesses;
    } catch (err) {
      if (signal.aborted) throw err;
      lastErr = err;
      const retryable = (err as { retryable?: boolean })?.retryable;
      if (!retryable && attempt >= endpoints.length - 1) break;
      // Exponential backoff (capped 8s) + random jitter so many tabs/cells don't
      // retry in lockstep and re-trigger 429s on the same mirror.
      const base = Math.min(8000, 600 * 2 ** attempt);
      await sleep(base + Math.random() * 400);
    }
  }
  throw lastErr ?? new Error('Overpass unreachable');
}
