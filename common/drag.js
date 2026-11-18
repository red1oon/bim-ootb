/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// common/drag.js — THE one drag helper for floating panels, shared by the Viewer and the Modeller (bim-compiler
// prompts/VOCAB_MESSAGE_CATALOG.md §14.5). Moved VERBATIM from viewer/measure.js A._makeDraggable (which now delegates here,
// so its 13 viewer callers are unchanged). Drag by the top strip (el._dragStrip px, default 30 / 50 on a phone); a tap in
// the strip still reaches header controls because the pointer is captured only on the first real move (≥4 px) seen ON the
// element. Dual-mode: browser global CommonDrag + require().
(function (root) {
  'use strict';
  function make(el) {
      var ox, oy, sx, sy, dragging = false, pending = false, moved = false, pid = null;
      var dragStrip = el._dragStrip || (window._isMobile ? 50 : 30);  // honour the panel's intended grab-zone (e.g. Find = 64)
      el.style.cursor = 'grab';
      // On mobile, intercept touch BEFORE the browser claims it for scroll/pan.
      // Only preventDefault in the drag zone; elsewhere let browser handle normally.
      if (window._isMobile) {
        el.addEventListener('touchstart', function(e) {
          if (e.target.tagName === 'INPUT') return;
          if (e.target.closest('[data-clash-idx]') || e.target.closest('[data-pair]')) return;
          // Don't block close/export buttons
          var tgt = e.target;
          if (tgt.id && (tgt.id.indexOf('close') >= 0 || tgt.id.indexOf('export') >= 0)) return;
          if (tgt.className && typeof tgt.className === 'string' && tgt.className.indexOf('close') >= 0) return;
          var rect = el.getBoundingClientRect();
          var t = e.touches[0];
          if (t.clientY - rect.top <= dragStrip) e.preventDefault();
        }, { passive: false });
      }
      el.addEventListener('pointerdown', function(e) {
        if (e.target.tagName === 'INPUT') return;
        if (e.target.id && (e.target.id.indexOf('close') >= 0 || e.target.id.indexOf('export') >= 0)) return;
        if (e.target.className && typeof e.target.className === 'string' && e.target.className.indexOf('close') >= 0) return;
        if (e.target.closest('[data-clash-idx]') || e.target.closest('[data-pair]')) return;
        var rect = el.getBoundingClientRect();
        if (e.clientY - rect.top > dragStrip) return;
        // Arm a potential drag, but DON'T capture the pointer yet — a stationary tap
        // in the drag strip must still reach child controls (e.g. a section-header
        // collapse). Capture happens on first real move (pointermove below). Without
        // this, setPointerCapture swallowed the header's pointerup → couldn't fold.
        pending = true; moved = false; dragging = false;
        ox = e.clientX; oy = e.clientY;
        sx = rect.left; sy = rect.top;
        pid = e.pointerId;
      });
      // bim-compiler VOCAB_MESSAGE_CATALOG §14.4 — two OPT-IN switches (a panel that sets neither behaves as before):
      //   el._dragClamp = true      keep the whole panel inside the window when it fits (else its top-left at 0,0), on drop and on resize;
      //   el._dragRemember = '<key>' save left/top on drop (browser storage, a per-viewer convenience) and restore it here;
      //   el._dragOnDrop = fn(rect) called after a real drag ends (the Modeller's help panel uses it to give the outliner back, §14.5).
      function _clamp() {
        if (!el._dragClamp) return;
        var r = el.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
        var l = Math.max(0, Math.min(r.left, W - r.width)), t = Math.max(0, Math.min(r.top, H - r.height));
        if (l !== r.left || t !== r.top) { el.style.left = l + 'px'; el.style.top = t + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto'; console.log('§DRAG_CLAMP id=' + (el.id || '-') + ' left=' + Math.round(l) + ' top=' + Math.round(t)); }
      }
      if (el._dragRemember) {
        try {
          var _saved = JSON.parse(localStorage.getItem(el._dragRemember) || 'null');
          if (_saved && isFinite(_saved.left) && isFinite(_saved.top)) { el.style.left = _saved.left + 'px'; el.style.top = _saved.top + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto'; console.log('§DRAG_RESTORE key=' + el._dragRemember + ' left=' + _saved.left + ' top=' + _saved.top); }
        } catch (err) { /* storage unavailable: default place */ }
        _clamp();
      }
      if (el._dragClamp) window.addEventListener('resize', _clamp);
      function _endDrag() {
        var wasMoved = moved;
        if (pid != null) { try { if (el.hasPointerCapture(pid)) el.releasePointerCapture(pid); } catch (err) {} }
        pending = false; dragging = false; moved = false; pid = null;
        if (!wasMoved) return;
        _clamp();
        if (el._dragRemember) {
          var r = el.getBoundingClientRect();
          try { localStorage.setItem(el._dragRemember, JSON.stringify({ left: Math.round(r.left), top: Math.round(r.top) })); } catch (err) { /* storage unavailable */ }
          console.log('§DRAG_SAVE key=' + el._dragRemember + ' left=' + Math.round(r.left) + ' top=' + Math.round(r.top));
        }
        if (typeof el._dragOnDrop === 'function') { try { el._dragOnDrop(el.getBoundingClientRect()); } catch (err) { console.log('§DRAG_ONDROP_ERR ' + err.message); } }
      }
      el.addEventListener('pointermove', function(e) {
        if (!pending) return;
        if (e.buttons === 0) { _endDrag(); return; }   // button already released — never hover-drag
        if (!moved) {
          if (Math.abs(e.clientX - ox) + Math.abs(e.clientY - oy) < 4) return;  // still a tap
          moved = true; dragging = true;
          try { el.setPointerCapture(pid); } catch (err) {}                      // now a real drag
          // §14.5.3a D1: a panel placed with a pure translation (e.g. top:50% + translateY(-50%)) would jump by that offset,
          // because sx/sy are its on-screen rect while left/top are written under the transform. Drop the translation once,
          // so the panel stays where it is seen. A scale or rotate transform is left alone.
          var _tf = window.getComputedStyle ? getComputedStyle(el).transform : 'none';
          if (_tf && _tf !== 'none' && /^matrix\(1, 0, 0, 1, [-0-9.e]+, [-0-9.e]+\)$/.test(_tf)) { el.style.transform = 'none'; console.log('§DRAG_UNTRANSFORM id=' + (el.id || '-') + ' was=' + _tf); }
          e.preventDefault();
        }
        el.style.left = (sx + e.clientX - ox) + 'px';
        el.style.top = (sy + e.clientY - oy) + 'px';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
      });
      // Capture phase so a child's stopPropagation (e.g. a section-header collapse handler)
      // can't swallow the release — otherwise pending stays true and the panel sticks to the cursor.
      el.addEventListener('pointerup', _endDrag, true);
      el.addEventListener('pointercancel', _endDrag, true);
  }
  var API = { make: make };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.CommonDrag = API;
})(typeof window !== 'undefined' ? window : globalThis);
