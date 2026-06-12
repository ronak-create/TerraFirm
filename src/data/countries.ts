// World country borders for low-zoom shading. Fetched once from Natural Earth
// (via CDN), cached for 30 days, with a deterministic unique hue baked onto each
// feature so the map style can colour it with a simple ['get','tfColor'] expression.

import { CONFIG } from '../config';
import { cacheGet, cacheSet } from './cache';

export interface CountryFC {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: Record<string, unknown> & { tfColor: string };
    geometry: unknown;
  }>;
}

const CACHE_KEY = 'countries:ne_110m:v1';

/** Stable hash → HSL hex. Same key always yields the same hue. */
export function hueColor(key: string, sat = 60, light = 50): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return hslToHex(h % 360, sat, light);
}

export function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export async function loadCountries(signal?: AbortSignal): Promise<CountryFC | null> {
  const cached = await cacheGet<CountryFC>(CACHE_KEY);
  if (cached) return cached;

  try {
    const res = await fetch(CONFIG.countriesGeoJson, { signal });
    if (!res.ok) throw new Error(`countries ${res.status}`);
    const fc = (await res.json()) as CountryFC;
    for (const f of fc.features) {
      const name =
        (f.properties.ADMIN as string) ||
        (f.properties.NAME as string) ||
        (f.properties.SOVEREIGNT as string) ||
        Math.random().toString();
      f.properties.tfColor = hueColor(name, 55, 48);
    }
    await cacheSet(CACHE_KEY, fc, CONFIG.countriesCacheTTL);
    return fc;
  } catch {
    return null;
  }
}
