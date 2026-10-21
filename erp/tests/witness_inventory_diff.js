#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-INVENTORY (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §67; sibling of W-POST-MOVEMENT §60 and W-MOVEMENT-DIFF). READ THE LOG: §INV lines and §INV-SUMMARY; exit code is not evidence.
// THE ISSUE: does the twin complete and post a Physical Inventory / Internal Use Inventory (M_Inventory, MInventory.completeIt + Doc_Inventory) like legacy? The twin had NO M_Inventory model and NO Doc_Inventory, so MMovementConfirm's
//   Difference / Scrapped Qty was a named refusal. THREE parts, each names what it judges:
//   A  POSTING - every M_Inventory the pilot has Completed (population printed as N), re-posted by the REAL DocManager (oracle postdoc, rolled back) and by model_post, once with the client's own costing and once with every schema
//      forced to Standard. Compared: status + Fact_Acct (schema, account, DR, CR, qty, product) per document, and against the pilot's own STORED Fact_Acct the columns the oracle's factRows do not carry (org, locator, line, warehouse, ASI, charge, UOM,
//      currency, description, dates, period, GL category). The twin's accounting is also judged numerically: balanced per schema and per org, value conserved per line, qty sign follows the cost sign.
//   B  COMPLETION - fixtures built through the REAL model classes (oracle makedoc, rolled back) and through erp/model_inventory.js: header + line columns, M_StorageOnHand delta, M_Transaction (I+/I-), M_InventoryLineMA, the cost detail and the
//      Fact_Acct of the completion and of its reversal, per step (CO, VO). Refusals (no lines, closed period, internal use without a charge ...) must be refused alike.
//   C  CONFIRM Difference / Scrapped is twin-only (no in-transit MMM doctype in the pilot, legacy config is never changed, §62) and is judged by invariants in erp/tests/witness_movement_confirm.js case e.
//   Zero judged prints INCONCLUSIVE, never PASS. Negative controls (MUST exit 1): LINV_BREAK=noclearing (the offset leg is booked on the asset account) -> part A and B posting red; LINV_BREAK=nostorage (no storage move) -> part B stock red.
// Run: NODE_PATH=$HOME/bim-ootb/node_modules node erp/tests/witness_inventory_diff.js   (pilot + oracle :8097 with ops postdoc, makedoc)
'use strict';
var C = require('./dd_common.js'), path = require('path');
var pass = 0, fail = 0, inc = 0, judged = 0, BREAK = process.env.LINV_BREAK || '';
var log = function (s) { console.log(s); };
var ok = function (id, n, c, d) { judged++; log((c === null ? '  ⚠ ' : c ? '  ✅ ' : '  ❌ ') + id + ' ' + n + (d ? ' — ' + d : '')); c === null ? inc++ : c ? pass++ : fail++; };
function pgRows(sql) { return JSON.parse(require('child_process').execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'idempiere_pilot', '-tAq'], { input: "SET search_path=adempiere;\nSELECT coalesce(json_agg(t),'[]') FROM (" + sql + ") t;\n", encoding: 'utf8', maxBuffer: 1 << 28 }).replace(/^SET\n/, '').trim()); }
var r2 = function (v) { return (Math.round(Number(v || 0) * 100) / 100).toFixed(2); };

