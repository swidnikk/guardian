// Deterministic build-time SVG thumbnails (400x300). No network, no fonts fetched, no randomness: same manifest -> same bytes.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const ICON = {
  'carbon-credits': 'M5 19c0-8 5-14 14-14 0 9-6 14-14 14zM5 19c3-5 6-8 10-10',
  'emission-reporting': 'M4 20V10m6 10V4m6 16v-7',
  'renewable-energy': 'M13 2 4 14h7l-1 8 9-12h-7z',
  'supply-chain': 'M3 7h6v6H3zM15 11h6v6h-6zM9 10h3a3 3 0 0 1 3 3',
  'sustainable-agriculture': 'M12 21v-9M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 14c0-3 2-5 6-5 0 3-2 5-6 5z',
  water: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z',
  biodiversity: 'M12 3l6 9h-4l5 7H5l5-7H6zM12 19v3',
  waste: 'M4 8h16M9 8V5h6v3M6 8l1 12h10l1-12',
  other: 'M12 3l9 5v8l-9 5-9-5V8z',
};
function pattern(type, id) {
  const w = '#ffffff', o = 'opacity="0.13"';
  switch (type) {
    case 'standard-implementation': return `<pattern id="${id}" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="${w}" stroke-width="1.5" ${o}/></pattern>`;
    case 'novel-methodology': return `<pattern id="${id}" width="36" height="36" patternUnits="userSpaceOnUse"><circle cx="18" cy="18" r="5" fill="${w}" ${o}/></pattern>`;
    case 'mrv-template': return `<pattern id="${id}" width="48" height="48" patternUnits="userSpaceOnUse"><rect x="6" y="6" width="36" height="36" fill="none" stroke="${w}" stroke-width="2" stroke-dasharray="6 6" ${o}/></pattern>`;
    case 'proof-of-concept': return `<pattern id="${id}" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="24" fill="${w}" ${o}/></pattern>`;
    case 'toolkit': return `<pattern id="${id}" width="44" height="38" patternUnits="userSpaceOnUse"><path d="M0 38 22 0 44 38z" fill="none" stroke="${w}" stroke-width="1.5" ${o}/></pattern>`;
    default: return `<pattern id="${id}" width="60" height="20" patternUnits="userSpaceOnUse"><path d="M0 10Q15 0 30 10T60 10" fill="none" stroke="${w}" stroke-width="2" ${o}/></pattern>`;
  }
}
export function thumbSvg(p) {
  const h1 = hash(p.category) % 360, h2 = (h1 + 30 + (hash(p.standard_body || 'x') % 60)) % 360;
  const label = p.standard_body || 'Unspecified standard body';
  const bigRaw = String(p.methodology_id || p.name || ''); const big = bigRaw.length > 22 ? bigRaw.slice(0, 21) + '…' : bigRaw; const bigSize = big.length > 14 ? 24 : 34;
  const pid = 'p' + hash(p.id).toString(36);
  const icon = ICON[p.category] || ICON.other;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300" role="img"><title>${esc(p.category)} · ${esc(p.policy_type)} · ${esc(label)}</title>
<defs><linearGradient id="g${pid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h1} 55% 28%)"/><stop offset="1" stop-color="hsl(${h2} 60% 40%)"/></linearGradient>${pattern(p.policy_type, pid)}</defs>
<rect width="400" height="300" fill="url(#g${pid})"/><rect width="400" height="300" fill="url(#${pid})"/>
<g transform="translate(36 40) scale(5)" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"><path d="${icon}"/></g>
<text x="24" y="262" font-family="system-ui,Segoe UI,Roboto,sans-serif" font-size="${bigSize}" font-weight="700" fill="#fff">${esc(big)}</text>
<text x="24" y="285" font-family="system-ui,Segoe UI,Roboto,sans-serif" font-size="14" fill="#fff" opacity="0.88">${esc(label.slice(0, 40))}</text>
<text x="376" y="30" text-anchor="end" font-family="system-ui,sans-serif" font-size="12" fill="#fff" opacity="0.8">${esc(p.policy_type)}</text></svg>`;
}
