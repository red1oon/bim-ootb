// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — the door starts the core plugins, headless (bim-compiler prompts/CLI_ERP_IVR.md §29.6 P3a; AD-LAYER LAW 6: Ninja/plugin handling is the one core extension enabler).
// Read the §DOOR_PLUGIN lines after every run; an exit code is not evidence.
// WHAT IT IS: the page installs + starts its BUILTIN bundles with erp/plugin_overlay.js `_builtins` over erp/plugin_registry.js. The door did neither, so a window a bundle brings
//   (BIM Document, menu id 9541001) existed in the browser and not at the prompt. This file is the door's host for the SAME registry and the SAME list (erp/plugins/builtins.json,
//   one data file both hosts read). The registry stages each bundle's dictionary (manifest.dictionary through ctx.dict) into the door's in-memory db and runs its activate();
//   nothing goes to the op-log and nothing to a db file (the op-log image is keyed on these bundles too, erp_cli.js snapshotKey, so an image never mixes with a run without them).
// A bundle that needs a part of the PAGE (a pill on the rail: ninja_excel, ninja_create) cannot start here; it is named, not hidden (§DOOR_PLUGIN not-started ... reason=).
// The 'installOnly' bundles (webservices, the migrate forms, ...) are installed and stopped on the page; the door does not install them: a stopped bundle contributes nothing.
// Break switches (witness falsifiers): DOOR_PLUGINS=off starts none (the door as it was) · DOOR_PLUGINS=noaccess starts without the host's role-access pass (its cache is keyed apart).
'use strict';
const fs = require('fs'), path = require('path'), url = require('url');
const ERP = path.join(__dirname, '..', '..', 'erp');
const say = (s) => process.stderr.write('§DOOR_PLUGIN ' + s + '\n');

const enabled = () => (process.env.DOOR_PLUGINS || '') !== 'off';
const listFile = () => path.join(ERP, 'plugins', 'builtins.json');
const builtins = () => (JSON.parse(fs.readFileSync(listFile(), 'utf8')).builtin || []);
// a digest of what the start depends on (the list and the bytes of every bundle in it): part of the op-log image key, so a changed bundle never meets an image made with the old one
function digest() {
  if (!enabled()) return 'off';
  const h = require('crypto').createHash('sha256'); h.update(process.env.DOOR_PLUGINS || ''); h.update(fs.readFileSync(listFile()));
  builtins().forEach(f => { try { h.update('\n' + f + '\n'); h.update(fs.readFileSync(path.join(ERP, f))); } catch (e) { h.update('\n' + f + ' missing'); } });
  return h.digest('hex').slice(0, 16);
}
// Start the builtins on O (the booted door: O.db sql.js handle, O.rows reader). Returns [{id, file, state, ms, error?}]. Called after the seed/patch/image is open and BEFORE the op-log replay
// (an op may write a table a bundle creates), and before the engine's classes are bound (loadEngine runs after; the registry needs only the model layer, the process spine and the FSM table).
async function startBuiltins(O, opts) {
  const staged = !!(opts && opts.staged);   // the db already carries the staged dictionary and the role-access rows (it was opened from a cache made after a full start): the host does not run its role-access pass again
  if (!enabled()) { say('off (DOOR_PLUGINS=off): none started'); return []; }
  const t0 = Date.now(), out = [], log = console.log;
  if (!global.window) global.window = {};
  if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
  console.log = () => {};   // the bundles and the engine modules print their own § lines to stdout; stdout here carries only the answer (stderr below carries ours)
  try {
    const PR = require(path.join(ERP, 'plugin_registry.js')), ML = require(path.join(ERP, 'model_layer.js')), AP = require(path.join(ERP, 'ad_process.js'));
    const rows = (sql, p) => O.rows(sql, p || []);
    const host = { engineVersion: '1.0.0', db: { query: rows, run: (sql, p) => { O.db.run(sql, p || []); } }, ops: { append: () => null },   // no op-log: a bundle's lifecycle audit is not a door op
      process: AP, docAction: ML, docFsm: require(path.join(ERP, 'ad_docfsm.js')), form: require(path.join(ERP, 'ad_form_generic.js')),
      roleAccess: !staged && (process.env.DOOR_PLUGINS || '') !== 'noaccess',   // DOOR_PLUGINS=noaccess (witness falsifier): a full start without the host's role-access pass
      import: (u) => import(url.pathToFileURL(path.resolve(path.join(ERP, 'plugins'), u)).href) };
    // the page binds the model validation and callout engines to the registry too; the headless host hands them when the module loads (a bundle that needs one and finds none says so)
    try { host.modelval = require(path.join(ERP, 'ad_modelval.js')); } catch (e) { /* none */ }
    try { host.callout = require(path.join(ERP, 'ad_callout.js')); } catch (e) { /* none */ }
    const reg = PR.create(host);
    for (const f of builtins()) {
      const t1 = Date.now(), file = path.join(ERP, f), rec = { file: f };
      try {
        const mod = await import(url.pathToFileURL(file).href), b = await reg.installBundle(mod), id = (b && (b.id || (b.manifest && b.manifest.id))) || (mod.manifest && mod.manifest.id);
        rec.id = id; const st = await reg.startBundle(id); rec.state = (st && st.state) || 'ACTIVE';
      } catch (e) { rec.state = 'NOT-STARTED'; rec.error = String(e && e.message || e).slice(0, 200); }
      rec.ms = Date.now() - t1; out.push(rec);
    }
    O.plugins = { registry: reg, started: out };
    require('./bim_order_host.js').install(O, () => { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString(); return d.replace('T', ' ').slice(0, 19); });   // the BIM inputs of "Fold from BIM" (P3b): the process asks the host for them
  } finally { console.log = log; }
  out.forEach(r => say((r.state === 'ACTIVE' ? 'started' : 'not-started') + ' id=' + r.id + ' file=' + r.file + ' ms=' + r.ms + (r.error ? ' reason=' + r.error : '')));
  say('builtins=' + out.length + ' staged=' + staged + ' active=' + out.filter(r => r.state === 'ACTIVE').length + ' ms=' + (Date.now() - t0));
  return out;
}
module.exports = { startBuiltins, digest, enabled, builtins };
