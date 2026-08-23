// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// bake_forms_valrules_seed.js — additively CREATE + fill AD_Form and ad_val_rule in ad_seed.db.
//
// WHY a narrow additive bake, not scripts/export_ad_seed.js: a full re-export against the live
// docker PG regresses production data badly (ad_client 6→1, ad_role 14→4, C_BPartner 113→18,
// ad_window_access 4448→1080, fact_acct/HR_*/C_Subscription* missing) — the shipped ad_seed.db is
// a hand-accumulated artifact (one full export, fd09ad1/#265, plus ~20 incremental "bake X into
// ad_seed.db" commits since), not reproducible from a single pipeline run. See
// bim-compiler docs/ERP_PROJECT_REVIEW.md §7 for the full finding.
//
// AD_Form and ad_val_rule are safe to pull fresh: pure declarative base-schema reference data
// (Form/ValRule DEFINITIONS, not operational transaction data), currently ABSENT from ad_seed.db
// entirely (nothing to regress), same table set/case/WHERE contract as scripts/ad_seed_manifest.json
// (bim-compiler PR #91): AD_Form canonical-case + activeOnly=true, ad_val_rule lower-case + all rows.
// Column DDL/case/PK logic ported verbatim from scripts/export_ad_seed.js (proven, PR #265/#266 ship).
//
// Never CREATEs a table that already exists (idempotent on re-run: DROP+recreate only if the two
// target tables are already present with the same row count, otherwise a fresh CREATE).
// EXTRACT, DON'T INVENT — every row/column from the live docker PG. READ THE LOG.
//
// Run: node erp/tests/bake_forms_valrules_seed.js   (edits ad_seed.db in place, in cwd)
'use strict';
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var fs = require('fs');
var execFileSync = require('child_process').execFileSync;

var CONTAINER = process.env.ERP_PG_CONTAINER || 'postgres';
var DB = process.env.ERP_PG_DB || 'idempiere';
var PGUSER = process.env.ERP_PG_USER || 'adempiere';
var SCHEMA = process.env.ERP_PG_SCHEMA || 'adempiere';
var SEED = process.env.ERP_SEED || 'ad_seed.db';
var MAXBUF = 512 * 1024 * 1024;

var TABLES = [
  { table: 'AD_Form', case: 'canonical', where: null, activeOnly: true },
  { table: 'ad_val_rule', case: 'lower', where: null, activeOnly: false }
];

