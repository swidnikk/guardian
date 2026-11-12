// Shell team tests (B-04..B-08). Usage: node test/shell.browser.test.mjs <dist dir>
// Serves the build at "/" and at "/guardian/" (Pages sub-path) from one local server, drives headless Chrome over http.
import puppeteer from 'puppeteer-core'; import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const dist = path.resolve(process.argv[2] || '../dist-real');
const axeSrc = fs.readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.sqlite': 'application/octet-stream', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split('?')[0]).replace(/^\/guardian(?=\/)/, ''); if (u.endsWith('/')) u += 'index.html';
  const f = path.join(dist, u); if (!f.startsWith(dist)) { r.writeHead(403).end(); return; }
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404).end('nf'); return; } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }).end(d); });
}).listen(0, '127.0.0.1');
await new Promise((r) => srv.on('listening', r));
const port = srv.address().port;
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const axe = async (p, label) => { await p.evaluate(axeSrc); const r = await p.evaluate(() => axe.run()); ok(r.violations.length === 0, `axe 0 violations ${label} ${r.violations.map((v) => v.id + ' x' + v.nodes.length).join(',')}`); };
const TITLE = 'Guardian Methodology Library';
const ROUTES = [['', TITLE], ['health/', TITLE + ' / Health'], ['advanced/', TITLE + ' / Advanced Search'], ['about/', TITLE + ' / About']];
const detail = (JSON.parse(fs.readFileSync(path.join(dist, 'data/catalog.json'), 'utf8')).policies[0]).id;

