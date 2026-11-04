#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-BOM-EXPLODE / W-BOM-NESTED / W-BOM-TILL (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §25; CARDINAL RULE: the twin does what legacy MOrder.explodeBOM does).
//   READ THE LOG after every run: every verdict is a §BOM line, the exit code is not evidence. A mutant that CRASHES is NOT a kill: it must print its own FAIL verdict. INCONCLUSIVE when nothing was judged.
// THE ISSUE: erp/model_order.js refused a non-stocked verified BOM in prepareIt ("explodeBOM (MOrder.java:1823) not ported") so a BOM item rung at the till made the ticket fail at Import POS Sales.
// SPEC (written first, §25):
//   EXPL   Import Orders (DocAction CO) over ONE line PBackLeg (50000, IsBOM=Y IsVerified=Y IsStocked=N) x3: the order COMPLETES; its lines are [comment line (no product, price 0, description starts with the product name), then
//          the default BOM's components in BOM-line order, Qty = 3 x QtyBOM] numbered 10,20,30,40 (renumberLines(10)); the expected rows come from INDEPENDENT SQL over pp_product_bomline (the same rows the local
//          legacy postgres holds - compared when reachable); order TotalLines = sum(qty x price) by an independent oracle; the shipment moves the COMPONENTS' storage (-qty each), the parent has no storage change.
//   NEST   a BOM inside a BOM (fixture: BOM 50001 gets a line whose product is PFrontLeg, itself a non-stocked BOM) is exploded ONE level only: legacy MOrder.java:1912 recounts with getC_Invoice_ID() as the
//          C_Order_ID (-1 for a fresh order) so the loop runs once. The nested product stays a normal priced line.
//   TILL   a till ticket PBackLeg x3 (+ cash tender = ticket total) -> Import POS Sales -> ONE completed order (tickets are all-or-none), component storage at the branch warehouse drops by BOM qty x sold qty,
//          the receipt total == the order GrandTotal to the cent.
// Fixtures live in this witness's scratch copy only (components' stock on hand, component prices so that one BackLeg unit = 15.00 at HQ = the till's price); never the seed.
// MUTANTS (BOMW_MUTANTS=1): copies of the shipped erp/ (never symlinks), proven APPLIED exactly once, the named case must go FAIL in a child run (a crash is not a kill): M1 qty not multiplied; M2 the old refusal restored;
//   M3 recursion ADDED (recount by the order id; legacy does not recurse, :1912) must be killed by NEST. "No recursion" is legacy behaviour, so it is not a mutant.
// Command: node erp/tests/witness_bom_explode.js 2>&1 | tee /tmp/bom_logs/witness_bom_explode.log
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), url = require('url');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.BOMW_ERP || path.join(__dirname, '..'), MUTANT = process.env.BOMW_MUTANT || '';
var SQLJS_DIR = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';
if (!process.env.SQLJS) process.env.SQLJS = SQLJS_DIR;
var initSqlJs = require(SQLJS_DIR);
var _log = console.log, SEEN = [];
console.log = function () { SEEN.push(Array.prototype.join.call(arguments, ' ')); };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §BOM-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + JSON.stringify(info))); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§BOM-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
function J(x) { return JSON.stringify(x); }
function guard(cs, key, rule, fn) { try { fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.message || e.stack) || String(e))); } }
var num = function (x) { return x == null ? null : Number(x); }, cents = function (x) { return Math.round(Number(x) * 100); };
var PID = 9538001, BUNDLE_ID = 'org.kernel.pos-integration';

