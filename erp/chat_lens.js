// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope guard
// Scope: LENS lane-3 worker F1 — the CHAT CHROME (mobile-first). A NEW LENS over the SAME op-log
//   engine: the ERP rendered as a WhatsApp/Telegram thread. THIS FILE IS A RENDERER ONLY. It folds
//   an ALREADY-BUILT op-log (kernel_ops rows) + source rows into a thread view-model and mounts it
//   to the DOM. It NEVER builds, signs, or mutates the log — the op-log is engine-owned and reached
//   ONLY via the seam (docs/ENGINE_CONTRACT.md read/dispatch/verify).
// Spec: prompts/MOBILE_CHAT_LENS.md (mapping table · pills-as-flips · verified tick · dismiss-as-view).
// Proven fold: build/erp/poc_chat.log (§CHAT-THREAD/REPLAY/DISMISS/ANCHOR/COVERAGE) — this file is the
//   browser-chrome counterpart of scripts/poc_chat.js's pure thread fold; same op→bubble mapping.
// NON-INVENT: every bubble traces to a real op (sender=user_tag, verb=op_type, body=payload,
//   time=timestamp); handAuthored=0; absent data is LABELLED "absent", never fabricated.
// §-log first; deterministic; NO deploy (EXPLICIT GO required).
//
// Factoring (per the card):
//   (a) PURE view-model builder  — buildThreadVM(ops, src)            node-requireable, no DOM
//       + pill-flip view ops      — flipRecentChanges / flipReplay / flipAnchor / dismiss / restore
//   (b) thin DOM mount            — mountChat(root, vm)               mobile-first bubbles + thread-list
//
// Exposed-globals are NOT invented here (the host lane pins them):
//   // TODO(STEP-0): window.send = dispatch (the seam write path) — left a marked stub.
//   // TODO(STEP-0): nav globals (open record / open thread) — left a marked stub.
//   // TODO(integrate): sender display names via window.UserNames.resolveTag(user_tag, adUserRows) —
//                       keyed; falls back to the raw user_tag if that worker's module is absent.
//   // TODO(integrate): thread-list ranking via window.FeedFold.rank(threads) — keyed, falls back
//                       to time-order if that worker's module is absent.

'use strict';

