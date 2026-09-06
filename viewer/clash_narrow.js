/**
 * BIM OOTB — clash_narrow.js — mesh-to-mesh clash narrow phase (broad AABB → OBB/SAT → triangle-exact)
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * Implementing bim-compiler prompts/CLASH_GATE_OBB_NARROWPHASE.md §MESH_NARROWPHASE — Witness:
 * viewer/tests/witness_clash_mesh_narrowphase.js (W-CLASH-MESH-NARROWPHASE).
 *
 * ISSUE IT PROVES OR DISPROVES: the clash list is bounding-box only (`_queryClashesPairRtree`,
 * measure.js). A pair whose stored AABBs overlap but whose real shapes never touch is reported as
 * a clash — and the film lane would bake that false positive into a permanent artefact. This module
 * ANNOTATES every broad-phase row (row[9]) with a triangle-exact verdict; it never removes or
 * reorders rows (8 files read c[0..8] by index).
 *
 * REPRESENTATION (§M.1, code-read not assumed): per-element local geometry = A.meshCache[hash]
 * (the same object a BatchedMesh slot was copied from and an InstancedMesh renders); BVH =
 * geo.boundsTree built by §BVH_DEFERRED (streaming.js:1761-1783) — REUSED, never rebuilt;
 * world matrix = compose(ifc2three(cx,cy,cz), Euler(rx, rz, -ry,'XYZ'), 1) (streaming.js:2224/2333).
 *
 * MEMORY CONTRACT (§M.0, CPE_4D_PERF_MEM_STUDY.md §R12): nothing here runs at load; a geometry that
 * is not in meshCache is fetched from the resident geo.db into a RUN-LOCAL map and released at run
 * end (lever-1 pattern). §CLASH_MEM reports heap before/peak/after + bvhReused/bvhBuiltNew/pinned.
 *
 * SEVERITY IS A PROXY: severityM = SAT depth of the two oriented LOCAL boxes, not true mesh
 * penetration (BENCHMARK_AND_CLASH_RESOLUTION_LANE.md §3 stays open).
 */
