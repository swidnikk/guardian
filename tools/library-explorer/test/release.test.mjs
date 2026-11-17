// Tests for the release allow-list (build.js --release <file>).
//
// What it checks: only the folders named in the release file are published, nothing from the
// other folders leaks into any output file, and a bad release file stops the build.
//
// Usage: node test/release.test.mjs "<Methodology Library path>" <scratch dir>
// (the scratch dir receives every build output; defaults to a temp dir)

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const tool = path.join(path.dirname(fileURLToPath(import.meta.url)), '..'); // tools/library-explorer
const lib = path.resolve(process.argv[2] || path.join(tool, '../../Methodology Library'));
const tmp = path.resolve(process.argv[3] || fs.mkdtempSync('/tmp/release-test-'));
fs.mkdirSync(tmp, { recursive: true });

// ---- helpers ----

let fails = 0;
const ok = (condition, message) => {
  console.log((condition ? 'PASS ' : 'FAIL ') + message);
  if (!condition) fails++;
};

// Runs build.js once. `release` is an object (written as JSON) or a raw string (to test unreadable files).
// Output goes to <tmp>/<name>/ and the release file to <tmp>/<name>.json. Returns the process result (status, stderr).
const build = (name, release) => {
  const releaseFile = path.join(tmp, name + '.json');
  fs.writeFileSync(releaseFile, typeof release === 'string' ? release : JSON.stringify(release));
  return spawnSync('node', ['build.js', '--lib', lib, '--out', path.join(tmp, name), '--release', releaseFile], { cwd: tool, encoding: 'utf8' });
};

// Reads the policies a build published (catalog.json) and adds `folder`, the library folder each manifest sits in.
const publishedPolicies = (name) =>
  JSON.parse(fs.readFileSync(path.join(tmp, name, 'data/catalog.json'), 'utf8')).policies
    .map((p) => ({ ...p, folder: path.dirname(p._manifest_path) }));

// Paths of every file under a directory (recursive).
const listFiles = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]));

// ---- baseline: build the whole library without --release ----

spawnSync('node', ['build.js', '--lib', lib, '--out', path.join(tmp, 'full')], { cwd: tool, encoding: 'utf8' });
const all = publishedPolicies('full');

// Pick one top-level folder to keep (the first policy that sits directly in a top-level folder).
const keepFolder = (all.find((p) => p.folder !== '.' && !p.folder.includes('/')) || all[0]).folder.split('/')[0];

// ---- 1. release with a single folder ----

ok(build('one', { version: 1, include: [keepFolder] }).status === 0, `release with one folder builds (${keepFolder})`);

const one = publishedPolicies('one');
ok(
  one.length > 0 && one.length < all.length && one.every((p) => p.folder.split('/')[0] === keepFolder),
  `only that folder is published (${one.length} of ${all.length})`,
);

// ---- 2. nothing from the excluded folders reaches any output file ----

const keptIds = new Set(one.map((p) => p.id));
const excluded = all.filter((p) => !keptIds.has(p.id));
const outputFiles = listFiles(path.join(tmp, 'one')).map((f) => [f, fs.readFileSync(f)]);

// A leak = an excluded policy's name appears inside any output file (pages, catalog.json, the SQLite file),
// or an excluded policy got its own detail page folder (/p/<id>/).
const leak = excluded.find((p) =>
  outputFiles.some(([file, bytes]) => bytes.includes(Buffer.from(p.name)) || file.includes('/p/' + p.id + '/')));
ok(!leak, `no excluded policy name or page appears in any output file (${excluded.length} checked)${leak ? ' LEAK ' + leak.id : ''}`);
ok(!fs.existsSync(path.join(tmp, 'one/p', excluded[0].id)), 'excluded detail page not generated');

// ---- 3. bad release files must stop the build (non-zero exit) ----

ok(build('typo', { version: 1, include: [keepFolder + 'x'] }).status !== 0, 'an entry matching no folder aborts the build');
ok(build('empty', { version: 1, include: [] }).status !== 0, 'empty allow-list aborts');
ok(build('traversal', { version: 1, include: ['../x'] }).status !== 0, 'path with .. is rejected');
ok(build('absolute', { version: 1, include: ['/etc'] }).status !== 0, 'absolute path is rejected');
ok(build('notjson', 'not json').status !== 0, 'unreadable release file aborts');

// ---- 4. the release.json committed next to build.js works against this library ----

const committed = path.join(tool, 'release.json');
if (fs.existsSync(committed)) {
  const result = build('committed', JSON.parse(fs.readFileSync(committed, 'utf8')));
  ok(result.status === 0, 'committed release.json builds against this library');
}

console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
