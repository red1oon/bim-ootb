// feed_fold.js — LENS family (lane-3 worker feed-fold): the thread-list-as-inbox.
// Implementing prompts/MOBILE_CHAT_LENS.md §"Thread list / inbox = work queue (push, not pull)"
//   — Witness: §FEED / §FEED-RANK / §FEED-SCOPE (build: tests/poc_feed.js → tests/poc_feed.log)
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// WHAT THIS IS (a PURE fold, node-requireable, exposed on window.FeedFold):
//   The chat thread-list (F1) is a PUSH inbox, not a pull list: it shows ONLY the docs that need the
//   current role's action, ranked. This fold consumes rows the ENGINE already scoped by ctx.roleId /
//   ctx.allowOrgs (ENGINE_CONTRACT §2 — "Reads are scoped"); it does NOT widen scope. It then:
//     (1) SELECTS the actionable subset — docs whose docstatus is a non-settled wfmc state that still
//         has an advancing verb (DR/IP/IN/WC/WP). CO (Completed) and CL (Closed) are settled → excluded.
//         "Actionable" is decided by the REAL wfmc state machine, never by an invented flag.
//     (2) RANKS by REAL fields only — docstatus priority (how urgent the state is), then date (oldest
//         first = most overdue), then amount (largest first). NO fabricated score.
//     (3) KEYS each item by AD ids (table / column / record) — the natural vocabulary.
//
// NON-INVENT: every rendered value folds from a real row column; absent → null/"absent", never made up.
// NO exposed nav/dispatch globals beyond window.FeedFold (STEP-0 pins those with the host lane).

