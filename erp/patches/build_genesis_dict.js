#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — the GENERATOR of erp/genesis_dict.js (bim-compiler prompts/SQLiteIDEMPIERE.md §POSTING-PARITY 5g, owner 2026-11-04 "Ship a dictionary subset";
//   Witness: W-GENESIS-REAL-POSTER). READ THE LOG (§GDICT lines) after every run; exit code is not evidence.
// The subset is MEASURED, not listed by hand: genesis.html's OWN posting path (Genesis.postSampleInvoice) runs on the FULL shipped seed (+ patch) for a born
// tenant, with every query logged. The output holds (1) the seed DDL of every table that path reads or the born tenant writes, (2) the AD_Table / AD_Column
// rows of every table the model layer asked the dictionary about (columnsOf / key lookups), (3) the AD_DDL_Default rows it asked for, (4) every client-0 row
// the path read (system data, e.g. C_Currency). Deterministic (sorted) so a re-run on unchanged inputs writes the same bytes.
// Run: node erp/patches/build_genesis_dict.js            (writes erp/genesis_dict.js)
//      node erp/patches/build_genesis_dict.js --check    (exit 1 if erp/genesis_dict.js is not what the seed generates now)
'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto');
var ERP = path.join(__dirname, '..'), OUT = path.join(ERP, 'genesis_dict.js'), CHECK = process.argv.indexOf('--check') >= 0;
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
var log = function (s) { console.log(s); };
global.window = global;   // genesis_seed.js publishes window.GenesisSeed
require(path.join(ERP, 'genesis_seed.js'));
var G = require(path.join(ERP, 'genesis.js'));
var ML = require(path.join(ERP, 'model_layer.js'));
['model_trade', 'model_cost', 'model_post'].forEach(function (m) { require(path.join(ERP, m + '.js')); });
var MP = require(path.join(ERP, 'model_post.js'));
var sha = function (b) { return crypto.createHash('sha256').update(b).digest('hex'); };

