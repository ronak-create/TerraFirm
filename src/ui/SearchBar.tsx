import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { searchPlaces } from '../data/nominatim';
import type { Business, Company, SearchResult } from '../types';
import { flyToLngLat } from '../map/mapBus';

const MIN_INTERVAL = 1100; // Nominatim etiquette: <= ~1 req/sec

/** Lowercase + strip diacritics so "nestle" matches "Nestlé". */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function matchCompanies(companies: Company[], q: string): SearchResult[] {
  const needle = norm(q);
  const hits: Company[] = [];
  for (const c of companies) {
    if (norm(c.name).includes(needle)) hits.push(c);
    if (hits.length >= 60) break;
  }
  return hits
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      label: c.name,
      sub: c.industry || c.hqLabel || 'Company',
      lat: c.lat,
      lon: c.lon,
      kind: 'company' as const,
      entity: c,
    }));
}

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(-1);
  const companies = useStore((s) => s.companies);
  const results = useStore((s) => s.searchResults);
  const open = useStore((s) => s.searchOpen);
  const busy = useStore((s) => s.searchBusy);
  const setSearch = useStore((s) => s.setSearch);
  const select = useStore((s) => s.select);
  const addBusinesses = useStore((s) => s.addBusinesses);

  const lastReqRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  const companyMatches = useMemo(() => (query.trim().length >= 2 ? matchCompanies(companies, query) : []), [companies, query]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSearch({ searchResults: [], searchOpen: false, searchBusy: false });
      return;
    }
    // Show company matches instantly; debounce the geocoder.
    setSearch({ searchResults: companyMatches, searchOpen: true, searchBusy: true });
    window.clearTimeout(timerRef.current);
    const wait = Math.max(350, MIN_INTERVAL - (Date.now() - lastReqRef.current));
    timerRef.current = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      lastReqRef.current = Date.now();
      try {
        const places = await searchPlaces(q, controller.signal);
        if (!controller.signal.aborted) {
          setSearch({ searchResults: [...companyMatches, ...places], searchBusy: false });
        }
      } catch {
        if (!controller.signal.aborted) setSearch({ searchBusy: false });
      }
    }, wait);
    return () => window.clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, companyMatches]);

  const choose = (r: SearchResult) => {
    setQuery(r.label);
    setSearch({ searchOpen: false, searchResults: [] });
    setActiveIdx(-1);
    if (r.kind === 'company' && r.entity) {
      select(r.entity);
      flyToLngLat(r.lon, r.lat, 15);
    } else if (r.kind === 'business' && r.entity) {
      // Drop the located business into the store so it shows as a marker on the
      // map (visible when searched), then open its panel with the internet data.
      addBusinesses([r.entity as Business]);
      select(r.entity);
      flyToLngLat(r.lon, r.lat, 17);
    } else {
      select(null);
      flyToLngLat(r.lon, r.lat, 13.5);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[activeIdx >= 0 ? activeIdx : 0]);
    } else if (e.key === 'Escape') {
      setSearch({ searchOpen: false });
    }
  };

  return (
    <div className="tf-search" role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-owns="tf-search-list">
      <svg className="tf-search__icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
        <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        className="tf-search__input"
        placeholder="Search a place or company…  (try Vadodara · Nestlé)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length && setSearch({ searchOpen: true })}
        onKeyDown={onKey}
        aria-autocomplete="list"
        aria-controls="tf-search-list"
        spellCheck={false}
      />
      {busy && <span className="tf-search__spinner" aria-label="searching" />}
      {open && results.length > 0 && (
        <ul className="tf-search__list" id="tf-search-list" role="listbox">
          {results.map((r, i) => (
            <li
              key={r.id}
              role="option"
              aria-selected={i === activeIdx}
              className={`tf-search__item ${i === activeIdx ? 'is-active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(r);
              }}
              onMouseEnter={() => setActiveIdx(i)}
            >
              <span className={`tf-pill tf-pill--${r.kind}`}>
                {r.kind === 'company' ? 'CO' : r.kind === 'business' ? 'BIZ' : 'PLACE'}
              </span>
              <span className="tf-search__label">{r.label}</span>
              {r.sub && <span className="tf-search__sub">{r.sub}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
