// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — §EXPORTSAFE-SPEC (bim-compiler prompts/FINANCIALS_GROUNDING.md). READ THE LOG: §EXPORTSAFE lines; the exit code is not the evidence.
// sql.js db.export() closes+reopens the connection: the JS handle stays, but every create_function registration and every TEMP view/table is GONE.
// ONE owner for "things that live on the connection, not in the file": register(db, name, fn) runs fn(db) now AND again after every db.export() (db.export wrapped once).
// A per-site "already registered" flag cannot survive an export; a registry that re-runs the registrar can.
(function (global) {
  'use strict';
  function reg(db) {
    if (db.__exportSafe) return db.__exportSafe;
    var st = { fns: {}, order: [], rebinds: 0 }, orig = db.export;
    db.export = function () {
      var out = orig.apply(db, arguments); st.rebinds++;
      st.order.forEach(function (n) { try { st.fns[n](db); } catch (e) { console.log('§EXPORTSAFE-REBIND-FAIL name=' + n + ' ' + (e && e.message)); } });
      console.log('§EXPORTSAFE-REBIND n=' + st.order.length + ' names=' + st.order.join(','));
      return out;
    };
    db.__exportSafe = st; return st;
  }
  // register(db, name, fn): idempotent by name (a second call with the same name only replaces fn and re-runs it). Returns fn's result (first run).
  function register(db, name, fn) {
    var st = reg(db); if (!(name in st.fns)) st.order.push(name);
    st.fns[name] = fn; return fn(db);
  }
  function has(db, name) { return !!(db && db.__exportSafe && db.__exportSafe.fns[name]); }
  // the stored-function UDFs of the AD runtime (AdCallout.RUNTIME.registerSqlFunctions), the one shared registration
  function registerCoreUdfs(db, A) {
    if (!A || !A.RUNTIME || !A.RUNTIME.registerSqlFunctions || !db) return false;
    register(db, 'core-udf', function (d) { A.RUNTIME.registerSqlFunctions(function (n, f) { d.create_function(n, f); }); }); return true;
  }
  var api = { register: register, has: has, registerCoreUdfs: registerCoreUdfs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.ErpExportSafe = api;
})(typeof window !== 'undefined' ? window : globalThis);
