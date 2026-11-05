// Real-browser checks for the Catalog team items (B-09, B-01, B-02, B-10, B-03). Usage: node test/catalog.browser.mjs <base url ending in />  e.g. http://127.0.0.1:8412/
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const base = process.argv[2] || 'http://127.0.0.1:8412/';
const axeSrc = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
let fails = 0; const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${x}`); if (!ok) fails++; };
const p = await b.newPage(); await p.setViewport({ width: 1400, height: 900 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('requestfailed', (r) => errs.push('reqfail ' + r.url()));
const reqs = []; p.on('request', (r) => reqs.push(r.url()));
const go = async (q = '') => { await p.goto(base + 'index.html' + q); await p.waitForSelector('html[data-ready="1"]'); };
const vis = () => p.evaluate(() => [...document.querySelectorAll('#grid .card')].filter((c) => !c.hidden).length);
const count = () => p.$eval('#count', (e) => e.textContent);
const total = () => p.evaluate(() => document.querySelectorAll('#grid .card').length);
const exp = (f) => p.evaluate((src) => [...document.querySelectorAll('#grid .card')].filter(new Function('c', 'return ' + src)).length, f);
const click = (sel) => p.$eval(sel, (e) => e.click()); // programmatic click: robust for visually restyled inputs
await go(); const T = await total();
const nDep = await exp("c.dataset.status==='deprecated'"), nSup = await exp("c.dataset.status==='superseded'");
// B-09
check('B-09 no status strip', !(await p.$('.hero')) && !/not proof of non-publication/.test(await p.content()));
// B-10 defaults
check('B-10 default hides deprecated+superseded', (await vis()) === T - nDep - nSup, `${await vis()} of ${T}`);
check('B-10 result line shows hidden', (await count()) === `${T - nDep - nSup} of ${T} policies (${nDep + nSup} hidden)`, await count());
check('B-10 default URL clean', !p.url().includes('?'));
check('B-10 no Status option for deprecated/superseded', await p.evaluate(() => ['deprecated', 'superseded'].every((v) => document.querySelector(`input[data-facet=status][value=${v}]`).closest('.facet-opt').hidden)));
check('B-10 switch role + label', (await p.$eval('#sw-deprecated-lbl', (e) => e.textContent)) === 'Deprecated Policies Excluded' && (await p.$eval('#sw-deprecated', (e) => e.getAttribute('role'))) === 'switch');
const sumStatus = await p.evaluate(() => [...document.querySelectorAll('[data-count-for^="status="]')].filter((e) => !e.closest('.facet-opt').hidden).reduce((a, e) => a + +e.textContent, 0));
check('B-10 status counts sum to visible', sumStatus === (await vis()), String(sumStatus));
await click('#sw-deprecated');
check('B-10 include deprecated', (await vis()) === T - nSup && (await count()).includes(`(${nSup} hidden)`) && p.url().includes('include_deprecated=1'), await count());
check('B-10 Deprecated status option back with its count', await p.evaluate((n) => { const o = document.querySelector('input[data-facet=status][value=deprecated]').closest('.facet-opt'); return !o.hidden && o.querySelector('.count').textContent === String(n); }, nDep));
check('B-10 label flips', (await p.$eval('#sw-deprecated-lbl', (e) => e.textContent)) === 'Deprecated Policies Included');
await click('#sw-superseded'); check('B-10 both included: all shown, no hidden suffix', (await vis()) === T && (await count()) === `${T} of ${T} policies`);
await click('#sw-deprecated'); await click('#sw-superseded');
check('B-10 independent, off again', (await vis()) === T - nDep - nSup);
await go('?status=deprecated'); check('Q-16 status=deprecated turns switch on', (await vis()) === nDep && (await p.$eval('#sw-deprecated', (e) => e.checked)));
await go('?include_superseded=1'); check('include_superseded URL restores state', (await p.$eval('#sw-superseded', (e) => e.checked)) && (await vis()) === T - nDep);
// old URL
await go('?tag=hackathon&status=draft');
const expOld = await exp("c.dataset.status==='draft' && c.dataset.tag.includes(' hackathon ')");
check('old URL ?tag=hackathon&status=draft', (await vis()) === expOld && expOld > 0, `${await vis()} vs ${expOld}`);
check('chips present for URL state, each with remove button', await p.evaluate(() => { const c = [...document.querySelectorAll('.facet-chip')]; return c.length === 2 && c.every((x) => x.querySelector('button[aria-label^="Remove"]')); }));
// B-01 facet behaviour
await go();
await click('.facet[data-facet=status] .facet-toggle');
check('B-01 opens panel, aria-expanded', await p.$eval('.facet[data-facet=status] .facet-toggle', (e) => e.getAttribute('aria-expanded') === 'true') && await p.$eval('#fp-status', (e) => !e.hidden));
await click('.facet[data-facet=status] input[value=draft]');
check('B-01 select draft -> chip + URL', p.url().includes('status=draft') && (await p.$$('.facet[data-facet=status] .facet-chip')).length === 1);
await p.focus('#fp-status input[value=draft]'); await p.keyboard.press('Escape');
check('B-01 Escape closes, focus returns to toggle', await p.evaluate(() => document.getElementById('fp-status').hidden && document.activeElement === document.querySelector('.facet[data-facet=status] .facet-toggle')));
await click('.facet[data-facet=status] .facet-toggle'); await click('.facet[data-facet=status] input[value=active]');
check('OR within facet', (await vis()) === await exp("['draft','active'].includes(c.dataset.status)"));
await click('.facet[data-facet=policy_type] .facet-toggle');
const ptv = await p.$eval('.facet[data-facet=policy_type] input', (e) => e.value); await click(`.facet[data-facet=policy_type] input[value="${ptv}"]`);
check('AND across facets', (await vis()) === await exp(`['draft','active'].includes(c.dataset.status) && c.dataset.policy_type==='${ptv}'`));
check('opening another facet closed the first', await p.$eval('#fp-status', (e) => e.hidden));
const bad = await p.evaluate(() => [...document.querySelectorAll('[data-count-for]')].filter((e) => (e.textContent === '0') !== e.closest('.facet-opt').classList.contains('zero')).length);
check('zero options dimmed consistently', bad === 0);
await click('.facet[data-facet=policy_type] .facet-chip-x'); check('chip remove button works', !p.url().includes('policy_type'));
await p.focus('.facet[data-facet=category] .facet-toggle'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown');
check('keyboard: ArrowDown opens and moves', await p.evaluate(() => { const a = document.activeElement; return a.matches('input[type=checkbox]') && a !== document.querySelector('#fp-category input'); }));
await p.keyboard.press('Space'); check('keyboard: Space toggles option', p.url().includes('category='));
await p.keyboard.press('Escape');
await p.goBack(); check('back button restores previous state', !p.url().includes('category='));
// axe
const axe = async (label) => { await p.evaluate(axeSrc); const r = await p.evaluate(async () => (await axe.run(document)).violations.map((v) => v.id + ':' + v.nodes.length)); check('axe ' + label, r.length === 0, r.join(',')); };
await go(); await axe('catalog closed'); await click('.facet[data-facet=tag] .facet-toggle'); await axe('catalog facet open');
await click('#sw-deprecated'); await axe('catalog switch on');
// B-02 sticky
await go(); await p.evaluate(() => window.scrollTo(0, 1500)); const top = await p.$eval('#filters', (e) => Math.round(e.getBoundingClientRect().top));
check('B-02 filter panel stays in view while grid scrolls', top >= 0 && top < 200, `top=${top}`);
check('B-02 panel fits viewport', await p.$eval('#filters', (e) => e.getBoundingClientRect().bottom <= innerHeight + 1));
// cards
check('B-03d github link (new tab, noopener, https)', await p.evaluate(() => [...document.querySelectorAll('.card')].every((c) => { const a = c.querySelector('.card-actions a'); return a && a.target === '_blank' && /noopener/.test(a.rel) && /^https:\/\/github\.com\//.test(a.href); })));
check('B-03d Import disabled with explanation', await p.evaluate(() => [...document.querySelectorAll('.card button.card-btn')].every((x) => x.disabled && document.getElementById(x.getAttribute('aria-describedby')))));
check('B-03b/c shared art: 8 SVG data URIs in whole page, no per-card images', await p.evaluate(() => (document.documentElement.outerHTML.match(/data:image\/svg\+xml/g) || []).length <= 9 && !document.querySelector('.card img')));
check('B-03c art has no text elements', await p.evaluate(() => !/<text/i.test(document.documentElement.outerHTML)));
check('B-03a title clamp 4 lines', await p.evaluate(() => { const a = document.querySelector('.card-title'); const c = (n) => getComputedStyle(n).webkitLineClamp; return c(a) === '4' || c(a.querySelector('a')) === '4'; }));
// narrow
await p.setViewport({ width: 600, height: 900 }); await go();
check('Q-4 narrow: filters collapsed', await p.$eval('#filters-details', (d) => !d.open));
check('narrow: no horizontal overflow', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
await p.setViewport({ width: 1400, height: 900 });
const ext = reqs.filter((u) => !u.startsWith(base) && !u.startsWith('data:'));
check('no runtime network beyond same origin', ext.length === 0, ext.join(' '));
check('no page errors', errs.length === 0, errs.join(' | '));
await b.close(); process.exit(fails ? 1 : 0);
