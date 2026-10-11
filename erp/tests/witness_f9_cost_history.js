#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-F9-COSTHISTORY (bim-compiler prompts/SQLiteIDEMPIERE.md §78 / §F9.4; CARDINAL RULE: the shipped ERP must cost a back-dated
//   shipment exactly like legacy iDempiere). READ THE LOG after every run: every verdict is a §-line, the exit code is not the evidence.
// THE ISSUE it proves/disproves: before this port erp/doc_poster.js costed a shipment from the CURRENT m_cost row; legacy (MCost.getCost :290-300
//   via MCostHistory.get by DateAcct) books it at the cost-history price of the shipment's day. Drives the shipped erp/doc_poster.js with a
//   better-sqlite3-style facade over sql.js on a scratch db in BOTH history shapes: S = the shipped ad_seed shape (m_costhistory has NO c_acctschema_id,
//   the schema comes from its m_costdetail), H = the handover shape (c_acctschema_id on the row; applyCostUpdate appends).
//   F9-HISTORY-PRICE   back-dated sale costed at the history price (255), not the current price (289)         [S and H]
//   F9-APPEND          applyCostUpdate appends exactly one history row; the next date lookup sees it; the older date is unchanged   [H]
//   F9-REFUSAL         back-dated sale of more than the history qty -> AverageCostingNegativeQty (history qty, not m_cost qty)      [S and H]
//   F9-NEG-CONTROL     history price +0.01 -> the books MUST move (256); no history rows -> falls back to the m_cost price (289)
//   F9-NOT-VACUOUS     the history price differs from the m_cost price and the shipment is judged, else INCONCLUSIVE
'use strict';
var path = require('path');
var DP = require(path.join(__dirname, '..', 'doc_poster.js'));
var fs = require('fs'), initSqlJs = null, sqlWhy = '';
try { initSqlJs = require('sql.js'); } catch (e1) {        // repo dependency first, then the vendored build the browser ships (erp/sqljs) — no machine-specific path
  try { var vend = require(path.join(__dirname, '..', 'sqljs', 'sql-wasm.js')), wasm = fs.readFileSync(path.join(__dirname, '..', 'sqljs', 'sql-wasm.wasm')); initSqlJs = function () { return vend({ wasmBinary: wasm }); }; }
  catch (e2) { sqlWhy = 'sql.js not installed (' + e1.message.split('\n')[0] + ') and vendored erp/sqljs not loadable (' + e2.message.split('\n')[0] + ')'; }
}
if (!initSqlJs) { console.log('§F9_VERDICT INCONCLUSIVE reason="' + sqlWhy + '"'); process.exit(3); }
var results = [], log = function (s) { console.log(s); };

function facade(sdb) {
  function bind(st, p) { if (p == null) return; st.bind(Array.isArray(p) ? p : [p]); }
  return { prepare: function (sql) { return {
    get: function (p) { var s = sdb.prepare(sql); try { bind(s, p); return s.step() ? s.getAsObject() : undefined; } finally { s.free(); } },
    all: function (p) { var s = sdb.prepare(sql), r = []; try { bind(s, p); while (s.step()) r.push(s.getAsObject()); return r; } finally { s.free(); } },
    run: function (p) { var s = sdb.prepare(sql); try { bind(s, p); s.step(); } finally { s.free(); } } }; }, exec: function (q) { sdb.run(q); } };
}
var R = { resolve: function (db, tok) { var t = tok.replace(/[{}]/g, '').split('.')[1]; return { acct: 1, element: { id: t === 'Cogs' ? 5000 : 1200, value: t, name: t }, token: tok }; } };

