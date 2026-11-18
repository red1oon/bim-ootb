// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — lod_registry.js: the registry of LOD Upgrade packs (prompts/MODELLER_LOD_UPGRADE_PILL.md §2). Read the §LODUP_* log after every run.
// Each pack registers {id, label, rulesFile, appliesTo(inp), run(inp, rules, opts)}. The toolbar pill and the chooser dialog are generic over this list:
// adding a future pack (Layers, Joints, Welds, Gussets, ...) = one new file + one line in lod/packs.json, no toolbar or dialog change.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LodRegistry = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var packs = {}, order = [];
  function register(p) {
    if (!p || !p.id || typeof p.run !== 'function' || typeof p.appliesTo !== 'function' || !p.label) throw new Error('§LODUP_REGISTRY a pack needs id, label, appliesTo(), run()');
    if (!packs[p.id]) order.push(p.id);
    packs[p.id] = p; return p;
  }
  function list() { return order.map(function (id) { return packs[id]; }); }
  function get(id) { return packs[id] || null; }
  // the dialog's model: one entry per registered pack, in registration order. inp = the open model's input; rowsOf(id) = the pack's merged rule rows. The dialog renders ONLY this list.
  // appliesTo = what the pack's own run would JUDGE on this model (P3 fix): appliesTo(inp, rows) is a read-only dry run of the pack, cached per (input, pack, rule rows); 0 = "not applicable here".
  var memo = (typeof WeakMap !== 'undefined') ? new WeakMap() : null;
  function applies(p, inp, rows) {
    var key = p.id + '|' + JSON.stringify(rows), c = memo && inp && typeof inp === 'object' ? (memo.get(inp) || memo.set(inp, {}).get(inp)) : null;
    if (c && key in c) return c[key];
    var n = p.appliesTo(inp, rows); if (c) c[key] = n; return n;
  }
  function describe(inp, rowsOf, rules) {
    return list().map(function (p) {
      var rows = rowsOf(p.id) || {}, c = rules ? rules.counts(rows) : { stated: 0, default: 0, unset: 0 };
      return { id: p.id, label: p.label, unit: p.unit || 'elements', appliesTo: applies(p, inp, rows), stated: c.stated, default: c.default, unset: c.unset };
    });
  }
  function clear() { packs = {}; order = []; }
  return { register: register, list: list, get: get, describe: describe, clear: clear };
});
