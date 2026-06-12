// Nominatim geocoding search over OpenStreetMap's *global* index of named POIs and
// addresses — this is what lets the search bar locate any business on Earth by name,
// not just the bundled companies. Browsers can't set User-Agent, but Referer is sent
// automatically; we pass an identifying email param per the usage policy and keep
// callers to <= 1 req/sec via debouncing in the UI layer.

import { CONFIG } from '../config';
import type { Business, SearchResult } from '../types';
import { domainFromUrl } from './logos';

interface NominatimPlace {
  place_id: number;
  osm_type?: 'node' | 'way' | 'relation';
  osm_id?: number;
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
  type?: string;
  /** Top-level class. jsonv2 names it `category`; older formats use `class`. */
  category?: string;
  class?: string;
  address?: Record<string, string>;
  extratags?: Record<string, string> | null;
  namedetails?: Record<string, string> | null;
}

// OSM top-level classes that denote an actual business/POI (vs. an admin area or road).
const BUSINESS_CLASSES = new Set([
  'shop',
  'amenity',
  'office',
  'craft',
  'tourism',
  'leisure',
  'healthcare',
  'club',
]);

const titleCase = (s: string): string => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Build a Business from a Nominatim POI hit, hydrating it with its internet data. */
function toBusiness(p: NominatimPlace): Business | null {
  if (!p.osm_type || p.osm_id == null) return null;
  const name = p.namedetails?.name || p.name || p.display_name.split(',')[0].trim();
  if (!name) return null;
  const tags = p.extratags ?? {};
  const website = tags.website || tags['contact:website'] || tags.url || undefined;
  const addr = p.address;
  const address = addr
    ? [
        [addr.house_number, addr.road].filter(Boolean).join(' '),
        addr.neighbourhood || addr.suburb,
        addr.city || addr.town || addr.village,
        addr.postcode,
        addr.state,
        addr.country,
      ]
        .filter(Boolean)
        .join(', ')
    : p.display_name;
  return {
    id: `osm:${p.osm_type}/${p.osm_id}`,
    kind: 'business',
    source: 'osm',
    osmType: p.osm_type,
    osmId: p.osm_id,
    name,
    lat: parseFloat(p.lat),
    lon: parseFloat(p.lon),
    website,
    domain: domainFromUrl(website),
    category: p.type ? titleCase(p.type) : p.category || p.class ? titleCase((p.category || p.class)!) : undefined,
    address: address || undefined,
    openingHours: tags.opening_hours,
    phone: tags.phone || tags['contact:phone'],
    cuisine: tags.cuisine?.replace(/_/g, ' '),
  };
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  // addressdetails + extratags + namedetails give us the website/phone/hours/address
  // needed to render a POI's panel straight from the search hit.
  const url =
    `${CONFIG.nominatimEndpoint}?format=jsonv2&limit=8` +
    `&addressdetails=1&extratags=1&namedetails=1` +
    `&q=${encodeURIComponent(q)}&email=ronakparmar2428@gmail.com`;

  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const places = (await res.json()) as NominatimPlace[];

  return places.map((p) => {
    const [primary, ...rest] = p.display_name.split(',');
    const klass = p.category || p.class;
    const isBusiness = !!klass && BUSINESS_CLASSES.has(klass) && (!!p.namedetails?.name || !!p.name);
    if (isBusiness) {
      const biz = toBusiness(p);
      if (biz) {
        return {
          id: biz.id,
          label: biz.name,
          sub: biz.category || rest.slice(0, 2).join(',').trim() || 'Business',
          lat: biz.lat,
          lon: biz.lon,
          kind: 'business' as const,
          entity: biz,
        };
      }
    }
    return {
      id: `osm-place:${p.place_id}`,
      label: primary.trim(),
      sub: rest.join(',').trim() || p.type,
      lat: parseFloat(p.lat),
      lon: parseFloat(p.lon),
      kind: 'place' as const,
    };
  });
}