function setupClashNarrow(A) {
  'use strict';
  var OBB_EPS = 1e-6;          // Ericson RTCD §4.4.1 — near-parallel edge cross axes are skipped (conservative)
  // TOUCH POLICY (MEASURED, Hospital 2026-09-04, viewer/tests/probe_clash_pair_truth.js): a column standing on a
  // wall's underside has vertex boxes with a y-gap of exactly 0 (aabbOverlapM=-6.8e-8) and its 4 "intersecting"
  // triangle pairs are zero-length point contacts (closestDist=0); three-mesh-bvh's intersectsGeometry counts that
  // closed-set contact as a hit (and asymmetrically: A→B true, B→A false under float rounding). A clash requires
  // INTERPENETRATION; face-to-face contact is the normal state of a building. So: the OBB stage rejects when the
  // oriented boxes overlap by less than TOUCH_EPS on any axis, and the mesh stage needs at least one intersection
  // SEGMENT longer than TOUCH_EPS (else MESH_TOUCH_ONLY). 1 mm is below every clash_rules.json tolerance (25-75 mm).
  var TOUCH_EPS = 0.001;
  var TRI_PAIR_CAP = 4096;     // contact enumeration cap per pair; `truncated` flagged when hit
  var CHUNK = 64;              // rows per yield when async
  var VERDICT = { CLASH: 'CLASH', CLEAR: 'CLEAR', UNKNOWN: 'UNKNOWN' };
  var REASON = {
    OBB: 'OBB_SEPARATING_AXIS', TRI: 'MESH_TRIANGLES_INTERSECT', CONT: 'MESH_CONTAINED',
    NONE: 'MESH_NO_TRIANGLE_INTERSECTION', NOGEO: 'NO_GEOMETRY',
    TOUCH: 'MESH_TOUCH_ONLY',   // triangles meet only in contacts shorter than TOUCH_EPS (coplanar faces, point/edge touch)
    // scene.js composeGhostsFromAggregates (§NOGEO_COMPOSE): an IfcStair/IfcCurtainWall/IfcRoof parent with no
    // Representation gets a union-of-children bbox (transform_source='composed_aggregate') so it can be parked in
    // 4D — that box also enters the clash broad phase, but the parent has no triangles of its own; its children
    // are judged as their own rows. MEASURED Hospital 2026-09-04: 38,733 of 68,526 broad pairs (56.5 %).
    AGG: 'AGGREGATE_PARENT_NO_GEOMETRY'
  };
  var T = null;   // lazily-initialised THREE temporaries (THREE is a module global by the time any call happens)
  function tmp() {
    if (T) return T;
    T = { m4: new THREE.Matrix4(), m4b: new THREE.Matrix4(), rel: new THREE.Matrix4(), inv: new THREE.Matrix4(),
      e: new THREE.Euler(), q: new THREE.Quaternion(), p: new THREE.Vector3(), one: new THREE.Vector3(1, 1, 1),
      box: new THREE.Box3(), boxB: new THREE.Box3(), v: new THREE.Vector3(), ray: new THREE.Ray(),
      va: new THREE.Vector3(), vb: new THREE.Vector3() };
    return T;
  }
  function heapMB() {
    try { return performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : -1; } catch (e) { return -1; }
  }

  // ── §M.1 world matrix — byte-identical to streaming.js:2224-2229 / 2333-2338 ──
  function worldMatrix(t, out) {
    var X = tmp();
    var pos = A.ifc2three(t.cx, t.cy, t.cz);
    X.p.set(pos.x, pos.y, pos.z);
    X.e.set(t.rx || 0, t.rz || 0, -(t.ry || 0));
    X.q.setFromEuler(X.e);
    return (out || new THREE.Matrix4()).compose(X.p, X.q, X.one);
  }
  // LOCAL box straight from the position attribute — never the cached geo.boundingBox. MEASURED (Hospital,
  // 2026-09-04, §CMN_I3_DISAGREE): one IfcWall|IfcColumn pair was OBB-rejected (obbDepth=0, stored-AABB overlap
  // 0.614 m) while its triangles intersect — the cached box did not contain the triangles (same defect class
  // as §SDC's stale BatchedMesh spheres). The box is computed once per geometry per run (run-local Map) and the
  // cached one is compared against it: §CLASH_OBB_STALEBOX counts the disagreements instead of trusting them.
  var _boxRun = null;   // Map geometry → {box, stale, delta}; reset per qualifyRows run
  function localBox(geo) {
    if (!_boxRun) _boxRun = new Map();
    var e = _boxRun.get(geo);
    if (e) return e.box;
    var box = new THREE.Box3();
    var pos = geo.attributes && geo.attributes.position;
    if (pos) box.setFromBufferAttribute(pos); else if (geo.boundingBox) box.copy(geo.boundingBox);
    var stale = false, delta = 0;
    if (geo.boundingBox && pos) {
      var c = geo.boundingBox;
      delta = Math.max(Math.abs(c.min.x - box.min.x), Math.abs(c.min.y - box.min.y), Math.abs(c.min.z - box.min.z),
        Math.abs(c.max.x - box.max.x), Math.abs(c.max.y - box.max.y), Math.abs(c.max.z - box.max.z));
      stale = delta > 1e-4;
    }
    _boxRun.set(geo, { box: box, stale: stale, delta: delta });
    return box;
  }
  function boxStats() {
    var n = 0, stale = 0, maxD = 0;
    if (_boxRun) _boxRun.forEach(function (e) { n++; if (e.stale) { stale++; if (e.delta > maxD) maxD = e.delta; } });
    return { geometries: n, stale: stale, maxDeltaM: maxD };
  }
  // ── §M.2 stage 2 — OBB from the LOCAL mesh box placed by M (never bbox_x/y/z/2, §1-landmines) ──
  function obbOf(geo, M) {
    var X = tmp(), bb = localBox(geo), el = M.elements;
    X.v.set((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2).applyMatrix4(M);
    return {
      c: [X.v.x, X.v.y, X.v.z],
      h: [(bb.max.x - bb.min.x) / 2, (bb.max.y - bb.min.y) / 2, (bb.max.z - bb.min.z) / 2],
      axes: [[el[0], el[1], el[2]], [el[4], el[5], el[6]], [el[8], el[9], el[10]]]   // column-major basis, unit scale
    };
  }
  // OBB-OBB SAT, 15 axes — port of sdg_gate.js obbPenetration (origin/feat/clash-obb-narrowphase @1f54cd1a).
  // 0 ⇒ a separating axis exists (disjoint); else the minimum normalized overlap = MTV depth (m).
  function satDepth(a, b) {
    var d = [b.c[0] - a.c[0], b.c[1] - a.c[1], b.c[2] - a.c[2]];
    var best = Infinity;
    function axisOk(L) {
      var n2 = L[0] * L[0] + L[1] * L[1] + L[2] * L[2];
      if (n2 < OBB_EPS * OBB_EPS) return true;
      var ra = 0, rb = 0, k;
      for (k = 0; k < 3; k++) ra += a.h[k] * Math.abs(a.axes[k][0] * L[0] + a.axes[k][1] * L[1] + a.axes[k][2] * L[2]);
      for (k = 0; k < 3; k++) rb += b.h[k] * Math.abs(b.axes[k][0] * L[0] + b.axes[k][1] * L[1] + b.axes[k][2] * L[2]);
      var dist = Math.abs(d[0] * L[0] + d[1] * L[1] + d[2] * L[2]);
      var ov = (ra + rb - dist) / Math.sqrt(n2);
      if (ov < 0) return false;
      if (ov < best) best = ov;
      return true;
    }
    var i, j;
    for (i = 0; i < 3; i++) if (!axisOk(a.axes[i])) return 0;
    for (i = 0; i < 3; i++) if (!axisOk(b.axes[i])) return 0;
    for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) {
      var u = a.axes[i], w = b.axes[j];
      if (!axisOk([u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]])) return 0;
    }
    return best;
  }
  function aabbOverlap(geoA, MA, geoB, MB) {
    var X = tmp();
    X.box.copy(localBox(geoA)).applyMatrix4(MA);
    X.boxB.copy(localBox(geoB)).applyMatrix4(MB);
    var ox = Math.min(X.box.max.x, X.boxB.max.x) - Math.max(X.box.min.x, X.boxB.min.x);
    var oy = Math.min(X.box.max.y, X.boxB.max.y) - Math.max(X.box.min.y, X.boxB.min.y);
    var oz = Math.min(X.box.max.z, X.boxB.max.z) - Math.max(X.box.min.z, X.boxB.min.z);
    return { overlap: Math.min(ox, oy, oz), aInB: X.boxB.containsBox(X.box), bInA: X.box.containsBox(X.boxB) };
  }

  // ── §M.2 stage 3b — containment: 3 axis rays from the inner centroid in the outer's local frame ──
  function containedIn(btOuter, outerGeo, innerGeo, relInnerToOuter) {
    var X = tmp(), ib = localBox(innerGeo);
    var c = new THREE.Vector3((ib.min.x + ib.max.x) / 2, (ib.min.y + ib.max.y) / 2, (ib.min.z + ib.max.z) / 2).applyMatrix4(relInnerToOuter);
    if (!localBox(outerGeo).containsPoint(c)) return { contained: false, odd: 0 };
    var dirs = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], odd = 0;
    for (var i = 0; i < 3; i++) {
      X.ray.origin.copy(c); X.ray.direction.set(dirs[i][0], dirs[i][1], dirs[i][2]);
      var hits;
      try { hits = btOuter.raycast(X.ray, THREE.DoubleSide); } catch (e) { hits = []; }
      if (hits.length % 2 === 1) odd++;
    }
    return { contained: odd >= 2, odd: odd };
  }
  // ══ §MESH_OVERLAP_DEPTH (2026-09-06, bim-compiler MEP_CLASH_REVEAL_MOVIE.md §MESH_OVERLAP_DEPTH) ═══════
  // The overlap SOLID A∩B, bounded EXACTLY. For triangle meshes every extreme point of A∩B along any axis
  // is one of: an intersection-segment endpoint (enumerated below), a vertex of A inside B, or a vertex of
  // B inside A — a planar face piece or a straight edge piece has no interior extreme; its extremes sit on
  // its boundary, and that boundary is made of exactly those three kinds of point. So the AABB of that
  // point set, taken in A's frame and again in B's frame, is the exact box of the overlap solid in each
  // frame. depthMeshM = the THINNEST of the six extents: the penetration for a poke-in, the full cross
  // dimension for a pass-through, the inner element's thinnest side when contained.
  // It is NOT the MTV: severityM (SAT) is "how far to move to separate", which for a nested interval is
  // hA+hB−|d| (S2: 0.4 for a Ø0.2 pipe centred in a 0.6 m beam); the overlap solid there is 0.2 thick.
  // Both stay on the record; the label reads depthMeshM. The marker's size is NOT changed here.
  var VERT_CAP = 4096;   // inside-vertex candidates per side; past it the box is flagged inexact, never guessed
  function extNew() { return { mn: [Infinity, Infinity, Infinity], mx: [-Infinity, -Infinity, -Infinity], n: 0 }; }
  function extGrow(E, x, y, z) {
    if (x < E.mn[0]) E.mn[0] = x; if (y < E.mn[1]) E.mn[1] = y; if (z < E.mn[2]) E.mn[2] = z;
    if (x > E.mx[0]) E.mx[0] = x; if (y > E.mx[1]) E.mx[1] = y; if (z > E.mx[2]) E.mx[2] = z;
    E.n++;
  }
  function extSize(E) { return E.n ? [E.mx[0] - E.mn[0], E.mx[1] - E.mn[1], E.mx[2] - E.mn[2]] : null; }
  var _pdirs = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  // point-in-mesh by ray parity — the same 3-axis / odd>=2 rule containedIn uses
  function insideBvh(bt, p, X) {
    var odd = 0;
    for (var i = 0; i < 3; i++) {
      X.ray.origin.copy(p); X.ray.direction.set(_pdirs[i][0], _pdirs[i][1], _pdirs[i][2]);
      var hits; try { hits = bt.raycast(X.ray, THREE.DoubleSide); } catch (e) { hits = []; }
      if (hits.length % 2 === 1) odd++;
    }
    return odd >= 2;
  }
  // outward normal of face f of `geo`, from its own winding (into `out`)
  var _fa = new THREE.Vector3(), _fb = new THREE.Vector3(), _fc = new THREE.Vector3();
  function faceNormal(geo, f, out) {
    var pos = geo.attributes.position, ix = geo.index;
    var i0 = ix ? ix.getX(f * 3) : f * 3, i1 = ix ? ix.getX(f * 3 + 1) : f * 3 + 1, i2 = ix ? ix.getX(f * 3 + 2) : f * 3 + 2;
    _fa.fromBufferAttribute(pos, i0); _fb.fromBufferAttribute(pos, i1); _fc.fromBufferAttribute(pos, i2);
    return out.subVectors(_fb, _fa).cross(_fc.sub(_fa)).normalize();
  }
  // point strictly inside a mesh: ray parity (containedIn's rule) AND the nearest-surface test — the point sits
  // on the inner side of its closest face by at least half an eps. MEASURED Terminal 2026-09-06: parity alone
  // read wall vertices as "inside" an IfcColumn whose shells overlap (odd hits from a point outside), which
  // inflated the overlap box to the wall's full length; the nearest face's winding does not have that failure.
  var _cpTarget = {}, _cpN = new THREE.Vector3(), _cpD = new THREE.Vector3();
  function insideMesh(bt, geo, p, X) {
    if (!insideBvh(bt, p, X)) return false;
    var cp; try { cp = bt.closestPointToPoint(p, _cpTarget); } catch (e) { cp = null; }
    if (!cp || !(cp.distance >= TOUCH_EPS * 0.5)) return false;
    faceNormal(geo, cp.faceIndex, _cpN);
    return _cpD.subVectors(p, cp.point).dot(_cpN) < 0;
  }
  // vertices of `geo` (own frame) inside the OTHER mesh: prefiltered by the other's local box (a vertex inside
  // the other solid is inside its box), then insideMesh against the other's BVH. Grows Eself (own frame) and
  // Eother (other frame). toOther: own frame → other frame.
  function vertsInside(geo, otherGeo, otherBox, toOther, Eself, Eother, X) {
    var pos = geo.attributes && geo.attributes.position, btOther = otherGeo && otherGeo.boundsTree;
    var r = { n: 0, cand: 0, truncated: false };
    if (!pos || !btOther) return r;
    var v = X.va, w = X.vb;
    for (var i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); w.copy(v).applyMatrix4(toOther);
      if (!otherBox.containsPoint(w)) continue;
      if (++r.cand > VERT_CAP) { r.truncated = true; break; }
      if (!insideMesh(btOther, otherGeo, w, X)) continue;
      r.n++; extGrow(Eself, v.x, v.y, v.z); extGrow(Eother, w.x, w.y, w.z);
    }
    return r;
  }
  // the six extents → the record fields. EA in A's frame, EB in B's frame.
  function overlapFields(out, EA, EB, exact, pts, MA) {
    var a = extSize(EA), b = extSize(EB);
    if (!a || !b) return;
    var all = a.concat(b);
    out.depthMeshM = Math.min.apply(null, all);
    out.overlapMaxM = Math.max.apply(null, all);
    out.overlapA = a; out.overlapB = b; out.overlapExact = !!exact; out.overlapPts = pts;
    var c = new THREE.Vector3((EA.mn[0] + EA.mx[0]) / 2, (EA.mn[1] + EA.mx[1]) / 2, (EA.mn[2] + EA.mx[2]) / 2).applyMatrix4(MA);
    out.overlapCenter = { x: c.x, y: c.y, z: c.z };
  }

  // ── §M.2 stage 3d — contact/extent from the intersecting triangle PAIRS (one bvhcast, CLASH only) ──
  // The contact is the mean of the pair INTERSECTION SEGMENTS' midpoints and the extent is the bbox
  // diagonal of their endpoints — NOT triangle centroids: a 3 m cylinder side triangle has its centroid
  // 0.5 m from where it pierces a beam (S2 measured contact error 0 → extent 1.038 vs true 0.49).
  // ExtendedTriangle.intersectsTriangle(other, target, suppressLog) zeroes `target` for COPLANAR pairs
  // (three-mesh-bvh 0.8.0 ExtendedTriangle.js:293-303) — those are counted, not accumulated.
  // Returns { triPairs (every pair the library calls intersecting), penetrating (segments longer than TOUCH_EPS),
  //           touchPairs (coplanar or shorter than TOUCH_EPS), contact, extentM, truncated } — contact/extent from
  //           the PENETRATING segments only.
  //           §MESH_OVERLAP_DEPTH: EA/EB — the endpoints' extents in A's and (via relInv) B's frame, kept.
  function enumerateContact(btA, btB, rel, MA, relInv) {
    var n = 0, nSeg = 0, nTouch = 0, truncated = false, sx = 0, sy = 0, sz = 0;
    var EA = extNew(), EB = extNew(), wv = new THREE.Vector3();
    var mn = EA.mn, mx = EA.mx;
    var seg = new THREE.Line3();
    function grow(p) {
      extGrow(EA, p.x, p.y, p.z);
      if (relInv) { wv.copy(p).applyMatrix4(relInv); extGrow(EB, wv.x, wv.y, wv.z); }
    }
    try {
      btA.bvhcast(btB, rel, { intersectsTriangles: function (t1, t2) {
        var hit = false;
        seg.start.set(NaN, NaN, NaN); seg.end.set(NaN, NaN, NaN);
        try { hit = t1.intersectsTriangle(t2, seg, true); } catch (e) { hit = false; }
        if (!hit) return false;
        n++;
        var s = seg.start, e = seg.end;
        var coplanar = !isFinite(s.x) || (s.x === 0 && s.y === 0 && s.z === 0 && e.x === 0 && e.y === 0 && e.z === 0);
        if (coplanar || s.distanceTo(e) <= TOUCH_EPS) nTouch++;
        else { nSeg++; sx += (s.x + e.x) / 2; sy += (s.y + e.y) / 2; sz += (s.z + e.z) / 2; grow(s); grow(e); }
        if (n >= TRI_PAIR_CAP) { truncated = true; return true; }
        return false;
      } });
    } catch (e) { return { triPairs: n, penetrating: nSeg, touchPairs: nTouch, truncated: truncated, contact: null, extentM: 0, err: e.message, EA: EA, EB: EB }; }
    if (!nSeg) return { triPairs: n, penetrating: 0, touchPairs: nTouch, truncated: truncated, contact: null, extentM: 0, EA: EA, EB: EB };
    var c = new THREE.Vector3(sx / nSeg, sy / nSeg, sz / nSeg).applyMatrix4(MA);
    var ext = Math.sqrt((mx[0] - mn[0]) * (mx[0] - mn[0]) + (mx[1] - mn[1]) * (mx[1] - mn[1]) + (mx[2] - mn[2]) * (mx[2] - mn[2]));
    return { triPairs: n, penetrating: nSeg, touchPairs: nTouch, truncated: truncated, contact: { x: c.x, y: c.y, z: c.z }, extentM: ext, EA: EA, EB: EB };
  }
  function worldCentroid(geo, M) {
    var bb = localBox(geo);
    var c = new THREE.Vector3((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2).applyMatrix4(M);
    return { x: c.x, y: c.y, z: c.z };
  }
  function ensureBvh(geo, ctx) {
    if (geo.boundsTree) { ctx.bvhReused++; return true; }
    if (!window._bvhReady || !geo.computeBoundsTree) return false;
    try { geo.computeBoundsTree(); ctx.bvhBuiltNew++; return !!geo.boundsTree; } catch (e) { return false; }
  }

  // ── testPair: the ONE path both real pairs and the synthetic oracle go through ──
  // geoA/geoB local geometries, MA/MB world matrices. opts: {skipObb, aabbOverlapM, ctx}
  function testPair(geoA, MA, geoB, MB, opts) {
    opts = opts || {};
    var ctx = opts.ctx || { bvhReused: 0, bvhBuiltNew: 0 };
    var X = tmp(), t0 = performance.now();
    var out = { stage: 'BROAD', verdict: VERDICT.UNKNOWN, reason: REASON.NOGEO, aabbOverlapM: null, obbDepthM: null,
      severityM: null, triPairs: 0, truncated: false, contact: null, extentM: 0, containedOdd: 0, bvhReusedA: false, bvhReusedB: false, ms: 0,
      depthMeshM: null, overlapMaxM: null, overlapA: null, overlapB: null, overlapExact: false, overlapPts: null, overlapCenter: null, depthMs: 0, overlapFlat: false };
    if (!geoA || !geoB) { out.ms = performance.now() - t0; return out; }
    var ab = aabbOverlap(geoA, MA, geoB, MB);
    out.aabbOverlapM = (typeof opts.aabbOverlapM === 'number') ? opts.aabbOverlapM : ab.overlap;
    // stage 2 — OBB/SAT
    var oa = obbOf(geoA, MA), ob = obbOf(geoB, MB);
    var depth = satDepth(oa, ob);
    out.obbDepthM = depth;
    if (!opts.skipObb && depth < TOUCH_EPS) {   // separated, or overlapping by less than a modelling contact
      out.stage = 'OBB'; out.verdict = VERDICT.CLEAR; out.reason = REASON.OBB;
      out.ms = performance.now() - t0; return out;
    }
    // stage 3 — triangle-exact
    var ra = geoA.boundsTree ? true : false, rb = geoB.boundsTree ? true : false;
    if (!ensureBvh(geoA, ctx) || !ensureBvh(geoB, ctx)) { out.ms = performance.now() - t0; return out; }
    out.bvhReusedA = ra; out.bvhReusedB = rb;
    out.stage = 'MESH';
    X.inv.copy(MA).invert();
    X.rel.multiplyMatrices(X.inv, MB);                 // B local → A local
    var hit = false;
    try { hit = geoA.boundsTree.intersectsGeometry(geoB, X.rel); } catch (e) { out.reason = REASON.NOGEO; out.err = 'intersectsGeometry: ' + (e && e.message); out.ms = performance.now() - t0; return out; }
    var en = null;
    if (hit) {
      X.m4b.copy(X.rel).invert();                      // A local → B local
      en = enumerateContact(geoA.boundsTree, geoB.boundsTree, X.rel, MA, X.m4b);
      out.triPairs = en.triPairs; out.touchPairs = en.touchPairs || 0; out.truncated = en.truncated;
    }
    var flat = false;   // §OVERLAP_FLAT annotation (see below)
    if (hit && en.penetrating > 0) {
      // §MESH_OVERLAP_DEPTH — curve endpoints (both frames, already in EA/EB) + each side's inside vertices
      var tD = performance.now();
      var vA = vertsInside(geoA, geoB, localBox(geoB), X.m4b, en.EA, en.EB, X);
      var vB = vertsInside(geoB, geoA, localBox(geoA), X.rel, en.EB, en.EA, X);
      overlapFields(out, en.EA, en.EB, !en.truncated && !vA.truncated && !vB.truncated,
        { seg: en.penetrating * 2, vertsA: vA.n, vertsB: vB.n, candA: vA.cand, candB: vB.cand }, MA);
      out.depthMs = performance.now() - tD;
      // §OVERLAP_FLAT (2026-09-06) — ANNOTATION ONLY, the verdict below is unchanged from main. A column standing
      // on a slab, or two unit cubes face to face (S7b, RED on main), gives the library edge-length intersection
      // segments where a side face meets the other's face plane — long, so the "segment > TOUCH_EPS" rule calls
      // them CLASH. The overlap solid there is FLAT (thinnest extent ~1e-10 m): nothing interpenetrates.
      // MEASURED 2026-09-06: Terminal 745 of 3703 mesh-true pairs, Hospital 16 of 6733, are flat. Turning this
      // into the verdict (CLASH requires thickness >= TOUCH_EPS) is a ⛔USER call — MEP_CLASH_REVEAL_MOVIE.md
      // §MESH_OVERLAP_DEPTH MEASURED — because the witness oracle cannot yet judge multi-shell IFC geometry.
      flat = (typeof out.depthMeshM === 'number') && out.depthMeshM < TOUCH_EPS;
      out.overlapFlat = flat;
    }
    if (hit && en.penetrating > 0) {
      out.verdict = VERDICT.CLASH; out.reason = REASON.TRI; out.severityM = depth;
      out.contact = en.contact; out.extentM = en.extentM;
    } else {
      // no triangle intersection, or only touch contacts — a contained element still clashes
      var cont = null;
      if (ab.bInA) cont = containedIn(geoA.boundsTree, geoA, geoB, X.rel);
      else if (ab.aInB) { X.m4b.copy(MB).invert(); X.m4.multiplyMatrices(X.m4b, MA); cont = containedIn(geoB.boundsTree, geoB, geoA, X.m4); }
      if (cont && cont.contained) {
        out.verdict = VERDICT.CLASH; out.reason = REASON.CONT; out.severityM = depth; out.containedOdd = cont.odd;
        var inner = ab.bInA ? geoB : geoA, innerM = ab.bInA ? MB : MA;
        out.contact = worldCentroid(inner, innerM);
        var ib = localBox(inner); out.extentM = ib.min.distanceTo(ib.max);
        // §MESH_OVERLAP_DEPTH — the overlap solid IS the inner element: its box in its own frame, its
        // vertices' box in the outer frame (every vertex is inside by the verdict; no parity pass needed)
        var tD2 = performance.now();
        var Ein = extNew(), Eout = extNew(), posI = inner.attributes && inner.attributes.position;
        extGrow(Ein, ib.min.x, ib.min.y, ib.min.z); extGrow(Ein, ib.max.x, ib.max.y, ib.max.z);
        var toOuter = ab.bInA ? X.rel : X.m4;          // B→A when B is inner; A→B (X.m4 = MB⁻¹·MA) when A is inner
        if (posI) for (var vi = 0; vi < posI.count; vi++) { X.va.fromBufferAttribute(posI, vi).applyMatrix4(toOuter); extGrow(Eout, X.va.x, X.va.y, X.va.z); }
        overlapFields(out, ab.bInA ? Eout : Ein, ab.bInA ? Ein : Eout, !!posI,
          { seg: 0, vertsA: ab.bInA ? 0 : (posI ? posI.count : 0), vertsB: ab.bInA ? (posI ? posI.count : 0) : 0, candA: 0, candB: 0 }, MA);
        out.depthMs = performance.now() - tD2;
      } else {
        out.verdict = VERDICT.CLEAR; out.reason = hit ? REASON.TOUCH : REASON.NONE; if (cont) out.containedOdd = cont.odd;
      }
    }
    out.ms = performance.now() - t0;
    return out;
  }

  // ── geometry access (§M.1): meshCache first; else transient fetch from the resident geo.db ──
  function fetchMissing(hashes, ctx) {
    var need = hashes.filter(function (h) { return h && !A.meshCache[h] && !ctx.transient[h]; });
    if (!need.length) return Promise.resolve(0);
    var rdb = A._rangeDb, ldb = A.libDb;
    if (!rdb && !ldb) return Promise.resolve(0);
    var cols = A._libHasNormals ? 'geometry_hash, vertices, faces, normals' : 'geometry_hash, vertices, faces';
    var built = 0;
    function take(rows) {
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i], gh = r[0], v = r[1], f = r[2], n = A._libHasNormals ? (r[3] || null) : null;
        if (v && f && !ctx.transient[gh] && !A.meshCache[gh]) {
          var g = A.blobToGeometry(v, f, n);
          if (g) { ctx.transient[gh] = g; built++; }
        }
      }
    }
    var p = Promise.resolve();
    for (var ci = 0; ci < need.length; ci += 150) {
      (function (chunk) {
        p = p.then(function () {
          var ph = chunk.map(function (h) { return "'" + String(h).replace(/'/g, "''") + "'"; }).join(',');
          var q = Promise.resolve();
          ['component_geometries', 'base_geometries'].forEach(function (table) {
            q = q.then(function () {
              var sql = 'SELECT ' + cols + ' FROM ' + table + ' WHERE geometry_hash IN (' + ph + ')';
              if (rdb && A._useRangeStream) return rdb.exec(sql).then(function (res) { if (res && res.length) take(res[0].values); }).catch(function () {});
              try { var res = ldb.exec(sql); if (res && res.length) take(res[0].values); } catch (e) {}
            });
          });
          return q;
        });
      })(need.slice(ci, ci + 150));
    }
    return p.then(function () { ctx.geomPinnedPeak = Math.max(ctx.geomPinnedPeak, Object.keys(ctx.transient).length); return built; });
  }
  function releaseTransient(ctx) {
    var n = 0;
    Object.keys(ctx.transient).forEach(function (h) {
      var g = ctx.transient[h];
      try { if (g.boundsTree && g.disposeBoundsTree) g.disposeBoundsTree(); g.dispose(); } catch (e) {}
      n++;
    });
    ctx.transient = {};
    ctx.geomReleased += n;
    return n;
  }
  var _hasSourceCol = null;   // element_transforms.transform_source exists only after §NOGEO_COMPOSE's in-memory ALTER
  function loadTransforms(guids) {
    var map = {};
    if (_hasSourceCol === null) { try { A.db.exec('SELECT transform_source FROM element_transforms LIMIT 0'); _hasSourceCol = true; } catch (e) { _hasSourceCol = false; } }
    var srcCol = _hasSourceCol ? ', t.transform_source' : ", NULL";
    for (var i = 0; i < guids.length; i += 400) {
      var chunk = guids.slice(i, i + 400);
      var rows = A.dbQuery(
        'SELECT t.guid, t.center_x, t.center_y, t.center_z, t.rotation_x, t.rotation_y, t.rotation_z, i.geometry_hash' + srcCol +
        ' FROM element_transforms t LEFT JOIN element_instances i ON i.guid = t.guid' +
        ' WHERE t.guid IN (' + chunk.map(function () { return '?'; }).join(',') + ')', chunk);
      for (var r = 0; r < rows.length; r++) {
        var w = rows[r];
        if (map[w[0]] && map[w[0]].hash) continue;
        map[w[0]] = { cx: w[1], cy: w[2], cz: w[3], rx: w[4] || 0, ry: w[5] || 0, rz: w[6] || 0, hash: w[7] || null,
          composed: w[8] === 'composed_aggregate',
          rotated: Math.abs(w[4] || 0) > 1e-9 || Math.abs(w[5] || 0) > 1e-9 || Math.abs(w[6] || 0) > 1e-9 };
      }
    }
    return map;
  }
  function pairIdOf(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

  // ── qualifyRows: annotate broad-phase rows (row[9]) with the §M.3 verdict object ──
  // rows = _queryClashesPair* rows; opts = {label, sync, skipObb, onProgress}
  A.clashNarrow = A.clashNarrow || {};
  A.clashNarrow.testPair = testPair;
  A.clashNarrow.worldMatrix = worldMatrix;
  // §CLASH_FILM_P1 — clash_film.js places its markers with the SAME transform load + world matrix the
  // verdict was computed from, so a marker can never disagree with the judgement that produced it.
  A.clashNarrow.loadTransforms = loadTransforms;
  A.clashNarrow.satDepth = satDepth;
  A.clashNarrow.runs = [];
  // §CLASH_NARROW_CACHE (MEP_CLASH_REVEAL_MOVIE.md §PENDING.3) — cross-caller pair-verdict cache.
  // Lives for the page session (setupClashNarrow runs once at boot, not per building — GUIDs are
  // globally unique per IFC so no cross-building key collision is possible). A definitive verdict
  // (CLASH/CLEAR) for a guid pair does not change unless the model geometry itself is edited, which
  // this lane's read-only review flow never does — so the film's build and the interactive LIST
  // panel's own qualifyRows() call reuse one judgement instead of two full triangle-exact passes.
  // UNKNOWN verdicts (geometry not yet resident) are deliberately NOT cached — caching a transient
  // "geometry missing" result would silently freeze it wrong forever once the mesh does load.
  A.clashNarrow.pairCache = A.clashNarrow.pairCache || {};
  A.clashNarrow.qualifyRows = function (rows, opts) {
    opts = opts || {};
    var label = opts.label || 'pairs';
    var ctx = { bvhReused: 0, bvhBuiltNew: 0, transient: {}, geomPinnedPeak: 0, geomReleased: 0 };
    _boxRun = new Map();   // fresh local-box cache per run (geometry may change between runs)
    var t0 = performance.now();
    var mem = { heapBeforeMB: heapMB(), heapPeakMB: heapMB(), heapAfterMB: -1 };
    var counts = { broad: rows.length, obbSurvivors: 0, obbRejected: 0, rotatedSides: 0, meshTrue: 0, contained: 0, meshClear: 0, unknown: 0, truncated: 0, cacheHits: 0, cacheMisses: 0 };
    var pairs = new Array(rows.length);
    if (!rows.length) {
      var empty = { label: label, pairs: pairs, counts: counts, mem: mem, ms: 0, vacuous: true };
      console.log('§CLASH_NARROWPHASE pair=' + label + ' broad=0 VACUOUS — nothing judged');
      A.clashNarrow.lastRun = empty; A.clashNarrow.runs.push(empty);
      return Promise.resolve(empty);
    }
    var guidSet = {};
    rows.forEach(function (c) { guidSet[c[0]] = 1; guidSet[c[1]] = 1; });
    var guids = Object.keys(guidSet);
    var xf = loadTransforms(guids);
    var hashes = [];
    guids.forEach(function (g) { if (xf[g] && xf[g].hash) hashes.push(xf[g].hash); });
    function geoFor(hash) { return hash ? (A.meshCache[hash] || ctx.transient[hash] || null) : null; }
    var MA = new THREE.Matrix4(), MB = new THREE.Matrix4();
    function judge(i) {
      var c = rows[i];
      var cachedPairId = pairIdOf(c[0], c[1]);
      var cached = A.clashNarrow.pairCache[cachedPairId];
      if (cached) {
        counts.cacheHits++;
        // Mirrors the exact post-testPair classification below (lines ~524-530) — a cache hit must
        // land in the same counts bucket a fresh judge() of the same pair would.
        if (cached.stage === 'OBB') counts.obbRejected++;
        else {
          counts.obbSurvivors++;
          if (cached.verdict === VERDICT.CLASH) { counts.meshTrue++; if (cached.reason === REASON.CONT) counts.contained++; if (cached.truncated) counts.truncated++; if (cached.overlapFlat) counts.overlapFlat = (counts.overlapFlat || 0) + 1; }
          else { counts.meshClear++; if (cached.reason === REASON.TOUCH) counts.touchOnly = (counts.touchOnly || 0) + 1; }
        }
        c[9] = cached; pairs[i] = cached;
        return;
      }
      counts.cacheMisses++;
      var ta = xf[c[0]], tb = xf[c[1]];
      var rec = { pairId: cachedPairId, guidA: c[0], guidB: c[1], classA: c[2] || '', classB: c[3] || '',
        discA: c[4] || '', discB: c[5] || '', stage: 'BROAD', verdict: VERDICT.UNKNOWN, reason: REASON.NOGEO,
        aabbOverlapM: (typeof c[8] === 'number') ? c[8] : null, obbDepthM: null, severityM: null, triPairs: 0, truncated: false,
        contact: null, contactIfc: null, extentM: 0, bvhReusedA: false, bvhReusedB: false, ms: 0,
        depthMeshM: null, overlapMaxM: null, overlapA: null, overlapB: null, overlapExact: false, overlapPts: null, overlapCenter: null, depthMs: 0 };
      var geoA = ta ? geoFor(ta.hash) : null, geoB = tb ? geoFor(tb.hash) : null;
      if (!geoA || !geoB) {
        rec.err = 'geometry: A=' + (ta ? (ta.hash ? (geoA ? 'ok' : 'hash-not-in-cache') : (ta.composed ? 'composed-aggregate-parent' : 'no-hash')) : 'no-transform') +
          ' B=' + (tb ? (tb.hash ? (geoB ? 'ok' : 'hash-not-in-cache') : (tb.composed ? 'composed-aggregate-parent' : 'no-hash')) : 'no-transform');
        if ((ta && ta.composed && !ta.hash) || (tb && tb.composed && !tb.hash)) rec.reason = REASON.AGG;
      }
      if (geoA && geoB) {
        if (ta.rotated) counts.rotatedSides++;
        if (tb.rotated) counts.rotatedSides++;
        worldMatrix(ta, MA); worldMatrix(tb, MB);
        var v = testPair(geoA, MA, geoB, MB, { skipObb: !!opts.skipObb, aabbOverlapM: rec.aabbOverlapM, ctx: ctx });
        rec.stage = v.stage; rec.verdict = v.verdict; rec.reason = v.reason; rec.obbDepthM = v.obbDepthM; rec.severityM = v.severityM;
        rec.triPairs = v.triPairs; rec.touchPairs = v.touchPairs || 0; rec.truncated = v.truncated; rec.contact = v.contact; rec.extentM = v.extentM;
        rec.bvhReusedA = v.bvhReusedA; rec.bvhReusedB = v.bvhReusedB; rec.ms = v.ms; rec.containedOdd = v.containedOdd; if (v.err) rec.err = v.err;
        rec.depthMeshM = v.depthMeshM; rec.overlapMaxM = v.overlapMaxM; rec.overlapA = v.overlapA; rec.overlapB = v.overlapB;   // §MESH_OVERLAP_DEPTH
        rec.overlapExact = v.overlapExact; rec.overlapPts = v.overlapPts; rec.overlapCenter = v.overlapCenter; rec.depthMs = v.depthMs;
        rec.overlapFlat = !!v.overlapFlat;
        if (v.contact && A.three2ifc) { var q = A.three2ifc(v.contact.x, v.contact.y, v.contact.z); rec.contactIfc = { ix: q.ix, iy: q.iy, iz: q.iz }; }
      }
      if (rec.verdict === VERDICT.UNKNOWN) { counts.unknown++; if (rec.reason === REASON.AGG) counts.aggregateParent = (counts.aggregateParent || 0) + 1; var ek = rec.err || 'unknown'; counts.unknownBy = counts.unknownBy || {}; counts.unknownBy[ek] = (counts.unknownBy[ek] || 0) + 1; }
      else if (rec.stage === 'OBB') counts.obbRejected++;
      else {
        counts.obbSurvivors++;
        if (rec.verdict === VERDICT.CLASH) { counts.meshTrue++; if (rec.reason === REASON.CONT) counts.contained++; if (rec.truncated) counts.truncated++; if (rec.overlapFlat) counts.overlapFlat = (counts.overlapFlat || 0) + 1; }
        else { counts.meshClear++; if (rec.reason === REASON.TOUCH) counts.touchOnly = (counts.touchOnly || 0) + 1; }
      }
      // Only a DEFINITIVE verdict is cacheable — an UNKNOWN (geometry not resident yet) may resolve
      // differently once the mesh loads, so it must be re-tried, never frozen.
      if (rec.verdict !== VERDICT.UNKNOWN) A.clashNarrow.pairCache[cachedPairId] = rec;
      c[9] = rec; pairs[i] = rec;
    }
    function finish() {
      var judged = counts.broad - counts.unknown;
      var fpRate = judged ? ((counts.obbRejected + counts.meshClear) / judged * 100) : 0;
      var ms = performance.now() - t0;
      mem.heapPeakMB = Math.max(mem.heapPeakMB, heapMB());
      var released = releaseTransient(ctx);
      mem.heapAfterMB = heapMB();
      var res = { label: label, pairs: pairs, counts: counts, mem: { heapBeforeMB: mem.heapBeforeMB, heapPeakMB: mem.heapPeakMB, heapAfterMB: mem.heapAfterMB,
        bvhReusedEntries: ctx.bvhReused, bvhBuiltNew: ctx.bvhBuiltNew, geomPinnedPeak: ctx.geomPinnedPeak, geomReleased: released },
        falsePositiveRate: +fpRate.toFixed(2), ms: +ms.toFixed(1), msPerPair: judged ? +(ms / judged).toFixed(3) : null, vacuous: judged === 0 };
      console.log('§CLASH_NARROWPHASE pair=' + label + ' broad=' + counts.broad + ' obbSurvivors=' + counts.obbSurvivors +
        ' meshTrue=' + counts.meshTrue + ' contained=' + counts.contained + ' touchOnly=' + (counts.touchOnly || 0) + ' unknown=' + counts.unknown + ' aggregateParent=' + (counts.aggregateParent || 0) +
        ' falsePositiveRate=' + fpRate.toFixed(1) + '% ms=' + ms.toFixed(0) + ' msPerPair=' + (judged ? (ms / judged).toFixed(3) : 'n/a') +
        (judged === 0 ? ' VACUOUS' : ''));
      // §CLASH_NARROW_CACHE (MEP_CLASH_REVEAL_MOVIE.md §PENDING.3) — proves cross-caller reuse
      // actually happened this run, not just that the cache object exists (a populated-but-never-hit
      // cache would be a no-op wearing a feature's clothes).
      console.log('§CLASH_NARROW_CACHE pair=' + label + ' hits=' + counts.cacheHits + ' misses=' + counts.cacheMisses +
        ' cacheSize=' + Object.keys(A.clashNarrow.pairCache).length +
        (counts.cacheHits === 0 ? ' NO-OP(first run this session, or all-new pairs)' : ''));
      console.log('§CLASH_OBB pair=' + label + ' rotatedSides=' + counts.rotatedSides + ' rejected=' + counts.obbRejected + (counts.rotatedSides === 0 ? ' VACUOUS(rotation)' : ''));
      if (counts.unknown) console.log('§CLASH_NARROW_UNKNOWN pair=' + label + ' ' + JSON.stringify(counts.unknownBy));
      // §MESH_OVERLAP_DEPTH — how far the SAT proxy (severityM) sits from the mesh-true overlap, this run
      var dn = 0, dInexact = 0, dMsTot = 0, ratios = [], over1p5 = 0, under = 0, dZero = 0;
      for (var pi = 0; pi < pairs.length; pi++) {
        var pr = pairs[pi]; if (!pr) continue;
        dMsTot += pr.depthMs || 0;
        if (pr.verdict !== VERDICT.CLASH || typeof pr.depthMeshM !== 'number') continue;
        dn++; if (!pr.overlapExact) dInexact++; if (pr.depthMeshM < TOUCH_EPS) dZero++;
        if (pr.depthMeshM >= TOUCH_EPS && typeof pr.severityM === 'number') { var rr = pr.severityM / pr.depthMeshM; ratios.push(rr); if (rr >= 1.5) over1p5++; if (rr < 1 - 1e-6) under++; }
      }
      ratios.sort(function (a, b) { return a - b; });
      var med = ratios.length ? ratios[Math.floor(ratios.length / 2)] : null;
      res.depthProxy = { known: dn, inexact: dInexact, belowTouchEps: dZero, median: med, max: ratios.length ? ratios[ratios.length - 1] : null, satGe1p5x: over1p5, satBelow: under, ms: +dMsTot.toFixed(1) };
      console.log('§CLASH_DEPTH_PROXY pair=' + label + ' meshTrue=' + counts.meshTrue + ' overlapFlat=' + (counts.overlapFlat || 0) + ' depthKnown=' + dn + ' inexact=' + dInexact + ' belowTouchEps=' + dZero +
        ' satOverMesh median=' + (med == null ? 'n/a' : med.toFixed(2)) + ' max=' + (ratios.length ? ratios[ratios.length - 1].toFixed(2) : 'n/a') +
        ' satGe1p5xMesh=' + over1p5 + ' satBelowMesh=' + under + ' depthMs=' + dMsTot.toFixed(0) + (dn === 0 ? ' VACUOUS' : ''));
      var bs = boxStats(); res.boxStats = bs; _boxRun = null;
      console.log('§CLASH_OBB_STALEBOX pair=' + label + ' geometries=' + bs.geometries + ' cachedBoxStale=' + bs.stale + ' maxDeltaM=' + bs.maxDeltaM.toFixed(4) + ' (local box recomputed from positions; the cached geo.boundingBox is never trusted)');
      console.log('§CLASH_NARROW_LOSS pair=' + label + ' broad=' + counts.broad + ' accounted=' + (counts.obbRejected + counts.obbSurvivors + counts.unknown) +
        ' lost=' + (counts.broad - counts.obbRejected - counts.obbSurvivors - counts.unknown));
      console.log('§CLASH_MEM pair=' + label + ' heapBeforeMB=' + res.mem.heapBeforeMB + ' heapPeakMB=' + res.mem.heapPeakMB + ' heapAfterMB=' + res.mem.heapAfterMB +
        ' bvhReusedEntries=' + res.mem.bvhReusedEntries + ' bvhBuiltNew=' + res.mem.bvhBuiltNew + ' geomPinnedPeak=' + res.mem.geomPinnedPeak + ' geomReleased=' + res.mem.geomReleased);
      A.clashNarrow.lastRun = res; A.clashNarrow.runs.push(res);
      return res;
    }
    return fetchMissing(hashes, ctx).then(function () {
      if (opts.sync) { for (var i = 0; i < rows.length; i++) judge(i); return finish(); }
      return new Promise(function (resolve) {
        var i = 0;
        (function step() {
          var end = Math.min(rows.length, i + CHUNK);
          for (; i < end; i++) judge(i);
          mem.heapPeakMB = Math.max(mem.heapPeakMB, heapMB());
          if (opts.onProgress) { try { opts.onProgress(i, rows.length); } catch (e) {} }
          if (i < rows.length) setTimeout(step, 0); else resolve(finish());
        })();
      });
    });
  };

  // ── §M.4 I5 synthetic oracle — hand-known answers through the SAME testPair ──
  A.clashNarrow.selfTest = function () {
    var cases = [], pass = 0, fail = 0;
    function mk(geo) { geo.computeBoundingBox(); if (window._bvhReady && geo.computeBoundsTree) geo.computeBoundsTree(); return geo; }
    function mat(x, y, z, yawRad) { var m = new THREE.Matrix4(); var q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, yawRad || 0)); m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)); return m; }
    function check(name, expect, got, ok, detail) {
      var line = '§CLASH_NARROW_SELFTEST case=' + name + ' expect=' + expect + ' got=' + got + (detail ? ' ' + detail : '') + ' ' + (ok ? 'PASS' : 'FAIL');
      console.log(line); cases.push({ name: name, ok: ok, expect: expect, got: got, detail: detail || '' }); if (ok) pass++; else fail++;
    }
    var cube2 = mk(new THREE.BoxGeometry(2, 2, 2));      // half-extents 1 (this file's W1/W7 cubes)
    var cube2b = mk(new THREE.BoxGeometry(2, 2, 2));
    var I = mat(0, 0, 0, 0);
    // S1 — W1: AABB overlap 0.2142 m, OBBs disjoint ⇒ CLEAR at the OBB stage
    var s1 = testPair(cube2, I, cube2b, mat(2.2, 2.2, 0, Math.PI / 4));
    check('S1_rotated_aabb_fp', 'CLEAR@OBB aabb=0.2142', s1.verdict + '@' + s1.stage + ' aabb=' + s1.aabbOverlapM.toFixed(4),
      s1.verdict === 'CLEAR' && s1.stage === 'OBB' && Math.abs(s1.aabbOverlapM - 0.2142) < 1e-3);
    // S1' — same pair, OBB stage disabled ⇒ the mesh must agree (CLEAR at MESH)
    var s1b = testPair(cube2, I, cube2b, mat(2.2, 2.2, 0, Math.PI / 4), { skipObb: true });
    check('S1b_mesh_agrees', 'CLEAR@MESH', s1b.verdict + '@' + s1b.stage, s1b.verdict === 'CLEAR' && s1b.stage === 'MESH' && s1b.reason === REASON.NONE);
    // S2 — pipe through beam: r=0.1 cylinder along X crossing a 0.4×0.6×4 beam along Z ⇒ CLASH, contact inside the beam box
    var pipe = new THREE.CylinderGeometry(0.1, 0.1, 3, 24); pipe.rotateZ(Math.PI / 2); mk(pipe);
    var beam = mk(new THREE.BoxGeometry(0.4, 0.6, 4));
    var s2 = testPair(pipe, I, beam, I);
    var c2 = s2.contact || { x: 9, y: 9, z: 9 };
    var inBeam = Math.abs(c2.x) <= 0.2 + 1e-6 && Math.abs(c2.y) <= 0.3 + 1e-6 && Math.abs(c2.z) <= 2 + 1e-6;
    // hand-known: the pipe pierces the beam's two x=±0.2 faces along two r=0.1 rings ⇒ contact (0,0,0), endpoints bbox 0.4×0.2×0.2 ⇒ extent √0.24=0.490
    check('S2_pipe_through_beam', 'CLASH@MESH triPairs>=1 contact=(0,0,0)±0.02 extent=0.490±0.02', s2.verdict + '@' + s2.stage + ' tri=' + s2.triPairs + ' touch=' + (s2.touchPairs || 0) + ' contact=(' + c2.x.toFixed(3) + ',' + c2.y.toFixed(3) + ',' + c2.z.toFixed(3) + ') extent=' + s2.extentM.toFixed(3),
      s2.verdict === 'CLASH' && s2.reason === REASON.TRI && s2.triPairs >= 1 && inBeam && Math.hypot(c2.x, c2.y, c2.z) < 0.02 && Math.abs(s2.extentM - 0.4899) < 0.02);
    // S3 — unit cubes offset 0.9 on X ⇒ CLASH, SAT depth 0.1 (AABB = OBB = mesh), contact in the 0.1 m overlap slab
    var u1 = mk(new THREE.BoxGeometry(1, 1, 1)), u2 = mk(new THREE.BoxGeometry(1, 1, 1));
    var s3 = testPair(u1, I, u2, mat(0.9, 0, 0, 0));
    var c3 = s3.contact || { x: 9 };
    // hand-known: the only non-coplanar surface crossings are A's x=+0.5 face against B's y/z faces and B's x=+0.4 face against A's
    // y/z faces — every segment endpoint has x ∈ {0.4, 0.5} ⇒ contact.x = 0.45 ± 0.05 (the four y/z faces are COPLANAR pairs, counted, not accumulated)
    check('S3_axis_overlap_0p1', 'CLASH obbDepth=0.1 contact.x in [0.4,0.5]', s3.verdict + ' obbDepth=' + (s3.obbDepthM == null ? 'null' : s3.obbDepthM.toFixed(4)) + ' contact.x=' + c3.x.toFixed(3) + ' touch=' + (s3.touchPairs || 0),
      s3.verdict === 'CLASH' && Math.abs(s3.obbDepthM - 0.1) < 1e-6 && c3.x >= 0.4 - 1e-6 && c3.x <= 0.5 + 1e-6);
    // S7 — TOUCH POLICY (the measured Hospital column-on-wall case): unit cubes exactly face-to-face (offset 1.0)
    // ⇒ CLEAR at the OBB stage (overlap 0 < TOUCH_EPS); with the OBB stage off the mesh stage must ALSO say CLEAR
    // (MESH_TOUCH_ONLY — intersectsGeometry reports the contact, no segment is longer than 1 mm).
    var s7 = testPair(u1, I, u2, mat(1.0, 0, 0, 0));
    check('S7_touch_face_to_face', 'CLEAR@OBB', s7.verdict + '@' + s7.stage + ' obbDepth=' + (s7.obbDepthM == null ? 'null' : s7.obbDepthM.toFixed(6)), s7.verdict === 'CLEAR' && s7.stage === 'OBB');
    var s7b = testPair(u1, I, u2, mat(1.0, 0, 0, 0), { skipObb: true });
    check('S7b_touch_mesh_agrees', 'CLEAR@MESH reason=MESH_TOUCH_ONLY|MESH_NO_TRIANGLE_INTERSECTION', s7b.verdict + '@' + s7b.stage + ' reason=' + s7b.reason + ' tri=' + s7b.triPairs + ' touch=' + (s7b.touchPairs || 0),
      s7b.verdict === 'CLEAR' && s7b.stage === 'MESH' && (s7b.reason === REASON.TOUCH || s7b.reason === REASON.NONE));
    // S8 — 0.5 mm interpenetration (a modelling artefact, below TOUCH_EPS) ⇒ CLEAR; 5 mm ⇒ CLASH (obbDepth=0.005)
    var s8a = testPair(u1, I, u2, mat(0.9995, 0, 0, 0)), s8b = testPair(u1, I, u2, mat(0.995, 0, 0, 0));
    check('S8_touch_eps_boundary', '0.5mm→CLEAR, 5mm→CLASH obbDepth=0.005', '0.5mm→' + s8a.verdict + ', 5mm→' + s8b.verdict + ' obbDepth=' + (s8b.obbDepthM == null ? 'null' : s8b.obbDepthM.toFixed(4)),
      s8a.verdict === 'CLEAR' && s8b.verdict === 'CLASH' && Math.abs(s8b.obbDepthM - 0.005) < 1e-6);
    // S4 — 0.2 m cube fully inside a 2 m cube ⇒ no surface intersection, CLASH by containment
    var small = mk(new THREE.BoxGeometry(0.2, 0.2, 0.2));
    var s4 = testPair(cube2, I, small, mat(0.3, -0.2, 0.1, 0));
    check('S4_contained', 'CLASH reason=MESH_CONTAINED', s4.verdict + ' reason=' + s4.reason + ' odd=' + s4.containedOdd, s4.verdict === 'CLASH' && s4.reason === REASON.CONT);
    // S5 — W7: 45° cube at (1.5,1.5,0) ⇒ CLASH, SAT depth 0.2929 (AABB would claim 0.9142)
    var s5 = testPair(cube2, I, cube2b, mat(1.5, 1.5, 0, Math.PI / 4));
    check('S5_rotated_true_depth', 'CLASH obbDepth=0.2929 aabb=0.9142', s5.verdict + ' obbDepth=' + (s5.obbDepthM == null ? 'null' : s5.obbDepthM.toFixed(4)) + ' aabb=' + s5.aabbOverlapM.toFixed(4),
      s5.verdict === 'CLASH' && Math.abs(s5.obbDepthM - 0.29289) < 1e-4 && Math.abs(s5.aabbOverlapM - 0.9142) < 1e-3);
    // S6 — disjoint after a tiny gap on a rotated pair: cube vs 45° cube at (2.5,2.5,0), AABBs do NOT overlap ⇒ still CLEAR (sanity, not a FP case)
    var s6 = testPair(cube2, I, cube2b, mat(2.5, 2.5, 0, Math.PI / 4));
    check('S6_far_pair_clear', 'CLEAR', s6.verdict, s6.verdict === 'CLEAR');
    // ── §MESH_OVERLAP_DEPTH D-cases: hand-known overlap SOLIDS through the same testPair ──
    function fx(v) { return (typeof v === 'number') ? v.toFixed(4) : String(v); }
    function near(v, want, eps) { return typeof v === 'number' && Math.abs(v - want) < eps; }
    // D5 — §OVERLAP_FLAT: a 0.4×0.4×3 column standing EXACTLY on a 6×0.3×6 slab (bottom face on top face), OBB stage
    // off so the mesh stage judges it. The side faces cross the slab's top plane along the column's base edges —
    // 0.4 m segments, so the segment-length rule (unchanged, S7b) says CLASH — and the overlap solid is FLAT:
    // depthMesh < 1 mm, overlapFlat=true. The verdict is deliberately NOT changed here (⛔USER, see the comment above).
    var col = mk(new THREE.BoxGeometry(0.4, 3, 0.4)), slab = mk(new THREE.BoxGeometry(6, 0.3, 6));
    var d5 = testPair(col, mat(0, 1.5, 0, 0), slab, mat(0, -0.15, 0, 0), { skipObb: true });
    check('D5_column_on_slab_flat_overlap', 'overlapFlat=true depthMesh<0.001 max=0.4000 (verdict unchanged: ' + d5.verdict + ')', 'overlapFlat=' + !!d5.overlapFlat + ' depthMesh=' + fx(d5.depthMeshM) + ' max=' + fx(d5.overlapMaxM) + ' verdict=' + d5.verdict + '@' + d5.stage + ' tri=' + d5.triPairs,
      d5.overlapFlat === true && typeof d5.depthMeshM === 'number' && d5.depthMeshM < 0.001 && near(d5.overlapMaxM, 0.4, 1e-4));
    // D6 — the same column sunk 20 mm into the slab ⇒ CLASH, depthMesh=0.020 (SAT agrees here), max=0.4
    var d6 = testPair(col, mat(0, 1.48, 0, 0), slab, mat(0, -0.15, 0, 0), { skipObb: true });
    check('D6_column_sunk_20mm', 'CLASH depthMesh=0.0200 max=0.4000', d6.verdict + ' depthMesh=' + fx(d6.depthMeshM) + ' max=' + fx(d6.overlapMaxM) + ' sat=' + fx(d6.severityM) + ' exact=' + d6.overlapExact,
      d6.verdict === 'CLASH' && near(d6.depthMeshM, 0.02, 1e-4) && near(d6.overlapMaxM, 0.4, 1e-4) && d6.overlapExact === true);
    // D1 — poke-in: unit cubes offset 0.97 ⇒ overlap solid 0.03×1×1 ⇒ depthMesh=0.030 max=1.000 (SAT agrees: 0.03)
    var d1 = testPair(u1, I, u2, mat(0.97, 0, 0, 0));
    check('D1_pokein_depth', 'CLASH depthMesh=0.0300 max=1.0000 exact', d1.verdict + ' depthMesh=' + fx(d1.depthMeshM) + ' max=' + fx(d1.overlapMaxM) + ' sat=' + fx(d1.severityM) + ' exact=' + d1.overlapExact + ' pts=' + JSON.stringify(d1.overlapPts),
      d1.verdict === 'CLASH' && near(d1.depthMeshM, 0.03, 1e-4) && near(d1.overlapMaxM, 1.0, 1e-4) && d1.overlapExact === true);
    // D2 — pass-through (S2's pipe/beam): the overlap solid is the Ø0.2 pipe section inside the 0.4-wide beam ⇒
    // 0.4×0.2×0.2 ⇒ depthMesh=0.2 max=0.4, while SAT says 0.4 (0.1+0.3−0 on y: the MTV of a nested interval) —
    // the proxy overstates a pass-through 2×. No vertex of either mesh lies inside the other (rings at x=±1.5).
    check('D2_passthrough_depth_vs_sat', 'depthMesh=0.2000 max=0.4000 sat=0.4000 vertsA=vertsB=0', 'depthMesh=' + fx(s2.depthMeshM) + ' max=' + fx(s2.overlapMaxM) + ' sat=' + fx(s2.severityM) + ' exact=' + s2.overlapExact + ' pts=' + JSON.stringify(s2.overlapPts),
      near(s2.depthMeshM, 0.2, 2e-3) && near(s2.overlapMaxM, 0.4, 2e-3) && near(s2.severityM, 0.4, 1e-6) && s2.overlapExact === true && s2.overlapPts && s2.overlapPts.vertsA === 0 && s2.overlapPts.vertsB === 0);
    // D3 — contained (S4's 0.2 cube in the 2 m cube): the overlap solid is the inner cube ⇒ 0.2 on every axis, from the inner element alone
    check('D3_contained_depth', 'depthMesh=0.2000 max=0.2000 exact', 'depthMesh=' + fx(s4.depthMeshM) + ' max=' + fx(s4.overlapMaxM) + ' sat=' + fx(s4.severityM) + ' exact=' + s4.overlapExact + ' pts=' + JSON.stringify(s4.overlapPts),
      near(s4.depthMeshM, 0.2, 1e-6) && near(s4.overlapMaxM, 0.2, 1e-6) && s4.overlapExact === true);
    // D4 — rotated (S5, the 45° cube's edge x+y=1.586 cuts A's corner): overlap = the triangle (1,1),(0.586,1),(1,0.586) × z∈[−1,1].
    // A frame: 0.414×0.414×2; B frame: 0.293×0.586×2 ⇒ depthMesh=0.2929 (= SAT here, convex) max=2.0. A's corner edge
    // vertices (1,1,±1) lie ON B's top/bottom faces — boundary points, excluded by insideMesh's half-eps margin by
    // design (a flush vertex must never inflate the box); the curve endpoints already carry those extremes.
    check('D4_rotated_corner_depth', 'depthMesh=0.2929 max=2.0000 exact', 'depthMesh=' + fx(s5.depthMeshM) + ' max=' + fx(s5.overlapMaxM) + ' sat=' + fx(s5.severityM) + ' exact=' + s5.overlapExact + ' pts=' + JSON.stringify(s5.overlapPts),
      near(s5.depthMeshM, 0.29289, 1e-3) && near(s5.overlapMaxM, 2.0, 1e-3) && s5.overlapExact === true);
    [cube2, cube2b, pipe, beam, u1, u2, small, col, slab].forEach(function (g) { try { if (g.boundsTree && g.disposeBoundsTree) g.disposeBoundsTree(); g.dispose(); } catch (e) {} });
    console.log('§CLASH_NARROW_SELFTEST summary pass=' + pass + ' fail=' + fail + ' bvhReady=' + !!window._bvhReady);
    return { pass: pass, fail: fail, cases: cases };
  };

  console.log('§CLASH_NARROW_INIT wired (no allocation until qualifyRows) triPairCap=' + TRI_PAIR_CAP + ' obbEps=' + OBB_EPS + ' vertCap=' + VERT_CAP + ' (§MESH_OVERLAP_DEPTH on)');
}
