/**
 * BIM OOTB — Cross-Edges (the typed SPATIAL DEPENDENCY GRAPH, derived on-the-fly in the Modeller).
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * SPATIAL_DEPENDENCY_GRAPH.md §ABUTS — the typed LATERAL edges over the bom-graph containment backbone.
 * The bom-graph tab (PR #539) shipped the TREE half (Building→Storey→Room→element). This is the GRAPH
 * half: the typed cross-edges, DERIVED AT RUNTIME from the pristine bbox substrate (element_transforms),
 * NOT baked into the DB — the modeller's residents stay pristine (containment + spatial_structure only).
 *
 * This slice ships the FIRST cross-edge: `abuts` (face-touch adjacency). It is a faithful JS port of the
 * witnessed Python `_face_touch` + `derive_adjacency` (extractIFCtoDB.py, W-SDG-ABUTS 16/16) — same tol,
 * same min-overlap, same touch-axis rule, same unordered de-dup. NON-INVENT: every edge is a MEASURED
 * shared-face contact (provenance 'derived:face-touch'); NO proximity radius, NO IFC class names (grep-clean).
 *
 * §ABUTS-ATTRIBUTE-PRIOR (proposed 2026-09-18, not built — see bim-compiler prompts/
 * SPATIAL_DEPENDENCY_GRAPH.md for the full reasoning): `abuts` is the one edge type with no classic ERP
 * analogue (adjacency is cyclic, a BOM line can't express it) — but a Product ATTRIBUTE (componenttype /
 * conn_points, both already real — see hr_bim_asset/ad_bom.js, real_placement_resolver.js) could supply a
 * semantic PRIOR that cross-checks this file's purely-geometric face-touch test, not replace it. Motivated
 * by a real gap: G4 measured 843/9,817 (8.6%) of SampleCastle's derived abuts edges disagreeing with the
 * live render. SUPERSEDED 2026-09-18 — that gap was a WIRING bug, not semantic ambiguity, and is now fixed
 * (§XEDGE-GEOWIRE below): 843 -> 11. The attribute-prior hypothesis was TESTED against ifc_class and does
 * NOT discriminate (`IfcCovering<->IfcWall` is both the #1 disagreeing pair and the #2 agreeing pair), so
 * do not build it to explain those 843. It may still have value on whatever residual remains — but that is
 * now 11 pairs, not 843, and unexamined.
 *
 * AABB convention (scripts/backfill_bbox.py): element_transforms.bbox_k = FULL extent (maxK-minK),
 * center_k = (minK+maxK)/2 → minK = center_k - bbox_k/2, maxK = center_k + bbox_k/2.
 * ⚠ THAT SECOND HALF IS FALSE FOR REAL BUILDINGS, and it is the whole reason this fallback is wrong:
 * `center_xyz` is the IFC local-placement ANCHOR, not the volumetric centre (arc_editable.js's §ARC-ANCHOR
 * and real_geometry.js's `recenter()` both say so, and both correct for it with `anchorOffset`). Measured
 * on SampleCastle 2026-09-18: of the 934 elements in disagreeing pairs the live AABB SIZE matches authored
 * `bbox_*` 934/934, but the CENTRE differs on 798/934, median 78mm, up to ~425mm — so `[center ± bbox/2]`
 * is the right-SIZED box in the WRONG PLACE. This is a FALLBACK
 * only (§REAL-AABB below) — measured to disagree with the actual rendered scene on 924/9817 (9.4%) of a
 * real building's abuts pairs (SampleCastle, RESUME_SESSION_2026-07-04_GATE_BACKPROP.md item 3 audit), not
 * a narrow edge case.
 *
 * §REAL-AABB (2026-07-04 fix): `element_transforms.center_xyz`/`bbox_xyz` is a coarser measure than the
 * REAL per-element vertex blob (`component_geometries`/`base_geometries`, keyed by `element_instances.
 * geometry_hash`) `bonsai_library.js`'s `foldInsert` actually renders — the two disagree whenever a real
 * blob is resolvable (SampleCastle: ALL 3,225 guids resolve, sharing 1,924 distinct meshes — the 2026-09-18
 * "1,924 of 3,225 elements" read hashes as guids, see §XEDGE-3AXIS; the older
 * "100%" claim here was wrong; most classes, not just furniture,
 * show a real mismatch). Where a real blob IS resolvable, `_readBoxes()` now computes the TRUE world AABB
 * straight from it — `real_geometry.js`'s own documented ground truth: world = center_xyz + R(rotation_z)·
 * rawVert, for every raw vertex (envelope of the ROTATED+TRANSLATED mesh, not just a centre-shift) —
 * reusing `RealGeometry.buildGeometryIndex` (a sibling pure-DB module, same design as this file) rather
 * than re-deriving the same decode/dedup logic. Yaw-only (`rotation_z`): its stated premise — "every
 * building measured so far has `rotation_x=rotation_y=0`" — is FALSE, and was corrected at its source in
 * bim-ootb #1738: the shipped `SampleCastle_ARC.db` carries 293 rows with `rotation_y = +/-pi/2` exactly.
 * So this guard DOES fire on real data, and is a suspect for part of the residual 11 (see §XEDGE-GEOWIRE).
 * The 3-axis render path it distrusts is now itself witnessed (W-ARC-3AXIS: 230 genuinely rotated, 0
 * dropped), so lifting the guard is probably safe — but that is its own measured change, not assumed here.
 * DONE 2026-09-24 in the browser — see §XEDGE-3AXIS. Outside the browser, a genuinely 3-axis-rotated element
 * still falls back to the coarse bbox below rather than risk an under-tested quaternion port (same conservative
 * non-invent choice arc_editable.js made). Falls back to the coarse `element_transforms` bbox when no real
 * blob resolves (RealGeometry absent, no `geometry_hash`, missing blob, or degenerate <3 verts) — today's
 * behaviour, unchanged for that case.
 *
 * Scale: sweep-and-prune on X (sort by minX, active window pruned by maxX) → near-linear on the 48k
 * Terminal substrate, replacing the Python rtree candidate query. Pure over the DB (node-witnessable).
 */

