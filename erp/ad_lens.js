// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: GPL-2.0-only
// ad_lens.js - the OPT-IN operations lens registry (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §15). A bundle registers a lens (ctx.lens.register, layered +
// owner-removed like ad_form_generic.js); the host draws ONE lens bar from it, and only while at least one lens is registered, so with no lens the screens stay the
// legacy twin's. A lens never writes: its actions call the host api, whose entries are the same seams the plain buttons use (Save, the DocAction FSM, the form engine).
//   lens = { actions(api) -> [{ id, label, title }], run(actionId, api) }
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./layered_registry.js'));
  else root.AdLens = factory(root.LayeredRegistry);
})(typeof self !== 'undefined' ? self : this, function (LR) {
  'use strict';
  var REG_L = LR.create(), REG = {}, LISTEN = [];
  function changed() { LISTEN.forEach(function (f) { try { f(); } catch (e) {} }); }   // the host redraws its toolbar when a lens is installed or stopped, so a window already open follows
  function register(id, desc, opts) { REG_L.add(id, desc, opts); REG[id] = REG_L.top(id).value; changed(); return Object.keys(REG).length; }
  function unregister(id, owner) { var n = REG_L.remove(id, owner), t = REG_L.top(id); if (t) REG[id] = t.value; else delete REG[id]; if (n) changed(); return n; }
  function removeOwner(owner) { var n = 0; REG_L.keys().forEach(function (k) { n += unregister(k, owner); }); return n; }
  function count() { return Object.keys(REG).length; }
  function describe() { var o = {}; REG_L.keys().sort().forEach(function (k) { o[k] = REG_L.layers(k).map(function (r) { return r.owner + '@' + r.rank; }); }); return o; }
  // actions(api) -> [{ lens, id, label, title }] over every registered lens; a lens that throws contributes nothing (and is named in the log line by the host)
  function actions(api, onErr) {
    var out = [];
    Object.keys(REG).sort().forEach(function (k) {
      try { (REG[k].actions(api) || []).forEach(function (a) { out.push({ lens: k, id: a.id, label: a.label, title: a.title || a.label }); }); }
      catch (e) { if (onErr) onErr(k, e); }
    });
    return out;
  }
  function run(lens, actionId, api) { var d = REG[lens]; if (!d) throw new Error('no lens ' + lens); return d.run(actionId, api); }
  function onChange(fn) { LISTEN.push(fn); }
  return { onChange: onChange, register: register, unregister: unregister, removeOwner: removeOwner, count: count, describe: describe, actions: actions, run: run };
});
