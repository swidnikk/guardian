// Library Explorer generator. READ-ONLY on the library. Writes only into --out (default ./dist).
// Usage: node generate.js --lib "<library root>" [--out dist] [--label text]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import YAML from 'yaml';
import initSqlJs from 'sql.js';
import { renderSite } from './render.js';
import esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => {
  if (x.startsWith('--')) a.push([x.slice(2), arr[i + 1]]); return a; }, []));
if (!args.lib) { console.error('--lib <library root> required'); process.exit(2); }
const LIB = path.resolve(args.lib);
const OUT = path.resolve(args.out || path.join(here, 'dist'));
const MAX_BYTES = 1_000_000;
const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const RE_MANIFEST = new RegExp(`^policy(?:\\.(${SLUG}))?\\.yml$`);
const SKIP_DIRS = new Set(['.git', 'node_modules']);

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const policySchema = readJson(path.join(LIB, 'policy.schema.json'));
const pubSchema = readJson(path.join(LIB, 'publications.schema.json'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const vPolicy = ajv.compile(policySchema);
const vPub = ajv.compile(pubSchema);
const fmtErrors = (errs) => (errs || []).map((e) => `${e.instancePath || '(root)'} ${e.message}${e.params && e.params.additionalProperty ? ` [${e.params.additionalProperty}]` : ''}`);

// canonical tags: first backticked cell of table rows in TAG_TAXONOMY.md (treated as data)
const canonical = new Set();
try {
  for (const line of fs.readFileSync(path.join(LIB, 'TAG_TAXONOMY.md'), 'utf8').split('\n')) {
    const m = line.match(/^\|\s*`([a-z0-9-]+)`\s*\|/); if (m) canonical.add(m[1]);
  }
} catch { /* taxonomy optional */ }

// ---- walk (no symlink following) ----
const problems = [];
const manifests = [], lookalikes = [], otherYaml = [], policyDirs = new Set(), dirsWithManifest = new Set();
let dirCount = 0;
(function walk(dir) {
  dirCount++;
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { problems.push({ path: rel(dir), kind: 'unreadable-dir', detail: e.message }); return; }
  for (const e of ents) {
    const full = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full); continue; }
    if (e.name.endsWith('.policy')) policyDirs.add(dir);
    const m = e.name.match(RE_MANIFEST);
    if (m && dir !== LIB) { manifests.push({ full, dir, file: e.name, slug: m[1] || null }); dirsWithManifest.add(dir); }
    else if (/\.ya?ml$/i.test(e.name)) {
      (/^policy/i.test(e.name) ? lookalikes : otherYaml).push(rel(full));
    }
  }
})(LIB);
function rel(p) { return path.relative(LIB, p) || '.'; }
manifests.sort((a, b) => a.full.localeCompare(b.full));

// ---- parse + validate ----
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const valid = [], invalid = [], seenIds = new Map();
const pubIssues = [];
for (const m of manifests) {
  const r = rel(m.full);
  const rec = { path: r, dir: rel(m.dir), file: m.file, slug: m.slug };
  try {
    const st = fs.statSync(m.full);
    if (st.size > MAX_BYTES) throw Object.assign(new Error(`file too large (${st.size} bytes)`), { kind: 'too-large' });
    const buf = fs.readFileSync(m.full); rec.sha = sha(buf);
    let doc;
    try { doc = YAML.parse(buf.toString('utf8'), { maxAliasCount: 20 }); }
    catch (e) { throw Object.assign(new Error(e.message.split('\n')[0]), { kind: 'yaml-parse-error' }); }
    if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) throw Object.assign(new Error('top level is not a mapping'), { kind: 'not-a-mapping' });
    rec.partial = { id: typeof doc.id === 'string' ? doc.id : null, name: typeof doc.name === 'string' ? doc.name : null };
    if (!vPolicy(doc)) { const errs = fmtErrors(vPolicy.errors); throw Object.assign(new Error(errs.join('; ')), { kind: 'schema-invalid', errs }); }
    if (seenIds.has(doc.id)) throw Object.assign(new Error(`duplicate id "${doc.id}" also in ${seenIds.get(doc.id)}`), { kind: 'duplicate-id' });
    seenIds.set(doc.id, r);
    rec.doc = doc;
    // publications
    const logName = m.slug ? `publications.${m.slug}.json` : 'publications.json';
    const logPath = path.join(m.dir, logName);
    rec.pubs = [];
    if (fs.existsSync(logPath)) {
      rec.pubLog = rel(logPath);
      try {
        const pj = JSON.parse(fs.readFileSync(logPath, 'utf8'));
        if (!vPub(pj)) pubIssues.push({ path: rec.pubLog, reason: fmtErrors(vPub.errors).join('; ') });
        else if (pj.policy_id !== doc.id) pubIssues.push({ path: rec.pubLog, reason: `policy_id "${pj.policy_id}" != manifest id "${doc.id}"` });
        else rec.pubs = pj.entries;
      } catch (e) { pubIssues.push({ path: rec.pubLog, reason: 'unparseable: ' + e.message }); }
    }
    // thumbnail fallback (RFC 11)
    const within = (p) => { const x = path.resolve(m.dir, p); return x.startsWith(m.dir + path.sep) && fs.existsSync(x) ? rel(x) : null; };
    let t = doc.thumbnail && within(doc.thumbnail);
    rec.thumb = t ? { src: t, how: 'explicit' } : null;
    if (!rec.thumb) for (const c of ['assets/thumbnail.png', 'assets/thumbnail.jpg']) { const w = within(c); if (w) { rec.thumb = { src: w, how: 'convention' }; break; } }
    if (!rec.thumb) rec.thumb = { src: null, how: 'generated' };
    valid.push(rec);
  } catch (e) {
    rec.kind = e.kind || 'error'; rec.reason = e.message; rec.errs = e.errs || [e.message];
    invalid.push(rec);
  }
}

