#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PROJECT-ISSUE-COST (bim-ootb prompts/CAPEX_DASHBOARD.md §INTERNAL-UAT IU3; bim-compiler SQLiteIDEMPIERE.md §UAT-LEDGER row 12; TWIN CARDINAL RULE: the Kernel does what legacy iDempiere does).
//   READ THE LOG after every run: every verdict is a §PICOST line, the exit code is not the evidence. INCONCLUSIVE when nothing was judged or the fixture cannot tell the two methods apart.
//   PICOST_BREAK=1 puts the old behaviour back (the costing method argument forced to null, so the product category's method decides): the witness must FAIL.
// THE ISSUE: MProjectIssue.updateBalanceAmt (MProjectIssue.java:577) costs an issue with MCost.getCost(..., as.getCostingMethod(), ...): the ACCOUNTING SCHEMA's method. The Kernel passed null, and MCost.getCost
//   (MCost.java:136-138) then takes product.getCostingMethod(as) = the product CATEGORY's method first. So whenever category and schema disagree (the UAT: GardenWorld's categories cost by Average PO, the primary schema is
//   switched to Standard) the project balance was booked at a different cost than legacy books: Rake Bamboo 7.65 became about 63.70 (ledger row 12).
// Expected values are INDEPENDENT: read from m_cost by plain SQL for the cost element whose CostingMethod equals the schema's, never from the code under test.
//   S1 schema Standard, category Average PO: the issue is costed Standard · S2 schema Average PO, category Standard: costed Average PO (the reverse, so the fix is not "always Standard") ·
//   S3 schema Standard, category without its own method: Standard (schema fallback unchanged) · S4 both Average PO: Average PO (unchanged).
// Command: node erp/tests/witness_project_issue_cost_method.js        (PICOST_ERP=<erp dir> runs against another tree)
'use strict';
var fs = require('fs'), path = require('path');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.PICOST_ERP || path.join(__dirname, '..'), BREAK = process.env.PICOST_BREAK === '1';
var SQLJS_DIR = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';
if (!process.env.SQLJS) process.env.SQLJS = SQLJS_DIR;
var initSqlJs = require(SQLJS_DIR);
var _log = console.log;
console.log = function () { };
function say(s) { _log(s); }
var judged = 0, fails = 0, inc = 0;
function check(key, rule, ok, info) { judged++; if (!ok) fails++; say('  §PICOST-CHECK ' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + JSON.stringify(info))); }
function inconclusive(key, why) { inc++; say('  §PICOST-CHECK ' + key + ' INCONCLUSIVE ' + why); }
var near = function (a, b) { return Math.abs(Number(a) - Number(b)) < 1e-6; };

