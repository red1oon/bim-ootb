// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf2defaults.js — the element-defaults registry (prompts/DXF2BIM_MODELLER_LANE.md §L18). Pure, Node + browser.
// A 2D layout does not carry every measure of every element (a door's height, a window's sill, a stair's riser...). element_defaults.json lists a standard value or a guess for each; a person states
// a value with `@DEFAULT=<key>,<value>` in the drawing set (or the editor / CLI); otherwise the default is used and the row is YELLOW. Resolution: the drawing's @DEFAULT > a choice made in the editor > the registry.
//   create(ref, sheets, choices) -> { num(key), get(key), use(key), rows(), table(), invalid() }
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory({ P: require('./dxf2prep.js'), REF: require('./element_defaults.json') });
  else root.Dxf2Defaults = factory({ P: root.Dxf2Prep, REF: null });
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';
  function create(ref, sheets, choices) {
    var R = (ref || D.REF || { defaults: {} }).defaults, stated = {}, bad = [], used = {};
    (sheets || []).forEach(function (sh) { ((sh.desc && sh.desc.defaults) || []).forEach(function (q) { if (!(q.key in stated)) stated[q.key] = { value: q.value, by: q.by }; }); });
    choices = choices || {};
    function meta(key) { return R[key] || null; }
    function resolve(key) {
      var m = meta(key); if (!m) return null;
      var src = 'default', v = m.value;
      if (choices[key] !== undefined && choices[key] !== '') { v = choices[key]; src = 'choice'; }
      if (stated[key]) { v = stated[key].value; src = 'file'; }
      if (m.unit !== 'text') {
        var n = Number(v);
        if (!isFinite(n) || n < 0) { bad.push({ key: key, value: v, why: 'not a non-negative number: the default ' + m.value + ' is used' }); v = m.value; src = 'default'; } else v = n;
      }
      return { value: v, source: src, meta: m };
    }
    function get(key) { var r = resolve(key); if (!r) throw new Error('Dxf2Defaults: unknown default "' + key + '"'); return r.value; }
    function use(key) { var r = resolve(key); if (!r) throw new Error('Dxf2Defaults: unknown default "' + key + '"'); used[key] = r; return r.value; }
    // yellow rows for every default a module APPLIED (use): kind default (nothing stated), chosen (editor), stated (the drawing's @DEFAULT)
    function rows() {
      var DEF = D.P.Defaults(), out = [];
      Object.keys(used).sort().forEach(function (k) {
        var r = used[k], why = r.meta.basis + ' [' + (r.meta.kind === 'std' ? 'standard' : 'guess') + ']';
        if (r.source === 'file') DEF.stated(k, String(r.value), '@DEFAULT in the drawing set');
        else { DEF.assume(k, String(r.value), why, (r.meta.options || []).map(String)); if (r.source === 'choice') DEF.override(k, String(r.value)); }
      });
      DEF.rows().forEach(function (row) { var m = meta(row.key); row.basis = m ? m.kind : null; row.element = m ? m.element : null; row.unit = m ? m.unit : null; out.push(row); });
      return out;
    }
    function table() {
      return Object.keys(R).sort().map(function (k) { var r = resolve(k); return { key: k, element: R[k].element, unit: R[k].unit, kind: R[k].kind, basis: R[k].basis, options: R[k].options || null, default: R[k].value, value: r.value, source: r.source, used: !!used[k], used_by: R[k].used_by || null }; });
    }
    function invalid() { return bad.slice(); }
    function source(key) { var r = resolve(key); return r ? (r.source === 'file' ? 'stated' : r.source === 'choice' ? 'chosen' : 'default') : null; }
    return { source: source, num: use, get: get, use: use, rows: rows, table: table, invalid: invalid, meta: meta, has: function (k) { return !!R[k]; } };
  }
  return { create: create };
});
