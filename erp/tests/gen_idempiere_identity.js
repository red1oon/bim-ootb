#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — gen_idempiere_identity.js: GENERATES erp/migrate/templates/idempiere-identity.json (the IDENTITY template: legacy iDempiere rows -> the 17-sheet contract, nothing
//   changed) from migrate/workbook.mjs HEADERS + the dictionary (erp/ad_seed.db). Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §IDEMPIERE-FALSIFIER-SPEC — Witness:
//   W-IDEMPIERE-FALSIFIER (tests/witness_idempiere_falsifier.js, which regenerates this file and requires byte equality). READ THE LOG: §IDF-GEN lines. No hand edits to the output.
// Rules (one per header form):
//   plain column            -> "$<column, lower-case: the name the fixture / legacy postgres gives it>"
//   X_ID>Alt                -> find[<table of X>, <that table's key column>, $x_id, <alt column lower-case>]   (table of X = the Ninja loader's own rule, read from the dictionary)
//   X_ID>IsDefault          -> "Y" when the referenced row IS the default one, else blank. The loader's answer to "IsDefault" is "the tenant's default row" (a header cell is the value
//                              searched for); writing the source row's own 'N' would search for IsDefault=N, which matches many rows or none. STATED here, reported by the witness.
//   every sheet            -> where ad_client_id == @client: the tenant's own rows (the fixture also holds the System rows its rows point at, which `find` needs)
//   bare X_ID               -> find[<table of X>, <key>, $x_id, name]  (the loader looks a bare _ID cell up by the table's Name) ;
//                              <Table>Line . <Table>_ID -> DocumentNo (the loader's Line-finds-its-header rule, ninja_migrate_process.mjs doLookupID)
// Usage: node erp/tests/gen_idempiere_identity.js [--write]     (exports analyse() for the recorder and the witness)
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..'), OUT = path.join(ERP, 'migrate', 'templates', 'idempiere-identity.json');

async function analyse(log) {
  log = log || function () {};
  var init = require('sql.js'), SQL = await init(), db = new SQL.Database(fs.readFileSync(path.join(ERP, 'ad_seed.db')));
  var WB = await import(require('url').pathToFileURL(path.join(ERP, 'migrate', 'workbook.mjs')).href);
  function q(sql, p) { var st = db.prepare(sql); st.bind(p || []); var out = []; while (st.step()) out.push(st.getAsObject()); st.free(); return out; }
  // the table an _ID header looks up - the loader's rule (ninja_migrate_process.mjs lookupTable): column minus _ID when that is a table, else the column's reference key table
  function lookup(table, col) {
    var name = col.replace(/_ID$/i, ''), d = q("SELECT TableName AS t FROM AD_Table WHERE upper(TableName)=upper(?) AND IsActive='Y'", [name])[0];
    if (d) return { table: d.t, via: 'column minus _ID' };
    var r = q('SELECT tb.TableName AS t, k.ColumnName AS k FROM AD_Column c JOIN AD_Table t0 ON t0.AD_Table_ID=c.AD_Table_ID JOIN AD_Ref_Table rt ON rt.AD_Reference_ID=c.AD_Reference_Value_ID ' +
      'JOIN AD_Column k ON k.AD_Column_ID=rt.AD_Key JOIN AD_Table tb ON tb.AD_Table_ID=k.AD_Table_ID WHERE upper(t0.TableName)=upper(?) AND upper(c.ColumnName)=upper(?)', [table, col])[0];
    return r ? { table: r.t, via: 'AD_Ref_Table key of the column\'s reference' } : null;
  }
  var sheets = {};
  WB.ORDER.forEach(function (sheet) {
    var cols = WB.HEADERS[sheet].map(function (h) {
      var p = h.split('>'), col = p[0], alt = p[1] || null;
      if (!/_ID$/i.test(col)) return { header: h, kind: 'plain', col: col.toLowerCase() };
      var lk = lookup(sheet, col); if (!lk) return { header: h, kind: 'unresolved', col: col.toLowerCase() };
      var keyRow = q("SELECT ColumnName AS c FROM AD_Column WHERE AD_Table_ID=(SELECT AD_Table_ID FROM AD_Table WHERE upper(TableName)=upper(?)) AND IsKey='Y'", [lk.table])[0];
      var line = sheet.toUpperCase().endsWith('LINE') && sheet.slice(0, -4).toUpperCase() === lk.table.toUpperCase() && !alt;
      var use = alt || (line ? 'DocumentNo' : 'Name');
      var o = { header: h, kind: 'lookup', col: col.toLowerCase(), target: lk.table.toLowerCase(), key: (keyRow ? keyRow.c : lk.table + '_ID').toLowerCase(), alt: use.toLowerCase(), isDefault: /^isdefault$/i.test(use), via: lk.via, rule: alt ? 'X_ID>Alt' : (line ? 'Line finds its header by DocumentNo' : 'bare _ID: the loader looks up Name') };
      return o;
    });
    sheets[sheet] = { table: sheet.toLowerCase(), key: (q("SELECT ColumnName AS c FROM AD_Column WHERE AD_Table_ID=(SELECT AD_Table_ID FROM AD_Table WHERE upper(TableName)=upper(?)) AND IsKey='Y'", [sheet])[0] || { c: sheet + '_ID' }).c.toLowerCase(), cols: cols };
    cols.forEach(function (c) { log('§IDF-GEN sheet=' + sheet + ' header=' + c.header + ' kind=' + c.kind + (c.kind === 'lookup' ? ' target=' + c.target + ' key=' + c.key + ' answer=' + c.alt + ' via=' + c.via + ' rule=' + c.rule + (c.isDefault ? ' (IsDefault: Y or blank)' : '') : c.kind === 'unresolved' ? ' UNRESOLVED' : ' field=$' + c.col)); });
  });
  return { sheets: sheets, headers: WB.HEADERS, order: WB.ORDER };
}