function build(SQL, shape, o) {
  o = o || {};
  var db = facade(new SQL.Database()), bd = o.bd != null;
  var q = [
    "CREATE TABLE c_acctschema(c_acctschema_id,m_costtype_id,costingmethod,c_currency_id,isactive" + (bd ? ",backdateday" : "") + ")",
    "INSERT INTO c_acctschema VALUES(1,1,'A',100,'Y'" + (bd ? "," + o.bd : "") + ")",
    "CREATE TABLE c_currency(c_currency_id,costingprecision)", "INSERT INTO c_currency VALUES(100,4)",
    "CREATE TABLE m_costelement(m_costelement_id,costingmethod,costelementtype,isactive)", "INSERT INTO m_costelement VALUES(1,'A','M','Y')",
    "CREATE TABLE m_product(m_product_id,m_product_category_id,isstocked)", "INSERT INTO m_product VALUES(7,1,'Y')",
    "CREATE TABLE m_cost(m_product_id,c_acctschema_id,m_costtype_id,m_costelement_id,currentcostprice,currentqty" + (o.noCum ? "" : ",cumulatedqty,cumulatedamt") + ")",
    "INSERT INTO m_cost VALUES(7,1,1,1,2.89,32" + (o.noCum ? "" : ",32,92.5") + ")",
    "CREATE TABLE m_inout(m_inout_id,issotrx,movementtype,dateacct)", "CREATE TABLE m_inoutline(m_inoutline_id,m_inout_id,m_product_id,movementqty)",
    "CREATE TABLE m_costdetail(m_costdetail_id,c_acctschema_id,m_product_id,dateacct,processed,ad_client_id,ad_org_id)",
    "INSERT INTO m_costdetail(m_costdetail_id,c_acctschema_id) VALUES(11,1)", "INSERT INTO m_costdetail(m_costdetail_id,c_acctschema_id) VALUES(12,1)"];
  if (shape === 'H') q.push("CREATE TABLE m_costhistory(m_costhistory_id,m_costdetail_id,c_acctschema_id,m_product_id,m_costtype_id,m_costelement_id,m_attributesetinstance_id,ad_org_id,dateacct,oldqty,newqty,oldcostprice,newcostprice,oldcamt,newcamt,oldcqty,newcqty)",
    "INSERT INTO m_costhistory VALUES(1,11,1,7,1,1,0,0,'2026-09-01 00:00:00',0,30,0,2.55,0,76.5,0,30)");
  else q.push("CREATE TABLE m_costhistory(m_costhistory_id,m_costdetail_id,m_product_id,m_costtype_id,m_costelement_id,m_attributesetinstance_id,ad_org_id,ad_client_id,dateacct,oldqty,newqty,oldcostprice,newcostprice,oldcamt,newcamt,oldcqty,newcqty)",
    "INSERT INTO m_costhistory VALUES(1,11,7,1,1,0,0,0,'2026-09-01 00:00:00',0,30,0,2.55,0,76.5,0,30)");
  q.forEach(function (x) { db.exec(x); });
  return db;
}
function ship(db, id, date, qty) { db.prepare('INSERT INTO m_inout VALUES(?,?,?,?)').run([id, 'Y', 'C-', date + ' 00:00:00']); db.prepare('INSERT INTO m_inoutline VALUES(?,?,?,?)').run([id * 10, id, 7, qty]); }
function derive(db, id) { var r = DP.deriveInOut(db, R, id, 1, { today: '2026-10-12' }); return { dr: r && r.by[5000] ? r.by[5000].dr : null, absent: r ? r.absent : ['null'] }; }
function chk(id, checks) {
  var bad = checks.filter(function (c) { return !c.ok; });
  checks.forEach(function (c) { log('  §F9-CHECK case=' + id + ' key=' + c.key + ' ' + (c.ok ? 'OK' : 'FAIL') + ' rule="' + c.rule + '" got=' + JSON.stringify(c.got) + ' want=' + JSON.stringify(c.want)); });
  var v = !checks.length ? 'INCONCLUSIVE' : bad.length ? 'FAIL' : 'PASS'; log('§F9 case=' + id + ' verdict=' + v + ' judged=' + checks.length + ' failed=' + bad.length); results.push(v);
}
function eq(key, rule, got, want) { return { key: key, rule: rule, ok: JSON.stringify(got) === JSON.stringify(want), got: got, want: want }; }

