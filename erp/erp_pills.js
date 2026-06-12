/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * erp_pills.js — mounts the BIM pill bar on erp.html from pills.json (idempiereUI.md I1).
 *
 * Registration layer, NOT a renderer rewrite. The manifest (pills.json) is DATA; this module
 *   1. fetches pills.json,
 *   2. resolves each icon from the verbatim icon set (window.ICONS / icons.js) — never inlines art,
 *   3. binds fn / hold / nav BY ID to the REAL existing handlers (ADUI/ADCharts) where they exist,
 *      and to an honest "arrives in Ix" toast where the surface lands in a later task,
 *   4. instantiates the existing PillBuilder (pill_builder.js, used as-is),
 *   5. emits §PILL-MANIFEST counting the DOM buttons it actually built (handAuthoredButtons=0).
 *
 * See docs/IDEMPIERE_RENDERER_SPEC.md §2, docs/PILL_MANIFEST_SPEC.md.
 */
(function () {
  'use strict';

  // ── honest, non-faking feedback (a toast, never a fabricated screen) ──
  function _toast(msg) {
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:9999;' +
      'padding:10px 22px;border-radius:8px;font-size:13px;font-family:system-ui,sans-serif;transition:opacity .5s;' +
      'background:rgba(40,44,58,0.95);color:#cdd6e4;border:1px solid rgba(255,255,255,0.1);pointer-events:none;';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; }, 2600);
    setTimeout(function () { if (t.parentNode) t.remove(); }, 3100);
  }

  // ── @bim id → the icon name the BIM registry binds for that id (verified vs panels.js) ──
  var BIM_ICON = {
    home: 'home', settings: 'settings', find: 'search', share: 'share', help: 'lifeBuoy'
  };

  // ── ErpPicker bridge (Install/Migrate) — user wrap 2026-06-09: Install/Migrate now appear on erp.html too,
  // reusing the SAME window.ErpPicker module idempiere.html uses (erp_picker.js, loaded by erp.html). No fork.
  function _picker(mode) {
    return function () {
      console.log('§ERP-PICKER mode=' + mode);
      if (window.ErpPicker && ErpPicker.open) ErpPicker.open({ mode: mode, status: _toast });
      else _toast('ERP picker not loaded');
    };
  }

  // ── HelpGuide (user wrap 2026-06-09: "give a note to click a bubble / go deeper via Glassbowl/Gravity/iDempiere").
  // erp.html does NOT load the shared help_overlay.js — this is a NEW, self-contained, dismissible card (KISS,
  // clean Lucide-only chrome). It tells the user how to navigate the bubble constellation + the deeper surfaces.
  function _helpGuide() {
    var existing = document.getElementById('erp-help-guide');
    if (existing) { existing.remove(); console.log('§ERP-HELP action=close'); return; }   // toggle
    var card = document.createElement('div');
    card.id = 'erp-help-guide';
    card.setAttribute('role', 'dialog');
    card.innerHTML =
      '<button id="erp-help-x" title="Close" aria-label="Close">&times;</button>' +
      '<h3>Getting around</h3>' +
      '<ul>' +
        '<li><b>Tap a bubble</b> to open its records as bubbles — each bubble is an ERP window (Orders, Products, Partners&hellip;).</li>' +
        '<li><b>Long-press a bubble</b> to open it in <b>iDempiere</b>. You sign in first (pick your client &amp; role), <i>then</i> the window/record opens &mdash; pick the wrong client and it shows nothing, just like the real system.</li>' +
        '<li>Tap <b>Home</b> any time to return to the bubble constellation.</li>' +
        '<li>Go <b>deeper</b> with the pills:' +
          '<ul>' +
            '<li><b>iDempiere</b> — the full classic ERP UI (records, posting, kanban).</li>' +
            '<li><b>Glassbowl</b> — the engine-as-data lens (see the kernel fold live).</li>' +
            '<li><b>Gravity</b> — the orbit view of the whole system.</li>' +
          '</ul>' +
        '</li>' +
        '<li>New here? <b>Install</b> sets up a fresh ERP on this device; <b>Migrate</b> brings data in from another one.</li>' +
      '</ul>';
    document.body.appendChild(card);
    var close = function () { if (card.parentNode) card.remove(); console.log('§ERP-HELP action=close'); };
    document.getElementById('erp-help-x').addEventListener('pointerup', function (e) { e.stopPropagation(); close(); });
    console.log('§ERP-HELP action=open items=6');
  }

  // ── Shortcuts panel (the LIFEBELT's original role — mirrors the BIM viewer's command palette /
  // showCommandPalette). Keyboard + gesture legend for the globe. The bubble-navigation HelpGuide lives
  // on the separate (?) 'guide' pill now. Same dismissible card chrome as _helpGuide (shared CSS).
  function _shortcutsPanel() {
    var existing = document.getElementById('erp-shortcuts');
    if (existing) { existing.remove(); console.log('§ERP-SHORTCUTS action=close'); return; }   // toggle
    var card = document.createElement('div');
    card.id = 'erp-shortcuts';
    card.setAttribute('role', 'dialog');
    card.innerHTML =
      '<button id="erp-shortcuts-x" title="Close" aria-label="Close">&times;</button>' +
      '<h3>Shortcuts</h3>' +
      '<ul>' +
        '<li><b>?</b> &mdash; Help: how to use the bubbles</li>' +
        '<li><b>F11</b> &mdash; Maximize the globe</li>' +
        '<li><b>/</b> &mdash; Share this view</li>' +
        '<li><b>+ / &minus;</b> or scroll &mdash; Zoom the globe</li>' +
        '<li><b>drag</b> &mdash; Orbit &middot; <b>pinch</b> &mdash; Zoom</li>' +
        '<li><b>tap</b> &mdash; open records &middot; <b>long-press</b> &mdash; open in iDempiere</li>' +
        '<li><b>Esc</b> &mdash; Close this panel</li>' +
      '</ul>';
    document.body.appendChild(card);
    var close = function () { if (card.parentNode) card.remove(); document.removeEventListener('keydown', escH); console.log('§ERP-SHORTCUTS action=close'); };
    var escH = function (ev) { if (ev.key === 'Escape') { ev.preventDefault(); close(); } };
    document.getElementById('erp-shortcuts-x').addEventListener('pointerup', function (e) { e.stopPropagation(); close(); });
    document.addEventListener('keydown', escH);
    console.log('§ERP-SHORTCUTS action=open items=7');
  }

  // ── Doc Cycle Validator — runs DocCycleValidator in-memory, renders tick/cross result card.
  // Always visible (POC demo: proof-of-seriousness for newbies). Uses sql.js WASM already on the page.
  // Implementing doc_cycle_validator.js W-DOC-CYCLE-VALIDATOR — Witness: §DOC-CYCLE
  function _docCycleValidator() {
    var existing = document.getElementById('doc-cycle-card');
    if (existing) { existing.remove(); console.log('§DOC-CYCLE action=close'); return; }

    var V = window.DocCycleValidator;
    if (!V || !window.initSqlJs) { _toast('DocCycleValidator not loaded — check erp.html scripts'); return; }

    var card = document.createElement('div');
    card.id = 'doc-cycle-card';
    card.setAttribute('role', 'dialog');
    card.innerHTML =
      '<button id="doc-cycle-x" title="Close" aria-label="Close">&times;</button>' +
      '<h3>Doc Cycle Validator</h3>' +
      '<div id="doc-cycle-body" class="dc-running">Running…</div>';
    document.body.appendChild(card);
    document.getElementById('doc-cycle-x').addEventListener('pointerup', function (e) {
      e.stopPropagation(); card.remove(); console.log('§DOC-CYCLE action=close');
    });

    var TS = '2026-06-13T00:00:00Z';   // deterministic — no Date.now() in engine
    initSqlJs({ locateFile: function (f) { return 'lib/sql-wasm-fts5.wasm'; } })
      .catch(function () {
        return initSqlJs({ locateFile: function () {
          return 'https://cdn.jsdelivr.net/npm/sql.js-fts5@1.4.0/dist/sql-wasm.wasm';
        }});
      })
      .then(function (SQL) {
        var raw = new SQL.Database();
        var db  = V.mkAdapter(raw);
        V.bootstrapSchema(db);

        // seed: valid receipt (1001 + 1 line), no-lines doc (1002), already-CO doc (1003), progression test (1004)
        db.run('INSERT INTO m_inout VALUES (?,?,?,?,?,?)', [1001,'DR','V+',null,'Valid receipt',TS]);
        db.run('INSERT INTO m_inoutline VALUES (?,?,?,?,?)', [1,1001,100,10,10]);
        db.run('INSERT INTO m_inout VALUES (?,?,?,?,?,?)', [1002,'DR','V+',null,'No-lines doc',TS]);
        db.run('INSERT INTO m_inout VALUES (?,?,?,?,?,?)', [1003,'CO','V+',null,'Already CO',TS]);
        db.run('INSERT INTO m_inout VALUES (?,?,?,?,?,?)', [1004,'DR','V+',null,'Progression',TS]);
        db.run('INSERT INTO m_inoutline VALUES (?,?,?,?,?)', [10,1004,200,5,null]);

        var fails = 0, rows = [];
        function chk(ok, label) { if (!ok) fails++; rows.push({ ok: ok, label: label }); }
        function throws(action, from) {
          try { V.resolveTransition(action, from); return false; }
          catch (e) { return e.name === 'DocStateError'; }
        }

        // §FSM_LEGAL
        chk(V.getValidActions('DR').join(',') === 'CO,PR,VO', 'DR legal actions [CO,PR,VO]');
        chk(V.getValidActions('CO').join(',') === 'CL,RC,RA,VO', 'CO legal actions [CL,RC,RA,VO]');
        chk(V.getValidActions('VO').length === 0, 'VO is terminal — no actions');
        // §FSM_STRICT
        chk(throws('CO','CL'), 'CO from Closed → DocStateError');
        chk(throws('PR','CO'), 'PR from Completed → DocStateError');
        chk(throws('CO','VO'), 'CO from Voided → DocStateError');
        // §FSM_FORWARD
        var t1 = V.advanceState(db, 1004, 'PR', { ts: TS });
        chk(t1.from === 'DR' && t1.to === 'IP', 'PR advances DR → IP');
        // §ATOMIC_SYNC
        var r2 = V.completeReceipt(db, 1001,
          [{ elementGuid: 'GUID-WALL-001', qty: 3 }, { elementGuid: 'GUID-BEAM-002', qty: 7 }],
          { ts: TS });
        var factRows = db.get('SELECT COUNT(*) AS n FROM fact_acct WHERE record_id=1001').n;
        var bimRows  = db.get('SELECT COUNT(*) AS n FROM bim_element_status WHERE erp_doc_id=1001').n;
        chk(r2.ok && r2.from === 'DR' && r2.to === 'CO', 'DR → CO complete');
        chk(factRows === 2, 'ERP: DR Inventory + CR AP (2 fact_acct rows)');
        chk(bimRows === 2, 'BIM: 2 element status rows committed');
        // §ROLLBACK
        var r3 = V.completeReceipt(db, 1002, [{ elementGuid: 'X', qty: 1 }], { ts: TS });
        var factAfter = db.get('SELECT COUNT(*) AS n FROM fact_acct WHERE record_id=1002').n;
        var docSt = db.get('SELECT docstatus FROM m_inout WHERE m_inout_id=1002').docstatus;
        chk(!r3.ok && r3.rolledBack, 'No-lines doc → rollback reported');
        chk(factAfter === 0, 'SAVEPOINT rollback: 0 fact_acct rows committed');
        chk(docSt === 'DR', 'docstatus reverted to DR after rollback');
        // §FALSIFIER
        var r4 = V.completeReceipt(db, 1003, [], { ts: TS });
        chk(!r4.ok && r4.isStateError, 'CO→CO rejected as DocStateError');
        raw.close();

        var pass = rows.filter(function (r) { return r.ok; }).length;
        var allPass = fails === 0;
        var body = document.getElementById('doc-cycle-body');
        if (!body) return;
        body.className = '';
        body.innerHTML = rows.map(function (r) {
          return '<div class="dc-row ' + (r.ok ? 'dc-pass' : 'dc-fail') + '">' +
            '<span class="dc-icon">' + (r.ok ? '✓' : '✗') + '</span><span>' + r.label + '</span></div>';
        }).join('') +
        '<div class="dc-total ' + (allPass ? 'dc-all-pass' : 'dc-has-fail') + '">' +
          (allPass ? '✓ ' : '✗ ') + pass + ' / ' + rows.length + ' PASS — doc cycle proven in-browser' +
        '</div>';
        console.log('§DOC-CYCLE total=' + rows.length + ' pass=' + pass + ' fail=' + fails);
      })
      .catch(function (e) {
        var body = document.getElementById('doc-cycle-body');
        if (body) body.textContent = 'Error: ' + e.message;
        console.error('§DOC-CYCLE error', e);
      });
  }

  // ── id → real handler. Stubs that only toasted "arrives in a later task" (find/read/ledger/graphs/edit/
  // process/settings) are REMOVED from the manifest (user wrap 2026-06-09) — that depth lives on idempiere.html;
  // erp.html is the lean globe that funnels there. What remains is operative. ──
  var BINDINGS = {
    home:      function () { if (window.ADUI && ADUI.showMenu) ADUI.showMenu(); else _toast('Home'); },
    install:   _picker('install'),
    migrate:   _picker('migrate'),
    maximize:  function () {                                  // real — fullscreen the ERP surface
      try {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else document.exitFullscreen();
      } catch (e) { _toast('Fullscreen not available'); }
    },
    share:     function () {
      // §SHARE — capture full context (client/window/record) and share it; recipient restores via
      // the same params erp.html reads on load. (docs/ERP_SHARE_SPEC.md)
      var url = (window.ADUI && ADUI.buildShareUrl) ? ADUI.buildShareUrl() : location.href;
      console.log('§SHARE url=' + url);
      try {
        if (navigator.share) {
          navigator.share({ title: 'ERP OOTB', text: 'ERP context', url: url }).catch(function () {});
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(url); _toast('Context link copied');
        } else { _toast(url); }
      } catch (e) { _toast(url); }
    },
    verify:    function () {                                  // chain-integrity check — was a floating button, now a pill
      if (window.ErpVerifyLedger) window.ErpVerifyLedger();
      else _toast('Verify ledger — not ready');
    },
    'doc-cycle': _docCycleValidator,                          // Doc Cycle Validator card (always visible POC proof)
    guide:     _helpGuide,                                    // (?) bubble-navigation HelpGuide card
    help:      _shortcutsPanel                                // lifebelt → keyboard/gesture shortcuts (its original role)
  };

  // ── hold (long-press) drawers land in I3 — honest stub now ──
  function _holdStub(label) {
    return function () { _toast(label + ' drawer — folds from AD_Menu in I3'); };
  }
  var HOLDS = { admenu: 'AD_Menu', reports: 'Reports', charts: 'Charts' };

  function _resolveIcon(p) {
    if (p.img) return null;                                  // img form handled by pill_builder
    var ICONS = window.ICONS || {};
    var name = (p.icon === '@bim') ? BIM_ICON[p.id] : p.icon;
    var ic = ICONS[name];
    if (!ic) { console.warn('§PILL_ICON_MISS id=' + p.id + ' icon=' + p.icon + ' -> ' + name); return null; }
    return ic.svg;
  }

  function mount() {
    if (!window.PillBuilder) { console.warn('§PILL-MANIFEST PillBuilder missing — not mounted'); return; }

    fetch('pills.json?v=28').then(function (r) { return r.json(); }).then(function (mf) {
      var pills = (mf.pills || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });

      var reusedBim = [], newErp = [];
      var actions = pills.map(function (p) {
        if (p.reuse === 'bim') reusedBim.push(p.id); else newErp.push(p.id);

        var act = { id: p.id, name: p.name, key: p.key || '' };
        if (p.title) act.title = p.title;   // hover tooltip override (e.g. "Glassbowl — CONCEPT")
        if (p.img) act.img = p.img; else act.icon = _resolveIcon(p) || '';

        // fn: nav pills navigate; the rest bind by id (handler or honest toast).
        // Absolute (external) URLs open in a new tab — companion views (glassbowl/gravity) on
        // BIMCompiler GitHub Pages, matching the old #gbviews target="_blank". Local nav replaces in place.
        if (p.nav) {
          act.fn = (function (url, id) {
            return function () {
              var external = /^https?:\/\//i.test(url);
              console.log('§PILL-NAV ' + id + '->' + url + (external ? ' (new tab)' : ''));
              if (external) window.open(url, '_blank', 'noopener');
              else location.href = url;
            };
          })(p.nav, p.id);
        } else {
          act.fn = BINDINGS[p.id] || function () { _toast(p.name); };
        }
        // long-press drawer (I3 stub)
        if (p.hold && HOLDS[p.hold]) act.hold = _holdStub(HOLDS[p.hold]);

        return act;
      });

      // ── build the bar DOM (dark glass, right edge — matches the ERP shell) ──
      _injectStyle();
      var wrap = document.createElement('div');
      wrap.id = 'erp-pillbar';
      var pill = document.createElement('div');
      pill.id = 'erp-pill';
      var trigger = document.createElement('button');
      trigger.id = 'erp-pill-trigger';
      trigger.title = 'Pills';
      // FLAT (horizontal) kebab from the verbatim icon set — differs from Android's own vertical ⋮ menu (user-requested, all surfaces).
      var _mv = (window.ICONS && window.ICONS.moreHoriz) ? window.ICONS.moreHoriz.svg
        : '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>';
      trigger.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + _mv + '</svg>';
      wrap.appendChild(pill);
      wrap.appendChild(trigger);
      document.body.appendChild(wrap);

      var PB = window.PillBuilder({
        pill: pill, trigger: trigger, APP: {}, actions: actions,
        order: actions.map(function (a) { return a.id; }),
        storageKey: 'erp_pill_config'
        // NON-persistent (user wrap 2026-06-09: "click outside closes — intuitive + standard"): a ⋯ tap toggles;
        // tapping a pill INSIDE keeps it open; tapping OUTSIDE (the globe) collapses it — consistent with the BIM
        // viewer. Still stays open until you act away from it (no auto-recollapse after the reveal).
      });
      // ⋯ tap → toggle. Opening RISES the strip up from the bottom-right ⋯ (PillBuilder _toggle `.pill-revealing`);
      // re-tapping (or a tap outside the strip) collapses it back down to the ⋯ (which never leaves bottom-right).
      trigger.addEventListener('pointerup', function (e) { e.stopPropagation(); PB.toggle(); });
      // Re-arm the boot cue: drop the attract class when the bob ends so it can replay.
      trigger.addEventListener('animationend', function () { trigger.classList.remove('erp-pill-attract'); });
      window.ErpPills = PB;

      // Collapsed by DEFAULT (consistent with idempiere.html + the BIM viewer): the clean resting state is just
      // the bottom-right ⋯; the strip reveals only on the user's tap. A one-time ⋯ bob cues "there's more here".
      PB.close();
      void trigger.offsetWidth;
      trigger.classList.add('erp-pill-attract');
      console.log('§PILL-CUE page=erp attract=⋯ collapsed=true');

      var mounted = pill.querySelectorAll('button[id^="pill-"]').length;
      console.log('§PILL-MANIFEST page=erp pills=' + pills.length + ' source=pills.json handAuthoredButtons=0' +
        ' mountedButtons=' + mounted +
        ' reusedBimIds=[' + reusedBim.join(',') + ']' +
        ' newErpIds=[' + newErp.join(',') + ']');
    }).catch(function (e) {
      console.warn('§PILL-MANIFEST fetch/mount failed: ' + e.message);
    });
  }

  function _injectStyle() {
    if (document.getElementById('erp-pill-style')) return;
    var s = document.createElement('style');
    s.id = 'erp-pill-style';
    s.textContent =
      // BOTTOM-RIGHT dock (consistent with idempiere.html + the BIM viewer): the ⋯ rests at the bottom-right and
      // STAYS there; the strip (DOM-ordered above the trigger in a bottom-anchored column) RISES UP on tap. Was
      // right-edge vertically-CENTRED — collapsing used to drift the ⋯ to mid-screen; now `bottom` is pinned.
      '#erp-pillbar{position:fixed;right:10px;bottom:16px;top:auto;transform:none;z-index:1200;' +
        'display:flex;flex-direction:column;align-items:center;gap:8px;}' +
      '#erp-pill{display:flex;flex-direction:column;gap:6px;max-height:calc(100vh - 120px);overflow-y:auto;' +
        'padding:6px;border-radius:16px;background:rgba(20,22,32,0.78);' +
        'border:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}' +
      '#erp-pill::-webkit-scrollbar{width:0;}' +
      '#erp-pill button{width:40px;height:40px;min-height:40px;display:flex;align-items:center;justify-content:center;' +
        'border:none;border-radius:10px;background:transparent;color:#cdd6e4;cursor:pointer;padding:0;}' +
      '#erp-pill button:hover{background:rgba(108,159,255,0.16);color:#6c9fff;}' +
      '#erp-pill button.active{background:rgba(108,159,255,0.24);color:#6c9fff;}' +
      '#erp-pill button img{border-radius:4px;}' +
      '#erp-pill-trigger{width:32px;height:32px;min-height:32px;border:none;border-radius:50%;cursor:pointer;' +
        'background:rgba(20,22,32,0.78);color:#9aa4b8;font-size:18px;line-height:1;display:flex;' +
        'align-items:center;justify-content:center;' +
        'border:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}' +
      // Reveal-UP on open + a gentle ⋯ bob while collapsed (same idiom as idmp_pills.js — consistent everywhere).
      '@keyframes pill-rise{from{transform:translateY(18px);opacity:0;}to{transform:translateY(0);opacity:1;}}' +
      '#erp-pill.pill-revealing{animation:pill-rise 0.42s cubic-bezier(.2,.85,.25,1);}' +
      '@keyframes erp-pill-peek{0%,100%{transform:translateY(0);box-shadow:none;}' +
        '25%{transform:translateY(-9px);box-shadow:0 0 0 3px rgba(108,159,255,0.35);}' +
        '55%{transform:translateY(0);}78%{transform:translateY(-4px);}}' +
      '#erp-pill-trigger.erp-pill-attract{animation:erp-pill-peek 0.85s ease-in-out 2;color:#6c9fff;}' +
      '@media (max-width:760px){#erp-pillbar{right:calc(10px + env(safe-area-inset-right,0px));' +
        'bottom:calc(12px + env(safe-area-inset-bottom,0px));}#erp-pill{max-height:calc(100vh - 110px);}}' +
      // HelpGuide card (the `help` pill) — centred, dismissible, clean glass. Self-contained (erp.html has no
      // shared help_overlay.js). z above the globe + pill bar; scrolls on a short screen.
      '#erp-help-guide,#erp-shortcuts,#doc-cycle-card{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:3000;' +
        'width:min(420px,90vw);max-height:80vh;overflow-y:auto;padding:22px 24px 24px;border-radius:16px;' +
        'background:rgba(20,22,32,0.96);color:#cdd6e4;border:1px solid rgba(255,255,255,0.12);' +
        'box-shadow:0 12px 48px rgba(0,0,0,0.5);font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;}' +
      '#erp-help-guide h3,#erp-shortcuts h3,#doc-cycle-card h3{margin:0 0 12px;color:#6c9fff;font-size:16px;}' +
      '#erp-help-guide ul,#erp-shortcuts ul{margin:0;padding-left:20px;}' +
      '#erp-help-guide li,#erp-shortcuts li{margin:7px 0;}' +
      '#erp-help-guide b,#erp-shortcuts b{color:#e6ebf5;font-weight:600;}' +
      '#erp-help-x,#erp-shortcuts-x,#doc-cycle-x{position:absolute;top:10px;right:12px;width:30px;height:30px;border:none;border-radius:50%;' +
        'background:transparent;color:#9aa4b8;font-size:22px;line-height:1;cursor:pointer;}' +
      '#erp-help-x:hover,#erp-shortcuts-x:hover,#doc-cycle-x:hover{background:rgba(255,255,255,0.08);color:#fff;}' +
      // Doc Cycle Validator card rows
      '.dc-running{color:#9aa4b8;font-style:italic;}' +
      '.dc-row{display:flex;align-items:baseline;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);}' +
      '.dc-icon{flex-shrink:0;font-weight:700;width:14px;}' +
      '.dc-pass .dc-icon{color:#4dcc88;}' +
      '.dc-fail .dc-icon{color:#e05c5c;}' +
      '.dc-total{margin-top:12px;padding:8px 12px;border-radius:8px;font-weight:600;font-size:13px;}' +
      '.dc-all-pass{background:rgba(77,204,136,0.12);color:#4dcc88;border:1px solid rgba(77,204,136,0.3);}' +
      '.dc-has-fail{background:rgba(224,92,92,0.12);color:#e05c5c;border:1px solid rgba(224,92,92,0.3);}';
    document.head.appendChild(s);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
