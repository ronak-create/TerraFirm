import { describe, expect, it } from 'vitest';
import { bindingsToCompanies } from './wikidata';
import { elementsToBusinesses, lngLatToTile, tileToBounds, tilesForBounds } from './overpass';
import { businessesToHexes } from '../map/h3';
import type { Business } from '../types';

describe('bindingsToCompanies', () => {
  it('parses points, dedupes, and ranks by sitelinks', () => {
    const companies = bindingsToCompanies([
      {
        company: { type: 'uri', value: 'http://www.wikidata.org/entity/Q1' },
        companyLabel: { type: 'literal', value: 'Acme' },
        coord: { type: 'literal', value: 'Point(13.4 52.5)' },
        website: { type: 'uri', value: 'https://acme.example' },
        sitelinks: { type: 'literal', value: '40' },
      },
      // duplicate row (e.g. multiple industries) — should collapse to one company
      {
        company: { type: 'uri', value: 'http://www.wikidata.org/entity/Q1' },
        companyLabel: { type: 'literal', value: 'Acme' },
        coord: { type: 'literal', value: 'Point(13.4 52.5)' },
        sitelinks: { type: 'literal', value: '40' },
      },
      {
        company: { type: 'uri', value: 'http://www.wikidata.org/entity/Q2' },
        companyLabel: { type: 'literal', value: 'Globex' },
        coord: { type: 'literal', value: 'Point(2.35 48.85)' },
        sitelinks: { type: 'literal', value: '120' },
      },
    ]);

    expect(companies).toHaveLength(2);
    expect(companies[0].name).toBe('Globex'); // higher sitelinks ranks first
    expect(companies[0].rank).toBe(0);
    expect(companies[1].rank).toBe(1);
    const acme = companies.find((c) => c.wikidataId === 'Q1')!;
    expect(acme.lat).toBeCloseTo(52.5);
    expect(acme.lon).toBeCloseTo(13.4);
    expect(acme.domain).toBe('acme.example');
  });

  it('drops rows without coordinates or labels', () => {
    const companies = bindingsToCompanies([
      { company: { type: 'uri', value: 'http://www.wikidata.org/entity/Q9' } },
    ]);
    expect(companies).toHaveLength(0);
  });
});

describe('elementsToBusinesses', () => {
  it('maps nodes and way centers, requires a name', () => {
    const businesses = elementsToBusinesses([
      { type: 'node', id: 1, lat: 19.07, lon: 72.87, tags: { name: 'Cafe X', amenity: 'cafe', cuisine: 'coffee_shop' } },
      { type: 'way', id: 2, center: { lat: 19.08, lon: 72.88 }, tags: { name: 'Shop Y', shop: 'clothes' } },
      { type: 'node', id: 3, lat: 1, lon: 1, tags: { amenity: 'cafe' } }, // no name → skipped
    ]);
    expect(businesses).toHaveLength(2);
    expect(businesses[0]).toMatchObject({ id: 'osm:node/1', name: 'Cafe X', category: 'Cafe', cuisine: 'coffee shop' });
    expect(businesses[1].lat).toBeCloseTo(19.08);
  });
});

describe('slippy tiles', () => {
  it('round-trips a coordinate into its tile bounds', () => {
    const t = lngLatToTile(72.87, 19.07, 13);
    const b = tileToBounds(t);
    expect(72.87).toBeGreaterThanOrEqual(b.west);
    expect(72.87).toBeLessThanOrEqual(b.east);
    expect(19.07).toBeLessThanOrEqual(b.north);
    expect(19.07).toBeGreaterThanOrEqual(b.south);
  });

  it('caps the number of tiles for a huge viewport', () => {
    const tiles = tilesForBounds({ west: -180, east: 180, south: -80, north: 80 }, 13, 12);
    expect(tiles.length).toBeLessThanOrEqual(12);
  });
});

describe('businessesToHexes', () => {
  it('aggregates points into coloured, density-weighted hexes', () => {
    const pts: Business[] = Array.from({ length: 5 }, (_, i) => ({
      id: `osm:node/${i}`,
      kind: 'business',
      osmType: 'node',
      osmId: i,
      name: `b${i}`,
      lat: 19.07 + i * 0.0001,
      lon: 72.87,
    }));
    const fc = businessesToHexes(pts, 12);
    expect(fc.features.length).toBeGreaterThan(0);
    for (const f of fc.features) {
      expect(f.properties.tfColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(f.properties.tfOpacity).toBeGreaterThan(0);
    }
  });
});
