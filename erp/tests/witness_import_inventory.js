#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-IMPORT-INVENTORY (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §37; TWIN CARDINAL RULE: the twin does what legacy iDempiere does). READ THE LOG after every run: every verdict is a §IINV line, the exit code is not the evidence.
// Legacy: org.adempiere.base.process/src/org/compiere/process/ImportInventory.java = AD_Process 219. SPEC (claims written before the code; legacy lines in erp/processes/ImportInventory.js):
//   TABLE  I_Inventory (AD_Table 572, 38 AD_Column rows) is in the seed without a physical table; AdImportTables.ensure(db) creates it, columns == dictionary, and ensure() still reports 3 older tables.
//   P0     AD_Process 219 resolves to the ported class; X of N: every AD_Process_Para name is read by prepare() (:102-125).
//   LINE   a row (Value, LocatorValue, QtyCount, QtyBook, DocTypeName) -> ONE MInventory header + ONE line copying QtyBook/QtyCount (:422-424); DocAction CO completes; storage moves by QtyCount-QtyBook (MInventory.java:535); row Y + ids (:436-440).
//   UPC    a product found by UPC when Value is empty (:285-291).
//   GROUP  two rows, same warehouse/day/doctype -> ONE header, TWO lines (:373-377).
//   ERR    legacy I_ErrorMsg text per failing row, a good row in the same run is still imported: No Product (:292-298), No Location (:245-251), No Qty Count or Internal Use (:315-322), Excluding quantities (:324-331), Required charge (:333-340), Invalid DocType (:213-219).
//   NODA   DocAction not sent -> header stays Drafted, storage unchanged (:383,:461).
//   RERUN  a second run makes nothing new (the Y row is not read again, :354-356).
//   REFUSE IsUpdateCosting=Y is a NAMED refusal (never silent).
// Every check names the issue it proves; INCONCLUSIVE when nothing was judged. Command: node erp/tests/witness_import_inventory.js 2>&1 | tee /tmp/count_logs/import_inventory.log
'use strict';
var fs = require('fs'), path = require('path');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.IINV_ERP || path.join(__dirname, '..'), SQLJS_DIR = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';
if (!process.env.SQLJS) process.env.SQLJS = SQLJS_DIR;
var initSqlJs = require(SQLJS_DIR), _log = console.log, SEEN = [];
console.log = function () { SEEN.push(Array.prototype.join.call(arguments, ' ')); };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; } say('  §IINV-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + JSON.stringify(info))); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; say('§IINV-' + cs + ' verdict=' + (!c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS') + ' judged=' + c.judged + ' failed=' + c.failed); }
function guard(cs, key, rule, fn) { try { fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.stack || e.message) || String(e))); } }
var J = JSON.stringify;
(async function main() {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIR, 'dist', f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); } catch (e) { /* patch statement */ } });
  function q0(sql, params) { var st = db.prepare(sql), out = []; try { if (params && params.length) st.bind(params); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }
  var AIT = require(path.join(ERP, 'ad_import_tables.js')), AR = require(path.join(ERP, 'ad_rule.js'));
  say('§IINV-LOAD erp=' + ERP);
  // ═══ TABLE ═══
  var dict = q0("SELECT lower(c.columnname) AS c FROM ad_column c WHERE c.ad_table_id=572 AND c.isactive='Y'").map(function (r) { return r.c; }).sort();
  check('TABLE', 'seed-gap', 'the seed has the 38 I_Inventory dictionary columns but NO physical i_inventory table', dict.length === 38 && q0("SELECT name FROM sqlite_master WHERE name='i_inventory'").length === 0, { dict: dict.length });
  var n1 = AIT.ensure(db), n2 = AIT.ensure(db), phys = q0('PRAGMA table_info(i_inventory)').map(function (r) { return String(r.name).toLowerCase(); }).sort();
  check('TABLE', 'ensure', 'ensure(db) still reports the three older import tables (3 then 0) and creates i_inventory whose physical columns == the 38 dictionary columns', n1 === 3 && n2 === 0 && J(phys) === J(dict), { n1: n1, n2: n2, phys: phys.length });
  AR.ensure(db);
  var K = require(path.join(ERP, 'ws_kernel.js')), k = K.build(db), ML = k.ML, MI = require(path.join(ERP, 'model_inventory.js')), AP = require(path.join(ERP, 'ad_process.js'));
  var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:import-inventory' };
  function one(sql, p) { return k.q(sql, p || [])[0] || null; }
  function commit(fn, meta) { var trx = new ML.Trx(k.q, k.env(S)), r; try { r = fn(trx, ML) || { ok: true }; } catch (ex) { r = { ok: false, error: 'model threw: ' + (ex && ex.message) }; trx.say('§MODEL-ERR ' + (ex && ex.stack || ex)); } var ok = r.ok !== false, ops = ok ? trx.groupOps() : [], ids = []; if (ok && ops.length) ids = k.commit(S, ops, meta); return Object.assign({}, r, { ok: ok, ops: ops, ids: ids, log: trx.log }); }
  function declare(rows) { return commit(function (trx) { for (var i = 0; i < rows.length; i++) { var sv = ML.save(trx, 'i_inventory', null, ML.newPO(trx, 'i_inventory', rows[i])); if (!sv.ok) return { ok: false, error: sv.error }; } return { ok: true }; }); }
  var SHIPPED = [];
  function run(params, tag) { var r = commit(function (trx) { var r0 = AP.runInTrx(trx, 219, { params: params || {} }); return { ok: r0.ok, r: r0, error: r0.summary }; }, { ws: 'import_inventory', tag: tag }); (r.log || []).forEach(function (l) { if (/^§(IMPORT_INVENTORY|PROC-)/.test(l)) SHIPPED.push(l); });
    var logs = (r.r && r.r.logs) || []; return { res: r, summary: r.r && r.r.summary, errors: (logs.filter(function (x) { return x.msg === '@Errors@'; })[0] || {}).number, inv: (logs.filter(function (x) { return x.msg === '@M_Inventory_ID@: @Inserted@'; })[0] || {}).number, lines: (logs.filter(function (x) { return x.msg === '@M_InventoryLine_ID@: @Inserted@'; })[0] || {}).number }; }
  var onhand = function (p) { return Number((one('SELECT COALESCE(SUM(qtyonhand),0) AS s FROM m_storageonhand WHERE m_locator_id=101 AND m_product_id=?', [p]) || {}).s); };
  var irow = function (tag) { return k.q('SELECT * FROM i_inventory WHERE description=? ORDER BY i_inventory_id', [tag]); };
  var DT = 'Material Physical Inventory', LOC = 'Default HQ Locator', D1 = '2026-11-05 00:00:00';
  var row = function (tag, extra) { return Object.assign({ i_isimported: 'N', ad_org_id: 11, doctypename: DT, locatorvalue: LOC, movementdate: D1, description: tag }, extra || {}); };
  var P1 = one('SELECT m_product_id AS id, value FROM m_product WHERE m_product_id=137'), P2 = one('SELECT m_product_id AS id, value FROM m_product WHERE m_product_id=136'), P3 = one('SELECT m_product_id AS id, value FROM m_product WHERE m_product_id=134');
  db.run("UPDATE m_product SET upc='UPC-IINV-134' WHERE m_product_id=134");
  say('§IINV-FIXTURE mulch=' + J(P1) + ' on_hand=' + onhand(137) + ' fert=' + J(P2) + ' on_hand=' + onhand(136) + ' ptable on_hand=' + onhand(134));

  // ═══ P0 ═══
  check('P0', 'registered', 'AD_Process 219 resolves to org.compiere.process.ImportInventory (registered by erp/processes/ImportInventory.js)', !!AP.JAVA['org.compiere.process.ImportInventory'] && one('SELECT classname FROM ad_process WHERE ad_process_id=219').classname === 'org.compiere.process.ImportInventory', { reg: !!AP.JAVA['org.compiere.process.ImportInventory'] });
  guard('P0', 'x-of-n', 'X of N: every AD_Process_Para name of 219 is read by the port\'s prepare()', function () {
    var names = k.q("SELECT columnname AS c FROM ad_process_para WHERE ad_process_id=219 AND isactive='Y'").map(function (r) { return r.c; }), src = fs.readFileSync(path.join(ERP, 'processes/ImportInventory.js'), 'utf8');
    var used = names.filter(function (n) { return src.indexOf("name === '" + n + "'") >= 0; });
    check('P0', 'x-of-n', 'dictionary parameters ' + J(names) + ' X=' + used.length + ' of N=' + names.length, names.length === 12 && used.length === 12, { names: names, used: used }); });
  check('P0', 'html-sw', 'idempiere.html loads and sw.js precaches processes/ImportInventory.js', /processes\/ImportInventory\.js/.test(fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8')) && /processes\/ImportInventory\.js/.test(fs.readFileSync(path.join(ERP, 'sw.js'), 'utf8')), {});
  verdict('TABLE'); verdict('P0');
  var BASE = { AD_Client_ID: 11, AD_Org_ID: 11, DocAction: 'CO' };

  // ═══ LINE ═══
  guard('LINE', 'count', 'a counted row books count-book: QtyBook 50 / QtyCount 45 copied to ONE line of ONE header, completed; storage 50 -> 45; row Y with ids', function () {
    var b0 = onhand(137), d = declare([row('IINV-A1', { value: P1.value, qtycount: 45, qtybook: b0 })]);
    var r = run(BASE, 'A1'), ir = irow('IINV-A1')[0] || {}, ln = ir.m_inventoryline_id ? one('SELECT * FROM m_inventoryline WHERE m_inventoryline_id=?', [ir.m_inventoryline_id]) : null, hd = ir.m_inventory_id ? one('SELECT * FROM m_inventory WHERE m_inventory_id=?', [ir.m_inventory_id]) : null;
    check('LINE', 'declare', 'fixture: storage of Mulch at locator 101 is non-zero (' + b0 + ') and the row was declared', d.ok && b0 > 0, { ok: d.ok, err: d.error, b0: b0 });
    check('LINE', 'row-state', 'row is I_IsImported=Y, Processed=Y with M_Inventory_ID and M_InventoryLine_ID set (:436-440); answer logs 0 errors / 1 header / 1 line (:496-499)', r.res.ok && ir.i_isimported === 'Y' && ir.processed === 'Y' && !!ir.m_inventory_id && !!ir.m_inventoryline_id && Number(r.errors) === 0 && Number(r.inv) === 1 && Number(r.lines) === 1, { ok: r.res.ok, sum: r.summary, row: [ir.i_isimported, ir.processed, ir.m_inventory_id, ir.m_inventoryline_id], e: r.errors, i: r.inv, l: r.lines });
    check('LINE', 'line-fields', 'the line copies QtyBook=' + b0 + ' and QtyCount=45 from the row (:422-424), locator 101, product 137, InventoryType D (:429)', !!ln && Number(ln.qtybook) === b0 && Number(ln.qtycount) === 45 && Number(ln.m_locator_id) === 101 && Number(ln.m_product_id) === 137 && ln.inventorytype === 'D', ln);
    check('LINE', 'header', 'the header is Completed (DocAction CO :461), warehouse 103, doctype 144, description "I 103 <date>" (:396)', !!hd && hd.docstatus === 'CO' && Number(hd.m_warehouse_id) === 103 && Number(hd.c_doctype_id) === 144 && /^I 103 2026-11-05/.test(hd.description), hd);
    check('LINE', 'storage', 'M_StorageOnHand moved by count - book: ' + b0 + ' -> 45 (independent SQL oracle)', onhand(137) === 45, { now: onhand(137) });
  }); verdict('LINE');
  guard('UPC', 'upc', 'a row with only a UPC finds the product (:285-291) and imports', function () {
    var b0 = onhand(134); declare([row('IINV-U1', { upc: 'UPC-IINV-134', qtycount: b0 + 3, qtybook: b0 })]); var r = run(BASE, 'U1'), ir = irow('IINV-U1')[0] || {};
    check('UPC', 'upc', 'product 134 resolved from the UPC, row Y, storage +3 (' + b0 + ' -> ' + (b0 + 3) + ')', Number(ir.m_product_id) === 134 && ir.i_isimported === 'Y' && onhand(134) === b0 + 3, { row: [ir.m_product_id, ir.i_isimported], now: onhand(134), b0: b0, sum: r.summary }); }); verdict('UPC');
  guard('GROUP', 'one-header', 'two rows of the same warehouse, day and doctype share ONE header with TWO lines (:373-377)', function () {
    var a = onhand(136), c = onhand(137); declare([row('IINV-G', { value: P2.value, qtycount: a, qtybook: a }), row('IINV-G', { value: P1.value, qtycount: c, qtybook: c })]); var r = run(BASE, 'G'), rs = irow('IINV-G');
    check('GROUP', 'one-header', 'both rows Y, same M_Inventory_ID, 2 distinct lines; answer logs 1 header / 2 lines', rs.length === 2 && rs.every(function (x) { return x.i_isimported === 'Y'; }) && rs[0].m_inventory_id === rs[1].m_inventory_id && rs[0].m_inventoryline_id !== rs[1].m_inventoryline_id && Number(r.inv) === 1 && Number(r.lines) === 2, { rs: rs.map(function (x) { return [x.i_isimported, x.m_inventory_id, x.m_inventoryline_id]; }), inv: r.inv, lines: r.lines }); }); verdict('GROUP');
  // ═══ ERR ═══
  guard('ERR', 'errors', 'each failing row gets legacy\'s text and ends N; a good row of the same run is imported', function () {
    var good = onhand(137);
    declare([row('IINV-E-prod', { value: 'NO-SUCH-PRODUCT', qtycount: 1 }), row('IINV-E-loc', { value: P1.value, locatorvalue: 'NO-SUCH-LOC', qtycount: 1 }), row('IINV-E-qty', { value: P1.value }), row('IINV-E-excl', { value: P1.value, qtycount: 2, qtyinternaluse: 1 }),
      row('IINV-E-chg', { value: P1.value, qtyinternaluse: 1 }), row('IINV-E-dt', { value: P1.value, qtycount: 1, doctypename: 'No Such DocType' }), row('IINV-E-good', { value: P1.value, qtycount: good + 1, qtybook: good })]);
    var r = run(BASE, 'E'); var t = function (tag) { return irow(tag)[0] || {}; };
    var want = { 'IINV-E-prod': 'ERR=No Product,', 'IINV-E-loc': 'ERR=No Location,', 'IINV-E-qty': 'ERR=No Qty Count or Internal Use,', 'IINV-E-excl': 'ERR=Excluding quantities,', 'IINV-E-chg': 'ERR=Required charge,', 'IINV-E-dt': 'ERR=Invalid DocType,' };
    Object.keys(want).forEach(function (tag) { var x = t(tag); check('ERR', tag, tag + ' ends N with I_ErrorMsg containing "' + want[tag] + '", no header', x.i_isimported === 'N' && String(x.i_errormsg).indexOf(want[tag]) >= 0 && !x.m_inventory_id, [x.i_isimported, x.i_errormsg, x.m_inventory_id]); });
    check('ERR', 'good', 'the good row of the same run is imported (storage +1) and the answer reports 6 errors', t('IINV-E-good').i_isimported === 'Y' && onhand(137) === good + 1 && Number(r.errors) === 6, { row: t('IINV-E-good').i_isimported, now: onhand(137), good: good, errors: r.errors, sum: r.summary }); }); verdict('ERR');
  // ═══ NODA / RERUN / REFUSE ═══
  guard('NODA', 'draft', 'DocAction not sent: the header is Drafted and storage is unchanged', function () {
    var b = onhand(137); declare([row('IINV-N1', { value: P1.value, qtycount: b + 7, qtybook: b })]); var r = run({ AD_Client_ID: 11, AD_Org_ID: 11 }, 'N1'), ir = irow('IINV-N1')[0] || {}, hd = ir.m_inventory_id ? one('SELECT docstatus FROM m_inventory WHERE m_inventory_id=?', [ir.m_inventory_id]) : {};
    check('NODA', 'draft', 'row Y, header DR, storage still ' + b, ir.i_isimported === 'Y' && hd.docstatus === 'DR' && onhand(137) === b, { row: ir.i_isimported, hd: hd, now: onhand(137), sum: r.summary }); }); verdict('NODA');
  guard('RERUN', 'nothing-new', 'a second run makes nothing new', function () {
    var h0 = one('SELECT count(*) AS n FROM m_inventory').n, l0 = one('SELECT count(*) AS n FROM m_inventoryline').n, s0 = onhand(137), r = run(BASE, 'R');
    check('RERUN', 'nothing-new', 'headers, lines and storage unchanged; the answer logs 0 headers and 0 lines of new rows (the draft row N1 is Y)', one('SELECT count(*) AS n FROM m_inventory').n === h0 && one('SELECT count(*) AS n FROM m_inventoryline').n === l0 && onhand(137) === s0 && Number(r.inv) === 0 && Number(r.lines) === 0, { h: [h0, one('SELECT count(*) AS n FROM m_inventory').n], inv: r.inv }); }); verdict('RERUN');
  guard('REFUSE', 'costing', 'IsUpdateCosting=Y is refused by name, nothing imported', function () {
    declare([row('IINV-C1', { value: P1.value, qtycount: 1 })]); var r = run(Object.assign({ IsUpdateCosting: 'Y' }, BASE), 'C1');
    check('REFUSE', 'costing', 'the run fails with "not ported - named" and the row is untouched (N)', !r.res.ok && /not ported - named/.test(String(r.summary)) && (irow('IINV-C1')[0] || {}).i_isimported === 'N', { ok: r.res.ok, sum: r.summary }); }); verdict('REFUSE');
  var unk = SEEN.filter(function (l) { return /PROC-UNKNOWN-PARA ImportInventory/.test(l); });
  check('P0', 'no-unknown-para', 'no run printed §PROC-UNKNOWN-PARA', unk.length === 0, unk);
  SHIPPED.slice(0, 12).forEach(function (l) { say('  ' + l.slice(0, 220)); });
  say('§IINV-ALL judged=' + ALL.judged + ' failed=' + ALL.failed + ' verdict=' + (!ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS'));
  process.exit(ALL.failed ? 1 : 0);
})().catch(function (e) { _log('§IINV-CRASH ' + (e && e.stack || e)); process.exit(2); });
