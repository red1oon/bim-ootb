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
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js'); }
var results = [], log = function (s) { console.log(s); };

function facade(sdb) {
  function bind(st, p) { if (p == null) return; st.bind(Array.isArray(p) ? p : [p]); }
  return { prepare: function (sql) { return {
    get: function (p) { var s = sdb.prepare(sql); try { bind(s, p); return s.step() ? s.getAsObject() : undefined; } finally { s.free(); } },
    all: function (p) { var s = sdb.prepare(sql), r = []; try { bind(s, p); while (s.step()) r.push(s.getAsObject()); return r; } finally { s.free(); } },
    run: function (p) { var s = sdb.prepare(sql); try { bind(s, p); s.step(); } finally { s.free(); } } }; }, exec: function (q) { sdb.run(q); } };
}
var R = { resolve: function (db, tok) { var t = tok.replace(/[{}]/g, '').split('.')[1]; return { acct: 1, element: { id: t === 'Cogs' ? 5000 : 1200, value: t, name: t }, token: tok }; } };

function build(SQL, shape) {
  var db = facade(new SQL.Database());
  db.exec("CREATE TABLE c_acctschema(c_acctschema_id,m_costtype_id,costingmethod,c_currency_id,isactive);INSERT INTO c_acctschema VALUES(1,1,'A',100,'Y');" +
    "CREATE TABLE c_currency(c_currency_id,costingprecision);INSERT INTO c_currency VALUES(100,4);" +
    "CREATE TABLE m_costelement(m_costelement_id,costingmethod,costelementtype,isactive);INSERT INTO m_costelement VALUES(1,'A','M','Y');" +
    "CREATE TABLE m_product(m_product_id,m_product_category_id,isstocked);INSERT INTO m_product VALUES(7,1,'Y');" +
    "CREATE TABLE m_cost(m_product_id,c_acctschema_id,m_costtype_id,m_costelement_id,currentcostprice,currentqty,cumulatedqty,cumulatedamt);INSERT INTO m_cost VALUES(7,1,1,1,2.89,32,32,92.5);" +
    "CREATE TABLE m_inout(m_inout_id,issotrx,movementtype,dateacct);CREATE TABLE m_inoutline(m_inoutline_id,m_inout_id,m_product_id,movementqty);" +
    "CREATE TABLE m_costdetail(m_costdetail_id,c_acctschema_id);INSERT INTO m_costdetail VALUES(11,1);INSERT INTO m_costdetail VALUES(12,1);" +
    (shape === 'H'
      ? "CREATE TABLE m_costhistory(m_costhistory_id,m_costdetail_id,c_acctschema_id,m_product_id,m_costtype_id,m_costelement_id,m_attributesetinstance_id,ad_org_id,dateacct,oldqty,newqty,oldcostprice,newcostprice,oldcamt,newcamt,oldcqty,newcqty);" +
        "INSERT INTO m_costhistory VALUES(1,11,1,7,1,1,0,0,'2026-09-01 00:00:00',0,30,0,2.55,0,76.5,0,30);"
      : "CREATE TABLE m_costhistory(m_costhistory_id,m_costdetail_id,m_product_id,m_costtype_id,m_costelement_id,m_attributesetinstance_id,ad_org_id,dateacct,oldqty,newqty,oldcostprice,newcostprice,oldcamt,newcamt,oldcqty,newcqty);" +
        "INSERT INTO m_costhistory VALUES(1,11,7,1,1,0,0,'2026-09-01 00:00:00',0,30,0,2.55,0,76.5,0,30);"));
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
  var bad = results.filter(function (v) { return v !== 'PASS'; });
  log('§F9_VERDICT ' + (results.length ? (bad.length ? (bad.indexOf('FAIL') >= 0 ? 'FAIL' : 'INCONCLUSIVE') : 'PASS') : 'INCONCLUSIVE') + ' cases=' + results.length + ' notpass=' + bad.length);
  process.exit(bad.length ? 1 : 0);
})().catch(function (e) { console.log('§F9_VERDICT FAIL ' + e.stack); process.exit(2); });
