#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PROJECT-ISSUE-POST (bim-ootb prompts/CAPEX_DASHBOARD.md §INTERNAL-UAT IU5; bim-compiler prompts/SQLiteIDEMPIERE.md §INTERNAL-UAT IU5; TWIN CARDINAL RULE: the Kernel books what legacy iDempiere books).
//   READ THE LOG after every run: every verdict is a §PIPOST line, the exit code is not the evidence. INCONCLUSIVE, never PASS, when a scenario was not judged.
//   PIPOST_BREAK=1 removes the Doc_ProjectIssue class from model_post (the state before IU5): the witness must FAIL.
// THE ISSUE: completing a C_ProjectIssue on the Kernel wrote NO Fact_Acct (model_post.post had no Doc class for c_projectissue: "§MODEL-POST ... posted=N reason=\"no Doc class ported\""), while legacy posts it on
//   completion (DocumentEngine.processIt :349-364 -> postIt :571-585 -> Doc_ProjectIssue.createFacts :125-199): DR Project WIP (Asset for category A) / CR product Asset, per accounting schema, + MCostDetail.createProjectIssue.
// Expected values are INDEPENDENT of the code under test: accounts read by SQL from C_Project_Acct / M_Product_Acct -> C_ValidCombination.Account_ID; amount = qty x M_Cost.CurrentCostPrice of the material element of the
//   method MCost picks (category method, else the schema's), rounded HALF_UP to the schema currency (decimal arithmetic on strings). TWIN: when erp/tests/fixtures/iu5_legacy_pji.json exists (recorded once on legacy :8108),
//   the Kernel's Fact_Acct and M_CostDetail rows of P1 and P2 are compared to legacy's column by column -> §PIPOST-TWIN SAME|DIFF.
// Scenarios: P1 project Landscape (101, category N) <- product 139 qty 3 (the document's Complete) · P2 project Standard (100) set to category A <- product 137 qty 2 · P3 the C4.2 route (the ported Issue to Project process).
// Command: node erp/tests/witness_project_issue_post.js        (PIPOST_ERP=<erp dir> runs against another tree; PIPOST_DUMP=<file> writes the Kernel rows as JSON)
'use strict';
var fs = require('fs'), path = require('path');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.PIPOST_ERP || path.join(__dirname, '..'), BREAK = process.env.PIPOST_BREAK === '1';
var SQLJS_DIR = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';
if (!process.env.SQLJS) process.env.SQLJS = SQLJS_DIR;
var initSqlJs = require(SQLJS_DIR);
var _log = console.log, SEEN = [];
console.log = function () { SEEN.push(Array.prototype.join.call(arguments, ' ')); };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 }, INC = 0;
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 };
  c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §PIPOST-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + JSON.stringify(info)));
}
function inconclusive(cs, key, why) { INC++; say('  §PIPOST-CHECK case=' + cs + ' key=' + key + ' INCONCLUSIVE ' + why); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; say('§PIPOST-' + cs + ' verdict=' + (!c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS') + ' judged=' + c.judged + ' failed=' + c.failed); }
function guard(cs, key, rule, fn) { try { fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.stack || e.message) || String(e))); } }
// decimal helpers on strings (no float): "6.5025" x 3 -> "19.5075"; half-up to n places
function dec(s) { s = String(s); var neg = s[0] === '-'; if (neg) s = s.slice(1); var p = s.split('.'), f = p[1] || ''; return { n: BigInt((neg ? '-' : '') + (p[0] || '0') + f), k: f.length }; }
function mul(a, b) { var x = dec(a), y = dec(b); return { n: x.n * y.n, k: x.k + y.k }; }
function round(d, n) { if (d.k <= n) return d.n * 10n ** BigInt(n - d.k); var f = 10n ** BigInt(d.k - n), q = d.n / f, r = d.n % f; if (r < 0n) r = -r; if (r * 2n >= f) q += d.n < 0n ? -1n : 1n; return q; }
function fmt(i, n) { var neg = i < 0n, s = (neg ? -i : i).toString().padStart(n + 1, '0'); return (neg ? '-' : '') + s.slice(0, s.length - n) + (n ? '.' + s.slice(s.length - n) : ''); }
function eqNum(a, b) { return Math.abs(Number(a) - Number(b)) < 1e-9; }

