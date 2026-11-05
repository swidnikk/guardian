// Shared sector fallback art (B-03b/c). The 8 text-free SVGs live in assets/sector-art/ (made once by scripts/make-sector-art.mjs, replaceable).
// Cards never get a per-policy image for the fallback: the catalog page carries one CSS rule per sector (8 data: URIs once), cards just use a class.
import fs from 'node:fs';
import path from 'node:path';
export const SECTORS = ['energy', 'agriculture', 'waste', 'land-use', 'industrial', 'transport', 'water'];
export function loadSectorArt(dir) {
  const uri = {};
  for (const name of [...SECTORS, 'unspecified']) {
    const f = path.join(dir, `${name}.svg`);
    if (fs.existsSync(f)) uri[name] = 'data:image/svg+xml;base64,' + fs.readFileSync(f).toString('base64');
  }
  const key = (sector) => (SECTORS.includes(sector) ? sector : 'unspecified'); // whitelist: manifest text never reaches a class name
  return {
    uri, key,
    artClass: (sector) => 'art-' + key(sector),
    css: Object.entries(uri).map(([n, u]) => `.art-${n}{background-image:url("${u}");background-size:cover;background-position:center}`).join('\n'),
  };
}
