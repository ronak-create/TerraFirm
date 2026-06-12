import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { CONFIG, tierForZoom } from '../config';
import type { Company, LngLatBounds } from '../types';
import { useStore } from '../state/store';
import { loadCompaniesFast, refreshCompanies } from '../data/wikidata';
import { loadCountries } from '../data/countries';
import { cellKey, fetchCell, fetchTileZoomForViewport, parseCellKey, tileIntersects, tilesForBounds } from '../data/overpass';
import { enableOvertureSource, readOvertureBusinesses } from '../data/overture';
import { cacheExpire } from '../data/cache';
import { businessesToHexes, type DensityPoint } from './h3';
import { applyDarkTheme } from './style';
import { addShadingLayers, clearHexes, setCountryData, setHexData } from './layers';
import { MarkerManager, type MarkerSpec } from './markers';
import { BusinessClusterIndex } from './cluster';
import { easeToEntity, startSpin } from './camera';
import { mapBus } from './mapBus';

function boundsOf(map: MlMap): LngLatBounds {
  const b = map.getBounds();
  return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
}

function inBounds(lon: number, lat: number, b: LngLatBounds): boolean {
  if (lat < b.south || lat > b.north) return false;
  return b.west <= b.east ? lon >= b.west && lon <= b.east : lon >= b.west || lon <= b.east;
}

/** Rank ceiling for companies visible at a given zoom (more appear as you zoom in). */
function companyRankCap(zoom: number): number {
  return Math.max(25, Math.round(25 * Math.pow(1.8, zoom)));
}

