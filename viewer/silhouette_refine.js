// ═══════════════════════════════════════════════════════════════════════════════════════════════
// §DUCT_SILHOUETTE — a curved element's OUTLINE, not its shading.
// Implementing PHOTOREAL_STILL_RENDER.md §DUCT_SILHOUETTE — Witness: W-DUCT-SIL
//
// USER (2026-09-02): "The roundness to jagged curves seems to work on lamps but certain large duct
// piping seems lacking. Is the formula easy? Detecting an element to possess curved surface but
// having jagged and thus candidate to apply."
//
// WHY §MEP_SMOOTH_NORMALS CANNOT FIX THIS. That pass (streaming.js) rewrites NORMALS at a 55 deg
// crease. It changes SHADING. A faceted cylinder shades smoothly but its SILHOUETTE is still an
// N-gon, because the silhouette IS the geometry. streaming.js says so in its own words:
// "IfcFlowSegment is 10.3 over 26 triangles: a genuine 10-sided prism, so its SHADING improves
// here but its silhouette cannot". Widening creaseDeg addresses shading, which is not the defect,
// and would round genuine hard edges — so it is explicitly NOT the remedy here.
//
// THE FORMULA (this is the answer to "is the formula easy?" — yes, and it is two lines).
// For any edge shared by two faces whose dihedral theta is small enough that the shipped smoothing
// pass welds across it — i.e. the two facets are MEANT to read as one curved surface — the local
// radius of curvature is recovered EXACTLY, with no cylinder fit, no axis fit and no class list:
//
//     project both faces perpendicular to the shared edge; the edge collapses to a point E and the
//     two opposite vertices give A and B; E, A, B all lie on the swept cross-section, so
//         R  = |EA| * |AB| * |BE| / (4 * area(EAB))            [circumradius of three points]
//         s  = R * (1 - cos(theta/2))                           [chord deviation, metres]
//         D_1px = s * k,   k = (H/2)/tan(fov/2) = 935.3 px/rad at 1080p, fov 60 (scene.js:139)
//
// s is the "jaggedness": how far the flat facet sags inside the ideal arc. D_1px is the distance
// out to which that sag still covers a whole screen pixel. VALIDATED, not asserted: on Hospital
// the estimator lands on R = 525.0 mm and 550.0 mm — real 1050/1100 mm manufacturing duct sizes —
// and its segment count agrees exactly (11 vs 11) with an independent PCA ring fit.
//
// THAT ONE NUMBER IS THE WHOLE LAMP-vs-DUCT SPLIT THE USER DESCRIBED, and it is ~50x wide:
//   Hospital IfcLightFixture  — falls out of the offender list entirely at every gate tried
//   Hospital IfcDuctSegment   — mean s = 4.17 mm, worst s = 22.3 mm  =>  D_1px = 20.8 m
// A lamp's facet step is sub-pixel past arm's length. A 1100 mm duct's is a whole pixel at TWENTY
// METRES. Same tessellation quality (N ~ 11-13 on both); only the radius differs, and the error is
// linear in radius. Detection was never the problem — size was.
//
// THE REMEDY. The silhouette is the geometry, so it cannot be fixed without geometry (the
// alternatives are priced and rejected in the spec: anti-aliasing softens the edge pixel but
// leaves the same N-gon; radially rescaling a duct onto the mid-radius halves the error but MOVES
// REAL GEOMETRY on a model that carries clash/measure/QTO, which is falsification; WebGL2 has no
// tessellation shader; re-extracting at a finer chord tolerance re-tessellates the whole fleet
// instead of the measured tail, costing MORE memory, not less).
// So: ONE level of uniform Phong (PN-triangle) subdivision, applied ONLY to the elements the
// formula above says are visibly jagged. theta halves, so the residual sag drops ~4x.
//
// THE SHAPE FACTOR IS DERIVED, NOT TUNED. Placing a split-edge midpoint at the plain linear
// midpoint leaves the sag untouched; projecting it fully onto the corner tangent planes OVERSHOOTS
// (a 12-gon goes from -3.4% inside to +3.1% outside — no gain). The damped Phong midpoint
//     m' = m - (alpha/2) * [ ((m-p_i).n_i) n_i + ((m-p_j).n_j) n_j ]
// is exact on a cylinder when alpha = (sec(theta/2) - 1) / sin^2(theta/2), whose limit as
// theta -> 0 is EXACTLY 1/2 (sec x - 1 ~ x^2/2, sin^2 x ~ x^2). Over the whole range that matters
// it barely moves: 0.527 at N=12, 0.539 at N=10, 0.619 at N=6. So ALPHA = 0.5 is the second-order-
// exact value, not a knob someone turned until it looked right.
//
// SAFETY, BY CONSTRUCTION — the user's standing constraint on the sibling pass was "it must not
// impact non curve intending surfaces", and it is met here without a class list:
//   * a new vertex on a HARD edge is the PLAIN midpoint, never projected. The midpoint of a
//     straight edge lies ON that edge, so a planar facet subdivided this way occupies exactly the
//     same plane, the same outline and the same area. Deviation is not "small", it is ZERO, and
//     W-DUCT-SIL asserts exactly that.
//   * midpoint POSITIONS are computed once per welded edge and shared by both neighbouring faces,
//     so refinement can never open a crack.
//   * refinement is UNIFORM 1-to-4 over the whole element, so no refined/unrefined frontier exists
//     and a T-junction is impossible by construction rather than by argument. The cheaper
//     curved-shell-plus-green-closure variant was built first and MEASURED WRONG — see the note at
//     the emit loop; real IFC meshes carry edges shared by 3+ faces that green closure cannot fix.
//   * the per-face vertex split of the source data is PRESERVED — each triangle emits its own
//     copies. Nothing is welded, nothing is renumbered beyond appending, so picking, per-element
//     hide, the BVH and §TRIPLANAR's vTriWorldNormal all still see the layout they expect.
//
// NO PER-BUILDING ANYTHING (user, 2026-09-02: "4D generation has to be independent of any type of
// building. No custom code to any particular building has been our rule."). Every threshold below
// is either a camera constant read off the shipped renderer, a derived limit, or a property the
// element measures about ITSELF. There is no building name, no IFC class list, and no material
// name anywhere in this file — a round column, a curved railing, a dome and a duct are all judged
// by the same two lines of arithmetic.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
(function(global) {
  'use strict';

  // ── constants ────────────────────────────────────────────────────────────────────────────────
  // Deliberately THE SAME edge classification as §MEP_SMOOTH_NORMALS. An edge this file refines
  // across is exactly an edge that pass already decided is one continuous curved surface. Keeping
  // them identical is what makes "shading and silhouette agree" true by construction; forking the
  // threshold here would let the two passes disagree about what a crease is.
  var SIL_CREASE_DEG = 55;      // above it: a genuine hard edge, kept hard (streaming.js CREASE_DEG)
  var SIL_THETA_MIN_DEG = 2;    // below it: the two triangles are the SAME planar facet (a quad diagonal)

  // A tessellated curve has MANY facets at a consistent step. Fewer than this and the "curvature"
  // is float noise between two nearly-coplanar triangles, which fits an arbitrarily large
  // circumradius. MEASURED: without this guard a flat IfcWallStandardCase reported a 4,290.9 mm
  // bulge. 6 = the fewest facets that can describe a closed convex loop with a distinguishable step.
  var SIL_MIN_SMOOTH_EDGES = 6;

  // A facet's sag cannot be a large fraction of the whole object. Physical impossibility, not a
  // tuned threshold — it is the second guard against the same degenerate-circumradius failure.
  var SIL_MAX_S_FRAC_OF_DIAG = 0.25;

  // Pixels per radian for the SHIPPED camera: fov 60 (viewer/scene.js:139) at 1080p.
  // k = (H/2) / tan(fov/2). Read off the renderer, not chosen.
  var SIL_K_PX_PER_RAD = (1080 / 2) / Math.tan(30 * Math.PI / 180);   // 935.307...

  // THE GATE. An element is refined when its own measured facet step still covers a whole 1080p
  // pixel at SIL_GATE_M metres. This is a property of the element (its radius and its facet
  // count), never of the building it happens to sit in.
  // 5 m is where the measured cost curve turns: on Hospital it takes the 1,419 geometries that
  // carry essentially all of the visible faceting (the 1050/1100 mm ducts at D_1px = 20.8 m, the
  // footings at 11.4 m, the curved beams/railings/coverings) for +17.5 MB of geometry, where
  // dropping the gate to 2 m adds 2,170 more geometries — mostly small pipe fittings nobody can
  // see faceting on — and costs +43.9 MB against a heap §R12_HOSPITAL_MEM already measures at
  // ~1,577 MB. Full table in PHOTOREAL_STILL_RENDER.md §DUCT_SILHOUETTE.
  var SIL_GATE_M = 5;

  // Second-order-exact Phong shape factor. Derived above; see the header. NOT a tuning knob.
  var SIL_ALPHA = 0.5;

  // Hard ceiling on total added vertices across the whole session, so a pathological model can
  // never silently balloon the heap. Hit => the pass reports it and stops refining, it does not
  // half-refine an element. 4M verts ~= 122 MB at 32 B/vert, well above every measured building.
  var SIL_MAX_ADDED_VERTS = 4000000;

  var _stats = { considered: 0, measured: 0, refined: 0, skippedTooSmall: 0, skippedNotCurved: 0,
                 addedVerts: 0, addedTris: 0, budgetHit: false, sBefore: 0, sAfter: 0, sWeight: 0,
                 hardMidpoints: 0, smoothMidpoints: 0, ms: 0 };

  function _resetStats() {
    _stats = { considered: 0, measured: 0, refined: 0, skippedTooSmall: 0, skippedNotCurved: 0,
               addedVerts: 0, addedTris: 0, budgetHit: false, sBefore: 0, sAfter: 0, sWeight: 0,
               hardMidpoints: 0, smoothMidpoints: 0, ms: 0 };
  }

  // ── topology ─────────────────────────────────────────────────────────────────────────────────
  // Weld by quantised position (0.1 mm) — byte-for-byte the same key the shipped
  // §MEP_SMOOTH_NORMALS accumulator uses, so both passes agree on what "the same vertex" means.
  function _weld(pos, nV) {
    var wid = new Int32Array(nV), map = new Map(), n = 0, i, k, id;
    var rep = [];    // canonical position per welded id — the FIRST copy seen, never an average
    for (i = 0; i < nV; i++) {
      k = Math.round(pos[3 * i] * 1e4) + '|' + Math.round(pos[3 * i + 1] * 1e4) + '|' +
          Math.round(pos[3 * i + 2] * 1e4);
      id = map.get(k);
      if (id === undefined) { id = n++; map.set(k, id); rep.push(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); }
      wid[i] = id;
    }
    return { wid: wid, count: n, rep: rep };
  }

  function _faceData(pos, idx, nT) {
    var fn = new Float64Array(nT * 3), fa = new Float64Array(nT), t, a, b, c, L;
    for (t = 0; t < nT; t++) {
      a = idx[3 * t]; b = idx[3 * t + 1]; c = idx[3 * t + 2];
      var ax = pos[3 * a], ay = pos[3 * a + 1], az = pos[3 * a + 2];
      var ux = pos[3 * b] - ax, uy = pos[3 * b + 1] - ay, uz = pos[3 * b + 2] - az;
      var vx = pos[3 * c] - ax, vy = pos[3 * c + 1] - ay, vz = pos[3 * c + 2] - az;
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      L = Math.sqrt(nx * nx + ny * ny + nz * nz);
      fa[t] = L / 2;
      if (L > 1e-14) { nx /= L; ny /= L; nz /= L; }
      fn[3 * t] = nx; fn[3 * t + 1] = ny; fn[3 * t + 2] = nz;
    }
    return { fn: fn, fa: fa };
  }

  // edge key from two welded ids — a single number, not a string (the same reason
  // §MEP_SMOOTH_PERF replaced its string key: this runs over every triangle of every element).
  function _ekey(a, b) { return a < b ? a * 4194304 + b : b * 4194304 + a; }

  /**
   * MEASURE ONLY — never mutates. Returns the numbers the gate is made of, or null when the
   * geometry carries no tessellated curve at all.
   * @returns {{sMedian, thetaMedianDeg, R, D1px, smoothEdges, hardEdges, N}|null}
   */
  function silMeasure(pos, idx) {
    var nV = pos.length / 3, nT = (idx.length / 3) | 0;
    if (nT < 4 || nV < 3) return null;

    var bx0 = Infinity, by0 = Infinity, bz0 = Infinity, bx1 = -Infinity, by1 = -Infinity, bz1 = -Infinity, i;
    for (i = 0; i < nV; i++) {
      var x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
      if (y < by0) by0 = y; if (y > by1) by1 = y;
      if (z < bz0) bz0 = z; if (z > bz1) bz1 = z;
    }
    var diag = Math.sqrt((bx1 - bx0) * (bx1 - bx0) + (by1 - by0) * (by1 - by0) + (bz1 - bz0) * (bz1 - bz0));
    var sMax = SIL_MAX_S_FRAC_OF_DIAG * diag;

    var w = _weld(pos, nV), wid = w.wid;
    var fd = _faceData(pos, idx, nT), fn = fd.fn, fa = fd.fa;

    var em = new Map(), t, e, k, arr;
    for (t = 0; t < nT; t++) {
      for (e = 0; e < 3; e++) {
        k = _ekey(wid[idx[3 * t + e]], wid[idx[3 * t + (e + 1) % 3]]);
        arr = em.get(k);
        if (!arr) { arr = []; em.set(k, arr); }
        arr.push(t * 4 + e);
      }
    }

    var cosCrease = Math.cos(SIL_CREASE_DEG * Math.PI / 180);
    var cosThMin = Math.cos(SIL_THETA_MIN_DEG * Math.PI / 180);
    var samples = [], hardEdges = 0, smoothEdges = 0;

    em.forEach(function(a) {
      if (a.length !== 2) return;
      var t1 = a[0] >> 2, e1 = a[0] & 3, t2 = a[1] >> 2;
      var d = fn[3 * t1] * fn[3 * t2] + fn[3 * t1 + 1] * fn[3 * t2 + 1] + fn[3 * t1 + 2] * fn[3 * t2 + 2];
      if (d > 1) d = 1; else if (d < -1) d = -1;
      if (d < cosCrease) { hardEdges++; return; }   // genuine crease — kept hard, never refined across
      if (d > cosThMin) return;                     // same planar facet (a quad's diagonal)
      smoothEdges++;
      var th = Math.acos(d);

      var P = idx[3 * t1 + e1], Q = idx[3 * t1 + (e1 + 1) % 3];
      var wp = wid[P], wq = wid[Q], j, v, r1 = -1, r2 = -1;
      for (j = 0; j < 3; j++) { v = idx[3 * t1 + j]; if (wid[v] !== wp && wid[v] !== wq) { r1 = v; break; } }
      for (j = 0; j < 3; j++) { v = idx[3 * t2 + j]; if (wid[v] !== wp && wid[v] !== wq) { r2 = v; break; } }
      if (r1 < 0 || r2 < 0) return;

      var ex = pos[3 * Q] - pos[3 * P], ey = pos[3 * Q + 1] - pos[3 * P + 1], ez = pos[3 * Q + 2] - pos[3 * P + 2];
      var eL = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (!(eL > 1e-9)) return;
      ex /= eL; ey /= eL; ez /= eL;

      function proj(vi) {
        var px = pos[3 * vi] - pos[3 * P], py = pos[3 * vi + 1] - pos[3 * P + 1], pz = pos[3 * vi + 2] - pos[3 * P + 2];
        var dp = px * ex + py * ey + pz * ez;
        return [px - dp * ex, py - dp * ey, pz - dp * ez];
      }
      var A = proj(r1), B = proj(r2);
      var ab = Math.sqrt((A[0] - B[0]) * (A[0] - B[0]) + (A[1] - B[1]) * (A[1] - B[1]) + (A[2] - B[2]) * (A[2] - B[2]));
      var ae = Math.sqrt(A[0] * A[0] + A[1] * A[1] + A[2] * A[2]);
      var be = Math.sqrt(B[0] * B[0] + B[1] * B[1] + B[2] * B[2]);
      var cx = A[1] * B[2] - A[2] * B[1], cy = A[2] * B[0] - A[0] * B[2], cz = A[0] * B[1] - A[1] * B[0];
      var ar = Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
      if (!(ar > 1e-13)) return;
      var R = (ab * ae * be) / (4 * ar);
      if (!(R > 1e-5) || !isFinite(R)) return;
      var s = R * (1 - Math.cos(th / 2));
      if (!(s <= sMax)) return;                     // degenerate fit — physically impossible sag
      samples.push({ th: th, R: R, s: s, w: fa[t1] + fa[t2] });
    });

    if (samples.length < SIL_MIN_SMOOTH_EDGES) return null;

    // area-weighted medians — robust to the handful of odd facets every real mesh carries
    function wmed(key) {
      var a = samples.slice().sort(function(p, q) { return p[key] - q[key]; });
      var tot = 0, j;
      for (j = 0; j < a.length; j++) tot += a[j].w;
      var acc = 0;
      for (j = 0; j < a.length; j++) { acc += a[j].w; if (acc >= tot / 2) return a[j][key]; }
      return a[a.length - 1][key];
    }
    var thM = wmed('th'), sM = wmed('s'), RM = wmed('R');
    return { sMedian: sM, thetaMedianDeg: thM * 180 / Math.PI, R: RM,
             D1px: sM * SIL_K_PX_PER_RAD, smoothEdges: smoothEdges, hardEdges: hardEdges,
             N: 360 / (thM * 180 / Math.PI), samples: samples.length };
  }

  /**
   * REFINE. Returns new {position, index, normal, stats} or null when the geometry does not
   * qualify (which is a NO-OP, and is reported as one — never as a pass).
   */
  function silRefine(pos, idx, nor, opts) {
    opts = opts || {};
    var gate = opts.gateM != null ? opts.gateM : SIL_GATE_M;
    _stats.considered++;

    var m = silMeasure(pos, idx);
    if (!m) { _stats.skippedNotCurved++; return null; }
    _stats.measured++;
    if (!(m.D1px >= gate)) { _stats.skippedTooSmall++; return null; }

    var nV = pos.length / 3, nT = (idx.length / 3) | 0;
    var w = _weld(pos, nV), wid = w.wid, nW = w.count;
    var fd = _faceData(pos, idx, nT), fn = fd.fn, fa = fd.fa;

    // ── welded, crease-limited smoothed normals: the surface the Phong projection curves toward.
    // Same area-weighted accumulation and same crease rejection as §MEP_SMOOTH_NORMALS, so the
    // silhouette this pass builds and the shading that pass writes describe ONE surface.
    var acc = new Float64Array(nW * 3), t, j, v;
    for (t = 0; t < nT; t++) {
      for (j = 0; j < 3; j++) {
        v = wid[idx[3 * t + j]];
        acc[3 * v] += fn[3 * t] * fa[t] * 2;
        acc[3 * v + 1] += fn[3 * t + 1] * fa[t] * 2;
        acc[3 * v + 2] += fn[3 * t + 2] * fa[t] * 2;
      }
    }
    var wn = new Float64Array(nW * 3);
    for (v = 0; v < nW; v++) {
      var L = Math.sqrt(acc[3 * v] * acc[3 * v] + acc[3 * v + 1] * acc[3 * v + 1] + acc[3 * v + 2] * acc[3 * v + 2]);
      if (L > 1e-12) { wn[3 * v] = acc[3 * v] / L; wn[3 * v + 1] = acc[3 * v + 1] / L; wn[3 * v + 2] = acc[3 * v + 2] / L; }
    }

    // ── edge classification
    var em = new Map(), e, k, arr;
    for (t = 0; t < nT; t++) {
      for (e = 0; e < 3; e++) {
        k = _ekey(wid[idx[3 * t + e]], wid[idx[3 * t + (e + 1) % 3]]);
        arr = em.get(k);
        if (!arr) { arr = []; em.set(k, arr); }
        arr.push(t * 4 + e);
      }
    }
    var cosCrease = Math.cos(SIL_CREASE_DEG * Math.PI / 180);
    var cosThMin = Math.cos(SIL_THETA_MIN_DEG * Math.PI / 180);
    var smooth = new Set();               // welded-edge keys the two facets curve across
    em.forEach(function(a, key) {
      if (a.length !== 2) return;
      var t1 = a[0] >> 2, t2 = a[1] >> 2;
      var d = fn[3 * t1] * fn[3 * t2] + fn[3 * t1 + 1] * fn[3 * t2 + 1] + fn[3 * t1 + 2] * fn[3 * t2 + 2];
      if (d > 1) d = 1; else if (d < -1) d = -1;
      if (d < cosCrease || d > cosThMin) return;
      smooth.add(key);
    });
    if (!smooth.size) { _stats.skippedNotCurved++; return null; }

    // ── UNIFORM 1-to-4: every triangle, every edge. This is the crack-proof choice and it was
    // arrived at by MEASUREMENT, not preference. The first build of this pass refined only the
    // curved shell (triangles touching a smooth edge) and closed the resulting T-junctions with
    // green 1-to-2 / 1-to-3 splits on the immediate neighbours — cheaper, and it looked correct on
    // paper. W-DUCT-SIL measured it on real Hospital geometry and it was NOT correct: non-manifold
    // edges went 24 -> 211 on one element and a direct point-on-edge scan found 875 open
    // T-junctions, because a real IFC mesh is not the clean two-manifold that argument assumes —
    // it carries edges shared by 3+ faces, and a refined/unrefined frontier through one of those
    // cannot be closed by a green split.
    //
    // Refining every edge removes the frontier itself, so there is nothing left to close: every
    // edge is split at ONE shared midpoint, every triangle becomes exactly 4, an edge with k
    // incident faces becomes two sub-edges with k faces each. Manifoldness, boundary structure and
    // winding are all preserved by construction rather than by argument. The price is measured and
    // paid for in the spec: 4x triangles on the qualifying elements instead of ~2.6x.
    //
    // Flat regions are still free of any geometric change, because a midpoint on a HARD edge is
    // never projected — see midOf below.
    var addTris = 3 * nT;
    if (_stats.addedVerts + addTris * 3 > SIL_MAX_ADDED_VERTS) {
      _stats.budgetHit = true;
      return null;
    }

    // ── midpoint POSITIONS, computed once per welded edge and shared by both neighbours.
    // Shared => bit-identical from either side => a crack is impossible.
    // Smooth edge: damped Phong projection (curves outward onto the implied arc).
    // Hard edge:   the plain midpoint, which lies ON the straight edge, so the facet is unmoved.
    // CANONICAL endpoints. The midpoint is built from the WELDED REPRESENTATIVE positions, never
    // from whichever per-face copy the triangle loop happened to reach first. Copies that weld
    // together can still differ by up to the 0.1 mm quantum, so using them would make the midpoint
    // depend on triangle visit order — non-deterministic, and it made W-DUCT-SIL's independently
    // derived hard-edge midpoint miss the emitted one on 7 of 37 real elements.
    var rep = w.rep;
    var midPos = new Map();
    function midOf(wa, wb) {
      var key = _ekey(wa, wb);
      var got = midPos.get(key);
      if (got) return got;
      var ax = rep[3 * wa], ay = rep[3 * wa + 1], az = rep[3 * wa + 2];
      var bx = rep[3 * wb], by = rep[3 * wb + 1], bz = rep[3 * wb + 2];
      var mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
      if (smooth.has(key)) {
        // m' = m - (alpha/2) * [ ((m-p_i).n_i) n_i + ((m-p_j).n_j) n_j ]
        var na = wa * 3, nb = wb * 3;
        var da = (mx - ax) * wn[na] + (my - ay) * wn[na + 1] + (mz - az) * wn[na + 2];
        var db = (mx - bx) * wn[nb] + (my - by) * wn[nb + 1] + (mz - bz) * wn[nb + 2];
        var h = SIL_ALPHA / 2;
        mx -= h * (da * wn[na] + db * wn[nb]);
        my -= h * (da * wn[na + 1] + db * wn[nb + 1]);
        mz -= h * (da * wn[na + 2] + db * wn[nb + 2]);
        _stats.smoothMidpoints++;
      } else {
        _stats.hardMidpoints++;
      }
      got = [mx, my, mz];
      midPos.set(key, got);
      return got;
    }

    // ── emit. Each triangle appends its OWN copies of the vertices it uses, so the per-face vertex
    // split of the source data is preserved exactly and nothing upstream is renumbered.
    var outT = nT + addTris;
    var oPos = new Float32Array(outT * 9);
    var oNor = new Float32Array(outT * 9);
    var oIdx = outT * 3 < 65536 ? new Uint16Array(outT * 3) : new Uint32Array(outT * 3);
    var vp = 0, ip = 0;

    function push(p, n) {
      oPos[3 * vp] = p[0]; oPos[3 * vp + 1] = p[1]; oPos[3 * vp + 2] = p[2];
      var L2 = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1;
      oNor[3 * vp] = n[0] / L2; oNor[3 * vp + 1] = n[1] / L2; oNor[3 * vp + 2] = n[2] / L2;
      oIdx[ip++] = vp; vp++;
    }
    function P(i) { return [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]; }
    function N(i) { return nor ? [nor[3 * i], nor[3 * i + 1], nor[3 * i + 2]] : [0, 1, 0]; }
    function avgN(i, j) { var a = N(i), b = N(j); return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
    function tri(pa, na, pb, nb, pc, nc) { push(pa, na); push(pb, nb); push(pc, nc); }

    for (t = 0; t < nT; t++) {
      var i0 = idx[3 * t], i1 = idx[3 * t + 1], i2 = idx[3 * t + 2];
      var w0 = wid[i0], w1 = wid[i1], w2 = wid[i2];
      var p0 = P(i0), p1 = P(i1), p2 = P(i2), n0 = N(i0), n1 = N(i1), n2 = N(i2);

      var m01 = midOf(w0, w1);
      var m12 = midOf(w1, w2);
      var m20 = midOf(w2, w0);
      var q01 = avgN(i0, i1), q12 = avgN(i1, i2), q20 = avgN(i2, i0);

      // standard 1-to-4, winding preserved on all four children
      tri(p0, n0, m01, q01, m20, q20);
      tri(m01, q01, p1, n1, m12, q12);
      tri(m20, q20, m12, q12, p2, n2);
      tri(m01, q01, m12, q12, m20, q20);
    }

    _stats.refined++;
    _stats.addedVerts += (outT - nT) * 3;
    _stats.addedTris += addTris;
    // silhouette quality, area-weighted so a big element counts for more than a small one:
    // one level halves theta, so the residual sag is R*(1-cos(theta/4)).
    var thR = m.thetaMedianDeg * Math.PI / 180;
    _stats.sBefore += m.sMedian;
    _stats.sAfter += m.R * (1 - Math.cos(thR / 4));
    _stats.sWeight++;

    return { position: oPos, index: oIdx, normal: oNor, measure: m,
             triBefore: nT, triAfter: outT };
  }

  // ── three.js wrapper (browser only) ──────────────────────────────────────────────────────────
  function refineGeometry(geo, THREE, opts) {
    if (!geo || !geo.index || !geo.attributes || !geo.attributes.position) return false;
    var pos = geo.attributes.position.array;
    var nor = geo.attributes.normal ? geo.attributes.normal.array : null;
    var idx = geo.index.array;
    var r;
    try { r = silRefine(pos, idx, nor, opts); } catch (e) { return false; }
    if (!r) return false;
    geo.setAttribute('position', new THREE.BufferAttribute(r.position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(r.normal, 3));
    geo.setIndex(new THREE.BufferAttribute(r.index, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return true;
  }

  function report(log) {
    var s = _stats;
    // §CLAUDE.md PRIMAL LAW clause 4 — a pass that cannot report its own failure is not a witness.
    // NO-OP and VACUOUS are printed as themselves; neither is ever dressed up as a pass.
    var verdict = s.considered === 0 ? '  VACUOUS — no geometry was judged'
                : s.measured === 0 ? '  VACUOUS — nothing carried a tessellated curve to judge'
                : s.refined === 0 ? '  NO-OP — every curved element was already sub-pixel at the gate'
                : '';
    var line = '§DUCT_SILHOUETTE considered=' + s.considered + ' measured=' + s.measured +
      ' refined=' + s.refined + ' skippedTooSmall=' + s.skippedTooSmall +
      ' skippedNotCurved=' + s.skippedNotCurved +
      ' addedVerts=' + s.addedVerts + ' addedTris=' + s.addedTris +
      ' smoothMid=' + s.smoothMidpoints + ' hardMid=' + s.hardMidpoints +
      ' gateM=' + SIL_GATE_M + ' alpha=' + SIL_ALPHA + ' kPxPerRad=' + SIL_K_PX_PER_RAD.toFixed(1) +
      (s.sWeight ? ' meanSagittaMm=' + (s.sBefore / s.sWeight * 1000).toFixed(3) +
                   '->' + (s.sAfter / s.sWeight * 1000).toFixed(3) +
                   ' (' + (s.sBefore / Math.max(1e-12, s.sAfter)).toFixed(2) + 'x)' : '') +
      (s.budgetHit ? ' BUDGET_HIT maxAddedVerts=' + SIL_MAX_ADDED_VERTS : '') +
      verdict;
    if (log !== false) console.log(line);
    return line;
  }

  var API = {
    silMeasure: silMeasure,
    silRefine: silRefine,
    refineGeometry: refineGeometry,
    report: report,
    resetStats: _resetStats,
    stats: function() { return _stats; },
    K: SIL_K_PX_PER_RAD,
    GATE_M: SIL_GATE_M,
    ALPHA: SIL_ALPHA,
    CREASE_DEG: SIL_CREASE_DEG,
    MIN_SMOOTH_EDGES: SIL_MIN_SMOOTH_EDGES
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (global) { global.SilhouetteRefine = API; if (global.APP) global.APP.silhouette = API; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
