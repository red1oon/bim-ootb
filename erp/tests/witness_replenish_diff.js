#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-REPLENISH (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §64; TWIN CARDINAL RULE; §62 owner rule: legacy is never changed, running its processes is ordinary use). READ THE LOG: §RRD lines and §RRD-SUMMARY; exit code is not evidence.
// THE ISSUE: the twin could not run the live Replenish Report (org.compiere.process.ReplenishReportProduction, AD_Process 53267): no port, no physical T_Replenish, and the POS lens carried a private copy of the QtyToOrder fold (two
//   implementations of one responsibility). Legacy = the oracle's existing `process` op on the pilot (GardenWorld, warehouse 103, 19 M_Replenish rows, none with a source warehouse). That op COMMITS: report runs leave T_Replenish + AD_PInstance rows, create
//   runs leave real DRAFT documents in the pilot (accepted by the owner, ids printed as §RRD-LEFT). Fixture sync: the pilot's m_replenish / m_product_po / m_storageonhand / m_storagereservation / m_productionline / m_warehouse / m_locator / m_product / vendor masters
//   are copied into the twin BEFORE each legacy run, so both sides judge the SAME state (the pilot state of every case is logged: reservations move when earlier runs created documents).
//   R1 report only · R2 with C_BPartner_ID · R3 category filter · R6 doctype basetype mismatch / missing (same error) · R5 create POR (requisition rows equal) + R5b a POR does NOT reduce the next run's QtyToOrder (both sides) · R4 create POO (PO headers + lines equal)
//   + R4b the next run after a drafted PO. Cases run in that order so the report-only ones read the state the twin was synced from.
//   MMM / DOO / PRD (no pilot config: no source warehouse) are twin-only, NOTED-AS-DESIGNED (never a pass against legacy), judged by invariants; PRD = the NAMED refusal (MProduction not ported - manufacturing is not core).
//   P2 (twin-only): an open production line moves QtyOrdered / QtyReserved (:292-303) - the pilot has NO open production line, so LRR_BREAK=noprod can only turn P2 red, never an oracle case.
// Negative control (MUST exit 1): LRR_BREAK=noprod (the port drops the production-line UPDATE) -> P2 red. Zero judged prints INCONCLUSIVE, never PASS.
// Run: NODE_PATH=$HOME/bim-ootb/tests/node_modules node erp/tests/witness_replenish_diff.js   (pilot + oracle :8097)
'use strict';
var path = require('path'), cp = require('child_process');
var C = require('./dd_common.js');
var pass = 0, fail = 0, inc = 0, named = 0, noted = 0, BREAK = process.env.LRR_BREAK || '';
var log = function (s) { console.log(s); };
var ok = function (id, n, c, d) { log((c === null ? '  ⚠ ' : c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c === null ? inc++ : c ? pass++ : fail++; };
function pgRows(sql) { return JSON.parse(cp.execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'idempiere_pilot', '-tAq'], { input: "SET search_path=adempiere;\nSELECT coalesce(json_agg(t),'[]') FROM (" + sql + ") t;\n", encoding: 'utf8', maxBuffer: 1 << 28 }).replace(/^SET\n/, '').trim()); }