(async function main() {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIR, 'dist', f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); } catch (e) {} });
  var K = require(path.join(ERP, 'ws_kernel.js')), k = K.build(db), ML = k.ML, AP = require(path.join(ERP, 'ad_process.js'));
  require(path.join(ERP, 'model_projectissue.js')); require(path.join(ERP, 'processes/ProjectIssue.js'));
  var MP = require(path.join(ERP, 'model_post.js'));
  if (BREAK) delete MP.DOC.c_projectissue;                                                          // the break switch: no Doc_ProjectIssue (the state before IU5)
  var FIX = null, fixPath = path.join(ERP, 'tests/fixtures/iu5_legacy_pji.json');
  try { FIX = JSON.parse(fs.readFileSync(fixPath, 'utf8')); } catch (e) { FIX = null; }
  var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:project-issue-post' };
  function q(sql, p) { return k.q(sql, p || []); }
  function one(sql, p) { return q(sql, p)[0] || null; }
  var TRXLOG = [];
  function commit(fn) {
    var trx = new ML.Trx(k.q, k.env(S)), r;
    try { r = fn(trx, ML) || { ok: true }; } catch (ex) { r = { ok: false, error: 'model threw: ' + (ex && ex.message) }; trx.say('§MODEL-ERR ' + (ex && ex.stack || ex)); }
    var ok = r.ok !== false, ops = ok ? trx.groupOps() : []; if (ok && ops.length) k.commit(S, ops, { ws: 'project_issue_post' });
    (trx.log || []).forEach(function (l) { TRXLOG.push(l); });
    return Object.assign({}, r, { ok: ok, log: trx.log || [] });
  }
  function lastId(t) { return one('SELECT MAX(' + t + '_id) AS m FROM ' + t).m; }
  function mk(table, f) {
    var r = commit(function (trx) { var sv = ML.save(trx, table, null, ML.newPO(trx, table, Object.assign({ ad_client_id: 11, ad_org_id: 11 }, f))); return { ok: sv.ok, error: sv.error }; });
    if (!r.ok) throw new Error('fixture ' + table + ' refused: ' + r.error);
    return lastId(table);
  }
  var DAY = FIX && FIX.day ? FIX.day : String(k.env(S).date || '').slice(0, 10);
  say('§PIPOST-LOAD erp=' + ERP + ' break=' + (BREAK ? 1 : 0) + ' day=' + DAY + ' legacyFixture=' + (FIX ? fixPath + ' recorded=' + FIX.recorded : 'absent'));
  var schemas = q("SELECT c_acctschema_id AS id, costingmethod AS m, c_currency_id AS cur FROM c_acctschema WHERE ad_client_id=11 AND isactive='Y' ORDER BY c_acctschema_id");
  function vcAcct(vcId) { var r = vcId == null ? null : one('SELECT account_id AS a FROM c_validcombination WHERE c_validcombination_id=?', [vcId]); return r ? Number(r.a) : null; }
  function expected(projectId, productId, qty, s) {                                                 // the independent expectation for one schema
    var prj = one('SELECT projectcategory AS c FROM c_project WHERE c_project_id=?', [projectId]), pa = one('SELECT pj_wip_acct AS w, pj_asset_acct AS a FROM c_project_acct WHERE c_project_id=? AND c_acctschema_id=?', [projectId, s.id]);
    var prod = one('SELECT producttype AS t, m_product_category_id AS c FROM m_product WHERE m_product_id=?', [productId]), ma = one('SELECT p_asset_acct AS a, p_expense_acct AS e FROM m_product_acct WHERE m_product_id=? AND c_acctschema_id=?', [productId, s.id]);
    var cm = one('SELECT costingmethod AS m FROM m_product_category_acct WHERE m_product_category_id=? AND c_acctschema_id=?', [prod.c, s.id]), method = cm && cm.m ? cm.m : s.m;
    var price = one("SELECT c.currentcostprice AS p FROM m_cost c JOIN m_costelement e ON e.m_costelement_id=c.m_costelement_id WHERE e.costelementtype='M' AND e.costingmethod=? AND e.ad_client_id=11 AND c.m_product_id=? AND c.c_acctschema_id=? AND c.ad_org_id=0 AND c.m_attributesetinstance_id=0", [method, productId, s.id]);
    var prec = Number(one('SELECT stdprecision AS p FROM c_currency WHERE c_currency_id=?', [s.cur]).p), raw = mul(price.p, qty);
    return { dr: vcAcct(prj && prj.c === 'A' ? pa.a : pa.w), cr: vcAcct(prod.t === 'I' ? ma.a : ma.e), amt: fmt(round(raw, prec), prec), cdAmt: '-' + fmt(raw.n, raw.k), method: method, price: String(price.p), cur: Number(s.cur) };
  }
  function factsOf(id) { return q('SELECT f.*, ev.value AS acctvalue FROM fact_acct f LEFT JOIN c_elementvalue ev ON ev.c_elementvalue_id=f.account_id WHERE f.ad_table_id=623 AND f.record_id=? ORDER BY f.c_acctschema_id, f.amtacctdr DESC, f.fact_acct_id', [id]); }
  function cdOf(id) { return q('SELECT * FROM m_costdetail WHERE c_projectissue_id=? ORDER BY c_acctschema_id, m_costdetail_id', [id]); }
  function judge(cs, id, projectId, productId, qty) {
    var pi = one('SELECT posted AS p, docstatus AS s FROM c_projectissue WHERE c_projectissue_id=?', [id]), F = factsOf(id), CD = cdOf(id);
    say('§PIPOST-RUN case=' + cs + ' issue=' + id + ' docstatus=' + pi.s + ' posted=' + pi.p + ' facts=' + F.length + ' costdetails=' + CD.length);
    F.forEach(function (f) { say('  §PIPOST-FACT case=' + cs + ' schema=' + f.c_acctschema_id + ' acct=' + f.acctvalue + '(' + f.account_id + ') dr=' + f.amtacctdr + ' cr=' + f.amtacctcr + ' src=' + f.amtsourcedr + '/' + f.amtsourcecr + ' cur=' + f.c_currency_id + ' qty=' + f.qty + ' org=' + f.ad_org_id + ' loc=' + f.m_locator_id + ' desc="' + f.description + '"'); });
    check(cs, 'posted', 'the completed issue is Posted=Y (DocumentEngine.processIt :349-364 posts it immediately, CLIENT_ACCOUNTING=I)', pi.s === 'CO' && pi.p === 'Y', pi);
    check(cs, 'count', 'exactly 2 fact lines per active schema (' + schemas.length + ' schemas): DR project + CR product (Doc_ProjectIssue.createFacts :154-170)', F.length === 2 * schemas.length, { n: F.length });
    schemas.forEach(function (s) {
      var e = expected(projectId, productId, qty, s), mine = F.filter(function (f) { return Number(f.c_acctschema_id) === Number(s.id); }), dr = mine.filter(function (f) { return Number(f.amtacctdr) !== 0; })[0], cr = mine.filter(function (f) { return Number(f.amtacctcr) !== 0; })[0];
      say('  §PIPOST-EXPECT case=' + cs + ' schema=' + s.id + ' method=' + e.method + ' price=' + e.price + ' qty=' + qty + ' amount=' + e.amt + ' DR=' + e.dr + ' CR=' + e.cr + ' cur=' + e.cur);
      check(cs, 'dr-' + s.id, 'schema ' + s.id + ': DR account ' + e.dr + ' (C_Project_Acct ' + (one('SELECT projectcategory AS c FROM c_project WHERE c_project_id=?', [projectId]).c === 'A' ? 'PJ_Asset' : 'PJ_WIP') + ') = ' + e.amt + ' ' + e.cur + ', source = accounted, qty +' + qty,
        !!dr && Number(dr.account_id) === e.dr && eqNum(dr.amtacctdr, e.amt) && eqNum(dr.amtsourcedr, e.amt) && Number(dr.c_currency_id) === e.cur && eqNum(dr.qty, qty) && eqNum(dr.amtacctcr, 0), dr);
      check(cs, 'cr-' + s.id, 'schema ' + s.id + ': CR account ' + e.cr + ' (M_Product_Acct P_Asset) = ' + e.amt + ', qty -' + qty + ', locator 101 (from)', !!cr && Number(cr.account_id) === e.cr && eqNum(cr.amtacctcr, e.amt) && eqNum(cr.amtsourcecr, e.amt) && Number(cr.c_currency_id) === e.cur && eqNum(cr.qty, -qty) && Number(cr.m_locator_id) === 101, cr);
      var cd = CD.filter(function (c) { return Number(c.c_acctschema_id) === Number(s.id); });
      check(cs, 'cd-' + s.id, 'schema ' + s.id + ': one M_CostDetail with C_ProjectIssue_ID=' + id + ', amt ' + e.cdAmt + ', qty -' + qty + ' (MCostDetail.createProjectIssue :771-817, costDetailAmt negated :175-176)', cd.length === 1 && eqNum(cd[0].amt, e.cdAmt) && eqNum(cd[0].qty, -qty), cd);
    });
    var costs = q("SELECT c.m_product_id, c.c_acctschema_id, e.costingmethod, c.currentqty, c.currentcostprice, c.cumulatedqty, c.cumulatedamt FROM m_cost c JOIN m_costelement e ON e.m_costelement_id=c.m_costelement_id WHERE c.m_product_id=? AND e.costelementtype='M' AND c.ad_org_id=0 AND c.m_attributesetinstance_id=0 ORDER BY 2,3", [productId]);   // read NOW: a later scenario moves the same product
    var bal = one('SELECT projectbalanceamt AS b FROM c_project WHERE c_project_id=?', [projectId]).b;
    return { facts: F, cds: CD, costs: costs, projectbalanceamt: bal };
  }
  var OUT = {};
  // ═══ P1 the document's Complete (legacy: BridgeCreateProjectIssue + BridgeCompleteProjectIssue) ═══
  guard('P1', 'run', 'project Landscape (101, category N) <- product 139 qty 3 at locator 101', function () {
    var id = mk('c_projectissue', { c_project_id: 101, m_locator_id: 101, m_product_id: 139, movementqty: 3, movementdate: DAY + ' 00:00:00', description: 'IU5 twin P1', line: 10 });
    var r = commit(function (trx) { var x = ML.processIt(trx, 'c_projectissue', id, 'CO'); return { ok: x.ok, msg: x.msg }; });
    say('  §PIPOST-LOG case=P1 ' + r.log.filter(function (l) { return /§MODEL-POST/.test(l); }).join(' | '));
    OUT.P1 = judge('P1', id, 101, 139, 3);
  });
  verdict('P1');
  // ═══ P2 an Asset project (category A): DR PJ_Asset_Acct (Doc_ProjectIssue.createFacts :155-157) ═══
  guard('P2', 'run', 'project Standard (100) set to category A <- product 137 qty 2', function () {
    db.run("UPDATE c_project SET projectcategory='A' WHERE c_project_id=100");                       // fixture (data): the same UPDATE is made on legacy before its run
    var id = mk('c_projectissue', { c_project_id: 100, m_locator_id: 101, m_product_id: 137, movementqty: 2, movementdate: DAY + ' 00:00:00', description: 'IU5 twin P2', line: 10 });
    commit(function (trx) { var x = ML.processIt(trx, 'c_projectissue', id, 'CO'); return { ok: x.ok, msg: x.msg }; });
    OUT.P2 = judge('P2', id, 100, 137, 2);
  });
  verdict('P2');
  // ═══ P3 the UAT guide's route C4.2: the Issue to Project process (IU1) completes the issue through the workflow, the same poster ═══
  guard('P3', 'run', 'a Work Order project <- the ported ProjectIssue process, product 139 qty 1', function () {
    var p = mk('c_project', { value: 'PIPOST-' + process.pid, name: 'PIPOST project', c_currency_id: 100, m_pricelist_version_id: 104, m_warehouse_id: 103, c_bpartner_id: 117, c_bpartner_location_id: 112, ad_user_id: 104, c_paymentterm_id: 105, salesrep_id: 101, issummary: 'N', projectcategory: 'W' });
    var tx = null; commit(function (trx) { if (process.env.PIPOST_DEBUG) { var B = require(path.join(ERP, "bigdecimal.js")); } tx = AP.runInTrx(trx, 224, { tableId: 0, recordId: 0, params: { C_Project_ID: p, M_Locator_ID: 101, M_Product_ID: 139, MovementQty: 1, MovementDate: DAY } }); return { ok: tx.ok, error: tx.summary }; });
    var id = one('SELECT c_projectissue_id AS i FROM c_projectissue WHERE c_project_id=?', [p]);
    check('P3', 'process', 'the process answered ok and made one issue', !!tx && tx.ok === true && !!id, { s: tx && tx.summary });
    if (id) judge('P3', id.i, p, 139, 1);
  });
  verdict('P3');
  // ═══ TWIN: the Kernel's rows of P1 and P2 == legacy's (recorded on :8108) ═══
  var TWIN_COLS = ['c_acctschema_id', 'account_id', 'acctvalue', 'amtsourcedr', 'amtsourcecr', 'amtacctdr', 'amtacctcr', 'c_currency_id', 'qty', 'm_product_id', 'c_project_id', 'm_locator_id', 'ad_org_id', 'description', 'postingtype', 'c_uom_id', 'c_locfrom_id', 'c_locto_id', 'gl_category_id', 'c_bpartner_id', 'm_attributesetinstance_id'];
  var CD_COLS = ['c_acctschema_id', 'ad_org_id', 'm_product_id', 'amt', 'qty', 'description', 'processed', 'issotrx', 'm_costelement_id', 'currentcostprice', 'currentqty', 'cumulatedamt', 'cumulatedqty'];
  function norm(v) { if (v == null || v === '') return ''; if (typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(String(v))) return String(Number(v)); return String(v); }
  if (!FIX) inconclusive('TWIN', 'fixture', 'no legacy fixture at ' + fixPath + ' (record it on :8108 first): the twin is NOT judged');
  else ['P1', 'P2'].forEach(function (cs) {
    var L = FIX.cases && FIX.cases[cs], Kr = OUT[cs];
    if (!L || !Kr) { inconclusive('TWIN', cs, 'a side is missing (legacy=' + !!L + ' kernel=' + !!Kr + ')'); return; }
    var diffs = [];
    if (L.facts.length !== Kr.facts.length) diffs.push('fact count legacy=' + L.facts.length + ' kernel=' + Kr.facts.length);
    L.facts.forEach(function (lf, i) { var kf = Kr.facts[i] || {}; TWIN_COLS.forEach(function (c) { if (!(c in lf)) return; if (norm(lf[c]) !== norm(kf[c])) diffs.push('fact[' + i + '].' + c + ' legacy=' + norm(lf[c]) + ' kernel=' + norm(kf[c])); }); });
    L.facts.forEach(function (lf, i) { var kf = Kr.facts[i] || {}; ['dateacct', 'datetrx'].forEach(function (c) { var l = String(lf[c] || '').slice(0, 10), k = String(kf[c] || '').slice(0, 10); if (l !== k) diffs.push('fact[' + i + '].' + c + ' legacy=' + l + ' kernel=' + k); });
      var lp = lf.c_period_id, kp = kf.c_period_id; if (norm(lp) !== norm(kp)) diffs.push('fact[' + i + '].c_period_id legacy=' + norm(lp) + ' kernel=' + norm(kp)); });   // the day, not the text form; the period by id (the same GardenWorld calendar both sides)
    if (L.cds.length !== Kr.cds.length) diffs.push('costdetail count legacy=' + L.cds.length + ' kernel=' + Kr.cds.length);
    L.cds.forEach(function (lc, i) { var kc = Kr.cds[i] || {}; CD_COLS.forEach(function (c) { if (!(c in lc)) return; if (norm(lc[c]) !== norm(kc[c])) diffs.push('cd[' + i + '].' + c + ' legacy=' + norm(lc[c]) + ' kernel=' + norm(kc[c])); }); });
    if (L.costs) L.costs.forEach(function (lc) { var kc = (Kr.costs || []).filter(function (x) { return String(x.c_acctschema_id) === String(lc.c_acctschema_id) && x.costingmethod === lc.costingmethod; })[0] || {};
      ['currentqty', 'currentcostprice', 'cumulatedqty', 'cumulatedamt'].forEach(function (c) { if (norm(lc[c]) !== norm(kc[c])) diffs.push('m_cost ' + lc.m_product_id + '/' + lc.c_acctschema_id + '/' + lc.costingmethod + '.' + c + ' legacy=' + norm(lc[c]) + ' kernel=' + norm(kc[c])); }); });
    if (L.projectbalanceamt != null && norm(L.projectbalanceamt) !== norm(Kr.projectbalanceamt)) diffs.push('c_project.projectbalanceamt legacy=' + norm(L.projectbalanceamt) + ' kernel=' + norm(Kr.projectbalanceamt));
    say('§PIPOST-TWIN case=' + cs + ' ' + (diffs.length ? 'DIFF n=' + diffs.length + ' ' + diffs.slice(0, 12).join(' ; ') : 'SAME facts=' + L.facts.length + ' costdetails=' + L.cds.length + ' costs=' + (L.costs ? L.costs.length : 0) + ' balance=' + norm(L.projectbalanceamt) + ' columns=' + TWIN_COLS.length + '+' + CD_COLS.length));
    check('TWIN', cs, 'the Kernel\'s Fact_Acct / M_CostDetail / M_Cost rows of ' + cs + ' equal legacy\'s (recorded ' + FIX.recorded + ')', diffs.length === 0, diffs.slice(0, 6));
  });
  verdict('TWIN');
  if (process.env.PIPOST_DUMP) fs.writeFileSync(process.env.PIPOST_DUMP, JSON.stringify(OUT, null, 1));
  var v = ALL.failed ? 'FAIL' : (ALL.judged && !INC && ['P1', 'P2', 'P3'].every(function (c) { return CASES[c] && CASES[c].judged; })) ? 'PASS' : 'INCONCLUSIVE';
  say('§PIPOST-RESULT verdict=' + v + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' inconclusive=' + INC + (BREAK ? ' (BREAK: FAIL expected)' : ''));
  process.exit(v === 'PASS' ? 0 : 1);
})().catch(function (e) { _log('§PIPOST-ERROR ' + (e && e.stack || e)); process.exit(2); });
