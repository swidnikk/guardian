#!/usr/bin/env node
'use strict';

/**
 * Record or verify Hedera publications for one policy folder.
 *
 *   node scripts/record-publication.js --dir <policy folder> --network <mainnet|testnet> --hedera-timestamp <s.n>
 *   node scripts/record-publication.js --dir <policy folder> --check
 *
 * Record: looks the timestamp up on the mirror node for the named network, refuses unless the
 * message exists there and is a Guardian publish-policy message, then appends an entry to
 * <dir>/publications.json (created if absent). Re-recording the same entry is a no-op.
 * Check: re-verifies every entry in <dir>/publications.json and writes nothing.
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

function readPolicyId(dir) {
    const file = path.join(dir, 'policy.yml');
    if (!fs.existsSync(file)) {
        throw new Refused(`No policy.yml in ${dir}. A policy folder needs its manifest first.`);
    }
    // Top-level scalar only; policy.yml ids are plain kebab-case slugs.
    const m = fs.readFileSync(file, 'utf8').match(/^id:\s*["']?([a-z0-9]+(?:-[a-z0-9]+)*)["']?\s*(?:#.*)?$/m);
    if (!m) {
        throw new Refused(`Could not read a top-level id from ${file}.`);
    }
    return m[1];
}

function readLog(dir) {
    const file = path.join(dir, 'publications.json');
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

function writeLog(dir, log) {
    fs.writeFileSync(path.join(dir, 'publications.json'), JSON.stringify(log, null, 2) + '\n');
}

async function record(dir, network, timestamp) {
    assertClaimShape(network, timestamp);
    const policyId = readPolicyId(dir);
    const log = readLog(dir) || { policy_id: policyId, entries: [] };
    if (log.policy_id !== policyId) {
        throw new Refused(`publications.json is for "${log.policy_id}" but policy.yml id is "${policyId}".`);
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
    writeLog(dir, log);
    console.log(`Recorded ${network} ${timestamp} (version ${ordered.version || '?'}, topic ${ordered.hedera_topic_id || '?'}).`);
}

async function check(dir) {
    const log = readLog(dir);
    if (!log) {
        console.log(`No publications.json in ${dir}. Nothing to check.`);
        return;
    }
    const policyId = readPolicyId(dir);
    let failed = false;
    if (log.policy_id !== policyId) {
        console.error(`FAIL policy_id "${log.policy_id}" does not match policy.yml id "${policyId}".`);
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
        throw new Refused('publications.json failed verification.');
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.dir) {
        throw new Unreachable('Usage: --dir <policy folder> (--check | --network <mainnet|testnet> --hedera-timestamp <s.n>)');
    }
    const dir = path.resolve(args.dir);
    if (args.check) {
        return check(dir);
    }
    if (!args.network || !args['hedera-timestamp']) {
        throw new Unreachable('Recording needs --network and --hedera-timestamp. Use --check to verify an existing log.');
    }
    return record(dir, args.network, args['hedera-timestamp']);
}

main().catch((e) => {
    console.error(e.message);
    process.exit(e instanceof Refused ? 1 : 2);
});
