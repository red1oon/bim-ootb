#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DOCNO-TILL (bim-compiler prompts/TEAMWORK_FRAMEWORK.md §48.10; CARDINAL TWIN RULE: the legacy MSequence mechanism, configured, no new code).
//   READ THE LOG after every run: every verdict is a §DT line, the exit code is not the evidence.
// THE ISSUE it proves/disproves: DocumentNo = Org|Till|Sequence with ONE legacy sequence, Prefix "@AD_Org_ID.Value/K@-@C_POS_ID.Name/K@-" (MSequence.java:70 /K key, :603-612 sequence-no
//   level, DefaultEvaluatee.java:167-175/:268-301 reference operator), so every till runs its own gapless number and two stations working OFFLINE never draw the same DocumentNo.
//   D1 own series per till (interleaved) · D2 gapless 1..n per till · D3 another org's till starts its own · D4 two devices offline, own till each: no shared number
//   D5 CONTROL: the same two devices on the shipped plain sequence DO collide (else D4 is vacuous) · D6 an order with no till: measured, and not in any till's series
//   LEGACY arm: INCONCLUSIVE until scripts/bridge/out/docno_till_legacy.json exists (same config run on the pilot).
'use strict';
var fs = require('fs'), path = require('path'), os = require('os');
var ERP = path.join(__dirname, '..');
var SQLJS_DIR = process.env.SQLJS_DIR || path.join(os.homedir(), 'bim-ootb/tests/node_modules/sql.js'), initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(SQLJS_DIR); }
var judged = 0, fails = 0, inconc = 0, log = function (s) { console.log(s); };
function ck(id, issue, ok, d) { judged++; if (!ok) fails++; log('§DT ' + (ok ? 'PASS' : 'FAIL') + ' ' + id + ' - ' + issue + (d ? ' :: ' + d : '')); }
var PREFIX = '@AD_Org_ID.Value/K@-@C_POS_ID.Name/K@-', SEQ = 9300001, POS = { T1: 9300101, T2: 9300102, N1: 9300103 }, ORG2 = 50002;

async function device(SQL, label) {        // one device = its own copy of the shipped state (ad_seed.db + the self-heal patch), offline
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (st) try { db.run(st); } catch (e) {} });
  db.run("INSERT INTO ad_sequence (ad_sequence_id,ad_client_id,ad_org_id,isactive,name,isautosequence,incrementno,startno,currentnext,currentnextsys,istableid,prefix,startnewyear,decimalpattern,startnewmonth,isorglevelsequence) VALUES (?,11,0,'Y','DocNo Org|Till','Y',1,1,1,100,'N',?,'N','000000','N','N')", [SEQ, PREFIX]);
  [['T1', 11], ['T2', 11], ['N1', ORG2]].forEach(function (p) { db.run("INSERT INTO c_pos (c_pos_id,ad_client_id,ad_org_id,isactive,name) VALUES (?,11,?,'Y',?)", [POS[p[0]], p[1], p[0]]); });
  function q(sql, params) { var st = db.prepare(sql), out = []; try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; }));
    while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }
  var ML = require(path.join(ERP, 'model_layer.js')), MT = require(path.join(ERP, 'model_trade.js')), says = [];
  function apply(ops) { ops.forEach(function (o) {
    if (o.op_type === 'CRUD_UPDATE') { var kk = Object.keys(o.changes); db.run('UPDATE ' + o.table + ' SET ' + kk.map(function (k) { return '"' + k + '"=?'; }).join(',') + ' WHERE ' + (o.idCol || o.table + '_id') + '=?', kk.map(function (k) { return o.changes[k].new; }).concat([o.id])); }
    else if (o.op_type === 'CRUD_CREATE') { var f = o.fields, ks = Object.keys(f); db.run('INSERT INTO ' + o.table + ' (' + ks.map(function (k) { return '"' + k + '"'; }).join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return f[k]; })); } }); }
  function draw(seqId, po) {                                   // MSequence.getDocumentNoFromSeq, one Trx per save; its writes (AD_Sequence_No / AD_Sequence) committed
    var trx = new ML.Trx(q, { client: 11, org: po.ad_org_id, user: 100, role: 102, date: '2026-10-31', now: '2026-10-31 09:00:00', nowMillis: Date.now(), uuid: function () { return require('crypto').randomUUID(); } });
    var dn = MT.getDocumentNoFromSeq(trx, trx.get('ad_sequence', seqId), po);
    (trx.lines || trx.log || []).forEach(function (l) { if (/§MODEL-SEQ/.test(l)) says.push(String(l)); });
    apply(trx.ops.filter(Boolean)); return dn; }
  return { label: label, draw: draw, says: says, plainSeq: q("SELECT docnosequence_id AS s FROM c_doctype WHERE c_doctype_id=132")[0].s };
}
function series(nums, pre) { return nums.filter(function (n) { return n.indexOf(pre) === 0; }).map(function (n) { return Number(n.slice(pre.length)); }); }
function gapless(a) { return a.length > 0 && a.every(function (n, i) { return n === i + 1; }); }

