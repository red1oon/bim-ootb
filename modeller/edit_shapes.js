// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// edit_shapes.js — the real-shape check behind the edit report's overlap row.
// Implementing bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §20.2.9 (decided 2026-11-09) — Witness: W-EDIT-REPORT-SHAPES (modeller/tests/witness_edit_shapes.js).
// ISSUE IT PROVES OR DISPROVES: the "New or deeper box overlap" row counts bounding boxes, so a pair whose boxes overlap but whose shapes never touch
// is reported (and, through the §15.1 stop, refused) as an overlap. This file takes the pairs that row counts and asks the Viewer's OWN narrow phase
// (viewer/clash_narrow.js testPair, loaded unchanged, never forked) about each one. It holds no rule of its own beyond the mapping from testPair's answer to a word:
//   CLASH  -> "clash"   (a thin shared face, §OVERLAP_FLAT, is "touching": §20.2.9 item 3)
//   CLEAR with MESH_TOUCH_ONLY -> "touching"       CLEAR otherwise -> "box only, shapes clear"
//   anything else (no geometry, library missing, cap, an error) -> "not judged: <reason>"
// The stop reads "clash" and "not judged" only (the shape test may remove false stops, never add a miss). Loaded on the FIRST committed grid move, not at open (§15.2).
// Log tags §EDIT_SHAPES. The BVH library is the vendored common/lib/three-mesh-bvh.module.js (MIT), so an air-gapped Modeller has the check.
(function () {
  'use strict';
  var MAX_JUDGE = 500;   // pairs judged per edit; the rest are "not judged: cap reached" and stay a box stop. Measured worst case on the public buildings: 29.
  var loadP = null;
  function log(s) { console.log('§EDIT_SHAPES ' + s); }

  function addScript(src) {
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error(src + ' did not load')); }; document.head.appendChild(s); });
  }
  // load(): the Viewer's narrow phase + the vendored BVH library. Resolves true, or false with window.EditShapes.loadError set. Never throws.
  function load() {
    if (window.A && window.A.clashNarrow && window.A.clashNarrow.testPair && window._bvhReady && window.THREE.BufferGeometry.prototype.computeBoundsTree) return Promise.resolve(true);
    if (loadP) return loadP;
    var t0 = performance.now();
    loadP = (async function () {
      var bvh = await import('../common/lib/three-mesh-bvh.module.js');
      if (!bvh.computeBoundsTree || !bvh.disposeBoundsTree) throw new Error('three-mesh-bvh did not export computeBoundsTree');
      window.THREE.BufferGeometry.prototype.computeBoundsTree = bvh.computeBoundsTree;
      window.THREE.BufferGeometry.prototype.disposeBoundsTree = bvh.disposeBoundsTree;
      if (!(window.A && window.A.clashNarrow && window.A.clashNarrow.testPair)) {
        await addScript('../viewer/clash_narrow.js?v=1');
        if (typeof setupClashNarrow !== 'function') throw new Error('clash_narrow.js did not define setupClashNarrow');
        if (!window.A.ifc2three) window.A.ifc2three = function (x, y, z) { return { x: x, y: z, z: -y }; };   // unused: testPair is given each mesh's own matrixWorld
        setupClashNarrow(window.A);
      }
      // self-test: a library that loads but cannot build a tree must not read as a working shape check
      var g = new window.THREE.BoxGeometry(1, 1, 1); g.computeBoundsTree();
      var ok = !!g.boundsTree; g.disposeBoundsTree(); g.dispose();
      if (!ok) throw new Error('self-test: computeBoundsTree built no tree');
      window._bvhReady = true;
      log('loaded ms=' + (performance.now() - t0).toFixed(0) + ' source=local (common/lib/three-mesh-bvh.module.js) testPair=' + typeof window.A.clashNarrow.testPair);
      return true;
    })().catch(function (e) {
      window._bvhReady = false; window.EditShapes.loadError = String(e && e.message || e).slice(0, 200); loadP = null;
      console.warn('§EDIT_SHAPES LOAD_FAIL ' + window.EditShapes.loadError + ' - the edit falls back to the box stop');
      return false;
    });
    return loadP;
  }

  // testPair's answer -> the report's word. PURE.
  function word(r) {
    if (!r) return { word: 'not judged', why: 'no answer from the narrow phase' };
    if (r.verdict === 'CLASH') return r.overlapFlat ? { word: 'touching', why: 'thin shared face (under 1 mm), not a clash' } : { word: 'clash', why: r.reason };
    if (r.verdict === 'CLEAR') return r.reason === 'MESH_TOUCH_ONLY' ? { word: 'touching', why: 'triangles meet only along contacts under 1 mm' } : { word: 'box only, shapes clear', why: r.reason };
    return { word: 'not judged', why: r.err || (r.reason === 'NO_GEOMETRY' ? 'no geometry for one side' : r.reason) || 'unknown' };
  }

  var metaCache = { buf: null, rows: {} };
  // name, class, discipline, storey per guid, read once from the open building's own meta.db (the way building_parts_outliner.js opens it). Missing = null, never guessed.
  function metaFor(guids) {
    if (metaCache.buf !== window.__dwBuf) metaCache = { buf: window.__dwBuf, rows: {} };
    var need = guids.filter(function (g) { return g && !(g in metaCache.rows); });
    if (need.length && window.__dwBuf && window.SQL) {
      var db = null;
      try {
        db = new window.SQL.Database(new Uint8Array(window.__dwBuf));
        for (var i = 0; i < need.length; i += 200) {
          var part = need.slice(i, i + 200).map(function (g) { return "'" + String(g).replace(/'/g, "''") + "'"; }).join(',');
          var r = db.exec('SELECT guid, element_name, ifc_class, discipline, storey FROM elements_meta WHERE guid IN (' + part + ')');
          if (r.length) r[0].values.forEach(function (v) { metaCache.rows[v[0]] = { name: v[1], cls: v[2], disc: v[3], storey: v[4] }; });
        }
      } catch (e) { log('meta read failed: ' + (e && e.message)); } finally { try { db && db.close(); } catch (e2) { } }
      need.forEach(function (g) { if (!(g in metaCache.rows)) metaCache.rows[g] = null; });
    }
    return guids.map(function (g) { return g ? metaCache.rows[g] || null : null; });
  }

  function elem(fid, guid, m) {
    return { fid: fid, name: m && m.name != null ? m.name : null, cls: m && m.cls != null ? m.cls : null, disc: m && m.disc != null ? m.disc : null, storey: m && m.storey != null ? m.storey : null };
  }

  // judge({pairs:[{a,b,depth}], before:[{a,b,depth}]|null, after:[{a,b,depth}]|null, tolMm}) -> the shapes record the report carries.
  // pairs = the gate's "clash" rows (new or deeper). before/after = every box pair over the tolerance on the moved elements, used only for new/deeper/resolved.
  // The record holds NO timing and no heap, so the report stays byte-identical run to run (W-EDIT-CLI C2/C3); cost goes to the §EDIT_SHAPES line.
  function judge(inp) {
    var t0 = performance.now(), NT = window.A && window.A.clashNarrow;
    if (!NT || !NT.testPair || !window._bvhReady) return { state: 'FALLBACK', reason: window.EditShapes.loadError || 'the shape module is not loaded' };
    var byFid = {}; window.Bonsai.group().children.forEach(function (m) { if (m.isMesh && m.userData && m.userData.featureId != null && !m.userData.anchor) byFid[m.userData.featureId] = m; });
    var had = {}; (inp.before || []).forEach(function (p) { had[p.a + '|' + p.b] = p.depth; });
    var hasBefore = !!inp.before, gbf = window.__arcGuidByFid || {};
    var pairs = (inp.pairs || []).map(function (p) { return { a: Math.min(p.a, p.b), b: Math.max(p.a, p.b), depth: p.depth }; }).sort(function (x, y) { return x.a - y.a || x.b - y.b; });
    var fids = []; pairs.forEach(function (p) { fids.push(p.a, p.b); });
    var uniq = fids.filter(function (f, i) { return fids.indexOf(f) === i; }), metas = metaFor(uniq.map(function (f) { return gbf[f]; })), metaByFid = {};
    uniq.forEach(function (f, i) { metaByFid[f] = elem(f, gbf[f], metas[i]); });
    var tg = performance.now(); if (window.__editShapesMeasure && window.gc) window.gc(); var gcMs = performance.now() - tg, heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
    var built = [], geoSeen = new Set(), verts = 0, tally = { clash: 0, touching: 0, 'box only, shapes clear': 0, 'not judged': 0 }, out = [];
    pairs.forEach(function (p, i) {
      var ma = byFid[p.a], mb = byFid[p.b], r = null, w;
      if (i >= MAX_JUDGE) w = { word: 'not judged', why: 'cap reached (' + MAX_JUDGE + ' pairs judged per edit)' };
      else if (!ma || !mb) w = { word: 'not judged', why: 'no mesh for ' + (!ma ? 'fid ' + p.a : 'fid ' + p.b) };
      else {
        try {
          [ma, mb].forEach(function (m) { if (!m.geometry.boundsTree) built.push(m.geometry); if (!geoSeen.has(m.geometry)) { geoSeen.add(m.geometry); verts += m.geometry.attributes.position.count; } });
          ma.updateWorldMatrix(true, false); mb.updateWorldMatrix(true, false);
          r = NT.testPair(ma.geometry, ma.matrixWorld, mb.geometry, mb.matrixWorld, { ctx: { bvhReused: 0, bvhBuiltNew: 0 } });
          w = word(r);
        } catch (e) { w = { word: 'not judged', why: 'error: ' + String(e && e.message || e).slice(0, 80) }; }
      }
      tally[w.word]++;
      var boxMm = +(p.depth * 1000).toFixed(1), meshMm = r && r.verdict === 'CLASH' && typeof r.depthMeshM === 'number' ? +(r.depthMeshM * 1000).toFixed(1) : null;
      var a = metaByFid[p.a], b = metaByFid[p.b], k = p.a + '|' + p.b;
      out.push({
        a: a, b: b, verdict: w.word, why: w.why || null,
        depth_mm: w.word === 'clash' && meshMm != null ? meshMm : boxMm, depth_basis: w.word === 'clash' && meshMm != null ? 'mesh' : 'box', box_depth_mm: boxMm,
        tol_mm: inp.tolMm, status: !hasBefore ? null : (had[k] == null ? 'new' : 'deeper')
      });
    });
    built.forEach(function (g) { try { g.disposeBoundsTree && g.disposeBoundsTree(); } catch (e) { } });   // only the trees this call built; the build -> judge -> dispose heap stays flat
    var msWork = performance.now() - t0 - gcMs;   // the measuring GCs (witness only) are not the cost
    if (window.__editShapesMeasure && window.gc) window.gc(); var pm = performance.memory, heap1 = pm ? pm.usedJSHeapSize : 0;
    // resolved: a box pair on the moved elements that was over the tolerance before and is not after (box level: the Before meshes no longer exist to judge)
    var resolved = null;
    if (inp.before && inp.after) {
      var now = {}; inp.after.forEach(function (p) { now[p.a + '|' + p.b] = 1; });
      var gone = inp.before.filter(function (p) { return !now[p.a + '|' + p.b]; });
      var rf = []; gone.slice(0, 20).forEach(function (p) { rf.push(p.a, p.b); });
      var ru = rf.filter(function (f, i) { return rf.indexOf(f) === i; }), rm = metaFor(ru.map(function (f) { return gbf[f]; })), rmb = {};
      ru.forEach(function (f, i) { rmb[f] = elem(f, gbf[f], rm[i]); });
      resolved = { count: gone.length, basis: 'box', listed: gone.slice(0, 20).map(function (p) { return { a: rmb[p.a], b: rmb[p.b], box_depth_mm: +(p.depth * 1000).toFixed(1) }; }) };
    }
    var rec = {
      state: 'JUDGED', tol_mm: inp.tolMm, judged: pairs.length, tally: tally, pairs: out, resolved: resolved,
      // the stop count: shapes that clash plus pairs that could not be judged (they keep today's box verdict)
      stop_count: tally.clash + tally['not judged'], cleared: tally.touching + tally['box only, shapes clear']
    };
    var ms = msWork, hm = (heap1 - heap0) / 1048576;
    console.log('§EDIT_REPORT_SHAPES_COST shape_ms=' + ms.toFixed(1) + ' shape_pairs=' + pairs.length + ' bvh_heap_mb=' + hm.toFixed(2) + ' verts=' + verts + ' heapMB=' + (pm ? (pm.usedJSHeapSize / 1048576).toFixed(0) : '?') +
      ' tally=' + JSON.stringify(tally));
    window.__editShapesCost = { shape_ms: +ms.toFixed(1), shape_pairs: pairs.length, bvh_heap_mb: +hm.toFixed(2), verts: verts, geoms: geoSeen.size };
    return rec;
  }

  window.EditShapes = { load: load, judge: judge, word: word, MAX_JUDGE: MAX_JUDGE, loadError: null };
})();