initSqlJs().then(function (SQL) {
  var seedBuf = fs.readFileSync(path.join(ERP, 'ad_seed.db')), patch = fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8');
  var raw = new SQL.Database(new Uint8Array(seedBuf));
  patch.split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { raw.run(st); } catch (e) { } });
  var master = {}; raw.exec("SELECT name, sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL")[0].values.forEach(function (r) { master[String(r[0]).toLowerCase()] = { name: r[0], sql: r[1] }; });
  var born = G.birthTenant({ clientName: 'DictProbe', currencyId: 100, currencyPrecision: 2, adminUser: 'admin', dateAcct: '2024-01-15' });
  var rb = G.rebandGenesis(born, { clientId: G.nextClientId(G.b3(raw)) });
  var read = {}, dictTables = {}, ddlDefault = {}, sysRows = {};
  function onQuery(sql, params, out) {
    var ts = (sql.match(/\b(?:FROM|JOIN)\s+"?([A-Za-z_]\w*)/gi) || []).map(function (m) { return m.replace(/^(FROM|JOIN)\s+"?/i, '').toLowerCase(); });
    ts.forEach(function (t) { read[t] = 1; });
    if (/\bad_column\b/i.test(sql) && /lower\(t\.tablename\)\s*=\s*\?/i.test(sql)) dictTables[String(params[0]).toLowerCase()] = 1;
    if (/\bad_table\b/i.test(sql) && /lower\(tablename\)\s*=\s*\?/i.test(sql)) dictTables[String(params[0]).toLowerCase()] = 1;
    if (/\bad_ddl_default\b/i.test(sql)) ddlDefault[String(params[0]).toLowerCase()] = 1;
    if (ts.length === 1) { var t = ts[0], pk = t + '_id'; out.forEach(function (r) { if (Number(r.ad_client_id) === 0 && r[pk] != null) (sysRows[t] || (sysRows[t] = {}))[r[pk]] = 1; }); }
  }
  var res = G.postSampleInvoice({ raw: raw, born: rb, ML: ML, MP: MP, onQuery: onQuery });
  log('§GDICT probe client=' + rb.clientId + ' merged=' + res.merged + ' state=' + res.pf.state + ' facts=' + res.pf.facts.length + ' lines=' + res.gl.lines.map(function (l) { return l.value + (l.amtacctdr ? ' Dr ' + l.amtacctdr : ' Cr ' + l.amtacctcr); }).join(' | '));
  if (res.pf.state !== 'posted' || res.gl.lines.length !== 3 || !res.gl.balanced) { log('§GDICT ABORT the probe did not post the sample invoice on the full seed - nothing written'); process.exit(1); }
  // (1) DDL: what the path read + what the born tenant writes + the dictionary tables themselves
  var want = {}; Object.keys(read).forEach(function (t) { want[t] = 1; });
  born.groups.forEach(function (g) { g.ops.forEach(function (o) { want[String(o.table).toLowerCase()] = 1; }); });
  ['ad_table', 'ad_column', 'ad_ddl_default'].forEach(function (t) { want[t] = 1; });
  var order = Object.keys(want).filter(function (t) { return master[t]; }).sort(), missing = Object.keys(want).filter(function (t) { return !master[t]; }).sort();
  var ddl = {}; order.forEach(function (t) { ddl[t] = master[t].sql; });
  // (2)-(4) rows
  function rowsOf(table, where, params, cols) { var q = raw.exec('SELECT ' + (cols ? cols.map(function (c) { return '"' + c + '"'; }).join(',') : '*') + ' FROM "' + master[table].name + '" WHERE ' + where + ' ORDER BY 1', params);
    return q.length ? { cols: q[0].columns.map(function (c) { return String(c).toLowerCase(); }), vals: q[0].values } : { cols: cols || [], vals: [] }; }
  var dt = Object.keys(dictTables).sort(), ph = dt.map(function () { return '?'; }).join(',');
  var rows = {};
  rows.ad_table = rowsOf('ad_table', 'lower(tablename) IN (' + ph + ')', dt);
  rows.ad_column = rowsOf('ad_column', 'ad_table_id IN (SELECT ad_table_id FROM ad_table WHERE lower(tablename) IN (' + ph + '))', dt);
  var dd = Object.keys(ddlDefault).sort(); rows.ad_ddl_default = dd.length ? rowsOf('ad_ddl_default', 'lower(tablename) IN (' + dd.map(function () { return '?'; }).join(',') + ')', dd) : { cols: [], vals: [] };
  Object.keys(sysRows).sort().forEach(function (t) { if (!master[t] || rows[t]) return; var ids = Object.keys(sysRows[t]).map(Number).sort(function (a, b) { return a - b; });
    rows[t] = rowsOf(t, t + '_id IN (' + ids.map(function () { return '?'; }).join(',') + ')', ids); });
  // the currencies genesis.html offers must resolve even if the probe used only one of them
  var ccys = (fs.readFileSync(path.join(ERP, 'genesis.html'), 'utf8').match(/<option value="(\d+)" data-prec=/g) || []).map(function (m) { return Number(m.match(/\d+/)[0]); });
  if (ccys.length) rows.c_currency = rowsOf('c_currency', 'c_currency_id IN (' + ccys.concat(Object.keys(sysRows.c_currency || {}).map(Number)).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; }).map(function () { return '?'; }).join(',') + ')', ccys.concat(Object.keys(sysRows.c_currency || {}).map(Number)).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; }));
  var dict = { generator: 'erp/patches/build_genesis_dict.js', seedSha256: sha(seedBuf), patchSha256: sha(patch), order: order, ddl: ddl, rows: rows, dictTables: dt };
  var body = '// GENERATED by erp/patches/build_genesis_dict.js — DO NOT EDIT. Regenerate after any ad_seed.db / patches/ad_seed.db.sql change.\n'
    + '// genesis.html posts its sample invoice through the REAL poster over this dictionary subset (bim-compiler prompts/SQLiteIDEMPIERE.md §POSTING-PARITY 5g).\n'
    + '(function (g) { g.GENESIS_DICT = ' + JSON.stringify(dict) + '; if (typeof module !== \'undefined\' && module.exports) module.exports = g.GENESIS_DICT; })(typeof window !== \'undefined\' ? window : globalThis);\n';
  var nRows = Object.keys(rows).reduce(function (a, t) { return a + rows[t].vals.length; }, 0);
  log('§GDICT tables=' + order.length + ' (' + order.join(',') + ') notInSeed=' + (missing.join(',') || 'none'));
  log('§GDICT dictionary tables=' + dt.join(',') + ' ad_column rows=' + rows.ad_column.vals.length + ' ddl_default=' + dd.join(',') + ' system rows=' + Object.keys(sysRows).sort().map(function (t) { return t + ':' + Object.keys(sysRows[t]).length; }).join(',') + ' totalRows=' + nRows + ' bytes=' + body.length);
  if (CHECK) { var cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : ''; var same = cur === body; log('§GDICT CHECK ' + (same ? 'UP-TO-DATE' : 'STALE - regenerate') + ' sha=' + sha(body).slice(0, 12) + ' file=' + sha(cur).slice(0, 12)); process.exit(same ? 0 : 1); }
  fs.writeFileSync(OUT, body); log('§GDICT wrote ' + path.relative(path.join(ERP, '..'), OUT) + ' sha=' + sha(body).slice(0, 12));
}).catch(function (e) { console.log('§GDICT CRASH ' + (e.stack || e)); process.exit(2); });