/*
 * §XEDGE-GEOWIRE (2026-09-18) — THE §REAL-AABB FIX ABOVE NEVER RAN IN PRODUCTION UNTIL NOW.
 * `str_walker_outliner.js` called `deriveAll(db)` with ONE argument, so `opts.geoDb` was always undefined,
 * `_buildRealVerts` resolved 0 elements, and EVERY element silently took the coarse fallback above. It was
 * not a missing argument: measured console order on a real open is §XEDGE-ALL -> §STRWALK-MO -> `geoDb
 * cache-MISS -> fetch` -> §GEO-SERVED, i.e. the derivation ran BEFORE the geometry was even requested. An
 * ORDERING bug, caused in effect by §GEO-SERVED (#1090) moving geometry into separate `*_geo.db` files.
 * Fixed by re-deriving in the geo-fetch continuation (`_reDeriveXEdgesWithGeo`). Measured, SampleCastle:
 *     before   0 resolved      abuts 10,612   G4  9,817 checked,  843 disagree (8.6%)
 *     after    1,924/3,225     abuts 13,841   G4 12,983 checked,   11 disagree (0.1%)
 * SampleHouse G4 went 2 -> 0. The +2,371 editable abuts edges are real adjacency the mis-placed coarse box
 * could not see. The residual 11 is HONESTLY LEFT RED in the witness — not relaxed to pass.
 * This file still has NO console output of its own; that is why the regression stayed invisible ~7 weeks.
 * The `§XEDGE-GEO` provenance line now lives at the call site, and W-XEDGE-REAL-AABB's G6 asserts on it.
 */

