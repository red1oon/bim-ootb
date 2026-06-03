// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope guard
// Scope: headless §-witness for accts_posted.js (FRONTEND_LANE_MASTER §2 Item C — the Accts-Posted PANEL).
//   THE CLAIM (engine PROVEN in bim-compiler build/erp/poc_postings.log; this proves the PANEL renders it):
//     1. §POSTED-READ  — an accounting role's balanced fold renders VERBATIM: DOM .posted-line count ==
//        result.lines.length, balanced badge == result.balanced, each DR/CR == the engine cents, the
//        source/coverage/note strip shown as returned. Nothing re-gated / re-summed UI-side.
//     2. §POSTED-GATE  — a non-accounting role (isshowacct=N) AND an out-of-scope record render an honest
//        refusal with ZERO .posted-line rows in the DOM — the engine gate's zero-leak holds at the UI.
//     3. §POSTED-COVERAGE — an unposted record renders the engine's absent note as the empty state; the
//        panel is NEVER suppressed for not being `complete`.
//     4. §POSTED-CTX   — buildCtx maps real org rows → { role:{id}, allowOrgs }, org-0 ("*") ⇒ '*'.
//   NON-INVENT: roles/accounts/invoice are REAL ad_seed.db rows; the POST arrange uses the SAME K.apply
//   technique as poc_postings.js (account RESOLUTION fidelity is proven there via the resolver — THIS
//   witness's issue is the RENDERER, not the resolver; stated here, no overclaim).
//   §-log first — READ tests/poc_accts_posted.log before any conclusion.
// Run:  node tests/poc_accts_posted.js 2>&1 | tee tests/poc_accts_posted.log   (cwd = bim-ootb/erp)
'use strict';
var fs = require('fs'), path = require('path');
var initSqlJs = require('sql.js');

var ERP = __dirname + '/..';                                   // bim-ootb/erp
var AD = path.join(ERP, 'ad_seed.db');
global.window = global.window || {};                           // accts_posted.js is a browser IIFE
var Panel = require(path.join(ERP, 'accts_posted.js'));        // the panel under test
var P = require(path.join(ERP, 'erp_postings.js'));            // the FROZEN read-fold (byte-identical copy)
var K = require(path.join(ERP, 'erp_kernel.js'));             // the engine — for the POST arrange only

var INVOICE_ID = 101;        // real GardenWorld sales invoice (GrandTotal 100.70, org 11)
var INV_ORG = 11;
var INV_GT = 100.70;
var ACCT_DR = 219, ACCT_CR = 220;   // real c_validcombination ids (ad_seed.db)
var ROLE_ADMIN = 102, ROLE_USER = 103;   // 102 isshowacct=Y, 103 isshowacct=N (verified ad_seed.db)

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