(async function main() {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIR, 'dist', f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); } catch (e) {} });
  var K = require(path.join(ERP, 'ws_kernel.js')), k = K.build(db), ML = k.ML;
  require(path.join(ERP, 'model_projectissue.js'));
  if (BREAK) { var MC = require(path.join(ERP, 'model_cost.js')), orig = MC.getProductCosts; MC.getProductCosts = function () { var a = Array.prototype.slice.call(arguments); a[5] = null; return orig.apply(this, a); }; }   // the old call: method null
  var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:project-issue-cost' };
  function q(sql, p) { return k.q(sql, p || []); }
  function one(sql, p) { return q(sql, p)[0] || null; }
  function commit(fn) {
    var trx = new ML.Trx(k.q, k.env(S)), r;
    try { r = fn(trx, ML) || { ok: true }; } catch (ex) { r = { ok: false, error: 'model threw: ' + (ex && ex.message) }; }
    var ok = r.ok !== false, ops = ok ? trx.groupOps() : []; if (ok && ops.length) k.commit(S, ops, { ws: 'project_issue_cost' });
    return Object.assign({}, r, { ok: ok });
  }
  function lastId(t) { return one('SELECT MAX(' + t + '_id) AS m FROM ' + t).m; }
  function mk(table, f) {
    var r = commit(function (trx) { var sv = ML.save(trx, table, null, ML.newPO(trx, table, Object.assign({ ad_client_id: 11, ad_org_id: 11 }, f))); return { ok: sv.ok, error: sv.error }; });
    if (!r.ok) throw new Error('fixture ' + table + ' refused: ' + r.error);
    return lastId(table);
  }
  var PROD = 139, LOC = 101, AS = 101, QTY = 3, N = 0, STD = 'S', AVG = 'A';
  var cat = one('SELECT m_product_category_id AS c FROM m_product WHERE m_product_id=?', [PROD]).c;
  // fixtures (data only, set by SQL like the UAT's Pack In does on legacy): Average PO cost row of the product (63.70, as the UAT measured after buying), schema + category methods set per scenario
  var avgCe = one("SELECT m_costelement_id AS id FROM m_costelement WHERE ad_client_id=11 AND costelementtype='M' AND costingmethod='A'").id, stdCe = one("SELECT m_costelement_id AS id FROM m_costelement WHERE ad_client_id=11 AND costelementtype='M' AND costingmethod='S'").id;
  db.run("DELETE FROM m_cost WHERE m_product_id=? AND c_acctschema_id=? AND m_costelement_id=?", [PROD, AS, avgCe]);
  db.run("INSERT INTO m_cost (ad_client_id,ad_org_id,m_product_id,m_costtype_id,c_acctschema_id,m_costelement_id,m_attributesetinstance_id,isactive,currentcostprice,currentqty,cumulatedamt,cumulatedqty,futurecostprice,percent,iscostfrozen) VALUES (11,0,?,100,?,?,0,'Y',63.70,15,955.5,15,0,0,'N')", [PROD, AS, avgCe]);
  db.run('DELETE FROM m_costhistory WHERE m_product_id=? AND m_costelement_id=?', [PROD, avgCe]);   // the seed's Average PO history rows carry the product's old price; with them MCost.getCost would take the history price (MCost.java:166-176), not the cost row: no history = the cost row decides
  function price(ce) { return Number(one('SELECT currentcostprice AS p FROM m_cost WHERE m_product_id=? AND c_acctschema_id=? AND ad_org_id=0 AND m_attributesetinstance_id=0 AND m_costelement_id=?', [PROD, AS, ce]).p); }
  var pStd = price(stdCe), pAvg = price(avgCe);
  var hist = Number(one('SELECT count(*) AS n FROM m_costhistory WHERE m_product_id=? AND m_costelement_id=?', [PROD, avgCe]).n);
  say('§PICOST-FACTS product=' + PROD + ' category=' + cat + ' standardCe=' + stdCe + ' price=' + pStd + ' averagePoCe=' + avgCe + ' price=' + pAvg + ' averagePoHistoryRows(after the fixture)=' + hist + ' break=' + (BREAK ? 1 : 0));
  if (!(pStd > 0 && pAvg > 0 && !near(pStd, pAvg))) inconclusive('population', 'the two methods do not give two different positive costs (' + pStd + ' vs ' + pAvg + '): a pass would mean nothing');
  function setMethods(schema, category) {
    db.run('UPDATE c_acctschema SET costingmethod=? WHERE c_acctschema_id=?', [schema, AS]);
    db.run('UPDATE m_product_category_acct SET costingmethod=? WHERE m_product_category_id=? AND c_acctschema_id=?', [category, cat, AS]);
  }
  function scenario(key, schema, category, expectUnit, other, rule) {
    setMethods(schema, category);
    var p = mk('c_project', { value: 'IC' + (++N) + '-' + process.pid, name: 'IC project ' + N, c_currency_id: 100, m_pricelist_version_id: 104, m_warehouse_id: 103, c_bpartner_id: 117, c_bpartner_location_id: 112, ad_user_id: 104, c_paymentterm_id: 105, salesrep_id: 101, issummary: 'N', projectcategory: 'W' });
    var b0 = Number(one('SELECT projectbalanceamt AS b FROM c_project WHERE c_project_id=?', [p]).b || 0);
    var id = mk('c_projectissue', { c_project_id: p, m_locator_id: LOC, m_product_id: PROD, movementqty: QTY, movementdate: k.env(S).date });
    var r = commit(function (trx) { var x = ML.processIt(trx, 'c_projectissue', id, 'CO'); return { ok: x.ok, status: x.status, msg: x.msg }; });
    var d = Number(one('SELECT projectbalanceamt AS b FROM c_project WHERE c_project_id=?', [p]).b || 0) - b0, st = one('SELECT docstatus AS s FROM c_projectissue WHERE c_projectissue_id=?', [id]).s;
    say('§PICOST-RUN ' + key + ' schema=' + schema + ' category=' + category + ' qty=' + QTY + ' balanceDelta=' + d.toFixed(4) + ' want=' + (QTY * expectUnit).toFixed(4) + ' (the other method would give ' + (QTY * other).toFixed(4) + ') docstatus=' + st);
    check(key, rule + ': balance +' + d.toFixed(4) + ' == ' + QTY + ' x ' + expectUnit + ' = ' + (QTY * expectUnit).toFixed(4) + ', not the other method\'s ' + (QTY * other).toFixed(4), r.ok && st === 'CO' && near(d, QTY * expectUnit) && !near(d, QTY * other), { ok: r.ok, msg: r.msg, d: d });
  }
  scenario('S1', STD, AVG, pStd, pAvg, 'schema Standard, category Average PO: the SCHEMA decides (MProjectIssue.java:577 as.getCostingMethod())');
  scenario('S2', AVG, STD, pAvg, pStd, 'schema Average PO, category Standard: the schema decides, the reverse of S1');
  scenario('S3', STD, null, pStd, pAvg, 'schema Standard, category without a method of its own');
  scenario('S4', AVG, AVG, pAvg, pStd, 'schema and category both Average PO');
  var v = fails ? 'FAIL' : (judged && !inc) ? 'PASS' : 'INCONCLUSIVE';
  say('§PICOST-RESULT verdict=' + v + ' judged=' + judged + ' failed=' + fails + ' inconclusive=' + inc + (BREAK ? ' (BREAK: FAIL expected)' : ''));
  process.exit(v === 'PASS' ? 0 : 1);
})().catch(function (e) { _log('§PICOST-ERROR ' + (e && e.stack || e)); process.exit(2); });
