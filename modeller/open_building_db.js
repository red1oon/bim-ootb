// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// open_building_db.js — the ONE reader of the open building's database (prompts/DXF2BIM_ARCHITECT_REVIEW.md U7, W-PROPS-PANEL P6-P8). Read the log after every run.
// get(): the open building's own DB (window.__dwBuf), one sql.js handle cached on the buffer (edit_delta_ui.js and proj_order_ui.js read it here; nobody closes it).
// partOf(db, guid): what the DB states about one element — elements_meta, element_type, element_pset_common (the standard Pset_*Common sets, occurrence over type);
// a table the DB lacks is null, never filled. ifcDb(): a raw .ifc opened in the Modeller (window.__lastIfcFile) was converted by the Viewer's import worker, which keeps
// no building property sets; the shared extractor (ifc_extract_core.js, the converter residents and every export use) converts that file ONCE into the standard DB
// and it is cached per file. partFor(guid) picks the source. Log tags §PROPS_IFC_EXTRACT.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OpenBuildingDb = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var _db = null, _buf = null, _ifc = { file: null, p: null };
  function has(db, t) { try { return db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='" + t + "'").length > 0; } catch (e) { return false; } }
  function q(db, sql, args) { var st = db.prepare(sql), out = []; st.bind(args || []); while (st.step()) out.push(st.getAsObject()); st.free(); return out; }
  function partOf(db, guid) {
    if (!db || !guid || !has(db, 'elements_meta')) return null;
    var m = q(db, 'SELECT * FROM elements_meta WHERE guid = ?', [guid])[0]; if (!m) return null;
    var t = has(db, 'element_type') ? (q(db, 'SELECT type_name, source FROM element_type WHERE guid = ?', [guid])[0] || null) : null;
    var ps = has(db, 'element_pset_common') ? q(db, 'SELECT pset, name, value, source FROM element_pset_common WHERE guid = ? ORDER BY pset, name', [guid]) : null;
    return { guid: guid, meta: m, type: t, psets: ps };
  }
  // ---- browser only below ----
  async function sql() { return window.SQL || await window.initSqlJs({ locateFile: function (f) { return new URL('lib/' + f, location.href).href; } }); }
  async function get() {
    var b = window.__dwBuf; if (!b) return null; if (_db && _buf === b) return _db;
    var SQL = await sql(); _db = new SQL.Database(b instanceof Uint8Array ? b : new Uint8Array(b)); _buf = b; return _db;
  }
  // the open building came from a raw .ifc (the Modeller's IFC open keeps the file: str_walker_outliner.js openIfcFile)
  function rawIfc() { var f = window.__lastIfcFile; return f && window.__dwName && f.name.replace(/\.ifc$/i, '') === window.__dwName ? f : null; }
  function ifcDb() {
    var f = rawIfc(); if (!f) return Promise.resolve(null);
    if (_ifc.file === f) return _ifc.p;
    _ifc.file = f;
    _ifc.p = (async function () {
      var t0 = performance.now();
      if (!window.RegReportUI) await new Promise(function (res, rej) { var s = document.createElement('script'); s.src = 'reg_report_ui.js?v=1'; s.onload = res; s.onerror = function () { rej(new Error('load failed reg_report_ui.js')); }; document.head.appendChild(s); });
      var eng = await window.RegReportUI.engine(), db = new eng.SQL.Database();   // the owners the Regulatory Report loads: web-ifc, sql.js, the shared extractor
      await eng.Core.extractToDb({ WebIFC: eng.WebIFC, ifcApi: eng.ifcApi, ifcData: new Uint8Array(await f.arrayBuffer()), db: eng.Core.sqljsDb(db), Buf: eng.Core.browserBuf,
        buildingName: 'MODEL', sourceName: f.name, log: function (l) { if (/§PSET_COMMON/.test(l)) console.log(l); } });   // the extractor's own pset line passes through
      var n = db.exec('SELECT count(*) FROM elements_meta')[0].values[0][0], np = has(db, 'element_pset_common') ? db.exec('SELECT count(*) FROM element_pset_common')[0].values[0][0] : 0;
      console.log('§PROPS_IFC_EXTRACT file=' + f.name + ' elements=' + n + ' psetRows=' + np + ' ms=' + Math.round(performance.now() - t0));
      return db;
    })().catch(function (e) { _ifc.file = null; console.warn('§PROPS_IFC_EXTRACT fail ' + (e && e.message || e)); return null; });
    return _ifc.p;
  }
  // the element's facts: the open DB; for a raw .ifc whose DB has no property sets, the standard DB the shared extractor makes of that file
  async function partFor(guid) {
    var p = partOf(await get(), guid);
    if (p && p.psets === null && rawIfc()) { var d = await ifcDb(), p2 = partOf(d, guid); if (p2) return { part: p2, via: 'ifc-extract' }; }
    return { part: p, via: 'building' };
  }
  return { get: get, partOf: partOf, partFor: partFor, ifcDb: ifcDb, rawIfc: rawIfc, has: has };
});