(async function () {
  var SQL = await initSqlJs();
  ['S', 'H'].forEach(function (sh) {
    var db = build(SQL, sh);
    var mc = db.prepare('SELECT currentcostprice p FROM m_cost WHERE m_product_id=7').get().p, h = DP.costHistoryAt(db, 7, 1, 1, 1, '2026-09-15');
    chk('F9-NOT-VACUOUS-' + sh, [eq('history_found', 'MCostHistory.get by DateAcct finds a row', !!h, true), eq('history_differs_from_m_cost', 'history price != m_cost price, else the test cannot tell them apart', h && Number(h.newcostprice) !== Number(mc), true)]);
    ship(db, 1, '2026-09-15', 1);
    var r = derive(db, 1);
    chk('F9-HISTORY-PRICE-' + sh, [eq('shipment_cogs_dr_cents', 'MCost.getCost :290-300 — history NewCostPrice 2.55 x 1 = 255, not current 2.89 (289)', r.dr, 255), eq('no_absent', 'posted, not refused', r.absent, [])]);
    ship(db, 2, '2026-09-15', 31);
    var q = derive(db, 2);
    chk('F9-REFUSAL-' + sh, [eq('refused_on_history_qty', 'MCost.setCurrentQty :1919-1930 tests the HISTORY qty 30 (m_cost qty 32 would allow 31)', /AverageCostingNegativeQty.*Current Qty=30/.test(q.absent[0] || ''), true)]);
    ship(db, 3, '2026-10-12', 1);
    var t = derive(db, 3);
    chk('F9-TODAY-' + sh, [eq('today_dated_uses_history_le_date', 'a today-dated sale still reads the latest history <= its date (2.55 here: no later history row) ', t.dr, 255)]);
    // negative control: history price +0.01 must move the books
    db.exec('UPDATE m_costhistory SET newcostprice = newcostprice + 0.01');
    var n = derive(db, 1);
    chk('F9-NEG-CONTROL-' + sh, [eq('history_price_plus_1c_moves_books', 'books follow the history price (256)', n.dr, 256)]);
    db.exec('DELETE FROM m_costhistory'); var f = derive(db, 1);
    chk('F9-NO-HISTORY-' + sh, [eq('fallback_m_cost', 'no history rows -> the m_cost price (289)', f.dr, 289)]);
    if (sh === 'H') {   // F9-APPEND on a fresh H db
      var d2 = build(SQL, 'H'), cnt = function () { return d2.prepare('SELECT COUNT(*) c FROM m_costhistory').get().c; }, c0 = cnt();
      DP.applyCostUpdate(d2, { m_product_id: 7, c_acctschema_id: 1, m_costtype_id: 1, m_costelement_id: 1, set: { currentqty: 32, currentcostprice: 2.89, cumulatedqty: 32, cumulatedamt: 92.5 },
        history: { oldqty: 30, newqty: 32, oldcostprice: 2.55, newcostprice: 2.89, oldcamt: 76.5, newcamt: 92.5, oldcqty: 30, newcqty: 32 } }, '2026-10-01');
      var a = DP.costHistoryAt(d2, 7, 1, 1, 1, '2026-10-02'), o = DP.costHistoryAt(d2, 7, 1, 1, 1, '2026-09-15');
      chk('F9-APPEND', [eq('one_row_appended', 'applyCostUpdate appends exactly one m_costhistory row (MCostDetail.process -> new MCostHistory)', cnt() - c0, 1),
        eq('later_date_sees_it', 'lookup at 2026-10-02 returns the appended price', a && Number(a.newcostprice), 2.89), eq('older_date_unchanged', 'lookup at 2026-09-15 still 2.55', o && Number(o.newcostprice), 2.55)]);
    }
  });

  // ── review findings (PR #1977 review 1) ────────────────────────────────────────────────────────────────────────────────────────────
  var Sx = build(SQL, 'S'), t, ups;
  // R1: a db with m_cost.currentqty but NO cumulated columns (pre-§78 schema) must not throw 'no such column'
  var O = build(SQL, 'S', { noCum: true }); ship(O, 1, '2026-09-15', 1);
  var thrown = null, up0 = null; try { up0 = DP.costQtyUpdates(O, 1); derive(O, 1); } catch (e) { thrown = e.message; }
  chk('F9-R1-OLD-SCHEMA', [eq('no_throw', 'currentqty-only m_cost reads without cumulatedqty/cumulatedamt', thrown, null), eq('update_produced', 'an update is still produced', !!(up0 && up0.length), true)]);
  // R2: legacy pins the ABSOLUTE state: back-dated shipment of 1 on history 2.55@30 leaves m_cost 2.55@29 (§78 measured legacy `2.55@29/76.5`, MCostDetail.process :1424-1441)
  ship(Sx, 1, '2026-09-15', 1); ups = DP.costQtyUpdates(Sx, 1); var u1 = ups[0];
  chk('F9-R2-ABSOLUTE-STATE', [eq('set_qty_price', 'u.set = history-based state 29 @ 2.55 (legacy measured 2.55@29, not the live 32@2.89)', u1 && u1.set && [u1.set.currentqty, u1.set.currentcostprice], [29, 2.55]), eq('base_source', 'baseSource history', u1 && u1.baseSource, 'history')]);
  // R3: the update survives serialisation: JSON / structuredClone / spread keep set+history, and a bare update with neither set nor a numeric delta is REFUSED, not applied as NULL
  var cl = JSON.parse(JSON.stringify(u1)), d3 = build(SQL, 'S'), d4 = build(SQL, 'S');
  DP.applyCostUpdate(d3, u1, '2026-09-15'); DP.applyCostUpdate(d4, cl, '2026-09-15');
  var mq = function (d) { var r = d.prepare('SELECT currentqty q, currentcostprice p FROM m_cost WHERE m_product_id=7').get(); return [r.q, r.p]; };
  var refused = null; try { DP.applyCostUpdate(build(SQL, 'S'), { m_product_id: 7, c_acctschema_id: 1, m_costtype_id: 1, m_costelement_id: 1 }, '2026-09-15'); } catch (e) { refused = /delta|set/.test(e.message); }
  chk('F9-R3-SERIALISED-UPDATE', [eq('json_clone_applies_same', 'JSON round-trip of an update applies identically', mq(d4), mq(d3)), eq('state_is_29_2.55', 'and equals the absolute state', mq(d4), [29, 2.55]), eq('bare_update_refused', 'no set and no delta -> throws (never COALESCE(qty)+NULL)', refused, true)]);
  // R4: the shipped (S) shape also gets a history row: a cost detail (schema carrier) + the history row; the next date sees it; the older date does not move
  var c0 = function (d, t) { return d.prepare('SELECT COUNT(*) c FROM ' + t).get().c; }, n0 = c0(d3, 'm_costhistory'), k0 = c0(d3, 'm_costdetail');
  var a4 = DP.costHistoryAt(d3, 7, 1, 1, 1, '2026-09-20'), o4 = DP.costHistoryAt(d3, 7, 1, 1, 1, '2026-09-01');
  chk('F9-R4-APPEND-SHIPPED-SHAPE', [eq('history_row_appended', 'S shape: one m_costhistory row appended (hist 1 + 1)', n0, 2), eq('detail_row_appended', 'with its m_costdetail carrying the schema', k0, 3),
    eq('later_date_sees_it', 'lookup 2026-09-20 returns the appended new price 2.55 / qty 29', a4 && [Number(a4.newcostprice), a4.newqty], [2.55, 29]), eq('older_unchanged', 'lookup 2026-09-01 unchanged', o4 && Number(o4.hid), 1)]);
  // R5: other cost readers use the document's DateAcct too (DocLine.getProductCosts DocLine.java:833-838 passes getDateAcct() for EVERY Doc; MCost.getCost :290-300)
  var Mv = build(SQL, 'S');
  Mv.exec("CREATE TABLE m_movement(m_movement_id,dateacct);CREATE TABLE m_movementline(m_movementline_id,m_movement_id,m_product_id,movementqty,m_locator_id,m_locatorto_id);CREATE TABLE m_locator(m_locator_id,m_warehouse_id);CREATE TABLE m_warehouse(m_warehouse_id,ad_org_id);" +
    "INSERT INTO m_warehouse VALUES(1,11);INSERT INTO m_locator VALUES(1,1);INSERT INTO m_locator VALUES(2,1);INSERT INTO m_movement VALUES(1,'2026-09-15 00:00:00');INSERT INTO m_movementline VALUES(1,1,7,1,1,2);");
  var mvr = DP.deriveMovement(Mv, R, 1, 1), mvd = mvr && mvr.by[1200] ? mvr.by[1200].dr : null;
  chk('F9-R5-MOVEMENT-AT-DATE', [eq('movement_cost_at_history_price', 'Doc_Movement line.getProductCosts(dateAcct): 2.55 x 1 = 255 (not 289)', mvd, 255)]);
  chk('F9-R5-COSTAT-DATE', [eq('costAt_with_date', 'costAt(db,pid,qty,schema,dateAcct) = history price x qty (2.5500) ; without date = m_cost (2.8900)', [DP.costAt(Mv, 7, 1, 1, '2026-09-15'), DP.costAt(Mv, 7, 1, 1)], ['2.5500', '2.8900'])]);
  // R6: BackDateDay > 0: refuse INSIDE the window (DocManager.java:660-672 keeps details with DateAcct >= today - BackDateDay), accept outside; today from the host/ctx, wall clock only when absent (MAcctSchema.java:852)
  var B = build(SQL, 'S', { bd: 5 }); ship(B, 1, '2026-10-10', 1); ship(B, 2, '2026-09-15', 1); ship(B, 3, '2026-10-12', 1);
  var gi = DP.deriveInOut(B, R, 1, 1, { today: '2026-10-12' }), go = DP.deriveInOut(B, R, 2, 1, { today: '2026-10-12' }), gt = DP.deriveInOut(B, R, 3, 1, { today: '2026-10-12' });
  var B0 = build(SQL, 'S', { bd: 0 }); ship(B0, 1, '2026-10-10', 1); var g0 = DP.deriveInOut(B0, R, 1, 1, { today: '2026-10-12' });
  chk('F9-R6-BACKDATEDAY', [eq('inside_window_refused', 'dated 2 days back, BackDateDay=5 -> named absent (F9.2)', /BackDateDay=5/.test((gi.absent || [])[0] || ''), true), eq('outside_window_costed', 'dated 27 days back -> costed from history (255)', go.by[5000] && go.by[5000].dr, 255),
    eq('today_not_gap', 'a today-dated document is not back-dated', (gt.absent || []).filter(function (x) { return /BackDateDay/.test(x); }), []), eq('bd0_never_gap', 'BackDateDay 0 never gaps', (g0.absent || []).filter(function (x) { return /BackDateDay/.test(x); }), [])]);
  // R7: _hasCol is cached for PRESENT columns only (a column added later is still found)
  var sp = build(SQL, 'S'), pragmas = 0, rp = sp.prepare; sp.prepare = function (q) { if (/^PRAGMA/.test(q)) pragmas++; return rp.call(sp, q); };
  ship(sp, 1, '2026-09-15', 1); derive(sp, 1); var p1 = pragmas; derive(sp, 1); var p2 = pragmas - p1;
  sp.exec('ALTER TABLE m_inout ADD COLUMN zz'); DP.resetSchemaCache && DP.resetSchemaCache(sp);
  chk('F9-R7-HASCOL-CACHE', [eq('second_derive_probes_less', 'second derive issues fewer PRAGMA probes than the first (cached positives)', p2 < p1, true)]);
  // R8: exact decimals: a 17-digit cumulated/current qty survives _costBase as the stored text (the MatchPO path used the raw value; Number() would round it)
  var P = build(SQL, 'S'); P.exec("UPDATE m_cost SET currentqty='12.34567890123456789', cumulatedqty='12.34567890123456789'");
  var cb = DP.costBase && DP.costBase(P, 7, 1, 1, 1, 'A', null);
  chk('F9-R8-EXACT-DECIMALS', [eq('qty_raw', 'costBase.qty keeps full precision', cb && String(cb.qty), '12.34567890123456789'), eq('cumqty_raw', 'costBase.cumqty keeps full precision', cb && String(cb.cumqty), '12.34567890123456789')]);
  var bad = results.filter(function (v) { return v !== 'PASS'; });
  log('§F9_VERDICT ' + (results.length ? (bad.length ? (bad.indexOf('FAIL') >= 0 ? 'FAIL' : 'INCONCLUSIVE') : 'PASS') : 'INCONCLUSIVE') + ' cases=' + results.length + ' notpass=' + bad.length);
  process.exit(bad.length ? 1 : 0);
})().catch(function (e) { console.log('§F9_VERDICT FAIL ' + e.stack); process.exit(2); });