for (const base of ['/', '/guardian/']) {
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 900 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  for (const [route, title] of ROUTES) {
    await p.goto(`http://127.0.0.1:${port}${base}${route}`); await sleep(300);
    const t = base + route;
    ok((await p.title()) === title, `${t} title "${title}"`);
    ok(!/cairn/i.test(await p.evaluate(() => document.documentElement.outerHTML.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, ''))), `${t} no visible "Cairn"`);
    ok(await p.evaluate(() => !!document.querySelector('meta[name=robots][content*=noindex]')), `${t} noindex`);
    const abs = await p.evaluate(() => [...document.querySelectorAll('a[href],script[src],link[href]')].map((e) => e.getAttribute('href') || e.getAttribute('src')).filter((h) => h.startsWith('/') && !h.startsWith('//')));
    ok(abs.length === 0, `${t} no root-absolute links ${abs.join(',')}`);
    const intro = await p.evaluate(() => document.querySelector('.shell-intro')?.textContent.trim() || '');
    const want = route === '' || route === 'about/';
    ok(want ? intro.length > 40 : intro === '', `${t} intro ${want ? 'present' : 'absent'}`);
    const nav = await p.evaluate(() => ({ cur: [...document.querySelectorAll('nav [aria-current=page]')].map((a) => (a.querySelector('.nav-ttl') || a).textContent.trim()), group: document.getElementById('nav-catalog-btn')?.classList.contains('is-current'), dl: !!document.querySelector('nav a[download]') }));
    const exp = { '': ['Catalog'], 'health/': ['Health'], 'advanced/': ['Advanced Search'], 'about/': ['About'] }[route];
    ok(JSON.stringify(nav.cur) === JSON.stringify(exp), `${t} aria-current ${nav.cur}`);
    ok(nav.group === (route !== 'about/'), `${t} trigger active state`);
    ok(!nav.dl, `${t} no download links in nav`);
    await axe(p, `${t} (closed)`);
    await p.click('#nav-catalog-btn'); await sleep(100);
    ok(await p.evaluate(() => document.getElementById('nav-catalog-btn').getAttribute('aria-expanded') === 'true' && !document.getElementById('nav-catalog-menu').hidden), `${t} opens on click`);
    await axe(p, `${t} (menu open)`);
  }
  // keyboard behaviour on the catalogue page
  await p.goto(`http://127.0.0.1:${port}${base}`); await sleep(300);
  await p.focus('#nav-catalog-btn');
  const st = () => p.evaluate(() => ({ exp: document.getElementById('nav-catalog-btn').getAttribute('aria-expanded'), hid: document.getElementById('nav-catalog-menu').hidden, act: document.activeElement.id || (document.activeElement.querySelector('.nav-ttl') || document.activeElement).textContent.trim() }));
  let s = await st(); ok(s.exp === 'false' && s.hid, `${base} starts closed`);
  await p.keyboard.press('ArrowDown'); s = await st(); ok(s.exp === 'true' && s.act === 'Catalog', `${base} ArrowDown opens, focuses first entry (${s.act})`);
  await p.keyboard.press('ArrowDown'); s = await st(); ok(s.act === 'Health', `${base} ArrowDown moves (${s.act})`);
  await p.keyboard.press('End'); s = await st(); ok(s.act === 'Advanced Search', `${base} End (${s.act})`);
  await p.keyboard.press('ArrowDown'); s = await st(); ok(s.act === 'Catalog', `${base} wraps (${s.act})`);
  await p.keyboard.press('Home'); await p.keyboard.press('Escape'); s = await st(); ok(s.exp === 'false' && s.hid && s.act === 'nav-catalog-btn', `${base} Escape closes, focus returns (${s.act})`);
  await p.keyboard.press('Enter'); s = await st(); ok(s.exp === 'true', `${base} Enter on trigger opens`);
  await p.keyboard.press('Escape'); await p.keyboard.press('Space'); s = await st(); ok(s.exp === 'true', `${base} Space on trigger opens`);
  await p.mouse.click(600, 600); s = await st(); ok(s.exp === 'false', `${base} outside click closes`);
  await p.keyboard.press('Escape');
  // narrow width: title stays larger than nav links, no horizontal overflow
  for (const w of [1280, 390]) {
    await p.setViewport({ width: w, height: 800 });
    const m = await p.evaluate(() => ({ t: parseFloat(getComputedStyle(document.querySelector('.shell-title')).fontSize), n: parseFloat(getComputedStyle(document.querySelector('.nav-trigger')).fontSize), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    ok(m.t > m.n, `${base} @${w}px title ${m.t}px > nav ${m.n}px`); ok(m.sw <= m.cw, `${base} @${w}px no horizontal overflow (${m.sw}/${m.cw})`);
  }
  await p.setViewport({ width: 1280, height: 900 });
  // About content
  await p.goto(`http://127.0.0.1:${port}${base}about/`);
  const ab = await p.evaluate(() => [...document.querySelectorAll('main a[href^=http]')].map((a) => [a.closest('section,div,li')?.querySelector('h2,h3')?.textContent.trim(), a.textContent.replace(/\s*\(external link[^)]*\)/, "").trim(), a.href, a.rel]));
  const exp3 = [['Learn more about the Hedera Guardian?', 'View the latest platform updates', 'https://guardian.hedera.com/updates'], ['Interested to contribute or download the latest release?', 'Visit GitHub', 'https://github.com/hashgraph/guardian'], ['Have feedback or suggestion?', 'Share here', 'https://tiny.cc/grd-feedback']];
  ok(ab.length === 3 && exp3.every((e, i) => ab[i][0] === e[0] && ab[i][1] === e[1] && ab[i][2] === e[2] && /noopener/.test(ab[i][3]) && /noreferrer/.test(ab[i][3])), `${base}about three blocks, exact wording, URLs, rel (${JSON.stringify(ab)})`);
  // Advanced: downloads, summary above the box, query works, results as text
  await p.goto(`http://127.0.0.1:${port}${base}advanced/`); await sleep(1500);
  const adv = await p.evaluate(() => { const l = [...document.querySelectorAll('main a[download]')]; const s = document.querySelector('.shell-summary'), q = document.getElementById('sqlq'); return { links: l.map((a) => [a.textContent.trim(), a.href]), order: !!(s && q && (s.compareDocumentPosition(q) & Node.DOCUMENT_POSITION_FOLLOWING)), sib: s && q && (() => { let n = s.nextElementSibling; while (n && !n.contains(q) && n !== q) n = n.nextElementSibling; return !!n; })(), sum: s?.textContent || '' }; });
  ok(adv.links.some((l) => /^Download catalog\.json/.test(l[0])) && adv.links.some((l) => /^Download library\.sqlite/.test(l[0])), `${base}advanced download labels`);
  for (const [, href] of adv.links) { const r = await p.evaluate(async (h) => { const x = await fetch(h); return [x.status, (await x.arrayBuffer()).byteLength]; }, href); const f = path.join(dist, 'data', href.split('/').pop()); ok(r[0] === 200 && r[1] === fs.statSync(f).size, `${base}download ${href.split('/').pop()} bytes match (${r[1]})`); }
  ok(adv.order && adv.sib, `${base}summary sits above the SQL box`);
  const rep = JSON.parse(fs.readFileSync(path.join(dist, 'build-report.json'), 'utf8'));
  ok(adv.sum.includes(String(rep.manifests_found)) && adv.sum.includes(String(rep.valid)), `${base}summary shows build numbers (${rep.manifests_found}/${rep.valid})`);
  await p.type('#sqlq', ' '); await p.click('#run'); await sleep(500);
  ok(await p.evaluate(() => document.querySelectorAll('#sqlout table tr').length > 1), `${base}sql query runs`);
  await p.evaluate(() => { document.getElementById('sqlq').value = "select '<img src=x onerror=window.__x=1>' as c"; }); await p.click('#run'); await sleep(300);
  ok(await p.evaluate(() => !document.querySelector('#sqlout img') && !window.__x), `${base}sql results are text, not HTML`);
  await axe(p, `${base}advanced (after query)`);
  // detail page and sql redirect stub
  await p.goto(`http://127.0.0.1:${port}${base}p/${detail}/`); ok((await p.title()).startsWith(TITLE + ' / '), `${base}detail title`);
  await axe(p, `${base}detail`);
  await p.goto(`http://127.0.0.1:${port}${base}sql/`); await sleep(800); ok(p.url().endsWith(`${base}advanced/index.html`), `${base}sql/ redirects to advanced (${p.url()})`);
  ok(errs.length === 0, `${base}no page errors ${errs.join('|')}`);
  await p.close();
}
// JS off: nav links still reachable, intro visible
const p = await b.newPage(); await p.setJavaScriptEnabled(false); await p.goto(`http://127.0.0.1:${port}/about/`);
ok(await p.evaluate(() => [...document.querySelectorAll('#nav-catalog-menu a')].every((a) => a.offsetParent !== null) && !!document.querySelector('.shell-intro')), 'JS off: dropdown entries visible as plain links, intro shown');
await b.close(); srv.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASSED'); process.exit(fail ? 1 : 0);
