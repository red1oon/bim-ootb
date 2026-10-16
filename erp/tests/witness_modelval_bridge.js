#!/usr/bin/env node
// witness_modelval_bridge.js — WITNESS for ad_modelval_bridge.js (PLUGIN_SYSTEM_LANE.md §Phase E).
// Spec: bim-compiler prompts/WITNESS_INTERFACE_FRAMEWORK.md §2.3 (witness_kit/contract.js pattern).
//
// ISSUE THIS PROVES OR DISPROVES: does adding a row to the REAL ad_modelvalidator AD table actually
// reach the already-shipped plugin system — install-only (never auto-start, Q1), gated purely on
// whether ModelValidationClass resolves to an importable module (no EntityType branching, Q3),
// idempotent across a re-run (Q2), and tagged with its own MODELVAL_AUTOINSTALL op (Q5) — or is the
// bridge just code that was never actually exercised against real data.
//
// POPULATION: the REAL 3 ad_modelvalidator rows, read via ad_modelval.js's own readValidators() off
// the ACTUAL erp/ad_seed.db (post-bake_modelvalidator_seed.js — the same file idempiere.html loads,
// not the ad_full.db oracle), PLUS one witness-injected 4th row pointing at the real, already-shipped
// Phase-C bundle (erp/plugins/production_validator.mjs) — added to the in-memory row set ONLY, never
// written back to ad_seed.db, so the shipped seed keeps exactly the 3 real extracted rows. This 4th
// row is what makes "install a real bundle via an AD row" demonstrable at all: none of the 3 real
// rows' vendor Java classes were ever going to resolve (by design — named-deferred, no JS port
// planned), so a witness that only used those 3 could prove graceful failure but never prove the
// success path.
//
// PluginEngine.ensure() is stubbed here (calling the REAL plugin_registry.js underneath) because
// plugin_overlay.js — the real ensure() — is DOM-bound (document/indexedDB) and only Playwright-
// testable, exactly the same headless/DOM split Phase A/Phase D already drew (plugin_registry.js
// headless-witnessed; plugin_overlay.js's own DOM wiring smoke-tested via Playwright).
//
// Command: node erp/tests/witness_modelval_bridge.js   (cwd-independent; run from repo or erp/)
'use strict';
var path = require('path');
var fs = require('fs');
var initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
var Witness = require('../../witness_kit/contract').Witness;

var ERP = path.join(__dirname, '..');
var SEED = path.join(ERP, 'ad_seed.db');

// b3-shim: .prepare(sql).all()/.get() over a raw sql.js Database — the SAME contract crud_overlay.js's
// own _mvB3 gives every ad_modelval.js call in the browser (mirrored here; crud_overlay.js itself is a
// DOM-bound page module and isn't require()-able standalone).
function b3(dbh) {
  function lc(o) { if (!o) return o; var r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; return r; }
  function run(sql, args, all) {
    var st = dbh.prepare(sql);
    var out = all ? [] : undefined;
    try {
      if (args.length) st.bind(args);
      if (all) { while (st.step()) out.push(lc(st.getAsObject())); }
      else if (st.step()) out = lc(st.getAsObject());
    } finally { st.free(); }
    return out;
  }
  return { prepare: function (sql) {
    return {
      get: function () { return run(sql, Array.prototype.slice.call(arguments), false); },
      all: function () { return run(sql, Array.prototype.slice.call(arguments), true); }
    };
  } };
}

