#!/usr/bin/env node
/**
 * Reads the exported CSV from the policy backfill Google Sheet and writes
 * a policy.yml file into each policy folder for rows with review_status = "ready".
 *
 * Usage:
 *   node tools/generate-manifests.js [--input path/to/export.csv] [--overwrite]
 *
 * Defaults:
 *   --input   tools/policy-backfill-export.csv
 *   --overwrite  false  (skip folders that already have policy.yml)
 */

'use strict';

const path = require('path');
const fs   = require('fs');

const LIBRARY_ROOT = path.resolve(__dirname, '../Methodology Library');

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args       = process.argv.slice(2);
const overwrite  = args.includes('--overwrite');
const inputFlag  = args.indexOf('--input');
const INPUT_PATH = inputFlag >= 0
  ? path.resolve(args[inputFlag + 1])
  : path.resolve(__dirname, 'policy-backfill-export.csv');

// ─── CSV parse ────────────────────────────────────────────────────────────────

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1)
    .filter(l => l.trim())
    .map(l => {
      const vals = splitCsvLine(l);
      const row = {};
      headers.forEach((h, i) => { row[h.trim()] = (vals[i] ?? '').trim(); });
      return row;
    });
}

function splitCsvLine(line) {
  const fields = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { fields.push(cur); cur = ''; }
      else cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

// ─── YAML helpers ─────────────────────────────────────────────────────────────

function yamlStr(v) {
  if (!v) return '""';
  if (/[\n:{}[\],&*#?|<>=!%@`]/.test(v) || v.startsWith('"') || v.startsWith("'")) {
    return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return v;
}

function csvList(field) {
  if (!field) return [];
  return field.split(',').map(s => s.trim()).filter(Boolean);
}

function buildManifest(row) {
  const lines = [];

  lines.push(`id: ${yamlStr(row.id)}`);
  lines.push(`name: ${yamlStr(row.name)}`);
  lines.push(`version: "${row.version || '1.0.0'}"`);

  lines.push(`description: >`);
  lines.push(`  ${row.description || 'TODO: add description'}`);

  lines.push(`policy_type: ${row.policy_type}`);
  lines.push(`status: ${row.status || 'draft'}`);
  lines.push(`license: ${row.license || 'Apache-2.0'}`);
  lines.push(`category: ${row.category}`);

  // authors
  const authors = csvList(row.authors);
  if (authors.length) {
    lines.push('authors:');
    authors.forEach(a => lines.push(`  - name: ${yamlStr(a)}`));
  } else {
    lines.push('authors:');
    lines.push('  - name: ""  # TODO');
  }

  // tags
  const tags = csvList(row.tags);
  if (tags.length) {
    lines.push('tags:');
    tags.forEach(t => lines.push(`  - ${t}`));
  }

  // optional fields
  if (row.standard_body)      lines.push(`standard_body: ${yamlStr(row.standard_body)}`);
  if (row.methodology_id)     lines.push(`methodology_id: ${yamlStr(row.methodology_id)}`);
  if (row.methodology_version) lines.push(`methodology_version: "${row.methodology_version}"`);
  if (row.token_type)         lines.push(`token_type: ${row.token_type}`);
  if (row.token_standard)     lines.push(`token_standard: ${row.token_standard}`);
  if (row.registry_status)    lines.push(`registry_status: ${row.registry_status}`);
  if (row.hedera_timestamp)   lines.push(`hedera_timestamp: "${row.hedera_timestamp}"`);

  const sdgs = csvList(row.sdg_alignment).map(Number).filter(n => n >= 1 && n <= 17);
  if (sdgs.length) {
    lines.push(`sdg_alignment: [${sdgs.join(', ')}]`);
  }

  if (row.sector)         lines.push(`sector: ${row.sector}`);

  const roles = csvList(row.roles);
  if (roles.length) {
    lines.push('roles:');
    roles.forEach(r => lines.push(`  - ${yamlStr(r)}`));
  }

  if (row.supersedes)     lines.push(`supersedes: ${yamlStr(row.supersedes)}`);
  if (row.superseded_by)  lines.push(`superseded_by: ${yamlStr(row.superseded_by)}`);

  return lines.join('\n') + '\n';
}

// ─── main ─────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(INPUT_PATH)) {
    console.error(`Input file not found: ${INPUT_PATH}`);
    console.error('Export the Google Sheet as CSV and place it at that path, or pass --input <path>.');
    process.exit(1);
  }

  const text = fs.readFileSync(INPUT_PATH, 'utf8');
  const rows = parseCsv(text);
  const ready = rows.filter(r => r.review_status === 'ready');

  console.log(`Total rows: ${rows.length}  |  Ready: ${ready.length}`);

  let written = 0, skipped = 0, errors = 0;

  for (const row of ready) {
    if (!row.folder_path) { console.warn('  SKIP (no folder_path):', row.id); skipped++; continue; }

    const dir     = path.join(LIBRARY_ROOT, row.folder_path);
    const outFile = path.join(dir, 'policy.yml');

    if (!fs.existsSync(dir)) {
      console.warn(`  SKIP (folder not found): ${row.folder_path}`);
      skipped++; continue;
    }

    if (fs.existsSync(outFile) && !overwrite) {
      console.log(`  SKIP (exists): ${row.folder_path}/policy.yml`);
      skipped++; continue;
    }

    try {
      fs.writeFileSync(outFile, buildManifest(row), 'utf8');
      console.log(`  WROTE: ${row.folder_path}/policy.yml`);
      written++;
    } catch (e) {
      console.error(`  ERROR: ${row.folder_path} — ${e.message}`);
      errors++;
    }
  }

  console.log(`\nDone. Written: ${written}  Skipped: ${skipped}  Errors: ${errors}`);
  if (written > 0) {
    console.log('\nNext: review generated files, then commit and open a PR.');
  }
}

main();
