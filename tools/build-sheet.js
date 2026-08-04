#!/usr/bin/env node
/**
 * Builds policy-backfill.xlsx with 5 sheets:
 *   1. Policies      – name, paths, review_status, notes
 *   2. Required      – required manifest fields (lookups from Policies)
 *   3. Optional      – optional manifest fields (lookups from Policies)
 *   4. Dropdown Data – enum lists that drive validated dropdowns
 *   5. Manifest Files – reserved (blank)
 *
 * Usage:  node tools/build-sheet.js
 * Output: tools/policy-backfill.xlsx
 */
'use strict';

const path    = require('path');
const fs      = require('fs');
const ExcelJS = require('exceljs');

const CSV_PATH = path.resolve(__dirname, 'policy-backfill.csv');
const OUT_PATH = path.resolve(__dirname, 'policy-backfill.xlsx');

// ─── CSV parse ────────────────────────────────────────────────────────────────
function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const headers = splitLine(lines[0]);
  return {
    headers,
    rows: lines.slice(1).filter(l => l.trim()).map(l => {
      const vals = splitLine(l);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim(); });
      return obj;
    }),
  };
}
function splitLine(line) {
  const fields = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
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

// ─── colour constants ─────────────────────────────────────────────────────────
const DARK_BLUE  = 'FF1F4E79';
const MID_BLUE   = 'FF2E75B6';
const DARK_GREEN = 'FF375623';
const MID_GREEN  = 'FF548235';
const DARK_GRAY  = 'FF404040';
const WHITE      = 'FFFFFFFF';
const LIGHT_BLUE = 'FFDCE6F1';
const LIGHT_GRN  = 'FFE2EFDA';
const LIGHT_GRAY = 'FFF2F2F2';
const ORANGE_HL  = 'FFFCE5CD'; // highlights blank required cells

// ─── helpers ──────────────────────────────────────────────────────────────────
function colLetter(n) {
  let s = '';
  while (n > 0) { s = String.fromCharCode(64 + ((n - 1) % 26 + 1)) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function styleHeader(row, bgArgb, fgArgb = WHITE) {
  row.height = 20;
  row.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
    cell.font = { bold: true, color: { argb: fgArgb }, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF000000' } } };
  });
}

function styleExampleRow(row) {
  row.height = 15;
  row.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_GRAY } };
    cell.font = { italic: true, color: { argb: 'FF888888' }, size: 9 };
    cell.alignment = { vertical: 'middle', wrapText: false };
  });
}

function addDropdown(ws, cellAddr, sheetName, col, start, end, required = false) {
  ws.dataValidations.add(cellAddr, {
    type: 'list',
    allowBlank: !required,
    formulae: [`'${sheetName}'!$${col}$${start}:$${col}$${end}`],
    showErrorMessage: true,
    errorTitle: 'Invalid value',
    error: 'Please choose from the dropdown list.',
  });
}

// ─── Dropdown Data sheet (Sheet 4) ────────────────────────────────────────────
// Call getDropdownInfo() first to get ranges; call buildDropdownSheet() later to add the worksheet.
const DD_COLS = [
  { key: 'review_status', label: 'review_status',
    values: ['not-started', 'in-progress', 'ready', 'merged'] },
  { key: 'policy_type', label: 'policy_type',
    values: ['standard-implementation', 'novel-methodology', 'mrv-template', 'proof-of-concept', 'toolkit', 'other'] },
  { key: 'manifest_status', label: 'status (manifest)',
    values: ['draft', 'candidate', 'active', 'deprecated', 'superseded'] },
  { key: 'category', label: 'category',
    values: ['carbon-credits', 'emission-reporting', 'renewable-energy', 'supply-chain', 'sustainable-agriculture', 'water', 'biodiversity', 'waste', 'other'] },
  { key: 'token_standard', label: 'token_standard',
    values: ['fungible', 'HIP-412-NFT', 'none'] },
  { key: 'registry_status', label: 'registry_status',
    values: ['none', 'pending', 'validated', 'revoked'] },
  { key: 'sector', label: 'sector',
    values: ['energy', 'transport', 'waste', 'land-use', 'industrial', 'agriculture', 'water', 'other'] },
  { key: 'roles_known', label: 'roles (known)',
    values: ['Admin', 'Project Proponent', 'VVB'] },
];

