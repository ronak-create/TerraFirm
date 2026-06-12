// Core domain types. The `Business` shape is intentionally source-agnostic so an
// Overture Maps Places adapter can populate it identically to the Overpass adapter.

export type EntityKind = 'company' | 'business';

export interface BaseEntity {
  /** Globally unique within the app, e.g. "wd:Q123" or "osm:node/456". */
  id: string;
  kind: EntityKind;
  name: string;
  lat: number;
  lon: number;
  website?: string;
  /** Bare domain (no scheme/path), used for favicon lookups. */
  domain?: string;
  /** Preferred logo URL if known up-front (e.g. Wikidata P154 thumb). */
  logoUrl?: string;
}

export interface Company extends BaseEntity {
  kind: 'company';
  wikidataId: string;
  industry?: string;
  employees?: number;
  /** ISO date string of inception (P571). */
  inception?: string;
  hqLabel?: string;
  sitelinks: number;
  /** 0 = most prominent. Drives which companies appear at which zoom. */
  rank: number;
}

export interface Business extends BaseEntity {
  kind: 'business';
  /** Where this POI came from. Drives which "open in…" link the panel shows. */
  source?: 'osm' | 'overture';
  /** OSM identity — present only for source === 'osm'. */
  osmType?: 'node' | 'way' | 'relation';
  osmId?: number;
  category?: string;
  address?: string;
  openingHours?: string;
  phone?: string;
  cuisine?: string;
}

export type Entity = Company | Business;

export interface LngLatBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export type LiveStatus = 'idle' | 'scanning' | 'live' | 'error';

export interface SearchResult {
  id: string;
  label: string;
  sub?: string;
  lat: number;
  lon: number;
  kind: 'place' | 'company' | 'business';
  /** Present for company/business results so we can open the detail panel. */
  entity?: Entity;
}
