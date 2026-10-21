#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-DD-ORDER-DIFF (prompts/mfg/LIBERO_DD_SPEC.md §5; TWIN CARDINAL RULE). READ THE LOG: §DDO lines and the verdict §DDO-SUMMARY; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: the twin had no physical DD_Order / DD_OrderLine and no MDDOrder / MDDOrderLine model, so a Distribution Order could not even be saved. Fixture pair: legacy = oracle op `makedoc` (a header + lines built through the REAL
//   MDDOrder / MDDOrderLine via MTable.getPO, then each action of `actions` applied to the SAME document on a freshly loaded PO, the asked rows returned after every step, one rolled-back trx - nothing is committed);
//   twin = the same field values through the model layer (SAVE header, SAVE lines, DOCACTION per step). Every column legacy returns is compared with the twin row (volatile: ids/audit/uu; processedon by presence).
//   D1-D8 oracle-compared; D9 getValidActions vs ad_docfsm; D10-D12 twin-side checks hand-computed from the Java (labelled, NOT oracle: legacy cannot be driven there). Zero judged prints INCONCLUSIVE, never PASS.
// Negative controls (MUST exit 1): DD_BREAK=voidzero (the twin voidIt zeroes QtyOrdered like MOrder) -> D-VOID red; DD_BREAK=noreserve (prepareIt reserves nothing) -> D-PREPARE red.
// Run: NODE_PATH=$HOME/bim-ootb/tests/node_modules:$HOME/bim-ootb/node_modules node erp/tests/witness_dd_order_diff.js   (pilot + oracle :8097 with ops makedoc, validactions)
'use strict';
var path = require('path'), cp = require('child_process');
var C = require('./dd_common.js');
var pass = 0, fail = 0, inc = 0, judged = 0, BREAK = process.env.DD_BREAK || '';
var log = function (s) { console.log(s); };
var ok = function (id, n, c, d) { judged++; log((c === null ? '  ⚠ ' : c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c === null ? inc++ : c ? pass++ : fail++; };

(async function main() {
  var H = await C.boot(), TODAY = H.TODAY, q = H.q, lc = C.lc;
  log('§DDO-SEED ad_seed.db + patches statements ok=' + H.patchOk + ' failed=' + H.patchBad + ' today=' + TODAY + ' break=' + (BREAK || 'none'));
  var CTX = Object.assign({ date: TODAY }, H.ctx);

  // ── DDL-CHECK: the physical tables exist with exactly the reference Postgres columns ──────────────────────────────────────
  function pgCols(t) { return cp.execFileSync('psql', ['-h', 'localhost', '-U', 'adempiere', '-d', 'idempiere', '-Atc', "select column_name from information_schema.columns where table_schema='adempiere' and table_name='" + t + "' order by ordinal_position"], { env: Object.assign({}, process.env, { PGPASSWORD: 'adempiere' }), encoding: 'utf8' }).trim().split('\n').filter(Boolean); }
  ['dd_order', 'dd_orderline', 'dd_networkdistribution', 'dd_networkdistributionline'].forEach(function (t) {
    var mine = q('PRAGMA table_info(' + t + ')').map(function (c) { return c.name.toLowerCase(); }), ref = pgCols(t), missing = ref.filter(function (c) { return mine.indexOf(c) < 0; });
    log('§DDO-DDL table=' + t + ' twin=' + mine.length + ' reference=' + ref.length + ' missing=' + (missing.join(',') || '-'));
    ok('DDL-' + t, t + ' physical table has every column of the reference Postgres (' + ref.length + ')', ref.length > 0 && mine.length >= ref.length && !missing.length);
  });

  // ── fixtures ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
  var HDR = { AD_Org_ID: 11, C_DocType_ID: 50012, C_BPartner_ID: 112, C_BPartner_Location_ID: 108, M_Warehouse_ID: 103, SalesRep_ID: 101, DateOrdered: TODAY, DatePromised: TODAY, IsSOTrx: 'N', IsInDispute: 'N', IsInTransit: 'N' };
  var LN = function (p, qty, extra) { return Object.assign({ AD_Org_ID: 11, M_Product_ID: p, C_UOM_ID: 100, QtyEntered: qty, QtyOrdered: qty, IsInvoiced: 'N', M_Locator_ID: 101, M_LocatorTo_ID: 50000 }, extra || {}); };
  var STOR = { sres: "SELECT m_warehouse_id, m_product_id, m_attributesetinstance_id, issotrx, qty FROM m_storagereservation WHERE m_product_id IN (SELECT m_product_id FROM dd_orderline WHERE dd_order_id=?) ORDER BY 1,2,3,4",
    sonh: "SELECT m_locator_id, m_product_id, m_attributesetinstance_id, datematerialpolicy, qtyonhand FROM m_storageonhand WHERE m_product_id IN (SELECT m_product_id FROM dd_orderline WHERE dd_order_id=?) ORDER BY 1,2,3,4" };
  var Q = Object.assign({ lineq: 'SELECT COALESCE(MAX(line),0)+10 AS v FROM c_orderline WHERE c_order_id=?', hdr: 'SELECT * FROM dd_order WHERE dd_order_id=?', lines: 'SELECT * FROM dd_orderline WHERE dd_order_id=? ORDER BY line, dd_orderline_id' }, STOR);
  var canon = function (rows) { return JSON.stringify(rows.map(function (r) { return Object.keys(r).sort().map(function (k) { return k + '=' + C.norm(k, r[k]); }).join(','); })); };
  var HCO = Object.assign({}, HDR, { DocAction: 'CO' });   // what the window / WebService saves after the user picks Complete (setInitialDefaults leaves DocAction = Prepare)
  var CASES = [
    { id: 'D1-docaction-PR', note: 'DocAction left at Prepare: Complete only prepares (completeIt :965), then void', hdr: HDR, lines: [LN(130, 7, { Line: 10 })], actions: ['PR', 'CO', 'VO'], tag: 'PREPARE' },
    { id: 'D1b-complete-void', note: 'prepare, complete, void (the upstream defect: nothing is un-reserved)', hdr: HCO, lines: [LN(130, 7, { Line: 10 })], actions: ['PR', 'CO', 'VO'], tag: 'VOID' },
    { id: 'D2-close-completed', note: 'complete then close', hdr: HCO, lines: [LN(130, 7, { Line: 10 })], actions: ['CO', 'CL'], tag: 'CLOSE' },
    { id: 'D3-reactivate', note: 'complete, reactivate, complete again', hdr: HCO, lines: [LN(130, 7, { Line: 10 })], actions: ['CO', 'RE', 'CO'], tag: 'REACT' },
    { id: 'D4-two-lines', note: 'two products (weight 10), line numbers and UOM defaulted, complete, close', hdr: HCO, lines: [LN(128, 3), (function () { var l = LN(130, 5); delete l.C_UOM_ID; return l; })()], actions: ['PR', 'CO', 'CL'], tag: 'CLOSE' },
    { id: 'D5-partial-delivered', note: 'QtyDelivered 3 of 7: reserve 4, close cancels the rest', hdr: HCO, lines: [LN(130, 7, { Line: 10, QtyDelivered: 3 })], actions: ['PR', 'CO', 'CL'], tag: 'CLOSE' },
    { id: 'D5b-engine-gate', note: 'Close while InProgress: the UI offers it, DocumentEngine.getActionOptions does not - the engine runs the document DocAction (Complete) instead', hdr: HCO, lines: [LN(130, 7, { Line: 10 })], actions: ['PR', 'CL'], tag: 'GATE' },
    { id: 'D6-void-draft', note: 'void a Drafted order', hdr: HCO, lines: [LN(130, 7, { Line: 10 })], actions: ['VO'], tag: 'VOID' },
    { id: 'D7-precision', note: 'QtyOrdered 7.4 -> product UOM precision 0, QtyEntered 7.6 -> 8', hdr: HCO, lines: [LN(130, 7, { Line: 10, QtyOrdered: 7.4, QtyEntered: 7.6 })], actions: ['PR'], tag: 'PREPARE' },
    { id: 'D8-header-sync', note: 'DatePromised + Description edits reach the lines / open movements (afterSave sync)', hdr: HCO, lines: [LN(130, 7, { Line: 10 })], actions: ['PR', { set: { DatePromised: '2026-12-31' } }, { set: { Description: 'edited' } }], tag: 'SYNC' },
    { id: 'R1-no-lines', note: 'complete without lines', hdr: HCO, lines: [], actions: ['CO'], tag: 'REFUSAL', refusal: true },
    { id: 'R3-doc-class-invalid', note: 'Complete with immediate accounting: legacy has no Doc_DDOrder class (Libero ships it) and THROWS', hdr: HCO, lines: [LN(130, 7, { Line: 10 })], actions: ['CO'], tag: 'REFUSAL', refusal: true, post: true, exception: true },
    { id: 'R2-period-closed', note: 'DateOrdered in the permanently closed 2035-01 period', hdr: Object.assign({}, HCO, { DateOrdered: '2035-01-15', DatePromised: '2035-01-15' }), lines: [LN(130, 7, { Line: 10 })], actions: ['CO'], tag: 'REFUSAL', refusal: true }
  ];
  var HCO_T = HCO;
  var tw = function (o) { return lc(o); };
  var skipHdr = { documentno: 1, dd_order_id: 1, dd_order_uu: 1 }, skipLine = { dd_orderline_id: 1, dd_order_id: 1, dd_orderline_uu: 1 };
  var cmpLines = function (Ls, Ts) { var diffs = [], n = 0; if (Ls.length !== Ts.length) return { diffs: ['line count legacy=' + Ls.length + ' twin=' + Ts.length], n: 0 }; Ls.forEach(function (L, i) { var r = C.cmpRow(L, Ts[i], { skip: skipLine }); n += r.n; r.diffs.forEach(function (d) { diffs.push('line' + (i + 1) + '.' + d); }); r.missing.forEach(function (m) { diffs.push('line' + (i + 1) + ' twin lacks column ' + m); }); }); return { diffs: diffs, n: n }; };

  for (var ci = 0; ci < CASES.length; ci++) {
    var K = CASES[ci], L;
    try { L = (await C.oracle({ op: 'makedoc', ctx: CTX, header: { table: 'DD_Order', fields: K.hdr }, lines: K.lines.map(function (l) { return { table: 'DD_OrderLine', parentColumn: 'DD_Order_ID', fields: l }; }), actions: K.actions, queriesEach: true, queriesBefore: true, noPost: !K.post, queries: Q })).doc; }
    catch (e) { ok('ORACLE-' + K.id, 'oracle reachable', false, String(e.message)); continue; }
    if (L.exception) { log('§DDO case=' + K.id + ' LEGACY-REFUSED at build: ' + String(L.exception).slice(0, 200)); ok(K.id, 'legacy built the fixture', null, 'not judged'); continue; }
    // twin: header, lines, actions
    var h = H.save('dd_order', K.hdr);
    if (!h.ok) { ok(K.id, K.note + ' - twin header save', false, h.error || h.msg); continue; }
    var oid = H.lastId('dd_order'), lineFail = null;
    // FIXTURE SYNC (W-COSTING-SWEEP precedent): MDDOrderLine.beforeSave :620 numbers a line by MAX(C_OrderLine.Line) WHERE C_Order_ID = the new DD_Order_ID (upstream defect, §DD-QUIRK-LINE). The pilot's new id
    //   happens to collide with a real sales order that has lines; the twin's id space does not. Give the twin the same C_OrderLine max so BOTH sides evaluate the same query on the same data.
    var lq = Number((((L.rowsBefore || {}).lineq || [{}])[0] || {}).v || 10);
    if (lq > 10) { H.db.run("INSERT INTO c_orderline (c_orderline_id, c_order_id, line, ad_client_id, ad_org_id, isactive) VALUES (?, ?, ?, 11, 11, 'Y')", [8000000 + oid % 100000, oid, lq - 10]); log('§DDO-FIXTURE-SYNC case=' + K.id + ' legacy MAX(C_OrderLine.Line)+10 at C_Order_ID=' + L.id + ' is ' + lq + ' -> twin stub c_orderline at C_Order_ID=' + oid + ' line ' + (lq - 10)); }
    K.lines.forEach(function (l) { if (lineFail) return; var r = H.save('dd_orderline', Object.assign({ dd_order_id: oid }, l)); if (!r.ok) lineFail = r.error || r.msg; });
    if (lineFail) { ok(K.id, K.note + ' - twin line save', false, lineFail); continue; }
    var twBefore = {}, legBefore = L.rowsBefore || {}; Object.keys(STOR).forEach(function (k) { twBefore[k] = canon(q(STOR[k], [oid])); });
    for (var si = 0; si < K.actions.length; si++) {
      var A = K.actions[si], S = L.steps[si], tr, label;
      if (!S) { ok(K.id + ':' + si, 'legacy produced step ' + si, false, 'steps=' + (L.steps || []).length); break; }
      if (typeof A === 'object') { label = 'set(' + Object.keys(A.set).join(',') + ')'; tr = H.update('dd_order', oid, lc(A.set)); var lref = S.exception != null; }
      else { label = A; tr = H.docAction('dd_order', oid, A, { noWorkflow: true, noPost: !K.post }); }
      var tid = 'step=' + label;
      if (typeof A === 'object') {
        var legRef = S.exception != null, twRef = !tr.ok;
        ok(K.id + ':' + tid, 'refused/accepted alike (legacy ' + (legRef ? 'refused: ' + String(S.exception).slice(0, 70) : 'saved') + ', twin ' + (twRef ? 'refused: ' + String(tr.error || tr.msg).slice(0, 70) : 'saved') + ')', legRef === twRef);
        if (legRef) break;
      } else {
        var legOK = S.processed === true, twOK = tr.ok === true && (tr.status === 'CO' || tr.status === 'IP' || tr.status === 'VO' || tr.status === 'CL' || A === 'RE' || A === 'VO' || A === 'CL');
        var twStatus = tr.ok ? (H.one('SELECT docstatus FROM dd_order WHERE dd_order_id=?', [oid]) || {}).docstatus : tr.status;
        log('§DDO case=' + K.id + ' step=' + label + ' legacy processed=' + S.processed + ' status=' + S.docStatus + (S.processMsg ? ' msg=' + S.processMsg : '') + ' | twin ok=' + tr.ok + ' status=' + twStatus + (tr.msg ? ' msg=' + tr.msg : ''));
        if (K.refusal && K.exception) {
          ok(K.id + ':' + tid, 'both sides FAIL the completion: legacy "' + String(S.exception).slice(0, 90) + '" / twin "' + String(tr.msg).slice(0, 60) + '"', !!S.exception && /Doc Class invalid: (org\.compiere\.acct\.)?Doc_DDOrder/.test(S.exception) && !tr.ok && /Doc Class invalid: Doc_DDOrder/.test(String(tr.msg)));
          continue;
        }
        if (K.refusal) {
          ok(K.id + ':' + tid, 'refused alike: legacy status ' + S.docStatus + ' msg "' + S.processMsg + '" == twin status ' + tr.status + ' msg "' + tr.msg + '"', S.processed === false && !tr.ok && S.docStatus === tr.status && String(S.processMsg) === String(tr.msg));
          continue;
        }
        if (!(legOK && tr.ok)) { ok(K.id + ':' + tid, 'both sides performed the action (legacy ' + S.processed + '/' + S.docStatus + (S.processMsg ? ' ' + S.processMsg : '') + ', twin ' + tr.ok + '/' + twStatus + ' ' + (tr.msg || '') + (S.exception ? ' LEGACY-EXC ' + String(S.exception).slice(0, 140) : '') + ')', false); break; }
      }
      // compare every row legacy returned at this step
      var rows = S.rows || {}, th = H.one('SELECT * FROM dd_order WHERE dd_order_id=?', [oid]), tls = q('SELECT * FROM dd_orderline WHERE dd_order_id=? ORDER BY line, dd_orderline_id', [oid]);
      var rh = C.cmpRow(rows.hdr[0], th, { skip: skipHdr }), rl = cmpLines(rows.lines, tls);
      var dn = th.documentno != null && rows.hdr[0].documentno != null;
      var all = rh.diffs.concat(rl.diffs).concat(dn ? [] : ['documentno legacy=' + rows.hdr[0].documentno + ' twin=' + th.documentno]);
      var tag = K.tag, nres = (rows.sres || []).length, nonh = (rows.sonh || []).length;
      log('§DDO case=' + K.id + ' step=' + label + ' columns compared header=' + rh.n + ' lines=' + rl.n + ' diffs=' + all.length + (all.length ? ' :: ' + all.slice(0, 6).join(' ; ') : ''));
      ok(K.id + ':' + tid, K.note + ' - ' + label + ': dd_order + dd_orderline equal legacy field by field (' + (rh.n + rl.n) + ' columns)', all.length === 0, all.slice(0, 4).join(' ; '));
      if (typeof A !== 'object') {   // spec §2: reserveStock's MStorageOnHand.add(.., 0) is a no-op - NO M_StorageReservation / M_StorageOnHand row changes in legacy, and none in the twin
        var legSame = Object.keys(STOR).every(function (k) { return canon(rows[k] || []) === canon(legBefore[k] || []); }), twSame = Object.keys(STOR).every(function (k) { return canon(q(STOR[k], [oid])) === twBefore[k]; });
        ok(K.id + ':' + tid + ':storage', 'no storage / reservation row changed by ' + label + ' (legacy ' + (legSame ? 'unchanged' : 'CHANGED') + ', twin ' + (twSame ? 'unchanged' : 'CHANGED') + ')', legSame && twSame);
      }
    }
  }

  // ── D9 FSM: DocumentEngine.getValidActions (oracle) vs ad_docfsm.legalActionsFor(53037) ─────────────────────────────────────
  var dbShim = {}; dbShim.prepare = function (sql) { return { get: function (a) { return q(sql, [a])[0]; } }; };
  var STAT = ['DR', 'IP', 'IN', 'AP', 'NA', 'CO', 'CL', 'VO', 'WP'], va = await C.oracle({ op: 'validactions', table: 'DD_Order', statuses: STAT });
  var fsmDiff = [];
  STAT.forEach(function (s) {
    var twinA; try { twinA = H.FSM.legalActionsFor(dbShim, 53037, { docStatus: s, processing: 'N', doctypeId: 50012, periodOpen: true, isBackDateTrxAllowed: true }).slice().sort().join(','); } catch (e) { twinA = 'ERR ' + e.message; }
    var legA = (va.actions[s] || []).slice().sort().join(',');
    if (twinA !== legA) fsmDiff.push(s + ' legacy=[' + legA + '] twin=[' + twinA + ']');
  });
  log('§DDO-FSM tableId=' + va.tableId + ' statuses=' + STAT.length + ' diffs=' + fsmDiff.length + (fsmDiff.length ? ' :: ' + fsmDiff.join(' ; ') : ''));
  ok('D9-FSM', 'DD_Order valid actions per DocStatus equal DocumentEngine.getValidActions (' + STAT.length + ' statuses)', va.ok === true && va.tableId === 53037 && !fsmDiff.length, fsmDiff.join(' ; '));

  // ── D10-D12 twin-side checks, hand-computed from the Java (NOT oracle-compared) ──────────────────────────────────────────────
  // D10 MDDOrder.beforeDelete :725-737 / MDDOrderLine.beforeDelete :629-649: a processed order cannot be deleted; a line with QtyReserved cannot be deleted; a draft order is deleted with its lines.
  var hd = H.save('dd_order', HDR); var did = H.lastId('dd_order'); H.save('dd_orderline', Object.assign({ dd_order_id: did }, LN(130, 7, { Line: 10 })));
  H.docAction('dd_order', did, 'PR', { noWorkflow: true, noPost: true });
  var rl1 = H.one('SELECT qtyreserved FROM dd_orderline WHERE dd_order_id=?', [did]);
  var lineId = H.one('SELECT dd_orderline_id AS id FROM dd_orderline WHERE dd_order_id=?', [did]).id;
  var dline = H.run({ table: 'dd_orderline', timing: 'PROCESS', fn: function (trx) { var r = H.ML.remove(trx, 'dd_orderline', trx.get('dd_orderline', lineId)); return { ok: r.ok, error: r.error }; } });
  ok('D10a-line-delete', 'HAND (MDDOrderLine.beforeDelete :631-639): a line with QtyReserved ' + rl1.qtyreserved + ' <> 0 cannot be deleted', Number(rl1.qtyreserved) === 7 && !dline.ok, dline.error);
  var hd2 = H.save('dd_order', HDR), did2 = H.lastId('dd_order'); H.save('dd_orderline', Object.assign({ dd_order_id: did2 }, LN(130, 2, { Line: 10 })));
  var ddel = H.run({ table: 'dd_order', timing: 'PROCESS', fn: function (trx) { var r = H.ML.remove(trx, 'dd_order', trx.get('dd_order', did2)); return { ok: r.ok, error: r.error }; } });
  var left = Number(H.one('SELECT (SELECT COUNT(*) FROM dd_order WHERE dd_order_id=?) + (SELECT COUNT(*) FROM dd_orderline WHERE dd_order_id=?) AS n', [did2, did2]).n);
  ok('D10b-draft-delete', 'HAND (MDDOrder.beforeDelete :725-737): a Drafted order is deleted together with its lines', ddel.ok && left === 0, 'ok=' + ddel.ok + ' rows left=' + left + ' ' + (ddel.error || ''));
  // D11 MDDOrderLine.beforeSave :617-622 (upstream defect kept): Line defaults from MAX(C_OrderLine.Line) WHERE C_Order_ID = the DD_Order_ID
  var hd3 = H.save('dd_order', HDR), did3 = H.lastId('dd_order');
  H.db.run("INSERT INTO c_orderline (c_orderline_id, c_order_id, line, ad_client_id, ad_org_id, isactive) VALUES (8999999, ?, 40, 11, 11, 'Y')", [did3]);
  H.save('dd_orderline', Object.assign({ dd_order_id: did3 }, LN(130, 1)));
  var ln = Number(H.one('SELECT line FROM dd_orderline WHERE dd_order_id=?', [did3]).line);
  ok('D11-QUIRK-LINE', 'HAND (MDDOrderLine.java:620 reads C_OrderLine where C_Order_ID=' + did3 + ' = DD_Order_ID): MAX(40)+10 = 50, not the DD lines\' own max', ln === 50, 'line=' + ln);
  // D12 reserveStock arithmetic hand-computed: QtyOrdered 10, QtyDelivered 4 -> prepare reserves 6; close sets QtyOrdered 4 and releases 6 (a Completed order: the engine refuses Close while InProgress, D5b)
  var hd4 = H.save('dd_order', HCO_T), did4 = H.lastId('dd_order'); H.save('dd_orderline', Object.assign({ dd_order_id: did4 }, LN(130, 10, { Line: 10, QtyDelivered: 4 })));
  H.docAction('dd_order', did4, 'PR', { noWorkflow: true, noPost: true }); var r1 = Number(H.one('SELECT qtyreserved AS r FROM dd_orderline WHERE dd_order_id=?', [did4]).r);
  H.docAction('dd_order', did4, 'CO', { noWorkflow: true, noPost: true }); H.docAction('dd_order', did4, 'CL', { noWorkflow: true, noPost: true }); var r2 = H.one('SELECT qtyreserved AS r, qtyordered AS o FROM dd_orderline WHERE dd_order_id=?', [did4]);
  ok('D12-reserve-arith', 'HAND (reserveStock :865-867, closeIt :1143-1155): ordered 10 delivered 4 -> reserved 6; close -> ordered 4, reserved 0', r1 === 6 && Number(r2.r) === 0 && Number(r2.o) === 4, 'reserved=' + r1 + ' after close reserved=' + r2.r + ' ordered=' + r2.o);
  // D13 MDDOrder.beforeSave :633-642: with a reserved line the warehouse cannot change (the real PO ignores the edit - M_Warehouse_ID is not updateable - so legacy cannot show it; the model rule is hand-checked)
  var hd5 = H.save('dd_order', HDR), did5 = H.lastId('dd_order'); H.save('dd_orderline', Object.assign({ dd_order_id: did5 }, LN(130, 7, { Line: 10 })));
  H.docAction('dd_order', did5, 'PR', { noWorkflow: true, noPost: true });
  var wr = H.update('dd_order', did5, { m_warehouse_id: 104 });
  ok('D13-warehouse-change', 'HAND (MDDOrder.beforeSave :633-642 + canChangeWarehouse :335-350): a warehouse change is refused while a line has QtyReserved 7', !wr.ok && /QtyReserved=7/.test(String(wr.error)), wr.error);

  if (!judged) ok('T-VACUOUS', 'at least one case judged', null, 'nothing was judged');
  var verdict = fail ? 'FAIL' : (inc || !judged) ? 'INCONCLUSIVE' : 'PASS';
  log('§DDO-SUMMARY ' + verdict + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' break=' + (BREAK || 'none'));
  process.exit(verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 3);
})().catch(function (e) { console.log('§DDO-ERROR ' + (e.stack || e)); process.exit(2); });
