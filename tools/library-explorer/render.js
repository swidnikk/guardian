// Static site renderer: SQLite rows -> mustache templates -> HTML files. All values are escaped by mustache ({{ }}); only {{{ }}} for pre-rendered, already-escaped fragments.
import fs from 'node:fs';
import path from 'node:path';
import Mustache from 'mustache';
import { thumbSvg } from './thumbs.js';
const here = path.dirname(new URL(import.meta.url).pathname);
Mustache.escape = (s) => String(s ?? '').replace(/[&<>"'`=\/]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;', '=': '&#61;', '/': '&#x2F;' }[c]));
// CSS is split per area (assets/css/NN-*.css) and concatenated in name order, so teams do not edit the same file.
const CSS_DIR = path.join(here, 'assets/css');
const CSS = fs.readdirSync(CSS_DIR).filter((f) => f.endsWith('.css')).sort().map((f) => fs.readFileSync(path.join(CSS_DIR, f), 'utf8')).join('\n');
const SITE = JSON.parse(fs.readFileSync(path.join(here, 'site.config.json'), 'utf8'));
// filter.js is inlined into the catalog page. On file:// every extra file open is slow on some machines (measured ~1 s each here), so pages are kept to 1-2 files.
const FILTER_JS = fs.readFileSync(path.join(here, 'assets/filter.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const NAV_JS = fs.readFileSync(path.join(here, 'assets/nav.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
// every templates/*.mustache is loaded by name, so adding a page template needs no edit here
const T = Object.fromEntries(fs.readdirSync(path.join(here, 'templates')).filter((f) => f.endsWith('.mustache')).map((f) => [f.replace(/\.mustache$/, ''), fs.readFileSync(path.join(here, 'templates', f), 'utf8')]));
const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
const SITE_TITLE = 'Guardian Methodology Library';
const UNSPEC = 'Unspecified';
const NETS = { mainnet: 'Live on mainnet', testnet: 'Testnet only', none: 'No publication recorded' };
const netOf = (p) => (p.live_mainnet ? 'mainnet' : p.on_testnet ? 'testnet' : 'none');
const qv = (s) => encodeURIComponent(s);
const sb = (p) => p.standard_body || UNSPEC;
const stCls = (s) => 'st-' + s;

export function renderSite(rows, OUT, meta, resolveThumb) {
  const pols = rows(`select * from policies order by case status when 'active' then 0 when 'candidate' then 1 when 'draft' then 2 when 'deprecated' then 3 else 4 end, name collate nocase`);
  const known = new Set(pols.map((p) => p.id));
  const w = (rel, s) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
  // Route titles (B-04): the catalogue is the bare site name, every other page is "<site name> / <page>".
  const fullTitle = (t) => (t === 'Catalog' ? SITE_TITLE : `${SITE_TITLE} / ${t}`);
  const page = (title, depth, body, opts = {}) => Mustache.render(T.layout, { title: fullTitle(title), root: '../'.repeat(depth), body, css: CSS, site: SITE, filterJs: FILTER_JS, navJs: NAV_JS, navCatalogGroup: !!(opts.navCatalog || opts.navHealth || opts.navAdvanced), showIntro: !!(opts.catalogPage || opts.navAbout), builtAt: meta.built_at, library: meta.library_label, valid: meta.valid, invalid: meta.invalid, ...opts });
  const tagsBy = {}, sdgBy = {};
  rows('select policy_id, tag, canonical from tags order by tag').forEach((t) => (tagsBy[t.policy_id] ||= []).push(t));
  rows('select policy_id, sdg from sdgs order by sdg').forEach((t) => (sdgBy[t.policy_id] ||= []).push(t.sdg));
  // thumbnails: explicit/convention image copied, else deterministic SVG
  for (const p of pols) { p.thumb = resolveThumb(p) || (() => { const f = `thumbs/${p.id}.svg`; w(f, thumbSvg(p)); return f; })(); }
  // Image files are still written to thumbs/ (deliverable, reusable). Pages embed small ones as data: URIs so browsing needs no per-image file reads.
  const thumbSrc = (p, root) => { try { const f = path.join(OUT, p.thumb); const b = fs.readFileSync(f); const mime = p.thumb.endsWith('.svg') ? 'image/svg+xml' : p.thumb.endsWith('.png') ? 'image/png' : 'image/jpeg'; if (b.length <= 120_000) return `data:${mime};base64,${b.toString('base64')}`; } catch {} return Mustache.escape(root + p.thumb); };
  const chipsFor = (p) => [
    { key: 'status', value: p.status, label: p.status, cls: stCls(p.status) },
    { key: 'policy_type', value: p.policy_type, label: p.policy_type, cls: '' },
    { key: 'standard_body', value: sb(p), label: sb(p), cls: p.standard_body ? 'sb' : 'unspec' },
    { key: 'category', value: p.category, label: p.category, cls: '' },
    ...(p.live_mainnet ? [{ key: 'net', value: 'mainnet', label: 'Live on mainnet', cls: 'live' }] : p.on_testnet ? [{ key: 'net', value: 'testnet', label: 'Testnet only', cls: '' }] : []),
  ].map((c) => ({ ...c, qv: qv(c.value) }));
  const cards = pols.map((p) => Mustache.render(T.card, {
    ...p, root: '', thumbSrc: thumbSrc(p, ''), standard_body: sb(p), net: netOf(p), sdgAttr: ' ' + (sdgBy[p.id] || []).join(' ') + ' ', tagAttr: ' ' + (tagsBy[p.id] || []).map((t) => t.tag).join(' ') + ' ',
    text: [p.name, p.id, p.methodology_id, sb(p), p.description, ...(tagsBy[p.id] || []).map((t) => t.tag)].join(' ').toLowerCase(),
    chips: chipsFor(p), summary: p.description.length > 150 ? p.description.slice(0, 147) + '…' : p.description,
    tags: (tagsBy[p.id] || []).slice(0, 4).map((t) => ({ value: t.tag, qv: qv(t.tag) })),
  })).join('\n');
  // facet groups
  const count = (fn) => { const m = new Map(); pols.forEach((p) => { [].concat(fn(p)).forEach((v) => v != null && m.set(v, (m.get(v) || 0) + 1)); }); return [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))); };
  const group = (key, label, entries, labelFn = (v) => v, limit = 8) => ({ key, label, options: entries.map(([v, n], i) => ({ key, value: v, label: labelFn(v), n, extra: i >= limit })), hasExtra: entries.length > limit, totalOptions: entries.length });
  const groups = [
    group('status', 'Status', count((p) => p.status)),
    group('policy_type', 'Policy type', count((p) => p.policy_type)),
    group('standard_body', 'Standard body', count(sb)),
    group('category', 'Category', count((p) => p.category)),
    group('sector', 'Sector', count((p) => p.sector).concat(pols.some((p) => !p.sector) ? [] : [])),
    group('net', 'Hedera publication', ['mainnet', 'testnet', 'none'].map((v) => [v, pols.filter((p) => netOf(p) === v).length]), (v) => NETS[v]),
    group('sdg', 'SDG', count((p) => sdgBy[p.id] || []).sort((a, b) => a[0] - b[0]), (v) => 'SDG ' + v, 17),
    group('tag', 'Tags', count((p) => (tagsBy[p.id] || []).map((t) => t.tag)), (v) => '#' + v, 10),
  ].filter((g) => g.options.length);
  const st = count((p) => p.status), pubLogs = pols.filter((p) => p.has_pub_log).length, mainnet = pols.filter((p) => p.live_mainnet).length;
  const strip = `${st.map(([v, n]) => `${n} ${v}`).join(', ')}. ${mainnet} with a recorded mainnet publication; ${pubLogs} with any publication log (absence of a log is not proof of non-publication).`;
  w('index.html', page('Catalog', 0, Mustache.render(T.catalog, { groups, total: pols.length, strip, cards }), { catalogPage: true, navCatalog: true, bodyClass: 'catalog' }));

  // detail pages
  for (const p of pols) {
    const id = p.id;
    const pubs = rows('select * from publications where policy_id=? order by hedera_timestamp', [id]);
    const chain = rows(`with recursive up(id,d) as (select ?,0 union select s.older,d+1 from supersession s join up on s.newer=up.id where d<20), down(id,d) as (select ?,0 union select s.newer,d+1 from supersession s join down on s.older=down.id where d<20) select id,-d pos from up union select id,d from down order by pos`, [id, id]);
    const res = rows('select * from resources where policy_id=?', [id]).map((r) => ({ type: r.type, label: r.label, url: safeUrl(r.url) }));
    const people = rows('select * from people where policy_id=?', [id]);
    const sdgs = sdgBy[id] || [];
    const banner = (p.status === 'superseded' || p.status === 'deprecated') ? `${Mustache.escape(p.status)}: ${p.superseded_by ? `replaced by <a href="../${Mustache.escape(p.superseded_by)}/index.html">${Mustache.escape(p.superseded_by)}</a>` : 'no replacement is named in the manifest'}` : null;
    const details = ['policy_type', 'category', 'sector', 'standard_body', 'methodology_id', 'methodology_version', 'token_type', 'token_standard', 'registry_status', 'registry_body', 'registry_reference', 'license', 'guardian_version_min', 'manifest_path'].filter((k) => p[k])
      .map((k) => ({ k, v: k === 'registry_status' && p[k] === 'validated' ? 'validated (asserted in manifest, not independently verified)' : p[k] }));
    if (!p.standard_body) details.push({ k: 'standard_body', v: 'Unspecified (manifest omits it)' });
    const html = Mustache.render(T.detail, {
      ...p, root: '../../', thumbSrc: thumbSrc(p, '../../'), chips: chipsFor(p).filter((c) => c.key !== 'standard_body'),
      sbLabel: sb(p), sbQv: qv(sb(p)), sbCls: p.standard_body ? '' : 'unspec', sbTitle: p.standard_body ? 'Show all policies from this standard body' : 'The manifest does not name a standard body',
      banner, hasPubs: pubs.length > 0, pubs, pubText: p.has_pub_log ? 'The publication log exists but has no entries.' : 'No publication log found. This does not mean the policy is unpublished; nothing is recorded.',
      hasChain: chain.length > 1, chain: chain.map((c) => ({ id: c.id, current: c.id === id, inLib: known.has(c.id) })),
      resources: res, hasRes: res.length > 0, people, hasPeople: people.length > 0, details, hasSdgs: sdgs.length > 0, sdgs,
      tags: (tagsBy[id] || []).map((t) => ({ value: t.tag, qv: qv(t.tag), noncanon: !t.canonical, cls: t.canonical ? '' : 'warn' })),
    });
    w(`p/${id}/index.html`, page(p.name, 2, html, { bodyClass: 'detail-page' }));
  }
  // health
  const inv = rows('select * from invalid_manifests order by path'), unc = rows('select path from uncovered_folders order by path').map((r) => r.path), look = rows('select path from other_yaml').map((r) => r.path), wr = rows('select * from warnings order by kind,path');
  const kinds = {}; wr.forEach((x) => (kinds[x.kind] ||= []).push(x));
  w('health/index.html', page('Health', 1, Mustache.render(T.health, {
    found: meta.found, valid: meta.valid, invalid: meta.invalid, statusLine: st.map(([v, n]) => `${v} ${n}`).join(', '), pubLogs,
    invalidCount: inv.length, invalidRows: inv.map((x, i) => ({ ...x, first: i === 0, last: i === inv.length - 1 })), uncCount: unc.length, unc, lookCount: look.length, look,
    warnGroups: Object.entries(kinds).map(([kind, items]) => ({ kind, n: items.length, items })),
  }), { navHealth: true }));
  // about (B-07): blocks come from site.config.json; GitHub URL is derived from the single repo setting (Q-10)
  const linkUrl = (k) => safeUrl(k === 'github' ? SITE.repo.url : SITE.links[k]);
  const blocks = SITE.about.blocks.map((b) => ({ question: b.question, label: b.label, url: linkUrl(b.link) })).filter((b) => b.url);
  w('about/index.html', page('About', 1, Mustache.render(T.about, { root: '../', blocks }), { navAbout: true }));
  // advanced search (B-08): technical summary numbers come from the build (meta), nothing hard-coded
  const summary = { found: meta.found, valid: meta.valid, invalid: meta.invalid, builtAt: meta.built_at, sourceCommit: meta.source_commit || '', catalogSize: meta.catalog_size || '', sqliteSize: meta.sqlite_size || '' };
  w('advanced/index.html', page('Advanced Search', 1, Mustache.render(T.advanced, { root: '../', summary, ...summary }), { navAdvanced: true }));
  // old URL kept alive (Q-9): tiny redirect page, relative link only
  w('sql/index.html', `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n<meta name="robots" content="noindex, nofollow, noarchive, noimageindex">\n<meta http-equiv="refresh" content="0; url=../advanced/index.html">\n<title>${SITE_TITLE} / Advanced Search</title></head><body><p>This page moved to <a href="../advanced/index.html">Advanced Search</a>.</p></body></html>\n`);
  return { total: pols.length };
}
