// ⚠ DO NOT REMOVE — P-X (prompts/DXF2BIM_ARCHITECT_REVIEW.md ### P-X SPEC — Witness: W-IFC-OPEN-ONE). Read the log after every run.
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ifc_open_worker.js — the Modeller's raw-IFC open, off the main thread (as the retired import-worker path was): hosts the shared extractor
// (dxf2bim/ifc_extract_core.js) + the residents' rule (ifc_open_db.js). Input { bytes: ArrayBuffer, name: file stem }.
// Output { type: 'done', bytes: Uint8Array (the building DB), logs, kept, total, ms } or { type: 'error', message, logs }. The extractor's own § lines pass through in logs.
importScripts('lib/web-ifc-api-iife.js', 'lib/sql-wasm.js', 'dxf2bim/ifc_extract_core.js', 'ifc_open_db.js');
self.onmessage = async function (e) {
  var d = e.data, logs = [], base = self.location.href;
  try {
    var api = new self.WebIFC.IfcAPI();
    await api.Init(function (p) { return new URL('lib/' + p, base).href; });
    var SQL = await self.initSqlJs({ locateFile: function (f) { return new URL('lib/' + f, base).href; } });
    var out = await self.IfcOpenDb.open({ WebIFC: self.WebIFC, ifcApi: api, SQL: SQL, Core: self.IfcExtractCore, bytes: new Uint8Array(d.bytes), name: d.name,
      log: function (l) { l = String(l); if (/^§(SUMMARY|PSET_COMMON|GEOM_EMPTY|REL_FILLS_HOST|IFC-OPEN-X)|FAIL/.test(l)) logs.push(l); } });
    var bytes = out.db.export(); out.db.close();
    self.postMessage({ type: 'done', bytes: bytes, logs: logs, total: out.total, kept: out.kept, ms: out.ms }, [bytes.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err), logs: logs });
  }
};
