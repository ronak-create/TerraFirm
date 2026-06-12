// Render scripts/og.svg → public/og.png (1200×630 social share card).
// Uses @resvg/resvg-js (pure-ish, no system libs). Run: node scripts/build-og.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(join(here, 'og.svg'), 'utf8');

const { Resvg } = await import('@resvg/resvg-js');
const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } });
const png = resvg.render().asPng();
writeFileSync(join(here, '..', 'public', 'og.png'), png);
console.log(`og.png written (${(png.length / 1024).toFixed(0)} KB)`);
