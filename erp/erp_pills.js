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

    fetch('pills.json?v=26').then(function (r) { return r.json(); }).then(function (mf) {
      var pills = (mf.pills || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });

      var reusedBim = [], newErp = [];
      var actions = pills.map(function (p) {
        if (p.reuse === 'bim') reusedBim.push(p.id); else newErp.push(p.id);

        var act = { id: p.id, name: p.name, key: p.key || '' };
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
      '#erp-help-guide,#erp-shortcuts{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:3000;' +
        'width:min(420px,90vw);max-height:80vh;overflow-y:auto;padding:22px 24px 24px;border-radius:16px;' +
        'background:rgba(20,22,32,0.96);color:#cdd6e4;border:1px solid rgba(255,255,255,0.12);' +
        'box-shadow:0 12px 48px rgba(0,0,0,0.5);font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;}' +
      '#erp-help-guide h3,#erp-shortcuts h3{margin:0 0 12px;color:#6c9fff;font-size:16px;}' +
      '#erp-help-guide ul,#erp-shortcuts ul{margin:0;padding-left:20px;}' +
      '#erp-help-guide li,#erp-shortcuts li{margin:7px 0;}' +
      '#erp-help-guide b,#erp-shortcuts b{color:#e6ebf5;font-weight:600;}' +
      '#erp-help-x,#erp-shortcuts-x{position:absolute;top:10px;right:12px;width:30px;height:30px;border:none;border-radius:50%;' +
        'background:transparent;color:#9aa4b8;font-size:22px;line-height:1;cursor:pointer;}' +
      '#erp-help-x:hover,#erp-shortcuts-x:hover{background:rgba(255,255,255,0.08);color:#fff;}';
    document.head.appendChild(s);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
