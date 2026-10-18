/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// info_dxf2bim.js — §L28 (prompts/DXF2BIM_MODELLER_LANE.md): renders the `#info-dxf2bim` block of `#info-panel`:
// where THIS element came from in the drawing set (Provenance drawn|derived|assumed, source sheet and handle, size basis).
// Source = table `element_dxf2bim(guid, name, value)` written by the extractor from `Pset_Dxf2Bim`. A DB without the table
// or without a row for the guid leaves the block hidden: never an empty box. Dual-mode (browser global + require()), the
// info_4d_panel.js convention: picking.js and the Find pick both delegate here, one renderer.
(function (global) {
  'use strict';
  var ORDER = ['Provenance', 'SourceSheet', 'SourceHandle', 'SourceLayer', 'Kind', 'SizeBasis'];
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function rows(A, guid) {
    var has = A.dbQuery("SELECT 1 FROM sqlite_master WHERE type='table' AND name='element_dxf2bim'");
    if (!has || !has.length) return [];
    return A.dbQuery('SELECT name, value FROM element_dxf2bim WHERE guid = ?', [guid]) || [];
  }
  function render(A, guid) {
    var box = typeof document !== 'undefined' && document.getElementById('info-dxf2bim');
    if (!box) return false;
    box.style.display = 'none';
    var r = [];
    try { r = (A && A.dbQuery && guid) ? rows(A, guid) : []; } catch (e) { r = []; }
    if (!r.length) { console.log('§DXF2BIM_INFO guid="' + guid + '" skip reason=no_rows'); return false; }
    var m = {}; r.forEach(function (x) { m[x[0]] = x[1]; });
    var keys = ORDER.filter(function (k) { return m[k] != null; }).concat(Object.keys(m).filter(function (k) { return ORDER.indexOf(k) < 0; }).sort());
    var html = '<div style="color:#4fc3f7;font-weight:bold;margin-bottom:3px">From the drawing set</div>' +
      keys.map(function (k) { return '<div><span class="label">' + esc(k) + '</span> <span class="value">' + esc(m[k]) + '</span></div>'; }).join('');
    box.innerHTML = html; box.style.display = 'block';
    console.log('§DXF2BIM_INFO guid="' + guid + '" rows=' + keys.length + ' provenance=' + (m.Provenance || '-'));
    return true;
  }
  var API = { render: render };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.InfoDxf2Bim = API;
})(typeof window !== 'undefined' ? window : globalThis);
