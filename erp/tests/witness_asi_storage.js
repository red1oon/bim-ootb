#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-ASI-STORAGE (bim-compiler prompts/ERP_PRODUCT_ATTRIBUTE_ASI.md §4 AS-8; TWIN CARDINAL RULE + AD-LAYER LAW 5). READ THE LOG: §ASS lines and the verdict §ASS-SUMMARY; the exit code alone is not evidence.
// THE ISSUE it proves/disproves: legacy has ONE MStorageOnHand.getWarehouse (:398-533) and ONE getWarehouseNegative (:579-680), both read through the document's own transaction (trxName). The twin had FIVE
//   ports of them (model_asi storages/negatives on the base DB only; model_movement.getWarehouse; model_inventory.getWarehouseNegative; the Libero plugin's; ReplenishReportProduction.storageWarehouse), two of
//   which read a product column that does not exist. The base-only one did not see the writes of its own transaction (measured by §67: a phantom -1 row at the target locator in witness_movement_confirm e5b).
//   Part 1 (TWIN-ONLY = NOTED-AS-DESIGNED, §62: pilot stock has no instances / guarantee dates and no config may change): the converged function READS THROUGH THE TRX (R1-R3) and follows the Java
//   ordering / filters for the positive and the negative query (R4-R6).  Part 2 (static, R7): exactly ONE definition of the storage query and of the material-policy flag exists in the non-test source.
//   Zero judged prints INCONCLUSIVE, never PASS.
//   Negative controls (MUST exit 1): ASS_BREAK=basereads (the query ignores the Trx's pending writes) / nominguard (minGuaranteeDate ignored) / second (a second port is added to the scanned source).
// Run: NODE_PATH=$HOME/bim-ootb/tests/node_modules:$HOME/bim-ootb/node_modules node erp/tests/witness_asi_storage.js
'use strict';
var fs = require('fs'), path = require('path');
var C = require('./dd_common.js');
var pass = 0, fail = 0, inc = 0, noted = 0, judged = 0, BREAK = process.env.ASS_BREAK || '';
var log = function (s) { console.log(s); };
var ok = function (id, n, c, d) { judged++; log((c === null ? '  ⚠ ' : c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c === null ? inc++ : c ? pass++ : fail++; };
var note = function (id, d) { noted++; log('  ℹ NOTED-AS-DESIGNED ' + id + ' - ' + d); };

(async function main() {
  var H = await C.boot(), TODAY = H.TODAY, q = H.q, ML = H.ML, T = globalThis.ModelTrade;
  var ASI = require('../model_asi.js');
  var real = { storages: ASI.storages, negatives: ASI.negatives };
  var baseOnly = function (trx) {   // a facade with NO pending writes: what the old base-SQL port saw
    return { env: trx.env, q: trx.q, get: function (t, id) { var idc = trx.idCol(t); var r = trx.q('SELECT * FROM ' + t + ' WHERE ' + idc + '=?', [id])[0]; return r || null; },
      find: function (t, w) { var cs = Object.keys(w || {}); return trx.q('SELECT * FROM ' + t + (cs.length ? ' WHERE ' + cs.map(function (c) { return c + '=?'; }).join(' AND ') : ''), cs.map(function (c) { return w[c]; })); } };
  };
  if (BREAK === 'basereads') { ASI.storages = function (trx, o) { return real.storages(baseOnly(trx), o); }; ASI.negatives = function (trx, o) { return real.negatives(baseOnly(trx), o); }; }
  if (BREAK === 'nominguard') { ASI.storages = function (trx, o) { return real.storages(trx, Object.assign({}, o, { minGuaranteeDate: null })); }; ASI.negatives = function (trx, o) { return real.negatives(trx, Object.assign({}, o, { minGuaranteeDate: null })); }; }
  log('§ASS-SEED patches ok=' + H.patchOk + ' failed=' + H.patchBad + ' today=' + TODAY + ' break=' + (BREAK || 'none'));
  var sp = null, n = 0;
  var fresh = function () { if (sp) { H.rollback(sp); sp = null; } sp = 's' + (++n); H.begin(sp); };
  var day = function (k) { var d = new Date(TODAY + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10) + ' 00:00:00'; };
  var loc = (q("SELECT m_locator_id AS l FROM m_locator WHERE m_warehouse_id=103 AND isdefault='Y'")[0] || q('SELECT m_locator_id AS l FROM m_locator WHERE m_warehouse_id=103')[0]).l;
  var P = 133, asiSet = 102, WH = 103, LOC2 = 9300002, uu = 0;
  var row = function (r) { return (r.m_locator_id === LOC2 ? 'L2' : 'L1') + ':' + Number(r.qtyonhand) + '@' + (r.m_attributesetinstance_id || 0); };
  var show = function (rows) { return rows.map(row).join(' '); };
  var insS = function (l, asi, qty, dmp) { H.db.run("INSERT INTO m_storageonhand (m_product_id, m_locator_id, m_attributesetinstance_id, ad_client_id, ad_org_id, isactive, qtyonhand, datematerialpolicy, m_storageonhand_uu) VALUES (?,?,?,11,11,'Y',?,?,?)", [P, l, asi, qty, day(dmp), 'ass-' + (++uu)]); };
  var insA = function (id, gd) { H.db.run("INSERT INTO m_attributesetinstance (m_attributesetinstance_id, ad_client_id, ad_org_id, isactive, m_attributeset_id, guaranteedate, description) VALUES (?,11,0,'Y',?,?,?)", [id, asiSet, day(gd), 'A' + id]); };
  var setPolicy = function (fifo, gd) {
    H.db.run("UPDATE m_attributeset SET isguaranteedate='Y', useguaranteedateformpolicy=? WHERE m_attributeset_id=?", [gd ? 'Y' : 'N', asiSet]);
    H.db.run("UPDATE m_product_category SET mmpolicy=? WHERE m_product_category_id=(SELECT m_product_category_id FROM m_product WHERE m_product_id=?)", [fifo ? 'F' : 'L', P]);
  };
  var withLoc2 = function (prio) {   // a second locator of warehouse 103 with a HIGHER priority (twin-only fixture, rolled back with the case)
    var base = q('SELECT * FROM m_locator WHERE m_locator_id=?', [loc])[0], cols = Object.keys(base), r = Object.assign({}, base, { m_locator_id: LOC2, isdefault: 'N', value: 'ASS-L2', x: 'ASS', priorityno: prio, m_locator_uu: 'ass-loc-2' });
    H.db.run('INSERT INTO m_locator (' + cols.join(',') + ') VALUES (' + cols.map(function () { return '?'; }).join(',') + ')', cols.map(function (k) { return r[k] === undefined ? null : r[k]; }));
  };
  var newTrx = function () { return new ML.Trx(q, H.env()); };
  var S = function (trx, o) { return ASI.storages(trx, Object.assign({ productId: P, asiId: 0, fifo: true, positiveOnly: false }, o)); };
  var N = function (trx, o) { return ASI.negatives(trx, Object.assign({ productId: P, asiId: 0, fifo: true }, o)); };

  note('T', 'the pilot stock has no instances, guarantee dates or negative rows and no config may change (§62): R1-R6 are twin-only fixtures judged against the Java rule applied by hand; the shipment / receipt / movement / inventory callers keep their own oracle witnesses (regression)');

  // ── R1-R3: READ THROUGH THE TRX ─────────────────────────────────────────────────────────────────────────────────────────
  fresh(); H.db.run('DELETE FROM m_storageonhand WHERE m_product_id=?', [P]);
  var t1 = newTrx(), pre = S(t1, { locatorId: loc, positiveOnly: true }), e1 = T.storageAdd(t1, loc, P, 0, 5, day(-3)), post = S(t1, { locatorId: loc, positiveOnly: true });
  log('§ASS R1 pre=[' + show(pre) + '] add 5 err=' + e1 + ' post=[' + show(post) + ']');
  ok('R1-sees-own-insert', 'a storage row written EARLIER IN THE SAME TRX is returned by the next query (getWarehouse reads through trxName)', pre.length === 0 && post.length === 1 && Number(post[0].qtyonhand) === 5, 'pre=' + pre.length + ' post=[' + show(post) + ']');

  fresh(); H.db.run('DELETE FROM m_storageonhand WHERE m_product_id=?', [P]); insS(loc, 0, 5, -3);
  var t2 = newTrx(), b2 = S(t2, { locatorId: loc, positiveOnly: true }), e2 = T.storageAdd(t2, loc, P, 0, -5, day(-3)), a2 = S(t2, { locatorId: loc, positiveOnly: true });
  log('§ASS R2 before=[' + show(b2) + '] add -5 err=' + e2 + ' after=[' + show(a2) + ']');
  ok('R2-sees-own-update', 'a row consumed to 0 earlier in the same Trx is no longer offered (a second document in the Trx must not take stock the first one already took)', b2.length === 1 && a2.length === 0, 'before=' + b2.length + ' after=[' + show(a2) + ']');

  fresh(); H.db.run('DELETE FROM m_storageonhand WHERE m_product_id=?', [P]);
  var t3 = newTrx(), e3 = T.storageAdd(t3, loc, P, 0, -2, day(-3)), neg = N(t3, { locatorId: loc }), negS = show(neg), e3b = T.storageAdd(t3, loc, P, 0, 2, day(-3)), neg2 = N(t3, { locatorId: loc });   // show() BEFORE the next write: the Trx's rows are live objects
  log('§ASS R3 issue 2 err=' + e3 + ' negatives=[' + negS + '] receipt 2 err=' + e3b + ' negatives=[' + show(neg2) + ']');
  ok('R3-negative-balance', 'a negative row made in the Trx is found by getWarehouseNegative, and gone once a receipt in the same Trx cancels it (no phantom -qty row, e5b)', neg.length === 1 && negS === 'L1:-2@0' && neg2.length === 0, 'negatives=[' + negS + '] then [' + show(neg2) + ']');

  // ── R4-R6: the Java ORDER and FILTERS ───────────────────────────────────────────────────────────────────────────────────
  var fixture = function () {   // L1 = default locator (priority as seeded), L2 = priority 99. Negative rows: L1 asi0 -1 (dmp -30), L1 asi0 -3 (dmp -10), L1 asi9101 -2 (gd +10, dmp -20), L1 asi9102 -1 (EXPIRED gd -1), L2 asi0 -4 (dmp -5)
    fresh(); H.db.run('DELETE FROM m_storageonhand WHERE m_product_id=?', [P]); withLoc2(99); insA(9101, 10); insA(9102, -1);
    insS(loc, 0, -1, -30); insS(loc, 0, -3, -10); insS(loc, 9101, -2, -20); insS(loc, 9102, -1, -40); insS(LOC2, 0, -4, -5);
  };
  var CASES = [
    { id: 'R4a-neg-fifo-instance-free', run: function (t) { return N(t, { warehouseId: WH, asiId: 0, fifo: true }); }, exp: 'L2:-4@0 L1:-1@0 L1:-3@0', note: 'asi 0 = only the rows WITHOUT an instance; locator priority DESC first (L2), then DateMaterialPolicy asc' },
    { id: 'R4b-neg-lifo-instance-free', run: function (t) { return N(t, { warehouseId: WH, asiId: 0, fifo: false }); }, exp: 'L2:-4@0 L1:-3@0 L1:-1@0', note: 'LiFo: newest DateMaterialPolicy first inside a locator' },
    { id: 'R4c-neg-all-instances', run: function (t) { return N(t, { warehouseId: WH, asiId: -1, fifo: true }); }, exp: 'L2:-4@0 L1:-1@9102 L1:-1@0 L1:-2@9101 L1:-3@0', note: 'asi -1 = every instance; ordered by DateMaterialPolicy asc: 9102 (-40d), 0 (-30d), 9101 (-20d), 0 (-10d)' },
    { id: 'R4d-neg-one-instance', run: function (t) { return N(t, { warehouseId: WH, asiId: 9101, fifo: true }); }, exp: 'L1:-2@9101', note: 'asi > 0 = exactly that instance' },
    { id: 'R4e-neg-locator-scope', run: function (t) { return N(t, { warehouseId: WH, locatorId: loc, asiId: 0, fifo: true }); }, exp: 'L1:-1@0 L1:-3@0', note: 'a given locator wins over the warehouse (M_Locator_ID > 0): L2 is not searched' },
    { id: 'R5a-neg-expired-filtered', run: function (t) { return N(t, { warehouseId: WH, asiId: -1, fifo: true, minGuaranteeDate: TODAY }); }, exp: 'L2:-4@0 L1:-1@0 L1:-2@9101 L1:-3@0', note: 'getWarehouseNegative honours minGuaranteeDate: the EXPIRED instance 9102 (gd yesterday) is dropped' },
    { id: 'R5b-pos-expired-filtered', pol: [true, false], run: function (t) { return S(t, { warehouseId: WH, asiId: 0, fifo: true, minGuaranteeDate: TODAY }); }, exp: 'L2:-4@0 L1:-1@0 L1:-2@9101 L1:-3@0', note: 'getWarehouse (all instances, non-zero rows) drops the expired instance 9102 by minGuaranteeDate' },
    { id: 'R5c-pos-specific-ignores-filter', run: function (t) { return S(t, { warehouseId: WH, asiId: 9102, fifo: true, minGuaranteeDate: TODAY }); }, exp: 'L1:-1@9102', note: 'a SPECIFIC instance is returned whatever its guarantee date (the filter applies to the all-instances branch only, :418 / :512-518)' },
    { id: 'R6-pos-guarantee-policy-lifo', pol: [false, true], run: function (t) { return S(t, { warehouseId: WH, asiId: 0, fifo: false }); }, exp: 'L2:-4@0 L1:-2@9101 L1:-1@9102 L1:-3@0 L1:-1@0', note: 'LiFo + "use guarantee date for policy": key = COALESCE(GuaranteeDate, DateMaterialPolicy) DESC after locator priority: 9101 (gd +10d), 9102 (gd -1d), then the dmp rows -10d, -30d' }
  ];
  CASES.forEach(function (K) {
    fixture(); var pol = K.pol || [true, false]; setPolicy(pol[0], pol[1]);
    var t = newTrx(), got = show(K.run(t)), exp = K.exp;
    log('§ASS case=' + K.id + ' got=[' + got + '] expected=[' + exp + ']');
    ok(K.id, K.note, got === exp, 'got=[' + got + '] expected=[' + exp + ']');
  });

  // ── R7: ONE implementation (static scan of the non-test source) ─────────────────────────────────────────────────────────
  var ERP = H.ERP, files = [];
  (function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) { var p = path.join(d, e.name); if (e.isDirectory()) { if (['tests', 'node_modules', 'docs', 'patches'].indexOf(e.name) < 0) walk(p); } else if (/\.(js|mjs)$/.test(e.name)) files.push(p); }); })(ERP);
  var strip = function (s) { return s.split('\n').map(function (l) { return /^\s*\/\//.test(l) ? '' : l.replace(/\s\/\/.*$/, ''); }).join('\n'); };
  var DEF = /(?:function\s+|\b(?:const|let|var)\s+)(getWarehouse\w*|storageWarehouse|mmPolicyFifo|mmFifo|useGuaranteeDate)\b/g, defs = [], mmpol = [], prio = [];
  var src = files.map(function (f) { return { f: path.relative(ERP, f), s: strip(fs.readFileSync(f, 'utf8')) }; });
  if (BREAK === 'second') src.push({ f: 'model_extra.js', s: 'function getWarehouse(trx, p) { return []; }' });
  src.forEach(function (x) { var m; DEF.lastIndex = 0; while ((m = DEF.exec(x.s))) defs.push(x.f + ':' + m[1]); if (/\.mmpolicy\b/.test(x.s)) mmpol.push(x.f); if (/priorityno/i.test(x.s) && /m_storageonhand/i.test(x.s)) prio.push(x.f); });
  log('§ASS R7 files=' + src.length + ' definitions=[' + defs.join(' ') + '] reads-mmpolicy=[' + mmpol.join(' ') + '] priority+storage=[' + prio.join(' ') + ']');
  var expDefs = ['model_asi.js:mmFifo', 'model_asi.js:useGuaranteeDate'].sort().join(' ');
  ok('R7a-one-definition', 'the storage query and the material-policy flag are each defined ONCE in the non-test source (ModelAsi); no getWarehouse / storageWarehouse / mmPolicyFifo elsewhere', defs.sort().join(' ') === expDefs, 'definitions=[' + defs.sort().join(' ') + '] expected=[' + expDefs + ']');
  ok('R7b-one-policy-read', 'MProduct.getMMPolicy (category policy, else the client\'s) is read in ONE file', mmpol.join(' ') === 'model_asi.js', 'files=[' + mmpol.join(' ') + ']');
  ok('R7c-one-priority-sort', 'the locator-priority storage ordering exists only in model_asi.js (model_ctor.js storageLocator is MStorageOnHand.getM_Locator_ID, a different Java method)', prio.sort().join(' ') === 'model_ctor.js model_asi.js'.split(' ').sort().join(' '), 'files=[' + prio.join(' ') + ']');

  var verdict = judged === 0 ? 'INCONCLUSIVE' : fail > 0 ? 'FAIL' : inc > 0 ? 'INCONCLUSIVE' : 'PASS';
  log('§ASS-SUMMARY verdict=' + verdict + ' judged=' + judged + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' noted_as_designed=' + noted + ' break=' + (BREAK || 'none'));
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(function (e) { console.log('§ASS-SUMMARY verdict=ERROR ' + (e && e.stack || e)); process.exit(2); });