// supersession integrity
const ids = new Set(valid.map((v) => v.doc.id));
const edges = [];
for (const v of valid) {
  const d = v.doc;
  if (d.supersedes) edges.push([d.supersedes, d.id, v.path, 'supersedes']);
  if (d.superseded_by) edges.push([d.id, d.superseded_by, v.path, 'superseded_by']);
}
const warnings = [];
for (const v of valid) {
  const d = v.doc;
  if (d.status === 'superseded' && !d.superseded_by) warnings.push({ path: v.path, kind: 'superseded-without-successor', detail: `${d.id}` });
  for (const t of d.tags) if (canonical.size && !canonical.has(t)) warnings.push({ path: v.path, kind: 'unknown-tag', detail: t });
}
for (const [from, to, p, how] of edges) {
  if (!ids.has(from) || !ids.has(to)) warnings.push({ path: p, kind: 'dangling-supersession', detail: `${from} -> ${to} (${how}); ${!ids.has(from) ? from : to} not in library` });
}

// folders without manifest: dir holding .policy bundles with no manifest in it or any ancestor
const covered = (d) => { for (let x = d; x.startsWith(LIB) && x !== LIB; x = path.dirname(x)) if (dirsWithManifest.has(x)) return true; return false; };
const noManifest = [...policyDirs].filter((d) => !covered(d)).map(rel).sort();

// ---- previous build diff ----
fs.mkdirSync(OUT, { recursive: true });
const SQL = await initSqlJs();
const dbPath = path.join(OUT, 'library.tmp.sqlite');
const prevDb = path.join(OUT, 'data/library.sqlite');
const prev = new Map();
if (fs.existsSync(prevDb)) {
  try { const old = new SQL.Database(fs.readFileSync(prevDb)); const r = old.exec('select path,sha from sources'); (r[0]?.values || []).forEach(([p, s]) => prev.set(p, s)); old.close(); } catch { /* stale db ignored */ }
}
const now = new Map([...valid, ...invalid].map((x) => [x.path, x.sha]));
const diff = { added: [], removed: [], changed: [] };
for (const [p, s] of now) { if (!prev.has(p)) diff.added.push(p); else if (prev.get(p) !== s) diff.changed.push(p); }
for (const p of prev.keys()) if (!now.has(p)) diff.removed.push(p);