(async function main() {
  process.env.TODAY = process.env.TODAY || new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);   // legacy stamps new documents with the JVM's LOCAL date (new Timestamp(System.currentTimeMillis())): the twin's session date must be the same day
  var H = await C.boot(), TODAY = H.TODAY, q0 = H.q, P = require(path.join(H.ERP, 'ad_process.js'));
  var q = function (sql, p) { try { return q0(sql, p); } catch (e) { if (/no such table/.test(String(e.message))) return []; throw e; } };   // before the port a table the port adds is simply absent: read as no rows (never a crash)
  try { require(path.join(H.ERP, 'processes', 'ReplenishReportProduction.js')); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
  log('§RRD-SEED ad_seed.db + patches statements ok=' + H.patchOk + ' failed=' + H.patchBad + ' today=' + TODAY + ' break=' + (BREAK || 'none') + ' process port=' + (P.JAVA['org.compiere.process.ReplenishReportProduction'] ? 'LOADED' : 'ABSENT'));
  var CLS = 'org.compiere.process.ReplenishReportProduction', PROC = 53267;
  var SYNC = [['m_product_category', 'ad_client_id IN (0,11)'], ['m_product', 'ad_client_id IN (0,11)'], ['m_replenish', 'ad_client_id=11'], ['m_product_po', 'ad_client_id=11'], ['m_storageonhand', 'ad_client_id=11'], ['m_storagereservation', 'ad_client_id=11'],
    ['m_productionline', 'ad_client_id=11'], ['m_locatortype', 'ad_client_id IN (0,11)'], ['m_locator', 'ad_client_id=11'], ['m_warehouse', 'ad_client_id=11'], ['c_bpartner', 'ad_client_id=11'], ['c_bpartner_location', 'ad_client_id=11'], ['ad_user', 'ad_client_id=11 AND c_bpartner_id IS NOT NULL'],
    ['ad_sequence', "istableid='N' AND ad_client_id IN (0,11)"]];
  var haveCache = {};
  function sync(why) {
    var tot = [];
    SYNC.forEach(function (s) {
      var t = s[0], where = s[1], have = haveCache[t] || (haveCache[t] = q('PRAGMA table_info(' + t + ')').map(function (c) { return c.name.toLowerCase(); })), rows = pgRows('SELECT * FROM ' + t + ' WHERE ' + where);
      if (!have.length) { tot.push(t + '=NOTABLE'); return; }
      H.db.run('DELETE FROM ' + t + ' WHERE ' + where);
      rows.forEach(function (r) { var ks = Object.keys(r).filter(function (k) { return have.indexOf(k) >= 0; }); H.db.run('INSERT INTO ' + t + ' (' + ks.join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return r[k]; })); });
      tot.push(t + '=' + rows.length);
    });
    log('§RRD-SYNC ' + why + ' ' + tot.join(' '));
  }
  function pilotState(tag) {
    var r = pgRows("SELECT (SELECT count(*) FROM m_storagereservation WHERE qty<>0) AS res_rows, (SELECT COALESCE(sum(qty),0) FROM m_storagereservation WHERE issotrx='N') AS res_po_qty, (SELECT count(*) FROM m_productionline WHERE processed='N') AS open_prodlines, (SELECT count(*) FROM c_order WHERE issotrx='N' AND description='Replenishment') AS repl_po, (SELECT count(*) FROM m_requisition WHERE description='Replenishment') AS repl_req, (SELECT count(*) FROM t_replenish) AS t_rows")[0];
    log('§RRD-PILOT-STATE ' + tag + ' ' + JSON.stringify(r));
    return r;
  }
  var DOCS_LEFT = [];
  async function legacy(params) {
    var L = await C.oracle({ op: 'process', process: PROC, recordId: 0, tableId: 0, params: params, ctx: { date: TODAY, client: 11, org: 11, role: 102, user: 101, wh: 103 } });
    return L;
  }
  var pinN = 0;
  function docnos(L) { var m = String(L.summary || '').match(/ - (\S+)/g) || []; return m.map(function (x) { return x.slice(3); }); }   // "#3 - 800080 - 800081 - 800082" (m_info :490)
  function twin(params) {
    var pinst = 8100000 + (++pinN), given = {};
    params.forEach(function (p) { given[p.name] = { v: p.value, type: p.type }; });
    var env = H.env({ wh: 103 }); env.wh = 103;
    var res = P.runJava(q, env, { AD_PInstance_ID: pinst, AD_Process_ID: PROC, className: CLS, title: 'Replenish Report', Record_ID: 0, Table_ID: 0, params: given });
    (res.log || []).filter(function (l) { return /§RRP|§PROC-(EXCEPTION|UNPORTED|WARNING|SEVERE)|§MODEL-(ERR|SEVERE|UNPORTED)/.test(l); }).forEach(function (l) { log('    ' + String(l).slice(0, 260)); });
    if (res.ok) H.apply(res.ops);
    res.pinst = pinst;
    return res;
  }
  function cmpSets(Ls, Ts, key, o) {                  // row sets by key; returns { n, diffs[] }
    var diffs = [], n = 0, by = {}; Ts.forEach(function (t) { by[key(t)] = t; });
    Ls.forEach(function (l) {
      var t = by[key(l)]; if (!t) { diffs.push(key(l) + ': missing in twin'); return; }
      var r = C.cmpRow(l, t, { skip: o.skip }); n += r.n; r.diffs.forEach(function (d) { diffs.push(key(l) + ' ' + d); }); if (r.missing.length && o.logMissing) log('    §RRD-MISSING-COLS ' + key(l) + ' ' + r.missing.join(','));
      delete by[key(l)];
    });
    Object.keys(by).forEach(function (k) { diffs.push(k + ': extra in twin'); });
    return { n: n, diffs: diffs };
  }
  var treplKey = function (r) { return 'P' + r.m_product_id + '/W' + r.m_warehouse_id; };
  var skipT = { t_replenish_uu: 1, ad_pinstance_id: 1, updated: 1, updatedby: 1, isactive: 1 };
  async function reportCase(id, name, params, expectZeroOk) {
    log('\n§RRD-CASE ' + id + ' ' + name + ' params=' + JSON.stringify(params.map(function (p) { return p.name + '=' + p.value; })));
    pilotState(id + ' before'); sync(id + ' before legacy run');
    var pre = { po: q('SELECT m_product_id, c_bpartner_id, iscurrentvendor, order_min, order_pack FROM m_product_po WHERE ad_client_id=11 ORDER BY 1,2'), rep: q('SELECT m_product_id, m_warehouse_id, level_min, level_max FROM m_replenish WHERE ad_client_id=11 ORDER BY 1,2') };
    var L = await legacy(params), T = twin(params);
    T.pre = pre;
    log('§RRD-LEGACY ' + id + ' ok=' + L.ok + ' pinstance=' + L.pinstance + ' summary="' + L.summary + '"');
    log('§RRD-TWIN   ' + id + ' ok=' + T.ok + ' summary="' + T.summary + '"');
    return { L: L, T: T };
  }
  function compareT(id, L, T, label) {
    var Lr = pgRows('SELECT * FROM t_replenish WHERE ad_pinstance_id=' + Number(L.pinstance) + ' ORDER BY m_product_id'), Tr = q('SELECT * FROM t_replenish WHERE ad_pinstance_id=? ORDER BY m_product_id', [T.pinst]);
    var c = cmpSets(Lr, Tr, treplKey, { skip: skipT, logMissing: true });
    log('§RRD-TREPL ' + id + ' legacy rows=' + Lr.length + ' twin rows=' + Tr.length + ' columns compared=' + c.n + ' diffs=' + c.diffs.length);
    c.diffs.slice(0, 12).forEach(function (d) { log('      DIFF ' + d); });
    Lr.slice(0, 3).forEach(function (r) { log('      legacy ' + treplKey(r) + ' onhand=' + r.qtyonhand + ' res=' + r.qtyreserved + ' ord=' + r.qtyordered + ' min=' + r.level_min + ' max=' + r.level_max + ' omin=' + r.order_min + ' opack=' + r.order_pack + ' bp=' + r.c_bpartner_id + ' qto=' + r.qtytoorder); });
    ok(id, label + ': twin T_Replenish == legacy on ' + Lr.length + ' rows / ' + c.n + ' columns', Lr.length === 0 ? null : (c.diffs.length === 0 && Lr.length === Tr.length), Lr.length === 0 ? 'VACUOUS: legacy wrote 0 rows' : c.diffs.slice(0, 3).join(' | '));
    return { Lr: Lr, Tr: Tr };
  }

  // ═══ pilot-compared cases ═══
  var W = { name: 'M_Warehouse_ID', value: 103 };
  var r1 = await reportCase('R1', 'report only, warehouse 103, no partner', [W]);
  var c1 = compareT('R1', r1.L, r1.T, 'report only');
  // prepareTable (:157-212) mutates M_Replenish / M_Product_PO on both sides: compared after the first run
  var prepL = pgRows('SELECT m_product_id, c_bpartner_id, iscurrentvendor, order_min, order_pack FROM m_product_po WHERE ad_client_id=11 ORDER BY 1,2'), prepT = q('SELECT m_product_id, c_bpartner_id, iscurrentvendor, order_min, order_pack FROM m_product_po WHERE ad_client_id=11 ORDER BY 1,2'),
    repL = pgRows('SELECT m_product_id, m_warehouse_id, level_min, level_max FROM m_replenish WHERE ad_client_id=11 ORDER BY 1,2'), repT = q('SELECT m_product_id, m_warehouse_id, level_min, level_max FROM m_replenish WHERE ad_client_id=11 ORDER BY 1,2');
  var pc = cmpSets(prepL, prepT, function (r) { return 'PO' + r.m_product_id + '/' + r.c_bpartner_id; }, { skip: {} }), rc = cmpSets(repL, repT, treplKey, { skip: {} });
  var preMoved = cmpSets(prepL, r1.T.pre.po, function (r) { return 'PO' + r.m_product_id + '/' + r.c_bpartner_id; }, { skip: {} }).diffs.length + cmpSets(repL, r1.T.pre.rep, treplKey, { skip: {} }).diffs.length;
  log('§RRD-PREP rows the legacy/twin prepareTable had to change (twin fixture before the run vs legacy after it) = ' + preMoved + '; compared after the run: M_Product_PO ' + prepL.length + ' rows diffs=' + pc.diffs.length + ', M_Replenish ' + repL.length + ' rows diffs=' + rc.diffs.length);
  if (preMoved === 0) { noted++; log('§RRD-NOTED R1-PREP: the pilot rows were already normalised by an earlier legacy run of this process (the first run moved 14 Order_Min / 14 Order_Pack rows), so there is nothing left to compare against legacy; prepareTable is judged on a de-normalised twin fixture by P3 - NOTED, not a pass'); }
  else ok('R1-PREP', 'prepareTable: M_Product_PO (Order_Min/Order_Pack/IsCurrentVendor) and M_Replenish (Level_Max) after the run == legacy (' + preMoved + ' rows were really normalised)', pc.diffs.length === 0 && rc.diffs.length === 0, pc.diffs.concat(rc.diffs).slice(0, 3).join(' | '));
  var r2 = await reportCase('R2', 'with C_BPartner_ID=114', [W, { name: 'C_BPartner_ID', value: 114 }]); compareT('R2', r2.L, r2.T, 'with partner 114');
  var r3 = await reportCase('R3', 'product category filter 108', [W, { name: 'M_Product_Category_ID', value: 108 }]); compareT('R3', r3.L, r3.T, 'category 108');
  // R6 - doctype basetype mismatch / missing: same error
  var r6a = await reportCase('R6a', 'ReplenishmentCreate=POR with a POO doctype (126)', [W, { name: 'ReplenishmentCreate', value: 'POR' }, { name: 'C_DocType_ID', value: 126 }]);
  var r6b = await reportCase('R6b', 'ReplenishmentCreate=POO without a doctype', [W, { name: 'ReplenishmentCreate', value: 'POO' }]);
  var r6c = await reportCase('R6c', 'unknown warehouse id (legacy NullPointerException at :121)', [{ name: 'M_Warehouse_ID', value: 999999 }]);
  var r6d = await reportCase('R6d', 'no warehouse parameter (FillMandatory)', [{ name: 'C_BPartner_ID', value: 114 }]);
  [['R6a', r6a], ['R6b', r6b], ['R6c', r6c], ['R6d', r6d]].forEach(function (x) { ok(x[0], 'same refusal: legacy ok=' + x[1].L.ok + ' "' + x[1].L.summary + '" == twin ok=' + x[1].T.ok + ' "' + x[1].T.summary + '"', x[1].L.ok === false && x[1].T.ok === false && String(x[1].L.summary) === String(x[1].T.summary), ''); });
  if (process.env.LRR_NOCREATE) { log('§RRD-SKIP R5 / R5b / R4 / R4b skipped (LRR_NOCREATE=1: create-mode legacy runs leave real draft documents in the pilot; this run judges the report-only cases and the twin-only ones)'); ['R5', 'R5b', 'R4', 'R4b'].forEach(function (c) { ok(c, 'create-mode case not run', null, 'SKIPPED (LRR_NOCREATE=1) - nothing judged'); }); }
  else {
  // R5 - create requisitions
  var DT_POR = 127, DT_POO = 126;
  var r5 = await reportCase('R5', 'create POR (doctype ' + DT_POR + ')', [W, { name: 'ReplenishmentCreate', value: 'POR' }, { name: 'C_DocType_ID', value: DT_POR }]);
  compareT('R5-T', r5.L, r5.T, 'POR T_Replenish');
  var dn5 = docnos(r5.L), legReq = dn5.length ? pgRows('SELECT * FROM m_requisition WHERE c_doctype_id=' + DT_POR + ' AND documentno IN (' + dn5.map(function (d) { return "'" + d + "'"; }).join(',') + ') ORDER BY 1') : [], legReqL = legReq.length ? pgRows('SELECT l.* FROM m_requisitionline l WHERE m_requisition_id IN (' + legReq.map(function (r) { return r.m_requisition_id; }).join(',') + ') ORDER BY m_requisition_id, m_product_id') : [], twReq = q('SELECT * FROM m_requisition WHERE m_requisition_id>=9000000 ORDER BY 1'), twReqL = q('SELECT * FROM m_requisitionline WHERE m_requisition_id>=9000000 ORDER BY m_requisition_id, m_product_id');
  DOCS_LEFT.push('m_requisition ' + legReq.map(function (r) { return r.m_requisition_id + '(' + r.documentno + ')'; }).join(','));
  var skD = { m_requisition_id: 1, m_requisition_uu: 1, m_requisitionline_id: 1 };
  var dh = cmpSets(legReq, twReq, function (r) { return 'H' + r.documentno; }, { skip: Object.assign({}, skD, { documentno: 0 }) }), dl = cmpSets(legReqL.map(function (r) { return Object.assign({ k: r.m_product_id }, r); }), twReqL.map(function (r) { return Object.assign({ k: r.m_product_id }, r); }), function (r) { return 'L' + r.k; }, { skip: Object.assign({}, skD, { k: 1, m_requisition_id: 1, line: 1 }) });
  log('§RRD-REQ legacy headers=' + legReq.length + ' lines=' + legReqL.length + ' | twin headers=' + twReq.length + ' lines=' + twReqL.length + ' | header diffs=' + dh.diffs.length + ' line diffs=' + dl.diffs.length + ' columns=' + (dh.n + dl.n));
  dh.diffs.concat(dl.diffs).slice(0, 10).forEach(function (d) { log('      DIFF ' + d); });
  ok('R5', 'requisitions created: headers + lines == legacy (' + legReq.length + ' header(s), ' + legReqL.length + ' line(s), ' + (dh.n + dl.n) + ' columns)', legReq.length ? (dh.diffs.length + dl.diffs.length === 0 && legReq.length === twReq.length && legReqL.length === twReqL.length) : null, legReq.length ? dh.diffs.concat(dl.diffs).slice(0, 3).join(' | ') : 'VACUOUS: legacy created 0 requisitions');
  var bpSeq = function (rows) { return rows.slice().sort(function (a, b) { return Number(a.line) - Number(b.line); }).map(function (r) { return Number(r.c_bpartner_id); }); }, nonDec = function (a) { return a.every(function (v, i) { return i === 0 || v >= a[i - 1]; }); };
  log('§RRD-LINE-ORDER requisition lines by Line: legacy partners ' + bpSeq(legReqL).join(',') + ' | twin ' + bpSeq(twReqL).join(',') + ' (products inside one partner: PG heap order of tied T_Replenish rows - the Line value of tied rows is not judged)');
  ok('R5-ORDER', 'getReplenish ORDER BY M_Warehouse_ID, M_WarehouseSource_ID, C_BPartner_ID: requisition lines run partner-ascending on both sides, same partner sequence', legReqL.length ? (nonDec(bpSeq(legReqL)) && JSON.stringify(bpSeq(legReqL)) === JSON.stringify(bpSeq(twReqL))) : null, '');
  var r5b = await reportCase('R5b', 'report again after the POR (a requisition reserves nothing)', [W]); var c5b = compareT('R5b', r5b.L, r5b.T, 'after POR');
  var same = c5b.Lr.length === c1.Lr.length && c5b.Lr.every(function (r, i) { return C.cmpRow(c1.Lr[i], r, { skip: skipT }).diffs.length === 0; }), sameT = c5b.Tr.length === c1.Tr.length && c5b.Tr.every(function (r, i) { return C.cmpRow(c1.Tr[i], r, { skip: skipT }).diffs.length === 0; });
  ok('R5b-NORESERVE', 'a POR does NOT change the next run: QtyOnHand/QtyReserved/QtyOrdered/QtyToOrder of R5b == R1, legacy ' + same + ', twin ' + sameT, c1.Lr.length && c1.Tr.length && c5b.Tr.length ? (same && sameT) : null, c1.Tr.length && c5b.Tr.length ? '' : 'VACUOUS: the twin wrote no T_Replenish rows to compare');
  // R4 - create purchase orders
  var resBefore = pgRows("SELECT count(*) AS n FROM m_storagereservation WHERE qty<>0")[0].n;
  var r4 = await reportCase('R4', 'create POO (doctype ' + DT_POO + ')', [W, { name: 'ReplenishmentCreate', value: 'POO' }, { name: 'C_DocType_ID', value: DT_POO }]);
  compareT('R4-T', r4.L, r4.T, 'POO T_Replenish');
  var dn4 = docnos(r4.L), legO = dn4.length ? pgRows('SELECT * FROM c_order WHERE c_doctypetarget_id=' + DT_POO + ' AND documentno IN (' + dn4.map(function (d) { return "'" + d + "'"; }).join(',') + ') ORDER BY 1') : [], legOL = legO.length ? pgRows('SELECT * FROM c_orderline WHERE c_order_id IN (' + legO.map(function (r) { return r.c_order_id; }).join(',') + ') ORDER BY c_order_id, m_product_id') : [],
    twO = q('SELECT * FROM c_order WHERE c_order_id>=9000000 ORDER BY 1'), twOL = q('SELECT * FROM c_orderline WHERE c_order_id>=9000000 ORDER BY c_order_id, m_product_id');
  DOCS_LEFT.push('c_order ' + legO.map(function (r) { return r.c_order_id + '(' + r.documentno + ')'; }).join(','));
  var skO = { c_order_id: 1, c_order_uu: 1, c_orderline_id: 1, c_orderline_uu: 1, c_order_id_: 1, ad_orgtrx_id: 0 };
  var oh = cmpSets(legO, twO, function (r) { return 'H' + r.documentno; }, { skip: skO, logMissing: true });
  var ol = cmpSets(legOL.map(function (r) { return Object.assign({ k: r.m_product_id }, r); }), twOL.map(function (r) { return Object.assign({ k: r.m_product_id }, r); }), function (r) { return 'L' + r.k; }, { skip: Object.assign({}, skO, { k: 1, c_order_id: 1, line: 1 }), logMissing: true });
  log('§RRD-PO legacy headers=' + legO.length + ' lines=' + legOL.length + ' | twin headers=' + twO.length + ' lines=' + twOL.length + ' | header diffs=' + oh.diffs.length + ' line diffs=' + ol.diffs.length + ' columns=' + (oh.n + ol.n));
  oh.diffs.concat(ol.diffs).slice(0, 14).forEach(function (d) { log('      DIFF ' + d); });
  ok('R4', 'purchase orders created: headers + lines == legacy (' + legO.length + ' header(s), ' + legOL.length + ' line(s), ' + (oh.n + ol.n) + ' columns)', legO.length ? (oh.diffs.length + ol.diffs.length === 0 && legO.length === twO.length && legOL.length === twOL.length) : null, legO.length ? oh.diffs.concat(ol.diffs).slice(0, 3).join(' | ') : 'VACUOUS: legacy created 0 orders');
  var resAfter = pgRows("SELECT count(*) AS n FROM m_storagereservation WHERE qty<>0")[0].n;
  log('§RRD-PO-RESERVE a Drafted PO writes no M_StorageReservation row (reserved on prepareIt, not on save): pilot reservation rows before=' + resBefore + ' after=' + resAfter);
  var r4b = await reportCase('R4b', 'report again after the drafted POs', [W]); compareT('R4b', r4b.L, r4b.T, 'after drafted PO');
  }
  pilotState('end');
  log('§RRD-LEFT pilot documents left by this run (create-mode ordinary use, accepted): ' + DOCS_LEFT.join(' | '));

  // ═══ twin-only cases (NOTED-AS-DESIGNED: the pilot has no source warehouse / no open production line, §62: no config is added to the pilot) ═══
  log('\n§RRD-TWINONLY fixtures live in the TWIN only (savepoint, rolled back): source warehouse 104 for 103, on-hand at 104 locator 102, an in-transit warehouse in org 12, a BP linked to org 11, an open production line');
  sync('twin-only base');
  function twinOnly(id, name, fx, params, check) {
    log('\n§RRD-CASE ' + id + ' [NOTED-AS-DESIGNED, twin-only] ' + name);
    H.begin('sp_' + id); noted++;
    try { fx && fx(); var T = twin(params); check(T); }
    finally { H.rollback('sp_' + id); }
  }
  var fxSource = function () {
    H.db.run('UPDATE m_warehouse SET m_warehousesource_id=104 WHERE m_warehouse_id=103');
    H.db.run("INSERT INTO m_locatortype (m_locatortype_id, ad_client_id, ad_org_id, isactive, name, isavailableforreplenishment) VALUES (9100001, 11, 0, 'Y', 'NoRepl', 'N')");
    H.db.run("INSERT INTO m_locator (m_locator_id, ad_client_id, ad_org_id, isactive, m_warehouse_id, value, isdefault, priorityno, m_locatortype_id, x, y, z) VALUES (9100001, 11, 12, 'Y', 104, 'NoReplLoc', 'N', 90, 9100001, 'x', 'y', 'z')");
    H.db.run('DELETE FROM m_storageonhand WHERE m_locator_id IN (102, 9100001)');
    [[123, 102, '2020-01-01', 3], [123, 102, '2021-01-01', 4], [128, 102, '2022-02-02', 8], [128, 9100001, '2019-01-01', 500], [127, 102, '2020-03-03', 100], [136, 102, '2020-03-03', -5]].forEach(function (s) {
      H.db.run("INSERT INTO m_storageonhand (ad_client_id, ad_org_id, isactive, m_locator_id, m_product_id, m_attributesetinstance_id, qtyonhand, datematerialpolicy, m_storageonhand_uu) VALUES (11, 12, 'Y', ?, ?, 0, ?, ?, ?)", [s[1], s[0], s[3], s[2], 'rr-' + s[0] + '-' + s[1] + '-' + s[2]]);
    });
  };
  twinOnly('M1', 'MMM: movements from the source warehouse (qty moved = QtyToOrder capped by source on-hand; FiFo; locator type filter)', fxSource, [W, { name: 'ReplenishmentCreate', value: 'MMM' }, { name: 'C_DocType_ID', value: 143 }], function (T) {
    log('§RRD-TWIN M1 ok=' + T.ok + ' summary="' + T.summary + '"');
    var tr = q('SELECT * FROM t_replenish WHERE ad_pinstance_id=? AND m_warehousesource_id IS NOT NULL', [T.pinst]), mv = q("SELECT * FROM m_movement WHERE m_movement_id>=9000000 ORDER BY 1"), ln = q('SELECT * FROM m_movementline WHERE m_movement_id>=9000000 ORDER BY m_movementline_id');
    log('§RRD-MMM T_Replenish rows with source=' + tr.length + ' movements=' + mv.length + ' lines=' + ln.length + ' ' + ln.map(function (l) { return 'P' + l.m_product_id + ':' + l.movementqty + '@L' + l.m_locator_id + '->L' + l.m_locatorto_id; }).join(' '));
    var perP = {}; ln.forEach(function (l) { perP[l.m_product_id] = (perP[l.m_product_id] || 0) + Number(l.movementqty); });
    var avail = { 123: 7, 128: 8, 127: 100, 136: 0 }, bad = [];
    tr.forEach(function (t) { var want = Math.min(Number(t.qtytoorder), avail[t.m_product_id] || 0); if (Math.abs((perP[t.m_product_id] || 0) - want) > 1e-9) bad.push('P' + t.m_product_id + ' moved ' + (perP[t.m_product_id] || 0) + ' want ' + want); });
    ok('M1-QTY', 'qty moved per product == min(QtyToOrder, positive source on-hand of locators available for replenishment) on ' + tr.length + ' row(s)', tr.length ? (T.ok && bad.length === 0) : null, bad.join('; '));
    ok('M1-ONE', 'one movement per (source, target) pair, org = source warehouse org, every line leaves a source-warehouse locator for the target default locator', mv.length === 1 && mv[0].ad_org_id == 12 && ln.every(function (l) { return [102, 9100001].indexOf(Number(l.m_locator_id)) >= 0 && Number(l.m_locatorto_id) === 101; }), 'movements=' + mv.length);
    ok('M1-FIFO', 'FiFo: product 123 lines take the 2020 row (3) before the 2021 row (4)', (function () { var l = ln.filter(function (x) { return x.m_product_id == 123; }); return l.length === 2 && Number(l[0].movementqty) === 3 && Number(l[1].movementqty) === 4; })(), '');
    ok('M1-LOCTYPE', 'the locator type that is not available for replenishment (9100001, 500 of product 128, priority 90 = first in line) is never a source: 128 moves its 8 from locator 102', ln.every(function (l) { return Number(l.m_locator_id) !== 9100001; }) && (perP[128] || 0) === 8, '');
  });
  twinOnly('D1', 'DOO: one Distribution Order per (source, target), in-transit warehouse of the source org, BP linked to the target org', function () {
    fxSource();
    H.db.run("UPDATE m_warehouse SET ad_org_id=12 WHERE m_warehouse_id=50007"); H.db.run("UPDATE c_bpartner SET ad_orgbp_id=11 WHERE c_bpartner_id=50004");
  }, [W, { name: 'ReplenishmentCreate', value: 'DOO' }, { name: 'C_DocType_ID', value: 50012 }], function (T) {
    log('§RRD-TWIN D1 ok=' + T.ok + ' summary="' + T.summary + '"');
    var tr = q('SELECT * FROM t_replenish WHERE ad_pinstance_id=? AND m_warehousesource_id IS NOT NULL', [T.pinst]), dd = q('SELECT * FROM dd_order WHERE dd_order_id>=9000000'), dl = q('SELECT * FROM dd_orderline WHERE dd_order_id>=9000000 ORDER BY dd_orderline_id');
    log('§RRD-DOO T_Replenish rows with source=' + tr.length + ' orders=' + dd.length + ' lines=' + dl.length);
    ok('D1-DOC', 'one DD_Order (org = source org 12, orgtrx = 11, in-transit warehouse 50007, partner 50004) and one line per T_Replenish row at QtyOrdered == QtyToOrder, default locators', T.ok && dd.length === 1 && dd[0].ad_org_id == 12 && dd[0].ad_orgtrx_id == 11 && dd[0].m_warehouse_id == 50007 && dd[0].c_bpartner_id == 50004 && dl.length === tr.length && tr.every(function (t) { var l = dl.filter(function (x) { return x.m_product_id == t.m_product_id; })[0]; return l && Number(l.qtyordered) === Number(t.qtytoorder) && Number(l.m_locator_id) === 102 && Number(l.m_locatorto_id) === 101; }), 'ok=' + T.ok + ' ' + T.summary);
  });
  twinOnly('D2', 'DOO without a BP linked to the target org: the Java\'s own refusal', function () { fxSource(); H.db.run("UPDATE m_warehouse SET ad_org_id=12 WHERE m_warehouse_id=50007"); H.db.run('UPDATE c_bpartner SET ad_orgbp_id=NULL WHERE ad_orgbp_id=11'); }, [W, { name: 'ReplenishmentCreate', value: 'DOO' }, { name: 'C_DocType_ID', value: 50012 }], function (T) {
    ok('D2-REFUSE', 'refused with the Java message (:686-687) "C_BPartner_ID @FillMandatory@"', T.ok === false && /FillMandatory|Mandatory/i.test(String(T.summary)) && /Business Partner|C_BPartner/i.test(String(T.summary)), 'ok=' + T.ok + ' "' + T.summary + '"');
  });
  twinOnly('P1', 'PRD: the production create path is a NAMED refusal (MProduction not ported)', function () { H.db.run("UPDATE m_product SET ismanufactured='Y' WHERE m_product_id=136"); }, [W, { name: 'ReplenishmentCreate', value: 'PRD' }], function (T) {
    named++;
    var tr = q('SELECT 1 FROM t_replenish WHERE ad_pinstance_id=?', [T.pinst]).length;
    ok('P1-NAMED', 'PRD with a manufactured BOM product in the report: refused by name ("not ported - named"), no production document', T.ok === false && /not ported - named/.test(String(T.summary)), 'ok=' + T.ok + ' "' + T.summary + '"');
    log('§RRD-NAMED PRD: MProduction.createLines not ported (manufacturing is not core, AD-LAYER LAW rule 6) - T_Replenish rows in the failed run: ' + tr + ' (rolled back with the Trx)');
  });
  twinOnly('P2', 'open production lines move QtyOrdered / QtyReserved (:292-303)', function () {
    H.db.run("INSERT INTO m_productionline (m_productionline_id, ad_client_id, ad_org_id, isactive, m_product_id, m_locator_id, movementqty, processed, line, m_production_id) VALUES (9100001, 11, 11, 'Y', 123, 101, 50, 'N', 10, 1), (9100002, 11, 11, 'Y', 123, 101, -10, 'N', 20, 1)");
  }, [W], function (T) {
    var t = q('SELECT * FROM t_replenish WHERE ad_pinstance_id=? AND m_product_id=123', [T.pinst])[0], pil = pgRows("SELECT (SELECT COALESCE(sum(qty),0) FROM m_storagereservation WHERE m_product_id=123 AND m_warehouse_id=103 AND issotrx='N') AS o, (SELECT COALESCE(sum(qty),0) FROM m_storagereservation WHERE m_product_id=123 AND m_warehouse_id=103 AND issotrx='Y') AS r")[0];
    log('§RRD-PRODLINE product 123: pilot reservations ordered=' + pil.o + ' reserved=' + pil.r + ' | twin T_Replenish with open lines +50/-10: ordered=' + (t && t.qtyordered) + ' reserved=' + (t && t.qtyreserved));
    ok('P2', 'QtyOrdered = reservation(N) + 50 and QtyReserved = reservation(Y) + 10 (the negative open line raises reserved)', !!t && Number(t.qtyordered) === Number(pil.o) + 50 && Number(t.qtyreserved) === Number(pil.r) + 10, t ? 'ordered ' + t.qtyordered + ' reserved ' + t.qtyreserved : 'no row for product 123' + (BREAK ? ' (BREAK=' + BREAK + ')' : ''));
  });
  twinOnly('P3', 'prepareTable on a de-normalised fixture (:157-212): Order_Min/Order_Pack >= 1, Level_Max >= Level_Min, exactly one current vendor', function () {
    H.db.run('UPDATE m_product_po SET order_min=0, order_pack=NULL WHERE m_product_id IN (123, 124)'); H.db.run('UPDATE m_replenish SET level_max=5 WHERE m_product_id=125 AND m_warehouse_id=103');
    H.db.run("UPDATE m_product_po SET iscurrentvendor='N' WHERE m_product_id=125"); H.db.run("INSERT INTO m_product_po (m_product_id, c_bpartner_id, ad_client_id, ad_org_id, isactive, iscurrentvendor, order_min, order_pack, m_product_po_uu) VALUES (127, 120, 11, 0, 'Y', 'Y', 1, 1, 'rr-p3-127-120')");
  }, [W], function (T) {
    var po = q('SELECT * FROM m_product_po WHERE ad_client_id=11'), rep125 = q('SELECT level_min, level_max FROM m_replenish WHERE m_product_id=125 AND m_warehouse_id=103')[0], by = {};
    po.forEach(function (r) { if (r.iscurrentvendor === 'Y') by[r.m_product_id] = (by[r.m_product_id] || 0) + 1; });
    var cnt = {}; po.forEach(function (r) { cnt[r.m_product_id] = (cnt[r.m_product_id] || 0) + 1; });
    var bad = po.filter(function (r) { return !(Number(r.order_min) >= 1 && Number(r.order_pack) >= 1); }).length;
    var multi = Object.keys(by).filter(function (k) { return by[k] > 1; }).length, sole = Object.keys(cnt).filter(function (k) { return cnt[k] === 1 && by[k] !== 1; }).length;
    log('§RRD-PREP-P3 ordermin/pack<1 rows=' + bad + ' products with >1 current vendor=' + multi + ' sole-vendor products not current=' + sole + ' level_max(125)=' + (rep125 && rep125.level_max) + ' level_min=' + (rep125 && rep125.level_min));
    ok('P3', 'after prepareTable: no Order_Min/Order_Pack < 1, no product with two current vendors, every sole vendor is current, Level_Max >= Level_Min', T.ok && bad === 0 && multi === 0 && sole === 0 && rep125 && Number(rep125.level_max) >= Number(rep125.level_min), 'ok=' + T.ok + ' ' + T.summary);
  });
  var judged = pass + fail + inc;
  log('\n§RRD-NOTED noted_as_designed=' + noted + ' named_refusals=' + named + ' (twin-only cases are never counted as a pass against legacy)');
  var verdict = fail ? 'FAIL' : (inc || !judged) ? 'INCONCLUSIVE' : 'PASS';
  log('§RRD-SUMMARY ' + verdict + ' break=' + (BREAK || 'none') + ' judged=' + judged + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' noted_as_designed=' + noted + ' named_gaps=' + named);
  process.exit(fail ? 1 : inc ? 3 : 0);
})().catch(function (e) { console.log('§RRD-ERROR ' + e.stack); process.exit(2); });
