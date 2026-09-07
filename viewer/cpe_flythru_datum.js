/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * cpe_flythru_datum.js — THE OPENING SETTING-OUT ENCLOSURE: a ground grid plus ONE upright grid
 * carrying the storey levels. Up from second 0.
 * Implementing prompts/MEP_CLASH_REVEAL_MOVIE.md §17 + §22.5. Witness: W-FLYTHRU-DATUM.
 *
 * USER (2026-09-07): "0 sec the ground grid and a upright grid has to be up (storey markings in the
 * grid!)" and, on the second vertical plane: "we actually only need either X or Y and planes but not
 * both as the extra seems redundant measure" — the ground carries length and breadth, ONE upright
 * carries height, a second upright only repeats height. So: ground + one upright. Never two.
 *
 * ── WHAT THE LINES ARE, AND WHY THEY ARE NOT A MADE-UP MODULE ────────────────────────────────────
 * GROUND: real structural gridlines, clustered from IfcColumn/IfcPile centres with a minimum
 * separation. MEASURED 2026-09-07 — Hospital 604 columns -> 15 x 14 lines, median bay 6.44 m; HHS 257
 * -> 9 x 8, median 6.5-7.2 m. Both coherent. ⚠ This BEATS the shipped GridDims on Hospital, whose
 * opportunity-vote returns an incoherent 1417 | 99155 | 1611 | ... mm ladder (spec §18).
 * UPRIGHT: horizontal rules at REAL STOREY LEVELS, so every line means a floor.
 * ⚠ Hospital stores 23 storey rows including 'Level 1 Ceiling' and 'Level 2 TOS' — pseudo-levels that
 * are NOT floors. They are folded out here (-> ~8) or the elevation grows lines where no floor is.
 * ⚠ Schema differs by building: Hospital has spatial_structure.elevation, HHS has only center_z.
 * Both paths are handled; a building with neither draws no storey lines and SAYS so.
 *
 * ── DEPTH: THIS LAYER INVERTS THE CUE CONTRACT, AND THAT INVERSION IS THE EFFECT ─────────────────
 * Measurement cues draw depthTest:false so they shine through. THE DATUM MUST DEPTH-TEST NORMALLY and
 * be occluded by the building (§17.5): as the model rises it progressively hides its own setting-out
 * grid, which is what tells the viewer the grid is BEHIND the building and not painted on the lens.
 * A later "consistency fix" that makes this shine through would destroy the reading.
 */
