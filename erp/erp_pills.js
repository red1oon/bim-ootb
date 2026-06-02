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

  // ── id → real handler (no behaviour change) OR honest "arrives in Ix" toast ──
  var BINDINGS = {
    home:      function () { if (window.ADUI && ADUI.showMenu) ADUI.showMenu(); else _toast('Home'); },
    find:      function () { _toast('Search — record/account search wires in a later task'); },
    read:      function () { _toast('Read — record view wires in a later task'); },
    ledger:    function () { _toast('Report — Receipt · Trial Balance · P&L arrive in I2'); },
    graphs:    function () { _toast('Graphs — chart overlay arrives in I4'); },
    edit:      function () { _toast('Editable — CRUD ring arrives with CRUD-P'); },
    process:   function () { _toast('Process — DocAction arrives with CRUD-P'); },
    maximize:  function () {                                  // real now — fullscreen the ERP surface
      try {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else document.exitFullscreen();
      } catch (e) { _toast('Fullscreen not available'); }
    },
    share:     function () {
      try {
        if (navigator.clipboard) { navigator.clipboard.writeText(location.href); _toast('Link copied'); }
        else _toast('Share: ' + location.href);
      } catch (e) { _toast('Share: ' + location.href); }
    },
    settings:  function () { _toast('Settings — JSON editor wires in a later task'); },
    help:      function () { _toast('Need Help? — ShowMe overlay arrives later'); }
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

    fetch('pills.json?v=22').then(function (r) { return r.json(); }).then(function (mf) {
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
      pill.style.display = 'block';                          // persistent bar (spec: always visible)
      var trigger = document.createElement('button');
      trigger.id = 'erp-pill-trigger';
      trigger.title = 'Pills';
      // canonical vertical kebab (moreVert) from the verbatim icon set — same glyph as the BIM viewer trigger
      var _mv = (window.ICONS && window.ICONS.moreVert) ? window.ICONS.moreVert.svg
        : '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>';
      trigger.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + _mv + '</svg>';
      wrap.appendChild(pill);
      wrap.appendChild(trigger);
      document.body.appendChild(wrap);

      var PB = window.PillBuilder({
        pill: pill, trigger: trigger, APP: {}, actions: actions,
        order: actions.map(function (a) { return a.id; }),
        storageKey: 'erp_pill_config'
      });
      trigger.addEventListener('pointerup', function (e) { e.stopPropagation(); PB.toggle(); });
      window.ErpPills = PB;

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
      '#erp-pillbar{position:fixed;right:10px;top:50%;transform:translateY(-50%);z-index:1200;' +
        'display:flex;flex-direction:column;align-items:center;gap:8px;}' +
      '#erp-pill{display:flex;flex-direction:column;gap:6px;max-height:62vh;overflow-y:auto;' +
        'padding:6px;border-radius:16px;background:rgba(20,22,32,0.78);' +
        'border:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}' +
      '#erp-pill::-webkit-scrollbar{width:0;}' +
      '#erp-pill button{width:40px;height:40px;min-height:40px;display:flex;align-items:center;justify-content:center;' +
        'border:none;border-radius:10px;background:transparent;color:#cdd6e4;cursor:pointer;padding:0;}' +
      '#erp-pill button:hover{background:rgba(108,159,255,0.16);color:#6c9fff;}' +
      '#erp-pill button.active{background:rgba(108,159,255,0.24);color:#6c9fff;}' +
      '#erp-pill button img{border-radius:4px;}' +
      '#erp-pill-trigger{width:32px;height:32px;min-height:32px;border:none;border-radius:50%;cursor:pointer;' +
        'background:rgba(20,22,32,0.78);color:#9aa4b8;font-size:18px;line-height:1;' +
        'border:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}';
    document.head.appendChild(s);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
