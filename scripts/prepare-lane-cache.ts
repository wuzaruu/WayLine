import fs from 'node:fs';
import { shapeSignature, type LaneCorrectionCatalog } from '../src/lib/lane-corrections';
import type { RouteIndex, Variant } from '../src/types';
const index: RouteIndex = JSON.parse(fs.readFileSync('public/data/routes.json', 'utf8'));
const file = 'public/data/lane-corrections.json';
const previous: LaneCorrectionCatalog | null = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
const catalog: LaneCorrectionCatalog = { schemaVersion: 1, feedVersion: index.version, routes: {} };
for (const route of index.routes) {
  const data: { variants: Variant[] } = JSON.parse(fs.readFileSync(`public/data/${route.id}.json`, 'utf8'));
  catalog.routes[route.id] = { number: route.number, variants: {} };
  for (const variant of data.variants) {
    const signature = shapeSignature(variant.path), retained = previous?.routes[route.id]?.variants[variant.id];
    catalog.routes[route.id].variants[variant.id] = retained?.shapeSignature === signature ? retained : { reviewStatus: 'pending', shapeSignature: signature, path: [], source: null, reviewedAt: null };
  }
}
fs.writeFileSync(file, JSON.stringify(catalog, null, 2) + '\n');
const variants = Object.values(catalog.routes).flatMap(route => Object.values(route.variants));
console.log(JSON.stringify({ routes: index.routes.length, variants: variants.length, verified: variants.filter(v => v.reviewStatus === 'verified').length, file }));
