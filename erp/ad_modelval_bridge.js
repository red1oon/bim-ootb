// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — SPEC (ad_modelval_bridge.js)
// SCOPE: bridges the real ad_modelvalidator AD table (ad_modelval.js:39 readValidators) to the
//   already-shipped Fold-Engine plugin system (plugin_registry.js Phase A, plugin_overlay.js Phase D,
//   plugin_release.js's enable/disable UI). Implements bim-compiler prompts/PLUGIN_SYSTEM_LANE.md
//   §Phase E — "AD_ModelValidator table-driven auto-install." Read that file's §Phase E + its
//   "Answers (2026-09-15)" subsection before touching this file; the 5 open questions there are
//   RESOLVED there — do not re-derive them here.
// WHY: readValidators(db) already reads the 3 real ad_modelvalidator rows (Libero MFG / Fixed Assets
//   / Product Price — vendor Java classes, named-deferred, no JS port and none planned) but nothing
//   ever called it: a stub sitting next to a fully-working plugin host it was never wired to. This
//   file is that wire, nothing else — it does not replace or duplicate plugin_registry.js's lifecycle.
//
// RULES (each names its witness — erp/tests/witness_modelval_bridge.js):
//   R1 — INSTALL ONLY, NEVER AUTO-START (Q1, the one real product judgment call, not resolvable by
//     investigation alone). The AD row PROPOSES a bundle; it does not self-approve. This function
//     calls registry.installBundle() and STOPS there — startBundle only ever fires from the EXISTING
//     enable/disable click already in plugin_release.js / plugin_overlay.js (Phase D, unmodified by
//     this file). Never call startBundle from here. Witness: §W-MVBRIDGE checks state stays INSTALLED
//     (never ACTIVE) immediately after this function returns.
//   R2 — IDEMPOTENT, NO RETRY-LOOP (Q2). plugin_registry.js's installBundle THROWS
//     'plugin already installed: <id>' on a repeat id (verified: plugin_registry.js:162) — it is not
//     idempotent to call blindly. That throw is caught here and treated as an expected no-op
//     (Q2's option (b): a manifest's `id` is only knowable AFTER importing the module, so pre-checking
//     registry.get(id) first would still need that same import — it buys nothing here, unlike a case
//     where the id is known up front). Every OTHER install failure — the 3 real rows' Java FQCNs,
//     which are not importable JS modules and never will be — is caught, logged ONCE via a single
//     §MODELVAL_AUTOINSTALL state=UNRESOLVED line, and skipped. This function itself is also only
//     ever invoked once per page session (crud_overlay.js's existing _mvAllInstalled guard), so no
//     row is ever retried inside a running session.
//   R3 — NO ENTITYTYPE GATE (Q3 — the original lane-card spec speculated "gate on EntityType"; real
//     queried data corrected that: all 3 rows are EntityType D/EE01, none U, so EntityType cannot
//     separate "safe to auto-install" from "vendor body never ported"). Gate PURELY on whether
//     ModelValidationClass resolves to an importable module — pass the column straight through to
//     installBundle, no path-prefixing, no EntityType branching, no special-casing.
//   R4 — A-4 SEAM (Q4): documented for bundle authors in erp/plugins/README.md, verbatim — a
//     model-validator bundle GATES a save/complete; it must NEVER derive a posting or write GL state.
//     Nothing in this engine enforces that (no type system here does); it is a documented discipline.
//   R5 — MODELVAL_AUTOINSTALL op (Q5): every successful install AND every duplicate-skip appends a
//     MODELVAL_AUTOINSTALL kernel_ops row (additive op_type — see kernel_ops.js's op_type comment)
//     IN ADDITION to (never instead of) the PLUGIN_INSTALL op installBundle() itself always appends —
//     so `grep §MODELVAL_AUTOINSTALL` alone answers "did the AD table drive this," without needing to
//     touch plugin_registry.js's own audit trail (Phase A/B are wrap-only — see the lane card's own
//     "What Already Exists (do not replace — wrap only)" rule).
'use strict';
(function (global) {

  // installFromAdModelValidator(db, glue) — db: a .prepare(sql).all()-capable handle (ad_modelval.js's
  //   own readValidators contract — the same b3-shim crud_overlay.js already feeds every other
  //   install<Model>SaveHooks call). glue: { db: <raw sql.js db, .run/.exec>, KO, engines } — the SAME
  //   shape idempiere.html's `plugin` pill action already builds for PluginEngine.open(); passed
  //   through verbatim to PluginEngine.ensure() so the AD-installed candidate lands in the ONE shared
  //   registry Plugin Management (plugin_release.js) also reads.
  // Returns a Promise<Array<{adRowId, id, state, ok}>> — one entry per ad_modelvalidator row with a
  //   non-empty ModelValidationClass.
  async function installFromAdModelValidator(db, glue) {
    glue = glue || {};
    var MV = global.AdModelVal;
    if (!MV || typeof MV.readValidators !== 'function') return [];

    var rows;
    try { rows = MV.readValidators(db) || []; }
    catch (e) {   // ad_seed.db slices some tables out entirely (verified: no such table on the live seed
      // pre-bake) — this is the SAME "un-hooked = explicit no-op" discipline ad_modelval.js's own header
      // states for a missing (table,timing), extended to "missing table entirely."
      console.log('§MODELVAL_AUTOINSTALL source=ad_modelvalidator state=NO-TABLE reason="' + (e && e.message) + '"');
      return [];
    }

    var PE = global.PluginEngine;
    if (!PE || typeof PE.ensure !== 'function') {
      console.log('§MODELVAL_AUTOINSTALL state=NO-REGISTRY reason="PluginEngine.ensure missing"');
      return [];
    }
    var reg = PE.ensure(glue);
    if (!reg) { console.log('§MODELVAL_AUTOINSTALL state=NO-REGISTRY reason="PluginRegistry not loaded"'); return []; }

    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var cls = row.modelvalidationclass || row.ModelValidationClass;
      var rowId = row.ad_modelvalidator_id != null ? row.ad_modelvalidator_id : row.AD_ModelValidator_ID;
      var name = row.name || row.Name || ('#' + rowId);
      if (!cls) continue;   // no class named — nothing to install, not an error
      try {
        var ins = await reg.installBundle(cls);            // R1: install only — never startBundle here
        var opId = (glue.KO && glue.db) ? glue.KO.commitOp(glue.db, 'MODELVAL_AUTOINSTALL',
          { adModelValidatorId: rowId, name: name, id: ins.id, modelValidationClass: cls }) : null;
        console.log('§MODELVAL_AUTOINSTALL id=' + ins.id + ' source=ad_modelvalidator name="' + name +
          '" class="' + cls + '" state=' + ins.state + ' opId=' + opId);
        out.push({ adRowId: rowId, id: ins.id, state: ins.state, ok: true });
      } catch (e) {
        var msg = String((e && e.message) || e);
        var dup = /already installed/i.test(msg);           // R2: expected no-op, not a failure
        if (dup) {
          var opId2 = (glue.KO && glue.db) ? glue.KO.commitOp(glue.db, 'MODELVAL_AUTOINSTALL',
            { adModelValidatorId: rowId, name: name, modelValidationClass: cls, skip: 'already-installed' }) : null;
          console.log('§MODELVAL_AUTOINSTALL source=ad_modelvalidator name="' + name + '" class="' + cls +
            '" state=SKIP-DUPLICATE opId=' + opId2);
        } else {
          console.log('§MODELVAL_AUTOINSTALL source=ad_modelvalidator name="' + name + '" class="' + cls +
            '" state=UNRESOLVED reason="' + msg + '"');
        }
        out.push({ adRowId: rowId, id: null, state: dup ? 'SKIP-DUPLICATE' : 'UNRESOLVED', ok: dup });
      }
    }
    return out;
  }

  var API = { installFromAdModelValidator: installFromAdModelValidator };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;   // node witness
  if (typeof window !== 'undefined') window.AdModelValBridge = API;           // browser
  else if (global) global.AdModelValBridge = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
