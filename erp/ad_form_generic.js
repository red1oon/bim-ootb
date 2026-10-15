// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ad_form_generic.js - ONE generic AD_Form engine (AD-LAYER LAW): a form is DATA, not per-form host code. A bundle registers a descriptor for an AD_Form classname
// (ctx.form.register, layered + owner-removed like the process/model registries); the host's single renderer (idempiere.html renderGenericForm) draws its parameters and an
// editable grid, and the run goes through ModelLayer.run timing 'PROCESS' = ONE transaction, one signed op group, traced by §EVENT_SEQ.
// Spec: bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §11-§12, bim-ootb prompts/mfg/LIBERO_BACKFLUSH_SLICE4_SPEC.md. Replaces the "row level data input" embargo of the Order Receipt & Issue InfoWindow port.
//   descriptor = { title,
//     params:  [{ name, label, type: 'list'|'string'|'number'|'date'|'yesno', mandatory, options(trx, params) -> [{ value, label }], default(trx, params) -> value }],
//     columns: [{ key, label, type: 'string'|'number', editable }],
//     rows(trx, params) -> [{ key, selected, <column key>: value, ... }],
//     run(trx, params, rows) -> message   // throws to refuse; everything it writes goes through ModelLayer.save / processIt }
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./layered_registry.js'), function () { return require('./model_layer.js'); });
  else root.AdFormGeneric = factory(root.LayeredRegistry, function () { return root.ModelLayer; });
})(typeof self !== 'undefined' ? self : this, function (LR, getML) {
  'use strict';
  var REG_L = LR.create(), REG = {};
  function register(classname, desc, opts) { REG_L.add(classname, desc, opts); REG[classname] = REG_L.top(classname).value; return Object.keys(REG).length; }
  function unregister(classname, owner) { var n = REG_L.remove(classname, owner), t = REG_L.top(classname); if (t) REG[classname] = t.value; else delete REG[classname]; return n; }
  function removeOwner(owner) { var n = 0; REG_L.keys().forEach(function (k) { n += unregister(k, owner); }); return n; }
  function get(classname) { return REG[classname] || null; }
  function describe() { var o = {}; REG_L.keys().sort().forEach(function (k) { o[k] = REG_L.layers(k).map(function (r) { return r.owner + '@' + r.rank; }); }); return o; }
  // read(withTrx, fn): run a READ in a Trx (parameter options/defaults/rows). withTrx(fn(query, env)) is the host's seam (crud_overlay withModelTrx).
  function read(withTrx, fn) { var ML = getML(); return withTrx(function (query, env) { return fn(new ML.Trx(query, env)); }); }
  // execute(withTrx, classname, params, rows) -> { ok, ops, msg }  - ONE transaction; a thrown refusal rolls the whole thing back (no ops).
  function execute(withTrx, classname, params, rows) {
    var d = get(classname), ML = getML();
    if (!d) return { ok: false, ops: [], msg: 'no form descriptor registered for ' + classname };
    return withTrx(function (query, env) {
      return ML.run(query, env, { table: 'ad_form', timing: 'PROCESS', fn: function (trx) { var msg = d.run(trx, params || {}, rows || []); return { ok: true, msg: msg == null ? '' : String(msg) }; } });
    }) || { ok: false, ops: [], msg: 'no transaction available' };
  }
  return { register: register, unregister: unregister, removeOwner: removeOwner, get: get, describe: describe, read: read, execute: execute };
});
