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
      return { id: p.id, label: p.label, unit: p.unit || 'elements', appliesTo: applies(p, inp, rows), stated: c.stated, default: c.default, unset: c.unset, inputs: (p.inputs || []).map(function (i) { return { id: i.id, label: i.label, accept: i.accept }; }), dataFiles: (p.dataFiles || []).map(function (d) { return { id: d.id, label: d.label }; }) };   // inputs (P6): a file the person loads for this pack (e.g. a schedule); the dialog draws one button per declared input
    });
  }
  function clear() { packs = {}; order = []; }

  // ---- P7 yield kit (prompts/MODELLER_LOD_UPGRADE_PILL.md "P7 SPEC" item 2). A pack's run is written ONCE as a generator, runSteps(inp, rows, opts); run() = drain(runSteps()) so the node witnesses,
  // appliesTo() dry runs and the browser all execute the SAME code in the same order (byte-identical results). The loops of a run are written `yield* kit.each(list, fn)`: fn is the old forEach callback
  // (its `return` is still a continue); after each item, if the time slice is used up, the generator yields {label, done, total} and the browser driver gives the page a turn (the §LOD400-STALL
  // chunk-yield pattern of bonsai_kernel.js / kernel_ops.js: a slice, then a macrotask). In drain mode the deadline is Infinity, so nothing ever yields and the order of work is unchanged.
  var now = function () { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); };
  var Y = { deadline: Infinity, prog: null, maxSlice: 0, yields: 0, sliceStart: 0 };
  function due() { return now() >= Y.deadline; }
  function* each(list, fn, label) {   // label (outer loops only) sets the progress line; an inner loop without one yields the current progress
    var n = list.length, i;
    for (i = 0; i < n; i++) {
      if (label) Y.prog = { label: label, done: i, total: n };
      fn(list[i], i, list);
      if (now() >= Y.deadline) { if (label) Y.prog = { label: label, done: i + 1, total: n }; yield Y.prog; }
    }
  }
  function* maybe() { if (now() >= Y.deadline) yield Y.prog; }   // a yield point inside a long loop body that is not an `each` loop
  function drain(gen) { var saved = Y.deadline; Y.deadline = Infinity; try { var r = gen.next(); while (!r.done) r = gen.next(); return r.value; } finally { Y.deadline = saved; } }
  // the browser driver: runs the generator in slices of budgetMs, then awaits a macrotask so the page can paint / handle input. onProgress(prog, stats) after every slice; returns the generator's result.
  // stats = {slices, maxSliceMs, totalMs}: the longest single slice is the longest main-thread stretch this run held the page (a slice ends at the first item boundary after the budget).
  async function drive(gen, o) {
    o = o || {}; var budget = o.budgetMs || 25, wait = o.wait || function () { return new Promise(function (r) { setTimeout(r, 0); }); }, st = { slices: 0, maxSliceMs: 0, totalMs: 0 }, t00 = now(), saved = Y.deadline;
    try {
      for (;;) {
        var t0 = now(); Y.deadline = t0 + budget; var r = gen.next(), dt = now() - t0; st.slices++; if (dt > st.maxSliceMs) st.maxSliceMs = dt;
        if (r.done) { st.totalMs = now() - t00; return { value: r.value, stats: st }; }
        if (o.onProgress) o.onProgress(r.value, st); await wait();
      }
    } finally { Y.deadline = saved; }
  }
  var kit = { each: each, maybe: maybe, drain: drain, drive: drive, due: due, state: Y };
  return { register: register, list: list, get: get, describe: describe, clear: clear, kit: kit };
});