/*
 * §XEDGE-3AXIS (2026-09-24) — SPEC. THE RESIDUAL 11 IS THE rx/ry GUARD, 11 OF 11.
 * Measured on SampleCastle (origin/main bd9089b8, headless open, instrument control first: on the yaw-only
 * real path the derived box equals the live mesh box on 2,932/2,932 elements, max 0 mm):
 *   - every one of the 11 G4 pairs contains a GUARD element — has a real blob, but rotation_y = ±π/2 or π,
 *     so `_readBoxes` sent it to the coarse anchor-centred box — with a 35–394 mm face error;
 *   - 0 of the 11 involve an element with no resolvable blob. The "1,301 of 3,225 with no blob" suspect was a
 *     UNIT error: `buildGeometryIndex().resolved` is keyed by geometry HASH (1,924 distinct shared meshes),
 *     not by guid. All 3,225 guids resolve; only 65 element_transforms rows have no blob.
 *   - the guard covers the same 293 elements #1738 counted; 165 of them are off by more than 1 mm, worst 443 mm.
 * FIX: a tilted element with a real blob gets its box from the renderer's OWN placement function,
 * `Bonsai.library.place()` — its 3-axis branch is what draws the live mesh (world = center + q·rawVert, with
 * q from THREE.Euler(rotX, rotZ, -rotY), W-ARC-3AXIS witnessed). Not re-derived here ("never re-derive a
 * transform you can read"). When `place()` is absent (node, or bonsai_library.js not loaded) the guard stays:
 * coarse box, exactly today's behaviour. Resolved lazily at call time, same reason as _getRealGeometry().
 * Proof: W-XEDGE-REAL-AABB G4 on SampleCastle goes 11 -> 0; G7 asserts the tilted path actually FIRED.
 * Measured side effect, SampleCastle, same boxes feed every derived family: abuts 13,841 -> 14,124,
 * anchored 18,889 -> 18,880, spans 9,085 -> 9,102, datums 657 -> 643. The datum move bears on the OPEN
 * "802 -> 657" question (MODELLER_MASTER next-list #4) and is RECORDED, not claimed as a correction.
 */