(async function main() {
  var H = await C.boot(), q = H.q, one = H.one, db = H.db, lc = C.lc, TODAY = H.TODAY, ML = H.ML;
  log('§INV-SEED patches ok=' + H.patchOk + ' failed=' + H.patchBad + ' today=' + TODAY + ' break=' + (BREAK || 'none'));
  var P = require(path.join(H.ERP, 'model_post.js')), CTX = Object.assign({ date: TODAY }, H.ctx);
  // FIXTURE SYNC (the W-POST-MOVEMENT precedent): legacy posts from the pilot's cost rows and stock; the seed has not lived that history, so the twin is fed the SAME rows and the comparison judges the rules, not the drift.
  ['m_costelement', 'm_cost', 'm_costdetail', 'm_costhistory', 'm_locator', 'm_storageonhand', 'm_inventory', 'm_inventoryline', 'm_inventorylinema'].forEach(function (t) {
    var have = q('PRAGMA table_info(' + t + ')').map(function (c) { return c.name.toLowerCase(); }), rows = pgRows('SELECT * FROM ' + t + ' WHERE ad_client_id=11');
    if (!have.length) { log('§INV-SYNC ' + t + ' ABSENT in the twin (' + rows.length + ' pilot rows not synced) - what needs it is judged below and fails if it matters'); return; }
    db.run('DELETE FROM ' + t + ' WHERE ad_client_id=11');
    rows.forEach(function (r) { var ks = Object.keys(r).filter(function (k) { return have.indexOf(k) >= 0; }); db.run('INSERT INTO ' + t + ' (' + ks.join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (k) { return r[k]; })); });
    log('§INV-SYNC ' + t + ' rows=' + rows.length + ' from the pilot (client 11)');
  });
  db.run('DELETE FROM fact_acct WHERE ad_table_id=321');

  // ═ A  POSTING ═══════════════════════════════════════════════════════════════════════════════════════════════════
  var docs = pgRows("SELECT i.m_inventory_id AS id, d.docsubtypeinv AS st, CASE WHEN EXISTS (SELECT 1 FROM m_inventoryline l WHERE l.m_inventory_id=i.m_inventory_id AND l.qtycount<l.qtybook) THEN 'DOWN' WHEN EXISTS (SELECT 1 FROM m_inventoryline l WHERE l.m_inventory_id=i.m_inventory_id AND l.qtycount>l.qtybook) THEN 'UP' ELSE 'ZERO' END AS cls FROM m_inventory i JOIN c_doctype d ON d.c_doctype_id=i.c_doctype_id WHERE i.ad_client_id=11 AND i.docstatus IN ('CO','CL') ORDER BY 1");
  var stored = {}; pgRows("SELECT record_id AS r, c_acctschema_id AS s, account_id AS a, amtacctdr AS dr, amtacctcr AS cr, amtsourcedr AS sdr, amtsourcecr AS scr, qty, ad_org_id AS o, COALESCE(m_locator_id,0) AS loc, COALESCE(line_id,0) AS l, COALESCE(m_warehouse_id,0) AS wh, COALESCE(m_attributesetinstance_id,0) AS asi, COALESCE(c_uom_id,0) AS u, COALESCE(c_charge_id,0) AS ch, c_currency_id AS cur, description AS d, dateacct::date AS da, datetrx::date AS dt, COALESCE(c_period_id,0) AS pr, COALESCE(gl_category_id,0) AS gl, COALESCE(m_product_id,0) AS p FROM fact_acct WHERE ad_table_id=321").forEach(function (f) { (stored[f.r] = stored[f.r] || []).push(f); });
  if (process.env.INV_LIMIT) docs = docs.slice(0, Number(process.env.INV_LIMIT));   // development / RED / break runs only: a shortened population is printed as N below; the recorded GREEN run never sets it
  var byCls = {}; docs.forEach(function (d) { byCls[d.cls] = (byCls[d.cls] || 0) + 1; });
  log('§INV POPULATION N=' + docs.length + ' Completed M_Inventory in the pilot (client 11): ' + JSON.stringify(byCls) + ' subtypes ' + JSON.stringify(docs.reduce(function (m, d) { m[d.st] = (m[d.st] || 0) + 1; return m; }, {})) + '; in the twin after sync=' + one('SELECT COUNT(*) AS n FROM m_inventory WHERE docstatus IN (\'CO\',\'CL\')').n);
  function twinFacts(id) {
    var trx = new ML.Trx(q, H.env()), doc = trx.get('m_inventory', id);
    if (!doc) return { err: 'no document in the twin seed' };
    var why = null; trx.say = function (l) { if (/§MODEL-(POST|ERR|UNPORTED)/.test(l)) why = (why ? why + ' | ' : '') + String(l).slice(0, 200); };
    var res; try { res = P.post(trx, 'm_inventory', doc, { repost: true }); } catch (e) { return { err: 'EXC ' + String(e).slice(0, 200) }; }
    var rows = trx.groupOps().filter(function (o) { return o && o.table === 'fact_acct' && o.op_type === 'CRUD_CREATE'; }).map(function (o) { var f = o.fields; return { s: Number(f.c_acctschema_id), a: Number(f.account_id), dr: r2(f.amtacctdr), cr: r2(f.amtacctcr), qty: r2(f.qty), p: Number(f.m_product_id || 0), l: Number(f.line_id || 0), o: Number(f.ad_org_id || 0), loc: Number(f.m_locator_id || 0), f: f }; });
    var after = trx.get('m_inventory', id);
    return { rows: rows, posted: res, why: why, status: after ? String(after.posted) : '?' };
  }
  var key = function (f) { return [f.s, f.a, f.dr, f.cr, f.qty, f.p].join(':'); };
  var ST = function (f) { return { s: Number(f.s), a: Number(f.a), dr: r2(f.dr), cr: r2(f.cr), sdr: r2(f.sdr), scr: r2(f.scr), qty: r2(f.qty), o: Number(f.o || 0), loc: Number(f.loc || 0), l: Number(f.l || 0), wh: Number(f.wh || 0), asi: Number(f.asi || 0), u: Number(f.u || 0), ch: Number(f.ch || 0), cur: Number(f.cur || 0), d: f.d == null ? '' : String(f.d), da: String(f.da).slice(0, 10), dt: String(f.dt).slice(0, 10), pr: Number(f.pr || 0), gl: Number(f.gl || 0), p: Number(f.p || 0) }; };
  var twinST = function (f) { return ST({ s: f.c_acctschema_id, a: f.account_id, dr: f.amtacctdr, cr: f.amtacctcr, sdr: f.amtsourcedr, scr: f.amtsourcecr, qty: f.qty, o: f.ad_org_id, loc: f.m_locator_id, l: f.line_id, wh: f.m_warehouse_id, asi: f.m_attributesetinstance_id, u: f.c_uom_id, ch: f.c_charge_id, cur: f.c_currency_id, d: f.description, da: f.dateacct, dt: f.datetrx, pr: f.c_period_id, gl: f.gl_category_id, p: f.m_product_id }); };
  var INV = { docs: 0, sch: 0, org: 0, val: 0, sign: 0 }, byType = {}, colDiff = {}, METHODS = [null, 'S'], orig = q('SELECT c_acctschema_id AS id, costingmethod AS m FROM c_acctschema WHERE ad_client_id=11');
  for (var mi = 0; mi < METHODS.length; mi++) {
    var M = METHODS[mi], tag = M ? 'forced-' + M : 'own';
    orig.forEach(function (o) { db.run('UPDATE c_acctschema SET costingmethod=? WHERE c_acctschema_id=?', [M || o.m, o.id]); });
    for (var di = 0; di < docs.length; di++) {
      var d = docs[di], req = { op: 'postdoc', table: 'M_Inventory', ids: [d.id], facts: true, ctx: H.ctx }; if (M) req.costingMethod = M;
      var L = (await C.oracle(req)).docs[0], T = twinFacts(d.id), k = tag + ' ' + d.st + '/' + d.cls, bt = byType[k] || (byType[k] = { match: 0, judged: 0, diffs: [], facts: 0 });
      if (T.err) { bt.judged++; bt.diffs.push(d.id + ': twin ' + T.err); log('§INV doc=' + d.id + ' ' + k + ' TWIN-ERR ' + T.err); continue; }
      var legSt = L.error != null ? 'E:' + String(L.error).slice(0, 60) : String(L.posted), lf = (L.factRows || []).map(function (f) { return { s: f.s, a: f.a, dr: r2(f.dr), cr: r2(f.cr), qty: r2(f.qty), p: f.p }; }).map(key).sort();
      var tf = T.rows.map(key).sort(); bt.facts += lf.length;
      if (T.rows.length) { var sch = {}, org = {}, ln = {}, qbad = 0; T.rows.forEach(function (f) { var dd = Number(f.dr) - Number(f.cr); sch[f.s] = (sch[f.s] || 0) + dd; org[f.s + '|' + f.o] = (org[f.s + '|' + f.o] || 0) + dd; if (f.l) { ln[f.s + '|' + f.l] = (ln[f.s + '|' + f.l] || 0) + dd; if (Number(f.qty) !== 0 && (Number(f.dr) > 0) !== (Number(f.qty) > 0)) qbad++; } });
        var bad = function (m) { return Object.keys(m).filter(function (x) { return Math.abs(m[x]) > 0.005; }).length; }; INV.docs++; INV.sch += bad(sch); INV.org += bad(org); INV.val += bad(ln); INV.sign += qbad; }
      var same = String(L.posted) === T.status && JSON.stringify(lf) === JSON.stringify(tf);
      if (!M && stored[d.id]) {                                                                                            // the columns the oracle does not return: the pilot's own stored Fact_Acct of the SAME document
        var so = stored[d.id].map(ST).map(function (f) { return JSON.stringify(f); }).sort(), to = T.rows.map(function (r) { return twinST(r.f); }).map(function (f) { return JSON.stringify(f); }).sort(), osame = JSON.stringify(so) === JSON.stringify(to);
        bt.ojudged = (bt.ojudged || 0) + 1; if (osame) bt.omatch = (bt.omatch || 0) + 1; else { bt.odiffs = (bt.odiffs || []).concat(d.id); var s0 = JSON.parse(so[0]), t0 = JSON.parse(to[0] || '{}'); Object.keys(s0).forEach(function (c) { if (String(s0[c]) !== String(t0[c])) colDiff[c] = (colDiff[c] || 0) + 1; }); if ((bt.odiffs.length) <= 2) log('§INV-STORED doc=' + d.id + ' DIFF\n      stored: ' + so.join('\n              ') + '\n      twin:   ' + to.join('\n              ')); } }
      bt.judged++; if (same) bt.match++; else bt.diffs.push(d.id);
      if (!same || di < 3) log('§INV doc=' + d.id + ' ' + k + ' ' + (same ? 'EQUAL' : 'DIFF') + ' legacy=' + legSt + '/' + lf.length + ' twin=' + T.status + '/' + tf.length + (same ? '' : '\n      legacy: ' + lf.join(' ') + '\n      twin:   ' + tf.join(' ') + (T.why ? '\n      why: ' + T.why.slice(-200) : '')));
    }
  }
  orig.forEach(function (o) { db.run('UPDATE c_acctschema SET costingmethod=? WHERE c_acctschema_id=?', [o.m, o.id]); });
  var anyFacts = false;
  Object.keys(byType).sort().forEach(function (t) { var v = byType[t]; if (v.facts) anyFacts = true;
    log('§INV-CLASS ' + t + ' documents=' + v.judged + ' equal=' + v.match + ' legacy fact rows=' + v.facts + (v.ojudged ? ' stored-columns equal=' + (v.omatch || 0) + '/' + v.ojudged : ''));
    ok('A-' + t, t + ': twin status + Fact_Acct == legacy on ' + v.judged + ' of ' + v.judged + ' M_Inventory (legacy fact rows ' + v.facts + ')', v.match === v.judged, v.diffs.slice(0, 6).join(' | '));
    if (v.ojudged) ok('A-STORED-' + t, t + ': org, locator, line, warehouse, ASI, charge, UOM, currency, description, dates, period, GL category of every fact == the pilot\'s stored Fact_Acct on ' + v.ojudged + ' documents', (v.omatch || 0) === v.ojudged, (v.odiffs || []).slice(0, 6).join(' | ') + (Object.keys(colDiff).length ? ' columns=' + JSON.stringify(colDiff) : '')); });
  log('§INV-ACCT twin accounting on ' + INV.docs + ' fact sets: unbalanced schemas=' + INV.sch + ' unbalanced (schema,org)=' + INV.org + ' value-not-conserved lines=' + INV.val + ' qty-sign-vs-cost-sign errors=' + INV.sign);
  ok('A-INV', 'twin facts balance per schema and per org, value is conserved per inventory line, qty sign follows the cost sign (' + INV.docs + ' fact sets)', INV.docs ? (INV.sch + INV.org + INV.val + INV.sign === 0) : null, INV.docs ? '' : 'VACUOUS');
  ok('A-FACTS', 'legacy booked at least one fact (otherwise nothing is judged)', anyFacts ? true : null, anyFacts ? '' : 'VACUOUS: legacy booked 0 rows');

  // ═ B  COMPLETION fixtures ═══════════════════════════════════════════════════════════════════════════════════════
  var PIH = { AD_Org_ID: 11, C_DocType_ID: 144, MovementDate: TODAY, M_Warehouse_ID: 103, DocAction: 'CO' }, IUH = Object.assign({}, PIH, { C_DocType_ID: 200000 });
  var CAH = function (m) { return Object.assign({}, PIH, { C_DocType_ID: 200004, CostingMethod: m }); };
  var IL = function (loc, p, book, count, extra) { return Object.assign({ AD_Org_ID: 11, M_Locator_ID: loc, M_Product_ID: p, QtyBook: book, QtyCount: count }, extra || {}); };
  var LNS = '(SELECT m_inventoryline_id FROM m_inventoryline WHERE m_inventory_id=?)', RV = '(SELECT m_inventory_id FROM m_inventory WHERE reversal_id=?)';
  var Q = {
    hdr: 'SELECT * FROM m_inventory WHERE m_inventory_id=?', lines: 'SELECT * FROM m_inventoryline WHERE m_inventory_id=? ORDER BY line, m_inventoryline_id',
    sonh: 'SELECT m_locator_id, m_product_id, m_attributesetinstance_id, datematerialpolicy, qtyonhand FROM m_storageonhand WHERE m_product_id IN (SELECT m_product_id FROM m_inventoryline WHERE m_inventory_id=?) ORDER BY 1,2,3,4',
    trx: 'SELECT movementtype, m_locator_id, m_product_id, m_attributesetinstance_id, movementqty FROM m_transaction WHERE m_inventoryline_id IN ' + LNS + ' ORDER BY movementtype, m_locator_id, m_product_id, movementqty',
    ma: 'SELECT m_attributesetinstance_id, movementqty, datematerialpolicy, isautogenerated FROM m_inventorylinema WHERE m_inventoryline_id IN ' + LNS + ' ORDER BY 3,1,2',
    cd: 'SELECT c_acctschema_id, amt, qty, processed, issotrx FROM m_costdetail WHERE m_inventoryline_id IN ' + LNS + ' ORDER BY 1,2',
    fa: 'SELECT c_acctschema_id AS s, account_id AS a, amtacctdr AS dr, amtacctcr AS cr, qty, m_product_id AS p, ad_org_id AS o, m_locator_id AS loc FROM fact_acct WHERE ad_table_id=321 AND record_id=? ORDER BY 1,2,3,4',
    rhdr: 'SELECT * FROM m_inventory WHERE reversal_id=?', rlines: 'SELECT * FROM m_inventoryline WHERE m_inventory_id IN ' + RV + ' ORDER BY line',
    rtrx: 'SELECT movementtype, m_locator_id, m_product_id, m_attributesetinstance_id, movementqty FROM m_transaction WHERE m_inventoryline_id IN (SELECT m_inventoryline_id FROM m_inventoryline WHERE m_inventory_id IN ' + RV + ') ORDER BY movementtype, m_locator_id, movementqty',
    rma: 'SELECT m_attributesetinstance_id, movementqty, datematerialpolicy FROM m_inventorylinema WHERE m_inventoryline_id IN (SELECT m_inventoryline_id FROM m_inventoryline WHERE m_inventory_id IN ' + RV + ') ORDER BY 3,1,2',
    rfa: 'SELECT c_acctschema_id AS s, account_id AS a, amtacctdr AS dr, amtacctcr AS cr, qty, m_product_id AS p FROM fact_acct WHERE ad_table_id=321 AND record_id IN ' + RV + ' ORDER BY 1,2,3,4'
  };
  var canon = function (rows, drop) { return rows.map(function (r) { return Object.keys(r).sort().filter(function (k) { return !drop || drop.indexOf(k) < 0; }).map(function (k) { return k + '=' + C.norm(k, r[k]); }).join(','); }); };
  var faCanon = function (rows) { return rows.map(function (f) { return [f.s, f.a, r2(f.dr), r2(f.cr), r2(f.qty), f.p, f.o == null ? '' : f.o, f.loc == null ? '' : f.loc].join(':'); }).sort(); };
  var cdCanon = function (rows) { return rows.map(function (c) { return [c.c_acctschema_id, r2(c.amt), r2(c.qty), c.processed, c.issotrx].join(':'); }).sort(); };
  var delta = function (b, a) { var m = {}, kk = function (r) { return [r.m_locator_id, r.m_product_id, r.m_attributesetinstance_id || 0, String(r.datematerialpolicy).slice(0, 10)].join('|'); };
    (b || []).forEach(function (r) { m[kk(r)] = -Number(r.qtyonhand); }); (a || []).forEach(function (r) { m[kk(r)] = (m[kk(r)] || 0) + Number(r.qtyonhand); });
    return Object.keys(m).filter(function (x) { return Math.abs(m[x]) > 1e-9; }).sort().map(function (x) { return x + '=' + m[x]; }); };
  var scrub = function (r) { if (!r) return r; var o = Object.assign({}, r); if (o.description) o.description = String(o.description).replace(/\d{3,}/g, '#'); return o; };
  var skipH = { documentno: 1, m_inventory_id: 1, m_inventory_uu: 1, reversal_id: 1, movementdate: 1 }, skipL = { m_inventoryline_id: 1, m_inventory_id: 1, m_inventoryline_uu: 1, reversalline_id: 1 };
  var cmpLines = function (Ls, Ts, pre) { var diffs = [], n = 0; if (Ls.length !== Ts.length) return { diffs: [pre + ' count legacy=' + Ls.length + ' twin=' + Ts.length], n: 0 }; Ls.forEach(function (L, i) { var r = C.cmpRow(L, Ts[i], { skip: skipL }); n += r.n; r.diffs.forEach(function (x) { diffs.push(pre + (i + 1) + '.' + x); }); r.missing.forEach(function (m) { diffs.push(pre + (i + 1) + ' twin lacks column ' + m); }); }); return { diffs: diffs, n: n }; };
  var CH = 200000;   // Freight Charges (client 11) - the Internal Use account
  var CASES = [
    { id: 'P1-count-down', note: 'Elm 124 @101 book 15 count 12 (3 out of the FIFO row 2003-01-22)', hdr: PIH, lines: [IL(101, 124, 15, 12, { Line: 10 })], actions: ['CO', 'VO'], reversal: true },
    { id: 'P2-count-up', note: 'Elm 124 @101 book 15 count 18 (3 in: MA row dated MovementDate)', hdr: PIH, lines: [IL(101, 124, 15, 18, { Line: 10 })], actions: ['CO', 'VO'], reversal: true },
    { id: 'P3-negative-balance', note: 'Oak 123 @101 count +2 over book 0: the incoming qty first balances the NEGATIVE storage rows (auto balance negative on hand)', hdr: PIH, lines: [IL(101, 123, 0, 2, { Line: 10 })], actions: ['CO'] },
    { id: 'P4-two-lines', note: 'Elm down 2 + Mulch 137 up 4 in one document', hdr: PIH, lines: [IL(101, 124, 15, 13, { Line: 10 }), IL(101, 137, 52, 56, { Line: 20 })], actions: ['CO'] },
    { id: 'P5-zero-diff', note: 'count == book: nothing moves; the posting finds no cost for a zero qty', hdr: PIH, lines: [IL(101, 124, 15, 15, { Line: 10 })], actions: ['CO'] },
    { id: 'P6-void-draft', note: 'void a Drafted document with DocAction=VO: every line back to Count=Book', hdr: PIH, lines: [IL(101, 124, 15, 12, { Line: 10 })], actions: [{ set: { DocAction: 'VO' } }, 'VO'] },
    { id: 'P7-line-defaults', note: 'Line number and UOM precision defaulted', hdr: PIH, lines: [IL(101, 124, 15, 14)], actions: ['CO', 'CL'] },
    { id: 'I1-internal-use', note: 'Internal Use: 2 Elm to the Freight Charges account', hdr: IUH, lines: [{ AD_Org_ID: 11, M_Locator_ID: 101, M_Product_ID: 124, QtyInternalUse: 2, C_Charge_ID: CH, Line: 10 }], actions: ['CO', 'VO'], reversal: true },
    { id: 'C1-cost-adjust-avg', note: 'Cost Adjustment, doc method A (AveragePO = the schemas\' method): Elm 124 NewCost 60 vs current 57 -> asset/cost-adjustment facts = 3 x on-hand qty, cost detail Qty 0', hdr: CAH('A'), lines: [{ AD_Org_ID: 11, M_Product_ID: 124, NewCostPrice: 60, Line: 10 }], actions: ['CO', 'VO'], reversal: true },
    { id: 'C2-cost-adjust-standard', note: 'Cost Adjustment, doc method S while the schemas cost by A: the cost detail is written, NO fact is posted (doPosting=false)', hdr: CAH('S'), lines: [{ AD_Org_ID: 11, M_Product_ID: 124, NewCostPrice: 60, Line: 10 }], actions: ['CO'] },
    { id: 'R1-no-lines', note: 'complete without lines', hdr: PIH, lines: [], actions: ['CO'], refusal: true },
    { id: 'R2-period-closed', note: 'MovementDate in the permanently closed 2035-01 period', hdr: Object.assign({}, PIH, { MovementDate: '2035-01-15' }), lines: [IL(101, 124, 15, 12, { Line: 10 })], actions: ['CO'], refusal: true },
    { id: 'R3-internal-use-no-charge', note: 'Internal Use line without a charge: the LINE save is refused', hdr: IUH, lines: [{ AD_Org_ID: 11, M_Locator_ID: 101, M_Product_ID: 124, QtyInternalUse: 2, Line: 10 }], actions: [], lineRefusal: true },
    { id: 'R4-pi-with-internal-use', note: 'Physical Inventory line with QtyInternalUse set: the LINE save is refused', hdr: PIH, lines: [IL(101, 124, 15, 12, { Line: 10, QtyInternalUse: 1 })], actions: [], lineRefusal: true }
  ];
  var sp = null;
  for (var ci = 0; ci < CASES.length; ci++) {
    var K = CASES[ci], L;
    try { L = (await C.oracle({ op: 'makedoc', ctx: CTX, header: { table: 'M_Inventory', fields: K.hdr }, lines: K.lines.map(function (l) { return { table: 'M_InventoryLine', parentColumn: 'M_Inventory_ID', fields: l }; }), actions: K.actions, queriesEach: true, queriesBefore: true, queries: Q })).doc; }
    catch (e) { ok('ORACLE-' + K.id, 'oracle reachable', false, String(e.message)); continue; }
    if (sp) { H.rollback(sp); sp = null; } H.begin('c' + ci); sp = 'c' + ci;
    if (K.lineRefusal) {
      var h0 = H.save('m_inventory', K.hdr), tline = null; if (h0.ok) { var l0 = H.save('m_inventoryline', Object.assign({ m_inventory_id: H.lastId('m_inventory') }, K.lines[0])); tline = l0; }
      log('§INV case=' + K.id + ' legacy=' + (L.exception ? 'REFUSED ' + String(L.exception).slice(0, 140) : 'built') + ' | twin line save ok=' + (tline && tline.ok) + ' ' + (tline && (tline.error || tline.msg) || ''));
      ok(K.id, K.note + ': refused alike (legacy exception, twin line save refused)', !!L.exception && tline && !tline.ok, 'legacy=' + (L.exception || 'built') + ' twin=' + (tline && (tline.error || tline.msg))); continue;
    }
    if (L.exception) { log('§INV case=' + K.id + ' LEGACY-REFUSED at build: ' + String(L.exception).slice(0, 200)); ok(K.id, 'legacy built the fixture', null, 'not judged'); continue; }
    var h = H.save('m_inventory', K.hdr); if (!h.ok) { ok(K.id, 'twin header save', false, h.error || h.msg); continue; }
    var mid = H.lastId('m_inventory'), lineFail = null;
    K.lines.forEach(function (l) { if (lineFail) return; var r = H.save('m_inventoryline', Object.assign({ m_inventory_id: mid }, l)); if (!r.ok) lineFail = r.error || r.msg; });
    if (lineFail) { ok(K.id, 'twin line save', false, lineFail); continue; }
    var twBefore = q(Q.sonh, [mid]), legBefore = (L.rowsBefore || {}).sonh || [];
    for (var si = 0; si < K.actions.length; si++) {
      var A = K.actions[si], S = L.steps[si]; if (!S) { ok(K.id + ':' + A, 'legacy produced the step', false); break; }
      if (typeof A === 'object') { var sr = H.update('m_inventory', mid, lc(A.set)); ok(K.id + ':set', 'header edit ' + JSON.stringify(A.set) + ' accepted alike (legacy ' + (S.exception ? 'refused' : 'saved') + ', twin ' + (sr.ok ? 'saved' : 'refused') + ')', !S.exception && sr.ok); continue; }
      var tr = H.docAction('m_inventory', mid, A, { noWorkflow: true }), tid = K.id + ':step=' + A;
      var twStatus = tr.ok ? (one('SELECT docstatus FROM m_inventory WHERE m_inventory_id=?', [mid]) || {}).docstatus : tr.status;
      log('§INV case=' + K.id + ' step=' + A + ' legacy processed=' + S.processed + ' status=' + S.docStatus + (S.processMsg ? ' msg=' + S.processMsg : '') + (S.exception ? ' EXC ' + String(S.exception).slice(0, 120) : '') + ' | twin ok=' + tr.ok + ' status=' + twStatus + (tr.msg ? ' msg=' + tr.msg : ''));
      if (K.refusal) {
        var lm = String(S.exception || S.processMsg || ''), tm = String(tr.msg || ''), keyw = /NoLines/.test(lm) ? /NoLines/ : /PeriodClosed/.test(lm) ? /PeriodClosed/ : null;
        ok(tid, 'refused alike: legacy "' + lm.slice(0, 80) + '" == twin "' + tm.slice(0, 80) + '"', !!keyw && keyw.test(tm) && !tr.ok && (S.exception ? true : S.processed === false), 'legacy=' + lm + ' twin=' + tm); continue;
      }
      if (!(S.processed === true && tr.ok)) { ok(tid, 'both sides performed the action (legacy ' + S.processed + '/' + S.docStatus + ' ' + (S.processMsg || '') + (S.exception ? ' EXC ' + String(S.exception).slice(0, 120) : '') + ', twin ' + tr.ok + '/' + twStatus + ' ' + (tr.msg || '') + ')', false); break; }
      var rows = S.rows, tw = {}; Object.keys(Q).forEach(function (kq) { tw[kq] = q(Q[kq], [mid]); });
      var rh = C.cmpRow(scrub(rows.hdr[0]), scrub(tw.hdr[0]), { skip: skipH }), rl = cmpLines(rows.lines.map(scrub), tw.lines.map(scrub), 'line');
      var dL = delta(legBefore, rows.sonh), dT = delta(twBefore, tw.sonh), tL = canon(rows.trx), tT = canon(tw.trx), mL = canon(rows.ma), mT = canon(tw.ma);
      var all = rh.diffs.concat(rl.diffs), faL = faCanon(rows.fa), faT = faCanon(tw.fa), cdL = cdCanon(rows.cd), cdT = cdCanon(tw.cd);
      log('§INV case=' + K.id + ' step=' + A + ' columns header=' + rh.n + ' lines=' + rl.n + ' diffs=' + all.length + (all.length ? ' :: ' + all.slice(0, 6).join(' ; ') : '') + ' | stock delta legacy=[' + dL.join(' ; ') + '] twin=[' + dT.join(' ; ') + '] | transactions legacy=' + tL.length + ' twin=' + tT.length + ' | MA legacy=' + mL.length + ' twin=' + mT.length + ' | cost details legacy=' + cdL.length + ' twin=' + cdT.length + ' | facts legacy=' + faL.length + ' twin=' + faT.length);
      ok(tid + ':rows', K.note + ' - ' + A + ': m_inventory + m_inventoryline equal legacy field by field (' + (rh.n + rl.n) + ' columns)', all.length === 0, all.slice(0, 4).join(' ; '));
      ok(tid + ':stock', A + ': M_StorageOnHand delta (locator|product|asi|dateMPolicy) equal', JSON.stringify(dL) === JSON.stringify(dT), 'legacy=' + dL.join(';') + ' twin=' + dT.join(';'));
      ok(tid + ':trx', A + ': M_Transaction rows (I+/I-) equal', JSON.stringify(tL) === JSON.stringify(tT), 'legacy=' + tL.join(' | ') + ' twin=' + tT.join(' | '));
      ok(tid + ':ma', A + ': M_InventoryLineMA rows (material policy) equal', JSON.stringify(canon(rows.ma)) === JSON.stringify(canon(tw.ma)), 'legacy=' + mL.join(' | ') + ' twin=' + mT.join(' | '));
      ok(tid + ':cost', A + ': MCostDetail rows (schema, amt, qty) equal', JSON.stringify(cdL) === JSON.stringify(cdT), 'legacy=' + cdL.join(' | ') + ' twin=' + cdT.join(' | '));
      ok(tid + ':facts', A + ': Fact_Acct (schema, account, DR, CR, qty, product, org, locator) equal', JSON.stringify(faL) === JSON.stringify(faT) && (A !== 'CO' || faL.length > 0 || /P5|C2/.test(K.id)), 'legacy=' + faL.join(' | ') + ' twin=' + faT.join(' | '));
      if (K.reversal && A === 'VO') {
        var rrh = (rows.rhdr || [])[0], trh = tw.rhdr[0];
        ok(tid + ':reversal', 'the reversal document exists on both sides', !!rrh && !!trh, 'legacy=' + !!rrh + ' twin=' + !!trh);
        if (rrh && trh) {
          var rr = C.cmpRow(scrub(rrh), scrub(trh), { skip: skipH }), rrl = cmpLines(rows.rlines.map(scrub), tw.rlines.map(scrub), 'rline');
          ok(tid + ':reversal-rows', 'reversal header + switched line (Book<->Count, InternalUse negated) equal legacy field by field (' + (rr.n + rrl.n) + ' columns)', rr.diffs.length + rrl.diffs.length === 0, rr.diffs.concat(rrl.diffs).slice(0, 5).join(' ; '));
          ok(tid + ':reversal-trx', 'reversal transactions + MA equal', JSON.stringify(canon(rows.rtrx)) === JSON.stringify(canon(tw.rtrx)) && JSON.stringify(canon(rows.rma)) === JSON.stringify(canon(tw.rma)), 'legacy=' + canon(rows.rtrx).join('|') + ' twin=' + canon(tw.rtrx).join('|'));
          var rfL = faCanon(rows.rfa), rfT = faCanon(tw.rfa);
          ok(tid + ':reversal-facts', 'reversal Fact_Acct equal legacy (copied from the original, DR<->CR)', JSON.stringify(rfL) === JSON.stringify(rfT) && rfL.length > 0, 'legacy=' + rfL.join(' | ') + ' twin=' + rfT.join(' | '));
          var netSt = q('SELECT COALESCE(SUM(amtacctdr-amtacctcr),0) AS s, COUNT(*) AS n FROM fact_acct WHERE ad_table_id=321 AND record_id IN (?, ?)', [mid, trh.m_inventory_id])[0], netQ = delta(twBefore, tw.sonh);
          ok(tid + ':reversal-net', 'invariant (v): original + reversal net every fact to zero and every storage row back to the start', Math.abs(Number(netSt.s)) < 1e-6 && Number(netSt.n) > 0 && netQ.length === 0, 'fact net=' + netSt.s + ' facts=' + netSt.n + ' storage delta after=' + netQ.join(';'));
        }
      }
    }
  }
  if (sp) { H.rollback(sp); sp = null; }
  // ═ X  twin-only, NOTED-AS-DESIGNED (§62: legacy config is never changed, so the pilot cannot be given a mandatory attribute set): MInventory.prepareIt :408-440 through the ONE rule of model_asi.js ═══
  H.begin('x1');
  try {
    db.run("UPDATE m_attributeset SET mandatorytype='Y' WHERE m_attributeset_id=102");   // Patio Chair 133: an instance attribute set, Always mandatory
    var xh = H.save('m_inventory', PIH), xid = H.lastId('m_inventory'), xl = H.save('m_inventoryline', Object.assign({ m_inventory_id: xid }, IL(101, 133, 0, 1, { Line: 10 })));
    var xs0 = one('SELECT COALESCE(SUM(qtyonhand),0) AS s FROM m_storageonhand WHERE m_product_id=133').s, xr = H.docAction('m_inventory', xid, 'CO', { noWorkflow: true }), xd = one('SELECT docstatus, posted FROM m_inventory WHERE m_inventory_id=?', [xid]);
    log('§INV case=X1-mandatory-asi (twin-only) NOTED-AS-DESIGNED follows MInventory.java:408-440 + MProduct.isASIMandatoryFor :1028-1056 | header ok=' + xh.ok + ' line ok=' + xl.ok + ' | CO ok=' + xr.ok + ' status=' + xd.docstatus + ' msg=' + xr.msg);
    ok('X1-mandatory-asi', 'a Physical Inventory line without ASI for a product whose attribute set is Always mandatory is refused at prepare: "@Line@ 10: @FillMandatory@ @M_AttributeSetInstance_ID@", the document stays Drafted/Invalid, nothing moves',
      xh.ok && xl.ok && !xr.ok && /@Line@ 10: @FillMandatory@ @M_AttributeSetInstance_ID@/.test(String(xr.msg)) && xd.docstatus !== 'CO' && Number(one('SELECT COALESCE(SUM(qtyonhand),0) AS s FROM m_storageonhand WHERE m_product_id=133').s) === Number(xs0) && !q('SELECT 1 AS x FROM fact_acct WHERE ad_table_id=321 AND record_id=?', [xid]).length, 'status=' + xd.docstatus + ' msg=' + xr.msg);
  } finally { H.rollback('x1'); }
  // FSM: DocumentEngine.getValidActions for M_Inventory (321) vs ad_docfsm
  var dbShim = {}; dbShim.prepare = function (sql) { return { get: function (a) { return q(sql, [a])[0]; } }; };
  var STAT = ['DR', 'IP', 'IN', 'CO', 'CL', 'VO', 'RE'], va = await C.oracle({ op: 'validactions', table: 'M_Inventory', statuses: STAT }), fd = [];
  STAT.forEach(function (s) { var t; try { t = H.FSM.legalActionsFor(dbShim, 321, { docStatus: s, processing: 'N', doctypeId: 144, periodOpen: true, isBackDateTrxAllowed: true }).slice().sort().join(','); } catch (e) { t = 'ERR ' + e.message; }
    var l = (va.actions[s] || []).slice().sort().join(','); if (l !== t) fd.push(s + ' legacy=[' + l + '] twin=[' + t + ']'); });
  log('§INV-FSM tableId=' + va.tableId + ' diffs=' + fd.length + (fd.length ? ' :: ' + fd.join(' ; ') : ''));
  ok('B-FSM', 'M_Inventory valid actions per DocStatus equal DocumentEngine.getValidActions', va.tableId === 321 && !fd.length, fd.join(' ; '));
  if (!judged) ok('T-VACUOUS', 'at least one case judged', null, 'nothing was judged');
  var verdict = fail ? 'FAIL' : (inc || !judged) ? 'INCONCLUSIVE' : 'PASS';
  log('§INV-SUMMARY ' + verdict + ' judged=' + judged + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inc + ' break=' + (BREAK || 'none'));
  process.exit(verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 3);
})().catch(function (e) { console.log('§INV-ERROR ' + (e.stack || e)); process.exit(2); });
