/**
 * BIM OOTB — zoom_across.js — the abstract "Zoom Across" registry.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * A "Zoom Across" is a record's set of CROSS-SURFACE destinations — the other surfaces that render the SAME
 * real-world thing this record points at. It GENERALISES iDempiere's native Zoom-Across (record → related
 * WINDOW) to record → related SURFACE (the BIM Viewer now; the Modeller etc. later).
 *
 * Surfaces register destinations; the host asks which are available for the current focus context:
 *   ZoomAcross.register({ id, label, available(ctx)->bool, launch(ctx) })
 *   ZoomAcross.targets(ctx)  -> the destinations whose available(ctx) is true
 * The pill (one pill, key ',', label "Zoom Across") surfaces when targets(ctx).length > 0; click launches the
 * single target, or offers a chooser for several. Adding a surface = ONE register() call — no pill change.
 * Pure registry: no DOM, no surface coupling. Dual export (node tests + window.ZoomAcross).
 */
(function (global) {
  'use strict';
  var _dests = [];
  var ZoomAcross = {
    register: function (d) {
      if (!d || !d.id || typeof d.available !== 'function' || typeof d.launch !== 'function') {
        console.log('§ZOOM-ACROSS register IGNORED (need id+available+launch)'); return false;
      }
      _dests = _dests.filter(function (x) { return x.id !== d.id; });   // idempotent by id
      _dests.push({ id: d.id, label: d.label || d.id, available: d.available, launch: d.launch });
      console.log('§ZOOM-ACROSS register id=' + d.id + ' total=' + _dests.length);
      return true;
    },
    targets: function (ctx) {
      return _dests.filter(function (d) { try { return !!d.available(ctx); } catch (e) { return false; } });
    },
    destinations: function () { return _dests.slice(); },
    reset: function () { _dests = []; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = ZoomAcross;
  else global.ZoomAcross = ZoomAcross;
})(typeof self !== 'undefined' ? self : this);
