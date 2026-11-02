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
  var heapMB = function () { return window.performance && performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null; };
  // §M3B-CARRY (prompts/MODELLER_MASTER.md §RESUME 2026-11-02 "M-3(b) SPEC"): the opened building's authored NON-ARC bodies (STR members/footings/columns, ACMV fans, any discipline) and its bodyless opening rows
  // reach the export without ever becoming scene meshes or op-log rows. ARC stays the edited substrate; the rest is read from the opened DB (window.__dwBuf + __dwGeoBuf) by the SAME seed code (ArcEditable.buildSeedOps
  // {rest:true}: one owner of "which rows are ARC"), folded by the renderer's own Library.foldInsert, written by Bonsai.ifc.build, then released. Same rule for a resident, a local .db and a P-X IFC open (all set __dwBuf).
  async function carryRest() {
    var A = window.ArcEditable, L = window.Bonsai.library, buf = window.__dwBuf;
    if (!(A && A.buildSeedOps && L && L.foldInsert && L.registerRealGeometry && buf && window.SQL)) { console.log(TAG + ' §M3B-CARRY none (no opened building substrate: __dwBuf=' + !!buf + ')'); return null; }
    var t0 = performance.now(), h0 = heapMB(), bdb = null, gdb = null;
    try {
      bdb = new window.SQL.Database(new Uint8Array(buf)); gdb = window.__dwGeoBuf ? new window.SQL.Database(new Uint8Array(window.__dwGeoBuf)) : null;
      var built = A.buildSeedOps(bdb, gdb || undefined, { rest: true, building: window.__dwName });
      var rows = function (sql) { try { var r = bdb.exec(sql); return r.length ? r[0].values : []; } catch (e) { return []; } };
      var nameBy = {}; rows("SELECT guid, element_name FROM elements_meta").forEach(function (v) { nameBy[v[0]] = v[1]; });
      var added = []; built.geomAssets.forEach(function (a) { if (!L.hasRealGeometry(a.hash)) added.push(a.hash); });
      L.registerRealGeometry(built.geomAssets);
      var vertsBy = {}, assetVerts = 0, maxOne = 0; built.geomAssets.forEach(function (a) { var n = a.v.length / 3; vertsBy[a.hash] = n; assetVerts += n; if (n > maxOne) maxOne = n; });
      var instVerts = 0, byClass = {}, ops = built.ops.filter(function (o) { return !(o.params && o.params.anchorOnly); }).map(function (o) {
        instVerts += vertsBy[o.params.realGeomHash] || 0; var c = o.params.ifc_class; byClass[c] = (byClass[c] || 0) + 1;
        return { id: 'c:' + o.outputGuid, op_type: 'GEOM_INSERT', parameters: o.params, outputGuid: o.outputGuid, carried: { guid: o.outputGuid, name: nameBy[o.outputGuid] || null } }; });
      // bodyless opening rows (a Modeller-exported .db keeps them as IfcOpeningElement + rel_fills_host; a resident's openings are GEOM_CUT rows already, so those are skipped, never doubled)
      var fid = window.__arcFidByGuid || {}, cutDone = {}; window.Bonsai.oplog._geomOps().forEach(function (o) { if (o.op_type === 'GEOM_CUT' && o.parameters && o.parameters.slide) cutDone[o.parameters.slide.opening] = 1; });
      var openN = 0, openRows = rows("SELECT r.opening_guid, r.host_guid, r.filling_guid, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, m.element_name FROM rel_fills_host r JOIN elements_meta m ON m.guid = r.opening_guid AND m.ifc_class = 'IfcOpeningElement' JOIN element_world_bbox b ON b.guid = r.opening_guid");
      openRows.forEach(function (v) { if (cutDone[v[0]]) return; openN++;
        ops.push({ id: 'c:' + v[0], op_type: 'GEOM_CUT', parent: fid[v[1]] != null ? fid[v[1]] : null, parameters: { parent: fid[v[1]] != null ? fid[v[1]] : null, void: { c1: [v[3], v[4], v[5]], c2: [v[6], v[7], v[8]] }, slide: { opening: v[0], filling: v[2], fillingFid: fid[v[2]] != null ? fid[v[2]] : null }, provenance: 'carried:opening' }, carried: { guid: v[0], name: v[9] } }); });
      var h1 = heapMB(), skip = new Set(Object.keys(byClass));
      console.log(TAG + ' §M3B-CARRY rows=' + (ops.length - openN) + ' openings=' + openN + ' refused=' + built.skipped.length + ' byClass=' + JSON.stringify(byClass) + ' | cost: sceneMeshes=0 oplogRows=0 distinctMeshes=' + built.geomAssets.length + ' meshVerts=' + assetVerts + ' largestMeshVerts=' + maxOne +
        ' | a re-seed would add instanceMeshes=' + (ops.length - openN) + ' instanceVerts=' + instVerts + ' (~' + (instVerts / 1e6 * 0.17).toFixed(2) + ' GB at 0.17 GB/Mvert)' + ' | heapMB before=' + h0 + ' withCarried=' + h1 + ' ms=' + Math.round(performance.now() - t0));
      return { ops: ops, skipDerivedClasses: skip, added: added, release: function () { return L.releaseRealGeometry(added); }, stats: { rows: ops.length - openN, openings: openN, instVerts: instVerts, assetVerts: assetVerts, byClass: byClass, refused: built.skipped.length } };
    } finally { try { if (bdb) bdb.close(); } catch (e) { } try { if (gdb) gdb.close(); } catch (e) { } }
  }
  window.Bonsai = window.Bonsai || {};
  window.Bonsai.exportViewerDb = async function (opts) {
    var O = window.Bonsai.oplog;
    if (!O || !O.db || O.length === 0) { console.log(TAG + ' nothing to export (author or convert something first)'); return null; }
    await loadCore();
    var t0 = performance.now(), carry = (opts && opts.carry === false) ? null : await carryRest(), built;   // opts.carry === false = the witness's falsifier (mechanism off)
    try { built = await window.Bonsai.ifc.build(carry ? { carried: carry } : undefined); }
    finally { if (carry) { var rel = carry.release(); console.log(TAG + ' §M3B-CARRY released ' + rel + ' transient mesh registrations; heapMB after build=' + heapMB()); } }
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
