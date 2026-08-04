#!/usr/bin/env node
/**
 * Scans the Methodology Library and writes tools/policy-backfill.csv —
 * a pre-populated table for team review and policy.yml backfill.
 * Upload to Google Sheets for collaborative editing.
 *
 * Usage:  node tools/scan-library.js
 * Output: tools/policy-backfill.csv
 */

'use strict';

const path = require('path');
const fs   = require('fs');

const LIBRARY_ROOT = path.resolve(__dirname, '../Methodology Library');
const OUTPUT_PATH  = path.resolve(__dirname, 'policy-backfill.csv');

// ─── heuristics ───────────────────────────────────────────────────────────────

const CONTAINER_DIR_RE = /^(Policies|policy|policies)$/i;
const VERSION_DIR_RE   = /^v\d/i;

const STANDARD_BODY = {
  'Verra':                                             'Verra',
  'Clean Development Mechanism (CDM)':                 'CDM',
  'Gold Standard':                                     'Gold Standard',
  'Greenhouse Gas (GHG)':                              'GHG Protocol',
  'International Renewable Energy Certificate (iREC)': 'iREC',
  'Global Carbon Council (GCC)':                       'GCC',
  'Climate Action Reserve (CAR)':                      'CAR',
  'Dovu':                                              'Dovu',
  'African Clean Enery (ACE)':                         'African Clean Energy',
  'DLT Earth Methodology Bounty Program':              'DLT Earth',
  'Tolam Digitization of Analog Assets Policy':        'Tolam',
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function toKebab(str) {
  return str
    .toLowerCase()
    .replace(/[()&]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function walkFiles(dir, results = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return results; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(full, results);
    else results.push(full);
  }
  return results;
}

function isPolicyFile(f) {
  return /\.policy(\.zip)?$/.test(path.basename(f));
}

// ─── policy root detection ────────────────────────────────────────────────────

function findPolicyRoots() {
  const allFiles = walkFiles(LIBRARY_ROOT);
  const rootSet = new Map();

  // Pass 1: directories containing .policy bundles
  for (const f of allFiles.filter(isPolicyFile)) {
    let dir = path.dirname(f);
    const name = path.basename(dir);

    if (CONTAINER_DIR_RE.test(name) || VERSION_DIR_RE.test(name)) {
      dir = path.dirname(dir);
    }

    const rel = path.relative(LIBRARY_ROOT, dir);
    if (/\bTools\b/.test(rel) || /\bassets\b/i.test(rel)) continue;

    rootSet.set(dir, true);
  }

  // Pass 2: directories that already have a policy.yml (even without a .policy bundle)
  for (const f of allFiles.filter(f => path.basename(f) === 'policy.yml')) {
    rootSet.set(path.dirname(f), true);
  }

  return [...rootSet.keys()].sort();
}

// ─── metadata inference ───────────────────────────────────────────────────────

function parsePath(absDir) {
  const rel   = path.relative(LIBRARY_ROOT, absDir);
  const parts = rel.split(path.sep);

  const topLevel   = parts[0];
  const folderName = parts[parts.length - 1];

  const standardBody = STANDARD_BODY[topLevel] ?? '';

  // Methodology ID — extract leading token from folder name
  const midMatch = folderName.match(
    /^(VM\d+|PWRM\d+|VMR\d+|VT\d+|ACM\d+|AMS-[IVX]+\.[A-Z]+|AR-ACM\d+|AM\d+|GCCM\d+|MECD\s+v[\d.]+)/i
  );
  const methodologyId = midMatch ? midMatch[1].trim() : '';

  // policy_type
  let policyType = 'standard-implementation';
  if (['Hackathon', 'DLT Earth Methodology Bounty Program', 'Work In Progress'].includes(topLevel))
    policyType = 'proof-of-concept';
  else if (topLevel === 'Modules')
    policyType = 'toolkit';
  else if (topLevel === 'Dovu')
    policyType = 'mrv-template';
  else if (!standardBody)
    policyType = 'novel-methodology';

  // category
  const CATEGORY_MAP = {
    'Verra':                                             'carbon-credits',
    'Clean Development Mechanism (CDM)':                 'carbon-credits',
    'Gold Standard':                                     'carbon-credits',
    'Climate Action Reserve (CAR)':                      'carbon-credits',
    'Global Carbon Council (GCC)':                       'carbon-credits',
    'DLT Earth Methodology Bounty Program':              'carbon-credits',
    'African Clean Enery (ACE)':                         'carbon-credits',
    'International Renewable Energy Certificate (iREC)': 'renewable-energy',
    'Greenhouse Gas (GHG)':                              'emission-reporting',
    'Dovu':                                              'sustainable-agriculture',
    'EUDR Precheck':                                     'supply-chain',
    'Verified Farmer Payments':                          'supply-chain',
    'Verified Premium Payments':                         'supply-chain',
    'Living Income Price (LIP)':                         'supply-chain',
  };
  const category = CATEGORY_MAP[topLevel] ?? '';

  // sector
  let sector = '';
  if (topLevel === 'International Renewable Energy Certificate (iREC)') sector = 'energy';
  else if (topLevel === 'Dovu') sector = 'agriculture';
  else if (topLevel === 'Greenhouse Gas (GHG)') sector = 'industrial';
  else if (/^AMS-I/i.test(methodologyId))   sector = 'energy';
  else if (/^AMS-II/i.test(methodologyId))  sector = 'energy';
  else if (/^AMS-III/i.test(methodologyId)) sector = 'agriculture';
  else if (/^ACM/i.test(methodologyId))     sector = 'energy';
  else if (/^AR-ACM/i.test(methodologyId))  sector = 'land-use';
  else if (/^VM/i.test(methodologyId))      sector = 'land-use';
  else if (/^PWRM/i.test(methodologyId))    sector = 'waste';
  else if (/^VMR/i.test(methodologyId))     sector = 'land-use';

  // token_type / token_standard
  let tokenType = '';
  let tokenStandard = '';
  if (topLevel === 'Verra') {
    tokenType = parts[1] === 'Plastic Waste Reduction Standard (PWRM)' ? 'PWS' : 'VCU';
    tokenStandard = 'fungible';
  } else if (topLevel === 'International Renewable Energy Certificate (iREC)') {
    tokenType = 'iREC'; tokenStandard = 'fungible';
  } else if (topLevel === 'Clean Development Mechanism (CDM)') {
    tokenType = 'CER'; tokenStandard = 'fungible';
  }

  // roles
  const carbonBodies = new Set(['Verra', 'CDM', 'Gold Standard', 'GCC', 'CAR', 'iREC']);
  const roles = carbonBodies.has(standardBody) ? 'Admin, Project Proponent, VVB' : '';

  // suggested id
  const PREFIX = {
    'Verra': 'verra', 'Clean Development Mechanism (CDM)': 'cdm',
    'Gold Standard': 'gs', 'Greenhouse Gas (GHG)': 'ghg',
    'International Renewable Energy Certificate (iREC)': 'irec',
    'Global Carbon Council (GCC)': 'gcc', 'Climate Action Reserve (CAR)': 'car',
    'Dovu': 'dovu', 'African Clean Enery (ACE)': 'ace',
    'DLT Earth Methodology Bounty Program': 'dlt-earth',
    'Tolam Digitization of Analog Assets Policy': 'tolam',
    'EUDR Precheck': 'eudr', 'Living Income Price (LIP)': 'lip',
    'Verified Farmer Payments': 'verified-farmer', 'Verified Premium Payments': 'verified-premium',
    'Hackathon': 'hackathon', 'Work In Progress': 'wip',
    'Other': 'other', 'Modules': 'modules',
  };
  const prefix = PREFIX[topLevel] ?? toKebab(topLevel);
  const id = `${prefix}-${toKebab(folderName)}`.replace(/--+/g, '-');

  // tags
  const tags = [
    standardBody ? toKebab(standardBody) : null,
    methodologyId ? toKebab(methodologyId) : null,
    sector || null,
  ].filter(Boolean).join(', ');

  const hasPolicyYml = fs.existsSync(path.join(absDir, 'policy.yml'));

  return {
    folder_path:         rel,
    has_policy_yml:      hasPolicyYml ? 'YES' : '',
    review_status:       hasPolicyYml ? 'merged' : 'not-started',
    assignee:            '',
    notes:               '',
    id,
    name:                folderName,
    version:             '1.0.0',
    description:         '',
    policy_type:         policyType,
    status:              'draft',
    license:             'Apache-2.0',
    category,
    authors:             '',
    tags,
    standard_body:       standardBody,
    methodology_id:      methodologyId,
    methodology_version: '',
    token_type:          tokenType,
    token_standard:      tokenStandard,
    registry_status:     standardBody ? 'none' : '',
    hedera_timestamp:    '',
    sdg_alignment:       '',
    sector,
    roles,
    supersedes:          '',
    superseded_by:       '',
  };
}

// ─── CSV serialisation ────────────────────────────────────────────────────────

function csvEscape(v) {
  const s = String(v ?? '');
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map(r => headers.map(h => csvEscape(r[h])).join(',')),
  ];
  return lines.join('\n');
}

// ─── main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('Scanning Methodology Library…');
  const roots = findPolicyRoots();
  console.log(`  Found ${roots.length} policy roots`);

  const rows = roots.map(parsePath);
  rows.sort((a, b) => {
    if (a.has_policy_yml && !b.has_policy_yml) return -1;
    if (!a.has_policy_yml && b.has_policy_yml) return 1;
    return a.folder_path.localeCompare(b.folder_path);
  });

  const csv = toCsv(rows);
  fs.writeFileSync(OUTPUT_PATH, csv, 'utf8');

  console.log(`\nWrote: ${OUTPUT_PATH}`);
  console.log(`Rows:  ${rows.length}  (${rows.filter(r => r.has_policy_yml === 'YES').length} already have policy.yml)`);
}

main();
