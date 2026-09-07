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
    var yA = pr(P(midX, ext[2], z0)), yB = pr(P(midX, ext[3], z0));
    var xA = pr(P(ext[0], midY, z0)), xB = pr(P(ext[1], midY, z0));
    var nearY = (yA.y >= yB.y) ? ext[2] : ext[3], farY = (nearY === ext[2]) ? ext[3] : ext[2];
    var nearX = (xA.x <= xB.x) ? ext[0] : ext[1], farX = (nearX === ext[0]) ? ext[1] : ext[0];
    var c1 = pr(P(ext[0], ext[2], z0)), c2 = pr(P(ext[1], ext[2], z0)), c3 = pr(P(ext[0], ext[3], z0));
    var planPx = Math.max(Math.hypot(c2.x - c1.x, c2.y - c1.y), Math.hypot(c3.x - c1.x, c3.y - c1.y), 1);
    var scale = Math.max(0.6, Math.min(1.8, planPx / 620));
    var off1 = OFF1 * k * scale, off2 = OFF2 * k * scale, offB = OFFB * k * scale;

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
    function mkAxis(vals, isX) {
      var near = isX ? nearY : nearX, far = isX ? farY : farX;
      function base(v) { return pr(isX ? P(v, near, z0) : P(near, v, z0)); }
      function inner(v) { return pr(isX ? P(v, far, z0) : P(far, v, z0)); }
      function out(v) {
        var b = base(v), i = inner(v), dx = b.x - i.x, dy = b.y - i.y, L = Math.hypot(dx, dy) || 1;
        return { x: dx / L, y: dy / L };
      }
      function at(v, off) { var b = base(v), d = out(v); return { x: b.x + d.x * off, y: b.y + d.y * off, front: b.front }; }
      return { vals: vals, isX: isX, base: base, out: out, at: at };
    }
    var axX = mkAxis(_lines.gx, true), axY = mkAxis(_lines.gy, false);

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
        else { var F = ax.at((vA + vB) / 2, e + 9 * k); fig = placeText(txt, F.x, F.y, ux, uy, size, false, 2); }
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
      var useLet = !ax.isX;
      return dim(ax, v[0], v[v.length - 1], v[v.length - 1] - v[0], 2,
                 label(0, useLet), label(v.length - 1, useLet), true) ? 1 : 0;
    }
    var oX = overall(axX), oY = overall(axY);
    _ov = oX + oY; n += _ov;

    // ── 8. BUBBLES, outermost rung, ALL-OR-NONE PER AXIS. A row of bubbles stranded on the frame
    //       boundary is worse than none. They sit at the SAME indices the chain ticks at, so bubble
    //       and chain read as one structure rather than two overlaid drawings.
    function inFrame(p2) { return p2.front && p2.x > 14 * k && p2.x < w - 14 * k && p2.y > 14 * k && p2.y < h - 14 * k; }
    function bubbleSet(ax, idx, useLet) {
      var v = ax.vals;
      var ok = idx.filter(function (i2) { return inFrame(ax.at(v[i2], offB)); }).length;
      if (ok < Math.ceil(idx.length * 0.6)) return { drawn: 0, set: false };
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
        ctx.fillText(label(i2, useLet), p2.x, p2.y + 0.5 * k);
        drawn++;
      });
      return { drawn: drawn, set: true };
    }
    var bX = bubbleSet(axX, ixX, false), bY = bubbleSet(axY, ixY, true);
    n += bX.drawn + bY.drawn;

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
    var cX = chain(axX, ixX), cY = chain(axY, ixY);
    _bay = cX.drew + cY.drew; _fig = cX.figs + cY.figs; n += _bay;

    // ── 10. LEVEL TAGS on the upright. USER: the ground has too many lines to name, but "the upright
    //        storeys are few and well known, easily given by the DB". A level datum reads name +
    //        elevation, and the elevation printed is the LOCAL one (Level 2 +6.000), never the 156 m
    //        global figure the geometry needs. Parallel to its own rule, like every other figure.
    //        Seeded LOWEST and HIGHEST first so a crowded stack thins from the middle, not the top.
    // ⚠ ORDER DECIDES WHICH ONES SURVIVE. Bottom-up seeding kept the lowest floors and lost the top;
    // MEASURED, Hospital t=0: 8 rules span ~120 px at their near end, so ~14 px of text plus padding
    // lets only 4-6 fit. Bisecting — ground, top, middle, quarters — thins EVENLY, which is the same
    // reason the bay chain uses one stride: regular reads as intentional, ragged reads as broken.
    var lv = (_lines.levels || []), lvOrder = (function (nv) {
      if (nv <= 0) return [];
      var used = [], ord = [], qq = [[0, nv - 1]];
      function take(i) { if (i >= 0 && i < nv && !used[i]) { used[i] = 1; ord.push(i); } }
      take(0); take(nv - 1);
      while (qq.length) { var sg = qq.shift(); if (sg[1] - sg[0] < 2) continue; var m = (sg[0] + sg[1]) >> 1; take(m); qq.push([sg[0], m]); qq.push([m, sg[1]]); }
      for (var i2 = 0; i2 < nv; i2++) take(i2);
      return ord;
    })(lv.length);
    var _lvDrawn = 0, _lvEnd = 0;
    // ⚠ ONE END FOR THE WHOLE STACK, decided by a DRY RUN. Letting each tag fall back independently
    // got 7 of 8 on Hospital but scattered them across BOTH ends of the rules — four on the left,
    // three on the right — which reads as debris, not a stack. This is the same ruling the bubbles
    // already follow (§24.3, all-or-none per axis): a level datum column belongs on ONE side. So
    // score both ends against a scratch register and commit the side that carries more.
    function placeLevels() { var c = 0; lvOrder.forEach(function (i2) { if (oneLevel(lv[i2])) c++; }); return c; }
    var _lvScore = [0, 0];
    for (var eTry = 0; eTry < 2; eTry++) {
      _dry = true; _reg = occ.slice(); _lvEnd = eTry; _lvScore[eTry] = placeLevels();
      _dry = false; _reg = occ;
    }
    _lvEnd = (_lvScore[1] > _lvScore[0]) ? 1 : 0;
    function oneLevel(L) {
      var zTxt = (L.zRaw == null ? L.z : L.zRaw);
      var txt = L.name + '   ' + (zTxt >= 0 ? '+' : '') + zTxt.toFixed(3);
      ctx.font = fontOf(11 * k);
      var tw = ctx.measureText(txt).width;
      var a2, ux, uy;
      // ⚠ STAGGER IN TWO COLUMNS, don't surrender and don't escalate. Trying ONE position and
      // dropping on collision left 2 of 8 tags (the rules are ~17 px apart at their near end and the
      // text ~14 px tall). Four escalating steps got 4 tags but put them at four different distances,
      // which reads as scatter rather than a stack. A drawing staggers crowded datums into TWO ranks:
      // near column, far column, alternating. Two positions, nothing further.
      var aE = pr(P(_lvEnd ? farX : nearX, farY, L.z)), bE = pr(P(_lvEnd ? nearX : farX, farY, L.z));
      if (!aE.front) return;
      var dxE = bE.x - aE.x, dyE = bE.y - aE.y, LnE = Math.hypot(dxE, dyE) || 1;
      var uxE = -dxE / LnE, uyE = -dyE / LnE;
      var fig = null, dUsed = 0;
      for (var st2 = 0; st2 < 2 && !fig; st2++) {
        dUsed = tw / 2 + 12 * k + st2 * (tw + 14 * k);
        fig = placeText(txt, aE.x + uxE * dUsed, aE.y + uyE * dUsed, -uxE, -uyE, 11 * k, false, 1.5);
      }
      if (!fig) return;
      if (_dry) return true;                            // scored only — no ink in a trial pass
      a2 = aE; ux = uxE; uy = uyE;
      // ⚠ THE LEADER MUST REACH THE TEXT. A tag pushed to the far column with an 8 px stub still
      // attached to the rule end is a number floating in the sky — the association is the whole
      // point ("well laid out lines bubbles will point to the right picture").
      ctx.globalAlpha = op * 0.62; ctx.strokeStyle = INK; ctx.lineWidth = 1.1 * k;
      var lEnd = dUsed - tw / 2 - 4 * k;
      ln(a2.x, a2.y, a2.x + ux * lEnd, a2.y + uy * lEnd);                // leader, all the way
      ln(a2.x - uy * 4 * k, a2.y + ux * 4 * k, a2.x + uy * 4 * k, a2.y - ux * 4 * k);   // datum tick
      ctx.globalAlpha = op;
      _lvDrawn++; n++;
      return true;
    }
    placeLevels();
    ctx.restore();

    // ── 11. THE CHECK A DRAWING IS VERIFIED BY: the overall must equal the sum of the bays. Asserted
    //        once, not assumed — and the sum is taken from the GEOMETRY, so thinning cannot fake it.
    var ovX = _lines.gx[_lines.gx.length - 1] - _lines.gx[0], ovY = _lines.gy[_lines.gy.length - 1] - _lines.gy[0];
    if (_chainKey !== 1) {
      _chainKey = 1;
      var ex = Math.abs(cX.sum - ovX), ey = Math.abs(cY.sum - ovY);
      console.log('§FLYTHRU_DATUM_CHAIN X bays=' + cX.sum.toFixed(3) + 'm overall=' + ovX.toFixed(3) +
        'm delta=' + ex.toFixed(4) + ' | Y bays=' + cY.sum.toFixed(3) + 'm overall=' + ovY.toFixed(3) +
        'm delta=' + ey.toFixed(4) + ' -> ' + ((ex < 0.001 && ey < 0.001) ? 'CHAIN ADDS UP' : 'CHAIN MISMATCH'));
    }
    if (_ov < 2) console.log('§FLYTHRU_DATUM_OVERALL declined=' + (2 - _ov) + ' reasons=[' + _ovDiag.join('; ') + ']');
    // PRIMAL LAW §4 — a pass that draws nothing must SAY nothing drew, or it is indistinguishable
    // from one that worked.
    console.log('§FLYTHRU_DATUM_MARKS ' + (n ? 'drawn=' + n : 'NOTHING drawn=0') + ' filmSec=' + filmSec.toFixed(2) +
      ' overalls=' + _ov + '/2 baySegs=' + _bay + '/' + (cX.segs + cY.segs) + ' bayFigures=' + _fig +
      ' figEvery=' + cX.figEvery + '/' + cY.figEvery + ' stride=' + strX + '/' + strY +
      ' bubbleSets=' + (bX.set ? 'X' : '-') + (bY.set ? 'Y' : '-') + ' bubbles=' + (bX.drawn + bY.drawn) +
      ' clamped=' + _bubClamp + ' droppedOffFrame=' + _bubDrop +
      ' levelTags=' + _lvDrawn + '/' + lv.length + '(end=' + (_lvEnd ? 'far' : 'near') + ' scored ' + _lvScore[0] + '/' + _lvScore[1] + ')' + ' collisionsDropped=' + _coll +
      ' scale=' + scale.toFixed(2) + ' edges=(bottomY@' + nearY.toFixed(1) + ', leftX@' + nearX.toFixed(1) + ')');
    return n;
  };

  A.flythruDatumDispose = function () { if (_grp && A.scene) { A.scene.remove(_grp); _grp.children.forEach(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); _grp = null; } };
  console.log('§FLYTHRU_DATUM_INIT wired (ground grid + ONE upright with storey rules; depth-tested, occluded by the build)');
}
if (typeof window !== 'undefined') window.setupCpeFlythruDatum = setupCpeFlythruDatum;
