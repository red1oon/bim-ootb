#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DICT-SQL-EXEC (bim-compiler prompts/ERP_DEPTH_FILM.md §FN-CENSUS stage 3c; AD-LAYER LAW 2: the claim is "X of N dictionary SQL strings resolve on the twin", N from the dictionary).
//   READ THE LOG after every run: every verdict is a §DICT_SQL line; the exit code is not the evidence.
// THE ISSUE it proves/disproves: every executable SQL string the AD dictionary carries (@SQL= defaults, process-parameter defaults, validation rules, info columns/windows, status lines,
//   measure calcs, table/reference where-clauses) PREPARES on the twin's SQLite with the registered UDFs - i.e. no "no such function/table/column". Prepare-only: no data is judged here, only that
//   the statement resolves. Context variables (@Name@) are replaced by NULL. INCONCLUSIVE when no SQL was extracted. A failure is grouped by cause so function gaps are separable from dialect gaps.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..');
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var log = function (s) { console.log(s); };
// [table, column, mode]: 'sql' = whole value is SQL; 'atsql' = only values starting @SQL=; 'where' = a WHERE fragment (wrapped)
var SRC = [['ad_column', 'defaultvalue', 'atsql'], ['ad_process_para', 'defaultvalue', 'atsql'], ['ad_process_para', 'defaultvalue2', 'atsql'], ['ad_val_rule', 'code', 'where'], ['ad_infocolumn', 'selectclause', 'sql'],
  ['ad_infowindow', 'fromclause', 'from'], ['ad_infowindow', 'whereclause', 'where'], ['ad_statusline', 'sqlstatement', 'sql'], ['pa_measurecalc', 'selectclause', 'sql'], ['pa_measurecalc', 'whereclause', 'where', '(SELECT tablename FROM ad_table WHERE ad_table_id=pa_measurecalc.ad_table_id)'],
  ['ad_tab', 'whereclause', 'where', '(SELECT tablename FROM ad_table WHERE ad_table_id=ad_tab.ad_table_id)'], ['ad_ref_table', 'whereclause', 'where', '(SELECT tablename FROM ad_table WHERE ad_table_id=ad_ref_table.ad_table_id)'], ['ad_field', 'defaultvalue', 'atsql']];