(async function main() {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIR, 'dist', f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); } catch (e) { /* idempotent self-heal */ } });
  function q0(sql, params) { var st = db.prepare(sql), out = []; try { if (params && params.length) st.bind(params); while (st.step()) { var o = st.getAsObject(), r = {}; for (var kk in o) r[kk.toLowerCase()] = o[kk]; out.push(r); } } finally { st.free(); } return out; }
  require(path.join(ERP, 'ad_import_tables.js')).ensure(db); require(path.join(ERP, 'ad_rule.js')).ensure(db);
  var K = require(path.join(ERP, 'ws_kernel.js')), k = K.build(db), ML = k.ML, AP = require(path.join(ERP, 'ad_process.js')), PR = require(path.join(ERP, 'plugin_registry.js'));
  var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:bom-explode' };
  function q(sql, p) { return k.q(sql, p || []); }
  function one(sql, p) { return q(sql, p)[0] || null; }
  function commit(fn) { var trx = new ML.Trx(k.q, Object.assign(k.env(S), { noPost: true })), r;
    try { r = fn(trx, ML) || { ok: true }; } catch (ex) { r = { ok: false, error: 'model threw: ' + (ex && ex.message) }; trx.say('§MODEL-ERR ' + (ex && ex.stack || ex)); }
    var ok = r.ok !== false, ops = ok ? trx.groupOps() : []; if (ok && ops.length) k.commit(S, ops, {}); return Object.assign({}, r, { ok: ok, log: trx.log }); }
  function deposit(rows) { return commit(function (trx) { for (var i = 0; i < rows.length; i++) { var sv = ML.save(trx, rows[i].t || 'i_order', null, ML.newPO(trx, rows[i].t || 'i_order', rows[i].f || rows[i])); if (!sv.ok) return { ok: false, error: sv.error }; } return { ok: true }; }); }
  function importOrders() { return commit(function (trx) { var r0 = AP.runInTrx(trx, 206, { params: { AD_Client_ID: 11, AD_Org_ID: 11, DocAction: 'CO' } }); return { ok: r0.ok, error: r0.summary, summary: r0.summary }; }); }
  var SHIPPED = []; function keep(r) { (r.log || []).forEach(function (l) { if (/^§(IMPORT_ORDER|MODEL-ERR|PROC-|MODEL-)/.test(l)) SHIPPED.push(l); }); }
  say('§BOM-LOAD erp=' + ERP + ' mutant=' + (MUTANT || 'none'));

  // ── fixtures (scratch copy only) ─────────────────────────────────────────────────────────────────────────
  // components' stock at locator 990000 (the POS Order's warehouse 990000 picks it) and a price in EVERY price list version so that one BackLeg unit costs 15.00 at HQ
  var COMP = { 50016: 1.5, 50002: 0.25, 50003: 0.02, 50015: 2, 50001: 15, 50000: 15 };   // price per unit; 50015 FrontLeg (nest case); the BOM parents 50000/50001 are priced like the till rings them (Import Orders prices the line BEFORE prepareIt explodes it)
  var oh = q0('SELECT * FROM m_storageonhand WHERE m_product_id=123 AND m_locator_id=101')[0];
  [50016, 50002, 50003, 50015].forEach(function (pid) { var r = Object.assign({}, oh, { m_locator_id: 990000, m_product_id: pid, qtyonhand: 100000, m_storageonhand_uu: 'bomw-' + pid }); var cols = Object.keys(r);
    db.run('INSERT INTO m_storageonhand (' + cols.join(',') + ') VALUES (' + cols.map(function () { return '?'; }).join(',') + ')', cols.map(function (c) { return r[c] === undefined ? null : r[c]; })); });
  var pp = q0('SELECT * FROM m_productprice WHERE m_product_id=123');
  pp.forEach(function (base) { [50016, 50002, 50003, 50015, 50000, 50001].forEach(function (pid) { var r = Object.assign({}, base, { m_product_id: pid, pricelist: COMP[pid], pricestd: COMP[pid], pricelimit: 0 }); r.m_productprice_uu = 'bomw-' + base.m_pricelist_version_id + '-' + pid; if ('m_productprice_id' in r) r.m_productprice_id = 9000000 + Number(base.m_pricelist_version_id) * 100 + (pid % 100);
    var cols = Object.keys(r); db.run('INSERT OR REPLACE INTO m_productprice (' + cols.join(',') + ') VALUES (' + cols.map(function () { return '?'; }).join(',') + ')', cols.map(function (c) { return r[c] === undefined ? null : r[c]; })); }); });
  function onhand(prod) { return num(one('SELECT COALESCE(SUM(qtyonhand),0) AS q FROM m_storageonhand WHERE m_product_id=?', [prod]).q); }   // every locator: the shipment picks its own
  function stock(prods) { var o = {}; prods.forEach(function (p) { o[p] = onhand(p); }); return o; }
  function delta(a, b) { var d = {}; Object.keys(b).forEach(function (p) { var x = Math.round((b[p] - a[p]) * 1000) / 1000; if (x !== 0) d[p] = x; }); return d; }
  function line(key, prod, qty, price) { return { i_isimported: 'N', issotrx: 'Y', documentno: key, doctypename: 'POS Order', m_product_id: prod, qtyordered: qty, priceactual: price, c_uom_id: 100, dateordered: '2026-10-28 00:00:00', ad_org_id: 11 }; }
  // independent oracle: the expected exploded lines from the BOM rows themselves (default BOM 'A'/'A', active, ordered by Line)
  function expectedLines(prod, qty) {
    var b = q("SELECT pp_product_bom_id FROM pp_product_bom WHERE m_product_id=? AND bomuse='A' AND bomtype='A' AND isactive='Y'", [prod]);
    return b.length !== 1 ? [] : q("SELECT m_product_id AS p, qtybom AS b FROM pp_product_bomline WHERE pp_product_bom_id=? AND isactive='Y' ORDER BY line", [b[0].pp_product_bom_id]).map(function (r) { return { p: num(r.p), q: Math.round(qty * Number(r.b) * 1e6) / 1e6 }; });
  }
  function readOrder(key) {
    var o = one('SELECT * FROM c_order WHERE documentno=?', [key]);
    return { o: o, ol: o ? q('SELECT * FROM c_orderline WHERE c_order_id=? ORDER BY line, c_orderline_id', [o.c_order_id]) : [], io: q('SELECT i_isimported AS imp, i_errormsg AS err FROM i_order WHERE documentno=?', [key]) };
  }

  // legacy comparison data: the same BOM rows in the local legacy postgres (stated when unreachable)
  var PG = 'not-run';
  try { var pgOut = cp.execSync('docker exec postgres psql -U adempiere -d idempiere -Atc "select b.m_product_id, l.line, l.m_product_id, l.qtybom from pp_product_bom b join pp_product_bomline l using(pp_product_bom_id) where b.m_product_id in (50000,50001) and b.bomuse=\'A\' and b.bomtype=\'A\' and b.isactive=\'Y\' and l.isactive=\'Y\' order by 1,2"', { encoding: 'utf8', timeout: 20000 });
    PG = pgOut.trim().split('\n').filter(Boolean).map(function (r) { var f = r.split('|'); return f[0] + ':' + f[1] + ':' + f[2] + ':' + Number(f[3]); }); } catch (e) { PG = 'unreachable'; }

  // ═══ EXPL ═══
  var STOCK0 = stock([50000, 50016, 50002, 50003]), E = null;
  guard('EXPL', 'prepare', 'a non-stocked verified BOM line (PBackLeg x3) through Import Orders (DocAction CO) COMPLETES: I_IsImported=Y, empty error, order CO (the old refusal made it Invalid)', function () {
    var d = deposit([line('BOM/E1', 50000, 3, 15)]), imp = importOrders(); keep(imp); E = readOrder('BOM/E1');
    check('EXPL', 'prepare', 'imported Y, no I_ErrorMsg, c_order DocStatus CO', d.ok && E.io.length === 1 && E.io[0].imp === 'Y' && !String(E.io[0].err || '').trim() && !!E.o && E.o.docstatus === 'CO', { dep: d.ok, io: E.io, st: E.o && E.o.docstatus, err: imp.error });
  });
  guard('EXPL', 'lines', 'lines = [comment line, then the BOM components in BOM-line order x3], numbered 10..40, expected rows from independent SQL over pp_product_bomline', function () {
    var exp = expectedLines(50000, 3), ol = E && E.ol || [];
    check('EXPL', 'oracle-nonvacuous', 'the oracle found the default BOM of PBackLeg with 3 lines (a vacuous oracle judges nothing)', exp.length === 3, exp);
    check('EXPL', 'comment-line', 'line 10 is the converted parent: no product, price 0, LineNetAmt 0, description starts with the product NAME "Assembly Back Leg" (MOrder.java:1901)', ol.length > 0 && !num(ol[0].m_product_id) && num(ol[0].line) === 10 && cents(ol[0].priceactual) === 0 && cents(ol[0].linenetamt) === 0 && /^Assembly Back Leg/.test(String(ol[0].description || '')), ol[0]);
    var comps = ol.slice(1);
    check('EXPL', 'components', 'then exactly the BOM components in order with Qty = 3 x QtyBOM, lines 20,30,40: ' + J(exp), comps.length === exp.length && exp.length > 0 && comps.every(function (l, i) { return num(l.m_product_id) === exp[i].p && Math.abs(num(l.qtyordered) - exp[i].q) < 1e-9 && num(l.line) === (i + 2) * 10; }), comps.map(function (l) { return [l.line, l.m_product_id, l.qtyordered]; }));
    check('EXPL', 'no-parent-product', 'no line of the order still carries the BOM product 50000', ol.every(function (l) { return num(l.m_product_id) !== 50000; }), ol.map(function (l) { return l.m_product_id; }));
  });
  guard('EXPL', 'legacy-bom', 'the BOM rows the twin read equal the rows in the local legacy postgres (' + J(PG) + ')', function () {
    var mine = q("SELECT b.m_product_id AS a, l.line AS b, l.m_product_id AS c, l.qtybom AS d FROM pp_product_bom b JOIN pp_product_bomline l ON l.pp_product_bom_id=b.pp_product_bom_id WHERE b.m_product_id IN (50000,50001) AND b.bomuse='A' AND b.bomtype='A' AND b.isactive='Y' AND l.isactive='Y' ORDER BY 1,2").map(function (r) { return r.a + ':' + r.b + ':' + r.c + ':' + Number(r.d); });
    if (PG === 'unreachable' || PG === 'not-run') { say('§BOM-NOTE legacy postgres ' + PG + ': the algorithm is compared to the Java source alone'); check('EXPL', 'legacy-bom', 'postgres unreachable - recorded, not judged', true, PG); return; }
    check('EXPL', 'legacy-bom', 'twin seed BOM rows == legacy postgres BOM rows (' + mine.length + ' rows)', mine.length > 0 && J(mine) === J(PG), { mine: mine, pg: PG });
  });
  guard('EXPL', 'totals', 'TotalLines = sum(qty x price) of the components by an independent oracle (BackLeg 6 x 1.50, Screw 24 x 0.25, UltraGlue 1500 x 0.02 = 45.00); GrandTotal = TotalLines + order tax rows', function () {
    var ol = E.ol, orc = ol.reduce(function (a, l) { return a + (l.m_product_id ? Number(l.qtyordered) * COMP[l.m_product_id] : 0); }, 0), tax = num(one('SELECT COALESCE(SUM(taxamt),0) AS t FROM c_ordertax WHERE c_order_id=?', [E.o.c_order_id]).t);
    check('EXPL', 'totals', 'TotalLines ' + E.o.totallines + ' == oracle ' + orc + '; GrandTotal ' + E.o.grandtotal, ol.length > 1 && cents(E.o.totallines) === cents(orc) && cents(orc) === 4500 && cents(E.o.grandtotal) === cents(orc) + cents(tax), { tl: E.o.totallines, orc: orc, gt: E.o.grandtotal, tax: tax });
  });
  guard('EXPL', 'shipment', 'the shipment of the completed order reduces COMPONENT storage by qty (50016 -6, 50002 -24, 50003 -1500) and not the parent (50000: no change, no row)', function () {
    var d = delta(STOCK0, stock([50000, 50016, 50002, 50003])), sh = one('SELECT * FROM m_inout WHERE c_order_id=?', [E.o.c_order_id]);
    check('EXPL', 'shipment', 'one CO shipment; storage deltas ' + J(d), !!sh && sh.docstatus === 'CO' && J(d) === J({ 50002: -24, 50003: -1500, 50016: -6 }) && q('SELECT 1 FROM m_storageonhand WHERE m_product_id=50000').length === 0 && q('SELECT 1 FROM m_transaction WHERE m_product_id=50000').length === 0, { sh: sh && sh.docstatus, d: d });
  });

  if (process.env.BOMW_DEBUG) { say('DBG lines ' + J(E.ol.map(function (l) { return [l.line, l.m_product_id, l.qtyordered, l.qtydelivered, l.qtyinvoiced, l.linenetamt, l.m_warehouse_id]; }))); var iv = q('SELECT * FROM c_invoice WHERE c_order_id=?', [E.o.c_order_id]); say('DBG inv ' + J(iv.map(function (x) { return [x.docstatus, x.grandtotal, x.totallines]; })) + ' invlines ' + J(iv[0] ? q('SELECT line,m_product_id,qtyinvoiced,priceactual,linenetamt FROM c_invoiceline WHERE c_invoice_id=?', [iv[0].c_invoice_id]) : [])); say('DBG loc ' + J(q('SELECT m_locator_id,m_warehouse_id FROM m_locator WHERE m_warehouse_id=990000')) + ' tx ' + J(q('SELECT m_product_id,m_locator_id,movementqty FROM m_transaction WHERE m_inoutline_id IN (SELECT m_inoutline_id FROM m_inoutline l JOIN m_inout i ON i.m_inout_id=l.m_inout_id WHERE i.c_order_id=?)', [E.o.c_order_id]))); }
  // ═══ NEST ═══ fixture: BOM 50001 (PBackLeg) gets a line for PFrontLeg (50001, itself a non-stocked verified BOM, default BOM 50003 present)
  guard('NEST', 'one-level', 'a BOM inside a BOM is exploded ONE level: PFrontLeg stays a normal line (legacy :1912 recounts by getC_Invoice_ID, -1 for a new order => loop once)', function () {
    var maxId = num(one('SELECT MAX(pp_product_bomline_id) AS m FROM pp_product_bomline').m), tpl = one('SELECT * FROM pp_product_bomline WHERE pp_product_bom_id=50001 AND line=30');
    var nl = Object.assign({}, tpl, { pp_product_bomline_id: maxId + 1, line: 40, m_product_id: 50001, qtybom: 1 }); if ('pp_product_bomline_uu' in nl) nl.pp_product_bomline_uu = 'bomw-nest'; var cols = Object.keys(nl);
    db.run('INSERT INTO pp_product_bomline (' + cols.join(',') + ') VALUES (' + cols.map(function () { return '?'; }).join(',') + ')', cols.map(function (c) { return nl[c] === undefined ? null : nl[c]; }));
    var d = deposit([line('BOM/N1', 50000, 2, 15)]), imp = importOrders(); keep(imp); var N = readOrder('BOM/N1'), ps = N.ol.map(function (l) { return num(l.m_product_id); });
    db.run("DELETE FROM pp_product_bomline WHERE pp_product_bomline_uu='bomw-nest'");   // fixture removed: later cases see the seed BOM
    check('NEST', 'one-level', 'order exists; lines carry PBackLeg components (50016,50002,50003) AND the nested PFrontLeg 50001 unexploded (no 50015 FrontLeg, no second comment line); products ' + J(ps),
      d.ok && !!N.o && ps.indexOf(50016) >= 0 && ps.indexOf(50001) >= 0 && ps.indexOf(50015) < 0 && ps.filter(function (p) { return !p; }).length === 1, { dep: d.ok, io: N.io, ps: ps, err: imp.error, st: N.o && N.o.docstatus });
  });

  // ═══ TILL ═══ the plugin on the registry exactly as the host does, then a ticket
  var host = { engineVersion: '1.0.0', db: { query: function (sql, p) { return q0(sql, p); }, run: function (sql, p) { db.run(sql, p || []); } }, ops: { append: function () { return 1; } }, process: AP, docAction: ML,
    import: function (u) { return import(url.pathToFileURL(path.resolve(path.join(ERP, 'plugins'), u)).href); } };
  var reg = PR.create(host), started = null, perr = null;
  try { var mod = await import(url.pathToFileURL(path.join(ERP, 'plugins', 'pos_integration.mjs')).href); await reg.installBundle(mod); started = await reg.startBundle(BUNDLE_ID); } catch (e) { perr = e && e.message; }
  if (process.env.BOMW_DEBUG) { var _r = AP.runInTrx; AP.runInTrx = function (trx, id, o) { var r = _r.apply(this, arguments); if (id === 206) { trx.find('c_order', {}).slice(-1).forEach(function (od) { say('DBG206 order ' + J([od.c_order_id, od.docstatus, od.totallines, od.grandtotal])); say('DBG206 lines ' + J(trx.find('c_orderline', { c_order_id: od.c_order_id }, ['line']).map(function (l) { return [l.c_orderline_id, l.line, l.m_product_id, l.qtyordered, l.linenetamt]; }))); say('DBG206 invoices ' + J(trx.find('c_invoice', {}).slice(-2).map(function (x) { return [x.c_invoice_id, x.c_order_id, x.docstatus, x.totallines, x.grandtotal]; }))); }); } return r; }; }
  var T0 = null;
  guard('TILL', 'plugin', 'the POS integration plugin starts (precondition; a plugin that did not start makes the TILL verdict INCONCLUSIVE, not PASS)', function () {
    if (!started || started.state !== 'ACTIVE') { say('§BOM-TILL-PRECONDITION plugin not ACTIVE: ' + perr); return; }
    check('TILL', 'plugin', 'plugin ACTIVE', true, null);
    var KEY = 'POS1/2026-10-28/0901', D1 = '2026-10-28 00:00:00', before = stock([50016, 50002, 50003, 50000]);
    var rows = [{ t: 'i_order', f: line(KEY, 50000, 3, 15) }, { t: 'i_payment', f: { i_isimported: 'N', documentno: KEY, doctypename: 'AR Receipt', iso_code: 'USD', payamt: 45, tendertype: 'X', datetrx: D1, ad_org_id: 11 } }];
    var d = deposit(rows), run = commit(function (trx) { var r0 = AP.runInTrx(trx, PID, { params: { C_BankAccount_ID: 100, AD_Client_ID: 11, AD_Org_ID: 11, DocumentNo: KEY } }); return { ok: r0.ok, r: r0, error: r0.summary }; });
    (run.log || []).forEach(function (l) { if (/^§(POSS|IMPORT_ORDER|IMPORT_PAYMENT|MODEL-ERR|PROC-)/.test(l)) SHIPPED.push(l); });
    var orders = q('SELECT * FROM c_order WHERE documentno=?', [KEY]), o = orders[0] || {}, inv = o.c_order_id ? q('SELECT * FROM c_invoice WHERE c_order_id=?', [o.c_order_id]) : [], pays = q('SELECT * FROM c_payment WHERE documentno=?', [KEY]);
    var dlt = delta(before, stock([50016, 50002, 50003, 50000]));
    check('TILL', 'one-order', 'Import POS Sales answers #1/0; ONE completed order for the ticket; the ticket line became comment + 3 components', d.ok && run.ok && orders.length === 1 && o.docstatus === 'CO' && q('SELECT 1 FROM c_orderline WHERE c_order_id=? AND m_product_id IS NOT NULL', [o.c_order_id]).length === 3, { dep: d.ok, ok: run.ok, sum: run.r && run.r.summary, n: orders.length, st: o.docstatus, poss: SHIPPED.filter(function (l) { return /POSS-TICKET/.test(l); }).slice(-2) });
    check('TILL', 'storage', 'component storage at the branch warehouse drops by BOM qty x sold qty: 50016 -6, 50002 -24, 50003 -1500; the parent has none ' + J(dlt), J(dlt) === J({ 50002: -24, 50003: -1500, 50016: -6 }), dlt);
    check('TILL', 'receipt', 'receipt total == GrandTotal to the cent (45.00): ONE completed invoice, ONE receipt, invoice IsPaid', inv.length === 1 && inv[0].docstatus === 'CO' && pays.length === 1 && pays[0].docstatus === 'CO' && cents(pays[0].payamt) === cents(o.grandtotal) && cents(o.grandtotal) === 4500 && cents(inv[0].grandtotal) === cents(o.grandtotal), { gt: o.grandtotal, inv: inv.map(function (x) { return [x.docstatus, x.grandtotal]; }), pays: pays.map(function (x) { return [x.docstatus, x.payamt]; }) });
    T0 = true;
  });

  var vs = ['EXPL', 'NEST', 'TILL'].map(verdict);
  SHIPPED.slice(0, 40).forEach(function (l) { say('  shipped> ' + l.slice(0, 260)); });
  var overall = vs.indexOf('FAIL') >= 0 ? 'FAIL' : vs.indexOf('INCONCLUSIVE') >= 0 ? 'INCONCLUSIVE' : 'PASS';
  say('§BOM-VERDICT ' + overall + ' judged=' + ALL.judged + ' failed=' + ALL.failed + (MUTANT ? ' mutant=' + MUTANT : ''));

  // ═══ MUTANTS ═══
  if (process.env.BOMW_MUTANTS === '1' && !MUTANT) {
    var MUT = [
      { id: 'M1-qty-not-multiplied', file: 'model_order.js', from: "var qty = D(line.qtyordered).multiply(D(bl.qtybom));", to: "var qty = D(bl.qtybom);", kills: 'EXPL' },
      { id: 'M2-old-refusal', file: 'model_order.js', from: "if (MOrder.explodeBOM(trx, o)) ls = lines(trx, o, ['m_product_id']);", to: "if (ls.some(function (l) { var p = T.product(trx, l.m_product_id); return p && Y(p.isbom) && Y(p.isverified) && !Y(p.isstocked); })) { T.msg(trx, 'explodeBOM (MOrder.java:1823) not ported — named'); return 'IN'; }", kills: 'EXPL' },
      { id: 'M3-recursion-added', file: 'model_order.js', from: "count = countFor(inv.length ? inv[0].c_invoice_id : -1);", to: "count = countFor(o.c_order_id);", kills: 'NEST' }
    ];
    MUT.forEach(function (m) {
      var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bomw-mut-')), dst = path.join(dir, 'erp');
      cp.execSync('cp -r ' + JSON.stringify(ERP) + ' ' + JSON.stringify(dst) + ' && cp -r ' + JSON.stringify(path.join(ERP, '..', 'common')) + ' ' + JSON.stringify(path.join(dir, 'common')));
      var f = path.join(dst, m.file), src = fs.readFileSync(f, 'utf8'), n = src.split(m.from).length - 1;
      if (n !== 1) { say('§BOM-MUTANT ' + m.id + ' NOT-APPLIED occurrences=' + n + ' (INCONCLUSIVE)'); return; }
      fs.writeFileSync(f, src.replace(m.from, function () { return m.to; }));
      var out = ''; try { out = cp.execSync('node ' + JSON.stringify(path.join(dst, 'tests', 'witness_bom_explode.js')), { env: Object.assign({}, process.env, { BOMW_ERP: dst, BOMW_MUTANT: m.id, BOMW_MUTANTS: '' }), encoding: 'utf8', timeout: 600000, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); }
      var killed = new RegExp('§BOM-' + m.kills + ' verdict=FAIL').test(out), crashed = !/§BOM-VERDICT/.test(out);
      say('§BOM-MUTANT ' + m.id + ' applied=1 ' + (crashed ? 'CRASH-not-a-kill' : killed ? 'KILLED-by-' + m.kills : 'SURVIVED'));
      try { cp.execSync('rm -rf ' + JSON.stringify(dir)); } catch (e) { /* tmp */ }
    });
  }
  process.exit(overall === 'FAIL' ? 1 : 0);
})().catch(function (e) { _log('§BOM-CRASH ' + (e && e.stack || e)); process.exit(2); });
