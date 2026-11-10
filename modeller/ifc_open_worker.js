// ⚠ DO NOT REMOVE — P-X (prompts/DXF2BIM_ARCHITECT_REVIEW.md ### P-X SPEC — Witness: W-IFC-OPEN-ONE). Read the log after every run.
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ifc_open_worker.js — the Modeller's raw-IFC open, off the main thread (as the retired import-worker path was): hosts the shared extractor
// (dxf2bim/ifc_extract_core.js) + the residents' rule (ifc_open_db.js). Input { bytes: ArrayBuffer, name: file stem }.
// Output { type: 'done', bytes: Uint8Array (the building DB), logs, kept, total, ms } or { type: 'error', message, logs }. The extractor's own § lines pass through in logs.
importScripts('../common/lib/web-ifc-api-iife.js', '../common/lib/sql-wasm.js', 'dxf2bim/ifc_extract_core.js', 'ifc_open_db.js');
try { importScripts('../common/ifc_grid_read.js'); } catch (eG) { console.warn('§IFC-GRID unavailable: reader failed to load ' + eG.message); }   // §4.2a: the one grid reader (the extractor logs 'unavailable' if it is missing)
try { importScripts('../common/georef_frame.js'); } catch (eF) { console.warn('§GEOREF unavailable: georef_frame.js failed to load ' + eF.message); }   // §ONE-FRAME: the rebase rule + site facts, the same module the Viewer import calls
self.onmessage = async function (e) {
  var d = e.data, logs = [], base = self.location.href;
  try {
    var api = new self.WebIFC.IfcAPI();
    await api.Init(function (p) { return new URL((p === 'web-ifc.wasm' ? '../common/lib/' : 'lib/') + p, base).href; });
    var SQL = await self.initSqlJs({ locateFile: function (f) { return new URL((f === 'sql-wasm.wasm' ? '../common/lib/' : 'lib/') + f, base).href; } });
    var nativeMaps = null;   // §12b: the unit / meaning data rows for the authoring tool's own property sets; absent = no untyped value gets an SI value
    try { var rm = await fetch(new URL('dxf2bim/native_maps.json', base).href); if (rm.ok) nativeMaps = await rm.json(); else logs.push('§PSET_NATIVE maps unavailable (' + rm.status + ')'); } catch (eM) { logs.push('§PSET_NATIVE maps unavailable ' + eM.message); }
    var out = await self.IfcOpenDb.open({ nativeMaps: nativeMaps, WebIFC: self.WebIFC, ifcApi: api, SQL: SQL, Core: self.IfcExtractCore, bytes: new Uint8Array(d.bytes), name: d.name, forceGeorefOffset: d.forceGeorefOffset || null,
      log: function (l) { l = String(l); if (/^§(SUMMARY|PSET_COMMON|PSET_NATIVE|GEOM_EMPTY|REL_FILLS_HOST|IFC-OPEN-X|GEOREF)|\[S220\] §GEOREF|FAIL/.test(l)) logs.push(l); } });
    var bytes = out.db.export(); out.db.close();
    self.postMessage({ type: 'done', bytes: bytes, logs: logs, georefOffset: out.georefOffset, total: out.total, kept: out.kept, ms: out.ms }, [bytes.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err), logs: logs });
  }
};
