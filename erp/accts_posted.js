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
      source: r.source, coverage: r.coverage, note: r.note || null,
      schemas: r.schemas || null, schema: r.schema == null ? null : r.schema,          // the Account Viewer's schema list + the one shown (factQuery)
      total: r.totals ? { dr: fmt(r.totals.dr), cr: fmt(r.totals.cr) } : null          // its total row (factQuery sums; never re-summed here)
    };
  }

  // ── acctSchemas / factQuery — the data side of iDempiere's Account Viewer (WAcctViewerData), for ANY posting table. ──
  // q(sql, params) -> rows[] is the host's reader. acctSchemas = the schema list the viewer offers: the client's primary schema first, then the
  // client's other active schemas that have a GL and a Default row, by id; a GL Journal posts in one schema, so its list is that schema alone.
  function acctSchemas(q, clientId, tableName, recordId) {
    var S = 'SELECT s.c_acctschema_id AS id, s.name AS name FROM ';
    var own = /^GL_Journal$/i.test(String(tableName)) && Number(recordId) > 0
      ? q(S + 'gl_journal j JOIN c_acctschema s ON s.c_acctschema_id=j.c_acctschema_id WHERE j.gl_journal_id=?', [Number(recordId)]) : [];
    if (own.length) return [{ id: Number(own[0].id), name: own[0].name }];
    var out = [], seen = {};
    q(S + 'ad_clientinfo ci JOIN c_acctschema s ON s.c_acctschema_id=ci.c_acctschema1_id WHERE ci.ad_client_id=?', [Number(clientId)])
      .concat(q(S + "c_acctschema s WHERE s.isactive='Y' AND s.ad_client_id=? AND EXISTS (SELECT 1 FROM c_acctschema_gl g WHERE g.c_acctschema_id=s.c_acctschema_id) " +
                'AND EXISTS (SELECT 1 FROM c_acctschema_default d WHERE d.c_acctschema_id=s.c_acctschema_id) ORDER BY s.c_acctschema_id', [Number(clientId)]))
      .forEach(function (r) { var id = Number(r.id); if (id && !seen[id]) { seen[id] = 1; out.push({ id: id, name: r.name }); } });
    return out;
  }
  // factQuery = the viewer's document query: the record's Fact_Acct rows of ONE schema (the list's first when none is asked), every posting type,
  // in Fact_Acct_ID order, with the debit and credit sums. Returns a readPostings-shaped result (+ schemas, schema, totals, all); null when the
  // record has no Fact_Acct row in any schema. `all` = per schema of the record { id, rows, dr, cr } in cents, for the host's log line.
  // access = the role's read access the viewer's query always carries: { clientId, orgs: '*' | [ids] } -> rows of client 0 / the client and of org 0 / those orgs.
  function factQuery(q, tableId, recordId, schemas, schemaId, access) {
    var a = access || {}, orgs = a.orgs && a.orgs !== '*' ? a.orgs.map(Number).filter(function (x) { return x === x; }) : null;
    var rows = q('SELECT f.fact_acct_id AS id, f.c_acctschema_id AS sch, f.account_id AS acct, f.amtacctdr AS dr, f.amtacctcr AS cr, ev.value AS v, ev.name AS n ' +
      'FROM fact_acct f LEFT JOIN c_elementvalue ev ON ev.c_elementvalue_id=f.account_id WHERE f.ad_table_id=? AND f.record_id=?' +
      (a.clientId != null ? ' AND f.ad_client_id IN (0,' + Number(a.clientId) + ')' : '') + (orgs ? ' AND f.ad_org_id IN (' + [0].concat(orgs).join(',') + ')' : '') + ' ORDER BY f.fact_acct_id', [Number(tableId), Number(recordId)]);
    if (!rows || !rows.length) return null;
    var cents = function (x) { return Math.round(Number(x || 0) * 100); }, all = [], by = {};
    rows.forEach(function (r) { var a = by[r.sch]; if (!a) { a = by[r.sch] = { id: Number(r.sch), rows: 0, dr: 0, cr: 0 }; all.push(a); } a.rows++; a.dr += cents(r.dr); a.cr += cents(r.cr); });
    var sch = schemaId != null ? Number(schemaId) : (schemas && schemas.length ? schemas[0].id : null), mine = by[sch] || { dr: 0, cr: 0 };
    var lines = rows.filter(function (r) { return Number(r.sch) === sch; }).map(function (r) {
      return { fact_acct_id: r.id, account_id: r.acct, value: r.v || String(r.acct), name: r.n || '', amtacctdr: Number(r.dr || 0), amtacctcr: Number(r.cr || 0) };
    });
    return { visible: true, posted: true, lines: lines, balanced: mine.dr === mine.cr, source: 'fact_acct', coverage: 'complete', note: null, reason: null,
             schemas: schemas || [], schema: sch, totals: { dr: mine.dr / 100, cr: mine.cr / 100 }, all: all, of: rows.length };
  }

  // schemaBar / totalRow — the viewer's schema selector with its Refresh, and its total row. Picking a schema re-queries nothing; Refresh does
  // (opts.onRefresh(schemaId)). The selector holds the schemas only: the viewer has no all-schemas entry.
  function schemaBar(doc, vm, opts) {
    var bar = doc.createElement('div'); bar.className = 'posted-schema';
    var lb = doc.createElement('label'); lb.textContent = opts.schemaLabel || 'Accounting Schema'; bar.appendChild(lb);
    var sel = doc.createElement('select'); sel.className = 'posted-schema-sel';
    vm.schemas.forEach(function (s) { var o = doc.createElement('option'); o.value = String(s.id); o.textContent = s.name; if (Number(s.id) === Number(vm.schema)) o.selected = true; sel.appendChild(o); });
    bar.appendChild(sel);
    var rf = doc.createElement('button'); rf.className = 'posted-refresh'; rf.textContent = '⟳'; rf.title = 'Refresh';
    if (rf.addEventListener) rf.addEventListener('click', function (e) { if (e && e.stopPropagation) e.stopPropagation(); if (opts.onRefresh) opts.onRefresh(Number(sel.value)); });
    bar.appendChild(rf);
    return bar;
  }
  function totalRow(doc, vm, tag) {
    var tr = doc.createElement(tag); tr.className = 'posted-total';
    tr.appendChild(cell(doc, 'posted-acct', '')); tr.appendChild(cell(doc, 'posted-dr', vm.total.dr)); tr.appendChild(cell(doc, 'posted-cr', vm.total.cr));
    return tr;
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
    if (vm.total) table.appendChild(totalRow(doc, vm, 'tr'));
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
      if (vm.schemas && vm.schemas.length) bd.appendChild(schemaBar(doc, vm, opts));
      vm.rows.forEach(function (row) {
        var tr = doc.createElement('div'); tr.className = 'posted-line';
        tr.appendChild(cell(doc, 'posted-acct', (row.value || '') + (row.name ? ' · ' + row.name : '')));
        tr.appendChild(cell(doc, 'posted-dr', row.dr));
        tr.appendChild(cell(doc, 'posted-cr', row.cr));
        bd.appendChild(tr);
      });
      if (vm.total) bd.appendChild(totalRow(doc, vm, 'div'));
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
               pillControls: pillControls, mountAccordion: mountAccordion, bindBack: bindBack, acctSchemas: acctSchemas, factQuery: factQuery };
  if (typeof window !== 'undefined') window.AcctsPosted = _api;
  if (typeof module !== 'undefined' && module.exports) module.exports = _api;
})();