function expr(c) {
  if (c.kind === 'plain') return '$' + c.col;
  var f = { find: [c.target, c.key, '$' + c.col, c.alt] };
  return c.isDefault ? { if: [{ eq: [f, 'Y'] }, 'Y', ''] } : f;
}
function template(A) {
  var ent = {};
  A.order.forEach(function (sh) { var fields = {}; A.sheets[sh].cols.forEach(function (c) { fields[c.header] = expr(c); }); ent[sh] = { from: A.sheets[sh].table, where: { eq: [{ str: '$ad_client_id' }, { str: '@client' }] }, fields: fields }; });
  return { template: 'idempiere-identity', version: 1, source: 'iDempiere rows of ONE tenant (fixture / agent copy), through the engine, changed by nothing',
    description: 'GENERATED by erp/tests/gen_idempiere_identity.js from migrate/workbook.mjs HEADERS and the dictionary - do not edit; W-IDEMPIERE-FALSIFIER regenerates it and requires byte equality (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md section IDEMPIERE-FALSIFIER-SPEC).',
    connector: { kind: 'tenant-rows' }, srcKey: 'idempiere', entities: ent };
}
function render(A) { return JSON.stringify(template(A), null, 1) + '\n'; }
module.exports = { analyse: analyse, template: template, render: render, OUT: OUT };
if (require.main === module) (async function () {
  var A = await analyse(console.log), txt = render(A), bad = [];
  A.order.forEach(function (s) { A.sheets[s].cols.forEach(function (c) { if (c.kind === 'unresolved') bad.push(s + '.' + c.header); }); });
  if (bad.length) { console.log('§IDF-GEN STOP unresolved lookups (the dictionary names no table): ' + bad.join(', ')); process.exit(2); }
  if (process.argv.indexOf('--write') >= 0) { fs.writeFileSync(OUT, txt); console.log('§IDF-GEN wrote ' + OUT + ' bytes=' + txt.length); } else console.log('§IDF-GEN dry run bytes=' + txt.length);
})();