(async function () {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join('/home/red1/bim-ootb/node_modules/sql.js/dist', f); } });
  var seedDb = new SQL.Database(new Uint8Array(fs.readFileSync(SEED)));
  var b = b3(seedDb);

  var MV = require(path.join(ERP, 'ad_modelval.js'));                 // node branch also sets global.AdModelVal
  var PluginRegistry = require(path.join(ERP, 'plugin_registry.js')); // node branch also sets global.PluginRegistry

  // §BEFORE — confirm the bake actually landed: the real 3 rows are readable off the ACTUAL live seed.
  var realRows = MV.readValidators(b);
  console.log('§W-MVBRIDGE_SEED rows=' + realRows.length + ' ids=[' +
    realRows.map(function (r) { return r.ad_modelvalidator_id + ':' + r.entitytype; }).join(',') + ']');

  // §PluginEngine stub (see header) — exercises the REAL plugin_registry.js lifecycle headless.
  var opsLog = [];
  var _reg = null;
  global.PluginEngine = {
    ensure: function () {
      if (_reg) return _reg;
      var host = {
        engineVersion: '0.10.0',
        db: { query: function () { return []; } },
        ops: { append: function (type, params) { opsLog.push({ type: type, params: params }); return opsLog.length; } },
        modelval: MV, callout: null, process: null, postTokens: null,
        import: function (url) { return import(url); }
      };
      _reg = PluginRegistry.create(host);
      return _reg;
    }
  };
  var KO = { commitOp: function (db, type, params) { opsLog.push({ type: type, params: params }); return opsLog.length; } };

  var Bridge = require(path.join(ERP, 'ad_modelval_bridge.js'));

  // A DEMONSTRATION 4th row — the in-memory population only, never written back to ad_seed.db (the
  // shipped seed keeps exactly the 3 real extracted rows). Points at the real, already-shipped Phase-C
  // bundle, verbatim — nothing invented.
  var DEMO_URL = path.join(ERP, 'plugins', 'production_validator.mjs');
  var demoRow = {
    ad_modelvalidator_id: 999999,
    name: 'Fold Engine Demo — Production Guard (witness-injected, NOT part of the shipped seed)',
    modelvalidationclass: DEMO_URL, entitytype: 'U'
  };
  var allRows = realRows.concat([demoRow]);

  // Monkeypatch readValidators for this run only, so the bridge sees the exact population under test
  // (not re-derived by hand afterward) — restored immediately after each pass.
  var origRead = MV.readValidators;
  MV.readValidators = function () { return allRows; };
  var firstPass = await Bridge.installFromAdModelValidator(b, { db: seedDb, KO: KO });
  MV.readValidators = origRead;
  console.log('§W-MVBRIDGE_FIRSTPASS ' + JSON.stringify(firstPass));

  Witness('modelval_bridge')
    .population(function () { return firstPass; })
    .schema({
      type: 'object',
      required: ['adRowId', 'id', 'state', 'ok'],
      properties: {
        adRowId: { type: 'number' },
        id: { type: ['string', 'null'] },
        state: { type: 'string', enum: ['INSTALLED', 'UNRESOLVED', 'SKIP-DUPLICATE'] },
        ok: { type: 'boolean' }
      }
    })
    .invariant('vendor-rows-unresolved (3 real rows never install)', function (rs) {
      var vendor = rs.filter(function (r) { return r.adRowId !== 999999; });
      return vendor.length === 3 && vendor.every(function (r) { return r.state === 'UNRESOLVED' && r.ok === false; });
    })
    .invariant('entitytype-blind (D-type 50004/200002 and EE01-type 50000 fail alike — R3/Q3)', function (rs) {
      var byId = {}; rs.forEach(function (r) { byId[r.adRowId] = r; });
      return byId[50000] && byId[50000].state === 'UNRESOLVED' &&
             byId[50004] && byId[50004].state === 'UNRESOLVED' &&
             byId[200002] && byId[200002].state === 'UNRESOLVED';
    })
    .invariant('demo-row-installed-not-started (R1/Q1 — install proposes, never auto-approves)', function (rs) {
      var demo = rs.filter(function (r) { return r.adRowId === 999999; })[0];
      return !!demo && demo.state === 'INSTALLED' && demo.ok === true && demo.id === 'com.example.production-guard';
    })
    .invariant('modelval-autoinstall-op-appended, alongside (not instead of) PLUGIN_INSTALL (R5/Q5)', function () {
      return opsLog.some(function (o) { return o.type === 'MODELVAL_AUTOINSTALL' && o.params && o.params.adModelValidatorId === 999999; }) &&
             opsLog.some(function (o) { return o.type === 'PLUGIN_INSTALL'; });
    })
    .redControl(function (rs) {
      var c = rs.map(function (r) { return Object.assign({}, r); });
      var demo = c.filter(function (r) { return r.adRowId === 999999; })[0];
      if (demo) demo.state = 'ACTIVE';   // simulates the bridge WRONGLY auto-starting — must trip R1
      return c;
    })
    .run();

  // ── Phase 2 — the full flow: propose (above) -> approve -> activate. The "approve" step below is the
  // EXACT call plugin_release.js's own Enable toggle makes (pr.startBundle(p.id)) — reused verbatim
  // against the SAME registry instance the bridge installed into, not re-implemented. ───────────────────
  var reg = global.PluginEngine.ensure();
  var before = reg.get('com.example.production-guard');
  console.log('§W-MVBRIDGE_PRE_APPROVE id=' + (before && before.id) + ' state=' + (before && before.state));
  var started = await reg.startBundle('com.example.production-guard');
  console.log('§W-MVBRIDGE_APPROVED id=' + started.id + ' state=' + started.state);
  var hooks = MV.hooksFor('M_Production');
  var fired = (hooks.BEFORE_SAVE || []).indexOf('ProductionGuard.qtyNonNeg') >= 0;
  console.log('§W-MVBRIDGE_ACTIVATED hooks=' + JSON.stringify(hooks));
  console.log('§W-MVBRIDGE_PROOF activated=' + (started.state === 'ACTIVE' && fired));
  if (!(started.state === 'ACTIVE' && fired)) process.exitCode = 1;

  // ── Idempotency re-run (R2/Q2): the SAME full pass again must not throw and must skip cleanly. ───────
  MV.readValidators = function () { return allRows; };
  var secondPass = await Bridge.installFromAdModelValidator(b, { db: seedDb, KO: KO });
  MV.readValidators = origRead;
  console.log('§W-MVBRIDGE_RERUN ' + JSON.stringify(secondPass));
  var demo2 = secondPass.filter(function (r) { return r.adRowId === 999999; })[0];
  var idempotentOk = !!demo2 && demo2.state === 'SKIP-DUPLICATE' && demo2.ok === true;
  console.log('§W-MVBRIDGE_IDEMPOTENT dup-state=' + (demo2 && demo2.state) + ' ok=' + (demo2 && demo2.ok) + ' pass=' + idempotentOk);
  if (!idempotentOk) process.exitCode = 1;
})();
