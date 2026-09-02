#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope guard
// Scope: headless §-witness for erp_preview.js (POSTING_PREVIEW_PANEL.md §6 — the Posting-Preview DRAWER).
//   THE CLAIM (engine PROVEN in bim-compiler build/erp/poc_doc_poster.log; this proves the DRAWER renders it
//   on the BROWSER path — sql.js facade + the same AcctsPosted renderer):
//     §PREVIEW-COMPLETE — Complete on a real GardenWorld SO renders the journal == real fact_acct(318)
//        per (account,side) INTEGER CENTS, maxDiff=0c; DOM .posted-line count == lines; badge "Balanced".
//     §PREVIEW-NOWRITE  — the loaded db is BYTE-UNCHANGED across previewDocAction (export() identical) —
//        pure projection, no commitGroup, no row write.
//     §PREVIEW-DATA     — a record absent from the loaded db → honest coverage:absent empty-state, ZERO
//        invented rows.
//     §PREVIEW-GATE     — isshowacct=N role AND out-of-scope record → ZERO .posted-line rows (UI zero-leak),
//        honest refusal (gate mirrors erp_postings:71-85).
//     §PREVIEW-FALSIFIER— a faulty resolver that drops the receivable DR → the fold goes unbalanced and the
//        badge SHOWS "Unbalanced" (the panel reflects the real fold, not a hard-coded Balanced).
//   NON-INVENT: real GardenWorld rows (glassbowl_data.db, client 11) for derive; real ad_seed roles 102/103
//   for the gate; accounts via post_resolver; integer cents; no Date.now/Math.random.
//   §-log first — READ tests/poc_posting_preview.log before any conclusion.
// Run:  node tests/poc_posting_preview.js 2>&1 | tee tests/poc_posting_preview.log   (cwd = bim-ootb/erp)
'use strict';
var fs = require('fs'), path = require('path');
var initSqlJs = require('sql.js');

var ERP = __dirname + '/..';                                   // bim-ootb/erp
var DEMO = path.join(__dirname, '..', 'preview_demo.db'); // single self-contained db

global.window = global.window || {};                           // browser IIFEs populate window.*
require(path.join(ERP, 'post_resolver.js'));                   // window.PostResolver
require(path.join(ERP, 'doc_poster.js'));                      // window.DocPoster
var AP = require(path.join(ERP, 'accts_posted.js'));           // window.AcctsPosted (renderer — REUSED)
var PV = require(path.join(ERP, 'erp_preview.js'));            // window.ERPPreview (the seam under test)

var SCHEMA = 101;
var ORDER_ID = 100, ORDER_DOCNO = '80000', INVOICE_ID = 100, ORDER_ORG = 11;
var ROLE_ADMIN = 102, ROLE_USER = 103;   // 102 isshowacct=Y, 103 isshowacct=N (ad_seed.db; same as accts_posted)
var AD_TABLE_C_INVOICE = 318;

var fails = 0;
function ok(cond, msg, detail) {
  if (!cond) { fails++; console.log('   🔴 FAIL: ' + msg + (detail ? ' — ' + detail : '')); }
  else console.log('   🟢 ' + msg + (detail ? ' — ' + detail : ''));
}
function rows(db, sql, p) {
  var r = db.exec(sql, p || []);
  if (!r.length) return [];
  return r[0].values.map(function (v) { var o = {}; r[0].columns.forEach(function (c, i) { o[c] = v[i]; }); return o; });
}
function cents(n) { return Math.round(Number(n || 0) * 100); }
function key(a, s) { return s + ':' + a; }

// ── minimal DOM shim (mirror poc_accts_posted.js) — proves DOM node counts / UI zero-leak. ──
function makeDoc() {
  function el(tag) {
    return { tag: tag, className: '', textContent: '', children: [], _attrs: {},
             appendChild: function (c) { this.children.push(c); return c; },
             setAttribute: function (k, v) { this._attrs[k] = v; },
             getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
             addEventListener: function () {} };
  }
  return { createElement: el };
}
function walk(node, fn) { fn(node); (node.children || []).forEach(function (c) { walk(c, fn); }); }
function hasClass(x, cls) { return String(x.className || '').split(/\s+/).indexOf(cls) >= 0; }
function countClass(node, cls) { var n = 0; walk(node, function (x) { if (hasClass(x, cls)) n++; }); return n; }
function firstText(node, cls) { var t = null; walk(node, function (x) { if (t === null && hasClass(x, cls)) t = x.textContent; }); return t; }
function allText(node) { var s = ''; walk(node, function (x) { s += ' ' + (x.textContent || ''); }); return s; }

