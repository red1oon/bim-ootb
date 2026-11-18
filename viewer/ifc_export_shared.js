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
// Step (c) (bim-ootb prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md "(c) SPEC"): collect(db, geoDb, sel) walks only the guids in sel (the set A.activeGuidFilter keeps: what Find has isolated); A.exportIfcShared({scope:'selection'}) writes <building>_selection_<schema>.ifc.
// Step (d) (prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md "(d) SPEC"): generated parts (upgrade_changes ADDED rows) are flagged part:true and go through the writer's PARTS path, as the Modeller writes them; elements_meta.material_name -> IfcMaterial; element_pset_common -> IfcPropertySet;
// element_parts -> IfcRelAggregates / Pset BIMC_Part; a DB guid that is a valid, unique 22-character IFC GlobalId is kept as the GlobalId; the Modeller's frame JSON passes through (A.setIfcFrame, the Frame control of the IFC row).
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

  // a GlobalId as ISO 16739 defines it: 22 characters of the IFC64 alphabet whose first one is 0-3 (it carries 128 bits)
  var GID_RE = /^[0-3][0-9A-Za-z_$]{21}$/;
  function isGid(g) { return typeof g === 'string' && GID_RE.test(g); }
  // a value of element_pset_common -> the typed value the writer writes: TRUE/FALSE (any case) -> boolean, a number -> number, anything else -> label text
  function psetValue(v) {
    if (v === null || v === undefined) return null; if (typeof v === 'number') return v; var t = String(v).trim();
    if (/^true$/i.test(t)) return true; if (/^false$/i.test(t)) return false;
    if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t) && isFinite(Number(t))) return Number(t);
    return String(v);
  }

  // collect(db, geoDb, sel, o): every element of the building as a lod_ifc.js element + the census. db = the meta DB (A.db); geoDb = the geometry DB of a split pair (A.libDb), or null/same for a monolith.
  // sel = a Set of guids (what Find has isolated) or null/undefined (the whole building). With a Set only its guids are walked (a filter, never a second writer): members with no elements_meta row are counted
  // in census.notInDb (first 20 in notInDbList), never written. o.ignoreSel is the witness's red-control hook (IFC_EXPORT_RED=noselfilter): the selection is read, then ignored.
  // Step (d): o.noParts (IFC_EXPORT_RED=noparts: no element is flagged part) and o.noPsets (IFC_EXPORT_RED=nopsets: element_pset_common is not read) are the witness's red-control hooks.
  function collect(db, geoDb, sel, o) {
    var L = libs(), R = L.LodReader.fromDb(db, geoDb && geoDb !== db ? geoDb : null), gdb = geoDb && geoDb !== db ? geoDb : db;
    var gt = tbl(gdb, 'component_geometries') ? 'component_geometries' : tbl(gdb, 'base_geometries') ? 'base_geometries' : null;
    var rowsMeta = tbl(db, 'elements_meta') ? rows(db, 'SELECT COUNT(*) FROM elements_meta')[0][0] : 0, guids = Object.keys(R.meta).sort(), census = { rows: rowsMeta, ids: guids.length, dupIds: rowsMeta - guids.length };
    var inst = {}; if (tbl(db, 'element_instances') && tbl(db, 'element_transforms')) rows(db, 'SELECT i.guid, i.geometry_hash FROM element_instances i JOIN element_transforms t USING(guid)').forEach(function (r) { inst[r[0]] = r[1]; });
    var good = {}; if (gt) rows(gdb, 'SELECT geometry_hash, length(vertices), length(faces) FROM ' + gt + ' WHERE vertices IS NOT NULL AND length(vertices) >= 36 AND (faces IS NULL OR length(faces) >= 12)').forEach(function (r) { good[r[0]] = r[2] ? r[2] / 12 : r[1] / 36; });
    var isSel = !!sel && typeof sel.has === 'function' && typeof sel.size === 'number', applySel = isSel && !(o && o.ignoreSel), notInDb = [], geomTotal = 0;
    if (applySel) { sel.forEach(function (g) { if (!(g in R.meta)) notInDb.push(g); }); notInDb.sort(); census.selected = sel.size; census.notInDb = notInDb.length; census.notInDbList = notInDb.slice(0, 20); }
    guids.forEach(function (g) { var h0 = inst[g]; if (h0 !== undefined && good[h0] !== undefined) geomTotal++; });
    var elements = [], noGeometry = {}, noGeometryList = [], tris = 0, disc = {}, classesSrc = {};
    // (d) the stored upgrade rows, psets, part relations, and the GlobalIds the DB already holds (unique over the WHOLE building, so a selection file writes the same GlobalId as the whole-building file)
    var up = {}; if (!(o && o.noParts) && tbl(db, 'upgrade_changes')) { try { rows(db, "SELECT guid, host_guid, rule, detail FROM upgrade_changes WHERE change = 'ADDED' ORDER BY seq").forEach(function (r) { if (!(r[0] in up)) up[r[0]] = { host: r[1], rule: r[2], detail: r[3] }; }); } catch (e) { up = {}; } }
    var ps = {}; if (!(o && o.noPsets) && tbl(db, 'element_pset_common')) { try { rows(db, 'SELECT guid, pset, name, value FROM element_pset_common ORDER BY guid, pset, name').forEach(function (r) { var q = ps[r[0]] = ps[r[0]] || {}, w = q[r[1]] = q[r[1]] || {}; if (!(r[2] in w)) w[r[2]] = psetValue(r[3]); }); } catch (e) { ps = {}; } }
    var parOf = {}; if (tbl(db, 'element_parts')) { try { rows(db, 'SELECT child_guid, parent_guid FROM element_parts ORDER BY child_guid, parent_guid').forEach(function (r) { if (r[0] !== r[1]) (parOf[r[0]] = parOf[r[0]] || []).push(r[1]); }); } catch (e) { parOf = {}; } }
    var dupRow = {}; if (tbl(db, 'elements_meta')) rows(db, 'SELECT guid FROM elements_meta GROUP BY guid HAVING COUNT(*) > 1').forEach(function (r) { dupRow[r[0]] = 1; });
    var keepOf = function (g) { return isGid(g) && !dupRow[g]; }, gidOfDb = function (g) { return keepOf(g) ? g : L.LodIfc.gidOf(g); }, nPart = 0;
    if (applySel) { guids = guids.filter(function (g) { return sel.has(g); }); census.ids = guids.length; }
    guids.forEach(function (g) {
      var m = R.meta[g], h = inst[g]; classesSrc[m.cls] = (classesSrc[m.cls] || 0) + 1; disc[m.disc || ''] = (disc[m.disc || ''] || 0) + 1;
      if (h === undefined || good[h] === undefined) { noGeometry[m.cls] = (noGeometry[m.cls] || 0) + 1; noGeometryList.push(g); return; }
      tris += good[h];
      var ne = { guid: g, cls: m.cls, name: m.name, storey: m.storey, rgba: m.rgba, get tris() { return soup(R.mesh(g)); } }, u = up[g];
      if (u) { ne.part = true; ne.host = u.host ? (u.host in R.meta ? gidOfDb(u.host) : u.host) : null; ne.rule = u.rule; ne.detail = u.detail === undefined ? null : u.detail; nPart++; }   // the host's GlobalId as THIS file writes it (the DB guid itself when it is a valid unique one)
      else { if (keepOf(g)) ne.keepGid = true; if (m.mat) ne.mat = m.mat; if (ps[g]) ne.psets = ps[g]; }
      elements.push(ne);
    });
    // (d) the parent of every written child: the first element_parts parent (sorted) that is itself written, else the first one; its GlobalId is the one the whole-building file writes for it (none when the parent is not in the DB)
    var wset = {}; elements.forEach(function (x) { wset[x.guid] = 1; });
    elements.forEach(function (x) { var c = parOf[x.guid]; if (!c) return; var pick = c.filter(function (pg) { return wset[pg]; })[0] || c[0]; x.parent = { guid: pick, elementId: pick, gid: pick in R.meta ? gidOfDb(pick) : null }; });
    var el = storeyElevations(db);
    return { sched: R.sched, parts: nPart, mode: applySel ? 'selection' : 'whole', geomTotal: geomTotal, elements: elements, census: census, noGeometry: noGeometry, noGeometryList: noGeometryList, tris: tris, disciplines: disc, classesSrc: classesSrc, elev: el.elev, elevAmbiguous: el.ambiguous };
  }

  function estimateMB(tris, schema) { return Math.round(tris * BYTES_PER_TRI[schema === 'IFC2X3' ? 'IFC2X3' : 'IFC4'] / 1048576); }

  // build(col, opts): the writer, driven to the end. opts {schema, name, buildingName, projectName, kit, breakPredefined}. kit = an async-free time-slice kit (lod_registry.js shape); the page passes its own, node none.
  function buildGen(col, opts) {
    var L = libs(); opts = opts || {};
    // the grade of a generated part's host, as the Modeller's Export (IFC) reads it (lod_ui.js gradeOf): element_dxf2bim Note_fy_MPa; none when the table or the value is absent (stated as not stated, never invented)
    var sched = col.sched || {}, gradeOf = function (h) { var sc = sched[h]; return sc && sc.Note_fy_MPa !== undefined && sc.Note_fy_MPa !== null ? { fy: sc.Note_fy_MPa, src: sc.NoteSource_fy_MPa === undefined || sc.NoteSource_fy_MPa === null ? 'None' : sc.NoteSource_fy_MPa } : null; };
    return L.LodIfc.buildSteps(col.elements, { anyElement: true, schema: opts.schema === 'IFC2X3' ? 'IFC2X3' : 'IFC4', elev: col.elev, fileName: opts.name || 'building.ifc', projectName: opts.projectName || opts.buildingName || 'Building', buildingName: opts.buildingName || 'Building',
      description: col.mode === 'selection' ? 'BIMCompiler Viewer export: what Find has isolated (' + col.elements.length + ' of ' + col.geomTotal + ' elements with geometry)' : 'BIMCompiler Viewer export: the whole building (' + col.elements.length + ' elements with geometry)',   // the writer appends the frame sentence
      frame: opts.frame || null, gradeOf: gradeOf, kit: opts.kit, breakPredefined: !!opts.breakPredefined });
  }
  function build(col, opts) { var g = buildGen(col, opts), r = g.next(); while (!r.done) r = g.next(); return r.value; }

  function mapStr(o, f) { return '{' + Object.keys(o).sort().map(function (k) { return k + ':' + f(o[k]); }).join(',') + '}'; }
  // the spec's §IFC_EXPORT_SEL line (prompts/VIEWER_IFC_EXPORT_BY_DISCIPLINE.md §2.8 + (b) SPEC 4)
  function selLine(col, res, schema) {
    var st = res.stats || {}, bc = st.byClass || {};
    var selMode = col.mode === 'selection';
    return '§IFC_EXPORT_SEL mode=' + (selMode ? 'selection' : 'whole') + ' disciplines=[' + Object.keys(col.disciplines).sort().join(',') + '] classes=[' + Object.keys(col.classesSrc).sort().join(',') + '] selected=' + (selMode ? col.census.selected : col.census.ids) + (selMode ? ' notInDb=' + col.census.notInDb + (col.census.notInDb ? ' notInDbFirst=[' + col.census.notInDbList.join(',') + ']' : '') : '') + ' written=' + (st.written || 0) +
      ' byClass=' + mapStr(bc, function (v) { return v.cls + '*' + v.n; }) + ' schema=' + schema + ' frame=' + (col.frameName || 'db') + ' proxied=' + mapStr(st.proxied || {}, String) + ' generalised=' + mapStr(st.generalised || {}, String) +
      ' noGeometry=' + col.noGeometryList.length + ' noGeometryByClass=' + mapStr(col.noGeometry, String) + ' dupIds=' + col.census.dupIds + ' storeysNoElevation=' + (st.storeysNoElevation || []).length + ' noStorey=' + (st.noStorey || 0) + ' triangles=' + Math.round(col.tris) +
      ' parts=' + (st.parts || 0) + ' partClasses=' + mapStr(st.partClasses || {}, String) + ' assemblies=' + (st.assemblies || 0) + ' materials=' + (st.materials || 0) + ' noMaterial=' + (st.noMaterial || 0) + ' psets=' + (st.psets || 0) + ' props=' + (st.props || 0) + ' aggregates=' + (st.aggregates || 0) + ' orphanParts=' + (st.orphanParts || 0) + ' gidKept=' + (st.gidKept || 0) + ' gidDerived=' + (st.gidDerived || 0) + (st.partsAsGeneric ? ' partsAsGeneric=' + st.partsAsGeneric : '');
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
    // the Modeller's frame JSON (LodIfc.validateFrame), kept per page: A.setIfcFrame(json, fileName) -> {ok, summary} | {ok:false, why}; a refused frame states why and keeps the previous choice. Read in the page, never uploaded.
    var frameState = null;
    A.ifcFrameChoice = function () { return frameState ? { name: frameState.name, summary: frameState.summary } : null; };
    A.setIfcFrame = function (json, name) {
      var v = window.LodIfc && window.LodIfc.validateFrame ? window.LodIfc.validateFrame(json) : { ok: false, why: 'the writer did not load' };
      if (!v.ok) { console.log('§IFC_EXPORT_SEL_FRAME REFUSED ' + (name || 'frame') + ': ' + v.why); return { ok: false, why: v.why }; }
      frameState = { json: json, name: name || 'frame.json', summary: v.summary }; console.log('§IFC_EXPORT_SEL_FRAME loaded ' + frameState.name + ' (' + v.summary + ')'); return { ok: true, summary: v.summary, name: frameState.name };
    };
    A.clearIfcFrame = function () { frameState = null; console.log('§IFC_EXPORT_SEL_FRAME cleared (DB frame)'); };
    // opts {frame (a frame JSON object; default = the page's A.setIfcFrame choice), frameName, db, libDb, name, schema, scope ('whole' default | 'selection'), sel (a Set; default A.activeGuidFilter), download (false: return the text, for tests)}; resolves {ok, why?, bytes, name, stats, line, status}
    // scope 'selection' = what Find has isolated: a Set with size > 0 (an EMPTY set is "nothing isolated", the merged-ghost lens uses it); with none the call returns {ok:false, why:'no_isolate'} and writes nothing.
    A.exportIfcShared = async function (opts) {
      opts = opts || {}; var db = opts.db || A.db, geo = opts.libDb !== undefined ? opts.libDb : A.libDb, schema = opts.schema === 'IFC2X3' ? 'IFC2X3' : (opts.schema === 'IFC4' ? 'IFC4' : schemaChoice()), nm = baseName(opts.name || A.activeBuilding), t0 = performance.now();
      if (!db) { say('Open a building first'); return { ok: false, why: 'no_building' }; }
      var wantSel = opts.scope === 'selection', selSet = null;
      if (wantSel) {
        var raw = opts.sel !== undefined ? opts.sel : A.activeGuidFilter;
        if (!raw || typeof raw.has !== 'function' || !(raw.size > 0)) { var w9 = T('ui_exp_scope_none', 'Find and isolate first'); say(w9); console.log('§IFC_EXPORT_SEL REFUSED no_isolate size=' + (raw && raw.size)); return { ok: false, why: 'no_isolate', status: w9 }; }
        selSet = new Set(raw);   // a snapshot: the page keeps working (and may clear the isolate) while the writer yields
      }
      if (!window.LodIfc || !window.LodReader) { say('IFC export: the writer did not load'); console.log('§IFC_EXPORT_SEL FAIL writer-not-loaded'); return { ok: false, why: 'writer_not_loaded' }; }
      say('IFC (' + schema + '): reading the building...'); await tick();
      var fr = opts.frame !== undefined ? opts.frame : (frameState ? frameState.json : null), frName = fr ? (opts.frame !== undefined ? (opts.frameName || 'frame') : frameState.name) : null;
      if (fr) { var fv = window.LodIfc.validateFrame(fr); if (!fv.ok) { var wf = 'IFC (' + schema + '): the frame file is refused: ' + fv.why; say(wf); console.log('§IFC_EXPORT_SEL REFUSED frame ' + fv.why); return { ok: false, why: 'frame_refused', status: wf }; } }
      var col; try { col = collect(db, geo, selSet, { noParts: !!opts.noParts, noPsets: !!opts.noPsets }); col.frameName = frName; } catch (e) { say('IFC export failed: ' + e.message); console.log('§IFC_EXPORT_SEL FAIL read ' + e.message); return { ok: false, why: 'read_failed:' + e.message }; }
      var est = estimateMB(col.tris, schema);
      if (!col.elements.length) { var w0 = 'IFC (' + schema + '): no element has geometry'; say(w0); console.log('§IFC_EXPORT_SEL FAIL no-geometry-elements selected=' + col.census.ids); return { ok: false, why: 'no_geometry', status: w0 }; }
      var limit = opts.maxMB !== undefined ? opts.maxMB : MAX_MB;   // opts.maxMB: the witness's hook to reach the refusal on a small building
      if (est > limit) { var w1 = 'IFC (' + schema + '): too large for the browser (about ' + est + ' MB from ' + Math.round(col.tris).toLocaleString() + ' triangles; the limit is ' + limit + ' MB)' + (schema === 'IFC2X3' ? '. Try IFC4' : ''); say(w1); console.log('§IFC_EXPORT_SEL REFUSED too-large estimateMB=' + est + ' limitMB=' + limit + ' triangles=' + Math.round(col.tris) + ' schema=' + schema); return { ok: false, why: 'too_large', estimateMB: est, status: w1 }; }
      var fileName = nm + (wantSel ? '_selection_' : '_') + schema + '.ifc', kit = { state: { prog: null }, _t: performance.now(), due: function () { return performance.now() - this._t > 14; } };
      var gen = buildGen(col, { schema: schema, name: fileName, buildingName: nm, projectName: nm, kit: kit, frame: fr }), r = gen.next();
      while (!r.done) { var p = kit.state.prog; if (p) say('IFC (' + schema + '): element ' + p.done + ' of ' + p.total + '...'); await tick(); kit._t = performance.now(); r = gen.next(); }
      var res = r.value;
      if (!res.ok) { say('IFC (' + schema + '): ' + res.why); console.log('§IFC_EXPORT_SEL REFUSED ' + res.why); return { ok: false, why: res.why, status: 'IFC (' + schema + '): ' + res.why }; }
      var blob = new Blob(res.parts, { type: 'application/octet-stream' }), mb = (blob.size / 1048576).toFixed(1), n = res.stats.written, status = 'IFC (' + schema + '): ' + n.toLocaleString() + ' elements' + (wantSel ? ' (Find selection)' : '') + ', ' + mb + ' MB';
      var line = selLine(col, res, schema); console.log(line);
      var heap = (performance && performance.memory) ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
      console.log('§IFC_EXPORT_SEL_DONE file=' + fileName + ' bytes=' + blob.size + ' elements=' + n + ' noGeometry=' + col.noGeometryList.length + (wantSel ? ' notInDb=' + col.census.notInDb : '') + ' entities=' + res.stats.entities + ' ms=' + Math.round(performance.now() - t0) + ' heapMB=' + heap + ' estimateMB=' + est);
      console.log('[S229] §EXPORT_IFC key=' + nm + ' size=' + (blob.size / 1024).toFixed(0) + 'KB elements=' + n);
      if (opts.download !== false) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }
      say(status);
      A._ifcExportLast = { ok: true, scope: wantSel ? 'selection' : 'whole', file: fileName, schema: schema, bytes: blob.size, elements: n, noGeometry: col.noGeometryList.length, notInDb: wantSel ? col.census.notInDb : 0, status: status, line: line, proxied: res.stats.proxied, generalised: res.stats.generalised, census: col.census, parts: res.stats.parts, aggregates: res.stats.aggregates, psets: res.stats.psets, props: res.stats.props, frame: frName };
      return { ok: true, name: fileName, bytes: blob.size, stats: res.stats, line: line, status: status, blob: blob, census: col.census, noGeometryList: col.noGeometryList };
    };
    console.log('§IFC_EXPORT_SHARED_MODULE loaded');
  }
  return { collect: collect, build: build, buildGen: buildGen, selLine: selLine, soup: soup, storeyElevations: storeyElevations, estimateMB: estimateMB, setup: setup, BYTES_PER_TRI: BYTES_PER_TRI, MAX_MB: MAX_MB };
});
