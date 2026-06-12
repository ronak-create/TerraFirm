// Overture Maps Places adapter — turns the POIs in a hosted PMTiles vector source
// into the same `Business` shape the Overpass adapter produces, so the rest of the
// app (markers, clustering, hex shading, panel, search) is unchanged.
//
// This is the zero-API scale path: tiles are static files served from your own CDN,
// read client-side by MapLibre, so there's no rate limit and nothing shared to
// overwhelm — unlike the live Overpass API. Enable it via CONFIG.overture.placesPmtilesUrl.

import type { Map as MlMap, GeoJSONFeature } from 'maplibre-gl';
import { CONFIG } from '../config';
import type { Business, LngLatBounds } from '../types';
import { domainFromUrl } from './logos';

export const OVERTURE_SRC = 'tf-overture';
const TRIGGER_LAYER = 'tf-overture-trigger';

/**
 * Register the PMTiles source and a near-invisible point layer. The layer exists
 * only so MapLibre actually downloads the vector tiles for the viewport; we then
 * read their features with querySourceFeatures and render our own HTML markers.
 */
export function enableOvertureSource(map: MlMap): void {
  if (map.getSource(OVERTURE_SRC)) return;
  map.addSource(OVERTURE_SRC, {
    type: 'vector',
    url: `pmtiles://${CONFIG.overture.placesPmtilesUrl}`,
  });
  map.addLayer({
    id: TRIGGER_LAYER,
    type: 'circle',
    source: OVERTURE_SRC,
    'source-layer': CONFIG.overture.sourceLayer,
    paint: { 'circle-radius': 1, 'circle-opacity': 0 }, // invisible; just forces tile load
  });
}

/** Read the value of the first matching key (supports flattened "a.b" dotted keys). */
function pick(props: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const direct = props[k];
    if (typeof direct === 'string' && direct.trim()) return direct.trim();
    if (typeof direct === 'number') return String(direct);
    // Dotted key against a possibly-JSON-encoded nested object.
    if (k.includes('.')) {
      const [head, tail] = k.split('.');
      const raw = props[head];
      const obj = typeof raw === 'string' ? safeJson(raw) : raw;
      const val = obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[tail] : undefined;
      if (typeof val === 'string' && val.trim()) return val.trim();
    }
  }
  return undefined;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

function firstWebsite(props: Record<string, unknown>): string | undefined {
  const raw = pick(props, CONFIG.overture.websiteKeys);
  if (!raw) return undefined;
  // Overture `websites` is often a JSON array; take the first entry.
  const parsed = raw.startsWith('[') ? safeJson(raw) : raw;
  if (Array.isArray(parsed)) return typeof parsed[0] === 'string' ? parsed[0] : undefined;
  return typeof parsed === 'string' ? parsed : raw;
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** One PMTiles feature → Business (or null if it has no name/usable point). */
export function overtureFeatureToBusiness(f: GeoJSONFeature): Business | null {
  const props = (f.properties ?? {}) as Record<string, unknown>;
  const name = pick(props, CONFIG.overture.nameKeys);
  if (!name) return null;

  const geom = f.geometry;
  if (!geom || geom.type !== 'Point') return null;
  const [lon, lat] = geom.coordinates as [number, number];
  if (lon == null || lat == null) return null;

  const website = firstWebsite(props);
  const category = pick(props, CONFIG.overture.categoryKeys);
  return {
    id: `ovt:${f.id ?? `${lon.toFixed(6)}/${lat.toFixed(6)}`}`,
    kind: 'business',
    source: 'overture',
    name,
    lat,
    lon,
    website,
    domain: domainFromUrl(website),
    category: category ? titleCase(category) : undefined,
  };
}

/**
 * Harvest the businesses from the currently-loaded Overture tiles that fall inside
 * `b`, deduped. Cheap: it reads already-downloaded vector tiles, no network.
 */
export function readOvertureBusinesses(map: MlMap, b: LngLatBounds): Business[] {
  let feats: GeoJSONFeature[];
  try {
    feats = map.querySourceFeatures(OVERTURE_SRC, { sourceLayer: CONFIG.overture.sourceLayer });
  } catch {
    return [];
  }
  const out = new Map<string, Business>();
  for (const f of feats) {
    const biz = overtureFeatureToBusiness(f);
    if (!biz) continue;
    if (biz.lat < b.south || biz.lat > b.north) continue;
    if (b.west <= b.east ? biz.lon < b.west || biz.lon > b.east : biz.lon < b.west && biz.lon > b.east) continue;
    out.set(biz.id, biz);
  }
  return [...out.values()];
}
