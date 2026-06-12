// Live smoke test for the data sources (run with `node scripts/smoke.mjs`).
const MIN = 12, LIMIT = 50; // small limit for a quick check

const sparql = `
SELECT ?company ?companyLabel ?coord ?website ?sitelinks WHERE {
  {
    SELECT ?company ?sitelinks WHERE {
      ?company wdt:P31/wdt:P279* wd:Q4830453 ;
               wdt:P159 ?anyHq ;
               wikibase:sitelinks ?sitelinks .
      FILTER(?sitelinks >= ${MIN})
    } ORDER BY DESC(?sitelinks) LIMIT ${LIMIT}
  }
  ?company wdt:P159 ?hq . ?hq wdt:P625 ?coord .
  OPTIONAL { ?company wdt:P856 ?website . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". ?company rdfs:label ?companyLabel. }
}`.trim();

async function testWikidata() {
  const t = Date.now();
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;
  const res = await fetch(url, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'TerrafirmSmoke/1.0' } });
  const j = await res.json();
  const b = j.results.bindings;
  console.log(`Wikidata: ${res.status} in ${Date.now() - t}ms, ${b.length} rows. sample:`,
    b.slice(0, 3).map((x) => x.companyLabel?.value));
}

async function testOverpass() {
  const t = Date.now();
  // tiny bbox in central Mumbai
  const q = `[out:json][timeout:20];(node["amenity"~"cafe|restaurant"]["name"](19.06,72.82,19.08,72.84););out center 20;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST', body: 'data=' + encodeURIComponent(q),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const j = await res.json();
  console.log(`Overpass: ${res.status} in ${Date.now() - t}ms, ${j.elements.length} elements. sample:`,
    j.elements.slice(0, 3).map((e) => e.tags?.name));
}

await testWikidata().catch((e) => console.log('Wikidata FAILED:', e.message));
await testOverpass().catch((e) => console.log('Overpass FAILED:', e.message));
