// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope guard
// Scope: headless §-witness for feed_fold.js (LENS family, lane-3 worker feed-fold).
//   THE CLAIM (prompts/MOBILE_CHAT_LENS.md §"Thread list / inbox = work queue, push not pull"):
//   the chat thread-list is an INBOX = the subset of REAL docs needing the role's action, RANKED by
//   REAL fields, role-SCOPED by the engine seam (ENGINE_CONTRACT §2). This test runs FeedFold.rank
//   over the SAME glassbowl_data.db the chat/kanban POCs use, and asserts:
//     §FEED       — every inbox item is a real doc needing action (handAuthored=0).
//     §FEED-RANK  — ordering comes from real fields [docstatus,date,amount] (fabricatedScore=0).
//     §FEED-SCOPE — the inbox is role/org-scoped; out-of-scope rows never appear (mirror the seam).
//   §-log first — READ tests/poc_feed.log before any conclusion.
//
//   HONESTY (non-invent): the resident seed is ALL-TERMINAL (docstatus ∈ {CO,CL}); per the kanban
//   POC caveat "board sparse (seed all-CO)". So over the REAL seed the inbox is correctly EMPTY —
//   reported as items=0, NOT fabricated. To prove the rank/scope LOGIC actually fires, a clearly
//   LABELLED derived fixture flips docstatus on COPIES of real rows to REAL wfmc states (DR/IP/IN).
//   The fixture is marked derived=1; it is never claimed to be seed data.
//
// Run: node tests/poc_feed.js 2>&1 | tee tests/poc_feed.log     (cwd = bim-ootb/erp)
'use strict';
var fs = require('fs'), path = require('path');
var initSqlJs = require('sql.js');
var ERP = path.join(__dirname, '..');

global.window = global.window || {};                       // browser IIFEs
var FeedFold = require(path.join(ERP, 'feed_fold.js'));

// REAL wfmc machine — sourced from the engine manifest, not invented (mirrors feed_fold defaults).
var wfmc = require(path.join(ERP, 'manifest.json')).wfmc;
var TRANSITIONS = wfmc.transitions;

