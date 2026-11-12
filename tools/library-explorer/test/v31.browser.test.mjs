// B-11 (value links) and B-12 (title bar, pinned header, docs look). Usage: node test/v31.browser.test.mjs <dist dir> [screenshot dir]
// Serves the build at "/" and "/guardian/" from one local server and drives headless Chrome over http.
import puppeteer from 'puppeteer-core'; import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const dist = path.resolve(process.argv[2] || '../dist-real'); const shots = process.argv[3];
const axeSrc = fs.readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.sqlite': 'application/octet-stream' };
const srv = http.createServer((q, r) => {
  let u = decodeURIComponent(q.url.split('?')[0]).replace(/^\/guardian(?=\/)/, ''); if (u.endsWith('/')) u += 'index.html';
  const f = path.join(dist, u); if (!f.startsWith(dist)) { r.writeHead(403).end(); return; }
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404).end('nf'); return; } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }).end(d); });
}).listen(0, '127.0.0.1');
await new Promise((r) => srv.on('listening', r));
const port = srv.address().port;
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const axe = async (p, label) => { await p.evaluate(axeSrc); const r = await p.evaluate(() => axe.run()); ok(r.violations.length === 0, `axe 0 violations ${label} ${r.violations.map((v) => v.id + ' x' + v.nodes.length).join(',')}`); };
const lum = (rgb) => { const c = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b2) => { const x = lum(a), y = lum(b2); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const cat = JSON.parse(fs.readFileSync(path.join(dist, 'data/catalog.json'), 'utf8')).policies;
const detail = cat[0].id;
const ready = (p) => p.waitForSelector('html[data-ready="1"]');
const state = (p) => p.evaluate(() => ({ url: location.pathname + location.search, count: document.getElementById('count').textContent, ann: document.getElementById('announce').textContent, vis: [...document.querySelectorAll('#grid .card')].filter((c) => !c.hidden).length, chips: [...document.querySelectorAll('.facet-chip span')].map((s) => s.textContent) }));

for (const base of ['/', '/guardian/']) {
  const U = (r) => `http://127.0.0.1:${port}${base}${r}`;
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const ext = []; p.on('request', (r) => { if (!r.url().startsWith(`http://127.0.0.1:${port}`) && !r.url().startsWith('data:')) ext.push(r.url()); });
  await p.goto(U('')); await ready(p);
  // ---- B-12 title bar
  const hb = await p.evaluate(() => { const g = document.querySelector('.shell-guardian'), l = document.querySelector('.shell-library'), img = g.querySelector('img'); const fs = (e) => parseFloat(getComputedStyle(e).fontSize);
    return { gHref: g.getAttribute('href'), gRel: g.rel, lHref: l.getAttribute('href'), text: document.querySelector('.shell-brand').textContent.replace(/\s+/g, ' ').trim(), alt: img.getAttribute('alt'), iw: img.getBoundingClientRect().width, src: img.src.slice(0, 22), font: fs(document.querySelector('.shell-title')), logoLeft: img.getBoundingClientRect().left < document.querySelector('.shell-title').getBoundingClientRect().left, tag: !!document.querySelector('.shell-intro') }; });
  ok(hb.gHref === 'https://guardian.hedera.com' && /noopener/.test(hb.gRel) && /noreferrer/.test(hb.gRel), `${base} "Hedera Guardian" links to guardian.hedera.com with rel noopener noreferrer`);
  ok(hb.lHref === 'index.html', `${base} "Methodology Library" links to the catalog (relative: ${hb.lHref})`);
  ok(hb.text === 'Hedera Guardian / Methodology Library', `${base} title text (${hb.text})`);
  ok(hb.alt === '' && hb.iw === 32 && hb.logoLeft && hb.src.startsWith('data:image/png'), `${base} logo: empty alt, 32px, left of the text, inlined data URI`);
  ok(hb.font >= 19 && hb.font <= 21, `${base} title ~20px (${hb.font})`);
  const fam = await p.evaluate(() => getComputedStyle(document.body).fontFamily); ok(!/inter/i.test(fam) && /system-ui/.test(fam), `${base} system font stack (${fam.slice(0, 40)})`);
  // ---- B-12 sticky at 1280x800
  const before = await p.evaluate(() => document.getElementById('shell-sticky').getBoundingClientRect().height);
  await p.evaluate(() => scrollTo(0, 1800)); await sleep(150);
  const s1 = await p.evaluate(() => { const st = document.getElementById('shell-sticky').getBoundingClientRect(), f = document.getElementById('filters-details').getBoundingClientRect(), tok = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sticky-top')); const intro = document.querySelector('.shell-intro').getBoundingClientRect(); return { top: st.top, h: st.height, tok, ftop: f.top, introVis: intro.top >= 0 && intro.bottom <= st.bottom + 1, introText: getComputedStyle(document.querySelector('.shell-intro p')).whiteSpace, fbottom: f.bottom, vh: innerHeight, sm: getComputedStyle(document.getElementById('main')).scrollMarginTop }; });
  ok(s1.top === 0 && s1.introVis, `${base} @1280x800 header + nav + intro stay pinned after scrolling (top ${s1.top}, h ${Math.round(s1.h)})`);
  ok(Math.abs(s1.tok - (before + 12)) <= 1.5 && s1.ftop >= s1.h - 1 && s1.ftop <= s1.tok + 2 && s1.fbottom <= s1.vh + 1, `${base} --sticky-top (${s1.tok}) = real header height ${Math.round(before)} + 12; filter panel sits below it (top ${Math.round(s1.ftop)})`);
  ok(s1.introText === 'normal', `${base} @1280x800 intro is shown in full`);
  ok(parseFloat(s1.sm) === s1.tok, `${base} scroll-margin-top follows --sticky-top (${s1.sm})`);
  await p.evaluate(() => { document.getElementById('main').scrollIntoView(); }); await sleep(100);
  ok(await p.evaluate(() => document.getElementById('main').getBoundingClientRect().top >= document.getElementById('shell-sticky').getBoundingClientRect().bottom - 1), `${base} scrollIntoView target is not hidden under the header`);
  if (shots) { await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path: `${shots}/v31-${base.replace(/\W/g, '')}-d-top.png` }); await p.evaluate(() => scrollTo(0, 1800)); await sleep(100); await p.screenshot({ path: `${shots}/v31-${base.replace(/\W/g, '')}-d-scrolled.png` }); }
  await p.evaluate(() => scrollTo(0, 0));
  // ---- B-11 markup: six values per card are real links with relative hrefs
  const m = await p.evaluate(() => [...document.querySelectorAll('#grid .card')].map((c) => ({ links: [...c.querySelectorAll('a.card-link')].map((a) => [a.dataset.filter, a.getAttribute('href'), a.dataset.value]), sector: c.dataset.sector })));
  ok(m.every((c) => c.links.every((l) => /^index\.html\?[a-z_]+=[^&=]+$/.test(l[1]) && !/^[a-z]+:|^\//.test(l[1]))), `${base} card value links are relative and URL-encoded`);
  ok(m.every((c) => ['category', 'standard_body', 'net', 'status', 'policy_type'].every((k) => c.links.some((l) => l[0] === k)) && (!c.sector || c.links.some((l) => l[0] === 'sector'))), `${base} every card links category, standard body, publication, status, policy type (and sector when set)`);
  // ---- click adds in place
  await p.evaluate(() => { window.__marker = 1; });
  const link = (k) => p.evaluateHandle((k) => [...document.querySelectorAll('#grid .card:not([hidden]) a.card-link')].find((a) => a.dataset.filter === k && a.dataset.value !== 'Unspecified'), k);
  const s0 = await state(p);
  let h = await link('sector'); const sv = await h.evaluate((a) => a.dataset.value); await h.click(); await sleep(450);
  let s = await state(p);
  ok(await p.evaluate(() => window.__marker === 1), `${base} click on a card value does not reload the page`);
  ok(s.url.includes('sector=' + encodeURIComponent(sv)) && s.vis < s0.vis && s.chips.length === 1, `${base} sector click adds filter in place (${s.url}, ${s.vis} cards)`);
  ok(/Added filter Sector/.test(s.ann) && s.ann.includes(s.count), `${base} click is announced in the live region: "${s.ann}"`);
  ok(await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('card-link') && document.activeElement.dataset.filter === 'sector'), `${base} focus stays on the clicked link`);
  h = await link('policy_type'); const tv = await h.evaluate((a) => a.dataset.value); await h.click(); await sleep(450); s = await state(p);
  ok(s.url.includes('sector=') && s.url.includes('policy_type=' + encodeURIComponent(tv)) && s.chips.length === 2, `${base} second click ADDS to the first (${s.url})`);
  ok(await p.evaluate(() => [...document.querySelectorAll('#grid .card')].every((c) => c.hidden || (c.dataset.policy_type && true))) && await p.evaluate(() => document.querySelector('.facet[data-facet=sector] input:checked') !== null), `${base} dropdown checkbox reflects the added value`);
  h = await link('net'); const nv = await h.evaluate((a) => a.dataset.value); await h.click(); await sleep(450); s = await state(p);
  ok(s.url.includes('net=' + nv) && await p.evaluate((v) => document.querySelector(`.facet[data-facet=net] input[value=${v}]`).checked, nv), `${base} publication link sets net=${nv} and the Publication facet reflects it`);
  await p.goBack(); await sleep(300); s = await state(p); ok(!s.url.includes('net='), `${base} back button undoes the last added value`);
  await axe(p, `${base} catalog after click-to-filter`);
  // ---- URL params on load
  for (const [q, sel] of [['net=mainnet', '.facet[data-facet=net] input[value=mainnet]'], ['net=testnet', '.facet[data-facet=net] input[value=testnet]'], ['net=none', '.facet[data-facet=net] input[value=none]']]) {
    await p.goto(U('index.html?' + q)); await ready(p); s = await state(p);
    const exp = await p.evaluate((v) => [...document.querySelectorAll('#grid .card')].filter((c) => c.dataset.net === v && !['deprecated', 'superseded'].includes(c.dataset.status)).length, q.split('=')[1]);
    ok(await p.$eval(sel, (e) => e.checked) && s.chips.length === 1, `${base} ?${q} read on load, Publication facet checked (${s.vis} cards)`);
    ok(s.vis === exp, `${base} ?${q} shows ${exp} cards (${s.vis})`);
  }
  for (const st of ['deprecated', 'superseded']) {
    await p.goto(U(`index.html?status=${st}`)); await ready(p); s = await state(p);
    ok(await p.$eval('#sw-' + st, (e) => e.checked) && s.vis === cat.filter((c) => c.status === st).length, `${base} ?status=${st} turns the ${st} switch on (${s.vis} cards)`);
  }
  // ---- keyboard + hover pill
  await p.goto(U('')); await ready(p);
  await p.focus('#grid .card:not([hidden]) a.card-link'); const k0 = await state(p);
  await p.keyboard.press('Enter'); await sleep(450); const k1 = await state(p);
  ok(k1.chips.length === 1 && k1.url !== k0.url, `${base} Enter on a focused value link applies the filter (${k1.url})`);
  const pill = await p.evaluate(() => { const a = document.activeElement, cs = getComputedStyle(a); return [cs.backgroundColor, cs.color, cs.outlineStyle, cs.textDecorationLine]; });
  ok(ratio(parse(pill[0]), parse(pill[1])) >= 4.5 && /rgb\((255, 255, 255|214, 228, 251)\)/.test(pill[0]) && pill[2] === 'solid', `${base} focused link shows a solid pill, contrast ${ratio(parse(pill[0]), parse(pill[1])).toFixed(1)}:1, focus ring ${pill[2]}`);
  await p.goto(U('')); await ready(p);
  const hov = [];
  for (const el of await p.$$('#grid .card:not([hidden]) a.card-link')) { if (hov.length >= 60) break; await el.hover(); hov.push(await el.evaluate((a) => { const cs = getComputedStyle(a); return [cs.backgroundColor, cs.color]; })); }
  ok(hov.length > 20 && hov.every(([bg, fg]) => /rgb\((255, 255, 255|214, 228, 251)\)/.test(bg) && ratio(parse(bg), parse(fg)) >= 4.5), `${base} hover pill is solid with >=4.5:1 text on ${hov.length} links over the art`);
  if (shots) { const el = await p.$('#grid .card:not([hidden]) a.card-link[data-filter=sector]'); await el.hover(); await p.screenshot({ path: `${shots}/v31-${base.replace(/\W/g, '')}-hover.png`, clip: { x: 330, y: 150, width: 620, height: 300 } }); }
  // ---- detail page
  await p.goto(U(`p/${detail}/`)); await sleep(200);
  const d = await p.evaluate(() => ({ chips: [...document.querySelectorAll('.dhead a.chip')].map((a) => a.getAttribute('href')), dl: [...document.querySelectorAll('dl.kv a.detail-link')].map((a) => a.getAttribute('href')), crumb: document.querySelector('.crumb a:last-of-type').getAttribute('href') }));
  const need = ['standard_body', 'status', 'policy_type', 'category', 'net'];
  ok(need.every((k) => d.chips.some((h2) => h2.startsWith('../../index.html?' + k + '='))), `${base} detail page links status, type, category, standards body, publication (${d.chips.length} chips)`);
  ok(d.dl.length >= 2 && d.dl.every((h2) => /^\.\.\/\.\.\/index\.html\?[a-z_]+=[^&]+$/.test(h2)), `${base} detail Details rows link to the filtered catalog (${d.dl.length})`);
  await axe(p, `${base} detail`);
  const first = d.chips.find((h2) => h2.includes('policy_type=')); await p.click(`.dhead a.chip[href="${first}"]`); await p.waitForSelector('html[data-ready="1"]');
  s = await state(p); ok(s.url.endsWith('index.html') === false ? s.url.includes('policy_type=') && s.chips.length === 1 : false, `${base} detail click starts a fresh filter on the catalog (${s.url})`);
  // ---- pages axe
  for (const r of ['', 'about/', 'advanced/', 'health/']) { await p.goto(U(r)); await sleep(r === 'advanced/' ? 1200 : 300); await axe(p, `${base}${r || 'catalog'}`); }
  await p.evaluate(() => 0);
  ok(ext.length === 0, `${base} no network beyond the local server ${ext.join(' ')}`);
  ok(errs.length === 0, `${base} no page errors ${errs.join('|')}`);
  await p.close();

  // ---- mobile 390x844
  const mp = await b.newPage(); await mp.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await mp.goto(U('')); await ready(mp);
  const mt = await mp.evaluate(() => ({ more: getComputedStyle(document.getElementById('shell-intro-more')).display, ws: getComputedStyle(document.querySelector('.shell-intro p')).whiteSpace, h: document.getElementById('shell-sticky').getBoundingClientRect().height, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, vh: innerHeight, font: parseFloat(getComputedStyle(document.querySelector('.shell-title')).fontSize) }));
  ok(mt.more !== 'none' && mt.ws === 'nowrap', `${base} @390 intro is compact (one line, More toggle)`);
  ok(mt.h < mt.vh * 0.2, `${base} @390 pinned area ${Math.round(mt.h)}px is < 20% of the ${mt.vh}px viewport`);
  ok(mt.sw <= mt.cw, `${base} @390 no horizontal overflow (${mt.sw}/${mt.cw})`);
  await mp.evaluate(() => scrollTo(0, 2500)); await sleep(150);
  ok(await mp.evaluate(() => { const r = document.getElementById('shell-sticky').getBoundingClientRect(); return r.top === 0 && r.bottom > 40; }), `${base} @390 header stays pinned while scrolling`);
  await mp.evaluate(() => scrollTo(0, 0));
  const h0 = mt.h; await mp.click('#shell-intro-more'); await sleep(150);
  const mx = await mp.evaluate(() => ({ exp: document.getElementById('shell-intro-more').getAttribute('aria-expanded'), h: document.getElementById('shell-sticky').getBoundingClientRect().height, tok: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sticky-top')) }));
  ok(mx.exp === 'true' && mx.h > h0 && Math.abs(mx.tok - (mx.h + 12)) <= 1.5, `${base} @390 More expands the intro and --sticky-top follows (${Math.round(h0)} -> ${Math.round(mx.h)})`);
  if (shots) { await mp.click('#shell-intro-more'); await mp.screenshot({ path: `${shots}/v31-${base.replace(/\W/g, '')}-m-top.png` }); await mp.evaluate(() => scrollTo(0, 2500)); await sleep(100); await mp.screenshot({ path: `${shots}/v31-${base.replace(/\W/g, '')}-m-scrolled.png` }); }
  await axe(mp, `${base} @390 catalog`);
  await mp.close();
  // short desktop screen (height < 700) also gets the compact intro
  const sp = await b.newPage(); await sp.setViewport({ width: 1280, height: 600 }); await sp.goto(U('')); await ready(sp);
  ok(await sp.evaluate(() => getComputedStyle(document.querySelector('.shell-intro p')).whiteSpace === 'nowrap'), `${base} @1280x600 intro compact on a short screen`); await sp.close();
}
// ---- JS off: links are plain, relative, and navigate; the destination applies the filter
const np = await b.newPage(); await np.setJavaScriptEnabled(false); await np.setViewport({ width: 1280, height: 800 });
await np.goto(`http://127.0.0.1:${port}/`);
const nj = await np.evaluate(() => { const a = document.querySelector('#grid a.card-link[data-filter=category]'); return [a.getAttribute('href'), a.dataset.value, document.querySelectorAll('#grid .card').length, getComputedStyle(document.getElementById('shell-sticky')).position]; });
ok(/^index\.html\?category=/.test(nj[0]), `JS off: card link is a real relative link (${nj[0]}), all ${nj[2]} cards listed`);
await Promise.all([np.waitForNavigation(), np.click('#grid a.card-link[data-filter=category]')]);
ok(np.url().endsWith('/' + nj[0]), `JS off: click navigates to ${nj[0]}`);
await np.setViewport({ width: 390, height: 844 }); ok((await np.evaluate(() => getComputedStyle(document.getElementById('shell-sticky')).position)) === 'static', 'JS off @390: header is unpinned (no way to expand the compact intro)'); await np.close();
const jp = await b.newPage(); await jp.goto(`http://127.0.0.1:${port}/${fs.existsSync('x') ? '' : 'index.html?category=' + nj[0].split('=')[1]}`); await ready(jp);
const jst = await state(jp); ok(jst.chips.length === 1 && jst.vis > 0 && jst.vis < cat.length, `JS on: the navigated URL applies the filter (${jst.count})`);
await b.close(); srv.close(); console.log(fail ? `${fail} FAILED` : 'ALL PASSED'); process.exit(fail ? 1 : 0);