function addCompanySpecs(
  out: MarkerSpec[],
  companies: Company[],
  b: LngLatBounds,
  zoom: number,
  cap: number
): void {
  const rankCap = companyRankCap(zoom);
  const candidates = companies
    .filter((c) => c.rank < rankCap && inBounds(c.lon, c.lat, b))
    .sort((a, c) => a.rank - c.rank)
    .slice(0, cap);
  const denom = Math.max(1, candidates[candidates.length - 1]?.rank ?? 1);
  for (const c of candidates) {
    out.push({ type: 'point', id: c.id, lon: c.lon, lat: c.lat, entity: c, prominence: 1 - c.rank / (denom + 50) });
  }
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const mgrRef = useRef<MarkerManager | null>(null);
  const clusterRef = useRef<BusinessClusterIndex | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inflightRef = useRef<Set<string>>(new Set());
  const doneRef = useRef<Set<string>>(new Set());
  const debounceRef = useRef<number | undefined>(undefined);
  const readyRef = useRef(false);
  const overtureOnRef = useRef(false);
  const lastHarvestRef = useRef(0);

  // --- Render the marker + shading layers for the current viewport ---
  const render = useRef(() => {});
  render.current = () => {
    const map = mapRef.current;
    const mgr = mgrRef.current;
    if (!map || !mgr || !readyRef.current) return;

    const zoom = map.getZoom();
    const b = boundsOf(map);
    const { companies, businesses } = useStore.getState();
    const specs: MarkerSpec[] = [];
    let entityCount = 0;

    if (zoom >= CONFIG.zoom.regionMax) {
      // Build a transient cluster index from only the businesses near the viewport.
      // This bounds the clustering work so panning/zooming stays smooth no matter
      // how many businesses have accumulated across the session.
      const dLon = b.east - b.west || 0.05;
      const dLat = b.north - b.south || 0.05;
      const pad: LngLatBounds = { west: b.west - dLon, east: b.east + dLon, south: b.south - dLat, north: b.north + dLat };
      const pts = [...businesses.values()].filter((x) => inBounds(x.lon, x.lat, pad));
      clusterRef.current = new BusinessClusterIndex(pts);
      const cl = clusterRef.current.getSpecs(b, zoom, CONFIG.maxMarkers);
      for (const s of cl) entityCount += s.type === 'cluster' ? s.count : 1;
      specs.push(...cl);
      addCompanySpecs(specs, companies, b, zoom, 30);
    } else {
      addCompanySpecs(specs, companies, b, zoom, CONFIG.maxMarkers);
      entityCount = specs.length;
    }

    mgr.sync(specs);
    useStore.getState().setVisibleCount(entityCount);

    // H3 hex shading for the REGIONAL band. Fed from BOTH the bundled company HQs
    // (instant, free — so the hexes are never empty even before any live fetch) and
    // any accumulated street businesses (which add real local density once visited).
    if (zoom >= CONFIG.zoom.orbitMax && zoom <= CONFIG.zoom.regionMax + 2 && (businesses.size || companies.length)) {
      const pad: LngLatBounds = { west: b.west - 2, east: b.east + 2, south: b.south - 2, north: b.north + 2 };
      const pts: DensityPoint[] = [];
      for (const x of businesses.values()) if (inBounds(x.lon, x.lat, pad)) pts.push(x);
      for (const c of companies) if (inBounds(c.lon, c.lat, pad)) pts.push(c);
      setHexData(map, businessesToHexes(pts, zoom));
    } else {
      clearHexes(map);
    }
  };

  // --- Fetch live businesses for the visible cells (STREET only) ---
  const maybeFetch = useRef(async (_force?: boolean) => {});
  maybeFetch.current = async (force = false) => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const store = useStore.getState();
    const zoom = map.getZoom();

    // With Overture enabled, businesses come from static vector tiles (harvested on
    // 'idle'), not the live API — so there's nothing to fetch here.
    if (overtureOnRef.current) {
      store.setLive(zoom < CONFIG.zoom.densityMin ? 'idle' : 'live');
      return;
    }

    // Live Overpass is only hit at STREET zoom (small z13 tiles that return fast).
    // Regional density comes from companies + accumulated businesses (no network),
    // because big regional Overpass queries queue for 30–60s on shared mirrors and
    // 504 — a bad, unreliable experience. (Overture, when enabled, harvests regional
    // tiles locally instead, handled above.)
    if (zoom < CONFIG.zoom.regionMax) {
      abortRef.current?.abort();
      store.setLive('idle');
      return;
    }

    const b = boundsOf(map);
    const tiles = tilesForBounds(b, fetchTileZoomForViewport(zoom));
    if (force) {
      await cacheExpire(tiles.map(cellKey));
      for (const t of tiles) doneRef.current.delete(cellKey(t));
    }
    const toFetch = tiles.filter((t) => force || !doneRef.current.has(cellKey(t)));
    if (!toFetch.length) {
      store.setLive('live');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    store.setLive('scanning');

    let anyError = false;
    for (const t of toFetch) {
      const key = cellKey(t);
      if (inflightRef.current.has(key) && !force) continue;
      inflightRef.current.add(key);
      try {
        const businesses = await fetchCell(t, controller.signal, force);
        if (controller.signal.aborted) return;
        doneRef.current.add(key);
        useStore.getState().addBusinesses(businesses);
      } catch (err) {
        if (controller.signal.aborted) return;
        anyError = true;
      } finally {
        inflightRef.current.delete(key);
      }
    }
    if (controller.signal.aborted) return;

    if (anyError) {
      store.setLive('error');
      store.pushToast('Overpass busy — retrying shortly', 'error');
    } else {
      store.setLive('live');
      store.markSynced();
    }
  };

  // --- Unload businesses far from the viewport (keeps memory + clustering light) ---
  const pruneFar = useRef(() => {});
  pruneFar.current = () => {
    const map = mapRef.current;
    if (!map) return;
    const all = useStore.getState().businesses;
    if (all.size < 1200) return; // don't churn small sets
    const b = boundsOf(map);
    const dLon = (b.east - b.west) * 2.5 || 1;
    const dLat = (b.north - b.south) * 2.5 || 1;
    const keep: LngLatBounds = { west: b.west - dLon, east: b.east + dLon, south: b.south - dLat, north: b.north + dLat };
    useStore.getState().pruneBusinesses(keep);
    // Forget fetched cells outside the keep area, so returning re-loads them from
    // the IndexedDB cell cache (instant, no network) rather than showing nothing.
    for (const key of [...doneRef.current]) {
      const t = parseCellKey(key);
      if (t && !tileIntersects(t, keep)) doneRef.current.delete(key);
    }
  };

  // --- Map lifecycle ---
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: CONFIG.basemapStyle,
      center: [useStore.getState().center.lng, useStore.getState().center.lat],
      zoom: useStore.getState().zoom,
      attributionControl: false,
      maxZoom: 19,
      dragRotate: false,
      pitchWithRotate: false,
    });
    mapRef.current = map;
    mapBus.map = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    // The OpenFreeMap sprite occasionally references an icon we never display
    // (e.g. "circle-11", "wood-pattern"). MapLibre logs a warning per miss; feed
    // it a 1×1 transparent placeholder so the console stays clean.
    map.on('styleimagemissing', (e) => {
      if (!map.hasImage(e.id)) {
        map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
      }
    });

    const mgr = new MarkerManager(map);
    mgr.onSelect = (entity) => {
      useStore.getState().select(entity);
      easeToEntity(map, entity.lon, entity.lat);
    };
    mgr.onCluster = (lon, lat) => {
      map.easeTo({ center: [lon, lat], zoom: Math.min(19, map.getZoom() + 2.5), duration: 600 });
    };
    mgrRef.current = mgr;

    map.on('load', async () => {
      try {
        map.setProjection({ type: 'globe' } as never);
      } catch {
        /* renderer without globe support falls back to mercator */
      }
      applyDarkTheme(map);

      const countries = await loadCountries();
      addShadingLayers(map, countries);
      if (countries) setCountryData(map, countries);

      // Optional zero-API street data: read POIs from a hosted Overture PMTiles file
      // instead of the live Overpass API. Loaded only when configured.
      if (CONFIG.overture.placesPmtilesUrl) {
        try {
          const { Protocol } = await import('pmtiles');
          const protocol = new Protocol();
          maplibregl.addProtocol('pmtiles', protocol.tile);
          enableOvertureSource(map);
          overtureOnRef.current = true;
        } catch {
          useStore.getState().pushToast('Overture source failed to load — using OSM.', 'error');
        }
      }

      readyRef.current = true;
      startSpin(map);
      render.current();

      // Instant company data from the bundled snapshot (or 24h cache) so search
      // works right away — no waiting on the live SPARQL endpoint.
      const { companies, fromCache } = await loadCompaniesFast();
      if (companies.length) {
        useStore.getState().setCompanies(companies);
        render.current();
      } else {
        useStore.getState().setCompaniesLoading(false);
      }

      // Refresh from Wikidata in the background only when we didn't already have a
      // fresh 24h cache. The snapshot stands in until (and if) this resolves.
      if (!fromCache) {
        refreshCompanies()
          .then((fresh) => {
            // Only adopt the live result if it's at least as rich as the bundled
            // snapshot — a smaller live response must never shrink what's shown.
            if (fresh.length >= useStore.getState().companies.length) {
              useStore.getState().setCompanies(fresh);
              render.current();
            }
          })
          .catch(() => {
            if (!companies.length)
              useStore.getState().pushToast('Wikidata unreachable — using bundled company snapshot.', 'error');
          });
      }
    });

    // Throttled view-state sync (drives status bar / altitude rail).
    let rafPending = false;
    const onMove = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        const z = map.getZoom();
        const c = map.getCenter();
        useStore.getState().setView({ tier: tierForZoom(z), zoom: z, center: { lng: c.lng, lat: c.lat } });
      });
    };
    map.on('move', onMove);

    const onMoveEnd = () => {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        pruneFar.current();
        render.current();
        void maybeFetch.current(false);
      }, CONFIG.fetchDebounceMs);
    };
    map.on('moveend', onMoveEnd);
    map.on('click', () => useStore.getState().select(null));

    // Harvest Overture POIs from vector tiles as they finish loading (throttled).
    map.on('idle', () => {
      if (!overtureOnRef.current || map.getZoom() < CONFIG.zoom.densityMin) return;
      const now = Date.now();
      if (now - lastHarvestRef.current < 400) return;
      lastHarvestRef.current = now;
      const biz = readOvertureBusinesses(map, boundsOf(map));
      if (biz.length) {
        useStore.getState().addBusinesses(biz);
        render.current();
      }
    });

    return () => {
      window.clearTimeout(debounceRef.current);
      abortRef.current?.abort();
      mgr.clear();
      map.remove();
      mapRef.current = null;
      mapBus.map = undefined;
    };
  }, []);

  // Re-render markers as businesses stream in (the index is rebuilt per-render
  // from a viewport-scoped subset, so this stays cheap).
  const businesses = useStore((s) => s.businesses);
  useEffect(() => {
    render.current();
  }, [businesses]);

  // Re-render markers when companies arrive.
  const companies = useStore((s) => s.companies);
  useEffect(() => {
    render.current();
  }, [companies]);

  // Highlight the selected marker.
  const selected = useStore((s) => s.selected);
  useEffect(() => {
    mgrRef.current?.setSelected(selected?.id ?? null);
  }, [selected]);

  // Manual refresh button → force re-fetch current cells.
  const refreshNonce = useStore((s) => s.refreshNonce);
  useEffect(() => {
    if (refreshNonce === 0) return;
    void maybeFetch.current(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshNonce]);

  return <div ref={containerRef} className="tf-map" aria-label="Interactive world business map" />;
}
