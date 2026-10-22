// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — §D43 (prompts/DXF2BIM_FOUNDATION_LAYOUT... see prompts/DXF2BIM_FOUNDATION_LANE.md §D43): Export ▸ Viewer database (.db).
// The Modeller's own save is the signed op-log (`kernel_ops`): the Viewer cannot open it as a building. This writes the Viewer's database from the same model:
// IFC4 (Bonsai.ifc.build) -> the SAME extractor core the Node tool uses (dxf2bim/ifc_extract_core.js, web-ifc + sql.js) -> <name>_extracted.db. No new schema, no new extractor.
// Read the §VIEWERDB lines after every run.
(function () {
  'use strict';
  var TAG = '§VIEWERDB', _base = (document.currentScript && document.currentScript.src) || location.href, _core = null;
  function loadCore() {
    if (window.IfcExtractCore) return Promise.resolve(true);
    if (_core) return _core;
    _core = new Promise(function (res, rej) { var s = document.createElement('script'); s.src = new URL('dxf2bim/ifc_extract_core.js?v=1', _base).href; s.onload = res; s.onerror = function () { _core = null; rej(new Error('load failed dxf2bim/ifc_extract_core.js')); }; document.head.appendChild(s); });
    return _core;
  }
  function nameOf() {   // the drawing set's own @SET when a DXF set was converted (a person typed it), else the open model's name
    var D = window.DxfImportUI && window.DxfImportUI.state, E = window.DxfMetaEditor && window.DxfMetaEditor.state, mk = E && E.sheets ? E.sheets.map(function (sh) { return (sh.marks || []).filter(function (m) { return m.key === 'SET'; })[0]; }).filter(Boolean)[0] : null, set = (mk && mk.value) || (D && D.gate && D.gate.set);
    return String(set || window.__dwName || 'model').replace(/[^A-Za-z0-9_-]/g, '') || 'model'; }
  window.Bonsai = window.Bonsai || {};
  window.Bonsai.exportViewerDb = async function (opts) {
    var O = window.Bonsai.oplog;
    if (!O || !O.db || O.length === 0) { console.log(TAG + ' nothing to export (author or convert something first)'); return null; }
    await loadCore();
    var t0 = performance.now(), built = await window.Bonsai.ifc.build();
    if (!built || !built.bytes || built.bytes.length < 1000) { console.log(TAG + ' FAIL the IFC build is empty bytes=' + (built && built.bytes ? built.bytes.length : 0)); return null; }
    var api = new window.WebIFC.IfcAPI(); await api.Init(function (p) { return new URL('lib/' + p, _base).href; });
    var Core = window.IfcExtractCore, sdb = new window.SQL.Database(), name = nameOf(), prefix = name.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'MODEL', exLog = [];
    await Core.extractToDb({ WebIFC: window.WebIFC, ifcApi: api, ifcData: built.bytes, db: Core.sqljsDb(sdb), Buf: Core.browserBuf, buildingName: prefix, sourceName: name + '.ifc',
      log: function (m) { exLog.push(String(m)); }, progress: function () { } });
    var one = function (sql) { try { var r = sdb.exec(sql); return r.length ? r[0].values[0][0] : null; } catch (e) { return null; } };
    var tables = sdb.exec("select name from sqlite_master where type='table'")[0].values.map(function (v) { return v[0]; }), counts = {};
    tables.forEach(function (t) { counts[t] = one('select count(*) from "' + t + '"'); });
    var bytes = sdb.export(), elements = one('select count(*) from elements_meta');
    console.log(TAG + ' name=' + name + ' ifcBytes=' + built.bytes.length + ' elements=' + elements + ' tables=' + tables.length + ' dbBytes=' + bytes.length + ' ms=' + Math.round(performance.now() - t0) + ' counts=' + JSON.stringify(counts));
    if (!opts || opts.download !== false) {
      try { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' })); a.download = name + '_extracted.db'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
      catch (e) { console.warn(TAG + ' download failed ' + e); }
    }
    sdb.close();
    return { bytes: bytes, elements: elements, tables: tables, counts: counts, name: name, exLog: exLog, ifcBytes: built.bytes };
  };
})();
