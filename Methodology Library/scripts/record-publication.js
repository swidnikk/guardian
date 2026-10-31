#!/usr/bin/env node
'use strict';

/**
 * Record or verify Hedera publications for one policy folder.
 *
 *   node scripts/record-publication.js --dir <policy folder> [--manifest <file>] --network <mainnet|testnet> --hedera-timestamp <s.n>
 *   node scripts/record-publication.js --dir <policy folder> [--manifest <file>] --check
 *
 * Record: looks the timestamp up on the mirror node for the named network, refuses unless the
 * message exists there and is a Guardian publish-policy message, then appends an entry to
 * the policy's publication log in <dir> (created if absent). Re-recording the same entry is a no-op.
 * Check: re-verifies every entry in the policy's log and writes nothing.
 *
 * Manifest and log: --manifest names the manifest file in <dir> (default policy.yml). The log name
 * follows from it: policy.yml -> publications.json, policy.<slug>.yml -> publications.<slug>.json.
 * A folder with a single manifest needs no --manifest. A folder with several (policy.yml plus
 * policy.*.yml, or several policy.*.yml) requires --manifest to record; --check without --manifest
 * checks the log of every manifest in the folder.
 *
 * Exit codes: 0 ok, 1 refused or verification failed, 2 mirror node unreachable or bad usage.
 * Mirror URLs can be overridden with MIRROR_URL_MAINNET / MIRROR_URL_TESTNET (used by tests).
 * No dependencies; needs Node 18+ for global fetch.
 */

const fs = require('fs');
const path = require('path');

const MIRRORS = {
    mainnet: process.env.MIRROR_URL_MAINNET || 'https://mainnet-public.mirrornode.hedera.com',
    testnet: process.env.MIRROR_URL_TESTNET || 'https://testnet.mirrornode.hedera.com',
};
const TIMESTAMP = /^[0-9]+\.[0-9]+$/;
const MANIFEST_NAME = /^policy(\.[a-z0-9]+(-[a-z0-9]+)*)?\.yml$/;
const DEFAULT_MANIFEST = 'policy.yml';

class Refused extends Error {}
class Unreachable extends Error {}

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--check') {
            args.check = true;
        } else if (a.startsWith('--') && i + 1 < argv.length) {
            args[a.slice(2)] = argv[++i];
        } else {
            throw new Unreachable(`Unknown or incomplete argument: ${a}`);
        }
    }
    return args;
}

/** Validate a --manifest value: a bare file name policy.yml or policy.<slug>.yml (slug kebab-case). */
function validateManifestName(name) {
    if (typeof name !== 'string' || name === '') {
        throw new Unreachable('--manifest needs a file name such as policy.yml or policy.<slug>.yml.');
    }
    if (/[\\/]/.test(name)) {
        throw new Unreachable(`--manifest must be a file name inside --dir, not a path: "${name}".`);
    }
    if (!MANIFEST_NAME.test(name)) {
        throw new Unreachable(`--manifest must be policy.yml or policy.<slug>.yml with a kebab-case slug, got "${name}".`);
    }
    return name;
}

/** policy.yml -> publications.json; policy.<slug>.yml -> publications.<slug>.json. */
function logNameFor(manifestName) {
    validateManifestName(manifestName);
    return manifestName.replace(/^policy/, 'publications').replace(/\.yml$/, '.json');
}

