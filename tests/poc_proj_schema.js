/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// poc_proj_schema.js — BIM → Project Order, TASK 0 witness W-PROJ-SCHEMA
// Implementing prompts/BIM_TO_PROJECT.md TASK 0 — proves the substrate is ready:
//   (a) the canonical viewer-side ERP.db carries the C_Project / C_Order write targets, populated;
//   (b) the 4D template (sequence_rules.json) parses → N phases;
//   (c) the active 5D rate pack parses → name + currency.
// Proves/disproves: "BIM → Project Order can fold against the served seed without inventing a table."
// Whitebox §-log first (feedback_whitebox_not_playwright). Run: node tests/poc_proj_schema.js

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

// Canonical served ERP db (OPEN-3 resolved 2026-06-14 = erp/ad_seed.db, the 26MB fullwidth seed).
// Worktree .db is gitignored, so fall back to the live checkout's copy.
const DB_CANDIDATES = [
  path.join(__dirname, '..', 'erp', 'ad_seed.db'),
  path.join(process.env.HOME, 'bim-ootb', 'erp', 'ad_seed.db'),
];
const RATES_DIR = path.join(__dirname, '..', 'viewer', 'rates');

// Tables the §C push WRITES (find-or-create) + §A/§C reads. Resolved case-insensitively because the
// served seed is mixed-case (C_Project vs c_projectline). Each must EXIST; the headers must be populated.
const WRITE_TARGETS = [
  'C_Project', 'C_ProjectPhase', 'C_ProjectTask', 'C_ProjectLine',
  'C_Order', 'C_OrderLine',
  'M_Product', 'M_Product_Category', 'M_PriceList', 'M_PriceList_Version', 'M_ProductPrice',
];
// §H follow-on tables — logged so the gaps are NAMED, not discovered mid-build.
const FOLLOWON = ['C_Invoice', 'C_InvoiceLine', 'C_ProjectIssue', 'M_Requisition', 'A_Asset', 'R_Request'];

function pickDb() {
  for (const c of DB_CANDIDATES) if (fs.existsSync(c)) return c;
  return null;
}

(async function () {
  const dbPath = pickDb();
  if (!dbPath) {
    console.log('§PROJ_SCHEMA SKIP — no canonical ad_seed.db found in ' + DB_CANDIDATES.join(' | '));
    process.exit(1);
  }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));

  // map lower(name) → actual stored name (case-preserving), so we can both detect AND cite real case
  const namesRes = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  const byLower = {};
  (namesRes[0] ? namesRes[0].values : []).forEach(function (r) { byLower[String(r[0]).toLowerCase()] = r[0]; });

  function countOf(logical) {
    const real = byLower[logical.toLowerCase()];
    if (!real) return null; // absent
    try { return db.exec('SELECT count(*) FROM "' + real + '"')[0].values[0][0]; }
    catch (e) { return null; }
  }

  // (a) write targets present?
  const missing = [];
  const present = [];
  WRITE_TARGETS.forEach(function (t) {
    const real = byLower[t.toLowerCase()];
    if (real) present.push(real); else missing.push(t);
  });
  const projOk = !!byLower['c_project'] && countOf('C_Project') > 0;
  const orderOk = !!byLower['c_order']; // header table present (rows optional — orders are folded by us)

  // (b) 4D template
  let phases = [];
  try {
    const sr = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'sequence_rules.json'), 'utf8'));
    phases = Array.from(new Set(Object.values(sr.SEQUENCE_RULES).map(function (r) { return r.phase; })));
  } catch (e) { phases = []; }

  // (c) active 5D pack (default locale pack; the Settings picker overrides at runtime)
  let packName = null, packCur = null, packRates = 0;
  try {
    const pack = JSON.parse(fs.readFileSync(path.join(RATES_DIR, 'cidb2024_my.json'), 'utf8'));
    packName = (pack.meta && pack.meta.name) || 'cidb2024_my';
    packCur = pack.currency || (pack.meta && pack.meta.currency) || null;
    packRates = Object.keys(pack.materials || pack.material_rates || pack.rates || {}).length;
  } catch (e) { packName = null; }

  // §-log: the witness line(s)
  console.log('§PROJ_SCHEMA db=' + path.basename(dbPath) +
    ' proj=' + projOk + ' order=' + orderOk +
    ' seq4d=' + phases.length + ' pack5d=' + (packName || 'NONE') + ' cur=' + (packCur || '?') +
    ' rates=' + packRates);
  console.log('§PROJ_SCHEMA_TARGETS present=' + present.length + '/' + WRITE_TARGETS.length +
    (missing.length ? ' MISSING=' + missing.join(',') : ' missing=none'));
  FOLLOWON.forEach(function (t) {
    const c = countOf(t);
    console.log('§PROJ_SCHEMA_FOLLOWON ' + t + '=' + (c === null ? 'ABSENT' : c + 'rows'));
  });
  console.log('§PROJ_SCHEMA phases=[' + phases.join(' | ') + ']');

  // PASS/FAIL: substrate ready iff all write targets present + project header populated + both templates parse
  const pass = missing.length === 0 && projOk && orderOk && phases.length > 0 && !!packName;
  console.log('§PROJ_SCHEMA ' + (pass ? 'PASS' : 'FAIL') + ' — write targets ' +
    (missing.length === 0 ? 'all present' : 'MISSING ' + missing.join(',')) +
    '; templates ' + (phases.length > 0 && packName ? 'parse' : 'FAIL'));
  db.close();
  process.exit(pass ? 0 : 1);
})();
