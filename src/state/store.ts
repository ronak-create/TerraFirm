import { create } from 'zustand';
import type { Business, Company, Entity, LiveStatus, LngLatBounds, SearchResult } from '../types';
import type { ViewTier } from '../config';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error';
}

interface AppState {
  // --- Data ---
  companies: Company[];
  companiesLoading: boolean;
  /** Accumulated live businesses, keyed by id (deduped across fetch cells). */
  businesses: Map<string, Business>;

  // --- Map view ---
  tier: ViewTier;
  zoom: number;
  center: { lng: number; lat: number };

  // --- Live status ---
  live: LiveStatus;
  lastSync: number | null;
  visibleCount: number;

  // --- Selection / search ---
  selected: Entity | null;
  searchOpen: boolean;
  searchResults: SearchResult[];
  searchBusy: boolean;

  // --- Toasts ---
  toasts: Toast[];

  /** Bumped by the manual refresh button; MapView reacts to force a re-fetch. */
  refreshNonce: number;

  // --- Actions ---
  setCompanies: (c: Company[]) => void;
  setCompaniesLoading: (v: boolean) => void;
  addBusinesses: (list: Business[]) => void;
  clearBusinesses: () => void;
  /** Drop businesses outside the given bounds (viewport unload). */
  pruneBusinesses: (b: LngLatBounds) => void;
  setView: (v: { tier: ViewTier; zoom: number; center: { lng: number; lat: number } }) => void;
  setLive: (s: LiveStatus) => void;
  markSynced: () => void;
  setVisibleCount: (n: number) => void;
  select: (e: Entity | null) => void;
  setSearch: (p: Partial<Pick<AppState, 'searchOpen' | 'searchResults' | 'searchBusy'>>) => void;
  pushToast: (message: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
  requestRefresh: () => void;
}

let toastSeq = 1;

export const useStore = create<AppState>((set) => ({
  companies: [],
  companiesLoading: true,
  businesses: new Map(),

  tier: 'ORBIT',
  zoom: 1.6,
  center: { lng: 8, lat: 28 },

  live: 'idle',
  lastSync: null,
  visibleCount: 0,

  selected: null,
  searchOpen: false,
  searchResults: [],
  searchBusy: false,

  toasts: [],
  refreshNonce: 0,

  setCompanies: (companies) => set({ companies, companiesLoading: false }),
  setCompaniesLoading: (companiesLoading) => set({ companiesLoading }),
  addBusinesses: (list) =>
    set((s) => {
      if (!list.length) return s;
      const next = new Map(s.businesses);
      for (const b of list) next.set(b.id, b);
      // Guard against unbounded growth across a long session.
      if (next.size > 8000) {
        const keys = [...next.keys()].slice(0, next.size - 8000);
        for (const k of keys) next.delete(k);
      }
      return { businesses: next };
    }),
  clearBusinesses: () => set({ businesses: new Map() }),
  pruneBusinesses: (b) =>
    set((s) => {
      const next = new Map<string, Business>();
      for (const [id, biz] of s.businesses) {
        const inLon = b.west <= b.east ? biz.lon >= b.west && biz.lon <= b.east : biz.lon >= b.west || biz.lon <= b.east;
        if (inLon && biz.lat >= b.south && biz.lat <= b.north) next.set(id, biz);
      }
      return next.size === s.businesses.size ? s : { businesses: next };
    }),
  setView: ({ tier, zoom, center }) => set({ tier, zoom, center }),
  setLive: (live) => set({ live }),
  markSynced: () => set({ lastSync: Date.now() }),
  setVisibleCount: (visibleCount) => set({ visibleCount }),
  select: (selected) => set({ selected }),
  setSearch: (p) => set(p),
  pushToast: (message, kind = 'info') =>
    set((s) => ({ toasts: [...s.toasts, { id: toastSeq++, message, kind }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  requestRefresh: () => set((s) => ({ refreshNonce: s.refreshNonce + 1 })),
}));
