'use strict';

// Offline tests for the pure parts of record-publication.js. No network access.
// Run from the Methodology Library root: node --test scripts/record-publication.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
    validateManifestName,
    logNameFor,
    discoverManifests,
    resolveManifests,
    policyIdMismatchMessage,
    readPolicyId,
    Refused,
    Unreachable,
} = require('./record-publication.js');

const SCRIPT = path.join(__dirname, 'record-publication.js');

function tmpDir(files = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'record-pub-'));
    for (const [name, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(dir, name), content);
    }
    return dir;
}

test('validateManifestName accepts policy.yml and kebab-case sidecars', () => {
    for (const ok of ['policy.yml', 'policy.cet.yml', 'policy.gaseous-fuel.yml', 'policy.v2-1.yml']) {
        assert.equal(validateManifestName(ok), ok);
    }
});

test('validateManifestName rejects bad names and any path separator', () => {
    const bad = [
        '',
        'policy.yaml',
        'Policy.yml',
        'policy..yml',
        'policy.Gas.yml',
        'policy.a_b.yml',
        'policy.-a.yml',
        'policy.a-.yml',
        'policy.a--b.yml',
        'policy.a.b.yml',
        'other.yml',
        'publications.json',
        './policy.yml',
        'sub/policy.yml',
        '../policy.yml',
        '/abs/policy.yml',
        'sub\\policy.yml',
    ];
    for (const name of bad) {
        assert.throws(() => validateManifestName(name), Unreachable, `should reject ${JSON.stringify(name)}`);
    }
    assert.throws(() => validateManifestName('sub/policy.yml'), /not a path/);
});

test('logNameFor derives the log name from the manifest name', () => {
    assert.equal(logNameFor('policy.yml'), 'publications.json');
    assert.equal(logNameFor('policy.cet.yml'), 'publications.cet.json');
    assert.equal(logNameFor('policy.gaseous-fuel.yml'), 'publications.gaseous-fuel.json');
    assert.throws(() => logNameFor('x/policy.yml'), Unreachable);
});

test('discoverManifests lists manifests only, policy.yml first, ignoring look-alikes', () => {
    const dir = tmpDir({
        'policy.solid.yml': '',
        'policy.liquid.yml': '',
        'policy.yml': '',
        'policy.schema.json': '',
        'policy.Bad.yml': '',
        'publications.json': '',
        'readme.md': '',
    });
    fs.mkdirSync(path.join(dir, 'policy.dir.yml'));
    assert.deepEqual(discoverManifests(dir), ['policy.yml', 'policy.liquid.yml', 'policy.solid.yml']);
    assert.deepEqual(discoverManifests(path.join(dir, 'missing')), []);
});

test('resolveManifests: single manifest needs no flag, whatever its name', () => {
    assert.deepEqual(resolveManifests(tmpDir({ 'policy.yml': '' }), undefined, false), ['policy.yml']);
    assert.deepEqual(resolveManifests(tmpDir({ 'policy.only.yml': '' }), undefined, false), ['policy.only.yml']);
});

test('resolveManifests: no manifest falls back to policy.yml so the old message is kept', () => {
    assert.deepEqual(resolveManifests(tmpDir(), undefined, false), ['policy.yml']);
});

test('resolveManifests: several manifests without --manifest fail clearly unless allowAll', () => {
    const cases = [
        [{ 'policy.a.yml': '', 'policy.b.yml': '' }, ['policy.a.yml', 'policy.b.yml']],
        [{ 'policy.b.yml': '', 'policy.yml': '' }, ['policy.yml', 'policy.b.yml']],
    ];
    for (const [files, sorted] of cases) {
        const dir = tmpDir(files);
        assert.throws(() => resolveManifests(dir, undefined, false), (e) => {
            assert.ok(e instanceof Unreachable);
            assert.match(e.message, /several manifests/);
            assert.match(e.message, /--manifest/);
            for (const n of sorted) {
                assert.ok(e.message.includes(n));
            }
            return true;
        });
        assert.deepEqual(resolveManifests(dir, undefined, true), sorted);
    }
});

test('resolveManifests: --manifest wins, is validated, and need not exist yet', () => {
    const dir = tmpDir({ 'policy.a.yml': '', 'policy.b.yml': '' });
    assert.deepEqual(resolveManifests(dir, 'policy.b.yml', false), ['policy.b.yml']);
    assert.deepEqual(resolveManifests(dir, 'policy.c.yml', true), ['policy.c.yml']);
    assert.throws(() => resolveManifests(dir, '../policy.yml', false), Unreachable);
});

test('policyIdMismatchMessage names the log, the manifest and both ids', () => {
    assert.equal(
        policyIdMismatchMessage('publications.json', 'a', 'policy.yml', 'b'),
        'publications.json is for "a" but policy.yml id is "b".'
    );
    assert.equal(
        policyIdMismatchMessage('publications.cet.json', 'x', 'policy.cet.yml', 'y'),
        'publications.cet.json is for "x" but policy.cet.yml id is "y".'
    );
});

test('readPolicyId reads the named manifest and names it when missing', () => {
    const dir = tmpDir({ 'policy.cet.yml': 'id: tymlez-cet # note\nname: X\n', 'policy.yml': 'id: "plain"\n' });
    assert.equal(readPolicyId(dir, 'policy.cet.yml'), 'tymlez-cet');
    assert.equal(readPolicyId(dir, 'policy.yml'), 'plain');
    assert.throws(() => readPolicyId(dir, 'policy.nope.yml'), (e) => e instanceof Refused && /No policy\.nope\.yml in/.test(e.message));
});

// CLI behaviour that never reaches the network.
function run(args) {
    return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
}

test('CLI: recording in a multi-manifest folder without --manifest exits 2 before any lookup', () => {
    const dir = tmpDir({ 'policy.a.yml': 'id: a\n', 'policy.b.yml': 'id: b\n' });
    const r = run(['--dir', dir, '--network', 'testnet', '--hedera-timestamp', '1.1']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /several manifests \(policy\.a\.yml, policy\.b\.yml\)/);
});

test('CLI: bad --manifest exits 2', () => {
    const dir = tmpDir({ 'policy.yml': 'id: a\n' });
    const r = run(['--dir', dir, '--manifest', '../policy.yml', '--check']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /not a path/);
});

test('CLI: --check with no logs is a no-op for every manifest, and reports a policy_id mismatch', () => {
    const dir = tmpDir({ 'policy.a.yml': 'id: a\n', 'policy.b.yml': 'id: b\n' });
    let r = run(['--dir', dir, '--check']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /No publications\.a\.json/);
    assert.match(r.stdout, /No publications\.b\.json/);

    fs.writeFileSync(path.join(dir, 'publications.b.json'), JSON.stringify({ policy_id: 'wrong', entries: [] }));
    r = run(['--dir', dir, '--check']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /publications\.b\.json is for "wrong" but policy\.b\.yml id is "b"/);

    r = run(['--dir', dir, '--manifest', 'policy.a.yml', '--check']);
    assert.equal(r.status, 0);
});

test('CLI: single-manifest folder keeps the old behaviour and wording', () => {
    const dir = tmpDir({ 'policy.yml': 'id: a\n' });
    let r = run(['--dir', dir, '--check']);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /No publications\.json in/);
    fs.writeFileSync(path.join(dir, 'publications.json'), JSON.stringify({ policy_id: 'z', entries: [] }));
    r = run(['--dir', dir, '--check']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /publications\.json failed verification/);
});