// ---- write DB ----
const db = new SQL.Database();
db.run(`
create table meta(key text primary key, value text);
create table sources(path text primary key, sha text, valid integer);
create table policies(id text primary key, name text, version text, description text, policy_type text, policy_type_note text,
  status text, license text, category text, category_note text, standard_body text, methodology_id text, methodology_version text,
  token_type text, token_standard text, registry_status text, registry_body text, registry_reference text, registry_accepted_date text,
  sector text, guardian_version_min text, supersedes text, superseded_by text, thumbnail_src text, thumbnail_how text, homepage text, support text,
  manifest_path text, folder text, top_folder text, slug text,
  live_mainnet integer, on_testnet integer, latest_mainnet_ts text, has_pub_log integer, raw_json text);
create table tags(policy_id text, tag text, canonical integer);
create table sdgs(policy_id text, sdg integer);
create table people(policy_id text, role text, name text, url text, type text, github text, email text);
create table resources(policy_id text, type text, label text, url text);
create table roles(policy_id text, role text);
create table dependencies(policy_id text, dep_id text, version_min text);
create table publications(policy_id text, network text, hedera_timestamp text, version text, topic_id text);
create table invalid_manifests(path text primary key, folder text, partial_id text, partial_name text, kind text, reason text);
create table warnings(path text, kind text, detail text);
create table uncovered_folders(path text primary key);
create table other_yaml(path text, lookalike integer);
create index ix_tags on tags(tag); create index ix_sdg on sdgs(sdg); create index ix_pub on publications(policy_id);
create view supersession as
  select supersedes as older, id as newer from policies where supersedes is not null
  union select id, superseded_by from policies where superseded_by is not null;
`);
const ins = (t, row) => db.run(`insert into ${t} values (${row.map(() => '?').join(',')})`, row);
const n = (x) => (x === undefined ? null : x);
for (const v of valid) {
  const d = v.doc, pubs = v.pubs;
  const main = pubs.filter((p) => p.network === 'mainnet').map((p) => p.hedera_timestamp).sort((a, b) => Number(a) - Number(b));
  ins('policies', [d.id, d.name, d.version, d.description, d.policy_type, n(d.policy_type_note), d.status, d.license, d.category, n(d.category_note),
    n(d.standard_body), n(d.methodology_id), n(d.methodology_version), n(d.token_type), n(d.token_standard), n(d.registry_status), n(d.registry_body),
    n(d.registry_reference), n(d.registry_accepted_date), n(d.sector), n(d.guardian_version_min), n(d.supersedes), n(d.superseded_by),
    v.thumb.src, v.thumb.how, n(d.homepage), n(d.support), v.path, v.dir, v.dir.split(path.sep)[0], v.slug,
    main.length ? 1 : 0, pubs.some((p) => p.network === 'testnet') ? 1 : 0, main.length ? main[main.length - 1] : null, v.pubLog ? 1 : 0, JSON.stringify(d)]);
  d.tags.forEach((t) => ins('tags', [d.id, t, canonical.has(t) ? 1 : 0]));
  (d.sdg_alignment || []).forEach((s) => ins('sdgs', [d.id, s]));
  for (const [role, arr] of [['author', d.authors], ['contributor', d.contributors], ['maintainer', d.maintainers]])
    (arr || []).forEach((p) => ins('people', [d.id, role, p.name, n(p.url), n(p.type), n(p.github), n(p.email)]));
  (d.resources || []).forEach((r) => ins('resources', [d.id, r.type, r.label, n(r.url)]));
  (d.roles || []).forEach((r) => ins('roles', [d.id, r]));
  (d.dependencies || []).forEach((x) => ins('dependencies', [d.id, x.id, n(x.version_min)]));
  pubs.forEach((p) => ins('publications', [d.id, p.network, p.hedera_timestamp, n(p.version), n(p.hedera_topic_id)]));
}
for (const x of [...valid, ...invalid]) ins('sources', [x.path, n(x.sha), x.doc ? 1 : 0]);
invalid.forEach((x) => ins('invalid_manifests', [x.path, x.dir, n(x.partial?.id), n(x.partial?.name), x.kind, x.reason]));
warnings.forEach((w) => ins('warnings', [w.path, w.kind, w.detail]));
pubIssues.forEach((w) => ins('warnings', [w.path, 'invalid-publication-log', w.reason]));
noManifest.forEach((p) => ins('uncovered_folders', [p]));
lookalikes.forEach((p) => ins('other_yaml', [p, 1]));
const meta = { built_at: new Date().toISOString(), library_label: args.label || path.basename(LIB), schema_id: policySchema.$id,
  generator: 'library-explorer 0.2.0', found: String(manifests.length), valid: String(valid.length), invalid: String(invalid.length) };
