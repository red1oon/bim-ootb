#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — record_idempiere_tenant.js: records ONE legacy iDempiere tenant's rows (read only) as a JSON fixture for W-IDEMPIERE-FALSIFIER (tests/witness_idempiere_falsifier.js).
//   Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §IDEMPIERE-FALSIFIER-SPEC. Tables = the 17 sheets of migrate/workbook.mjs HEADERS plus every table a lookup header points at
//   (tests/gen_idempiere_identity.js analyse()); columns = the key, ad_client_id, the sheet's columns, the lookup answer columns, name/value/documentno/isdefault where they exist; rows =
//   the tenant's own (ad_client_id = N) plus the rows (System included) that the tenant's rows point at. Deterministic: ordered by key. SELECTs only - never writes the source.
// Usage: node erp/tests/record_idempiere_tenant.js <db> <client> <out.json> [recorded-label]      (psql -At; PGPASSWORD from the environment, host localhost)
'use strict';
var fs = require('fs'), cp = require('child_process'), path = require('path');
function psql(db, sql) { return cp.execFileSync('psql', ['-h', 'localhost', '-U', process.env.PGUSER || 'adempiere', '-d', db, '-At', '-c', sql], { encoding: 'utf8', maxBuffer: 1 << 28, env: Object.assign({ PGPASSWORD: 'adempiere' }, process.env) }); }
(async function () {
  var db = process.argv[2], client = Number(process.argv[3]), out = process.argv[4], label = process.argv[5] || '';
  if (!db || !client || !out) { console.log('usage: record_idempiere_tenant.js <db> <client> <out.json> [label]'); process.exit(1); }
  var A = await require('./gen_idempiere_identity.js').analyse();
  var want = {};   // table -> { own: bool, cols: Set, refs: [[srcTable, srcCol]] }
  function T(t) { return want[t] = want[t] || { own: false, cols: new Set(['ad_client_id']), refs: [] }; }
  A.order.forEach(function (sh) { var s = A.sheets[sh], t = T(s.table); t.own = true; t.cols.add(s.key);
    s.cols.forEach(function (c) { t.cols.add(c.col); if (c.kind === 'lookup') { var g = T(c.target); g.cols.add(c.key); g.cols.add(c.alt); g.refs.push([s.table, c.col]); } }); });
  var tables = {}, report = [];
  Object.keys(want).sort().forEach(function (tn) {
    var w = want[tn], have = psql(db, "SELECT column_name||'|'||data_type FROM information_schema.columns WHERE table_name='" + tn + "' ORDER BY ordinal_position").trim().split('\n').map(function (x) { return x.split('|'); }), H = {};
    have.forEach(function (h) { H[h[0]] = h[1]; });
    ['name', 'value', 'documentno', 'isdefault', 'isactive'].forEach(function (c) { if (H[c]) w.cols.add(c); });
    var key = tn + '_id', noKey = !H[key], miss = Array.from(w.cols).filter(function (c) { return !H[c] && !(noKey && c === key); });   // a composite-key table (M_Product_PO) has no <table>_id: ordered by all its columns
    w.cols.delete(noKey ? key : '');
    if (miss.length) { console.log('§IDF-REC STOP ' + tn + ' lacks columns ' + miss.join(',') + ' in ' + db); process.exit(2); }
    var cols = Array.from(w.cols).sort(function (a, b) { return a === key ? -1 : b === key ? 1 : a < b ? -1 : 1; });
    var order = noKey ? cols.join(', ') : key, sel = cols.map(function (c) { return /timestamp|date/.test(H[c]) ? c + '::text AS ' + c : c; }).join(', ');
    var cond = [w.own ? 'ad_client_id=' + client : null].concat(w.refs.map(function (r) { return key + ' IN (SELECT ' + r[1] + ' FROM ' + r[0] + ' WHERE ad_client_id=' + client + ' AND ' + r[1] + ' IS NOT NULL)'; })).filter(Boolean);
    var js = psql(db, 'SELECT coalesce(json_agg(t ORDER BY ' + order.replace(/(\w+)/g, 't.$1') + '),\'[]\') FROM (SELECT ' + sel + ' FROM ' + tn + ' WHERE ' + cond.join(' OR ') + ' ORDER BY ' + order + ') t').trim(), rows = JSON.parse(js);
    tables[tn] = { columns: cols, count: rows.length, rows: rows }; report.push(tn + '=' + rows.length);
  });
  var doc = { source: { db: db, client: client, recorded: label || 'psql read-only select', note: 'rows of the tenant plus the rows they point at; columns = the 17-sheet contract + lookup answers' }, tables: tables };
  fs.mkdirSync(path.dirname(out), { recursive: true }); var txt = JSON.stringify(doc, null, 0).replace(/\},\{/g, '},\n{') + '\n'; fs.writeFileSync(out, txt);
  console.log('§IDF-REC db=' + db + ' client=' + client + ' bytes=' + txt.length + ' tables=' + report.join(' '));
})();
