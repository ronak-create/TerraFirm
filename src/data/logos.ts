// Logo resolution + a never-broken monogram fallback, with an LRU image cache.

import { CONFIG } from '../config';

/** Extract a bare domain from a URL/string, or undefined if not parseable. */
export function domainFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url.includes('://') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

/** Keyless favicon service — works for any domain. */
export function faviconUrl(domain: string, size = 64): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

/** Wikimedia Commons file → a sized thumbnail via the Special:FilePath redirect. */
export function commonsThumb(fileUrl: string, width = 96): string | undefined {
  // P154 comes back as a full commons URL; grab the file name after the last slash.
  const match = fileUrl.match(/Special:FilePath\/(.+)$/) || fileUrl.match(/\/([^/]+)$/);
  const file = match?.[1];
  if (!file) return undefined;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
    decodeURIComponent(file)
  )}?width=${width}`;
}

const PALETTE = ['#27e0c8', '#f5a623', '#7aa2ff', '#ff7ab6', '#9ad36b', '#ffd166', '#c792ea'];

/** Deterministic accent colour for a string (used by monograms). */
export function colorForKey(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** A self-contained SVG data URL monogram — guaranteed to render. */
export function monogramDataUrl(name: string, key = name): string {
  const accent = colorForKey(key);
  const text = initials(name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
    <rect width="64" height="64" rx="14" fill="#0d141d"/>
    <rect width="64" height="64" rx="14" fill="none" stroke="${accent}" stroke-opacity="0.5" stroke-width="2"/>
    <text x="32" y="40" font-family="ui-sans-serif,system-ui,sans-serif" font-size="24"
      font-weight="700" fill="${accent}" text-anchor="middle">${text}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Resolve the best logo URL for an entity:
 * 1. explicit logoUrl (Wikidata P154 thumb), 2. favicon by domain, 3. monogram.
 */
export function resolveLogo(opts: {
  name: string;
  logoUrl?: string;
  domain?: string;
  key?: string;
  /** Set false to skip the favicon service and go straight to a monogram. */
  useFavicon?: boolean;
}): string {
  if (opts.logoUrl) return opts.logoUrl;
  if (opts.domain && opts.useFavicon !== false) return faviconUrl(opts.domain);
  return monogramDataUrl(opts.name, opts.key ?? opts.name);
}

// --- LRU cache of successfully-loaded image URLs (string keys only) -------------
const lru = new Map<string, boolean>();

export function rememberLoaded(url: string): void {
  if (lru.has(url)) lru.delete(url);
  lru.set(url, true);
  if (lru.size > CONFIG.logoCacheSize) {
    const oldest = lru.keys().next().value;
    if (oldest !== undefined) lru.delete(oldest);
  }
}

export function wasLoaded(url: string): boolean {
  return lru.has(url);
}
