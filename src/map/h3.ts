// Aggregate business points into H3 hexagons for REGIONAL shading.
// Hue is deterministic per cell (unique colour per area); opacity encodes density.

import { cellToBoundary, latLngToCell } from 'h3-js';
import { hueColor } from '../data/countries';

/** Any geo point — businesses or company HQs both feed the density shading. */
export interface DensityPoint {
  lat: number;
  lon: number;
}

/** H3 resolution scaled to zoom: coarser when zoomed out, finer when zoomed in. */
export function resForZoom(zoom: number): number {
  if (zoom < 10) return 5;
  if (zoom < 11) return 6;
  if (zoom < 12) return 7;
  return 8;
}

interface HexAgg {
  count: number;
}

export interface HexFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: { h3: string; count: number; tfColor: string; tfOpacity: number };
    geometry: { type: 'Polygon'; coordinates: number[][][] };
  }>;
}

/** Pure transform: points → H3 hex GeoJSON with colour + density opacity. */
export function businessesToHexes(points: DensityPoint[], zoom: number): HexFeatureCollection {
  const res = resForZoom(zoom);
  const agg = new Map<string, HexAgg>();

  for (const b of points) {
    const cell = latLngToCell(b.lat, b.lon, res);
    const a = agg.get(cell);
    if (a) a.count++;
    else agg.set(cell, { count: 1 });
  }

  let max = 1;
  for (const a of agg.values()) max = Math.max(max, a.count);

  const features: HexFeatureCollection['features'] = [];
  for (const [h3, a] of agg) {
    // boundary returns [lat, lng] pairs; GeoJSON needs [lng, lat] and a closed ring.
    const ring = cellToBoundary(h3).map(([lat, lng]) => [lng, lat]);
    ring.push(ring[0]);
    const intensity = a.count / max; // 0..1
    features.push({
      type: 'Feature',
      properties: {
        h3,
        count: a.count,
        tfColor: hueColor(h3, 65, 52),
        tfOpacity: 0.12 + 0.45 * Math.sqrt(intensity), // sqrt so sparse areas still show
      },
      geometry: { type: 'Polygon', coordinates: [ring] },
    });
  }

  return { type: 'FeatureCollection', features };
}