(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;       // node witness
  if (typeof window !== 'undefined') window.ChatLens = api;                          // browser mount
})(this, function () {

  // ── money formatter (mirrors scripts/poc_chat.js: round-half-to-cent, 2 dp) ──
  function money(n) { return (Math.round(Number(n || 0) * 100) / 100).toFixed(2); }

  // ── sender display name — KEYED by the chat `user:<id>` tag (AD_User-shaped). Another worker owns
  //    user_names.js; we only CALL its expected export by key, never create/edit it. The tag-aware
  //    export is `window.UserNames.resolveTag(userTag, adUserRows)` (it parses `user:<id>` then folds
  //    the AD_User name) → returns { id, name, resolved, source }. Optional adUserRows are passed
  //    through when the host supplies them. Fallback (module/rows absent) = the raw tag (honest). ──
  function resolveSender(userTag, adUserRows) {
    // TODO(integrate): window.UserNames.resolveTag(userTag, adUserRows) — keyed to user_names.js.
    if (typeof window !== 'undefined' && window.UserNames && typeof window.UserNames.resolveTag === 'function') {
      var r = window.UserNames.resolveTag(userTag, adUserRows || []);
      if (r && r.name) return r.name;            // resolved AD_User name (or the module's honest fallback)
    }
    return userTag != null ? String(userTag) : 'absent';
  }

  // ── coverage fold — the "posted" message degrades HONESTLY (spec MOBILE_CHAT_LENS.md:104-109;
  //    mirrors §CHAT-COVERAGE in scripts/poc_chat.js). The host hands the engine read of `fact_acct`
  //    (the client-level books aggregate) + whether a per-doc link exists; this FOLDS it the proven
  //    way — NEVER an invented per-doc journal. Shape of `fa`:
  //      { rows, dr, cr, docLinkable }   (dr/cr = ROUND(SUM(amtacctdr|cr),2) over fact_acct)
  //    Returns a LABELLED coverage object:
  //      { source:'fact_acct', coverage:'partial'|'complete', clientDr, clientCr, balanced,
  //        note, fabricated:0 }
  //    Absent fact_acct read → LABELLED absent (coverage:'absent', fabricated:0), never fabricated. ──
  function foldCoverage(fa) {
    if (!fa) {
      return { source: 'fact_acct', coverage: 'absent', clientDr: 'absent', clientCr: 'absent',
               balanced: false, note: 'fact_acct not read in this context', fabricated: 0 };
    }
    var dr = money(fa.dr), cr = money(fa.cr);
    var docLinkable = !!fa.docLinkable;                         // per-doc link present? (record_id+ad_table_id)
    return {
      source: 'fact_acct',
      coverage: docLinkable ? 'complete' : 'partial',          // per-doc journal vs client-level only
      clientDr: dr,
      clientCr: cr,
      balanced: dr === cr,                                     // ΣDr == ΣCr at CLIENT level
      note: docLinkable ? 'per-doc available' : 'install local for per-doc',
      fabricated: 0                                            // NEVER a fabricated per-doc journal
    };
  }

  // ── thread-list ordering — the chat inbox order. Default = time-order (deterministic).
  //    NOTE: feed_fold.js's window.FeedFold.rank(groups, ctx) ranks ACTIONABLE doc ROWS into inbox
  //    items from AD-table GROUP descriptors — a DIFFERENT contract from this per-thread list, so we
  //    do NOT mis-call it on thread rows. The host lane wires FeedFold at the inbox-population layer
  //    (which threads/docs need this role's action) and hands the ranked set in; this lens then folds
  //    each into a thread row. Until then, deterministic time-order. ──
  function rankThreads(threads) {
    // TODO(integrate): host supplies the FeedFold-ranked inbox (window.FeedFold.rank(groups, ctx))
    //                  at the inbox-population layer; this lens renders the handed-in order.
    return threads.slice().sort(function (a, b) { return (a.lastTs || 0) - (b.lastTs || 0); });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // (a) PURE VIEW-MODEL BUILDER — ops[] + source rows → thread view-model.
  //   ops  : kernel_ops rows AS RETURNED BY THE ENGINE (read), each:
  //          { op_uuid, timestamp, op_type, parameters(JSON string OR object), output_guid, user_tag }
  //   src  : { invoiceNo, bpartner, grandtotal, lines, humanTime, doc, factAcct } — folded source
  //          labels for the doc-level header (optional; absent → labelled "absent", never fabricated).
  //          src.factAcct (optional) = the engine read of the client-level books
  //          { rows, dr, cr, docLinkable } → folded via foldCoverage into vm.coverage (absent → labelled).
  //   Returns a view-model that is a FAITHFUL FOLD: every bubble.id == a real op_uuid; nothing minted.
  // ════════════════════════════════════════════════════════════════════════════
  function buildThreadVM(ops, src) {
    src = src || {};
    var humanTime = src.humanTime || {};                          // op_type → human-readable created/updated
    var bubbles = ops.map(function (row, i) {
      // parameters may arrive as a JSON string (sqlite) or already-parsed object.
      var rich = (typeof row.parameters === 'string') ? JSON.parse(row.parameters) : (row.parameters || {});
      var p = rich.payload || {};
      var traced = !!rich.payload;                                // a real op carries a payload
      var body;
      switch (row.op_type) {
        case 'CREATE_DOCUMENT':
          body = 'created ' + (p.table || '?') + ' ' + (p.documentno != null ? p.documentno : 'absent') +
                 ' · ' + (p.bpartner != null ? p.bpartner : 'absent') + ' · ' + money(p.grandtotal);
          break;
        case 'CREATE_LINE':
          body = 'line ' + (p.line_no != null ? p.line_no : 'absent') +
                 ' · product ' + (p.product != null ? p.product : 'absent') + ' · ' + money(p.linenetamt);
          break;
        case 'SET_STATUS':
          body = '▸ ' + (rich.before != null ? rich.before : 'absent') + ' → ' + (rich.after != null ? rich.after : 'absent');
          break;
        default:
          body = row.op_type || 'absent';
      }
      // VERIFIED TICK — FOLD from the op's seal/sign state, NEVER invented (spec §verified tick):
      //   sealed  = the op carries a hash-chain seal (op_hash) → tamper-evident → tick '✓'.
      //   signed  = it also carries an edge signature (sig)    → authenticated → lock '🔒'.
      //   In the proven engine (scripts/erp_kernel.js) the at-commit recorded-identity input is the
      //   stamped op_uuid + lineage output_guid; the hash-chain seal (kernel_ops.js op_hash/sig) is
      //   applied at the persistence seam. We fold WHATEVER is present and label the rest absent.
      var sealed = row.op_hash != null && row.op_hash !== '';
      var signed = row.sig != null && row.sig !== '';
      var hasIdentity = row.output_guid != null && row.op_uuid != null;   // recorded-identity input (always, in-engine)
      var tick = signed ? '🔒' : (sealed ? '✓' : (hasIdentity ? '·' : ''));   // '·' = identity-stamped, not yet sealed
      var tickSource = signed ? 'sign' : (sealed ? 'seal' : (hasIdentity ? 'identity' : 'none'));

      return {
        id: row.op_uuid,                       // a real op_uuid — NOT minted by the renderer
        sender: row.user_tag,                  // raw tag (display name resolved at render via resolveSender)
        senderName: resolveSender(row.user_tag),
        verb: row.op_type,
        body: body,
        ts: row.timestamp,                     // machine order (deterministic)
        time: humanTime[row.op_type] != null ? humanTime[row.op_type] : (row.timestamp != null ? row.timestamp : 'absent'),
        outgoing: i === ops.length - 1,        // mobile reflow hint: last act renders as the user's own bubble
        traced: traced,                        // a real op (handAuthored if false)
        tick: tick,
        tickSource: tickSource,
        sealed: sealed,
        signed: signed
      };
    });

    var handAuthored = bubbles.filter(function (b) { return !b.traced; }).length;
    var lastTs = bubbles.length ? bubbles[bubbles.length - 1].ts : 0;

    // doc-level thread header — folded from source labels (absent → "absent", never fabricated).
    var header = {
      doc: src.doc != null ? src.doc : 'absent',
      documentno: src.invoiceNo != null ? src.invoiceNo : 'absent',
      bpartner: src.bpartner != null ? src.bpartner : 'absent',
      grandtotal: src.grandtotal != null ? money(src.grandtotal) : 'absent'
    };

    // thread-list (inbox) — one entry per doc/thread. Single thread here; the shape supports many.
    var threadList = [{
      id: header.doc,
      title: header.documentno + ' · ' + header.bpartner,
      lastVerb: bubbles.length ? bubbles[bubbles.length - 1].verb : 'absent',
      lastTs: lastTs,
      count: bubbles.length
    }];

    return {
      header: header,
      bubbles: bubbles,                        // the full, faithful fold (N bubbles)
      handAuthored: handAuthored,              // MUST be 0 for a faithful fold
      logRows: ops.length,                     // the source op-log row count (a view never changes this)
      dismissed: {},                           // dismissed-set is a SET of op_uuids (view-only)
      view: 'thread',                          // active pill flip: 'thread' | 'recent' | 'replay' | 'anchor'
      anchor: null,                            // anchor view payload (set by flipAnchor)
      threadList: rankThreads(threadList),     // KEYED feed ranking (fallback = time-order)
      // ── COVERAGE — the posted-message degrade, folded the PROVEN way (§CHAT-COVERAGE). Books
      //    balanced at CLIENT level (real fact_acct); per-doc labelled 'partial', never fabricated.
      //    Absent fact_acct read → labelled 'absent'. Rendered as an honest posting strip in mountChat. ──
      coverage: foldCoverage(src.factAcct),
      // ── MOBILE REFLOW — the view-model EXPOSES the phone-layout fields (spec §mobile reflow) ──
      mobile: {
        viewport: 'mobile',                    // mobile-first
        threadList: true,                      // a thread-list (inbox) reflows on a phone
        bubbles: true,                         // bubbles reflow on a phone
        layout: 'stacked',                     // single-column stacked bubbles
        bubbleMaxWidthPct: 78,                 // bubble cap as % of viewport (chat-shaped)
        threadListCollapsible: true            // inbox collapses behind the active thread on narrow widths
      }
    };
  }

  // ── visibleBubbles — the fold MINUS the dismissed-set (view filter; log untouched).
  //    REPLAY is a PROGRESSIVE REVEAL (spec MOBILE_CHAT_LENS.md:59, §CHAT-REPLAY): when the view is
  //    'replay', reveal only the FIRST vm.replayStep bubbles IN OP ORDER (the scrub from t0). This is
  //    a PURE view-op over the view-model — the op-log is NEVER sliced or mutated; vm.bubbles is the
  //    full faithful fold and stays intact. For every other view it is the full fold minus dismissals. ──
  function visibleBubbles(vm) {
    var live = vm.bubbles.filter(function (b) { return !vm.dismissed[b.id]; });
    if (vm.view === 'replay' && vm.replayStep != null) {
      return live.slice(0, Math.max(0, Math.min(vm.replayStep, live.length)));   // reveal t0..replayStep
    }
    return live;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PILLS-AS-FLIPS — each toggles the VIEW-MODEL only; NONE mutate the op-log.
  //   All return the SAME vm (mutated view-state). vm.logRows is NEVER touched here.
  // ════════════════════════════════════════════════════════════════════════════

  // swipe-off ONE bubble → add to the dismissed-set (visible = N − swiped). View-only.
  function dismiss(vm, opUuid) { vm.dismissed[opUuid] = true; return vm; }

  // a pill flip RESTORES all dismissed bubbles — the log is the source of truth (Kernel.replay-exact).
  function restoreAll(vm) { vm.dismissed = {}; return vm; }

  // Recent Changes pill — show the latest ops across threads (and CLEAR dismissals: the change feed
  //   is the source-of-truth view, so swiped bubbles RETURN). View-only.
  function flipRecentChanges(vm) { vm.view = 'recent'; restoreAll(vm); return vm; }

  // Replay pill — scrub from t0 (event-sourcing made visible). Swiped bubbles RETURN because the log
  //   is the source. step = how many ops to reveal (null = all). View-only.
  function flipReplay(vm, step) {
    vm.view = 'replay';
    restoreAll(vm);
    vm.replayStep = (step == null) ? vm.bubbles.length : Math.max(0, Math.min(step, vm.bubbles.length));
    return vm;
  }

  // Anchor pill — pin a focal entity; line up related docs. The related-doc fold is supplied by the
  //   ENGINE (read over FKs) — the renderer does NOT compute it (non-invent). View-only.
  function flipAnchor(vm, anchorFold) {
    vm.view = 'anchor';
    // anchorFold = { entity, relatedDocs:[...], lastAction, outstanding } from the engine read; absent → labelled.
    vm.anchor = anchorFold || { entity: 'absent', relatedDocs: [], lastAction: 'absent', outstanding: 0 };
    return vm;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // (b) THIN DOM MOUNT — mobile-first bubbles + thread-list. Renders the view-model; no engine logic.
  //   Pure DOM; the witness never calls this (it asserts the view-model structure instead).
  // ════════════════════════════════════════════════════════════════════════════
  function mountChat(root, vm) {
    if (!root || typeof document === 'undefined') return;
    root.innerHTML = '';
    root.className = 'chatlens chatlens--mobile';

    // thread-list (inbox) — collapsible on narrow widths.
    var inbox = document.createElement('div');
    inbox.className = 'chatlens__inbox';
    vm.threadList.forEach(function (t) {
      var row = document.createElement('div');
      row.className = 'chatlens__thread';
      row.setAttribute('data-thread', t.id);
      row.textContent = t.title + '  (' + t.count + ')';
      // TODO(STEP-0): open thread — host nav global, left a marked stub.
      row.onclick = function () { /* TODO(STEP-0): window.openThread && window.openThread(t.id); */ };
      inbox.appendChild(row);
    });
    root.appendChild(inbox);

    // header
    var head = document.createElement('div');
    head.className = 'chatlens__header';
    head.textContent = vm.header.documentno + ' · ' + vm.header.bpartner + ' · ' + vm.header.grandtotal;
    root.appendChild(head);

    // posting strip — the COVERAGE degrade shown HONESTLY in the lens (spec §104-109). NEVER claims a
    //   per-doc journal it lacks: client-level books balance (real fact_acct) + per-doc labelled partial.
    var cov = vm.coverage || {};
    var post = document.createElement('div');
    post.className = 'chatlens__posting chatlens__posting--' + (cov.coverage || 'absent');
    if (cov.coverage === 'absent') {
      post.textContent = 'Posted: fact_acct absent (labelled, not fabricated)';
    } else {
      post.textContent = 'Posted (' + cov.coverage + ') · books balanced at client: Dr ' + cov.clientDr +
        ' = Cr ' + cov.clientCr + (cov.balanced ? ' ✓' : ' ✗') + ' · ' + cov.note;
    }
    post.setAttribute('data-coverage', cov.coverage || 'absent');
    root.appendChild(post);

    // bubbles (visible = fold minus dismissed-set)
    var thread = document.createElement('div');
    thread.className = 'chatlens__thread-body';
    visibleBubbles(vm).forEach(function (b) {
      var bub = document.createElement('div');
      bub.className = 'chatlens__bubble ' + (b.outgoing ? 'chatlens__bubble--out' : 'chatlens__bubble--in');
      bub.setAttribute('data-op', b.id);
      var meta = document.createElement('div');
      meta.className = 'chatlens__meta';
      meta.textContent = b.senderName + ' · ' + b.time + ' ' + b.tick;
      var body = document.createElement('div');
      body.className = 'chatlens__body';
      body.textContent = b.body;
      bub.appendChild(meta); bub.appendChild(body);
      thread.appendChild(bub);
    });
    root.appendChild(thread);

    // pill bar (view flips) — each is a VIEW op, never a chrome rebuild / log mutation.
    var pills = document.createElement('div');
    pills.className = 'chatlens__pills';
    [['Recent', function () { flipRecentChanges(vm); mountChat(root, vm); }],
     ['Replay', function () { flipReplay(vm, null); mountChat(root, vm); }],
     ['Anchor', function () { flipAnchor(vm, vm.anchor); mountChat(root, vm); }]
    ].forEach(function (p) {
      var btn = document.createElement('button');
      btn.className = 'chatlens__pill';
      btn.textContent = p[0];
      btn.onclick = p[1];
      pills.appendChild(btn);
    });
    root.appendChild(pills);
  }

  return {
    buildThreadVM: buildThreadVM,
    visibleBubbles: visibleBubbles,
    dismiss: dismiss,
    restoreAll: restoreAll,
    flipRecentChanges: flipRecentChanges,
    flipReplay: flipReplay,
    flipAnchor: flipAnchor,
    mountChat: mountChat,
    resolveSender: resolveSender,
    rankThreads: rankThreads,
    foldCoverage: foldCoverage,
    money: money
  };
});