function getDropdownInfo() {
  const ranges = {};
  DD_COLS.forEach((c, i) => {
    const colL = colLetter(i + 1);
    ranges[c.key] = { col: colL, start: 2, end: 1 + c.values.length };
  });
  return { sheetName: 'Dropdown Data', ranges };
}

function buildDropdownSheet(wb) {
  const ws = wb.addWorksheet('Dropdown Data');

  // Header row
  ws.addRow(DD_COLS.map(c => c.label));
  styleHeader(ws.getRow(1), DARK_GRAY);

  // Find max length
  const maxLen = Math.max(...DD_COLS.map(c => c.values.length));

  for (let r = 0; r < maxLen; r++) {
    ws.addRow(DD_COLS.map(c => c.values[r] ?? ''));
    ws.getRow(r + 2).height = 15;
  }

  DD_COLS.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.max(c.label.length, ...c.values.map(v => v.length)) + 3;
  });
}

// ─── Sheet 1: Policies ────────────────────────────────────────────────────────
function buildPoliciesSheet(wb, rows, ddInfo) {
  const ws = wb.addWorksheet('Policies', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const COLS = [
    { key: 'name',          header: 'Policy Name',       width: 40 },
    { key: 'folder_path',   header: 'Current Path',      width: 55 },
    { key: 'proposed_path', header: 'Proposed Path',     width: 55 },
    { key: 'review_status', header: 'Review Status',     width: 15, dropdown: 'review_status' },
    { key: 'has_policy_yml',header: 'Has policy.yml',    width: 14 },
    { key: 'notes',         header: 'Notes',             width: 35 },
  ];

  ws.addRow(COLS.map(c => c.header));
  styleHeader(ws.getRow(1), DARK_BLUE);
  COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
  ws.autoFilter = { from: 'A1', to: `${colLetter(COLS.length)}1` };

  // Example row (row 2)
  const exPolicies = ws.addRow([
    'Verra VM0007 REDD+ Methodology Framework',
    'Verra/Verified Carbon Standard (VCS)/VM0007 REDD+ Methodology Framework',
    '(edit if path should change)',
    'not-started',
    '',
    '',
  ]);
  styleExampleRow(exPolicies);

  rows.forEach((r, ri) => {
    const dataRow = ws.addRow([
      r.name,
      r.folder_path,
      r.folder_path,        // proposed_path defaults to current
      r.review_status,
      r.has_policy_yml,
      '',                   // notes blank
    ]);
    dataRow.height = 15;
    dataRow.font = { size: 9 };

    const bg = ri % 2 === 0 ? LIGHT_BLUE : WHITE;
    dataRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    });

    const rowNum = ri + 3;
    COLS.forEach((col, ci) => {
      if (!col.dropdown) return;
      const { col: ddCol, start, end } = ddInfo.ranges[col.dropdown];
      addDropdown(ws, `${colLetter(ci + 1)}${rowNum}`, ddInfo.sheetName, ddCol, start, end);
    });
  });
}

