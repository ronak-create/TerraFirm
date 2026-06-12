// Shading layers that sit *under* the markers: country tint (ORBIT) and H3 hex
// density (REGIONAL). Both fade in/out smoothly between zoom tiers.

import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl';
import { CONFIG } from '../config';
import type { CountryFC } from '../data/countries';
import type { HexFeatureCollection } from './h3';

export const COUNTRY_SRC = 'tf-countries';
export const COUNTRY_FILL = 'tf-country-fill';
export const HEX_SRC = 'tf-hexes';
export const HEX_FILL = 'tf-hex-fill';
export const HEX_LINE = 'tf-hex-line';

const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] };

/** Add shading sources + layers once, beneath any symbol layer (so labels stay on top). */
export function addShadingLayers(map: MlMap, countries: CountryFC | null): void {
  const beforeId = firstSymbolLayer(map);

  if (!map.getSource(COUNTRY_SRC)) {
    map.addSource(COUNTRY_SRC, { type: 'geojson', data: (countries ?? EMPTY_FC) as never });
    map.addLayer(
      {
        id: COUNTRY_FILL,
        type: 'fill',
        source: COUNTRY_SRC,
        paint: {
          'fill-color': ['coalesce', ['get', 'tfColor'], '#1b2a3a'],
          // Fade the country tint out as we approach REGIONAL.
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.18, 6, 0.16, 8, 0.08, 9, 0],
        },
      },
      beforeId
    );
  }

  if (!map.getSource(HEX_SRC)) {
    map.addSource(HEX_SRC, { type: 'geojson', data: EMPTY_FC });
    map.addLayer(
      {
        id: HEX_FILL,
        type: 'fill',
        source: HEX_SRC,
        paint: {
          'fill-color': ['get', 'tfColor'],
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            CONFIG.zoom.orbitMax,
            0,
            CONFIG.zoom.orbitMax + 1,
            ['get', 'tfOpacity'],
            CONFIG.zoom.regionMax,
            ['get', 'tfOpacity'],
            CONFIG.zoom.regionMax + 1.5,
            0,
          ],
        },
      },
      beforeId
    );
    map.addLayer(
      {
        id: HEX_LINE,
        type: 'line',
        source: HEX_SRC,
        paint: {
          'line-color': ['get', 'tfColor'],
          'line-width': 0.5,
          'line-opacity': ['interpolate', ['linear'], ['zoom'], CONFIG.zoom.orbitMax, 0, CONFIG.zoom.orbitMax + 1, 0.35, CONFIG.zoom.regionMax + 1, 0],
        },
      },
      beforeId
    );
  }
}

export function setCountryData(map: MlMap, fc: CountryFC): void {
  (map.getSource(COUNTRY_SRC) as GeoJSONSource | undefined)?.setData(fc as never);
}

export function setHexData(map: MlMap, fc: HexFeatureCollection): void {
  (map.getSource(HEX_SRC) as GeoJSONSource | undefined)?.setData(fc as never);
}

export function clearHexes(map: MlMap): void {
  (map.getSource(HEX_SRC) as GeoJSONSource | undefined)?.setData(EMPTY_FC as never);
}

function firstSymbolLayer(map: MlMap): string | undefined {
  const layers = map.getStyle()?.layers ?? [];
  return layers.find((l) => l.type === 'symbol')?.id;
}
