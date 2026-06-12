// Build-time generator: exports a real snapshot of the top companies from Wikidata
// to public/companies.seed.json, so the app has instant, searchable data on first
// load (then refreshes live from Wikidata in the background).
//
//   node scripts/build-companies.mjs
//
import { writeFile } from 'node:fs/promises';

// Bigger + a lower prominence floor than the live runtime query: this snapshot is
// downloaded once and cached, so we can afford a richer set. More companies →
// regional zoom levels actually have markers to show, instead of vast empty areas.
const MIN_SITELINKS = 6;
const LIMIT = 6000;

const QUERY = `
SELECT ?company ?companyLabel ?coord ?website ?industryLabel ?employees ?inception ?logo ?sitelinks ?hqLabel WHERE {
  {
    SELECT ?company ?sitelinks WHERE {
      ?company wdt:P31/wdt:P279* wd:Q4830453 ;
               wdt:P159 ?anyHq ; wikibase:sitelinks ?sitelinks .
      FILTER(?sitelinks >= ${MIN_SITELINKS})
    } ORDER BY DESC(?sitelinks) LIMIT ${LIMIT}
  }
  ?company wdt:P159 ?hq . ?hq wdt:P625 ?coord .
  OPTIONAL { ?company wdt:P856 ?website . }
  OPTIONAL { ?company wdt:P452 ?industry . }
  OPTIONAL { ?company wdt:P1128 ?employees . }
  OPTIONAL { ?company wdt:P571 ?inception . }
  OPTIONAL { ?company wdt:P154 ?logo . }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en,mul" .
    ?company rdfs:label ?companyLabel . ?industry rdfs:label ?industryLabel . ?hq rdfs:label ?hqLabel .
  }
}`.trim();

const v = (b, k) => b[k]?.value;
const parsePoint = (wkt) => {
  const m = wkt?.match(/Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i);
  return m ? { lon: +m[1], lat: +m[2] } : null;
};
const domainFromUrl = (url) => {
  if (!url) return undefined;
  try {
    return new URL(url.includes('://') ? url : `https://${url}`).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
};
const commonsThumb = (fileUrl, width = 96) => {
  if (!fileUrl) return undefined;
  const m = fileUrl.match(/Special:FilePath\/(.+)$/) || fileUrl.match(/\/([^/]+)$/);
  if (!m) return undefined;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(decodeURIComponent(m[1]))}?width=${width}`;
};

console.log(`Querying Wikidata for top ${LIMIT} companies…`);
const t = Date.now();
const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(QUERY)}`;
const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'TerrafirmBuild/1.0 (build-time snapshot)' } });
if (!res.ok) throw new Error(`Wikidata ${res.status}`);
const { results } = await res.json();
console.log(`  → ${results.bindings.length} rows in ${Date.now() - t}ms`);

// Merge rows per company, taking the first non-empty value of each field.
const byId = new Map();
for (const b of results.bindings) {
  const uri = v(b, 'company');
  const name = v(b, 'companyLabel');
  const pt = parsePoint(v(b, 'coord'));
  if (!uri || !name || !pt) continue;
  if (Math.abs(pt.lat) > 90 || Math.abs(pt.lon) > 180) continue;
  const qid = uri.split('/').pop();
  const id = `wd:${qid}`;
  let c = byId.get(id);
  if (!c) {
    c = { id, kind: 'company', wikidataId: qid, name, lat: pt.lat, lon: pt.lon, sitelinks: +(v(b, 'sitelinks') || 0), rank: 0 };
    byId.set(id, c);
  }
  const website = v(b, 'website');
  if (website && !c.website) {
    c.website = website;
    c.domain = domainFromUrl(website);
  }
  const ind = v(b, 'industryLabel');
  if (ind && !ind.startsWith('http') && !c.industry) c.industry = ind;
  const emp = v(b, 'employees');
  if (emp && !c.employees) c.employees = Math.round(+emp);
  const inc = v(b, 'inception');
  if (inc && !c.inception) c.inception = inc;
  const logo = v(b, 'logo');
  if (logo && !c.logoUrl) c.logoUrl = commonsThumb(logo);
  const hq = v(b, 'hqLabel');
  if (hq && !hq.startsWith('http') && !c.hqLabel) c.hqLabel = hq;
}

const companies = [...byId.values()].sort((a, b) => b.sitelinks - a.sitelinks);
companies.forEach((c, i) => (c.rank = i));

const out = new URL('../public/companies.seed.json', import.meta.url);
await writeFile(out, JSON.stringify(companies));
console.log(`Wrote ${companies.length} companies → public/companies.seed.json (${(JSON.stringify(companies).length / 1e3).toFixed(0)} KB)`);
