#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-POST-ALLOCATION (bim-compiler prompts/SQLiteIDEMPIERE.md §POSTING-PARITY item 1c; CARDINAL RULE: twin == legacy). READ THE LOG: §WALC lines; exit code is not evidence.
// THE ISSUE: model_post's Doc_AllocationHdr refused discount / write-off / cash-line / AP legs ("not ported"): both GardenWorld allocations (#100 cash line, #101 discount+write-off+VAT tax correction)
//   stayed Posted=N where legacy (Doc_AllocationHdr.java:193-555) books them; AND the seed lacked the C_Cash header rows getCashAcct (:791-804) joins (data fix: patches/ad_seed.db.sql, via build_dict_patch.py).
//   A1 both client-11 C_AllocationHdr of the PATCHED seed post through the REAL poster == stored legacy Fact_Acct per schema x account x side (integer cents, maxDiff 0), Posted='Y'
//   A2 the cash-transfer leg (516) is on #100 in both schemas   A3 every OTHER doc type posts byte-identically (result+ops+log) vs the pinned baseline on the patched seed
//   A4 the seed patch applies idempotently (twice -> same bytes, 3 C_Cash rows, no duplicates)
//   A5 AmtSource == stored legacy per schema x account x side x currency (A1 judges AmtAcct only; residual #101 724 source 0.01 vs 'stored 0.0' misread)
//   MUTANTS: MUT=src0 (724 source zeroed, accounted kept) must FAIL A5 and leave A1 PASS; MUT=nocash (cash leg 516 dropped) and MUT=nodisc (discount leg 427 dropped) must FAIL A1; GA_BASELINE=1 (baseline poster) must FAIL A1. Nothing judged -> INCONCLUSIVE.
// Run: node erp/tests/witness_post_allocation.js   (node only; sql.js)
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process'), Module = require('module');
var ERP = path.join(__dirname, '..'), BASE = 'f4cdcdf8', MUT = process.env.MUT || '', BASELINE = !!process.env.GA_BASELINE;
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
var log = function (s) { console.log(s); }, pass = 0, fail = 0, inc = 0;
var ok = function (id, n, c, d) { log((c === null ? '  ⚠ ' : c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c === null ? inc++ : c ? pass++ : fail++; };
var cents = function (v) { return Math.round(Number(v || 0) * 100); };
var PATCH = fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8');
function applyPatch(db) { PATCH.split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); } catch (e) { } }); }
(async function main() {
  var SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  var SEED = new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))); applyPatch(db);
  var A = require(path.join(ERP, 'ad_callout.js'));
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require(path.join(ERP, 'callouts', m + '.js')); });
  A.RUNTIME.registerSqlFunctions(function (n, f) { db.create_function(n, f); });
  var ML = require(path.join(ERP, 'model_layer.js'));
  ['model_trade', 'model_ctor', 'model_cost', 'model_match', 'model_order', 'model_invoice'].forEach(function (m) { require(path.join(ERP, m + '.js')); });
  // the pinned baseline model_post, loaded as a module in ERP/ (so ./model_layer resolves to the SAME singleton); the candidate is required AFTER so its setPoster wins unless GA_BASELINE
  var src; try { src = cp.execFileSync('git', ['show', BASE + ':erp/model_post.js'], { cwd: ERP, maxBuffer: 1 << 26 }).toString(); } catch (e) { src = null; }
  var PB = null; if (src) { var m = new Module(path.join(ERP, '__model_post_baseline.js'), module); m.filename = path.join(ERP, '__model_post_baseline.js'); m.paths = Module._nodeModulePaths(ERP); m._compile(src, m.filename); PB = m.exports; }
  var PN = require(path.join(ERP, 'model_post.js'));
  var P = BASELINE ? PB : PN; if (BASELINE && PB) ML.setPoster(PB.post);
  if (MUT === 'src0') { var origS = P.DOC.c_allocationhdr; P.DOC.c_allocationhdr = function (trx, h, as, F) { var r = origS(trx, h, as, F); F.lines.forEach(function (x) { if (Number(x.account_id) === 724) { x.amtsourcedr = 0; x.amtsourcecr = 0; } }); return r; }; }
  if (MUT === 'nocash' || MUT === 'nodisc') { var orig = P.DOC.c_allocationhdr, drop = MUT === 'nocash' ? 516 : 427; P.DOC.c_allocationhdr = function (trx, h, as, F) { var r = orig(trx, h, as, F); F.lines = F.lines.filter(function (x) { return Number(x.account_id) !== drop; }); return r; }; }
  function q(sql, params) { var st = db.prepare(sql), out = []; try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; })); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }
  var DAY = '2026-11-05 00:00:00';
  function env() { var uu = 0, clock = Date.parse('2026-11-05T09:00:00Z'); return { client: 11, org: 11, user: 100, role: 102, date: DAY, now: '2026-11-05 09:00:00', nowMillis: clock, uuid: function () { uu++; return '00000000-0000-4000-8000-' + ('000000000000' + uu).slice(-12); } }; }
  function postWith(poster, table, id, opts) {                                  // one rolled-back Trx: result + the signed group + every log line
    var trx = new ML.Trx(q, env()), lines = [], doc = trx.get(table, id), res, exc = null; trx.say = function (l) { lines.push(String(l)); };
    try { res = poster(trx, table, doc, opts || { repost: true }); } catch (e) { exc = String(e).slice(0, 200); }
    return { res: res, exc: exc, ops: JSON.stringify(trx.groupOps()), log: lines, trx: trx };
  }
  var poster = ML.getPoster();
  log('§WALC config baseline=' + BASE + (PB ? '' : ' (BASELINE UNAVAILABLE)') + ' mutant=' + (MUT || 'none') + ' poster=' + (BASELINE ? 'baseline' : 'candidate'));
  var legacy = {}, hs = q('SELECT c_allocationhdr_id AS id, posted FROM c_allocationhdr WHERE ad_client_id=11 ORDER BY c_allocationhdr_id'), cashRows = q('SELECT count(*) AS n FROM c_cash')[0].n;
  q('SELECT record_id AS r, c_acctschema_id AS s, account_id AS a, amtacctdr AS d, amtacctcr AS c FROM fact_acct WHERE ad_table_id=735 AND ad_client_id=11').forEach(function (f) {
    var b = legacy[f.r] || (legacy[f.r] = {}); if (cents(f.d)) { var k = f.s + ':' + f.a + ':DR'; b[k] = (b[k] || 0) + cents(f.d); } if (cents(f.c)) { var k2 = f.s + ':' + f.a + ':CR'; b[k2] = (b[k2] || 0) + cents(f.c); } });
  log('§WALC POPULATION allocations(client 11)=' + hs.length + ' legacy-fact allocations=' + Object.keys(legacy).length + ' c_cash rows after patch=' + cashRows);
  var judged = 0, twin = {};
  hs.forEach(function (j) {
    var r = postWith(poster, 'c_allocationhdr', j.id), tw = {}, schemas = {};
    JSON.parse(r.ops).forEach(function (o) { if (o && o.table === 'fact_acct' && o.op_type === 'CRUD_CREATE') { var f = o.fields; schemas[f.c_acctschema_id] = 1;
      if (cents(f.amtacctdr)) { var k = f.c_acctschema_id + ':' + f.account_id + ':DR'; tw[k] = (tw[k] || 0) + cents(f.amtacctdr); } if (cents(f.amtacctcr)) { var k2 = f.c_acctschema_id + ':' + f.account_id + ':CR'; tw[k2] = (tw[k2] || 0) + cents(f.amtacctcr); } } });
    twin[j.id] = tw; var posted = r.trx.get('c_allocationhdr', j.id).posted, lg = legacy[j.id] || {}, keys = {}; Object.keys(tw).concat(Object.keys(lg)).forEach(function (k) { keys[k] = 1; });
    var md = 0, bad = []; Object.keys(keys).forEach(function (k) { var d = Math.abs((tw[k] || 0) - (lg[k] || 0)); if (d > md) md = d; if (d) bad.push(k + ' twin=' + (tw[k] || 0) + ' legacy=' + (lg[k] || 0)); });
    var legN = Object.keys(lg).length; if (legN) judged++;
    log('§WALC alloc=' + j.id + ' legacyKeys=' + legN + ' twinKeys=' + Object.keys(tw).length + ' maxDiff=' + md + 'c posted=' + posted + ' schemasWritten=' + Object.keys(schemas).join(',') + ' res=' + r.res + (r.exc ? ' exc=' + r.exc : '') + ' log=' + r.log.filter(function (l) { return /posted=|not ported|reason/.test(l); }).join(' | ').slice(0, 300));
    Object.keys(keys).sort().forEach(function (k) { log('§WALC   ' + j.id + ' ' + k + ' twin=' + (tw[k] || 0) + ' legacy=' + (lg[k] || 0) + ((tw[k] || 0) === (lg[k] || 0) ? '' : '  <-- DIFF')); });
    ok('A1-' + j.id, 'allocation ' + j.id + ': twin facts == stored legacy Fact_Acct per schema x account x side, Posted=Y', legN ? (md === 0 && Object.keys(tw).length > 0 && posted === 'Y') : null, legN ? 'maxDiff=' + md + 'c posted=' + posted + (bad.length ? ' ' + bad.slice(0, 4).join('; ') : '') : 'VACUOUS: no legacy facts');
  });
  // A5 (§POSTING-PARITY residual #101 724): A1 judges AmtAcct only, so it is scope-blind to the SOURCE amount. Same judgement on AmtSource, keyed schema x account x side x C_Currency_ID.
  var legS = {}, n5 = 0, bad5 = [];
  q('SELECT record_id AS r, c_acctschema_id AS s, account_id AS a, c_currency_id AS cu, amtsourcedr AS d, amtsourcecr AS c FROM fact_acct WHERE ad_table_id=735 AND ad_client_id=11').forEach(function (f) {
    var b = legS[f.r] || (legS[f.r] = {}); if (cents(f.d)) { var k = f.s + ':' + f.a + ':' + f.cu + ':DR'; b[k] = (b[k] || 0) + cents(f.d); } if (cents(f.c)) { var k2 = f.s + ':' + f.a + ':' + f.cu + ':CR'; b[k2] = (b[k2] || 0) + cents(f.c); } });
  hs.forEach(function (j) {
    var lg = legS[j.id]; if (!lg || !Object.keys(lg).length) return; n5++;
    var r = postWith(poster, 'c_allocationhdr', j.id), tw = {}, keys = {};
    JSON.parse(r.ops).forEach(function (o) { if (o && o.table === 'fact_acct' && o.op_type === 'CRUD_CREATE') { var f = o.fields;
      if (cents(f.amtsourcedr)) { var k = f.c_acctschema_id + ':' + f.account_id + ':' + f.c_currency_id + ':DR'; tw[k] = (tw[k] || 0) + cents(f.amtsourcedr); } if (cents(f.amtsourcecr)) { var k2 = f.c_acctschema_id + ':' + f.account_id + ':' + f.c_currency_id + ':CR'; tw[k2] = (tw[k2] || 0) + cents(f.amtsourcecr); } } });
    Object.keys(tw).concat(Object.keys(lg)).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).sort().forEach(function (k) { var same = (tw[k] || 0) === (lg[k] || 0); if (!same) bad5.push(j.id + ' ' + k + ' twin=' + (tw[k] || 0) + ' legacy=' + (lg[k] || 0)); log('§WALC-A5 ' + j.id + ' ' + k + ' twin=' + (tw[k] || 0) + ' legacy=' + (lg[k] || 0) + (same ? '' : '  <-- DIFF')); });
  });
  ok('A5', 'AmtSource: twin facts == stored legacy per schema x account x side x currency (incl. #101 724 rounding line)', n5 ? bad5.length === 0 : null, n5 ? 'allocations=' + n5 + (bad5.length ? ' ' + bad5.slice(0, 4).join('; ') : '') : 'VACUOUS: no legacy facts');
  var t100 = twin[100] || {};
  ok('A2', 'cash-transfer leg 516 Dr + receivable 518 Cr on #100 in schema 101 (50.35) and 200000 (42.80)', judged ? (t100['101:516:DR'] === 5035 && t100['101:518:CR'] === 5035 && t100['200000:516:DR'] === 4280 && t100['200000:518:CR'] === 4280) : null, judged ? JSON.stringify({ s101: [t100['101:516:DR'], t100['101:518:CR']], s200000: [t100['200000:516:DR'], t100['200000:518:CR']] }) : 'VACUOUS');
  // A3: every other document type, candidate vs pinned baseline, byte-identical
  var TABLES = ['c_order', 'm_inout', 'c_invoice', 'c_payment', 'm_matchinv', 'm_matchpo', 'm_movement', 'm_inventory', 'gl_journal', 'c_bankstatement'], n3 = 0, d3 = [], per = {};
  if (!PB) ok('A3', 'baseline model_post loadable via git show ' + BASE, null, 'git show failed - INCONCLUSIVE');
  else {
    TABLES.forEach(function (t) { var rowsT; try { rowsT = q('SELECT ' + t + '_id AS id FROM ' + t + ' WHERE ad_client_id=11 ORDER BY ' + t + '_id'); } catch (e) { rowsT = []; }
      rowsT.forEach(function (d) { var b = postWith(PB.post, t, d.id), c = postWith(PN.post, t, d.id), same = b.res === c.res && b.exc === c.exc && b.ops === c.ops && JSON.stringify(b.log) === JSON.stringify(c.log);
        n3++; per[t] = per[t] || { n: 0, f: 0 }; per[t].n++; if (!same) { per[t].f++; d3.push(t + '#' + d.id); } }); });
    log('§WALC-A3 per table: ' + TABLES.map(function (t) { return t + '=' + (per[t] ? per[t].n : 0) + (per[t] && per[t].f ? '(DIFF ' + per[t].f + ')' : ''); }).join(' '));
    ok('A3', n3 + ' non-allocation documents post byte-identically (result+ops+log) candidate vs baseline ' + BASE + ' on the patched seed', n3 ? d3.length === 0 : null, n3 ? d3.slice(0, 8).join(' ') : 'VACUOUS: no documents');
  }
  // A4: the patch is idempotent
  // the c_cash statements of the patch (DDL + INSERT) alone, twice; and the WHOLE patch twice: c_cash must not change. (Other tables of the pre-existing patch lacking a primary key in the seed duplicate on a re-apply of a LIVE db:
  //   noted below, not c_cash and not new - the page rebuilds the db from the seed on every load.)
  var stm = PATCH.split(/;\s*\n/).map(function (st) { return st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); }).filter(function (st) { return /^(CREATE TABLE IF NOT EXISTS c_cash \(|INSERT OR IGNORE INTO c_cash \()/.test(st); });
  var cc = function (d) { return JSON.stringify(d.exec('SELECT * FROM c_cash ORDER BY c_cash_id')[0].values); }, tabs = function (d) { var o = {}; d.exec("SELECT name FROM sqlite_master WHERE type='table'")[0].values.forEach(function (r) { try { o[r[0]] = d.exec('SELECT count(*) FROM "' + r[0] + '"')[0].values[0][0]; } catch (e) { } }); return o; };
  var d0 = new SQL.Database(SEED); stm.forEach(function (st) { d0.run(st); }); var s1 = cc(d0); stm.forEach(function (st) { d0.run(st); }); var s2 = cc(d0);
  var d1 = new SQL.Database(SEED); applyPatch(d1); var f1 = cc(d1), t1 = tabs(d1); applyPatch(d1); var f2 = cc(d1), t2 = tabs(d1), other = Object.keys(t1).filter(function (k) { return t1[k] !== t2[k]; });
  log('§WALC-A4 c_cash statements=' + stm.length + ' (DDL + INSERT); other tables of the pre-existing patch that grow on a LIVE-db re-apply (not c_cash): ' + other.length);
  ok('A4', 'c_cash statements applied twice, and the whole patch applied twice: the 3 C_Cash rows stay 3 identical rows (no duplicates)', stm.length === 2 && JSON.parse(s1).length === 3 && s1 === s2 && f1 === f2 && JSON.parse(f2).length === 3 && other.indexOf('c_cash') < 0, 'statements=' + stm.length + ' rows=' + JSON.parse(f2).length + ' sameAfterTwice=' + (s1 === s2 && f1 === f2));
  var verdict = fail ? 'FAIL' : (inc || !judged) ? 'INCONCLUSIVE' : 'PASS';
  log('§WALC-SUMMARY ' + verdict + ' mutant=' + (MUT || 'none') + ' baseline=' + (BASELINE ? 'Y' : 'N') + ' allocationsJudged=' + judged + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc);
  process.exit(fail ? 1 : verdict === 'INCONCLUSIVE' ? 3 : 0);
})().catch(function (e) { console.log('§WALC CRASH ' + (e && e.stack || e)); process.exit(2); });