var fails = 0;
function verdict(ok, label, detail) {
  if (!ok) fails++;
  console.log('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : ''));
}
function rows(db, sql) {
  var r = db.exec(sql); if (!r.length) return [];
  var cols = r[0].columns;
  return r[0].values.map(function (v) { var o = {}; for (var i = 0; i < cols.length; i++) o[cols[i]] = v[i]; return o; });
}

(async function () {
  console.log('═══ POC-FEED — thread-list-as-inbox: docs needing the role\'s action, ranked (REAL data) ═══\n');
  var SQL = await initSqlJs();
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'glassbowl_data.db'))));

  // The three doc tables, keyed by AD ids, with the REAL columns the rank reads from.
  var DEFS = [
    { table: 'C_Invoice', idCol: 'c_invoice_id', dateCol: 'dateinvoiced', amountCol: 'grandtotal' },
    { table: 'C_Order',   idCol: 'c_order_id',   dateCol: 'dateordered',  amountCol: 'grandtotal' },
    { table: 'C_Payment', idCol: 'c_payment_id', dateCol: 'datetrx',      amountCol: 'payamt'     }
  ];
  function loadGroups(orgFilter) {
    return DEFS.map(function (d) {
      var sql = 'SELECT ' + d.idCol + ', ad_org_id, docstatus, ' + d.dateCol + ', ' + d.amountCol +
                ' FROM ' + d.table.toLowerCase() +
                (orgFilter != null ? ' WHERE ad_org_id=' + orgFilter : '');
      return { table: d.table, idCol: d.idCol, statusCol: 'docstatus', dateCol: d.dateCol, amountCol: d.amountCol, rows: rows(db, sql) };
    });
  }

  var ctx = { roleId: 1000000 /*AD_Role*/, allowOrgs: [11], transitions: TRANSITIONS };

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // §FEED — the inbox over the REAL seed: every item is a real doc needing action (handAuthored=0).
  //   ISSUE proven/disproven: "does the inbox surface ONLY real actionable docs (no fabrication)?"
  //   With an all-terminal seed the honest answer is items=0 — and that 0 is itself the proof that
  //   settled docs (CO/CL) are correctly excluded.
  // ════════════════════════════════════════════════════════════════════════════════════════════
  console.log('── §FEED ── (real resident seed)');
  var seedGroups = loadGroups(null);
  var totalSeed = seedGroups.reduce(function (n, g) { return n + g.rows.length; }, 0);
  var seedStatuses = {};
  seedGroups.forEach(function (g) { g.rows.forEach(function (r) { seedStatuses[r.docstatus] = (seedStatuses[r.docstatus] || 0) + 1; }); });
  var feed = FeedFold.rank(seedGroups, ctx);
  var everyReal = feed.items.every(function (it) { return it.handAuthored === 0 && it.source === 'docstatus-fold' && it.key && it.key.record != null; });
  var everyActionable = feed.items.every(function (it) { return FeedFold.isActionable(it.docStatus, TRANSITIONS); });
  console.log('   seed docs=' + totalSeed + ' statuses=' + JSON.stringify(seedStatuses) + ' (all-terminal → expect inbox 0)');
  console.log('§FEED items=' + feed.items.length + ' source=docstatus-fold handAuthored=0');
  verdict(everyReal, 'every inbox item is a real doc keyed by AD ids (no fabrication)', 'handAuthored=0 items=' + feed.items.length);
  verdict(everyActionable, 'every inbox item is a genuinely actionable (non-settled) wfmc state', 'actionableOnly=' + everyActionable);
  verdict(feed.items.length === 0, 'all-terminal seed yields an EMPTY inbox (settled CO/CL excluded, not fabricated)', 'items=' + feed.items.length);

  // ── derived fixture (LABELLED, non-seed): flip docstatus on COPIES of real rows to REAL wfmc
  //    states so the rank/scope LOGIC actually fires. Values (id/date/amount/org) stay REAL; only
  //    docstatus is set to a legitimate wfmc state. Marked derived=1 — never claimed as seed data.
  function derive(orgFilter) {
    var FLIPS = ['DR', 'IP', 'IN', 'DR', 'IP'];               // real wfmc actionable states, round-robin
    var groups = loadGroups(orgFilter); var k = 0;
    groups.forEach(function (g) {
      g.rows.forEach(function (r) { r.docstatus = FLIPS[k % FLIPS.length]; r._derived = 1; k++; });
    });
    return groups;
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // §FEED-RANK — ranking from REAL fields only, no fabricated score.
  //   ISSUE: "is the order produced by real fields [docstatus,date,amount], or by an invented score?"
  // ════════════════════════════════════════════════════════════════════════════════════════════
  console.log('\n── §FEED-RANK ── (derived fixture — docstatus flipped to REAL wfmc states; id/date/amount REAL)');
  var dGroups = derive(null);
  var dFeed = FeedFold.rank(dGroups, ctx);
  var order = dFeed.items.map(function (it) { return it.key.table + '#' + it.key.record + '(' + it.docStatus + ')'; });
  dFeed.items.forEach(function (it) {
    console.log('   ' + (FeedFold.STATE_PRIORITY[it.docStatus]) + ' ' + it.key.table + '#' + it.key.record +
      ' ' + it.docStatus + ' date=' + it.date + ' amt=' + it.amount + ' verbs=[' + it.pendingVerbs.join(',') + ']');
  });
  // recompute the expected order independently from the SAME real fields → must agree (deterministic).
  var expected = dFeed.items.slice().sort(function (a, b) {
    var pa = FeedFold.STATE_PRIORITY[a.docStatus], pb = FeedFold.STATE_PRIORITY[b.docStatus];
    if (pa !== pb) return pa - pb;
    if ((a.date || '') !== (b.date || '')) return (a.date || '') < (b.date || '') ? -1 : 1;
    return (b.amount || 0) - (a.amount || 0);
  }).map(function (it) { return it.key.table + '#' + it.key.record + '(' + it.docStatus + ')'; });
  var orderOk = JSON.stringify(order) === JSON.stringify(expected);
  // monotonic priority check: no item ranks before one with a strictly more-urgent docstatus.
  var monotonic = true;
  for (var i = 1; i < dFeed.items.length; i++) {
    if (FeedFold.STATE_PRIORITY[dFeed.items[i - 1].docStatus] > FeedFold.STATE_PRIORITY[dFeed.items[i].docStatus]) monotonic = false;
  }
  console.log('§FEED-RANK order=' + JSON.stringify(order) + ' by=[docstatus,date,amount] fabricatedScore=' + dFeed.fabricatedScore);
  verdict(dFeed.fabricatedScore === 0, 'no fabricated per-doc score — order is a fold of real fields', 'fabricatedScore=' + dFeed.fabricatedScore);
  verdict(orderOk, 'order is reproducible from real fields alone (deterministic)', 'order==recomputed');
  verdict(monotonic, 'inbox is sorted by real docstatus urgency (IN<WC<IP<WP<DR)', 'monotonic=' + monotonic);
  verdict(JSON.stringify(dFeed.rankedBy) === JSON.stringify(['docstatus', 'date', 'amount']), 'rankedBy advertises the real fields', dFeed.rankedBy.join(','));

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // §FEED-SCOPE — the inbox is role/org-scoped; out-of-scope rows never appear (mirror the seam).
  //   ISSUE: "does the inbox honour ctx.allowOrgs (engine-enforced read scope), surfacing 0 out of
  //   scope?" The fold consumes ALREADY-scoped rows; this asserts it never widens scope.
  // ════════════════════════════════════════════════════════════════════════════════════════════
  console.log('\n── §FEED-SCOPE ── (read() delivers only allowOrgs rows; fold must not widen)');
  var orgInScope = ctx.allowOrgs[0];                          // 11 — the only org in the seed
  // engine-scoped read: rows for the allowed org only (this mirrors read(query, ctx)).
  var scopedGroups = derive(orgInScope);
  var scopedFeed = FeedFold.rank(scopedGroups, ctx);
  // an org the role has NO access to → the seam returns ZERO rows (empty, not filtered-after).
  var outOrg = 999;
  var outGroups = derive(outOrg);                             // WHERE ad_org_id=999 → no rows
  var outFeed = FeedFold.rank(outGroups, ctx);
  var allInScope = scopedFeed.items.every(function (it) { return it.orgId === orgInScope; });
  console.log('   in-scope org=' + orgInScope + ' inboxItems=' + scopedFeed.items.length +
    ' · out-of-scope org=' + outOrg + ' seamRows=' + outFeed.inScope + ' inboxItems=' + outFeed.items.length);
  console.log('§FEED-SCOPE role=' + ctx.roleId + ' inScope=' + scopedFeed.items.length + ' outOfScope=' + outFeed.items.length);
  verdict(scopedFeed.items.length > 0, 'in-scope org yields a non-empty inbox (the fold fires under scope)', 'inScope=' + scopedFeed.items.length);
  verdict(allInScope, 'every inbox item belongs to an allowed org (fold never widens scope)', 'allInScope=' + allInScope);
  verdict(outFeed.items.length === 0 && outFeed.inScope === 0, 'an org outside allowOrgs returns ZERO rows → ZERO inbox (empty, not filtered-after)', 'outOfScope=' + outFeed.items.length);

  // ── API shape echo (so F1 can integrate by key) ──
  console.log('\n── window.FeedFold API (for F1 integration by key) ──');
  console.log('   rank(groups, ctx) → { items[{key:{table,column,record}, docStatus, docStatusLabel, date, amount, pendingVerbs[], orgId, source, handAuthored}], rankedBy[], fabricatedScore, inScope, outOfScope }');
  console.log('   isActionable(status, transitions) · pendingVerbs(status, transitions) · toItem(row, opts)');

  console.log('\n═══ ' + (fails === 0
    ? '✅ POC-FEED ALL PASS — inbox = real actionable docs, ranked by real fields, role-scoped (seed all-terminal → real inbox empty; logic proven on labelled derived fixture)'
    : '❌ POC-FEED ' + fails + ' FAIL') + ' ═══');
  process.exit(fails === 0 ? 0 : 1);
})().catch(function (e) { console.error('FATAL: ' + e.message + '\n' + e.stack); process.exit(1); });
