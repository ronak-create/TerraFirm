// A tiny singleton so non-map components (search, panel) can drive the camera
// without prop-drilling the MapLibre instance through React.

import type { Map as MlMap } from 'maplibre-gl';
import { flyTo } from './camera';

export const mapBus: { map?: MlMap } = {};

export function flyToLngLat(lon: number, lat: number, zoom?: number): void {
  if (mapBus.map) flyTo(mapBus.map, lon, lat, zoom);
}