(async function main() {
  var SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) { try { db.run(st); } catch (e) {} } });
  var A = require(path.join(ERP, 'ad_callout.js'));
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require(path.join(ERP, 'callouts', m + '.js')); });
  var names = A.RUNTIME.registerSqlFunctions(function (n, f) { db.create_function(n, f); });
  log('§DICT_SQL-SEED seed=ad_seed.db+patches udfs=' + names.length);
  var has = function (t, c) { try { return db.exec("SELECT 1 FROM pragma_table_info('" + t + "') WHERE lower(name)='" + c + "'").length > 0; } catch (e) { return false; } };
  var total = 0, ok = 0, bad = [], skippedSrc = [], byCause = {}, perSrc = {};
  SRC.forEach(function (s) {
    var t = s[0], c = s[1], m = s[2];
    if (!has(t, c)) { skippedSrc.push(t + '.' + c); return; }
    var r; try { r = db.exec('SELECT "' + c + '", ' + (s[3] || "''") + ' FROM "' + t + '" WHERE "' + c + '" IS NOT NULL AND trim("' + c + '")<>\'\''); } catch (e) { skippedSrc.push(t + '.' + c + ' (' + String(e.message).slice(0, 40) + ')'); return; }
    var vals = r[0] ? r[0].values : [];
    vals.forEach(function (row) {
      var v = String(row[0]), tbl = row[1]; if (m === 'atsql') { if (!/^@SQL=/i.test(v.trim())) return; v = v.trim().replace(/^@SQL=/i, ''); }
      var body = v.replace(/@[^@\s][^@]*@/g, 'NULL'); if (m === 'where') body = body.replace(/^\s*WHERE\s+/i, ''); var quals = {}; (body.match(/\b([A-Za-z_]\w*)\.[A-Za-z_]\w*/g) || []).forEach(function (x) { quals[x.split('.')[0].toLowerCase()] = 1; }); var qt = Object.keys(quals).filter(function (q) { try { return db.exec("SELECT 1 FROM sqlite_master WHERE lower(name)='" + q + "'").length > 0; } catch (e) { return false; } });
      var from = tbl ? '"' + tbl + '"' : (qt.length ? qt.map(function (q) { return '"' + q + '"'; }).join(',') : null), sql = m === 'where' ? (from ? 'SELECT 1 FROM ' + from + ' WHERE (' + body + ')' : 'SELECT 1 WHERE (' + body + ')') : m === 'from' ? 'SELECT 1 FROM ' + body : body;
      if (!/^\s*(SELECT|WITH)\b/i.test(sql)) return;
      var key = t + '.' + c; perSrc[key] = perSrc[key] || { n: 0, ok: 0 }; perSrc[key].n++; total++;
      try { var st = db.prepare(A.convertSql(sql)); st.free(); ok++; perSrc[key].ok++; }
      catch (e) { var msg = String(e.message || e), cause = (msg.match(/no such (function|table|column): ?([\w.]+)/i) || [])[0] || msg.replace(/".*?"/g, '"…"').slice(0, 60); cause = cause.toLowerCase(); byCause[cause] = (byCause[cause] || 0) + 1; bad.push({ src: key, cause: cause, sql: body.replace(/\s+/g, ' ').slice(0, 110), full: sql.replace(/\s+/g, ' ') }); }
    });
  });
  Object.keys(perSrc).forEach(function (k) { log('§DICT_SQL src=' + k + ' strings=' + perSrc[k].n + ' resolve=' + perSrc[k].ok); });
  if (process.env.DICT_SQL_FULL) bad.filter(function (b) { return new RegExp(process.env.DICT_SQL_FULL, 'i').test(b.cause + ' ' + b.full); }).forEach(function (b) { log('§DICT_SQL-FULL ' + b.src + ' [' + b.cause + '] ' + b.full); });
  var causes = Object.keys(byCause).sort(function (a, b) { return byCause[b] - byCause[a]; });
  causes.forEach(function (k) { log('§DICT_SQL cause="' + k + '" count=' + byCause[k]); });
  var fnGaps = causes.filter(function (k) { return /^no such function/.test(k); }), dialect = causes.filter(function (k) { return !/^no such (function|table|column: [\w]+\.?[\w]*)/.test(k) || /^no such column: (sysdate|dual)$/.test(k); }), dialectN = dialect.reduce(function (a, k) { return a + byCause[k]; }, 0), schemaN = bad.length - dialectN - fnGaps.reduce(function (a, k) { return a + byCause[k]; }, 0);
  var shown = {}; bad.filter(function (b) { return !/^no such (table|column)/.test(b.cause) || /sysdate|dual/.test(b.cause); }).forEach(function (b) { shown[b.cause] = (shown[b.cause] || 0) + 1; if (shown[b.cause] <= 3) log('  §DICT_SQL-FAIL ' + b.src + ' [' + b.cause + '] ' + b.sql); });
  var v = total === 0 ? 'INCONCLUSIVE' : (fnGaps.length || dialectN) ? 'FAIL' : 'PASS';
  log('§DICT_SQL summary strings=' + total + ' resolve=' + ok + ' unresolved=' + bad.length + ' functionGaps=' + fnGaps.length + ' dialectGaps=' + dialectN + ' schemaGaps(no such table/column)=' + schemaN + ' skippedSources=[' + skippedSrc.join(',') + '] verdict=' + v);
  process.exit(v === 'FAIL' ? 1 : 0);
})().catch(function (e) { console.log('§DICT_SQL ERROR ' + (e.stack || e)); process.exit(2); });