(function (window) {
  'use strict';
  var TOL = 0.03, MIN_OVERLAP = 0.02;   // metres — identical to the Python defaults (W-SDG-ABUTS)

  // Soft dependency — real_geometry.js is a sibling "pure over the DB, dual-export" module (same design
  // philosophy as this file); absent (older page, load-order race, or a witness that doesn't need it) →
  // gracefully degrades to the coarse element_transforms bbox everywhere (unchanged prior behaviour).
  // Resolved LAZILY (at call time, inside _getRealGeometry() below), NOT at IIFE-load time: modeller.html's
  // <script> order loads this file BEFORE real_geometry.js, so a module-scope `var` capture here would see
  // `window.RealGeometry` still undefined and freeze that null forever (caught live: abuts stayed at the
  // OLD pre-fix count in the browser even though window.RealGeometry was present moments later).
  var _requiredRealGeometry;   // node-only cache of the require() result — window.RealGeometry itself is
                                // ALWAYS re-checked fresh (cheap property read, matches this codebase's own
                                // "check window.X fresh at call time" pattern elsewhere, e.g. STRWalkerOutliner).
  function _getRealGeometry() {
    if (typeof window !== 'undefined' && window.RealGeometry) return window.RealGeometry;
    if (_requiredRealGeometry !== undefined) return _requiredRealGeometry;
    _requiredRealGeometry = (typeof require === 'function') ? (function () { try { return require('./real_geometry.js'); } catch (e) { return null; } })() : null;
    return _requiredRealGeometry;
  }

  // §REAL-AABB — world AABB of a REAL vertex blob: rotate every raw vertex by yaw (rotation_z, radians)
  // about Z, translate by the placement anchor (center_xyz), envelope the result. Mirrors real_geometry.js's
  // own documented convention (world = center + R·rawVert) — NOT bonsai_library.js's recenter/anchorOffset
  // detour (that exists for RENDERING reasons over a symmetric-local-origin mesh; an AABB just needs the
  // raw vertices transformed directly, same final numbers, fewer steps).
  function _realAabb(positions, cx, cy, cz, rz) {
    var cs = Math.cos(rz), sn = Math.sin(rz);
    var mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity, mnz = Infinity, mxz = -Infinity;
    for (var i = 0; i < positions.length; i += 3) {
      var x = positions[i], y = positions[i + 1], z = positions[i + 2];
      var wx = cs * x - sn * y + cx, wy = sn * x + cs * y + cy, wz = z + cz;
      if (wx < mnx) mnx = wx; if (wx > mxx) mxx = wx;
      if (wy < mny) mny = wy; if (wy > mxy) mxy = wy;
      if (wz < mnz) mnz = wz; if (wz > mxz) mxz = wz;
    }
    return [mnx, mxx, mny, mxy, mnz, mxz];
  }

  // Build guid -> RAW vertex blob (un-recentred: recentred positions + anchorOffset added back per vertex —
  // see real_geometry.js's own `recenter()` for why positions/anchorOffset are split that way; this undoes
  // the split to get the blob real_geometry.js's own header says the world formula operates on directly).
  function _buildRealVerts(db, geoDb) {
    var RealGeometry = _getRealGeometry();
    if (!RealGeometry || !RealGeometry.buildGeometryIndex) return null;
    var idx;
    try { idx = RealGeometry.buildGeometryIndex(db, geoDb); } catch (e) { return null; }
    if (!idx || !idx.table) return null;
    var out = {};
    Object.keys(idx.byGuid).forEach(function (guid) {
      var hash = idx.byGuid[guid], rc = hash != null ? idx.resolved[hash] : null;
      if (!rc) return;
      var ao = rc.anchorOffset, p = rc.positions, raw = new Float32Array(p.length);
      for (var i = 0; i < p.length; i += 3) { raw[i] = p[i] + ao[0]; raw[i + 1] = p[i + 1] + ao[1]; raw[i + 2] = p[i + 2] + ao[2]; }
      out[guid] = raw;
    });
    return out;
  }

  // Is the AABB pair (a,b) a FACE-TOUCH? Returns {axis, gap_m, contact_m2} or null. Exact port of the
  // witnessed Python _face_touch — references NO IFC class. a,b = [minX,maxX,minY,maxY,minZ,maxZ].
  function faceTouch(a, b, tol, minOverlap) {
    var ov = [];                          // signed overlap per axis: >0 interpenetrate, =0 touch, <0 gap
    for (var k = 0; k < 3; k++) {
      var lo = Math.max(a[2 * k], b[2 * k]);
      var hi = Math.min(a[2 * k + 1], b[2 * k + 1]);
      ov.push(hi - lo);
    }
    // touch axis = the axis whose |overlap| is smallest (the back-to-back face)
    var axis = 0;
    for (var i = 1; i < 3; i++) if (Math.abs(ov[i]) < Math.abs(ov[axis])) axis = i;
    if (Math.abs(ov[axis]) > tol) return null;       // faces not within tol on closest axis → not adjacent
    var o0 = axis === 0 ? 1 : 0, o1 = axis === 2 ? 1 : 2;
    if (ov[o0] < minOverlap || ov[o1] < minOverlap) return null;   // corner/edge graze → not a face-touch
    return { axis: 'XYZ'[axis], gap_m: Math.abs(ov[axis]), contact_m2: ov[o0] * ov[o1] };
  }

  // Read the AABBs → [{guid, aabb}]. §REAL-AABB: prefer the TRUE world AABB from the real per-element
  // vertex blob (rotated by yaw + translated by center_xyz) when resolvable; fall back to the coarse
  // `element_transforms` bbox ± convention otherwise (today's original behaviour for that case, unchanged).
  function _readBoxes(db, geoDb) {
    var boxes = [];
    var realVerts = _buildRealVerts(db, geoDb);
    var place = _getPlace(), tiltedReal = 0;
    try {
      var r = db.exec("SELECT guid, center_x, center_y, center_z, bbox_x, bbox_y, bbox_z, rotation_x, rotation_y, rotation_z " +
                      "FROM element_transforms WHERE bbox_x IS NOT NULL");
      if (r.length) r[0].values.forEach(function (v) {
        var guid = v[0], cx = v[1], cy = v[2], cz = v[3], bx = v[4], by = v[5], bz = v[6];
        var rx = v[7], ry = v[8], rz = v[9];
        var raw = realVerts ? realVerts[guid] : null;
        var tilted = Math.abs(rx || 0) >= 1e-9 || Math.abs(ry || 0) >= 1e-9;
        var aabb = null;
        if (raw && !tilted) aabb = _realAabb(raw, cx, cy, cz, rz || 0);
        else if (raw && place) aabb = _envelope(place(raw, { x: cx, y: cy, z: cz, rotX: rx || 0, rotY: ry || 0, rotZRad: rz || 0 }));
        // §ROW7-TRUE-CENTRE: `real` says whether this box came from the element's own vertex blob (true) or
        // from the coarse anchor-centred fallback (false). Additive — no derive* consumer reads it; it lets
        // str_walker_bridge.js tell a true centre from an anchor and COUNT the fallbacks instead of hiding them.
        var real = !!aabb;
        if (!aabb) aabb = [cx - bx / 2, cx + bx / 2, cy - by / 2, cy + by / 2, cz - bz / 2, cz + bz / 2];
        else if (tilted) tiltedReal++;
        boxes.push({ guid: guid, aabb: aabb, real: real });
      });
    } catch (e) { /* no element_transforms / no bbox → no geometric edges (graceful) */ }
    _lastTiltedReal = tiltedReal;
    return boxes;
  }

  // §XEDGE-3AXIS — the renderer's own placement (bonsai_library.js place()), or null outside the browser.
  function _getPlace() {
    var L = (typeof window !== 'undefined' && window.Bonsai && window.Bonsai.library) || null;
    // place()'s 3-axis branch needs window.THREE; without it place() silently takes the yaw-only branch, which
    // would box a tilted element UNROTATED — worse than the guard. So no THREE, no place.
    return (L && typeof L.place === 'function' && window.THREE) ? L.place : null;
  }
  function _envelope(p) {
    var b = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    for (var i = 0; i < p.length; i += 3) for (var k = 0; k < 3; k++) {
      if (p[i + k] < b[2 * k]) b[2 * k] = p[i + k];
      if (p[i + k] > b[2 * k + 1]) b[2 * k + 1] = p[i + k];
    }
    return b;
  }
  var _lastTiltedReal = 0;   // how many tilted elements the LAST _readBoxes() boxed via place() — for §XEDGE-GEO

  // §ABUTS — derive the `abuts` edge set from MEASURED face-touch over the bbox substrate.
  // Returns sorted unique edges: {a, b (guids, a<b), axis, gap_mm, contact_m2, provenance}.
  function deriveAdjacency(db, opts) {
    opts = opts || {};
    var tol = opts.tol != null ? opts.tol : TOL, minOv = opts.minOverlap != null ? opts.minOverlap : MIN_OVERLAP;
    var boxes = _readBoxes(db, opts.geoDb);
    // sweep-and-prune on X: sort by minX, keep an active window of boxes whose maxX still reaches the cursor.
    boxes.sort(function (p, q) { return p.aabb[0] - q.aabb[0]; });
    var edges = [], active = [];
    for (var i = 0; i < boxes.length; i++) {
      var e = boxes[i], aMinX = e.aabb[0];
      // drop boxes that can no longer touch e on X (maxX < e.minX - tol)
      var keep = [];
      for (var j = 0; j < active.length; j++) if (active[j].aabb[1] >= aMinX - tol) keep.push(active[j]);
      active = keep;
      for (var k = 0; k < active.length; k++) {
        var o = active[k];
        if (o.guid === e.guid) continue;
        var ft = faceTouch(e.aabb, o.aabb, tol, minOv);
        if (!ft) continue;
        var lo = e.guid < o.guid ? e.guid : o.guid, hi = e.guid < o.guid ? o.guid : e.guid;
        edges.push({ a: lo, b: hi, axis: ft.axis,
          gap_mm: Math.round(ft.gap_m * 1000 * 1000) / 1000,
          contact_m2: Math.round(ft.contact_m2 * 1e6) / 1e6, provenance: 'derived:face-touch' });
      }
      active.push(e);
    }
    // de-dup unordered pairs (a box can re-meet a neighbour across the sweep only once here, but keep the guard)
    var seen = {}, uniq = [];
    for (var m = 0; m < edges.length; m++) {
      var key = edges[m].a + '|' + edges[m].b;
      if (seen[key]) continue;
      seen[key] = 1; uniq.push(edges[m]);
    }
    return uniq;
  }

  // ── §ANCHORED + §SPANS — the GRID cross-edges, JS-derived on-the-fly (user fork 2026-06-26 = JS-derive,
  //    not the baked tables). Faithful ports of extractIFCtoDB.derive_datums_and_anchors + derive_spans
  //    (W-SDG-ANCHORED / W-SDG-SPANS) over the SAME pristine AABBs (element_transforms center±bbox/2). A datum
  //    EMERGES where ≥min_support distinct element faces align within tol — never a recovered IfcGrid. These are
  //    element↔DATUM edges (not element↔element), so the adjacency lens reads them as per-element annotations.
  function _round(x, p) { var m = Math.pow(10, p); return Math.round(x * m) / m; }

  // Port of derive_datums_and_anchors(tol=0.05, min_support=3). Returns {datums, anchored}. datum_id is a
  // GLOBAL running counter in axis order X→Y→Z (matches the Python → datum ids line up with the baked table).
  function deriveDatumsAnchored(db, opts) {
    opts = opts || {};
    var tol = opts.tol != null ? opts.tol : 0.05, minSupport = opts.minSupport != null ? opts.minSupport : 3;
    var boxes = _readBoxes(db, opts.geoDb);
    var byGuid = {}; boxes.forEach(function (e) { byGuid[e.guid] = e.aabb; });
    var datums = [], anchored = [], datumId = 0;
    for (var ax = 0; ax < 3; ax++) {
      var cand = [];
      boxes.forEach(function (e) { cand.push([e.aabb[2 * ax], e.guid]); cand.push([e.aabb[2 * ax + 1], e.guid]); });
      // Sort by (coord, guid) — EXACTLY the Python tuple sort — so the cluster-mean float SUMMATION ORDER is
      // identical (float + is non-associative; on big clusters a coord-only sort drifts the mean a sub-micron,
      // flipping the 3rd-decimal mm offset). This makes anchored offsets bit-for-bit equal to the oracle.
      cand.sort(function (p, q) { return p[0] - q[0] || (p[1] < q[1] ? -1 : p[1] > q[1] ? 1 : 0); });
      var i = 0;
      while (i < cand.length) {
        var start = cand[i][0], j = i;
        while (j < cand.length && cand[j][0] - start <= tol) j++;
        var group = cand.slice(i, j); i = j;
        var gset = {}; group.forEach(function (c) { gset[c[1]] = 1; });
        var guids = Object.keys(gset);
        if (guids.length < minSupport) continue;
        var sum = 0; group.forEach(function (c) { sum += c[0]; });
        var coord = sum / group.length;
        datumId++;
        datums.push({ datum_id: datumId, axis: 'XYZ'[ax], coord: _round(coord, 6), support_count: guids.length, provenance: 'derived:cadence' });
        guids.forEach(function (g) {
          var b = byGuid[g], f0 = b[2 * ax] - coord, f1 = b[2 * ax + 1] - coord;
          var off = Math.abs(f1) < Math.abs(f0) ? f1 : f0;   // closest face → signed offset (ties keep min face)
          anchored.push({ element_guid: g, datum_id: datumId, axis: 'XYZ'[ax], offset_mm: _round(off * 1000, 3), provenance: 'derived:cadence-snap' });
        });
      }
    }
    return { datums: datums, anchored: anchored };
  }

  // Port of derive_spans(tol=0.05). Reuses the emerged datums. Returns [{element_guid,axis,datum_lo_id,
  // datum_hi_id,span_m}]. An element SPANS an axis when its min face is near one datum and its max face near a
  // DIFFERENT datum (both within tol). Nearest-datum picks the FIRST on a tie (matches Python min()).
  function deriveSpans(db, datums, opts) {
    opts = opts || {};
    var tol = opts.tol != null ? opts.tol : 0.05;
    var byAxis = { 0: [], 1: [], 2: [] };
    (datums || []).forEach(function (d) { byAxis['XYZ'.indexOf(d.axis)].push([d.datum_id, d.coord]); });
    function nearest(arr, face) { var best = null, bd = Infinity; for (var i = 0; i < arr.length; i++) { var dd = Math.abs(arr[i][1] - face); if (dd < bd) { bd = dd; best = arr[i]; } } return best; }
    var boxes = _readBoxes(db, opts.geoDb), spans = [];
    boxes.forEach(function (e) {
      var b = e.aabb;
      for (var ax = 0; ax < 3; ax++) {
        var arr = byAxis[ax]; if (!arr.length) continue;
        var loFace = b[2 * ax], hiFace = b[2 * ax + 1];
        var lo = nearest(arr, loFace), hi = nearest(arr, hiFace);
        if (!lo || !hi) continue;
        if (Math.abs(lo[1] - loFace) > tol || Math.abs(hi[1] - hiFace) > tol || lo[0] === hi[0]) continue;
        var dLo = lo, dHi = hi; if (lo[1] > hi[1]) { dLo = hi; dHi = lo; }
        spans.push({ element_guid: e.guid, axis: 'XYZ'[ax], datum_lo_id: dLo[0], datum_hi_id: dHi[0], span_m: _round(hiFace - loFace, 6), provenance: 'derived:bbox-spans-datums' });
      }
    });
    return spans;
  }

  // ── §FILLS-HOST + §AGGREGATES — RECOVERED IFC relationships (provenance ifc:recovered), NOT derivable from
  //    geometry → READ from the recovered rows the extractor wrote (Path B: IfcRelFillsElement; IfcRelAggregates).
  //    Emitted as element↔element edges {a,b} so the adjacency lens highlights them: a door↔its host wall, a
  //    child↔its aggregate parent. Absent tables → [] (graceful; e.g. a local .db with no recovered rels).
  function readFillsHost(db) {
    try {
      var r = db.exec("SELECT opening_guid, host_guid, filling_guid, host_class, filling_class FROM rel_fills_host");
      if (!r.length) return [];
      return r[0].values.map(function (v) {
        // lens edge = the FILLING (door/window, a real leaf) ↔ its HOST (wall); opening kept for provenance.
        return { a: v[2] || v[0], b: v[1], opening_guid: v[0], host_guid: v[1], filling_guid: v[2],
          host_class: v[3], filling_class: v[4], kind: 'fills', provenance: 'ifc:recovered' };
      }).filter(function (e) { return e.a != null && e.b != null; });
    } catch (e) { return []; }
  }
  function readAggregates(db) {
    try {
      var r = db.exec("SELECT parent_guid, child_guid FROM rel_aggregates");
      if (!r.length) return [];
      return r[0].values.map(function (v) { return { a: v[0], b: v[1], parent_guid: v[0], child_guid: v[1], kind: 'aggregates', provenance: 'ifc:recovered' }; });
    } catch (e) { return []; }
  }

  // Derive/read the FULL SDG edge set in one call (the modeller stashes this on window.swXEdges on Open).
  // Geometric edges (abuts/anchored/spans) are JS-derived; recovered relations (fills/aggregates) are read.
  function deriveAll(db, opts) {
    var da = deriveDatumsAnchored(db, opts);
    return {
      abuts: deriveAdjacency(db, opts),
      anchored: da.anchored, datums: da.datums,
      spans: deriveSpans(db, da.datums, opts),
      fills: readFillsHost(db),
      aggregates: readAggregates(db)
    };
  }

  var API = { deriveAdjacency: deriveAdjacency, faceTouch: faceTouch, TOL: TOL, MIN_OVERLAP: MIN_OVERLAP,
    deriveDatumsAnchored: deriveDatumsAnchored, deriveSpans: deriveSpans,
    readFillsHost: readFillsHost, readAggregates: readAggregates, deriveAll: deriveAll,
    // §ROW7-TRUE-CENTRE — the ONE box reader every derived family already uses, exported so the STR walker
    // bridge reads the same true world boxes instead of re-deriving a transform ("never re-derive a transform
    // you can read", MODELLER_MASTER §RESUME 2026-09-21). Returns [{ guid, aabb:[minX,maxX,minY,maxY,minZ,maxZ], real }].
    readBoxes: _readBoxes,
    lastTiltedReal: function () { return _lastTiltedReal; } };
  window.CrossEdges = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : this);
