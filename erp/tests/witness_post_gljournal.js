#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-POST-GLJOURNAL (bim-compiler prompts/SQLiteIDEMPIERE.md §POSTING-PARITY RECONCILED 2026-11-03; CARDINAL RULE: twin == legacy). READ THE LOG: §WGLJ lines; exit code is not evidence.
// THE ISSUE: the shipped posting path (ML.setPoster -> model_post.post) had NO Doc_GLJournal in its DOC registry: a Completed GL_Journal logged "no Doc class ported" and Posted stayed N,
//   where legacy (Doc_GLJournal.java:140-177 + Doc.postLogic Fact.balanceSegments) writes the direct lines AND the per-org Intercompany Due-To/Due-From legs and sets Posted='Y'.
//   G1 every client-11 GL_Journal of ad_seed.db posts through the REAL poster (ML.getPoster()) and its facts == the seed's stored LEGACY Fact_Acct per schema x account x side (integer cents, maxDiff 0), Posted='Y'
//   G2 the 600 / 741 intercompany legs are present (per journal)   G3 every OTHER doc type's model_post output is byte-identical to the pinned baseline (git show BASE:erp/model_post.js)
//   MUTANTS: MUT=noseg (LMV_BREAK=nosegments: org balancing dropped) and MUT=flip (one line's side flipped) must FAIL G1; GLJ_BASELINE=1 (baseline poster) must FAIL G1. Nothing judged -> INCONCLUSIVE.
// Run: node erp/tests/witness_post_gljournal.js   (node only; sql.js)
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process'), Module = require('module');
var ERP = path.join(__dirname, '..'), BASE = 'd4d9b79d', MUT = process.env.MUT || '', BASELINE = !!process.env.GLJ_BASELINE;
if (MUT === 'noseg') process.env.LMV_BREAK = 'nosegments';
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
var log = function (s) { console.log(s); }, pass = 0, fail = 0, inc = 0;
var ok = function (id, n, c, d) { log((c === null ? '  ⚠ ' : c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c === null ? inc++ : c ? pass++ : fail++; };
var cents = function (v) { return Math.round(Number(v || 0) * 100); };
(async function main() {
  var SQL = await initSqlJs(), db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); } catch (e) { } });
  var A = require(path.join(ERP, 'ad_callout.js'));
  ['support', 'support_stock', 'views', 'currency', 'uom', 'pricing', 'tax', 'sqlfn'].forEach(function (m) { require(path.join(ERP, 'callouts', m + '.js')); });
  A.RUNTIME.registerSqlFunctions(function (n, f) { db.create_function(n, f); });
  var ML = require(path.join(ERP, 'model_layer.js'));
  ['model_trade', 'model_ctor', 'model_cost', 'model_match', 'model_order', 'model_invoice'].forEach(function (m) { require(path.join(ERP, m + '.js')); });
  // the pinned baseline model_post, loaded as a module in ERP/ (so ./model_layer resolves to the SAME singleton); the candidate is required AFTER so its setPoster wins unless GLJ_BASELINE
  var src; try { src = cp.execFileSync('git', ['show', BASE + ':erp/model_post.js'], { cwd: ERP, maxBuffer: 1 << 26 }).toString(); } catch (e) { src = null; }
  var PB = null; if (src) { var m = new Module(path.join(ERP, '__model_post_baseline.js'), module); m.filename = path.join(ERP, '__model_post_baseline.js'); m.paths = Module._nodeModulePaths(ERP); m._compile(src, m.filename); PB = m.exports; }
  var PN = require(path.join(ERP, 'model_post.js'));
  var P = BASELINE ? PB : PN; if (BASELINE && PB) ML.setPoster(PB.post);
  if (MUT === 'flip') { var orig = P.DOC.gl_journal; if (orig) P.DOC.gl_journal = function (trx, j, as, F) { var r = orig(trx, j, as, F); if (F.lines.length) { var l = F.lines[0], t = l.amtsourcedr; l.amtsourcedr = l.amtsourcecr; l.amtsourcecr = t; t = l.amtacctdr; l.amtacctdr = l.amtacctcr; l.amtacctcr = t; } return r; }; }
  function q(sql, params) { var st = db.prepare(sql), out = []; try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; })); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }
  var DAY = '2026-11-04 00:00:00';
  function env() { var uu = 0, clock = Date.parse('2026-11-04T09:00:00Z'); return { client: 11, org: 11, user: 100, role: 102, date: DAY, now: '2026-11-04 09:00:00', nowMillis: clock, uuid: function () { uu++; return '00000000-0000-4000-8000-' + ('000000000000' + uu).slice(-12); } }; }
  function postWith(poster, table, id, opts) {                                  // one rolled-back Trx: result + the signed group + every log line
    var trx = new ML.Trx(q, env()), lines = [], doc = trx.get(table, id), res, exc = null; trx.say = function (l) { lines.push(String(l)); };
    try { res = poster(trx, table, doc, opts || { repost: true }); } catch (e) { exc = String(e).slice(0, 200); }
    return { res: res, exc: exc, ops: JSON.stringify(trx.groupOps()), log: lines, trx: trx };
  }
  var poster = ML.getPoster();
  log('§WGLJ config baseline=' + BASE + (BASE && PB ? '' : ' (BASELINE UNAVAILABLE)') + ' mutant=' + (MUT || 'none') + ' poster=' + (BASELINE ? 'baseline' : 'candidate') + ' DOC.gl_journal=' + (P.DOC.gl_journal ? 'present' : 'ABSENT'));

  // ── G1/G2 ──
  var legacy = {}, js = q('SELECT gl_journal_id AS id, c_acctschema_id AS s, posted FROM gl_journal WHERE ad_client_id=11 ORDER BY gl_journal_id');
  q('SELECT record_id AS r, c_acctschema_id AS s, account_id AS a, amtacctdr AS d, amtacctcr AS c FROM fact_acct WHERE ad_table_id=224 AND ad_client_id=11').forEach(function (f) {
    var b = legacy[f.r] || (legacy[f.r] = {}); if (cents(f.d)) { var k = f.s + ':' + f.a + ':DR'; b[k] = (b[k] || 0) + cents(f.d); } if (cents(f.c)) { var k2 = f.s + ':' + f.a + ':CR'; b[k2] = (b[k2] || 0) + cents(f.c); } });
  log('§WGLJ POPULATION journals(client 11)=' + js.length + ' legacy-fact journals=' + Object.keys(legacy).length + ' (client-13 rows reusing record_ids are excluded by ad_client_id)');
  var judged = 0, g2 = { want: 0, have: 0 };
  js.forEach(function (j) {
    var r = postWith(poster, 'gl_journal', j.id), tw = {}, orgs = {}, schemas = {}, delC = 0, delOther = 0;
    JSON.parse(r.ops).forEach(function (o) {
      if (o && o.table === 'fact_acct' && o.op_type === 'CRUD_CREATE') { var f = o.fields; schemas[f.c_acctschema_id] = 1;
        if (cents(f.amtacctdr)) { var k = f.c_acctschema_id + ':' + f.account_id + ':DR'; tw[k] = (tw[k] || 0) + cents(f.amtacctdr); } if (cents(f.amtacctcr)) { var k2 = f.c_acctschema_id + ':' + f.account_id + ':CR'; tw[k2] = (tw[k2] || 0) + cents(f.amtacctcr); }
        orgs[f.account_id + '@' + f.ad_org_id] = 1; }
      if (o && o.table === 'fact_acct' && o.op_type === 'CRUD_DELETE') delC++; });
    var posted = r.trx.get('gl_journal', j.id).posted, lg = legacy[j.id] || {}, keys = {}; Object.keys(tw).concat(Object.keys(lg)).forEach(function (k) { keys[k] = 1; });
    var md = 0, bad = []; Object.keys(keys).forEach(function (k) { var d = Math.abs((tw[k] || 0) - (lg[k] || 0)); if (d > md) md = d; if (d) bad.push(k + ' twin=' + (tw[k] || 0) + ' legacy=' + (lg[k] || 0)); });
    var legN = Object.keys(lg).length; if (legN) judged++;
    var has = function (a) { return Object.keys(tw).some(function (k) { return k.split(':')[1] === String(a); }); }, want = [600, 741]; g2.want += want.length; want.forEach(function (a) { if (has(a)) g2.have++; });
    log('§WGLJ journal=' + j.id + ' schema=' + j.s + ' legacyKeys=' + legN + ' twinKeys=' + Object.keys(tw).length + ' maxDiff=' + md + 'c posted=' + posted + ' schemasWritten=' + Object.keys(schemas).join(',') + ' dueToFrom=' + [600, 741].map(function (a) { return a + ':' + (has(a) ? 'Y' : 'N'); }).join('/') + (r.exc ? ' EXC=' + r.exc : '') + (bad.length ? ' DIFF ' + bad.join(' | ') : '') + ' log=' + r.log.filter(function (l) { return /§MODEL-POST/.test(l); }).join(' ; ').slice(0, 220));
    ok('G1-' + j.id, 'journal ' + j.id + ' (schema ' + j.s + '): twin facts == stored legacy Fact_Acct per schema x account x side, Posted=Y', legN ? (md === 0 && Object.keys(tw).length > 0 && posted === 'Y') : null, legN ? 'maxDiff=' + md + 'c posted=' + posted : 'VACUOUS: no legacy facts to judge against');
  });
  ok('G2', 'intercompany Due-To (600) and Due-From (741) legs present on every journal', judged ? g2.have === g2.want : null, judged ? g2.have + '/' + g2.want : 'VACUOUS');

  // ── G3: every other doc type, candidate vs pinned baseline, byte-identical (result, ops, log) ──
  // c_allocationhdr deliberately NOT here: Doc_AllocationHdr gained its legs (W-POST-ALLOCATION owns that judgement, PIN f4cdcdf8)
  var TABLES = ['c_order', 'm_inout', 'c_invoice', 'c_payment', 'm_matchinv', 'm_matchpo', 'm_movement', 'm_inventory'], n3 = 0, d3 = [], per = {};
  if (!PB) ok('G3', 'baseline model_post loadable via git show ' + BASE, null, 'git show failed - INCONCLUSIVE');
  else {
    TABLES.forEach(function (t) {
      q('SELECT ' + t + '_id AS id FROM ' + t + ' WHERE ad_client_id=11 ORDER BY ' + t + '_id').forEach(function (d) {
        var b = postWith(PB.post, t, d.id), c = postWith(PN.post, t, d.id), same = b.res === c.res && b.exc === c.exc && b.ops === c.ops && JSON.stringify(b.log) === JSON.stringify(c.log);
        n3++; per[t] = per[t] || { n: 0, f: 0 }; per[t].n++; if (!same) { per[t].f++; d3.push(t + '#' + d.id); } });
    });
    log('§WGLJ-G3 per table: ' + TABLES.map(function (t) { return t + '=' + (per[t] ? per[t].n : 0) + (per[t] && per[t].f ? '(DIFF ' + per[t].f + ')' : ''); }).join(' '));
    ok('G3', n3 + ' non-journal documents post byte-identically (result+ops+log) candidate vs baseline ' + BASE, n3 ? d3.length === 0 : null, n3 ? d3.slice(0, 8).join(' ') : 'VACUOUS: no documents');
  }
  var verdict = fail ? 'FAIL' : (inc || !judged) ? 'INCONCLUSIVE' : 'PASS';
  log('§WGLJ-SUMMARY ' + verdict + ' mutant=' + (MUT || 'none') + ' baseline=' + (BASELINE ? 'Y' : 'N') + ' journalsJudged=' + judged + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc);
  process.exit(fail ? 1 : verdict === 'INCONCLUSIVE' ? 3 : 0);
})().catch(function (e) { log('§WGLJ-ERROR ' + e.stack); process.exit(2); });