Object.entries(meta).forEach(([k, v]) => ins('meta', [k, v]));
// ---- static site: templates + thumbnails + vendored assets (self-contained, relative links, no CDN) ----
for (const d of ['p', 'thumbs', 'health', 'sql', 'advanced', 'about', 'data', 'assets']) fs.rmSync(path.join(OUT, d), { recursive: true, force: true });
for (const f of ['library.sqlite', 'catalog.json', 'index.html', 'app.js', 'style.css', 'sql-wasm.js', 'sql-wasm.wasm', 'sitemap-paths.txt']) fs.rmSync(path.join(OUT, f), { force: true });
const qrows = (sql, p = []) => { const st = db.prepare(sql); st.bind(p); const r = []; while (st.step()) r.push(st.getAsObject()); st.free(); return r; };
const byId = new Map(valid.map((v) => [v.doc.id, v]));
const IMG_OK = /\.(png|jpe?g)$/i;
const resolveThumb = (p) => { // RFC 11: explicit -> assets/thumbnail.png|jpg (already resolved by the walker) -> null => generated SVG
  const v = byId.get(p.id); if (!v || !v.thumb || !v.thumb.src) return null;
  const src = path.join(LIB, v.thumb.src);
  try { const real = fs.realpathSync(src); if (!real.startsWith(fs.realpathSync(LIB) + path.sep) || !IMG_OK.test(real) || fs.statSync(real).size > 2_000_000) return null;
    const ext = path.extname(real).toLowerCase(); const rel = `thumbs/${p.id}${ext}`; fs.mkdirSync(path.join(OUT, 'thumbs'), { recursive: true }); fs.copyFileSync(real, path.join(OUT, rel)); return rel; } catch { return null; }
};
fs.mkdirSync(path.join(OUT, 'assets/vendor'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'data/library.sqlite'), Buffer.from(db.export()));
fs.rmSync(dbPath, { force: true });
for (const f of ['sql-page.js']) fs.copyFileSync(path.join(here, 'assets', f), path.join(OUT, 'assets', f));
for (const f of ['sql-wasm.js', 'sql-wasm.wasm']) fs.copyFileSync(path.join(here, 'node_modules/sql.js/dist', f), path.join(OUT, 'assets/vendor', f));
esbuild.buildSync({ entryPoints: [path.join(here, 'assets/md-entry.js')], bundle: true, minify: true, format: 'iife', outfile: path.join(OUT, 'assets/vendor/md.js'), logLevel: 'error' });
// catalog.json is written before the pages so the Advanced Search page can show real file sizes (B-08)
fs.writeFileSync(path.join(OUT, 'data/catalog.json'), JSON.stringify({ schema_version: 1, built_at: meta.built_at,
  policies: valid.map((v) => ({ ...v.doc, _manifest_path: v.path, _publications: v.pubs })) }));
const human = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
let sourceCommit = ''; try { sourceCommit = execFileSync('git', ['-C', LIB, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* not a git checkout: omitted from the page */ }
const pg = renderSite(qrows, OUT, { ...meta, source_commit: sourceCommit, sqlite_size: human(fs.statSync(path.join(OUT, 'data/library.sqlite')).size), catalog_size: human(fs.statSync(path.join(OUT, 'data/catalog.json')).size) }, resolveThumb);

const report = {
  library: LIB, built_at: meta.built_at,
  directories_walked: dirCount,
  manifests_found: manifests.length,
  by_form: { 'policy.yml': manifests.filter((m) => !m.slug).length, 'policy.<slug>.yml': manifests.filter((m) => m.slug).length },
  valid: valid.length, invalid: invalid.length,
  invalid_manifests: invalid.map((x) => ({ path: x.path, kind: x.kind, reason: x.reason })),
  folders_without_manifest: noManifest,
  non_manifest_yaml_lookalikes: lookalikes, other_yaml_count: otherYaml.length,
  publication_logs_found: valid.filter((v) => v.pubLog).length, publication_log_problems: pubIssues,
  policies_with_mainnet: valid.filter((v) => v.pubs.some((p) => p.network === 'mainnet')).length,
  warnings_by_kind: warnings.reduce((a, w) => (a[w.kind] = (a[w.kind] || 0) + 1, a), {}),
  warnings, diff_since_previous_build: diff,
  thumbnails: valid.reduce((a, v) => (a[v.thumb.how] = (a[v.thumb.how] || 0) + 1, a), {}),
  db_bytes: fs.statSync(path.join(OUT, 'data/library.sqlite')).size,
};
fs.writeFileSync(path.join(OUT, 'build-report.json'), JSON.stringify(report, null, 2));
console.log(`found ${report.manifests_found} (policy.yml ${report.by_form['policy.yml']}, slug ${report.by_form['policy.<slug>.yml']}) | valid ${report.valid} | invalid ${report.invalid}`);
console.log(`folders w/o manifest ${noManifest.length} | lookalikes ${lookalikes.length} | pub logs ${report.publication_logs_found} | db ${report.db_bytes} B`);
console.log('warnings', JSON.stringify(report.warnings_by_kind), 'diff', JSON.stringify({ a: diff.added.length, r: diff.removed.length, c: diff.changed.length }));
for (const x of invalid) console.log('INVALID', x.path, '::', x.kind, '::', x.reason.slice(0, 160));
