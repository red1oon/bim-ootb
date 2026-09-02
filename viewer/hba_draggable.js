// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET SHARED DRAG UTILITY (RESUME_HR_BIM_ASSET.md §P10b, user 2026-07-02: "make all
//   panels draggable"). ADDITIVE, ZERO coupling to viewer-core or THREE — pure DOM pointer-event math. Every
//   HBA pane (dashboard/payslip/leave/tenancy/iot) calls `HbaDraggable.enable(pane, handle)` once in its own
//   mount() — this file changes NOTHING about how those panes render; it only lets the user grab the header and
//   move the pane. Switches the pane from its fixed right/top anchor to a left/top drag-follow, clamped to the
//   viewport so a pane can never be dragged fully off-screen. Read the log after run.
(function () {
  'use strict';
  var G = (typeof self !== 'undefined' ? self : this);

  // enable(paneEl, handleEl) — pointerdown on handleEl starts a drag of paneEl; pointermove repositions it
  // (left/top, clamped); pointerup ends it. Returns disable() which removes all 3 listeners (idempotent).
  // Node-safe: no-ops (returns a no-op disable) when there's no `document`/pointer-event surface.
  function enable(pane, handle) {
    if (typeof document === 'undefined' || !pane || !handle) return function () {};
    var dragging = false, dx = 0, dy = 0;
    function clamp(v, max) { return Math.max(0, Math.min(max, v)); }
    function onDown(ev) {
      dragging = true;
      var rect = pane.getBoundingClientRect ? pane.getBoundingClientRect() : { left: 0, top: 0 };
      dx = (ev.clientX || 0) - rect.left; dy = (ev.clientY || 0) - rect.top;
      pane.style.right = 'auto';                    // switch anchor: fixed-right -> free left/top drag-follow
      pane.style.left = rect.left + 'px'; pane.style.top = rect.top + 'px';
      pane.style.transform = 'none';                 // some panes center via transform; drag overrides it
      if (ev.preventDefault) ev.preventDefault();
    }
    function onMove(ev) {
      if (!dragging) return;
      var vw = (typeof window !== 'undefined' && window.innerWidth) || 1920;
      var vh = (typeof window !== 'undefined' && window.innerHeight) || 1080;
      var w = pane.offsetWidth || 300, h = pane.offsetHeight || 200;
      pane.style.left = clamp((ev.clientX || 0) - dx, vw - w) + 'px';
      pane.style.top = clamp((ev.clientY || 0) - dy, vh - h) + 'px';
    }
    function onUp() { dragging = false; }
    handle.style.cursor = 'move';
    handle.addEventListener('pointerdown', onDown);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return function disable() {
      handle.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  }

  G.HbaDraggable = { enable: enable };
  if (typeof module === 'object' && module.exports) module.exports = G.HbaDraggable;
})();