// ─── Sheet 2: Required Fields ─────────────────────────────────────────────────
function buildRequiredSheet(wb, rows, ddInfo) {
  const ws = wb.addWorksheet('Required Fields', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],
  });

  const LOOKUP_COLS = [
    { header: 'Policy Name',   width: 40, policiesCol: 'A' },
    { header: 'Review Status', width: 15, policiesCol: 'D' },
  ];
  const DATA_COLS = [
    { key: 'id',             header: 'id *',           width: 38 },
    { key: 'name',           header: 'name *',         width: 38 },
    { key: 'version',        header: 'version *',      width: 10 },
    { key: 'description',    header: 'description *',  width: 55, required: true },
    { key: 'policy_type',    header: 'policy_type *',  width: 25, dropdown: 'policy_type' },
    { key: 'status',         header: 'status *',       width: 13, dropdown: 'manifest_status' },
    { key: 'license',        header: 'license *',      width: 14 },
    { key: 'category',       header: 'category *',     width: 24, dropdown: 'category' },
    { key: 'authors',        header: 'authors *',      width: 30, required: true },
    { key: 'tags',           header: 'tags',           width: 38 },
  ];

  const allHeaders = [
    ...LOOKUP_COLS.map(c => c.header),
    ...DATA_COLS.map(c => c.header),
  ];
  ws.addRow(allHeaders);
  styleHeader(ws.getRow(1), DARK_GREEN);
  LOOKUP_COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
  DATA_COLS.forEach((c, i) => { ws.getColumn(LOOKUP_COLS.length + i + 1).width = c.width; });
  ws.autoFilter = { from: 'A1', to: `${colLetter(allHeaders.length)}1` };

  // Example row (row 2)
  const exRequired = ws.addRow([
    '← auto-filled from Policies',
    '← auto-filled from Policies',
    'verra-vm0007-redd-plus',
    'Verra VM0007 REDD+ Methodology Framework',
    '1.0.0',
    'Implements Verra VM0007 REDD+ Methodology Framework v7.0, issuing VCU tokens on Hedera.',
    'standard-implementation',
    'active',
    'Apache-2.0',
    'carbon-credits',
    'Hedera | Hashgraph Association',
    'verra, vm0007, land-use, redd-plus',
  ]);
  styleExampleRow(exRequired);

  rows.forEach((r, ri) => {
    const rowNum = ri + 3;
    const values = [
      { formula: `=Policies!A${rowNum}`, result: r.name },
      { formula: `=Policies!D${rowNum}`, result: r.review_status },
      r.id,
      r.name,
      r.version,
      '',                  // description blank
      r.policy_type,
      r.status,
      r.license,
      r.category,
      '',                  // authors blank
      r.tags,
    ];
    const dataRow = ws.addRow(values);
    dataRow.height = 15;
    dataRow.font = { size: 9 };

    const bg = ri % 2 === 0 ? LIGHT_GRN : WHITE;
    dataRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    });

    // Highlight blank required cells
    DATA_COLS.forEach((col, ci) => {
      const cellIdx = LOOKUP_COLS.length + ci + 1;
      const cell = dataRow.getCell(cellIdx);
      if (col.required && !r[col.key]) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE_HL } };
      }
      if (col.dropdown) {
        const { col: ddCol, start, end } = ddInfo.ranges[col.dropdown];
        addDropdown(ws, `${colLetter(cellIdx)}${rowNum}`, ddInfo.sheetName, ddCol, start, end, !col.required);
      }
    });
  });
}

