// Release allow-list (--release): only listed folders are published; typos and bad files abort. Usage: node test/release.test.mjs "<Methodology Library path>" <scratch dir>
import { spawnSync } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)), tool = path.join(here, '..');
const lib = path.resolve(process.argv[2] || path.join(tool, '../../Methodology Library')), tmp = path.resolve(process.argv[3] || fs.mkdtempSync('/tmp/release-test-'));
fs.mkdirSync(tmp, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const build = (out, rel) => { const f = path.join(tmp, out + '.json'); fs.writeFileSync(f, typeof rel === 'string' ? rel : JSON.stringify(rel)); return spawnSync('node', ['build.js', '--lib', lib, '--out', path.join(tmp, out), '--release', f], { cwd: tool, encoding: 'utf8' }); };
const full = spawnSync('node', ['build.js', '--lib', lib, '--out', path.join(tmp, 'full')], { cwd: tool, encoding: 'utf8' });
const cat = (o) => JSON.parse(fs.readFileSync(path.join(tmp, o, 'data/catalog.json'), 'utf8')).policies.map((p) => ({ ...p, folder: path.dirname(p._manifest_path) }));
const all = cat('full'); const pick = all.find((p) => p.folder !== '.' && !p.folder.includes('/')) || all[0];
const keepFolder = pick.folder.split('/')[0];
const r = build('one', { version: 1, include: [keepFolder] });
ok(r.status === 0, `release with one folder builds (${keepFolder})`);
const one = cat('one'); const ids = new Set(one.map((p) => p.id));
ok(one.length > 0 && one.length < all.length && one.every((p) => p.folder.split('/')[0] === keepFolder), `only that folder is published (${one.length} of ${all.length})`);
const excluded = all.filter((p) => !ids.has(p.id));
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(path.join(tmp, 'one')).map((f) => [f, fs.readFileSync(f)]);
const leak = excluded.find((p) => files.some(([f, b]) => b.includes(Buffer.from(p.name)) || f.includes('/p/' + p.id + '/')));
ok(!leak, `no excluded policy name or page appears in any output file (${excluded.length} checked)${leak ? ' LEAK ' + leak.id : ''}`);
ok(!fs.existsSync(path.join(tmp, 'one/p', excluded[0].id)), 'excluded detail page not generated');
ok(build('typo', { version: 1, include: [keepFolder + 'x'] }).status !== 0, 'an entry matching no folder aborts the build');
ok(build('empty', { version: 1, include: [] }).status !== 0, 'empty allow-list aborts');
ok(build('trav', { version: 1, include: ['../x'] }).status !== 0, 'path with .. is rejected');
ok(build('abs', { version: 1, include: ['/etc'] }).status !== 0, 'absolute path is rejected');
ok(build('bad', 'not json').status !== 0, 'unreadable release file aborts');
const real = path.join(tool, 'release.json');
if (fs.existsSync(real)) { const rr = build('real', JSON.parse(fs.readFileSync(real, 'utf8'))); ok(rr.status === 0, 'committed release.json builds against this library'); }
console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
