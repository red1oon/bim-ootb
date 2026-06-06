/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * idmp_pills.js — mounts the iDempiere renderer's bottom/side bar from pills_idmp.json.
 *   The SIBLING of erp_pills.js: SAME PillBuilder renderer (pill_builder.js, used as-is),
 *   surface-specific manifest (GATE-1 — the action sets differ from erp.html).
 *
 * Registration layer, NOT a renderer rewrite. The manifest (pills_idmp.json) is DATA; this module
 *   1. fetches pills_idmp.json,
 *   2. resolves each icon from the verbatim icon set (window.ICONS / icons.js) — never inlines art,
 *   3. binds fn BY ID to the REAL existing idempiere.html handlers (window.IdmpPillActions),
 *   4. instantiates the existing PillBuilder (pill_builder.js, used as-is) — incl. the ⋯ collapse +
 *      per-user {order, hidden} persistence,
 *   5. emits §IDMP-PILLS counting the DOM buttons it actually built (handAuthored=0).
 *
 * Retires the hand-rolled #idmp-pillrail (ERP_BOTTOM_BAR_AND_LIFECYCLE.md §A; the standing
 * "no controls outside the pill" principle, §PILL-REGISTRY).
 *
 * The host (idempiere.html) sets window.IdmpPillActions then calls window.IdmpPills.mount() —
 * NOT auto-mount: the handlers live in the host IIFE and must be published first (deterministic order).
 */
(function () {
  'use strict';

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

  function _resolveIcon(p) {
    if (p.img) return null;                                  // img form handled by pill_builder
    var ICONS = window.ICONS || {};
    var ic = ICONS[p.icon];
    if (!ic) { console.warn('§IDMP_PILL_ICON_MISS id=' + p.id + ' icon=' + p.icon); return null; }
    return ic.svg;
  }

  function mount() {
    if (!window.PillBuilder) { console.warn('§IDMP-PILLS PillBuilder missing — not mounted'); return; }
    if (document.getElementById('idmp-pillbar')) return;     // idempotent (one bar)

    fetch('pills_idmp.json?v=24').then(function (r) { return r.json(); }).then(function (mf) {
      var pills = (mf.pills || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      var ACT = window.IdmpPillActions || {};

      var actions = pills.map(function (p) {
        var act = { id: p.id, name: p.name, key: p.key || '' };
        if (p.img) act.img = p.img; else act.icon = _resolveIcon(p) || '';
        // fn binds BY ID to the host's real handler; honest toast if a handler is missing (NON-INVENT).
        act.fn = ACT[p.id] || (function (name) { return function () { _toast(name + ' — handler not wired'); }; })(p.name);
        return act;
      });

      _injectStyle();
      var wrap = document.createElement('div');
      wrap.id = 'idmp-pillbar';
      var pill = document.createElement('div');
      pill.id = 'idmp-pill';
      var trigger = document.createElement('button');
      trigger.id = 'idmp-pill-trigger';
      trigger.title = 'Pills';
      var _mv = (window.ICONS && window.ICONS.moreVert) ? window.ICONS.moreVert.svg
        : '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>';
      trigger.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + _mv + '</svg>';
      wrap.appendChild(pill);
      wrap.appendChild(trigger);
      document.body.appendChild(wrap);

      var PB = window.PillBuilder({
        pill: pill, trigger: trigger, APP: {}, actions: actions,
        order: actions.map(function (a) { return a.id; }),
        storageKey: 'idmp_pill_config'
      });
      trigger.addEventListener('pointerup', function (e) { e.stopPropagation(); PB.toggle(); });
      window.IdmpPills.builder = PB;
      PB.toggle();                                            // open + sync internal state (persistent bar, no off-by-one tap)

      var mounted = pill.querySelectorAll('button[id^="pill-"]').length;
      var hidden = (PB.getConfig().hidden || []).length;
      console.log('§IDMP-PILLS source=registry pills=' + pills.length + ' handAuthored=0' +
        ' mountedButtons=' + mounted + ' overflow=⋯ hidden=' + hidden +
        ' ids=[' + pills.map(function (p) { return p.id; }).join(',') + ']');
    }).catch(function (e) {
      console.warn('§IDMP-PILLS fetch/mount failed: ' + e.message);
    });
  }

  function _injectStyle() {
    if (document.getElementById('idmp-pill-style')) return;
    var s = document.createElement('style');
    s.id = 'idmp-pill-style';
    s.textContent =
      // Desktop: right-edge vertical strip (matches erp.html's #erp-pillbar idiom).
      '#idmp-pillbar{position:fixed;right:10px;top:50%;transform:translateY(-50%);z-index:1200;' +
        'display:flex;flex-direction:column;align-items:center;gap:8px;}' +
      '#idmp-pill{display:flex;flex-direction:column;gap:6px;max-height:62vh;overflow-y:auto;' +
        'padding:6px;border-radius:16px;background:rgba(20,22,32,0.82);' +
        'border:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}' +
      '#idmp-pill::-webkit-scrollbar{width:0;}' +
      '#idmp-pill button{width:40px;height:40px;min-height:40px;display:flex;align-items:center;justify-content:center;' +
        'border:none;border-radius:10px;background:transparent;color:#cdd6e4;cursor:pointer;padding:0;}' +
      '#idmp-pill button:hover{background:rgba(108,159,255,0.16);color:#6c9fff;}' +
      '#idmp-pill button.active{background:rgba(108,159,255,0.24);color:#6c9fff;}' +
      '#idmp-pill button img{border-radius:4px;}' +
      '#idmp-pill-trigger{width:32px;height:32px;min-height:32px;border-radius:50%;cursor:pointer;' +
        'background:rgba(20,22,32,0.82);color:#9aa4b8;font-size:18px;line-height:1;display:flex;' +
        'align-items:center;justify-content:center;' +
        'border:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}' +
      // Mobile (≤760px): dock as a BOTTOM row (the dock the user liked — kept, sourced from the registry now).
      // NOTE: PillBuilder toggles the pill via inline display:block, which defeats flex-direction:row — so the
      // row is laid out with inline-flex buttons + nowrap (horizontal, scrollable) instead of a flex row.
      '@media (max-width:760px){' +
        '#idmp-pillbar{right:0;left:0;bottom:0;top:auto;transform:none;flex-direction:row-reverse;' +
          'align-items:center;justify-content:center;gap:6px;padding:6px 8px;background:rgba(20,22,32,0.92);' +
          'border-top:1px solid rgba(255,255,255,0.08);}' +
        '#idmp-pill{max-height:none;background:transparent;border:none;backdrop-filter:none;' +
          '-webkit-backdrop-filter:none;padding:0;white-space:nowrap;overflow-x:auto;overflow-y:hidden;}' +
        '#idmp-pill button{display:inline-flex;margin:0 3px;}' +
      '}';
    document.head.appendChild(s);
  }

  window.IdmpPills = { mount: mount, builder: null };
})();