function pgMeta(sql) {
  var out = execFileSync('docker',
    ['exec', CONTAINER, 'psql', '-U', PGUSER, '-d', DB, '-t', '-A', '-F', '\t', '-c', sql],
    { maxBuffer: MAXBUF, encoding: 'utf8' });
  return out.split('\n').filter(function (l) { return l.length > 0; })
    .map(function (l) { return l.split('\t'); });
}
function pgCopy(sql) {
  return execFileSync('docker',
    ['exec', CONTAINER, 'psql', '-U', PGUSER, '-d', DB, '-c', sql],
    { maxBuffer: MAXBUF, encoding: 'utf8' });
}
// COPY TEXT unescape (PostgreSQL copy.c rules) — verbatim from migrate_pg_to_sqlite.js / export_ad_seed.js.
function unescape(s) {
  if (s === '\\N') return null;
  if (s.indexOf('\\') === -1) return s;
  var out = '';
  for (var i = 0; i < s.length; i++) {
    var c = s[i];
    if (c !== '\\') { out += c; continue; }
    var n = s[++i];
    switch (n) {
      case 'n': out += '\n'; break;
      case 't': out += '\t'; break;
      case 'r': out += '\r'; break;
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case 'v': out += '\v'; break;
      case '\\': out += '\\'; break;
      default: out += (n === undefined ? '\\' : n); break;
    }
  }
  return out;
}
function affinity(t) {
  if (t === 'bytea') return 'BLOB';
  if (t === 'smallint' || t === 'integer' || t === 'bigint') return 'INTEGER';
  if (t === 'numeric' || t === 'decimal' || t === 'real' || t === 'double precision') return 'NUMERIC';
  return 'TEXT';
}
function q(id) { return '"' + String(id).replace(/"/g, '""') + '"'; }

(async function () {
  var SQL = await initSqlJs({ locateFile: f => require('path').join('/home/red1/bim-ootb/node_modules/sql.js/dist', f) });

  // §BEFORE — row-count every existing table, for the regression proof.
  var seedBuf = fs.readFileSync(SEED);
  var seed = new SQL.Database(new Uint8Array(seedBuf));
  function allTables(db) {
    var r = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    return r.length ? r[0].values.map(v => String(v[0])) : [];
  }
  function rowCount(db, t) {
    try { return db.exec('SELECT count(*) FROM "' + t + '"')[0].values[0][0]; }
    catch (e) { return -1; }
  }
  var before = {};
  allTables(seed).forEach(function (t) { before[t] = rowCount(seed, t); });
  console.log('§BAKE_FV_BEFORE tables=' + Object.keys(before).length + ' bytes=' + seedBuf.length);

  if (allTables(seed).indexOf('AD_Form') >= 0 || allTables(seed).indexOf('ad_val_rule') >= 0) {
    console.log('§BAKE_FV_ALREADY_PRESENT — one or both target tables already exist, aborting to stay idempotent-safe (no DROP performed). Inspect manually.');
    process.exit(1);
  }

  // PG catalog: columns + types for exactly the 2 target tables, PKs, canonical AD_Column case.
  var tnList = TABLES.map(e => "'" + e.table.toLowerCase() + "'").join(',');
  var colRows = pgMeta(
    "SELECT table_name, column_name, data_type FROM information_schema.columns " +
    "WHERE table_schema='" + SCHEMA + "' AND table_name IN (" + tnList + ") ORDER BY table_name, ordinal_position");
  var cols = {};
  colRows.forEach(function (r) { (cols[r[0]] = cols[r[0]] || []).push({ name: r[1], type: r[2] }); });
  var pkRows = pgMeta(
    "SELECT tc.table_name, kcu.column_name FROM information_schema.table_constraints tc " +
    "JOIN information_schema.key_column_usage kcu ON kcu.constraint_name=tc.constraint_name " +
    "AND kcu.table_schema=tc.table_schema WHERE tc.table_schema='" + SCHEMA + "' " +
    "AND tc.constraint_type='PRIMARY KEY' AND tc.table_name IN (" + tnList + ") ORDER BY tc.table_name, kcu.ordinal_position");
  var pks = {};
  pkRows.forEach(function (r) { (pks[r[0]] = pks[r[0]] || []).push(r[1]); });
  var caseRows = pgMeta(
    "SELECT lower(t.tablename), lower(c.columnname), c.columnname FROM " + q(SCHEMA) +
    ".ad_column c JOIN " + q(SCHEMA) + ".ad_table t ON c.ad_table_id=t.ad_table_id " +
    "WHERE lower(t.tablename) IN (" + tnList + ")");
  var canon = {};
  caseRows.forEach(function (r) { canon[r[0] + '.' + r[1]] = r[2]; });

  var totalRows = 0;
  TABLES.forEach(function (e) {
    var tn = e.table.toLowerCase();
    var cs = cols[tn];
    if (!cs || !cs.length) { console.log('§BAKE_FV_MISSING_IN_PG table=' + e.table); process.exit(1); }

    function disp(c) { if (e.case !== 'canonical') return c; return canon[tn + '.' + c] || c; }
    var pk = pks[tn] || [];
    var ddl = 'CREATE TABLE ' + q(e.table) + ' (' +
      cs.map(function (c) { return q(disp(c.name)) + ' ' + affinity(c.type); }).join(', ') +
      (pk.length ? ', PRIMARY KEY (' + pk.map(function (c) { return q(disp(c)); }).join(', ') + ')' : '') + ')';
    seed.run(ddl);

    var where = e.where || '1=1';
    if (e.activeOnly) where += " AND isactive='Y'";
    var collist = cs.map(function (c) { return q(c.name); }).join(',');
    var payload = pgCopy('COPY (SELECT ' + collist + ' FROM ' + q(SCHEMA) + '.' + q(tn) +
      ' WHERE ' + where + ') TO STDOUT');

    var blobIdx = cs.map(function (c, i) { return c.type === 'bytea' ? i : -1; }).filter(function (i) { return i >= 0; });
    var placeholders = cs.map(function () { return '?'; }).join(',');
    var stmt = seed.prepare('INSERT INTO ' + q(e.table) + ' VALUES (' + placeholders + ')');
    var lines = payload.length ? payload.split('\n') : [];
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    var n = 0;
    lines.forEach(function (line) {
      var fields = line.split('\t');
      var vals = new Array(cs.length);
      for (var fi = 0; fi < cs.length; fi++) {
        var v = unescape(fields[fi]);
        if (v !== null && blobIdx.indexOf(fi) >= 0) {
          v = (v.slice(0, 2) === '\\x') ? Buffer.from(v.slice(2), 'hex') : Buffer.from(v, 'binary');
        }
        vals[fi] = v;
      }
      stmt.run(vals);
      n++;
    });
    stmt.free();
    totalRows += n;
    console.log('§BAKE_FV table=' + e.table + ' rows=' + n + ' cols=' + cs.length + ' pk=' + (pk.join('+') || 'none'));
  });

  fs.writeFileSync(SEED, Buffer.from(seed.export()));

  // §AFTER — re-open from disk, prove every OTHER table is byte-identical in row count.
  var after = new SQL.Database(new Uint8Array(fs.readFileSync(SEED)));
  var afterCounts = {};
  allTables(after).forEach(function (t) { afterCounts[t] = rowCount(after, t); });
  var regressed = [];
  Object.keys(before).forEach(function (t) {
    if (afterCounts[t] !== before[t]) regressed.push(t + ' ' + before[t] + '→' + afterCounts[t]);
  });
  console.log('§BAKE_FV_REGRESSION_CHECK other_tables=' + Object.keys(before).length +
    ' regressed=' + regressed.length + (regressed.length ? ' [' + regressed.join(', ') + ']' : ''));
  console.log('§BAKE_FV_DONE new_tables=2 total_rows=' + totalRows +
    ' bytes=' + fs.statSync(SEED).size + ' (' + (fs.statSync(SEED).size / 1048576).toFixed(1) + 'MB)');
  if (regressed.length) process.exit(1);
})();