(async function () {
  console.log('═══ POC-POSTING-PREVIEW — the drawer renders doc_poster\'s fold (Class A) on the browser path ═══\n');
  var SQL = await initSqlJs();
  var demoDb = new SQL.Database(new Uint8Array(fs.readFileSync(DEMO)));
  var adQ = function (sql, p) { return rows(demoDb, sql, p); };
  var docDb = PV.facade(demoDb);                              // the browser sql.js handle, better-sqlite3-shaped
  var dbs = { adQ: adQ, docDb: docDb };
  var opts = { doc: makeDoc(), AcctsPosted: AP, R: window.PostResolver, DocPoster: window.DocPoster, schema: SCHEMA };

  // SESSION-shaped (for openPreview → buildCtx): org 0 ⇒ allowOrgs '*'; [{id:50000}] ⇒ scoped-out.
  var ADMIN_SESS = { role: { id: ROLE_ADMIN }, orgs: [{ id: 0 }] };
  var USER_SESS  = { role: { id: ROLE_USER },  orgs: [{ id: 0 }] };
  var SCOPE_SESS = { role: { id: ROLE_ADMIN }, orgs: [{ id: 50000 }] };
  // CTX-shaped (for previewDocAction directly): allowOrgs '*'.
  var ADMIN_CTX  = { role: { id: ROLE_ADMIN }, allowOrgs: '*' };
  var refSO       = { table: 'C_Order', id: ORDER_ID, ad_org_id: ORDER_ORG };
  var refMissing  = { table: 'C_Order', id: 999999, ad_org_id: ORDER_ORG };

  // oracle fact_acct(318) for the SO's invoice — the INDEPENDENT product (iDempiere's posted GL).
  function oracleInvoice(invId) {
    var r = rows(demoDb, 'SELECT account_id, ROUND(SUM(amtacctdr),2) dr, ROUND(SUM(amtacctcr),2) cr FROM fact_acct WHERE ad_table_id=? AND record_id=? AND c_acctschema_id=? GROUP BY account_id', [AD_TABLE_C_INVOICE, invId, SCHEMA]);
    var m = {}; r.forEach(function (x) { if (cents(x.dr)) m[key(x.account_id, 'DR')] = cents(x.dr); if (cents(x.cr)) m[key(x.account_id, 'CR')] = cents(x.cr); });
    return m;
  }
  function vmMap(vm) {
    var m = {}; vm.rows.forEach(function (l) { if (cents(l.drRaw)) m[key(l.account_id, 'DR')] = cents(l.drRaw); if (cents(l.crRaw)) m[key(l.account_id, 'CR')] = cents(l.crRaw); }); return m;
  }
  function maxDiff(a, b) { var ks = {}; Object.keys(a).forEach(function (k) { ks[k] = 1; }); Object.keys(b).forEach(function (k) { ks[k] = 1; }); var md = 0; Object.keys(ks).forEach(function (k) { var d = Math.abs((a[k] || 0) - (b[k] || 0)); if (d > md) md = d; }); return md; }

  // ══ §PREVIEW-COMPLETE — Complete on a real SO renders the journal == fact_acct(318) (Class A) ══
  console.log('── §PREVIEW-COMPLETE (role=102 Admin, SO ' + ORDER_DOCNO + ') ──');
  var out = PV.openPreview(refSO, ADMIN_SESS, dbs, opts);
  var vm = out.vm, node = out.node;
  ok(out.result.visible && out.result.posted && out.result.source === 'preview', 'engine: visible+posted, source=preview', 'source=' + out.result.source + ' cov=' + out.result.coverage);
  ok(vm.kind === 'posted' && vm.rows.length === out.result.lines.length, 'VM rows == fold lines (verbatim)', 'vm=' + vm.rows.length + ' fold=' + out.result.lines.length);
  var domLines = countClass(node, 'posted-line');
  ok(domLines === out.result.lines.length, 'DOM .posted-line count == fold lines', 'dom=' + domLines);
  var md = maxDiff(vmMap(vm), oracleInvoice(INVOICE_ID));
  ok(md === 0, 'rendered DR/CR == fact_acct(318) per (account,side), maxDiff=0c (Class A: fold vs independent product)', 'maxDiff=' + md + 'c');
  ok(out.result.balanced && firstText(node, 'posted-balance') === 'Balanced', 'balance badge == "Balanced" (verbatim from fold)', 'badge=' + firstText(node, 'posted-balance'));
  ok(out.result.coverage === 'complete', 'coverage=complete (all tokens resolved)', 'cov=' + out.result.coverage);
  vm.rows.forEach(function (l) { console.log('     acct=' + l.account_id + ' (' + l.value + ' · ' + l.name + ') DR=' + l.dr + ' CR=' + l.cr); });
  console.log('§PREVIEW-COMPLETE doc=C_Order id=' + ORDER_ID + ' docno=' + ORDER_DOCNO + ' invoice=' + INVOICE_ID + ' rows=' + domLines + ' maxDiff=' + md + 'c vs fact_acct(318) balanced=' + (out.result.balanced ? 'Y' : 'N') + ' coverage=' + out.result.coverage + ' source=preview class=A');

  // ══ §PREVIEW-NOWRITE — the projection mutates nothing (db byte-identical) ══
  console.log('\n── §PREVIEW-NOWRITE ──');
  var before = demoDb.export();
  PV.previewDocAction(refSO, ADMIN_CTX, dbs, opts);
  var after = demoDb.export();
  var identical = before.length === after.length && Buffer.compare(Buffer.from(before), Buffer.from(after)) === 0;
  ok(identical, 'loaded db BYTE-UNCHANGED across previewDocAction (pure projection)', 'bytes=' + before.length + (identical ? ' identical' : ' DIFFER'));
  console.log('§PREVIEW-NOWRITE db_bytes=' + before.length + ' unchanged=' + (identical ? 'Y' : 'N') + ' commitGroup=none');

  // ══ §PREVIEW-DATA — record absent from the loaded db → honest absent, ZERO invented rows ══
  console.log('\n── §PREVIEW-DATA (no such order) ──');
  var oD = PV.openPreview(refMissing, ADMIN_SESS, dbs, opts);
  var dataRows = countClass(oD.node, 'posted-line');
  ok(oD.result.posted === false && oD.result.coverage === 'absent', 'engine: not-posted, coverage=absent', 'posted=' + oD.result.posted + ' cov=' + oD.result.coverage);
  ok(dataRows === 0 && (oD.vm.kind === 'empty'), 'DOM has ZERO .posted-line rows + empty-state note', 'dom-rows=' + dataRows + ' note=' + (oD.result.note || ''));
  console.log('§PREVIEW-DATA record=C_Order#999999 posted=N coverage=absent dom-rows=' + dataRows + ' note="' + (oD.result.note || '') + '"');

  // ══ §PREVIEW-GATE — non-accounting role + out-of-scope record → ZERO rows (UI zero-leak) ══
  console.log('\n── §PREVIEW-GATE (role=103 isshowacct=N; and out-of-scope) ──');
  var oG = PV.openPreview(refSO, USER_SESS, dbs, opts);
  var gateRows = countClass(oG.node, 'posted-line');
  ok(oG.result.visible === false && oG.result.reason === 'role-not-accounting', 'engine refuses (role-not-accounting)', 'reason=' + oG.result.reason);
  ok(oG.vm.kind === 'refused' && gateRows === 0, 'DOM ZERO .posted-line rows (UI zero-leak)', 'dom-rows=' + gateRows);
  var oS = PV.openPreview(refSO, SCOPE_SESS, dbs, opts);
  var scopeRows = countClass(oS.node, 'posted-line');
  ok(oS.result.visible === false && oS.result.reason === 'out-of-scope' && scopeRows === 0, 'out-of-scope role → refused, ZERO rows', 'reason=' + oS.result.reason + ' dom-rows=' + scopeRows);
  console.log('§PREVIEW-GATE role=103 reason=role-not-accounting dom-rows=' + gateRows + ' leak=N ; role=102 allowOrgs=[50000] org=11 reason=out-of-scope dom-rows=' + scopeRows + ' leak=N');

  // ══ §PREVIEW-FALSIFIER — a faulty resolver drops the receivable DR → unbalanced is SHOWN ══
  console.log('\n── §PREVIEW-FALSIFIER (resolver drops {BPartner.Receivable}) ──');
  var faultyR = { resolve: function (db, token, masterId, schema) {
    if (token === '{BPartner.Receivable}') return { token: token, acct: null, element: null }; // drop the DR
    return window.PostResolver.resolve(db, token, masterId, schema);
  } };
  var oF = PV.openPreview(refSO, ADMIN_SESS, dbs, { doc: makeDoc(), AcctsPosted: AP, R: faultyR, DocPoster: window.DocPoster, schema: SCHEMA });
  var fBadge = firstText(oF.node, 'posted-balance');
  ok(oF.result.balanced === false && fBadge === 'Unbalanced', 'dropping a derived line → fold unbalanced, badge SHOWS "Unbalanced" (not hard-coded)', 'balanced=' + oF.result.balanced + ' badge=' + fBadge);
  ok(oF.result.coverage === 'partial', 'unresolved token → coverage=partial (honest)', 'cov=' + oF.result.coverage);
  console.log('§PREVIEW-FALSIFIER mutation=drop-receivable-DR balanced=' + (oF.result.balanced ? 'Y' : 'N') + ' badge=' + fBadge + ' coverage=' + oF.result.coverage);

  console.log('\n' + (fails === 0 ? '🟢 POC-POSTING-PREVIEW PASS' : '🔴 POC-POSTING-PREVIEW FAIL (' + fails + ')') +
    ' — the drawer renders doc_poster\'s oracle-anchored fold (Class A, == fact_acct(318)) on the browser sql.js path; pure projection; gate zero-leak; falsifier load-bearing. UI mount/deploy GO-gated (§9).');
  process.exit(fails === 0 ? 0 : 1);
})();
