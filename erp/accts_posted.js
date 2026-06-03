// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// accts_posted.js — the READ-ONLY "Accts Posted" panel (FRONTEND_LANE_MASTER §2 Item C).
//   Implementing prompts/ACCTS_POSTED_PANEL.md §3/§4 — Witness: §POSTED-READ / §POSTED-GATE / §POSTED-CTX.
//   A pure RENDERER of window.ERPPostings.readPostings(...). It does NOT gate, balance, or fold — every
//   field (lines, balanced, source, coverage, note, reason) is shown VERBATIM as the engine returned it.
//   Consume the seam — NEVER fork readPostings (FROZEN in bim-compiler/scripts, UMD-copied to erp/).
(function () {
  'use strict';

  // ── buildCtx(session) — idmp_session → readPostings ctx (§4). Read-only: never mutates session. ──
  // session = idmp_session.buildContext(...) → { role:{id,...}, orgs:[{id,name},...], ... }.
  // Org 0 ("* All accessible") ⇒ allowOrgs:'*' (engine treats '*' as unscoped); else the real org ids.
  function buildCtx(session) {
    var orgs = (session && session.orgs) || [];
    var hasAll = orgs.some(function (o) { return Number(o.id) === 0; });
    return {
      role: { id: session && session.role && session.role.id },
      allowOrgs: hasAll ? '*' : orgs.map(function (o) { return o.id; })
    };
  }

  // ── buildPostedVM(result) — PURE: the readPostings result → a view-model the DOM maps 1:1. ──
  // Carries ONLY values copied from `result` (no re-sum, no re-gate) — that is what "rendered verbatim"
  // means and what the witness asserts. Three shapes: refused | empty | posted.
  function buildPostedVM(result) {
    var r = result || {};
    // visible===false → honest refusal, ZERO account rows (UI zero-leak mirrors the engine gate).
    if (r.visible === false) {
      return {
        kind: 'refused',
        reason: r.reason || null,
        message: reasonText(r.reason),
        rows: [],                         // <-- never any line; the gate's zero-leak holds at the UI
        balanced: false, source: r.source, coverage: r.coverage, note: r.note || null
      };
    }
    // visible && !posted → absent/empty state; the engine's note is the message. Tab stays present.
    if (!r.posted) {
      return {
        kind: 'empty',
        reason: null,
        message: r.note || 'No postings for this record.',
        rows: [],
        balanced: false, source: r.source, coverage: r.coverage, note: r.note || null
      };
    }
    // posted → the balanced fold, lines verbatim.
    return {
      kind: 'posted',
      reason: null,
      message: null,
      rows: (r.lines || []).map(function (l) {
        return {
          account_id: l.account_id,
          value: l.value, name: l.name,
          dr: fmt(l.amtacctdr), cr: fmt(l.amtacctcr),
          drRaw: Number(l.amtacctdr || 0), crRaw: Number(l.amtacctcr || 0)
        };
      }),
      balanced: r.balanced === true,      // VERBATIM — not re-derived from the rows
      source: r.source, coverage: r.coverage, note: r.note || null
    };
  }

  function reasonText(reason) {
    if (reason === 'role-not-accounting') return 'Your role has no accounting visibility (Show Accounting is off).';
    if (reason === 'out-of-scope') return 'This record is outside your organisation access.';
    return 'Accounting postings are not available for your role.';
  }

  // display-only: cents → fixed 2dp. The ONLY UI computation permitted (§3 invariant). No Date/Math.random.
  function fmt(n) { return Number(n || 0).toFixed(2); }

  // ── mount(vm, opts) — build the DOM from the VM (browser; uses opts.doc || global document). ──
  // Counts that matter for the witness: `.posted-line` rows === vm.rows.length (0 on refused/empty).
  function mount(vm, opts) {
    opts = opts || {};
    var doc = opts.doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) throw new Error('accts_posted.mount: no document');
    var wrap = doc.createElement('div');
    wrap.className = 'accts-posted';

    if (vm.kind === 'refused' || vm.kind === 'empty') {
      var msg = doc.createElement('div');
      msg.className = vm.kind === 'refused' ? 'posted-refused' : 'posted-empty';
      msg.textContent = vm.message;
      wrap.appendChild(msg);
      wrap.appendChild(coverageStrip(doc, vm));   // strip still honest (source/coverage), no leak
      return wrap;
    }

    var table = doc.createElement('table');
    table.className = 'posted-table';
    vm.rows.forEach(function (row) {
      var tr = doc.createElement('tr');
      tr.className = 'posted-line';
      tr.appendChild(cell(doc, 'posted-acct', (row.value || '') + (row.name ? ' · ' + row.name : '')));
      tr.appendChild(cell(doc, 'posted-dr', row.dr));
      tr.appendChild(cell(doc, 'posted-cr', row.cr));
      table.appendChild(tr);
    });
    wrap.appendChild(table);

    var badge = doc.createElement('div');
    badge.className = 'posted-balance ' + (vm.balanced ? 'is-balanced' : 'is-unbalanced');
    badge.textContent = vm.balanced ? 'Balanced' : 'Unbalanced';   // VERBATIM from vm.balanced
    wrap.appendChild(badge);

    wrap.appendChild(coverageStrip(doc, vm));
    return wrap;
  }

  function coverageStrip(doc, vm) {
    var strip = doc.createElement('div');
    strip.className = 'posted-coverage';
    strip.textContent = 'source: ' + (vm.source || 'none') + ' · coverage: ' + (vm.coverage || 'absent') +
      (vm.note ? ' · ' + vm.note : '');
    return strip;
  }
  function cell(doc, cls, text) { var td = doc.createElement('td'); td.className = cls; td.textContent = text; return td; }

  // ── openPosted — the live-host entry: session+ref → ctx → readPostings → VM → DOM. ──
  // readPostings is injected (opts.readPostings) for tests, else taken from window.ERPPostings (browser).
  function openPosted(recordRef, session, dbs, opts) {
    opts = opts || {};
    var rp = opts.readPostings ||
      (typeof window !== 'undefined' && window.ERPPostings && window.ERPPostings.readPostings);
    if (!rp) throw new Error('accts_posted: window.ERPPostings.readPostings unavailable');
    var ctx = buildCtx(session);
    var result = rp(recordRef, ctx, dbs);
    var vm = buildPostedVM(result);
    return { result: result, vm: vm, node: mount(vm, opts) };
  }

  // ── pillControls(vm) — PURE: the control set as proper PILL ICONS (icon-name + label), coverage-gated. ──
  // Reuses the existing window.ICONS registry (NO new icons). The FULL field→native-intent pill set (phone→
  // dialer, address→maps, invoice→share, amount→pay …) is the general record card's, canonical in
  // docs/SocialPlatformLens.md §2a; Posted is read-only accounting, so its honest subset is install/share/verify.
  function pillControls(vm) {
    var pills = [];
    // install lifts coverage for a VISIBLE record; a refused role (kind='refused', carries coverage='absent')
    // has nothing actionable → no install pill. Guard on kind, not coverage alone.
    if (vm.kind !== 'refused' && (vm.coverage === 'partial' || vm.coverage === 'absent')) pills.push({ id: 'install', icon: 'database', label: 'Install' });
    if (vm.kind === 'posted') { pills.push({ id: 'share', icon: 'share-2', label: 'Share' });
                                pills.push({ id: 'verify', icon: 'shield-check', label: 'Verify' }); }
    return pills;  // refused → [] (nothing actionable for this role)
  }

  // ── mountAccordion(vm, opts) — the MOBILE lens: a collapsible card REUSING the ad_ui.js .acc idiom. ──
  // Same buildPostedVM fold, phone makeup. Classes .acc/.hd/.bd/.lbl/.chv match ad_ui.js (inherits its CSS +
  // open-toggle); drill = double-tap (host), phone BACK = go back (bindBack ↓). Returns a small controller.
  function mountAccordion(vm, opts) {
    opts = opts || {};
    var doc = opts.doc || (typeof document !== 'undefined' ? document : null);
    if (!doc) throw new Error('accts_posted.mountAccordion: no document');
    var acc = doc.createElement('div'); acc.className = 'acc';

    var hd = doc.createElement('div'); hd.className = 'hd' + (opts.open ? ' open' : '');
    var lbl = doc.createElement('span'); lbl.className = 'lbl';
    var chv = doc.createElement('span'); chv.className = 'chv'; chv.textContent = '▶'; lbl.appendChild(chv);
    lbl.appendChild(cell(doc, 'posted-title', 'Accts Posted')); hd.appendChild(lbl);
    var meta = doc.createElement('span'); meta.className = 'posted-hd-meta';
    if (vm.kind === 'posted') {
      var badge = doc.createElement('span'); badge.className = 'posted-balance ' + (vm.balanced ? 'is-balanced' : 'is-unbalanced');
      badge.textContent = vm.balanced ? 'Balanced' : 'Unbalanced'; meta.appendChild(badge);   // VERBATIM
    }
    var chip = doc.createElement('span'); chip.className = 'posted-cov-chip'; chip.textContent = (vm.coverage || 'absent'); meta.appendChild(chip);
    hd.appendChild(meta); acc.appendChild(hd);

    var bd = doc.createElement('div'); bd.className = 'bd' + (opts.open ? ' open' : '');
    if (vm.kind === 'refused' || vm.kind === 'empty') {
      var m = doc.createElement('div'); m.className = vm.kind === 'refused' ? 'posted-refused' : 'posted-empty';
      m.textContent = vm.message; bd.appendChild(m);
    } else {
      vm.rows.forEach(function (row) {
        var tr = doc.createElement('div'); tr.className = 'posted-line';
        tr.appendChild(cell(doc, 'posted-acct', (row.value || '') + (row.name ? ' · ' + row.name : '')));
        tr.appendChild(cell(doc, 'posted-dr', row.dr));
        tr.appendChild(cell(doc, 'posted-cr', row.cr));
        bd.appendChild(tr);
      });
      if (vm.note) bd.appendChild(cell(doc, 'posted-note', vm.note));
    }
    acc.appendChild(bd);

    var prow = doc.createElement('div'); prow.className = 'posted-pills';
    pillControls(vm).forEach(function (p) {
      var btn = doc.createElement('button'); btn.className = 'posted-pill pill-' + p.id;
      btn.setAttribute('data-icon', p.icon); btn.textContent = p.label;   // icon resolves from window.ICONS
      var h = opts['on' + p.id.charAt(0).toUpperCase() + p.id.slice(1)];
      if (h && btn.addEventListener) btn.addEventListener('click', h);
      prow.appendChild(btn);
    });
    acc.appendChild(prow);

    function setOpen(open) { hd.className = 'hd' + (open ? ' open' : ''); bd.className = 'bd' + (open ? ' open' : ''); }
    function toggle() { setOpen(hd.className.indexOf('open') < 0); }
    if (hd.addEventListener) hd.addEventListener('click', toggle);   // tap header toggles (ad_ui idiom)
    return { node: acc, header: hd, body: bd, pills: prow, setOpen: setOpen, toggle: toggle };
  }

  // ── bindBack(closeFn) — phone BACK = go back. Reuses the ad_graph.js:1557 popstate-trap pattern. ──
  // Pushes a history entry on open so the phone/browser back gesture closes the lens instead of leaving the
  // page; returns an unbind fn. No-op (returns a no-op) when there is no window (the node witness).
  function bindBack(closeFn) {
    if (typeof window === 'undefined' || !window.addEventListener) return function () {};
    if (typeof history !== 'undefined' && history.pushState) history.pushState({ acctsPosted: true }, '');
    function onPop() { if (closeFn) closeFn(); }
    window.addEventListener('popstate', onPop);
    return function () { if (window.removeEventListener) window.removeEventListener('popstate', onPop); };
  }

  var _api = { buildCtx: buildCtx, buildPostedVM: buildPostedVM, mount: mount, openPosted: openPosted,
               pillControls: pillControls, mountAccordion: mountAccordion, bindBack: bindBack };
  if (typeof window !== 'undefined') window.AcctsPosted = _api;
  if (typeof module !== 'undefined' && module.exports) module.exports = _api;
})();
