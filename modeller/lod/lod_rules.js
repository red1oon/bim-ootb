// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — lod_rules.js: the generic rules engine of the LOD Upgrade pill (prompts/MODELLER_LOD_UPGRADE_PILL.md §3). Read the §LODUP_* log after every run.
// A rule row is {value, unit, source}. source = 'stated: <where>' | 'default: <...>' | 'unset: <...>'. A STATED row always wins over a default:
// an edit that carries a 'stated:' source replaces any row; an edit that carries a default/unset source can never replace a stated row (refused, logged).
// Pure: no DOM, no project values. Node + browser (window.LodRules).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LodRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function kind(row) { var s = String(row && row.source || ''); return /^stated/.test(s) ? 'stated' : /^default/.test(s) ? 'default' : 'unset'; }
  // rows: a parsed JSON pack (keys starting '_' are commentary and skipped) -> {key: {value, unit, source}}
  function load(json) {
    var o = {}; Object.keys(json).sort().forEach(function (k) { if (k.charAt(0) === '_') return; var r = json[k]; if (r && typeof r === 'object' && 'value' in r) o[k] = { value: r.value, unit: r.unit, source: r.source }; });
    return o;
  }
  // merge(base, edits) -> {rows, refused:[{key,why}]}; deterministic (sorted keys)
  function merge(base, edits) {
    var rows = {}, refused = [];
    Object.keys(base).forEach(function (k) { rows[k] = Object.assign({}, base[k]); });
    Object.keys(edits || {}).sort().forEach(function (k) {
      var e = edits[k];
      if (!rows[k]) { refused.push({ key: k, why: 'no such rule row' }); return; }
      if (kind(rows[k]) === 'stated' && kind(e) !== 'stated') { refused.push({ key: k, why: 'a stated row is never replaced by a default' }); return; }
      rows[k] = { value: e.value, unit: e.unit != null ? e.unit : rows[k].unit, source: e.source };
    });
    return { rows: rows, refused: refused };
  }
  function counts(rows) {
    var c = { stated: 0, default: 0, unset: 0, total: 0 };
    Object.keys(rows).forEach(function (k) { c[kind(rows[k])]++; c.total++; });
    return c;
  }
  function value(rows, k) { if (!rows[k]) throw new Error('rule row missing: ' + k); return rows[k].value; }
  return { load: load, merge: merge, counts: counts, kind: kind, value: value };
});