// ─── Sheet 3: Optional Fields ─────────────────────────────────────────────────
function buildOptionalSheet(wb, rows, ddInfo) {
  const ws = wb.addWorksheet('Optional Fields', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],
  });

  const LOOKUP_COLS = [
    { header: 'Policy Name',   width: 40, policiesCol: 'A' },
    { header: 'Review Status', width: 15, policiesCol: 'D' },
  ];
  const DATA_COLS = [
    { key: 'standard_body',           header: 'standard_body',           width: 18 },
    { key: 'methodology_id',          header: 'methodology_id',          width: 16 },
    { key: 'methodology_version',     header: 'methodology_version',     width: 22 },
    { key: 'token_type',              header: 'token_type',              width: 12 },
    { key: 'token_standard',          header: 'token_standard',          width: 15, dropdown: 'token_standard' },
    { key: 'registry_status',         header: 'registry_status',         width: 17, dropdown: 'registry_status' },
    { key: 'registry_body',           header: 'registry_body',           width: 18 },
    { key: 'registry_reference',      header: 'registry_reference',      width: 20 },
    { key: 'registry_accepted_date',  header: 'registry_accepted_date',  width: 24 },
    { key: 'hedera_timestamp',        header: 'hedera_timestamp',        width: 24 },
    { key: 'sdg_alignment',           header: 'sdg_alignment',           width: 16 },
    { key: 'sector',                  header: 'sector',                  width: 14, dropdown: 'sector' },
    { key: 'roles',                   header: 'roles',                   width: 44 },
    { key: 'guardian_version_min',    header: 'guardian_version_min',    width: 22 },
    { key: 'category_note',           header: 'category_note',           width: 22 },
    { key: 'policy_type_note',        header: 'policy_type_note',        width: 22 },
    { key: 'homepage',                header: 'homepage',                width: 40 },
    { key: 'support',                 header: 'support',                 width: 40 },
    { key: 'thumbnail',               header: 'thumbnail',               width: 24 },
    { key: 'supersedes',              header: 'supersedes',              width: 28 },
    { key: 'superseded_by',           header: 'superseded_by',           width: 28 },
  ];

  const allHeaders = [
    ...LOOKUP_COLS.map(c => c.header),
    ...DATA_COLS.map(c => c.header),
  ];
  ws.addRow(allHeaders);
  styleHeader(ws.getRow(1), MID_BLUE);
  LOOKUP_COLS.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
  DATA_COLS.forEach((c, i) => { ws.getColumn(LOOKUP_COLS.length + i + 1).width = c.width; });
  ws.autoFilter = { from: 'A1', to: `${colLetter(allHeaders.length)}1` };

  // Example row (row 2)
  const exOptional = ws.addRow([
    '← auto-filled from Policies',
    '← auto-filled from Policies',
    'Verra',                         // standard_body
    'VM0007',                        // methodology_id
    '7.0',                           // methodology_version
    'VCU',                           // token_type
    'fungible',                      // token_standard
    'validated',                     // registry_status
    'Verra',                         // registry_body
    '',                              // registry_reference
    '',                              // registry_accepted_date
    '1707207286.119377003',          // hedera_timestamp
    '13, 15',                        // sdg_alignment
    'land-use',                      // sector
    'Admin, Project Proponent, VVB', // roles
    '2.20.0',                        // guardian_version_min
    '',                              // category_note (only needed when category=other)
    '',                              // policy_type_note (only needed when policy_type=other)
    'https://verra.org/methodologies/vm0007-redd-methodology-framework-redd-mf/',  // homepage
    'https://github.com/hashgraph/guardian/issues',  // support
    'assets/thumbnail.png',          // thumbnail
    '',                              // supersedes
    '',                              // superseded_by
  ]);
  styleExampleRow(exOptional);

  rows.forEach((r, ri) => {
    const rowNum = ri + 3;
    const values = [
      { formula: `=Policies!A${rowNum}`, result: r.name },
      { formula: `=Policies!D${rowNum}`, result: r.review_status },
      r.standard_body,
      r.methodology_id,
      r.methodology_version,
      r.token_type,
      r.token_standard,
      r.registry_status,
      '',   // registry_body
      '',   // registry_reference
      '',   // registry_accepted_date
      '',   // hedera_timestamp
      '',   // sdg_alignment
      r.sector,
      r.roles,
      '',   // guardian_version_min
      '',   // category_note
      '',   // policy_type_note
      '',   // homepage
      '',   // support
      '',   // thumbnail
      '',   // supersedes
      '',   // superseded_by
    ];
    const dataRow = ws.addRow(values);
    dataRow.height = 15;
    dataRow.font = { size: 9 };

    const bg = ri % 2 === 0 ? LIGHT_BLUE : WHITE;
    dataRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    });

    DATA_COLS.forEach((col, ci) => {
      if (!col.dropdown) return;
      const cellIdx = LOOKUP_COLS.length + ci + 1;
      const { col: ddCol, start, end } = ddInfo.ranges[col.dropdown];
      addDropdown(ws, `${colLetter(cellIdx)}${rowNum}`, ddInfo.sheetName, ddCol, start, end);
    });
  });
}

// ─── Sheet 5: Manifest Files (blank) ─────────────────────────────────────────
function buildManifestSheet(wb) {
  const ws = wb.addWorksheet('Manifest Files');
  ws.addRow(['Reserved for generated manifest content — leave blank']);
  ws.getRow(1).font = { italic: true, color: { argb: 'FF888888' } };
  ws.getColumn(1).width = 60;
}

// ─── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const { rows } = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));
  console.log(`Loaded ${rows.length} rows from CSV`);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'build-sheet.js';
  wb.created = new Date();

  // Compute dropdown ranges first (without adding the sheet yet)
  const ddInfo = getDropdownInfo();

  // Add sheets in the correct tab order: 1 Policies, 2 Required, 3 Optional, 4 Dropdown Data, 5 Manifest
  buildPoliciesSheet(wb, rows, ddInfo);
  buildRequiredSheet(wb, rows, ddInfo);
  buildOptionalSheet(wb, rows, ddInfo);
  buildDropdownSheet(wb);   // tab 4
  buildManifestSheet(wb);   // tab 5

  await wb.xlsx.writeFile(OUT_PATH);
  console.log(`Wrote ${OUT_PATH}`);
  console.log(`Sheets: ${wb.worksheets.map(w => w.name).join(' | ')}`);
}

main().catch(e => { console.error(e); process.exit(1); });