(async function () {
  var SQL = await initSqlJs(), A = await device(SQL, 'A');
  // D1/D2/D3: one device, interleaved saves T1,T2,T1,T1,T2,N1
  var plan = [['T1', 11], ['T2', 11], ['T1', 11], ['T1', 11], ['T2', 11], ['N1', ORG2]], got = plan.map(function (p) { return A.draw(SEQ, { ad_org_id: p[1], c_pos_id: POS[p[0]] }); });
  log('§DT-NUMBERS device=A ' + plan.map(function (p, i) { return p[0] + '=' + got[i]; }).join(' '));
  var t1 = series(got, 'HQ-T1-'), t2 = series(got, 'HQ-T2-'), n1 = series(got, 'Store North-N1-');
  ck('D1', 'two tills in one org each run their own series over interleaved saves (prefix Org-Till-)', t1.length === 3 && t2.length === 2, 'T1=' + JSON.stringify(t1) + ' T2=' + JSON.stringify(t2));
  ck('D2', 'each till series is gapless 1..n', gapless(t1) && gapless(t2), 'T1=' + t1 + ' T2=' + t2);
  ck('D3', "another org's till starts its own series (the org value is part of the key)", n1.length === 1 && n1[0] === 1, 'N1=' + JSON.stringify(n1) + ' got=' + got[5]);
  // D4: two devices from the SAME shipped state, offline, each its own till, same customer, 5 orders each
  var B1 = await device(SQL, 'B1'), B2 = await device(SQL, 'B2'), d1 = [], d2 = [];
  for (var i = 0; i < 5; i++) { d1.push(B1.draw(SEQ, { ad_org_id: 11, c_pos_id: POS.T1 })); d2.push(B2.draw(SEQ, { ad_org_id: 11, c_pos_id: POS.T2 })); }
  var shared = d1.filter(function (n) { return d2.indexOf(n) >= 0; });
  log('§DT-OFFLINE device B1(T1)=' + d1.join(',') + ' device B2(T2)=' + d2.join(','));
  ck('D4', 'two devices numbering OFFLINE from the same shipped state, each for its own till, share no DocumentNo (the legacy unique (DocumentNo,C_DocType_ID,C_BPartner_ID) cannot fire)', d1.length === 5 && d2.length === 5 && shared.length === 0, 'shared=' + JSON.stringify(shared));
  // D5 CONTROL: the shipped plain sequence (Standard Order's DocNoSequence) on two devices
  var C1 = await device(SQL, 'C1'), C2 = await device(SQL, 'C2'), c1 = [], c2 = [];
  for (var j = 0; j < 3; j++) { c1.push(C1.draw(C1.plainSeq, { ad_org_id: 11, c_pos_id: POS.T1 })); c2.push(C2.draw(C2.plainSeq, { ad_org_id: 11, c_pos_id: POS.T2 })); }
  var clash = c1.filter(function (n) { return c2.indexOf(n) >= 0; });
  log('§DT-CONTROL plain seq=' + C1.plainSeq + ' device C1=' + c1.join(',') + ' device C2=' + c2.join(','));
  ck('D5', 'CONTROL: the same two devices on the shipped plain sequence DO draw the same numbers (the defect D4 removes is real)', clash.length === 3, 'clash=' + JSON.stringify(clash));
  // D6: an order with no till
  var none = A.draw(SEQ, { ad_org_id: 11, c_pos_id: null });
  log('§DT-NOTILL org=HQ c_pos_id=null DocumentNo=' + none);
  ck('D6', 'an order with no till gets a number outside every till series (measured: ' + none + ')', none && !/^HQ-T[12]-/.test(none) && !/^Store North-/.test(none), none);
  log('§DT-SEQLOG ' + (A.says.slice(0, 2).join(' | ') || '(no §MODEL-SEQ lines captured)'));
  var LJ = path.join(os.homedir(), 'bim-compiler/scripts/bridge/out/docno_till_legacy.json');
  if (!fs.existsSync(LJ)) { inconc++; log('§DT INCONCLUSIVE LEGACY - no oracle file ' + LJ + ' (run the same config on the pilot; until then the twin numbers are not legacy-compared)'); }
  log('§DT_VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' inconclusive=' + inconc + (inconc ? ' (legacy arm)' : ''));
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.log('§DT_VERDICT FAIL crash ' + (e && e.stack || e)); process.exit(1); });
