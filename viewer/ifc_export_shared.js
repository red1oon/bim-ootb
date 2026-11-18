/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// # ⚠ DO NOT REMOVE — ifc_export_shared.js: the Viewer's ONE IFC export = the Modeller's proven writer (modeller/lod/lod_ifc.js) fed with the open building. Read the §IFC_EXPORT_SEL line after every export; the exit code is not evidence.
// Implementing bim-ootb prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md "(b) SPEC" — Witness: W-IFC-EXPORT-SEL (viewer/tests/witness_ifc_export_sel.js).
// Issue proved/disproved: "the Viewer's IFC is not valid IFC and cannot export a split (meta+geo) building."
// What it does: reads every element of the open building through modeller/lod/lod_reader.js fromDb(A.db, A.libDb) (the geometry DB of a split pair is read in place, never folded), builds lod_ifc.js elements
// (class, name, storey, colour, world triangles; read lazily, one element at a time) and runs LodIfc.buildSteps with anyElement. Elements with no geometry are not written: counted per class and listed.
// Pure part (IfcExportShared.collect / build / selLine, node + browser): no DOM. Page part (setupIfcExportShared): A.exportIfcShared(opts) = collect + build + download + status line + §IFC_EXPORT_SEL.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(function () { return { LodIfc: require('../modeller/lod/lod_ifc.js'), LodReader: require('../modeller/lod/lod_reader.js') }; });
  else { root.IfcExportShared = factory(function () { return { LodIfc: root.LodIfc, LodReader: root.LodReader }; }); root.setupIfcExportShared = function (A) { return root.IfcExportShared.setup(A); }; }
})(typeof self !== 'undefined' ? self : this, function (libs) {
  'use strict';
  // the cost of the browser writer, MEASURED (prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md (b) RESULT): file bytes per triangle by schema. A building whose estimate passes MAX_MB is refused with its reason, never half-written.
  var BYTES_PER_TRI = { IFC4: 35, IFC2X3: 170 }, MAX_MB = 400;

  function tbl(db, name) { return db.exec("SELECT 1 FROM sqlite_master WHERE type='table' AND name='" + name + "'").length > 0; }
  function rows(db, sql) { var r = db.exec(sql); return r.length ? r[0].values : []; }

  // the triangle soup (9 floats per triangle) of one element, from the reader's indexed world mesh; a triangle with an index outside the vertex list is dropped, counted by the caller through the length
  function soup(m) {
    if (!m || !m.V || !m.V.length) return new Float64Array(0);
    var V = m.V, F = m.F, nV = V.length / 3, out, n, t, k, o = 0;
    if (F && F.length >= 3) {
      n = Math.floor(F.length / 3); out = new Float64Array(n * 9);
      for (t = 0; t < n; t++) {
        var a = F[3 * t], b = F[3 * t + 1], c = F[3 * t + 2]; if (a >= nV || b >= nV || c >= nV) continue;
        var ix = [a, b, c]; for (k = 0; k < 3; k++) { out[o++] = V[3 * ix[k]]; out[o++] = V[3 * ix[k] + 1]; out[o++] = V[3 * ix[k] + 2]; }
      }
      return o === out.length ? out : out.slice(0, o);
    }
    n = Math.floor(V.length / 9); return V.slice(0, n * 9);   // no index list: the vertices already are a soup
  }

  // storey elevations the DB STATES: spatial_structure.elevation of the IfcBuildingStorey rows, only when one value holds for that name (the COMPILED center_z rows are derived centres, not stated elevations)
  function storeyElevations(db) {
    var out = {}, amb = {};
    if (!tbl(db, 'spatial_structure')) return { elev: out, ambiguous: [] };
    var cols = rows(db, 'PRAGMA table_info(spatial_structure)').map(function (r) { return r[1]; });
    if (cols.indexOf('elevation') < 0) return { elev: out, ambiguous: [] };
    rows(db, "SELECT name, elevation FROM spatial_structure WHERE type = 'IfcBuildingStorey' AND elevation IS NOT NULL AND name IS NOT NULL ORDER BY name").forEach(function (r) {
      if (amb[r[0]]) return; if (!(r[0] in out)) out[r[0]] = r[1]; else if (out[r[0]] !== r[1]) { delete out[r[0]]; amb[r[0]] = 1; }
    });
    return { elev: out, ambiguous: Object.keys(amb).sort() };
  }

  // collect(db, geoDb): every element of the building as a lod_ifc.js element + the census. db = the meta DB (A.db); geoDb = the geometry DB of a split pair (A.libDb), or null/same for a monolith.
  function collect(db, geoDb) {
    var L = libs(), R = L.LodReader.fromDb(db, geoDb && geoDb !== db ? geoDb : null), gdb = geoDb && geoDb !== db ? geoDb : db;
    var gt = tbl(gdb, 'component_geometries') ? 'component_geometries' : tbl(gdb, 'base_geometries') ? 'base_geometries' : null;
    var rowsMeta = tbl(db, 'elements_meta') ? rows(db, 'SELECT COUNT(*) FROM elements_meta')[0][0] : 0, guids = Object.keys(R.meta).sort(), census = { rows: rowsMeta, ids: guids.length, dupIds: rowsMeta - guids.length };
    var inst = {}; if (tbl(db, 'element_instances') && tbl(db, 'element_transforms')) rows(db, 'SELECT i.guid, i.geometry_hash FROM element_instances i JOIN element_transforms t USING(guid)').forEach(function (r) { inst[r[0]] = r[1]; });
    var good = {}; if (gt) rows(gdb, 'SELECT geometry_hash, length(vertices), length(faces) FROM ' + gt + ' WHERE vertices IS NOT NULL AND length(vertices) >= 36 AND (faces IS NULL OR length(faces) >= 12)').forEach(function (r) { good[r[0]] = r[2] ? r[2] / 12 : r[1] / 36; });
    var elements = [], noGeometry = {}, noGeometryList = [], tris = 0, disc = {}, classesSrc = {};
    guids.forEach(function (g) {
      var m = R.meta[g], h = inst[g]; classesSrc[m.cls] = (classesSrc[m.cls] || 0) + 1; disc[m.disc || ''] = (disc[m.disc || ''] || 0) + 1;
      if (h === undefined || good[h] === undefined) { noGeometry[m.cls] = (noGeometry[m.cls] || 0) + 1; noGeometryList.push(g); return; }
      tris += good[h];
      elements.push({ guid: g, cls: m.cls, name: m.name, storey: m.storey, rgba: m.rgba, get tris() { return soup(R.mesh(g)); } });
    });
    var el = storeyElevations(db);
    return { elements: elements, census: census, noGeometry: noGeometry, noGeometryList: noGeometryList, tris: tris, disciplines: disc, classesSrc: classesSrc, elev: el.elev, elevAmbiguous: el.ambiguous };
  }

  function estimateMB(tris, schema) { return Math.round(tris * BYTES_PER_TRI[schema === 'IFC2X3' ? 'IFC2X3' : 'IFC4'] / 1048576); }

  // build(col, opts): the writer, driven to the end. opts {schema, name, buildingName, projectName, kit, breakPredefined}. kit = an async-free time-slice kit (lod_registry.js shape); the page passes its own, node none.
  function buildGen(col, opts) {
    var L = libs(); opts = opts || {};
    return L.LodIfc.buildSteps(col.elements, { anyElement: true, schema: opts.schema === 'IFC2X3' ? 'IFC2X3' : 'IFC4', elev: col.elev, fileName: opts.name || 'building.ifc', projectName: opts.projectName || opts.buildingName || 'Building', buildingName: opts.buildingName || 'Building',
      description: 'BIMCompiler Viewer export: the whole building (' + col.elements.length + ' elements with geometry); frame: DB frame written as is (no frame file given)', kit: opts.kit, breakPredefined: !!opts.breakPredefined });
  }
  function build(col, opts) { var g = buildGen(col, opts), r = g.next(); while (!r.done) r = g.next(); return r.value; }

  function mapStr(o, f) { return '{' + Object.keys(o).sort().map(function (k) { return k + ':' + f(o[k]); }).join(',') + '}'; }
  // the spec's §IFC_EXPORT_SEL line (prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md §2.8 + (b) SPEC 4)
  function selLine(col, res, schema) {
    var st = res.stats || {}, bc = st.byClass || {};
    return '§IFC_EXPORT_SEL mode=whole disciplines=[' + Object.keys(col.disciplines).sort().join(',') + '] classes=[' + Object.keys(col.classesSrc).sort().join(',') + '] selected=' + col.census.ids + ' written=' + (st.written || 0) +
      ' byClass=' + mapStr(bc, function (v) { return v.cls + '*' + v.n; }) + ' schema=' + schema + ' frame=db proxied=' + mapStr(st.proxied || {}, String) + ' generalised=' + mapStr(st.generalised || {}, String) +
      ' noGeometry=' + col.noGeometryList.length + ' noGeometryByClass=' + mapStr(col.noGeometry, String) + ' dupIds=' + col.census.dupIds + ' storeysNoElevation=' + (st.storeysNoElevation || []).length + ' noStorey=' + (st.noStorey || 0) + ' triangles=' + Math.round(col.tris);
  }

  // ---- the page part
  function setup(A) {
    function T(key, dflt) { return (typeof window._trl === 'function') ? window._trl(key, null, dflt) : dflt; }
    function schemaChoice() { try { var v = localStorage.getItem('bim.ifcSchema'); if (v === 'IFC2X3' || v === 'IFC4') return v; } catch (e) { } return 'IFC4'; }
    function setSchema(v) { try { localStorage.setItem('bim.ifcSchema', v); } catch (e) { } }
    function say(t) { try { var el = document.getElementById('import-status') || A.status; if (el) el.textContent = t; } catch (e) { } }
    function baseName(n) { return String(n || 'building').replace(/\.(ifc|db|obj|stl|dae|glb|gltf|3ds|fbx)$/i, '').replace(/_(extracted|meta)$/i, '').replace(/[\\/:*?"<>|]+/g, '_'); }
    function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }
    A.ifcSchemaChoice = schemaChoice; A.setIfcSchemaChoice = setSchema;
    // opts {db, libDb, name, schema, download (false: return the text, for tests)}; resolves {ok, why?, bytes, name, stats, line, status}
    A.exportIfcShared = async function (opts) {
      opts = opts || {}; var db = opts.db || A.db, geo = opts.libDb !== undefined ? opts.libDb : A.libDb, schema = opts.schema === 'IFC2X3' ? 'IFC2X3' : (opts.schema === 'IFC4' ? 'IFC4' : schemaChoice()), nm = baseName(opts.name || A.activeBuilding), t0 = performance.now();
      if (!db) { say('Open a building first'); return { ok: false, why: 'no_building' }; }
      if (!window.LodIfc || !window.LodReader) { say('IFC export: the writer did not load'); console.log('§IFC_EXPORT_SEL FAIL writer-not-loaded'); return { ok: false, why: 'writer_not_loaded' }; }
      say('IFC (' + schema + '): reading the building...'); await tick();
      var col; try { col = collect(db, geo); } catch (e) { say('IFC export failed: ' + e.message); console.log('§IFC_EXPORT_SEL FAIL read ' + e.message); return { ok: false, why: 'read_failed:' + e.message }; }
      var est = estimateMB(col.tris, schema);
      if (!col.elements.length) { var w0 = 'IFC (' + schema + '): no element has geometry'; say(w0); console.log('§IFC_EXPORT_SEL FAIL no-geometry-elements selected=' + col.census.ids); return { ok: false, why: 'no_geometry', status: w0 }; }
      var limit = opts.maxMB !== undefined ? opts.maxMB : MAX_MB;   // opts.maxMB: the witness's hook to reach the refusal on a small building
      if (est > limit) { var w1 = 'IFC (' + schema + '): too large for the browser (about ' + est + ' MB from ' + Math.round(col.tris).toLocaleString() + ' triangles; the limit is ' + limit + ' MB)' + (schema === 'IFC2X3' ? '. Try IFC4' : ''); say(w1); console.log('§IFC_EXPORT_SEL REFUSED too-large estimateMB=' + est + ' limitMB=' + limit + ' triangles=' + Math.round(col.tris) + ' schema=' + schema); return { ok: false, why: 'too_large', estimateMB: est, status: w1 }; }
      var fileName = nm + '_' + schema + '.ifc', kit = { state: { prog: null }, _t: performance.now(), due: function () { return performance.now() - this._t > 14; } };
      var gen = buildGen(col, { schema: schema, name: fileName, buildingName: nm, projectName: nm, kit: kit }), r = gen.next();
      while (!r.done) { var p = kit.state.prog; if (p) say('IFC (' + schema + '): element ' + p.done + ' of ' + p.total + '...'); await tick(); kit._t = performance.now(); r = gen.next(); }
      var res = r.value;
      if (!res.ok) { say('IFC (' + schema + '): ' + res.why); console.log('§IFC_EXPORT_SEL REFUSED ' + res.why); return { ok: false, why: res.why, status: 'IFC (' + schema + '): ' + res.why }; }
      var blob = new Blob(res.parts, { type: 'application/octet-stream' }), mb = (blob.size / 1048576).toFixed(1), n = res.stats.written, status = 'IFC (' + schema + '): ' + n.toLocaleString() + ' elements, ' + mb + ' MB';
      var line = selLine(col, res, schema); console.log(line);
      var heap = (performance && performance.memory) ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
      console.log('§IFC_EXPORT_SEL_DONE file=' + fileName + ' bytes=' + blob.size + ' elements=' + n + ' noGeometry=' + col.noGeometryList.length + ' entities=' + res.stats.entities + ' ms=' + Math.round(performance.now() - t0) + ' heapMB=' + heap + ' estimateMB=' + est);
      console.log('[S229] §EXPORT_IFC key=' + nm + ' size=' + (blob.size / 1024).toFixed(0) + 'KB elements=' + n);
      if (opts.download !== false) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }
      say(status);
      A._ifcExportLast = { ok: true, file: fileName, schema: schema, bytes: blob.size, elements: n, noGeometry: col.noGeometryList.length, status: status, line: line, proxied: res.stats.proxied, generalised: res.stats.generalised, census: col.census };
      return { ok: true, name: fileName, bytes: blob.size, stats: res.stats, line: line, status: status, blob: blob, census: col.census, noGeometryList: col.noGeometryList };
    };
    console.log('§IFC_EXPORT_SHARED_MODULE loaded');
  }
  return { collect: collect, build: build, buildGen: buildGen, selLine: selLine, soup: soup, storeyElevations: storeyElevations, estimateMB: estimateMB, setup: setup, BYTES_PER_TRI: BYTES_PER_TRI, MAX_MB: MAX_MB };
});
