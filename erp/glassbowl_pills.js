/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * glassbowl_pills.js — mounts the Glassbowl + Gravity ⋯ dock from a sibling manifest.
 *   The SIBLING of idmp_pills.js / erp_pills.js: SAME PillBuilder renderer (pill_builder.js,
 *   used as-is), surface-specific manifest (pills_glassbowl.json / pills_gravity.json — the
 *   action sets differ). PILLS_TO_GLASSBOWL_CONSOLIDATE.md §PILL-REGISTRY: no controls outside
 *   the pill — retires the hand-rolled .ctl bar + loose about/qr/needHelp/undo/redo buttons.
 *
 * Registration layer, NOT a renderer rewrite:
 *   1. fetch the manifest passed in opts.manifest,
 *   2. resolve each icon from window.ICONS (icons.js) — never inline art,
 *   3. bind fn BY ID to the REAL existing host handlers (window.GlassbowlPillActions),
 *   4. instantiate the existing PillBuilder (incl. ⋯ collapse + per-user {order,hidden} persistence),
 *   5. emit a witness line (opts.tag, default §GB-PILLS) counting the DOM buttons built (handAuthored=0).
 *
 * The host publishes window.GlassbowlPillActions (+ optional GlassbowlPillActive for lit states),
 * then calls window.GlassbowlPills.mount({ manifest, storageKey, tag }).
 */
(function () {
  'use strict';

  function _toast(msg) {
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:9999;' +
      'padding:10px 22px;border-radius:8px;font-size:13px;font-family:system-ui,sans-serif;transition:opacity .5s;' +
      'background:rgba(16,22,30,0.95);color:#cfe8ee;border:1px solid rgba(86,214,224,0.3);pointer-events:none;';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; }, 2600);
    setTimeout(function () { if (t.parentNode) t.remove(); }, 3100);
  }

  function _resolveIcon(p) {
    if (p.img) return null;
    var ICONS = window.ICONS || {};
    var ic = ICONS[p.icon];
    if (!ic) { console.warn('§GB_PILL_ICON_MISS id=' + p.id + ' icon=' + p.icon); return null; }
    return ic.svg;
  }

  function _injectStyle() {
    if (document.getElementById('gb-pill-style')) return;
    var s = document.createElement('style');
    s.id = 'gb-pill-style';
    s.textContent =
      // Desktop: right-edge vertical strip (matches idempiere.html's #idmp-pillbar idiom).
      '#gb-pillbar{position:fixed;right:10px;top:50%;transform:translateY(-50%);z-index:1200;' +
        'display:flex;flex-direction:column;align-items:center;gap:8px;}' +
      '#gb-pill{display:flex;flex-direction:column;gap:6px;max-height:62vh;overflow-y:auto;' +
        'padding:6px;border-radius:16px;background:rgba(16,22,30,0.86);' +
        'border:1px solid rgba(86,214,224,0.18);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}' +
      '#gb-pill::-webkit-scrollbar{width:0;}' +
      '#gb-pill button{width:40px;height:40px;min-height:40px;display:flex;align-items:center;justify-content:center;' +
        'border:none;border-radius:10px;background:transparent;color:#cfe8ee;cursor:pointer;padding:0;}' +
      '#gb-pill button:hover{background:rgba(86,214,224,0.16);color:#56d6e0;}' +
      '#gb-pill button.active{background:rgba(86,214,224,0.26);color:#56d6e0;}' +
      '#gb-pill-trigger{width:32px;height:32px;min-height:32px;border-radius:50%;cursor:pointer;' +
        'background:rgba(16,22,30,0.86);color:#9fc4cf;font-size:18px;line-height:1;display:flex;' +
        'align-items:center;justify-content:center;' +
        'border:1px solid rgba(86,214,224,0.18);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}' +
      // §PILL-REGISTRY: suppress the loose floating help_overlay NeedHelp checkbox + crud_overlay Edit-mode
      // checkbox on this surface (the showme + edit pills own them now — no controls outside the pill).
      '#needHelpWrap,#crudModeWrap{display:none !important;}' +
      // Mobile (≤760px): bottom row dock (the dock pattern the user liked), ⋯ pinned right.
      '@media (max-width:760px){' +
        '#gb-pillbar{right:0;left:0;bottom:0;top:auto;transform:none;flex-direction:row-reverse;' +
          'align-items:center;justify-content:flex-start;gap:6px;padding:6px 8px;background:rgba(16,22,30,0.94);' +
          'border-top:1px solid rgba(86,214,224,0.18);}' +
        '#gb-pill-trigger{order:-1;}' +
        '#gb-pill{max-height:none;background:transparent;border:none;backdrop-filter:none;' +
          '-webkit-backdrop-filter:none;padding:0;white-space:nowrap;overflow-x:auto;overflow-y:hidden;}' +
        '#gb-pill button{display:inline-flex;margin:0 3px;}' +
      '}';
    document.head.appendChild(s);
  }

  function mount(opts) {
    opts = opts || {};
    var manifestUrl = opts.manifest || 'pills_glassbowl.json';
    var storageKey = opts.storageKey || 'glassbowl_pill_config';
    var TAG = opts.tag || '§GB-PILLS';
    if (!window.PillBuilder) { console.warn(TAG + ' PillBuilder missing — not mounted'); return; }
    if (document.getElementById('gb-pillbar')) return;   // idempotent (one bar)

    fetch(manifestUrl).then(function (r) { return r.json(); }).then(function (mf) {
      var pills = (mf.pills || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      var ACT = window.GlassbowlPillActions || {};
      var ACTIVE = window.GlassbowlPillActive || {};

      var actions = pills.map(function (p) {
        var act = { id: p.id, name: p.name, key: p.key || '' };
        if (p.img) act.img = p.img; else act.icon = _resolveIcon(p) || '';
        act.fn = ACT[p.id] || (function (name) { return function () { _toast(name + ' — handler not wired'); }; })(p.name);
        if (ACTIVE[p.id]) act.isActive = ACTIVE[p.id];
        return act;
      });

      _injectStyle();
      var wrap = document.createElement('div');
      wrap.id = 'gb-pillbar';
      var pill = document.createElement('div');
      pill.id = 'gb-pill';
      var trigger = document.createElement('button');
      trigger.id = 'gb-pill-trigger';
      trigger.title = 'Pills';
      var _mv = (window.ICONS && window.ICONS.moreHoriz) ? window.ICONS.moreHoriz.svg
        : '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>';
      trigger.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + _mv + '</svg>';
      wrap.appendChild(pill);
      wrap.appendChild(trigger);
      document.body.appendChild(wrap);

      var PB = window.PillBuilder({
        pill: pill, trigger: trigger, APP: {}, actions: actions,
        order: actions.map(function (a) { return a.id; }),
        storageKey: storageKey,
        persistent: true
      });
      trigger.addEventListener('pointerup', function (e) { e.stopPropagation(); PB.toggle(); });
      window.GlassbowlPills.builder = PB;
      PB.toggle();   // open + sync (persistent bar)

      var mounted = pill.querySelectorAll('button[id^="pill-"]').length;
      var hidden = (PB.getConfig().hidden || []).length;
      console.log(TAG + ' source=registry built=' + mounted + ' handAuthored=0' +
        ' pills=' + pills.length + ' overflow=⋯ hidden=' + hidden +
        ' ids=[' + pills.map(function (p) { return p.id; }).join(',') + ']');
    }).catch(function (e) {
      console.warn(TAG + ' fetch/mount failed: ' + e.message);
    });
  }

  window.GlassbowlPills = { mount: mount, builder: null };
})();
