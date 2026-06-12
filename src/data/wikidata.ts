// Wikidata SPARQL: fetch the top ~N companies by sitelink count, with HQ coords,
// website, industry, employees, inception, and logo. Cached in IndexedDB (24h).

import { CONFIG } from '../config';
import type { Company } from '../types';
import { cacheGet, cacheSet } from './cache';
import { commonsThumb, domainFromUrl } from './logos';

const CACHE_KEY = `wikidata:companies:v2:${CONFIG.companyLimit}:${CONFIG.minSitelinks}`;

/**
 * SPARQL. A lightweight inner SELECT first ranks companies by sitelinks (cheap,
 * indexed) and caps the set, then the outer query hydrates details. Keeping the
 * heavy property-path join inside the bounded subquery is what keeps this under
 * the WDQS 60s budget.
 */
export function buildSparql(): string {
  return `
SELECT ?company ?companyLabel ?coord ?website ?industryLabel ?employees ?inception ?logo ?sitelinks ?hqLabel WHERE {
  {
    SELECT ?company ?sitelinks WHERE {
      ?company wdt:P31/wdt:P279* wd:Q4830453 ;
               wdt:P159 ?anyHq ;
               wikibase:sitelinks ?sitelinks .
      FILTER(?sitelinks >= ${CONFIG.minSitelinks})
    }
    ORDER BY DESC(?sitelinks)
    LIMIT ${CONFIG.companyLimit}
  }
  ?company wdt:P159 ?hq .
  ?hq wdt:P625 ?coord .
  OPTIONAL { ?company wdt:P856 ?website . }
  OPTIONAL { ?company wdt:P452 ?industry . }
  OPTIONAL { ?company wdt:P1128 ?employees . }
  OPTIONAL { ?company wdt:P571 ?inception . }
  OPTIONAL { ?company wdt:P154 ?logo . }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en,mul" .
    ?company rdfs:label ?companyLabel .
    ?industry rdfs:label ?industryLabel .
    ?hq rdfs:label ?hqLabel .
  }
}`.trim();
}

interface SparqlBinding {
  [key: string]: { type: string; value: string; 'xml:lang'?: string } | undefined;
}

/** Parse a WKT "Point(lon lat)" literal. */
function parsePoint(wkt: string): { lon: number; lat: number } | null {
  const m = wkt.match(/Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i);
  if (!m) return null;
  return { lon: parseFloat(m[1]), lat: parseFloat(m[2]) };
}

/** Pure transform: SPARQL bindings → deduped, ranked Company[]. Unit-testable. */
export function bindingsToCompanies(bindings: SparqlBinding[]): Company[] {
  const byId = new Map<string, Company>();

  for (const b of bindings) {
    const uri = b.company?.value;
    const coordRaw = b.coord?.value;
    const name = b.companyLabel?.value;
    if (!uri || !coordRaw || !name) continue;

    const pt = parsePoint(coordRaw);
    if (!pt) continue;
    if (Math.abs(pt.lat) > 90 || Math.abs(pt.lon) > 180) continue;

    const qid = uri.split('/').pop()!;
    const id = `wd:${qid}`;
    if (byId.has(id)) continue; // first row wins (highest-ranked due to ORDER BY)

    const website = b.website?.value;
    const employeesRaw = b.employees?.value;
    const logoUrl = b.logo?.value ? commonsThumb(b.logo.value) : undefined;

    byId.set(id, {
      id,
      kind: 'company',
      wikidataId: qid,
      name,
      lat: pt.lat,
      lon: pt.lon,
      website,
      domain: domainFromUrl(website),
      logoUrl,
      industry: b.industryLabel?.value && !b.industryLabel.value.startsWith('http') ? b.industryLabel.value : undefined,
      employees: employeesRaw ? Math.round(parseFloat(employeesRaw)) : undefined,
      inception: b.inception?.value,
      hqLabel: b.hqLabel?.value && !b.hqLabel.value.startsWith('http') ? b.hqLabel.value : undefined,
      sitelinks: b.sitelinks?.value ? parseInt(b.sitelinks.value, 10) : 0,
      rank: 0, // assigned below
    });
  }

  const companies = [...byId.values()].sort((a, b) => b.sitelinks - a.sitelinks);
  companies.forEach((c, i) => (c.rank = i));
  return companies;
}

async function runQuery(signal?: AbortSignal): Promise<Company[]> {
  const url = `${CONFIG.wikidataEndpoint}?format=json&query=${encodeURIComponent(buildSparql())}`;
  const res = await fetch(url, {
    signal,
    headers: { Accept: 'application/sparql-results+json' },
  });
  if (!res.ok) throw new Error(`Wikidata ${res.status}`);
  const json = (await res.json()) as { results?: { bindings?: SparqlBinding[] } };
  return bindingsToCompanies(json.results?.bindings ?? []);
}

/**
 * Instant company data: the 24h IndexedDB cache if present, otherwise the real
 * snapshot bundled with the app (public/companies.seed.json). Either way search
 * works immediately — no waiting ~40s on the live SPARQL endpoint at startup.
 */
export async function loadCompaniesFast(): Promise<{ companies: Company[]; fromCache: boolean }> {
  const cached = await cacheGet<Company[]>(CACHE_KEY);
  if (cached && cached.length) return { companies: cached, fromCache: true };

  try {
    const res = await fetch(`${import.meta.env.BASE_URL}companies.seed.json`);
    if (res.ok) return { companies: (await res.json()) as Company[], fromCache: false };
  } catch {
    /* offline / missing seed — fall through */
  }
  return { companies: [], fromCache: false };
}

/**
 * Live refresh from Wikidata, run in the background. Updates the 24h cache so the
 * next visit is instant and fresh. Returns [] on failure (the snapshot stands in).
 */
export async function refreshCompanies(signal?: AbortSignal): Promise<Company[]> {
  const companies = await runQuery(signal);
  if (companies.length) await cacheSet(CACHE_KEY, companies, CONFIG.wikidataCacheTTL);
  return companies;
}