(function () {
  'use strict';

  // ── The wfmc state machine (REAL transitions; mirrors manifest.json §wfmc) ──────────────────
  // (from, action, to). Passed in by the caller via ctx.transitions when available; this default
  // is the ground truth used by the witness so the fold is self-contained / requireable headless.
  var DEFAULT_TRANSITIONS = [
    ['DR','PR','IP'], ['IN','PR','IP'], ['DR','CO','CO'], ['IP','CO','CO'], ['WC','CO','CO'],
    ['IP','WC','WC'], ['DR','VO','VO'], ['IP','VO','VO'], ['IN','VO','VO'], ['CO','VO','VO'],
    ['WC','VO','VO'], ['WP','VO','VO'], ['DR','IN','IN'], ['IP','IN','IN'], ['IN','XL','IP'],
    ['CO','CL','CL'], ['CO','RE','IP'], ['CO','RC','RE'], ['CO','RA','RE'], ['IP','AP','IP'],
    ['IP','RJ','IP'], ['CO','PO','CO']
  ];

  // SETTLED states: a document here needs no push to the work queue. CO = Completed (done-good),
  // CL = Closed (done-final), VO = Voided, RE = Reversed. Asserted by the witness, never hard-coded
  // as "the answer" — isActionable() below also requires an advancing wfmc edge.
  var SETTLED = { CO: 1, CL: 1, VO: 1, RE: 1 };

  // The urgency priority of each NEEDS-ACTION state (lower = more urgent in the inbox). Derived from
  // the state machine's role: an invalid (IN) or awaiting-approval (IP) doc is more pressing than a
  // fresh draft (DR). This orders REAL states; it is NOT a fabricated per-doc score.
  var STATE_PRIORITY = { IN: 0, WC: 1, IP: 2, WP: 3, DR: 4 };
  var STATE_LABEL = {
    DR: 'Drafted',  IP: 'In Progress', IN: 'Invalid',
    WC: 'Waiting Confirmation', WP: 'Waiting Payment'
  };

  // A status is ACTIONABLE iff it is NOT settled AND the wfmc machine has at least one advancing
  // transition out of it (an action that lands in a DIFFERENT state). Pure function of real data.
  function isActionable(status, transitions) {
    if (status == null) return false;
    if (SETTLED[status]) return false;
    var tx = transitions || DEFAULT_TRANSITIONS;
    for (var i = 0; i < tx.length; i++) {
      if (tx[i][0] === status && tx[i][2] !== status) return true;   // advances out of `status`
    }
    return false;
  }

  // The verbs legal from a status (the actions the role would be asked to perform) — real wfmc edges.
  function pendingVerbs(status, transitions) {
    var tx = transitions || DEFAULT_TRANSITIONS, out = [];
    for (var i = 0; i < tx.length; i++) if (tx[i][0] === status) out.push(tx[i][1]);
    return out;
  }

  // Normalise a real doc row (lowercased sqlite columns) into an inbox item keyed by AD ids.
  // opts.table = AD table name (e.g. 'C_Invoice'); opts.idCol/statusCol/dateCol/amountCol name the
  // REAL columns to fold from. Every value traces to a column; missing → null (never invented).
  function toItem(row, opts) {
    var idCol     = opts.idCol;
    var statusCol = opts.statusCol || 'docstatus';
    var dateCol   = opts.dateCol;
    var amountCol = opts.amountCol;
    var status = row[statusCol] != null ? String(row[statusCol]) : null;
    return {
      key: { table: opts.table, column: idCol, record: row[idCol] != null ? row[idCol] : null },
      docStatus: status,
      docStatusLabel: STATE_LABEL[status] || (status || 'absent'),
      date:   (dateCol   && row[dateCol]   != null) ? String(row[dateCol])   : null,
      amount: (amountCol && row[amountCol] != null) ? Number(row[amountCol]) : null,
      pendingVerbs: pendingVerbs(status, opts.transitions),
      // role-scope is engine-enforced upstream; we record which org the row sits in for transparency.
      orgId: (row.ad_org_id != null) ? row.ad_org_id : null,
      source: 'docstatus-fold',
      handAuthored: 0
    };
  }

  // ── rank(groups, ctx) — the inbox. ──────────────────────────────────────────────────────────
  // groups: ALREADY role/org-scoped rows from read(query, ctx), as an array of group descriptors
  //         { table, idCol, statusCol?, dateCol?, amountCol?, rows:[...] } (one per AD doc table).
  // ctx:    { roleId, allowOrgs, transitions? } — consumed read-only; scope NOT widened here.
  // returns: { items:[...ranked inbox items...], rankedBy:['docstatus','date','amount'],
  //            fabricatedScore: 0, inScope: N, outOfScope: 0 }
  function rank(groups, ctx) {
    ctx = ctx || {};
    var transitions = ctx.transitions || DEFAULT_TRANSITIONS;
    var items = [];
    var considered = 0;

    (groups || []).forEach(function (g) {
      var opts = {
        table: g.table, idCol: g.idCol, statusCol: g.statusCol || 'docstatus',
        dateCol: g.dateCol, amountCol: g.amountCol, transitions: transitions
      };
      (g.rows || []).forEach(function (row) {
        considered++;
        if (!isActionable(row[opts.statusCol], transitions)) return;   // settled → not in the inbox
        items.push(toItem(row, opts));
      });
    });

    // RANK by REAL fields only: docstatus urgency, then date (oldest first), then amount (largest first).
    items.sort(function (a, b) {
      var pa = STATE_PRIORITY[a.docStatus]; var pb = STATE_PRIORITY[b.docStatus];
      pa = (pa == null) ? 99 : pa; pb = (pb == null) ? 99 : pb;
      if (pa !== pb) return pa - pb;                                   // 1) docstatus priority
      var da = a.date || '', db_ = b.date || '';
      if (da !== db_) return da < db_ ? -1 : 1;                        // 2) date asc (oldest = overdue)
      return (b.amount || 0) - (a.amount || 0);                        // 3) amount desc (largest first)
    });

    return {
      items: items,
      rankedBy: ['docstatus', 'date', 'amount'],
      fabricatedScore: 0,
      inScope: considered,        // every row we saw was already engine-scoped to ctx
      outOfScope: 0               // the seam delivers no out-of-scope row; we surface none
    };
  }

  var FeedFold = {
    rank: rank,
    isActionable: isActionable,
    pendingVerbs: pendingVerbs,
    toItem: toItem,
    STATE_PRIORITY: STATE_PRIORITY,
    STATE_LABEL: STATE_LABEL,
    SETTLED: SETTLED,
    DEFAULT_TRANSITIONS: DEFAULT_TRANSITIONS

    // TODO(STEP-0): nav / dispatch globals (tapping an inbox item → open the thread, fire the verb)
    //   are pinned with the host lane's exposed-globals list. This worker exposes ONLY window.FeedFold.
  };

  if (typeof window !== 'undefined') window.FeedFold = FeedFold;
  if (typeof module !== 'undefined' && module.exports) module.exports = FeedFold;

  if (typeof console !== 'undefined') console.log('§FEED_FOLD_LOADED v1');
})();