/** Manifest files in a directory (policy.yml and policy.<slug>.yml), sorted, policy.yml first. */
function discoverManifests(dir) {
    if (!fs.existsSync(dir)) {
        return [];
    }
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((d) => !d.isDirectory() && MANIFEST_NAME.test(d.name))
        .map((d) => d.name)
        .sort((a, b) => (a === DEFAULT_MANIFEST ? -1 : b === DEFAULT_MANIFEST ? 1 : a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Manifests an invocation applies to. With --manifest: exactly that one. Without: the single
 * manifest in the folder, or (several) every one when allowAll is set, else a usage error.
 * A folder with no manifests resolves to the default name, so existing "missing" messages are kept.
 */
function resolveManifests(dir, requested, allowAll) {
    if (requested !== undefined) {
        return [validateManifestName(requested)];
    }
    const found = discoverManifests(dir);
    if (found.length === 0) {
        return [DEFAULT_MANIFEST];
    }
    if (found.length === 1 || allowAll) {
        return found;
    }
    throw new Unreachable(
        `${dir} holds several manifests (${found.join(', ')}). Say which one with --manifest <file>.`
    );
}

function policyIdMismatchMessage(logName, logId, manifestName, policyId) {
    return `${logName} is for "${logId}" but ${manifestName} id is "${policyId}".`;
}

function readPolicyId(dir, manifestName) {
    const file = path.join(dir, manifestName);
    if (!fs.existsSync(file)) {
        throw new Refused(`No ${manifestName} in ${dir}. A policy folder needs its manifest first.`);
    }
    // Top-level scalar only; manifest ids are plain kebab-case slugs.
    const m = fs.readFileSync(file, 'utf8').match(/^id:\s*["']?([a-z0-9]+(?:-[a-z0-9]+)*)["']?\s*(?:#.*)?$/m);
    if (!m) {
        throw new Refused(`Could not read a top-level id from ${file}.`);
    }
    return m[1];
}

function readLog(dir, logName) {
    const file = path.join(dir, logName);
    if (!fs.existsSync(file)) {
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        throw new Refused(`${file} is not valid JSON: ${e.message}`);
    }
}

/** Fetch and decode the Guardian message at a timestamp. Returns null on 404. */
async function lookup(network, timestamp) {
    const url = `${MIRRORS[network]}/api/v1/topics/messages/${timestamp}`;
    let res;
    try {
        res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    } catch (e) {
        throw new Unreachable(`${network} mirror node unreachable (${e.message}). Nothing was changed.`);
    }
    if (res.status === 404) {
        return null;
    }
    if (!res.ok) {
        throw new Unreachable(`${network} mirror node returned HTTP ${res.status}. Not treating this as "not found".`);
    }
    const body = await res.json();
    let message;
    try {
        message = JSON.parse(Buffer.from(body.message, 'base64').toString('utf8'));
    } catch {
        throw new Refused(`${timestamp} on ${network} is not a Guardian JSON message.`);
    }
    return { topicId: body.topic_id, message };
}

/** Verify a claim; return { version, topicId } from the message. Throws Refused if it does not hold. */
function assertClaimShape(network, timestamp) {
    if (!['mainnet', 'testnet'].includes(network)) {
        throw new Refused(`--network must be mainnet or testnet, got "${network}".`);
    }
    if (!TIMESTAMP.test(timestamp)) {
        throw new Refused(`Timestamp "${timestamp}" must look like 1707207286.119377003 (seconds.nanoseconds).`);
    }
}

async function verify(network, timestamp) {
    assertClaimShape(network, timestamp);
    const found = await lookup(network, timestamp);
    if (!found) {
        throw new Refused(`${timestamp} does not exist on ${network}. It may be on the other network.`);
    }
    const { message, topicId } = found;
    if (message.action !== 'publish-policy') {
        throw new Refused(
            `${timestamp} on ${network} is not a publish-policy message (type=${message.type}, action=${message.action}).`
        );
    }
    const did = /^did:hedera:(mainnet|testnet):/.exec(message.owner || '');
    if (did && did[1] !== network) {
        throw new Refused(`${timestamp} was found on ${network} but its owner DID is on ${did[1]}.`);
    }
    return { version: message.version, topicId };
}

function writeLog(dir, logName, log) {
    fs.writeFileSync(path.join(dir, logName), JSON.stringify(log, null, 2) + '\n');
}

async function record(dir, manifestName, network, timestamp) {
    assertClaimShape(network, timestamp);
    const logName = logNameFor(manifestName);
    const policyId = readPolicyId(dir, manifestName);
    const log = readLog(dir, logName) || { policy_id: policyId, entries: [] };
    if (log.policy_id !== policyId) {
        throw new Refused(policyIdMismatchMessage(logName, log.policy_id, manifestName, policyId));
    }
    const existing = log.entries.find((e) => e.hedera_timestamp === timestamp);
    if (existing && existing.network === network) {
        console.log(`Already recorded: ${network} ${timestamp}. Nothing to do.`);
        return;
    }
    if (existing) {
        throw new Refused(`${timestamp} is already recorded as ${existing.network}, not ${network}.`);
    }
    const { version, topicId } = await verify(network, timestamp);
    const entry = { network, hedera_timestamp: timestamp };
    if (version) {
        entry.version = String(version);
    }
    if (topicId) {
        entry.hedera_topic_id = topicId;
    }
    // Keep the documented key order: network, version, hedera_timestamp, hedera_topic_id.
    const ordered = {};
    for (const k of ['network', 'version', 'hedera_timestamp', 'hedera_topic_id']) {
        if (k in entry) {
            ordered[k] = entry[k];
        }
    }
    log.entries.push(ordered);
    writeLog(dir, logName, log);
    console.log(`Recorded ${network} ${timestamp} (version ${ordered.version || '?'}, topic ${ordered.hedera_topic_id || '?'}).`);
}

async function check(dir, manifestName) {
    const logName = logNameFor(manifestName);
    const log = readLog(dir, logName);
    if (!log) {
        console.log(`No ${logName} in ${dir}. Nothing to check.`);
        return;
    }
    const policyId = readPolicyId(dir, manifestName);
    let failed = false;
    if (log.policy_id !== policyId) {
        console.error(`FAIL ${policyIdMismatchMessage(logName, log.policy_id, manifestName, policyId)}`);
        failed = true;
    }
    for (const e of log.entries || []) {
        const label = `${e.network} ${e.hedera_timestamp}`;
        try {
            const got = await verify(e.network, e.hedera_timestamp);
            const problems = [];
            if (e.version && got.version !== e.version) {
                problems.push(`version ${e.version} != ${got.version}`);
            }
            if (e.hedera_topic_id && got.topicId !== e.hedera_topic_id) {
                problems.push(`topic ${e.hedera_topic_id} != ${got.topicId}`);
            }
            if (problems.length) {
                throw new Refused(problems.join('; '));
            }
            console.log(`ok   ${label}`);
        } catch (err) {
            if (err instanceof Unreachable) {
                throw err;
            }
            console.error(`FAIL ${label}: ${err.message}`);
            failed = true;
        }
    }
    if (failed) {
        throw new Refused(`${logName} failed verification.`);
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.dir) {
        throw new Unreachable(
            'Usage: --dir <policy folder> [--manifest <policy.yml | policy.<slug>.yml>] ' +
                '(--check | --network <mainnet|testnet> --hedera-timestamp <s.n>)'
        );
    }
    const dir = path.resolve(args.dir);
    if (args.check) {
        // Without --manifest, a multi-manifest folder has every manifest's log checked.
        const manifests = resolveManifests(dir, args.manifest, true);
        if (manifests.length === 1) {
            return check(dir, manifests[0]);
        }
        let failed = false;
        for (const manifestName of manifests) {
            try {
                await check(dir, manifestName);
            } catch (e) {
                if (!(e instanceof Refused)) {
                    throw e;
                }
                console.error(e.message);
                failed = true;
            }
        }
        if (failed) {
            throw new Refused('Verification failed.');
        }
        return;
    }
    if (!args.network || !args['hedera-timestamp']) {
        throw new Unreachable('Recording needs --network and --hedera-timestamp. Use --check to verify an existing log.');
    }
    const [manifestName] = resolveManifests(dir, args.manifest, false);
    return record(dir, manifestName, args.network, args['hedera-timestamp']);
}

if (require.main === module) {
    main().catch((e) => {
        console.error(e.message);
        process.exit(e instanceof Refused ? 1 : 2);
    });
}

module.exports = {
    MANIFEST_NAME,
    validateManifestName,
    logNameFor,
    discoverManifests,
    resolveManifests,
    policyIdMismatchMessage,
    readPolicyId,
    Refused,
    Unreachable,
};