function setupCpeFlythruDatum(A) {
  if (!A) return;
  // ONE INK for the whole datum, 3D lines included (spec §24.1.2). The storey rules used to be
  // YELLOW against grey ground lines — hierarchy signalled by hue. They are the same ink now,
  // separated by weight: the rules read stronger because they are fewer, not because they differ.
  var INK = 0x8899aa, INK_STOREY = 0xb9c6d6, MIN_SEP = 6.0;
  var _grp = null, _built = false, _info = null, _faces = null, _lines = null;

  function q(sql) { try { return A.dbQuery(sql) || []; } catch (e) { return []; } }

  // Gridlines = column centres, thinned to a minimum separation. One pass, no rules DB, no votes.
  function linesFrom(vals, minSep) {
    vals = vals.slice().sort(function (a, b) { return a - b; });
    var out = [];
    for (var i = 0; i < vals.length; i++) if (!out.length || vals[i] - out[out.length - 1] > minSep) out.push(vals[i]);
    return out;
  }

  // Real floors only. 'Level 2 Ceiling' / 'Level 3 TOS' are not floors.
  function storeyLevels() {
    var rows = q("SELECT name, elevation FROM spatial_structure WHERE type='IfcBuildingStorey' AND elevation IS NOT NULL ORDER BY elevation");
    var src = 'elevation';
    if (!rows.length) { rows = q("SELECT name, center_z FROM spatial_structure WHERE type='IfcBuildingStorey' AND center_z IS NOT NULL ORDER BY center_z"); src = 'center_z'; }
    // ⚠ MERGE NEAR-DUPLICATES, THEN VOTE — first-seen was printing the odd row out. Hospital
    // records 'Level 2' at BOTH 6.00 and 6.10 (one floor, 100 mm apart) so exact dedupe drew a
    // doubled rule; but keeping the FIRST row of a merged cluster is just as wrong. MEASURED
    // 2026-09-07 on Hospital: 3 of 8 printed elevations were the single outlier of their cluster
    // (Level 3 +10.973 over 6 rows at 11.000; Level 4 +15.850 over 6 at 16.000; Level 5 +20.726
    // over 5 at 21.000), and the 31.0 m cluster printed 'Level 7' from one row while TWO rows say
    // 'Level 7A' — so the drawing carried Level 7 twice, at 31 and at 34.
    // So: cluster within TOL, then take the MODAL name and the MODAL elevation of the cluster.
    var TOL = 0.30, cl = [];
    rows.forEach(function (r) {
      var n = String(r[0] || '');
      if (/\s+(Ceiling|TOS)$/i.test(n)) return;                 // pseudo-level, not a floor
      var z = Math.round(Number(r[1]) * 100) / 100;
      for (var i = 0; i < cl.length; i++) if (Math.abs(cl[i].z0 - z) <= TOL) { cl[i].rows.push({ n: n, z: z }); return; }
      cl.push({ z0: z, rows: [{ n: n, z: z }] });
    });
    var out = [], voted = 0;
    cl.forEach(function (c) {
      var cn = {}, cz = {}, kn = 0, kz = 0;
      c.rows.forEach(function (r) { cn[r.n] = (cn[r.n] || 0) + 1; cz[r.z] = (cz[r.z] || 0) + 1; });
      var bn = null, bnc = 0, bz = null, bzc = 0, k1, k2;
      for (k1 in cn) { kn++; if (cn[k1] > bnc) { bnc = cn[k1]; bn = k1; } }
      for (k2 in cz) { kz++; if (cz[k2] > bzc) { bzc = cz[k2]; bz = Number(k2); } }
      if (kn > 1 || kz > 1) voted++;
      out.push({ name: bn, z: bz });
    });
    out.sort(function (a, b) { return a.z - b.z; });
    if (voted) console.log('§FLYTHRU_DATUM_LEVELVOTE clusters=' + out.length + ' needingAVote=' + voted +
      ' (a cluster whose rows disagree on the name or the elevation takes the MODAL one, not the first)');
    return { src: src, levels: out, rawRows: rows.length, voted: voted };
  }

  A.flythruDatumBuild = function () {
    if (_built) return _info;
    _built = true;
    var T = window.THREE;
    if (!T || !A.scene || typeof A.ifc2three !== 'function') {
      console.log('§FLYTHRU_DATUM INCONCLUSIVE — no THREE/scene/ifc2three'); return null;
    }
    var cols = q("SELECT t.center_x,t.center_y FROM element_transforms t JOIN elements_meta m ON m.guid=t.guid WHERE m.ifc_class IN ('IfcColumn','IfcPile')");
    var ext = q("SELECT MIN(t.center_x-t.bbox_x/2),MAX(t.center_x+t.bbox_x/2),MIN(t.center_y-t.bbox_y/2),MAX(t.center_y+t.bbox_y/2),MIN(t.center_z-t.bbox_z/2),MAX(t.center_z+t.bbox_z/2) FROM element_transforms t JOIN elements_meta m ON m.guid=t.guid WHERE m.ifc_class IN ('IfcColumn','IfcPile','IfcWall','IfcWallStandardCase','IfcSlab','IfcBeam','IfcFooting','IfcCurtainWall','IfcRoof')")[0];
    if (!ext || ext[0] == null) { console.log('§FLYTHRU_DATUM VACUOUS — no structural extent'); return null; }
    var gx = linesFrom(cols.map(function (r) { return r[0]; }), MIN_SEP);
    var gy = linesFrom(cols.map(function (r) { return r[1]; }), MIN_SEP);
    var st = storeyLevels();
    // ⚠ DATUM. MEASURED 2026-09-07: Hospital records storey elevation 0..34 m (local, zero-based)
    // while its elements sit at 156.61..203.62 — 0 of 56 rules would land inside the building.
    // HHS records center_z 0.22..7.43 against elements -0.21..10.90 and already agrees. So DETECT
    // rather than always offset: shift only when the levels fall outside the element range.
    var zLo = ext[4], zHi = ext[5], off = 0;
    if (st.levels.length) {
      var lo = Math.min.apply(null, st.levels.map(function (L) { return L.z; }));
      var hi = Math.max.apply(null, st.levels.map(function (L) { return L.z; }));
      st.levels.forEach(function (L) { L.zRaw = L.z; });   // the number a drawing prints
      if (lo < zLo - 1 || hi > zHi + 1) { off = zLo - lo; st.levels.forEach(function (L) { L.z += off; }); }
      console.log('§FLYTHRU_DATUM_ZDATUM levels=' + lo.toFixed(2) + '..' + hi.toFixed(2) +
        ' elements=' + zLo.toFixed(2) + '..' + zHi.toFixed(2) + ' offset=' + off.toFixed(2) + 'm' +
        (off ? ' (levels were in a LOCAL datum)' : ' (already in the element datum)'));
    }
    // ⚠ DEGRADE, never invent: no columns -> no ground grid, and say so rather than draw a made-up module.
    if (gx.length < 2 || gy.length < 2) console.log('§FLYTHRU_DATUM_GRID VACUOUS — columns=' + cols.length + ' gave ' + gx.length + 'x' + gy.length + ' lines; ground grid omitted');
    if (!st.levels.length) console.log('§FLYTHRU_DATUM_STOREY VACUOUS — no storey levels; upright drawn without rules');

    _grp = new T.Group(); _grp.name = 'flythruDatum';
    var mat = new T.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.5 });      // depthTest TRUE — §17.5
    var matS = new T.LineBasicMaterial({ color: INK_STOREY, transparent: true, opacity: 0.75 });
    var P = function (ix, iy, iz) { var p = A.ifc2three(ix, iy, iz); return new T.Vector3(p.x, p.y, p.z); };
    var g = [], s = [];
    // GROUND — the plan grid, laid on the structural base
    var z0 = ext[4];
    gx.forEach(function (x) { g.push(P(x, ext[2], z0), P(x, ext[3], z0)); });
    gy.forEach(function (y) { g.push(P(ext[0], y, z0), P(ext[1], y, z0)); });
    // UPRIGHT — ONE plane only (§22.5). Verticals follow the X gridlines; horizontals are the STOREYS.
    // UPRIGHT — level lines and nothing else. Vertical gridlines were added here and do not belong:
    // the ground already states the grid, so repeating it upright is clutter, not information.
    // Build the level lines on BOTH Y faces and show only the FAR one each frame (§17.2 back-face).
    // The side was hardcoded to max-Y, which puts the plane between camera and building whenever the
    // camera is on that side — "the upright is wrong".
    var sNear = [];
    st.levels.forEach(function (L) {
      s.push(P(ext[0], ext[3], L.z), P(ext[1], ext[3], L.z));
      sNear.push(P(ext[0], ext[2], L.z), P(ext[1], ext[2], L.z));
    });
    _faces = { yMaxIfc: ext[3], yMinIfc: ext[2] };
    var mk = function (pts, m) { var gm = new T.BufferGeometry().setFromPoints(pts); var o = new T.LineSegments(gm, m); o.renderOrder = 1; return o; };
    if (g.length) { var og = mk(g, mat); og.name = 'ground'; _grp.add(og); }
    if (s.length) { var o1 = mk(s, matS); o1.name = 'levelsYmax'; _grp.add(o1);
                    var o2 = mk(sNear, matS.clone()); o2.name = 'levelsYmin'; _grp.add(o2); }
    _grp.visible = false;
    A.scene.add(_grp);
    _lines = { gx: gx, gy: gy, ext: ext, levels: st.levels };
    _info = { gridX: gx.length, gridY: gy.length, storeys: st.levels.length, storeySrc: st.src, columns: cols.length,
              bayMedianM: (function () { var b = []; for (var i = 0; i < gx.length - 1; i++) b.push(gx[i + 1] - gx[i]); b.sort(function (p, q2) { return p - q2; }); return b.length ? +b[b.length >> 1].toFixed(2) : 0; })() };
    console.log('§FLYTHRU_DATUM_BUILT columns=' + cols.length + ' groundGrid=' + gx.length + 'x' + gy.length +
      ' medianBay=' + _info.bayMedianM + 'm upright=1(plane) storeyRules=' + st.levels.length + ' src=' + st.src + ' rawStoreyRows=' + (st.rawRows||0) +
      ' segs=' + (g.length / 2 + s.length / 2) + (st.levels.length ? '' : ' — VACUOUS storeys'));
    return _info;
  };

  // Up from second 0 and through the dive, then out. It does NOT return — a re-established datum
  // mid-film would compete with the measurement cues for the same ink (§17.6).
  A.flythruDatumAt = function (filmSec, filmSecFull) {
    if (!_grp) return 0;
    var holdTo = Math.max(6, (filmSecFull || 0) * 0.094);   // beats.dive
    var op = filmSec <= holdTo ? 1 : Math.max(0, 1 - (filmSec - holdTo) / 2.0);
    _grp.visible = op > 0.01;
    var cam = A.camera, camFar = null;
    if (cam && _faces && typeof A.ifc2three === 'function') {
      var a = A.ifc2three(0, _faces.yMaxIfc, 0), b = A.ifc2three(0, _faces.yMinIfc, 0);
      var da = Math.abs(cam.position.z - a.z), db = Math.abs(cam.position.z - b.z);
      camFar = da >= db ? 'levelsYmax' : 'levelsYmin';
    }
    _grp.children.forEach(function (o) {
      var isLvl = o.name === 'levelsYmax' || o.name === 'levelsYmin';
      var vis = !isLvl || !camFar || o.name === camFar;
      o.visible = vis;
      o.material.opacity = (isLvl ? 0.75 : 0.5) * op;
    });
    return op;
  };

  // ══ THE ANNOTATION — ONE LAYOUT PASS, NOT FOUR INDEPENDENT LOOPS (spec §24) ═══════════════════
  // USER (2026-09-07), on the version this replaces: "update prompt to do labelling well. Due to
  // cramming of space, u can always align in parallel to the line. Avoid diff coloring as outright
  // well laid out lines bubbles will point to the right picture. Font been bold is like shouting
  // and noise. Organise that u need not label every small inner lengths simply not smart.
  // Selective, good design."
  //
  // FOUR RULINGS, each one decision in this pass:
  //   1. TEXT RUNS PARALLEL TO ITS LINE — every figure is rotated to its own line's angle. Horizontal
  //      text on an angled string is what forced the value out into space and caused the cramming.
  //   2. ONE INK, no colour coding. Bays were near-white and overalls yellow — hierarchy signalled by
  //      hue. Position and structure carry it instead. (§7's yellow belongs to the MEASUREMENT CUES,
  //      a different layer. The datum is drafting furniture and reads as one quiet system.)
  //   3. NO BOLD — regular weight throughout; the halo, not the weight, keeps it legible.
  //   4. SELECTIVE — the overall ALWAYS, plus a regular SAMPLE of the chain. Labelling all 27
  //      Hospital bays was never the goal.
  //
  // ⚠ THE STRUCTURAL FAULT THIS FIXES (§24.3). Bubbles, bay chain, overalls and level tags were four
  // loops each deciding alone whether to draw, with nothing coordinating them: Hospital drew 11 of 27
  // bays — a chain with 16 random gaps, which reads as broken rather than thinned — and HHS stranded
  // 10 of 17 bubbles on the frame edge. So MEASURE the plan on screen, decide everything ONCE, and
  // place every label against a SHARED OCCUPANCY REGISTER so nothing lands on anything else.
  //
  // ⚠ LADDER ORDER, outward from the plan edge — this is what makes the strings read as one set:
  //        plan edge --> TIER 1 (bay chain) --> TIER 2 (overall) --> BUBBLES, outermost.
  // Each gridline supplies its OWN projected outward vector, so a bubble sits on the extension of the
  // line it names and the overall's witness lines physically reach it ("outright well laid out lines
  // bubbles will point to the right picture"). The previous version put bubbles ON the plan edge and
  // offset the strings along an UNSIGNED perpendicular, so the figures landed INSIDE the plan half
  // the time. That was the cramming.
  //
  // USER, on which side: "make the ground 2D markings on the near sides of course unless u dont want
  // anyone to read well". The PLANE goes AWAY from the camera (occluded by the build); the ANNOTATION
  // comes TOWARD it. ⚠ Bottom and left need DIFFERENT tests — bottom projects LOWEST (largest screen
  // y), left projects LEFTMOST (smallest screen x). One test for both put the letters on whichever
  // long edge happened to sit lower.
  var INK = '#c9d3df';                                  // the ONE ink (ruling 2)
  var HALO = 'rgba(8,11,16,0.92)';
  // ⚠ THE RUNGS NEED ROOM, and the first spacing did not have it. At 34/68/98 px (x0.82 on Hospital
  // = 28/56/80) the bay figure, the overall figure and the bubbles all competed for the same 50 px
  // and the register refused 10 of them. Widening the ladder is the fix; crowding it and then
  // dropping labels is what "cramming" means.
  var BUB_R = 11, OFF1 = 32, OFF2 = 80, OFFB = 120;     // px at 720p, scaled by h/720 AND by plan size
  var MAX_FIG = 4;                                      // most bay figures per axis (ruling 4)
  // Standard grid letters omit I (confusable with 1). Practice omits O as well; grid_dims.js's own
  // sequence keeps O, which is why this defines its own rather than importing it.
  var LET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  function label(i, useLetters) { return useLetters ? (LET[i] || ('Z' + i)) : String(i + 1); }
  var _chainKey = 0;

  A.flythruDatumCompositeOntoCanvas = function (ctx, w, h, filmSec, filmSecFull) {
    if (!_lines || !ctx || !A.camera) { console.log('§FLYTHRU_DATUM_MARKS INCONCLUSIVE — no datum built'); return 0; }
    var T = window.THREE, cam = A.camera, k = h / 720;
    var holdTo = Math.max(6, (filmSecFull || 0) * 0.094);
    var op = filmSec <= holdTo ? 1 : Math.max(0, 1 - (filmSec - holdTo) / 2.0);
    if (op <= 0.01) return 0;
    var ext = _lines.ext, z0 = ext[4];
    var P = function (ix, iy, iz) { var p = A.ifc2three(ix, iy, iz); return new T.Vector3(p.x, p.y, p.z); };
    // ⚠ NDC z >= 1 means BEYOND THE FAR PLANE, not behind the camera — and x/y stay correct for
    // anything in front of the lens. Rejecting on z>=1 threw away a valid overall whose far end
    // simply sat past the far plane (MEASURED: declined behind z=0.99,1.23). Test VIEW-SPACE depth.
    var pr = function (v) {
      var vs = v.clone().applyMatrix4(cam.matrixWorldInverse);
      var p = v.clone().project(cam);
      return { x: (p.x * .5 + .5) * w, y: (-p.y * .5 + .5) * h, z: p.z, front: vs.z < -0.1 };
    };

    // ── 1. MEASURE THE PLAN ON SCREEN, ONCE. Every offset below scales from it: fixed pixel offsets
    //       crowd a small plan and scatter a large one.
    var midX = (ext[0] + ext[1]) / 2, midY = (ext[2] + ext[3]) / 2;
    var c1 = pr(P(ext[0], ext[2], z0)), c2 = pr(P(ext[1], ext[2], z0)), c3 = pr(P(ext[0], ext[3], z0));
    var planPx = Math.max(Math.hypot(c2.x - c1.x, c2.y - c1.y), Math.hypot(c3.x - c1.x, c3.y - c1.y), 1);
    var scale = Math.max(0.6, Math.min(1.8, planPx / 620));
    var off1 = OFF1 * k * scale, off2 = OFF2 * k * scale, offB = OFFB * k * scale;

    // ── 1b. WHICH EDGE THE ANNOTATION HANGS OFF — SCORED, not decided by a min/max test.
    // USER (2026-09-07): "the axis bubbles why not use the open space in the foreground?"
    // ⚠ THIS SUPERSEDES §24.4's "bottom by lowest projection, left by leftmost". Those two tests
    // each looked at ONE coordinate of ONE midpoint, so on Hospital the letter row landed on the
    // upper-left edge — laid ACROSS the building — while the whole foreground of the frame was empty.
    // A draughtsman hangs the strings off the side with room on it. Score both candidate edges of
    // each axis by where their OUTERMOST rung (the bubbles) actually lands:
    //     inFrac  — how much of the row is inside the frame at all (an off-frame row is worthless)
    //     depth   — how far down the frame it sits, which IS the foreground for a camera looking
    //               down at a building: open ground below, model above.
    // Ties are impossible in practice; when both edges score equal the lower-index edge wins, so the
    // choice stays deterministic.
    function edgeScore(vals, isX, ec, eo) {
      var inN = 0, sy = 0, nP = 0;
      for (var i = 0; i < vals.length; i++) {
        var b = isX ? pr(P(vals[i], ec, z0)) : pr(P(ec, vals[i], z0));
        var o = isX ? pr(P(vals[i], eo, z0)) : pr(P(eo, vals[i], z0));
        if (!b.front) continue;
        var dx = b.x - o.x, dy = b.y - o.y, L = Math.hypot(dx, dy) || 1;
        var px = b.x + dx / L * offB, py = b.y + dy / L * offB;
        nP++; sy += py;
        if (px > 14 * k && px < w - 14 * k && py > 14 * k && py < h - 14 * k) inN++;
      }
      if (!nP) return -1;
      // ⚠ CLAMP THE DEPTH TERM. Unclamped it is a mean screen y divided by the frame height, and a
      // point projected far outside the frame makes that arbitrarily large: the streamed Hospital run
      // logged edge scores of 19.10, 8.93 and 7.76, so "how far down the frame" was outvoting "is it
      // even in the frame" by an order of magnitude. In frame is worth 2; depth breaks ties, 0..1.
      return (inN / nP) * 2 + Math.max(0, Math.min(1, (sy / nP) / h));
    }
    // ⚠⚠ NEAR IS A CONSTRAINT, NOT A SCORE TERM. THIS IS THE USER'S RULING AND IT OUTRANKS THE SCORE.
    // USER (2026-09-07): "make the ground 2D markings on the near sides of course unless u dont want
    // anyone to read well" and, on seeing the result: "I asked that they be in the forefront, but u
    // placed them in the back."
    // WHAT WENT WRONG, so it is not repeated: §23 implemented the ruling as an explicit near-side
    // test. §24 replaced that test with edgeScore() — and a score is free to trade the ruling away.
    // It did: "inside the frame" is weighted x2, the near edge's outward band runs TOWARD the camera
    // and therefore off the bottom of the frame, so the near edge scored lower and the annotation
    // moved to the BACK of the building. A stated requirement must be a hard constraint; turning one
    // into one weighted term among others is how it gets silently overridden.
    // NEAR = smaller camera distance, measured, and it decides the side outright. The score is kept
    // ONLY as a fallback for when the near edge has nothing in front of the lens at all.
    function edgeDist(isX, ec) {
      var pt = isX ? P(midX, ec, z0) : P(ec, midY, z0);
      return pt.distanceTo(cam.position);
    }
    var sY0 = edgeScore(_lines.gx, true, ext[2], ext[3]), sY1 = edgeScore(_lines.gx, true, ext[3], ext[2]);
    var sX0 = edgeScore(_lines.gy, false, ext[0], ext[1]), sX1 = edgeScore(_lines.gy, false, ext[1], ext[0]);
    var dY0 = edgeDist(true, ext[2]), dY1 = edgeDist(true, ext[3]);
    var dX0 = edgeDist(false, ext[0]), dX1 = edgeDist(false, ext[1]);
    // ⚠ PREFERENCE WITH A DECLARED FALLBACK, not a weighted sum and not an absolute. MEASURED on
    // HHS at second zero: as a hard absolute it drew NOTHING — camera 8.7 m up and close, so the
    // near edge's outward band runs straight off the bottom of the frame and every axis withdrew.
    // Second zero is the frame whose whole job is to say "this is a real BIM model", so drawing
    // nothing is the worst outcome available. Order: near side if it can carry its refs, else the
    // far side, else withdraw — and SAY which, every frame, so a silent slide to the back is
    // impossible (that slide is exactly what the score allowed).
    var nearY = (dY1 < dY0) ? ext[3] : ext[2], nearX = (dX1 < dX0) ? ext[1] : ext[0];
    var farY = (nearY === ext[2]) ? ext[3] : ext[2], farX = (nearX === ext[0]) ? ext[1] : ext[0];
    var _sideY = 'near', _sideX = 'near';

    // ── 2. THE SHARED OCCUPANCY REGISTER. Everything that prints ink claims a rectangle; anything
    //       that cannot find room is DROPPED and COUNTED (silence would look like the pass stopped).
    var occ = [], _reg = occ, _dry = false, _coll = 0;
    function fits(r) {
      for (var i = 0; i < _reg.length; i++) {
        var o = _reg[i];
        if (r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0) return false;
      }
      return true;
    }
    function claim(r) { _reg.push(r); }
    function fontOf(px) { return '400 ' + px.toFixed(0) + 'px Segoe UI, system-ui, sans-serif'; }

    // ── 3. TEXT PARALLEL TO ITS LINE (ruling 1). The angle comes from the line's own screen
    //       direction; it is flipped past vertical so a figure never reads upside-down. The claimed
    //       rectangle is the AABB of the ROTATED box, not of the horizontal one.
    function placeText(txt, cx, cy, ux, uy, px, force, pad) {
      ctx.font = fontOf(px);
      var tw = ctx.measureText(txt).width, fh = px * 1.15;
      var ang = Math.atan2(uy, ux);
      if (ang > Math.PI / 2 + 1e-6 || ang < -Math.PI / 2 - 1e-6) ang += Math.PI;
      var pd = (pad == null ? 3 : pad) * k;
      var ca = Math.abs(Math.cos(ang)), sa = Math.abs(Math.sin(ang));
      var hw = ca * tw / 2 + sa * fh / 2 + pd, hh = sa * tw / 2 + ca * fh / 2 + pd;
      var r = { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh };
      if (cx < 4 * k || cx > w - 4 * k || cy < 4 * k || cy > h - 4 * k) { _coll++; return false; }
      if (!force && !fits(r)) { if (!_dry) _coll++; return false; }
      claim(r);
      if (_dry) return { w: tw, ang: ang };          // scored, not drawn
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3.4 * k; ctx.strokeStyle = HALO; ctx.lineJoin = 'round'; ctx.miterLimit = 2;
      ctx.strokeText(txt, 0, 0);
      ctx.fillStyle = INK; ctx.fillText(txt, 0, 0);
      ctx.restore();
      return { w: tw, ang: ang };
    }

    // ── 4. AN AXIS. Gridline value -> its base point on the near edge, and its own outward vector
    //       (from the far edge toward the near one), so ladder rung N sits at base + out * offN.
    // The axis is defined by two closures — where a value sits on the annotated edge, and where the
    // SAME value sits on the opposite edge. Their difference is that value's outward vector, so every
    // rung of the ladder is one scalar step along it. Nothing here knows about X, Y or Z.
    function mkAxis(vals, base, inner, lab) {
      function out(v) {
        var b = base(v), i = inner(v), dx = b.x - i.x, dy = b.y - i.y, L = Math.hypot(dx, dy) || 1;
        return { x: dx / L, y: dy / L };
      }
      function at(v, off) { var b = base(v), d = out(v); return { x: b.x + d.x * off, y: b.y + d.y * off, front: b.front }; }
      return { vals: vals, base: base, out: out, at: at, lab: lab };
    }
    var axX = mkAxis(_lines.gx, function (v) { return pr(P(v, nearY, z0)); }, function (v) { return pr(P(v, farY, z0)); },
                     function (i) { return label(i, false); });
    var axY = mkAxis(_lines.gy, function (v) { return pr(P(nearX, v, z0)); }, function (v) { return pr(P(farX, v, z0)); },
                     function (i) { return label(i, true); });
    // ── THE Z AXIS. USER (2026-09-07): "need consistency - the Z plane has to have same style bubbles
    // and proper." It was a different object entirely — free text tags reading "Level 4   +16.000",
    // staggered into two columns, with none of the ladder the ground uses. It is now the SAME axis
    // type: bubble outermost carrying the storey's own ref, tier 2 the overall height bubble-to-
    // bubble, tier 1 the storey-height chain. The ref is EXTRACTED from the storey name (the trailing
    // "7A" of "Level 7A"), never invented; a name with no number falls back to its index.
    var _lvz = (_lines.levels || []);
    // ⚠ A BARE NUMERAL IN A Z BUBBLE READS AS A GRIDLINE. The X axis already owns 1..15, so storey 3
    // and gridline 3 came out as the same mark in the same style. The prefix is EXTRACTED from the
    // storey's own name — the initial of its leading word ("Level 4" -> L4, "Storey 4" -> S4) — not a
    // convention invented here. A name with no leading word falls back to a bare index.
    function storeyRef(i) {
      var nm = String((_lvz[i] || {}).name || '');
      var m = nm.match(/([0-9]+[A-Za-z]?)\s*$/), w = nm.match(/^\s*([A-Za-z])/);
      return (w ? w[1].toUpperCase() : '') + (m ? m[1] : String(i + 1));
    }
    // Which end of the level rules the stack hangs off — scored the same way the ground edges are.
    // ⚠ SCORED OVER THE PLAN'S OWN X EXTREMES, CLAMPED, AND INDEPENDENT OF THE GROUND'S CHOICE.
    // Two faults were here at once, and the streamed run showed both. (a) The depth term was
    // unclamped exactly as the ground's was — logged `zEnd=far(scored 0.20/19.10)`. (b) It scored
    // nearX vs farX, which are the GROUND's picks, so clamping the ground silently moved the level
    // stack to a different corner and withdrew it: at t=9 the same frame went from
    // `far(scored 0.43/2.28)`, four bubbles drawn and reading, to `near(scored 0.82/-1.00)` and
    // withdrawn. The upright's anchor is its own question — score ext[0] against ext[1] directly.
    var zEndScore = [0, 0];
    for (var zE = 0; zE < 2; zE++) {
      var ec = zE ? ext[1] : ext[0], eo = zE ? ext[0] : ext[1], inN = 0, sy = 0, nP = 0;
      for (var zi = 0; zi < _lvz.length; zi++) {
        var b0 = pr(P(ec, farY, _lvz[zi].z)), o0 = pr(P(eo, farY, _lvz[zi].z));
        if (!b0.front) continue;
        var ddx = b0.x - o0.x, ddy = b0.y - o0.y, dL = Math.hypot(ddx, ddy) || 1;
        var qx = b0.x + ddx / dL * offB, qy = b0.y + ddy / dL * offB;
        nP++; sy += qy;
        if (qx > 14 * k && qx < w - 14 * k && qy > 14 * k && qy < h - 14 * k) inN++;
      }
      zEndScore[zE] = nP ? (inN / nP) * 2 + Math.max(0, Math.min(1, (sy / nP) / h)) : -1;
    }
    // Same ruling for the upright: the level stack hangs off the corner NEAREST the camera.
    var zMidZ = _lvz.length ? _lvz[(_lvz.length / 2) | 0].z : z0;
    var dZ0 = P(ext[0], farY, zMidZ).distanceTo(cam.position), dZ1 = P(ext[1], farY, zMidZ).distanceTo(cam.position);
    var zNearX = (dZ1 < dZ0) ? ext[1] : ext[0];
    if (zEndScore[0] < 0 || zEndScore[1] < 0) zNearX = (zEndScore[1] > zEndScore[0]) ? ext[1] : ext[0];
    var zFarX = (zNearX === ext[0]) ? ext[1] : ext[0];
    var axZ = mkAxis(_lvz.map(function (L) { return L.z; }),
                     function (v) { return pr(P(zNearX, farY, v)); },
                     function (v) { return pr(P(zFarX, farY, v)); },
                     storeyRef);

    // ── 5. ONE STRIDE PER AXIS for the chain SEGMENTS (readability floor), and a second, coarser
    //       stride for the FIGURES (ruling 4). The chain still spans 0 -> N -> 2N -> last, so it sums
    //       to the overall exactly however hard it is thinned.
    function strideFor(ax) {
      var v = ax.vals; if (v.length < 2) return 1;
      var a = ax.at(v[0], off1), b = ax.at(v[v.length - 1], off1);
      var per = Math.hypot(b.x - a.x, b.y - a.y) / (v.length - 1);
      return Math.max(1, Math.ceil(40 * k / Math.max(per, 1)));
    }
    var strX = strideFor(axX), strY = strideFor(axY);
    // ⚠ ONE INDEX LIST, shared by the chain ticks AND the bubbles, so the two read as one structure.
    // The final stride rarely lands on the last gridline; APPENDING it made a stub bay — MEASURED on
    // Hospital's Y axis, bubbles N(12) and P(13) came out one gridline apart and overlapped while
    // every other pair was two apart. A stub shorter than a full stride is ABSORBED into the bay
    // before it, which is what a drawing does with an odd end bay.
    function idxFor(nv, str) {
      var idx = [];
      for (var i = 0; i < nv; i += str) idx.push(i);
      var last = nv - 1;
      if (idx[idx.length - 1] !== last) {
        if (last - idx[idx.length - 1] < str) idx[idx.length - 1] = last; else idx.push(last);
      }
      // ⚠ ...but absorbing must never eat the ONLY interval. MEASURED on HHS's Z axis: 3 storey rules
      // with stride 3 gave [0], the stub rule replaced it with [2], and a one-entry list has no
      // segments at all — §FLYTHRU_DATUM_CHAIN went 'Z storeys=0.000 overall=7.210 CHAIN MISMATCH'.
      // Two ends are the minimum a chain can be.
      if (idx.length < 2 && nv > 1) idx = [0, last];
      return idx;
    }
    var ixX = idxFor(_lines.gx.length, strX), ixY = idxFor(_lines.gy.length, strY);

    var ln = function (x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };

    // ── 6. A DIMENSION. Witness lines, the run, ticks, and the figure IN THE BREAK in its own line
    //       (§24.2: no box on a value — the box ruling was about the PANEL, a container for a SET).
    //       tier 1 = bay, oblique ticks (quiet, and standard for a chain);
    //       tier 2 = overall, arrowheads, running bubble-to-bubble.
    var _ovDiag = [];
    function dim(ax, vA, vB, metres, tier, refA, refB, withFig) {
      var e = (tier === 2) ? off2 : off1;
      var A2 = ax.at(vA, e), B2 = ax.at(vB, e);
      if (!A2.front || !B2.front) { if (tier === 2) _ovDiag.push('end-behind-camera'); return 0; }
      var dx = B2.x - A2.x, dy = B2.y - A2.y, L = Math.hypot(dx, dy);
      // An OVERALL must draw if it can be drawn at all — it is the headline figure and is guaranteed
      // (§24.3). A bay may decline when it would be unreadable; the total may not vanish merely
      // because its axis is foreshortened toward the camera.
      var floor = (tier === 2) ? 12 * k : 26 * k;
      if (L < floor) { if (tier === 2) _ovDiag.push('len=' + L.toFixed(0) + 'px<floor=' + floor.toFixed(0)); return 0; }
      var ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
      ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 1.1 * k;
      ctx.globalAlpha = op * 0.72;
      // witness lines: tier 1 short, straddling its own run; tier 2 reaches OUT to the bubble edge.
      var wa0 = (tier === 2) ? e : e - 9 * k, wa1 = (tier === 2) ? (offB - BUB_R * k - 2 * k) : e + 6 * k;
      [[vA, A2], [vB, B2]].forEach(function (p) {
        var s = ax.at(p[0], wa0), t2 = ax.at(p[0], wa1);
        ln(s.x, s.y, t2.x, t2.y);
      });
      // WHERE THE FIGURE GOES, and it differs by tier for a measured reason.
      // ⚠ MEASURED 2026-09-07: with BOTH tiers breaking their line for the figure, bayFigures=0 on
      // Hospital — a 6.5 m bay seen from 100 m is ~30 px wide while "12,882" is ~40 px, so the break
      // can never hold it and every bay silently declined. A break is for a LONG run. So:
      //   tier 2 (overall, hundreds of px)  -> the figure sits IN THE BREAK in its own line
      //   tier 1 (bay, tens of px)          -> the figure sits ABOVE the line, parallel to it
      // Both are standard, neither is a box (§24.2), and the bay is no longer width-constrained.
      var txt = Math.round(metres * 1000).toLocaleString('en-US');
      if (tier === 2 && refA != null && refB != null) txt = refA + ' – ' + refB + '    ' + txt;
      var size = (tier === 2 ? 17 : 13) * k;
      ctx.font = fontOf(size);
      var tw = ctx.measureText(txt).width;
      var mx = (A2.x + B2.x) / 2, my = (A2.y + B2.y) / 2;
      var fig = null;
      if (withFig) {
        ctx.globalAlpha = op;
        if (tier === 2) { if (L > tw + 22 * k) fig = placeText(txt, mx, my, ux, uy, size, true); }
        // ⚠ ISO places the figure just OUTSIDE its dimension line. That was tried first and lost 5 of
        // 8 to the overall's corridor; moving it INSIDE fixed the collisions but put every bay value
        // over the model. Neither was the real fault — the LADDER was too tight. With tier 2 at 80 px
        // the outside is free again, which is where the figure belongs.
        else {
          // ⚠ TWO TRIES, outer then inner. MEASURED: Hospital's Z chain drew 3 of 3 segments and
          // zero figures — the overall's own rotated figure sits mid-stack and its AABB swallowed
          // every storey height. The strip inside tier 1 is empty by construction, so a figure that
          // cannot take its ISO position outside the line takes the one inside it rather than
          // vanishing. Both are on the line's own angle; neither is a box.
          var F = ax.at((vA + vB) / 2, e + 9 * k);
          fig = placeText(txt, F.x, F.y, ux, uy, size, false, 2);
          if (!fig) { var F2 = ax.at((vA + vB) / 2, e - 11 * k); fig = placeText(txt, F2.x, F2.y, ux, uy, size, false, 2); }
        }
        ctx.globalAlpha = op * 0.62;
      }
      ctx.strokeStyle = INK; ctx.lineWidth = 1.1 * k;
      if (fig && tier === 2) { var g = fig.w / 2 + 6 * k; ln(A2.x, A2.y, mx - ux * g, my - uy * g); ln(mx + ux * g, my + uy * g, B2.x, B2.y); }
      else ln(A2.x, A2.y, B2.x, B2.y);
      if (tier === 2) {
        var tri = function (px2, py2, sg) {
          ctx.beginPath(); ctx.moveTo(px2, py2);
          ctx.lineTo(px2 + sg * ux * 9 * k + nx * 3.4 * k, py2 + sg * uy * 9 * k + ny * 3.4 * k);
          ctx.lineTo(px2 + sg * ux * 9 * k - nx * 3.4 * k, py2 + sg * uy * 9 * k - ny * 3.4 * k);
          ctx.closePath(); ctx.fill();
        };
        tri(A2.x, A2.y, 1); tri(B2.x, B2.y, -1);
      } else {
        var tick = function (px2, py2) {           // oblique 45 deg slash, the architectural chain tick
          var sx = (ux + nx) * 4.6 * k, sy = (uy + ny) * 4.6 * k;
          ln(px2 - sx, py2 - sy, px2 + sx, py2 + sy);
        };
        tick(A2.x, A2.y); tick(B2.x, B2.y);
      }
      ctx.globalAlpha = op;
      return fig ? 2 : 1;
    }

    var n = 0, _bay = 0, _fig = 0, _ov = 0, _bubClamp = 0, _bubDrop = 0;
    ctx.save();
    ctx.globalAlpha = op; ctx.lineJoin = 'round';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // ── 7. THE OVERALLS GO IN FIRST — they are guaranteed, so they claim their space before anything
    //       else can take it (§24.3). Their refs name the two end bubbles: "1 - 15    95,915".
    function overall(ax) {
      var v = ax.vals; if (v.length < 2) return 0;
      return dim(ax, v[0], v[v.length - 1], v[v.length - 1] - v[0], 2,
                 ax.lab(0), ax.lab(v.length - 1), true) ? 1 : 0;
    }
    var ixZ0 = idxFor(axZ.vals.length, strideFor(axZ));
    // NEAR FIRST, then fall back per axis. Rebuilding an axis is two closures, so a swap is cheap
    // and nothing else about the axis changes.
    function buildX() { axX = mkAxis(_lines.gx, function (v) { return pr(P(v, nearY, z0)); },
                                     function (v) { return pr(P(v, farY, z0)); }, function (i) { return label(i, false); }); }
    function buildY() { axY = mkAxis(_lines.gy, function (v) { return pr(P(nearX, v, z0)); },
                                     function (v) { return pr(P(farX, v, z0)); }, function (i) { return label(i, true); }); }
    function buildZ() { axZ = mkAxis(_lvz.map(function (L) { return L.z; }),
                                     function (v) { return pr(P(zNearX, farY, v)); },
                                     function (v) { return pr(P(zFarX, farY, v)); }, storeyRef); }
    if (!canSet(axX, ixX)) { var t1 = nearY; nearY = farY; farY = t1; _sideY = 'FAR'; buildX(); buildZ(); }
    if (!canSet(axY, ixY)) { var t2 = nearX; nearX = farX; farX = t2; _sideX = 'FAR'; buildY(); }
    var _sideZ = 'near';
    if (!canSet(axZ, ixZ0)) { var t3 = zNearX; zNearX = zFarX; zFarX = t3; _sideZ = 'FAR'; buildZ(); }
    var setX = canSet(axX, ixX), setY = canSet(axY, ixY), setZ = canSet(axZ, ixZ0);
    var oX = setX ? overall(axX) : 0, oY = setY ? overall(axY) : 0, oZ = setZ ? overall(axZ) : 0;
    _ov = oX + oY + oZ; n += _ov;

    // ── 8. BUBBLES, outermost rung, ALL-OR-NONE PER AXIS. A row of bubbles stranded on the frame
    //       boundary is worse than none. They sit at the SAME indices the chain ticks at, so bubble
    //       and chain read as one structure rather than two overlaid drawings.
    function inFrame(p2) { return p2.front && p2.x > 14 * k && p2.x < w - 14 * k && p2.y > 14 * k && p2.y < h - 14 * k; }
    // ⚠ THE WHOLE AXIS IS ALL-OR-NOTHING, not just its bubbles. MEASURED on the streamed Hospital
    // run at t=9,16,18 — camera inside the building — the ground drew 22-24 bay dimension lines with
    // ZERO bubbles and 1 of 3 overalls: a chain of anonymous numbers with nothing to point at, which
    // is exactly the "reads as broken" failure §24.3 named. If an axis cannot carry its refs it does
    // not get to draw its chain either. Withdrawn axes are named in §FLYTHRU_DATUM_MARKS.
    function canSet(ax, idx) {
      var v = ax.vals;
      if (v.length < 2) return false;
      var ok = idx.filter(function (i2) { return inFrame(ax.at(v[i2], offB)); }).length;
      return ok >= Math.ceil(idx.length * 0.6);
    }
    function bubbleSet(ax, idx) {
      var v = ax.vals;
      var drawn = 0;
      idx.forEach(function (i2) {
        var p2 = ax.at(v[i2], offB);
        if (!p2.front) { _bubDrop++; return; }
        // ⚠ NO-SPACE CASE. A sheet is fixed; a moving camera is not. When the near edge leaves the
        // frame the bubble's natural position is off-screen — slide it ALONG ITS OWN GRIDLINE to the
        // boundary so it still sits on the line it names, and drop it only when the line is gone.
        var m = (BUB_R + 4) * k;
        if (p2.x < m || p2.x > w - m || p2.y < m || p2.y > h - m) {
          var d = ax.out(v[i2]), t2 = 0;
          if (p2.x < m && -d.x > 0) t2 = Math.max(t2, (m - p2.x) / -d.x);
          if (p2.x > w - m && -d.x < 0) t2 = Math.max(t2, (w - m - p2.x) / -d.x);
          if (p2.y < m && -d.y > 0) t2 = Math.max(t2, (m - p2.y) / -d.y);
          if (p2.y > h - m && -d.y < 0) t2 = Math.max(t2, (h - m - p2.y) / -d.y);
          p2 = { x: p2.x - d.x * t2, y: p2.y - d.y * t2 };
          if (p2.x < -m || p2.x > w + m || p2.y < -m || p2.y > h + m) { _bubDrop++; return; }
          _bubClamp++;
        }
        // nudge outward, once, if the overall's figure already owns this spot
        var r = { x0: p2.x - (BUB_R + 2) * k, y0: p2.y - (BUB_R + 2) * k, x1: p2.x + (BUB_R + 2) * k, y1: p2.y + (BUB_R + 2) * k };
        if (!fits(r)) {
          var d2 = ax.out(v[i2]), s = 2.2 * BUB_R * k;
          p2 = { x: p2.x + d2.x * s, y: p2.y + d2.y * s };
          r = { x0: p2.x - (BUB_R + 2) * k, y0: p2.y - (BUB_R + 2) * k, x1: p2.x + (BUB_R + 2) * k, y1: p2.y + (BUB_R + 2) * k };
        }
        claim(r);
        ctx.beginPath(); ctx.arc(p2.x, p2.y, BUB_R * k, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(8,11,16,0.62)'; ctx.fill();      // just enough to sit on the model
        ctx.strokeStyle = INK; ctx.lineWidth = 1.1 * k; ctx.globalAlpha = op * 0.8; ctx.stroke();
        ctx.globalAlpha = op;
        ctx.font = fontOf(12 * k); ctx.fillStyle = INK;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(ax.lab(i2), p2.x, p2.y + 0.5 * k);
        drawn++;
      });
      return { drawn: drawn, set: true };
    }
    var ixZ = ixZ0;
    var bX = setX ? bubbleSet(axX, ixX) : { drawn: 0, set: false },
        bY = setY ? bubbleSet(axY, ixY) : { drawn: 0, set: false },
        bZ = setZ ? bubbleSet(axZ, ixZ) : { drawn: 0, set: false };
    n += bX.drawn + bY.drawn + bZ.drawn;

    // ── 9. THE BAY CHAIN. Every strided segment draws its line and ticks; only a REGULAR SAMPLE
    //       carries a figure (ruling 4 — "u need not label every small inner lengths"). Regularly
    //       thinned reads as intentional; irregularly dropped reads as broken.
    function chain(ax, idx) {
      var v = ax.vals, segs = [];
      for (var i = 0; i < idx.length - 1; i++) segs.push([idx[i], idx[i + 1]]);
      var figEvery = Math.max(1, Math.ceil(segs.length / MAX_FIG));
      var drew = 0, figs = 0, sum = 0;
      segs.forEach(function (s, si) {
        var wantFig = (si % figEvery === 0);
        var r = dim(ax, v[s[0]], v[s[1]], v[s[1]] - v[s[0]], 1, null, null, wantFig);
        if (r) drew++;
        if (r === 2) figs++;
        sum += v[s[1]] - v[s[0]];
      });
      return { drew: drew, figs: figs, sum: sum, segs: segs.length, figEvery: figEvery };
    }
    var NOCHAIN = { drew: 0, figs: 0, sum: 0, segs: 0, figEvery: 1 };
    var cX = setX ? chain(axX, ixX) : NOCHAIN, cY = setY ? chain(axY, ixY) : NOCHAIN, cZ = setZ ? chain(axZ, ixZ) : NOCHAIN;
    _bay = cX.drew + cY.drew + cZ.drew; _fig = cX.figs + cY.figs + cZ.figs; n += _bay;

    // ── 10. THE Z LADDER IS THE SAME LADDER (see mkAxis above) — nothing special-cases it any more.
    //        USER: "need consistency - the Z plane has to have same style bubbles and proper."
    //        What was here instead: free "Level 4   +16.000" strings, staggered into two columns,
    //        with their own dry-run side-picker, their own leader, their own tick and their own font.
    //        Four bespoke mechanisms for one axis, and none of them the ones the ground uses. Gone.
    //        The storey rules now carry bubbles (the storey's own ref), a tier-1 chain of
    //        FLOOR-TO-FLOOR heights and a tier-2 OVERALL height spanning bubble to bubble — read at
    //        the same offsets, in the same ink, at the same weight, by the same code.
    ctx.restore();

    // ── 11. THE CHECK A DRAWING IS VERIFIED BY: the overall must equal the sum of the bays. Asserted
    //        once, not assumed — and the sum is taken from the GEOMETRY, so thinning cannot fake it.
    var ovX = _lines.gx[_lines.gx.length - 1] - _lines.gx[0], ovY = _lines.gy[_lines.gy.length - 1] - _lines.gy[0];
    if (_chainKey !== 1) {
      _chainKey = 1;
      var ovZ = axZ.vals.length > 1 ? axZ.vals[axZ.vals.length - 1] - axZ.vals[0] : 0;
      var ex = setX ? Math.abs(cX.sum - ovX) : 0, ey = setY ? Math.abs(cY.sum - ovY) : 0,
          ez = setZ ? Math.abs(cZ.sum - ovZ) : 0;
      console.log('§FLYTHRU_DATUM_CHAIN X bays=' + cX.sum.toFixed(3) + 'm overall=' + ovX.toFixed(3) +
        'm delta=' + ex.toFixed(4) + ' | Y bays=' + cY.sum.toFixed(3) + 'm overall=' + ovY.toFixed(3) +
        'm delta=' + ey.toFixed(4) + ' | Z storeys=' + cZ.sum.toFixed(3) + 'm overall=' + ovZ.toFixed(3) +
        'm delta=' + ez.toFixed(4) + ' -> ' + ((ex < 0.001 && ey < 0.001 && ez < 0.001) ? 'CHAIN ADDS UP' : 'CHAIN MISMATCH'));
    }
    if (_ov < 2) console.log('§FLYTHRU_DATUM_OVERALL declined=' + (2 - _ov) + ' reasons=[' + _ovDiag.join('; ') + ']');
    // PRIMAL LAW §4 — a pass that draws nothing must SAY nothing drew, or it is indistinguishable
    // from one that worked.
    console.log('§FLYTHRU_DATUM_MARKS ' + (n ? 'drawn=' + n : 'NOTHING drawn=0') + ' filmSec=' + filmSec.toFixed(2) +
      ' overalls=' + _ov + '/3 baySegs=' + _bay + '/' + (cX.segs + cY.segs) + ' bayFigures=' + _fig +
      ' figEvery=' + cX.figEvery + '/' + cY.figEvery + ' stride=' + strX + '/' + strY +
      ' axes=' + (setX ? 'X' : '-') + (setY ? 'Y' : '-') + (setZ ? 'Z' : '-') +
      (setX && setY && setZ ? '' : ' (withdrawn: an axis whose refs will not fit does not draw its chain)') + ' bubbles=' + (bX.drawn + bY.drawn) +
      ' clamped=' + _bubClamp + ' droppedOffFrame=' + _bubDrop +
      ' zRules=' + axZ.vals.length + ' zBubbles=' + bZ.drawn + ' zSegs=' + cZ.drew + '/' + cZ.segs + ' zFigures=' + cZ.figs +
      ' zEnd=x@' + zNearX.toFixed(1) + ' camDist ' + dZ0.toFixed(0) + '/' + dZ1.toFixed(0) + 'm' + '(scored ' + zEndScore[0].toFixed(2) + '/' + zEndScore[1].toFixed(2) + ')' +
      ' collisionsDropped=' + _coll +
      ' scale=' + scale.toFixed(2) + ' edges=(numeralsOn Y@' + nearY.toFixed(1) + ' camDist ' + dY0.toFixed(0) + '/' + dY1.toFixed(0) + 'm scored ' + sY0.toFixed(2) + '/' + sY1.toFixed(2) +
      ', lettersOn X@' + nearX.toFixed(1) + ' camDist ' + dX0.toFixed(0) + '/' + dX1.toFixed(0) + 'm scored ' + sX0.toFixed(2) + '/' + sX1.toFixed(2) +
      ') sides=(numerals ' + _sideY + ', letters ' + _sideX + ', levels ' + _sideZ + ')');
    return n;
  };

  A.flythruDatumDispose = function () { if (_grp && A.scene) { A.scene.remove(_grp); _grp.children.forEach(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); _grp = null; } };
  console.log('§FLYTHRU_DATUM_INIT wired (ground grid + ONE upright with storey rules; depth-tested, occluded by the build)');
}
if (typeof window !== 'undefined') window.setupCpeFlythruDatum = setupCpeFlythruDatum;