// ── minimal DOM shim — enough for accts_posted.mount(); proves DOM node counts (UI zero-leak). ──
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
  console.log('═══ POC-ACCTS-POSTED — the panel renders readPostings (§13.7) VERBATIM, zero-leak ═══\n');
  var SQL = await initSqlJs();
  var ad = new SQL.Database(new Uint8Array(fs.readFileSync(AD)));
  var adQ = function (sql, p) { return rows(ad, sql, p); };

  // arrange: a fresh projection with ONE real balanced POST for C_Invoice#101 (same as poc_postings).
  var projDb = new SQL.Database();
  K.initProjection(projDb);
  K.apply(projDb, [{ op_type: 'POST', table: 'C_Invoice', id: INVOICE_ID, acctschema: 101,
    lines: [{ account_id: ACCT_DR, amtacctdr: INV_GT, amtacctcr: 0, role: 'DR' },
            { account_id: ACCT_CR, amtacctdr: 0, amtacctcr: INV_GT, role: 'CR' }] }],
    { actor: 'plugin:post.salesinvoice', baseTs: 7000 });
  var projQ = function (sql, p) { return K.query(projDb, sql, p || []); };
  var dbs = { adQ: adQ, projQ: projQ, factQ: null };
  console.log('arranged: POSTed C_Invoice#' + INVOICE_ID + ' (DR ' + ACCT_DR + ' / CR ' + ACCT_CR + ' = ' + INV_GT.toFixed(2) + ')\n');

  var refPosted   = { table: 'C_Invoice', record_id: INVOICE_ID, ad_org_id: INV_ORG, ad_table_id: 318 };
  var refUnposted = { table: 'C_Invoice', record_id: 999, ad_org_id: INV_ORG, ad_table_id: 318 };
  var ADMIN = { role: { id: ROLE_ADMIN }, allowOrgs: '*' };
  var USER  = { role: { id: ROLE_USER }, allowOrgs: '*' };

  // ══ §POSTED-READ — accounting role, posted record: rendered VERBATIM ══
  console.log('── §POSTED-READ (role=102 Admin, posted) ──');
  var rRead = P.readPostings(refPosted, ADMIN, dbs);
  var vmRead = Panel.buildPostedVM(rRead);
  var nodeRead = Panel.mount(vmRead, { doc: makeDoc() });
  ok(rRead.visible && rRead.posted && rRead.source === 'oplog' && rRead.coverage === 'partial',
     'engine: visible+posted, source=oplog coverage=partial', 'source=' + rRead.source + ' cov=' + rRead.coverage);
  ok(vmRead.kind === 'posted' && vmRead.rows.length === rRead.lines.length,
     'VM rows == engine lines (verbatim count)', 'vm=' + vmRead.rows.length + ' engine=' + rRead.lines.length);
  var domLines = countClass(nodeRead, 'posted-line');
  ok(domLines === rRead.lines.length, 'DOM .posted-line count == engine lines', 'dom=' + domLines);
  ok(vmRead.balanced === rRead.balanced, 'VM balanced == engine balanced (not re-derived)', 'vm=' + vmRead.balanced + ' engine=' + rRead.balanced);
  ok(firstText(nodeRead, 'posted-balance') === (rRead.balanced ? 'Balanced' : 'Unbalanced'),
     'balance badge text mirrors engine', 'badge=' + firstText(nodeRead, 'posted-balance'));
  // each rendered DR/CR equals the engine cents, verbatim
  var centsMatch = rRead.lines.every(function (l, i) {
    return vmRead.rows[i].dr === Number(l.amtacctdr || 0).toFixed(2) &&
           vmRead.rows[i].cr === Number(l.amtacctcr || 0).toFixed(2);
  });
  ok(centsMatch, 'every rendered DR/CR == engine cents (verbatim)');
  var stripR = firstText(nodeRead, 'posted-coverage');
  ok(stripR.indexOf('oplog') >= 0 && stripR.indexOf('partial') >= 0, 'coverage strip shows source+coverage verbatim', 'strip=' + stripR);
  rRead.lines.forEach(function (l) { console.log('     acct=' + l.account_id + ' (' + l.value + ' ' + l.name + ') DR=' + l.amtacctdr + ' CR=' + l.amtacctcr); });
  console.log('§POSTED-READ record=C_Invoice#' + INVOICE_ID + ' role=102 rows=' + domLines +
    ' balanced=' + (vmRead.balanced ? 'Y' : 'N') + ' source=' + vmRead.source + ' coverage=' + vmRead.coverage + ' rendered=verbatim');

  // ══ §POSTED-GATE — non-accounting role: honest refusal, ZERO DOM rows ══
  console.log('\n── §POSTED-GATE (role=103 User, isshowacct=N) ──');
  var rGate = P.readPostings(refPosted, USER, dbs);
  var vmGate = Panel.buildPostedVM(rGate);
  var nodeGate = Panel.mount(vmGate, { doc: makeDoc() });
  var leakRows = countClass(nodeGate, 'posted-line');
  ok(rGate.visible === false && rGate.reason === 'role-not-accounting', 'engine refuses (role-not-accounting)', 'reason=' + rGate.reason);
  ok(vmGate.kind === 'refused' && leakRows === 0, 'DOM has ZERO .posted-line rows (UI zero-leak)', 'dom-rows=' + leakRows);
  ok(countClass(nodeGate, 'posted-refused') === 1 && allText(nodeGate).toLowerCase().indexOf('accounting') >= 0,
     'honest refusal message rendered', 'msg=' + firstText(nodeGate, 'posted-refused'));
  console.log('§POSTED-GATE role=103 isshowacct=N → visible=N reason=' + rGate.reason + ' dom-rows=' + leakRows + ' leak=' + (leakRows ? 'Y' : 'N'));

  console.log('\n── §POSTED-GATE (org scope, role=102 allowOrgs=[50000], record org=11) ──');
  var rScope = P.readPostings(refPosted, { role: { id: ROLE_ADMIN }, allowOrgs: [50000] }, dbs);
  var nodeScope = Panel.mount(Panel.buildPostedVM(rScope), { doc: makeDoc() });
  var scopeRows = countClass(nodeScope, 'posted-line');
  ok(rScope.visible === false && rScope.reason === 'out-of-scope' && scopeRows === 0,
     'out-of-scope refused, ZERO DOM rows', 'reason=' + rScope.reason + ' dom-rows=' + scopeRows);
  console.log('§POSTED-GATE role=102 allowOrgs=[50000] org=11 → visible=N reason=' + rScope.reason + ' dom-rows=' + scopeRows + ' leak=' + (scopeRows ? 'Y' : 'N'));

  // ══ §POSTED-COVERAGE — unposted record: engine note IS the empty state; tab never suppressed ══
  console.log('\n── §POSTED-COVERAGE (absent — unposted record) ──');
  var rAbsent = P.readPostings(refUnposted, ADMIN, dbs);
  var vmAbsent = Panel.buildPostedVM(rAbsent);
  var nodeAbsent = Panel.mount(vmAbsent, { doc: makeDoc() });
  ok(rAbsent.visible && !rAbsent.posted && rAbsent.coverage === 'absent', 'engine: visible+unposted, coverage=absent', 'cov=' + rAbsent.coverage);
  ok(vmAbsent.kind === 'empty' && countClass(nodeAbsent, 'posted-line') === 0, 'empty state, ZERO rows', 'rows=' + countClass(nodeAbsent, 'posted-line'));
  ok(firstText(nodeAbsent, 'posted-empty') === rAbsent.note, 'engine absent-note rendered VERBATIM as empty state', 'note=' + rAbsent.note);
  console.log('§POSTED-COVERAGE record=C_Invoice#999 source=' + rAbsent.source + ' coverage=' + rAbsent.coverage + ' note=' + JSON.stringify(rAbsent.note));

  // ══ §POSTED-CTX — buildCtx maps session.orgs → { role, allowOrgs }; org-0 sentinel ⇒ '*' ══
  // idmp_session emits a SYNTHETIC {id:0,name:'* (All accessible)'} for "All orgs" (orgsForRole) — there is
  // NO ad_org_id=0 row, so the org-0 branch must be driven by that sentinel, not an ad_org query. The
  // SCOPED case uses REAL ad_org rows so the id-list path is proven on real data.
  var SENTINEL0 = { id: 0, name: '* (All accessible)' };                       // as idmp_session produces
  var realOrgs = adQ('SELECT ad_org_id AS id, name AS name FROM ad_org WHERE ad_org_id IN (11, 12) ORDER BY ad_org_id', []);
  console.log('\n── §POSTED-CTX (org-0 sentinel ⇒ "*"; real ad_org rows ⇒ id list) ──');
  var ctxAll = Panel.buildCtx({ role: { id: ROLE_ADMIN }, orgs: [SENTINEL0].concat(realOrgs) });
  var ctxScoped = Panel.buildCtx({ role: { id: ROLE_ADMIN }, orgs: realOrgs });
  ok(ctxAll.role.id === ROLE_ADMIN, 'ctx.role.id carried from session', 'role=' + ctxAll.role.id);
  ok(ctxAll.allowOrgs === '*', 'org-0 sentinel present ⇒ allowOrgs="*" (branch exercised, not vacuous)', 'allowOrgs=' + JSON.stringify(ctxAll.allowOrgs));
  ok(realOrgs.length > 0 && JSON.stringify(ctxScoped.allowOrgs) === JSON.stringify(realOrgs.map(function (o) { return o.id; })),
     'no org-0 ⇒ explicit REAL ad_org id list', 'allowOrgs=' + JSON.stringify(ctxScoped.allowOrgs));
  console.log('§POSTED-CTX org0-sentinel→allowOrgs=' + JSON.stringify(ctxAll.allowOrgs) + ' real-orgs→allowOrgs=' + JSON.stringify(ctxScoped.allowOrgs));

  // ══ §POSTED-MOBILE — the accordion lens renders the SAME fold; reused .acc controls + pills; zero-leak ══
  console.log('\n── §POSTED-MOBILE (accordion lens — reused ad_ui .acc + window.ICONS pills) ──');
  var accPosted = Panel.mountAccordion(vmRead, { doc: makeDoc(), open: true });
  ok(countClass(accPosted.node, 'acc') === 1, '.acc card present (ad_ui idiom reused)');
  ok(firstText(accPosted.node, 'posted-balance') === (rRead.balanced ? 'Balanced' : 'Unbalanced'), 'header balanced badge VERBATIM');
  ok(firstText(accPosted.node, 'posted-cov-chip') === rRead.coverage, 'coverage chip VERBATIM', 'chip=' + firstText(accPosted.node, 'posted-cov-chip'));
  ok(countClass(accPosted.node, 'posted-line') === rRead.lines.length, '.bd lines == engine lines', 'lines=' + countClass(accPosted.node, 'posted-line'));
  var pillsPosted = Panel.pillControls(vmRead).map(function (p) { return p.id; });
  ok(JSON.stringify(pillsPosted) === JSON.stringify(['install', 'share', 'verify']), 'pill set == [install,share,verify] (partial→install)', 'pills=' + JSON.stringify(pillsPosted));
  var pillBtns = []; walk(accPosted.node, function (x) { if (hasClass(x, 'posted-pill')) pillBtns.push(x); });
  ok(pillBtns.length === 3 && pillBtns.every(function (b) { return b.tag === 'button' && b.getAttribute('data-icon'); }),
     'pills rendered as 3 buttons each with a data-icon (window.ICONS)', 'icons=' + pillBtns.map(function (b) { return b.getAttribute('data-icon'); }).join(','));
  var unbind = Panel.bindBack(function () {});
  ok(typeof unbind === 'function', 'bindBack callable → unbind fn (no-op in node; popstate-trap in browser)');
  console.log('§POSTED-MOBILE acc=1 badge=' + firstText(accPosted.node, 'posted-balance') + ' cov=' + firstText(accPosted.node, 'posted-cov-chip') +
    ' lines=' + countClass(accPosted.node, 'posted-line') + ' pills=' + JSON.stringify(pillsPosted) + ' bindBack=ok');

  var accGate = Panel.mountAccordion(vmGate, { doc: makeDoc(), open: true });
  ok(countClass(accGate.node, 'posted-line') === 0, 'gate accordion ZERO lines (leak=N)');
  ok(countClass(accGate.node, 'posted-refused') === 1, 'gate accordion shows honest refusal');
  ok(Panel.pillControls(vmGate).length === 0, 'gate → NO data pills (nothing actionable for this role)');
  console.log('§POSTED-MOBILE gate dom-lines=0 pills=[] leak=N');

  var accAbsent = Panel.mountAccordion(vmAbsent, { doc: makeDoc(), open: true });
  var pillsAbsent = Panel.pillControls(vmAbsent).map(function (p) { return p.id; });
  ok(firstText(accAbsent.node, 'posted-empty') === rAbsent.note, 'absent note rendered VERBATIM in accordion');
  ok(JSON.stringify(pillsAbsent) === JSON.stringify(['install']), 'absent → [install] pill (the lift to local data)', 'pills=' + JSON.stringify(pillsAbsent));
  console.log('§POSTED-MOBILE absent note=' + JSON.stringify(rAbsent.note) + ' pills=' + JSON.stringify(pillsAbsent));

  ad.close(); projDb.close();
  console.log('\n═══ ' + (fails === 0 ? '✅ POC-ACCTS-POSTED ALL PASS' : '❌ POC-ACCTS-POSTED ' + fails + ' FAIL') +
    ' — panel renders the engine fold VERBATIM; gate zero-leak holds at the DOM; coverage honest ═══');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.error('FATAL', e); process.exit(2); });
