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
  var _sides = null, _camFar = null, _lastDrawn = null;   // §36 W1 — decided once per datum life, reset on dispose
  var _enteredAt = null, _envBox = null;                    // §20.8 — the drawing ends when the camera enters the envelope
  var _life2 = null, _life2Started = null, _life2End = 0, _life2LeftAt = null, _life2Logged = false, _sheetGroundY = 0;   // §37.2 — the second life over the finished building
  // §37.2 — the second life's SEARCH window: from flyback to the storey-reveal window. MEASURED 2026-09-08 (Hospital): the
  // pull-out and pull-back are flown INSIDE the building's plan (below the roof) from 69 s to 148.6 s, so "out→flyback" holds no
  // exterior frame at all; the first exterior frame is 148.6 s, at the start of the reveal round. So the life STARTS at the first
  // exterior frame inside this window, HOLDS as long as the opening did (max(6, 0.094·film)), fades 2 s, and never runs into the
  // storey-reveal window. A path with no exterior frame in the window prints VACUOUS at the end of the film.
  A.flythruDatumSetLife2 = function (fromSec, toSec) {
    _life2 = (isFinite(fromSec) && isFinite(toSec) && toSec - fromSec > 3.0) ? { from: fromSec, to: toSec } : null;
    console.log('§FLYTHRU_DATUM_LIFE2 ' + (_life2 ? 'search=' + fromSec.toFixed(2) + '-' + toSec.toFixed(2) + 's (flyback → storey-reveal); starts at the first exterior frame, holds like the opening, fades 2 s'
                                            : 'VACUOUS — flyback→storey-reveal is ' + (isFinite(fromSec) && isFinite(toSec) ? (toSec - fromSec).toFixed(2) + ' s' : 'undefined') + ', no second life'));
  };
  // §20.8 / §36 W1 — ONE lifetime rule for the 3D planes and the 2D annotation: up from second 0, held through
  // the dive, faded over 2 s after it — AND gone 0.6 s after the camera ENTERS the structural envelope. Inside
  // the building the setting-out sheet has nothing to say and its non-depth-tested 2D marks were re-admitted
  // through the walls as the camera turned (HHS full bake: drawn 8→24 at 7 s, inside at ~4 m). One-way latch.
  function lifeOpacity(filmSec, filmSecFull) {
    var holdTo = Math.max(6, (filmSecFull || 0) * 0.094);   // beats.dive
    var op = filmSec <= holdTo ? 1 : Math.max(0, 1 - (filmSec - holdTo) / 2.0);
    var T = window.THREE, cam = A.camera;
    if (_lines && _lines.ext && T && cam && typeof A.ifc2three === 'function') {
      if (!_envBox) {
        // ONE definition of "inside the building", for both lives: the COLUMN GRID's plan (gx/gy extents — the structural
        // box reaches 30 m past it on Hospital, foundation walls) below the highest storey the drawing itself marks
        // (Hospital: Level 7 at 34.0 m, not the 47 m plant tower): above the roof line, looking down, the sheet still reads.
        var e = _lines.ext, zTop = e[5], gx = _lines.gx || [], gy = _lines.gy || [];
        if (_lines.levels && _lines.levels.length) { zTop = -Infinity; for (var li = 0; li < _lines.levels.length; li++) zTop = Math.max(zTop, _lines.levels[li].z); if (!isFinite(zTop) || zTop <= e[4]) zTop = e[5]; }
        var px0 = gx.length > 1 ? gx[0] : e[0], px1 = gx.length > 1 ? gx[gx.length - 1] : e[1], py0 = gy.length > 1 ? gy[0] : e[2], py1 = gy.length > 1 ? gy[gy.length - 1] : e[3];
        var a1 = A.ifc2three(px0, py0, e[4]), b1 = A.ifc2three(px1, py1, zTop);
        _sheetGroundY = A.ifc2three(0, 0, e[4]).y;
        _envBox = new T.Box3(new T.Vector3(Math.min(a1.x, b1.x), Math.min(a1.y, b1.y), Math.min(a1.z, b1.z)),
                             new T.Vector3(Math.max(a1.x, b1.x), Math.max(a1.y, b1.y), Math.max(a1.z, b1.z)));
      }
      if (_enteredAt == null && _envBox.containsPoint(cam.position)) {
        _enteredAt = filmSec;
        console.log('§FLYTHRU_DATUM_ENTRY filmSec=' + filmSec.toFixed(2) + ' cam=(' + cam.position.x.toFixed(1) + ',' + cam.position.y.toFixed(1) + ',' + cam.position.z.toFixed(1) +
          ') — camera inside the building (column-grid plan, below the top storey rule); the setting-out drawing fades over 0.6 s and stays off (§20.8)' + (filmSec < 0.05 ? ' ⚠ AT THE OPENING: the film starts inside the building' : ''));
      }
    }
    if (_enteredAt != null) op = Math.min(op, Math.max(0, 1 - (filmSec - _enteredAt) / 0.6));
    // §37.2 — the second life: [out, flyback], ramp 1 s in, fade 2 s out, only while the camera is OUTSIDE the envelope.
    // The first frame of this life re-decides the sides once (the camera is elsewhere now) — see the compositor.
    if (_life2 && filmSec >= _life2.from && filmSec <= _life2.to && _envBox && cam) {
      // "Outside" for the second life = outside the SAME building box the entry latch uses, and above the ground grid.
      var outside = !_envBox.containsPoint(cam.position) && cam.position.y >= _sheetGroundY;
      if (outside && _life2Started == null) {
        _life2Started = filmSec; _sides = null; _camFar = null; _lastDrawn = null;
        _life2End = Math.min(_life2.to, filmSec + holdTo + 2.0);
        if (!_life2Logged) { _life2Logged = true; console.log('§FLYTHRU_DATUM_LIFE2 start filmSec=' + filmSec.toFixed(2) + ' end=' + _life2End.toFixed(2) + 's (hold ' + holdTo.toFixed(1) + 's + 2 s fade) — the setting-out sheet over the FINISHED building; sides re-decided once for this life'); }
      }
      if (_life2Started != null) {
        if (!outside && _life2LeftAt == null) { _life2LeftAt = filmSec; console.log('§FLYTHRU_DATUM_LIFE2 camera re-entered the building at ' + filmSec.toFixed(2) + 's — second life fades'); }
        var op2 = Math.min(1, (filmSec - _life2Started) / 1.0, Math.max(0, (_life2End - filmSec) / 2.0));
        if (_life2LeftAt != null) op2 = Math.min(op2, Math.max(0, 1 - (filmSec - _life2LeftAt) / 0.6));
        op = Math.max(op, op2);
      }
    }
    return op;
  }

  function q(sql) { try { return A.dbQuery(sql) || []; } catch (e) { return []; } }

  // Gridlines = column centres, thinned to a minimum separation. One pass, no rules DB, no votes.
  function linesFrom(vals, minSep) {
    vals = vals.slice().sort(function (a, b) { return a - b; });
    var out = [];
    for (var i = 0; i < vals.length; i++) if (!out.length || vals[i] - out[out.length - 1] > minSep) out.push(vals[i]);
    return out;
  }

  // Real floors only. 'Level 2 Ceiling' / 'Level 3 TOS' are not floors.
  function storeyLevels(medianBay) {
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
      // ⚠ MATCH THE WORD ANYWHERE, not only as a trailing one. The end-anchored form stripped
      // Hospital's "Level 2 Ceiling" and caught NONE of Terminal's "Ceiling Level 01" — 0 of 5,
      // because there the word leads. MEASURED on Terminal: 27 rules -> 23 with this one change.
      if (/\b(Ceiling|TOS)\b/i.test(n)) return;                  // pseudo-level, not a floor
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
    // ⚠ A LEVEL RULE MUST EARN ITS PLACE: it has to clear the bubble the drawing actually uses.
    // USER (2026-09-07): "can we reduce the number of lines ie on the vertical Z? ... just stick to
    // real storey differentiator? Or simply remove lines that are relatively too close" and, on why:
    // "This is so that the bubbles can have breathing space and their marking lengths are somewhat
    // noticeable. Users need not really read it as it is a movie, but they get the impression it has
    // 2D layout rendition on the fly."
    // So the threshold is not a fraction of anything arbitrary — it is the drawing's own bubble:
    // 2 x R (diameter) plus a quarter for air, where R is the grid-derived radius 0.153 x medianBay.
    // A pair closer than that could never be drawn with two readable refs anyway; keeping them only
    // shrank the whole level column until it vanished (Terminal's Z refs had fallen to 13% of
    // nominal). CHECKED on all three buildings before shipping: HHS 3 -> 3 and Hospital 8 -> 8, both
    // untouched, while Terminal goes 23 -> 12 and its Z refs return to 100% of nominal size.
    // Of a too-close pair the LOWER survives — a floor datum is the slab it stands on.
    var _rGrid = 0.153 * (medianBay > 0 ? medianBay : 6.0), _tol = 2.5 * _rGrid, _before = out.length;
    var thinned = [];
    out.forEach(function (L) { if (!thinned.length || L.z - thinned[thinned.length - 1].z > _tol) thinned.push(L); });
    if (thinned.length !== _before)
      console.log('§FLYTHRU_DATUM_LEVELTHIN ' + _before + ' -> ' + thinned.length + ' rules; a level closer than ' +
        _tol.toFixed(2) + 'm to the one below cannot clear the ' + (2 * _rGrid).toFixed(2) +
        'm bubble this drawing uses, so it is not a storey differentiator here');
    out = thinned;
    // ⚠ NAME THE FEDERATION FAULT RATHER THAN DRAW IT SILENTLY. When one storey NAME survives at two
    // or more separate elevations, the storey table is carrying two datums at once and no drawing can
    // be right. MEASURED on Terminal: "Aras 01..04" appear at 8/12/16/20 m AND again at 15.15/19.15/
    // 23.15 m — the same names a constant ~3.15 m apart — with a third, English set ("02 FIRST FLOOR
    // LEVEL") about 15 m lower again. That is why a 6-storey terminal yields 23 level rules. Choosing
    // between the datums would be invention, so the levels are drawn as recorded and the condition is
    // reported, with the offenders named.
    var _byName = {}, _split = [];
    out.forEach(function (L) { (_byName[L.name] = _byName[L.name] || []).push(L.z); });
    Object.keys(_byName).forEach(function (k) { if (_byName[k].length > 1) _split.push(k + '@[' + _byName[k].map(function (z) { return z.toFixed(2); }).join(',') + ']'); });
    if (_split.length) console.log('§FLYTHRU_DATUM_LEVELSPLIT ' + _split.length + ' storey name(s) recorded at MORE THAN ONE elevation — ' +
      'the storey table carries more than one datum, so these rules cannot all be floors: ' + _split.join(' | '));
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
    // same median the annotation uses: every bay on both ground axes, so the two agree by construction
    var _bays = [];
    for (var _bi = 0; _bi < gx.length - 1; _bi++) _bays.push(gx[_bi + 1] - gx[_bi]);
    for (var _bj = 0; _bj < gy.length - 1; _bj++) _bays.push(gy[_bj + 1] - gy[_bj]);
    _bays.sort(function (a, b) { return a - b; });
    var st = storeyLevels(_bays.length ? _bays[_bays.length >> 1] : 0);
    // ⚠ DATUM. MEASURED 2026-09-07: Hospital records storey elevation 0..34 m (local, zero-based)
    // while its elements sit at 156.61..203.62 — 0 of 56 rules would land inside the building.
    // HHS records center_z 0.22..7.43 against elements -0.21..10.90 and already agrees. So DETECT
    // rather than always offset: shift only when the levels fall outside the element range.
    var zLo = ext[4], zHi = ext[5], off = 0;
    if (st.levels.length) {
      var lo = Math.min.apply(null, st.levels.map(function (L) { return L.z; }));
      var hi = Math.max.apply(null, st.levels.map(function (L) { return L.z; }));
      st.levels.forEach(function (L) { L.zRaw = L.z; });   // the number a drawing prints
      var _offSrc = 'none';
      if (lo < zLo - 1 || hi > zHi + 1) {
        // ⚠ ANCHOR TO THE STOREYS' OWN SLABS, NOT TO THE LOWEST ELEMENT. MEASURED 2026-09-08 (§36 W5): `zLo - lo`
        // took the footing bottom (156.61) as Level 1's zero, while Level 1's slab top is 165.81 — every storey rule
        // was drawn 9.2 m too low, the camera landing on Level 1 read as "Level 3", and the indoor hall used the
        // wrong storey's raster. For each level NAME, the largest planar slab on that storey gives slabTop − elevation;
        // the median over storeys is the offset (Hospital: 165.81 on 9 of 9 storeys, spread 0.08 m). Falls back to the
        // old rule only when no storey has a slab, and says so.
        var _fits = [];
        try {
          var _sl = q("SELECT m.storey, t.center_z + t.bbox_z/2, t.bbox_x*t.bbox_y FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid " +
                      "WHERE m.ifc_class IN ('IfcSlab','IfcSlabStandardCase') AND t.bbox_z < 0.5*MIN(t.bbox_x,t.bbox_y)");
          var _top = {}; _sl.forEach(function (v) { var k = String(v[0]); if (!_top[k] || v[2] > _top[k].a) _top[k] = { z: +v[1], a: v[2] }; });
          st.levels.forEach(function (L) { var k = String(L.name || ''); if (_top[k]) _fits.push(_top[k].z - L.zRaw); });
        } catch (eZ) {}
        if (_fits.length) { _fits.sort(function (a, b) { return a - b; }); off = _fits[_fits.length >> 1]; _offSrc = 'slabs(n=' + _fits.length + ', spread=' + (_fits[_fits.length - 1] - _fits[0]).toFixed(2) + 'm)'; }
        else { off = zLo - lo; _offSrc = 'FALLBACK lowest element (no storey has a planar slab) ⚠'; }
        st.levels.forEach(function (L) { L.z += off; });
      }
      console.log('§FLYTHRU_DATUM_ZDATUM levels=' + lo.toFixed(2) + '..' + hi.toFixed(2) +
        ' elements=' + zLo.toFixed(2) + '..' + zHi.toFixed(2) + ' offset=' + off.toFixed(2) + 'm' +
        (off ? ' (levels were in a LOCAL datum; anchored to ' + _offSrc + ')' : ' (already in the element datum)'));
    }
    // ⚠ DEGRADE, never invent: no columns -> no ground grid, and say so rather than draw a made-up module.
    if (gx.length < 2 || gy.length < 2) console.log('§FLYTHRU_DATUM_GRID VACUOUS — columns=' + cols.length + ' gave ' + gx.length + 'x' + gy.length + ' lines; ground grid omitted');
    if (!st.levels.length) console.log('§FLYTHRU_DATUM_STOREY VACUOUS — no storey levels; upright drawn without rules');

    _grp = new T.Group(); _grp.name = 'flythruDatum';
    // §34.3 (MEP_CLASH_REVEAL_MOVIE.md — user, 2026-09-08: "make the grid lines more pts thicker"):
    // LineBasicMaterial draws 1px regardless of `linewidth` (a WebGL limitation) and the bundle ships
    // no LineSegments2/LineMaterial (grep: 0 hits), so the lines are now flat ribbon quads — real
    // world-space width, MeshBasicMaterial, depthTest left at its TRUE default (§17.5 still holds: the
    // ribbons must be occluded by the building, never shine through).
    var medianBay = _bays.length ? _bays[_bays.length >> 1] : 0;
    var R_BUB = 0.153 * (medianBay > 0 ? medianBay : 6.0);   // the grid's own bubble ratio, §17.3/§22
    // ⚠ depthWrite MUST be false on a TRANSPARENT material, and leaving it at THREE's `true` default
    // is what made the film flicker at 2:28 (MEP_CLASH_REVEAL_MOVIE.md §42, MEASURED). A transparent
    // double-sided ribbon that writes depth occludes whatever is drawn after it in the transparent
    // queue; the queue is re-sorted by distance every frame, so over a COMPLETE building (LIFE2) the
    // sort order flips frame to frame and large areas swap between building and sky. MEASURED on
    // `Hospital_FULL_measure_2026-09-08.mp4`: 42 frames of |ΔY|>15 (max 59.6), 100 % of them inside
    // §FLYTHRU_DATUM_LIFE2's 148.70-169.10 s window and ZERO outside it; one frame at 155.27 s swings
    // 35.5 % of the picture from RGB 29/32/28 to 185/189/197. The pre-Measure bake, which has no
    // datum at all, shows 0 such frames in the same phase (max |ΔY| 10.2). depthTEST stays TRUE —
    // §17.5's occlusion reading is the point of the opening — only the WRITE is wrong.
    var mat = new T.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.5, side: T.DoubleSide, depthWrite: false });      // depthTest TRUE — §17.5
    var matS = new T.MeshBasicMaterial({ color: INK_STOREY, transparent: true, opacity: 0.75, side: T.DoubleSide, depthWrite: false });
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
    // §34.3 width, MEASURED not guessed: a fixed 0.06×R_BUB ratio (R_BUB = grid bubble radius, §17.3)
    // was tried first and gave a Hospital line 0.059m wide — 0.37px at the film's real ~262m opening
    // distance, THINNER on screen than the 1px hairline it replaces (§FLYTHRU_DATUM_LINES first run).
    // World-space geometry viewed from hundreds of metres needs metres of width to read as a few
    // pixels, so the width is derived from THIS BUILD'S OWN opening camera distance to hit a stated
    // pixel target instead — "derived, not authored" (§12/§17.3) anchored to a quantity commensurate
    // with what the eye judges (screen pixels), not to bay spacing. Degrades to the bubble ratio when
    // no camera/viewport is up yet (never invent a number).
    var TARGET_PX = 2.5;   // modestly thicker than a 1px hairline, not a bar
    var gridCentre = P((ext[0] + ext[1]) / 2, (ext[2] + ext[3]) / 2, z0);
    var _cam = A.camera, _rh = A.renderer && A.renderer.domElement && A.renderer.domElement.height;
    var _camDist = _cam ? _cam.position.distanceTo(gridCentre) : null;
    var ribbonHalfW, _widthSrc, _widthMeasured = false;
    if (_camDist && _cam.fov && _rh) {
      ribbonHalfW = (TARGET_PX * 2 * _camDist * Math.tan(_cam.fov * Math.PI / 360) / _rh) / 2;
      _widthSrc = 'camera d=' + _camDist.toFixed(1) + 'm fov=' + _cam.fov.toFixed(0) + ' h=' + _rh + 'px';
      _widthMeasured = true;
    } else {
      ribbonHalfW = 0.03 * R_BUB;
      _widthSrc = 'DEGRADED — no camera/viewport yet, fell back to 0.06 x R_BUB(' + R_BUB.toFixed(3) + 'm)';
    }
    // ONE flat quad per segment, all segments of a group merged into ONE BufferGeometry — §17.7's
    // "3 draw calls" budget is unchanged, only each draw call now emits triangles instead of lines.
    // The quad stays IN the plane the segment already lies in: `normal` is that plane's normal, so
    // `along × normal` gives the in-plane perpendicular to widen along (ground -> Y-up normal, widens
    // in X/Z; the elevation plane -> Z normal, widens vertically) — never a rod poking out of the face.
    var mkRibbon = function (pts, m, halfW, normal) {
      var pos = [], i, A2, B2, along, perp, a0, a1, b0, b1;
      for (i = 0; i < pts.length; i += 2) {
        A2 = pts[i]; B2 = pts[i + 1];
        along = B2.clone().sub(A2);
        if (along.lengthSq() < 1e-9) continue;
        along.normalize();
        perp = new T.Vector3().crossVectors(along, normal).normalize().multiplyScalar(halfW);
        a0 = A2.clone().sub(perp); a1 = A2.clone().add(perp);
        b0 = B2.clone().sub(perp); b1 = B2.clone().add(perp);
        pos.push(a0.x, a0.y, a0.z, b0.x, b0.y, b0.z, b1.x, b1.y, b1.z);
        pos.push(a0.x, a0.y, a0.z, b1.x, b1.y, b1.z, a1.x, a1.y, a1.z);
      }
      var gm = new T.BufferGeometry();
      gm.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      var o = new T.Mesh(gm, m); o.renderOrder = 1; return o;
    };
    var Y_UP = new T.Vector3(0, 1, 0), Z_AX = new T.Vector3(0, 0, 1);
    if (g.length) { var og = mkRibbon(g, mat, ribbonHalfW, Y_UP); og.name = 'ground'; _grp.add(og); }
    if (s.length) { var o1 = mkRibbon(s, matS, ribbonHalfW, Z_AX); o1.name = 'levelsYmax'; _grp.add(o1);
                    var o2 = mkRibbon(sNear, matS.clone(), ribbonHalfW, Z_AX); o2.name = 'levelsYmin'; _grp.add(o2); }
    // §34.3 witness — the width actually chosen, how it was derived, and what it measures on screen
    // AT THE REAL OPENING DISTANCE (not a made-up reference range), so a later "thin again"
    // regression is caught as a number, not an eyeball.
    console.log('§FLYTHRU_DATUM_LINES widthM=' + (2 * ribbonHalfW).toFixed(4) + ' src=[' + _widthSrc + ']' +
      (_widthMeasured ? ' px@' + _camDist.toFixed(0) + 'm=' + TARGET_PX.toFixed(2) : ' px@?=n/a'));
    _grp.visible = false;
    // §46 / §AO_EXCLUDE — the setting-out sheet is an ANNOTATION, not a surface. Without this the
    // SSAO prepass (which uses scene.overrideMaterial and so ignores depthWrite) writes these
    // ribbons in as solid geometry and the whole picture's ambient occlusion is computed against
    // them: MEASURED as 42 frames of |dY|>15 inside LIFE2's window, 0 with Measure off.
    _grp.userData.excludeFromAO = true;
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
    var op = lifeOpacity(filmSec, filmSecFull);
    _grp.visible = op > 0.01;
    var cam = A.camera;
    // §36 W1 — which upright is the FAR one is decided ONCE (the opening pose), not per frame: re-picking it
    // as the dive crossed the Y mid-plane swapped the visible upright and its whole storey annotation.
    if (!_camFar && cam && _faces && typeof A.ifc2three === 'function') {
      var a = A.ifc2three(0, _faces.yMaxIfc, 0), b = A.ifc2three(0, _faces.yMinIfc, 0);
      var da = Math.abs(cam.position.z - a.z), db = Math.abs(cam.position.z - b.z);
      _camFar = da >= db ? 'levelsYmax' : 'levelsYmin';
    }
    var camFar = _camFar;
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
  // (The pixel ladder that used to live here — BUB_R 11, OFF1/2/B 32/80/120 px, MAX_FIG 4 — went with
  // the screen-space layer. Every size is now a length in the model, derived per axis inside the
  // composite. Left in place these names would silently shadow the real ones.)
  // Standard grid letters omit I (confusable with 1). Practice omits O as well; grid_dims.js's own
  // sequence keeps O, which is why this defines its own rather than importing it.
  var LET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  function label(i, useLetters) { return useLetters ? (LET[i] || ('Z' + i)) : String(i + 1); }
  var _chainKey = 0;
  // ⚠ A BARE NUMERAL IN A Z BUBBLE READS AS A GRIDLINE — the X axis already owns 1..15. The prefix is
  // EXTRACTED from the storey's own name: the initial of its leading word plus its trailing ref
  // ("Level 4" -> L4, "Level 7A" -> L7A, "Storey 4" -> S4). A name with neither falls back to index.
  function storeyRefFor(levels, i) {
    var nm = String((levels[i] || {}).name || '');
    var m = nm.match(/([0-9]+[A-Za-z]?)\s*$/), wd = nm.match(/^\s*([A-Za-z])/);
    return (wd ? wd[1].toUpperCase() : '') + (m ? m[1] : String(i + 1));
  }

  A.flythruDatumCompositeOntoCanvas = function (ctx, w, h, filmSec, filmSecFull) {
    if (!_lines || !ctx || !A.camera) { console.log('§FLYTHRU_DATUM_MARKS INCONCLUSIVE — no datum built'); return 0; }
    var T = window.THREE, cam = A.camera;
    var op = lifeOpacity(filmSec, filmSecFull);
    if (op <= 0.01) { A._flythruDatumLast = { drawn: 0, filmSec: filmSec, enteredAt: _enteredAt, faded: true }; _lastDrawn = 0; return 0; }
    var ext = _lines.ext, z0 = ext[4];
    var P = function (ix, iy, iz) { var p = A.ifc2three(ix, iy, iz); return new T.Vector3(p.x, p.y, p.z); };
    var pr = function (v) {
      var vs = v.clone().applyMatrix4(cam.matrixWorldInverse);
      var p = v.clone().project(cam);
      return { x: (p.x * .5 + .5) * w, y: (-p.y * .5 + .5) * h, front: vs.z < -0.1 };
    };

    // ── 1. EVERY SIZE IS A LENGTH IN THE MODEL, DERIVED FROM THE GRID'S OWN BAY ───────────────────
    // The measured median bay is the only input; each ratio below is a proportion of it, so the
    // annotation scales itself to any building without a single tuned pixel constant. Bubble diameter
    // 0.40 of a bay CANNOT collide with its neighbour by construction — which is why every stride,
    // rank, clamp and occupancy test that used to live here is gone.
    // ⚠ B is the median BAY, and it has a fallback that must announce itself: a building with no
    // usable column grid would otherwise be drawn at a made-up 6 m module with nothing saying so.
    var bays = [];
    for (var bi = 0; bi < _lines.gx.length - 1; bi++) bays.push(_lines.gx[bi + 1] - _lines.gx[bi]);
    for (var bj = 0; bj < _lines.gy.length - 1; bj++) bays.push(_lines.gy[bj + 1] - _lines.gy[bj]);
    bays.sort(function (a, b) { return a - b; });
    var B = bays.length ? bays[bays.length >> 1] : 6.0;
    if (!bays.length) console.log('§FLYTHRU_DATUM_BAY VACUOUS — no bays measured; every size below ' +
      'falls back to a 6.00 m module, which is a DEFAULT, not this building\'s grid');
    // ⚠ SIZES COME FROM THE DRAFTING CONVENTION, NOT FROM A FRACTION OF THE BAY. A bay fraction was
    // tried first and is wrong: 0.20*B gave a 1.31 m radius on a 6.54 m bay — a bubble 40% of a bay
    // wide, and 8.8 m rungs that pushed the numerals off frame. Architectural practice sizes these on
    // the SHEET: at 1:100 a grid bubble is 8-12 mm, dimension text 2.5-3.5 mm (ISO 3098), the first
    // dimension line ~10 mm off the outline with equal steps for each chain. Read at 1:100 those are
    // metres on the model, which is what this layer draws in. B is still measured, and still decides
    // when a figure must be skipped.
    // ⚠ THE SIZE FOLLOWS THE GRID, NOT THE PLAN. Deriving a plot scale from the plan's own size was
    // tried and is wrong: a 102 m plan picks 1:200 while a 177 m plan tips over the sheet into 1:500,
    // so the SAME 6.5 m bay got a 1.00 m bubble on one building and a 2.50 m bubble on the other —
    // 78% of a bay, the numerals piling into one solid chain of overlapping ellipses (MEASURED,
    // Hospital second zero). Two buildings with the same grid must be drawn the same way.
    // The ratio is not invented: it is read back off the HHS second-zero frame the user accepted —
    // 1.00 m bubble radius on a 6.54 m median bay = 0.153. The rest keep the sheet's own
    // proportions to that bubble (text 3.5/5 of it; the first dimension line at 10/5, then equal
    // steps), so the drawing is self-similar on any building and identical wherever the bay is.
    var R_GRID = 0.153 * B;      // the grid's candidate radius; each axis may only reduce it

    // ── 2. NEAR SIDE, and the upright to the BACK — both are user rulings, both measured — DECIDED ONCE ──
    // §36 W1 (2026-09-08). These were re-decided EVERY frame. When the dive crossed a mid-plane the near
    // side flipped and the whole annotation jumped to the other edge: HHS full bake, drawn 40→6→22 inside one
    // second while bubbles walked 20→8 one per frame. A drawing is decided once, at the opening pose, and
    // then only leaves frame or fades (§24.10, §25.1). `sidesNow` is still computed each frame and REPORTED
    // (sidesChanged=) so the stability witness can see what would have flipped, without acting on it.
    // USER (2026-09-07) on the side: "make the ground 2D markings on the near sides of course unless u dont
    // want anyone to read well" — the near side of the OPENING, where the drawing is read.
    var midX = (ext[0] + ext[1]) / 2, midY = (ext[2] + ext[3]) / 2;
    function dTo(ix, iy, iz) { return P(ix, iy, iz).distanceTo(cam.position); }
    var _lvz = (_lines.levels || []);
    var zMid = _lvz.length ? _lvz[(_lvz.length / 2) | 0].z : z0;
    // ⚠ THE UPRIGHT HAS TWO VERTICAL PLANES TO LIE IN, AND ONE OF THEM IS EDGE-ON — of the two vertical
    // faces, take the one whose normal points most directly at the camera (billboarding would be the
    // wrong fix; choosing the plane is the right one). Now chosen once, like the near sides.
    function faceOn(nx, ny) {
      var o = P(midX, midY, zMid);
      var nrm = P(midX + nx, midY + ny, zMid).sub(o).normalize();
      var vw = o.clone().sub(cam.position).normalize();
      return Math.abs(nrm.dot(vw));
    }
    function decideSides() {
      var nY = dTo(midX, ext[3], z0) < dTo(midX, ext[2], z0) ? ext[3] : ext[2];
      var nX = dTo(ext[1], midY, z0) < dTo(ext[0], midY, z0) ? ext[1] : ext[0];
      var fYe = (nY === ext[2]) ? ext[3] : ext[2], fXe = (nX === ext[0]) ? ext[1] : ext[0];
      var zNX = dTo(ext[1], fYe, zMid) > dTo(ext[0], fYe, zMid) ? ext[1] : ext[0];
      var fY = faceOn(0, 1), fX = faceOn(1, 0), zP = (fX > fY) ? 'X-face' : 'Y-face';
      var zNY = dTo(midX, ext[3], zMid) > dTo(midX, ext[2], zMid) ? ext[3] : ext[2];
      return { nearY: nY, nearX: nX, farY: fYe, farX: fXe, zNearX: zNX, fY: fY, fX: fX, zPlane: zP, zNearY: zNY,
               sgnZY: (zNY === ext[2]) ? -1 : 1, sgnY: (nY === ext[2]) ? -1 : 1, sgnX: (nX === ext[0]) ? -1 : 1, sgnZ: (zNX === ext[0]) ? -1 : 1,
               key: nY.toFixed(2) + '|' + nX.toFixed(2) + '|' + zNX.toFixed(2) + '|' + zP + '|' + zNY.toFixed(2) };
    }
    var sidesNow = decideSides();
    if (!_sides) { _sides = sidesNow; _sides.decidedAt = filmSec; }
    var _sidesChanged = sidesNow.key !== _sides.key;
    var nearY = _sides.nearY, nearX = _sides.nearX, farY = _sides.farY, farX = _sides.farX, zNearX = _sides.zNearX;
    var _fY = _sides.fY, _fX = _sides.fX, _zPlane = _sides.zPlane, zNearY = _sides.zNearY, sgnZY = _sides.sgnZY;
    // sign of "outward" per axis, in model units
    var sgnY = _sides.sgnY, sgnX = _sides.sgnX, sgnZ = _sides.sgnZ;

    // ── 3. THE ONLY DRAWING PRIMITIVE: LAY THE INK IN ITS OWN PLANE ───────────────────────────────
    // USER, 2026-09-07: "it is in 3D space, do not force it to be readable. Keep it static true to
    // its 2D plane" · "Optics will impress."
    // Everything this module used to do — pixel radii, upright-flipped text, screen-space offsets, a
    // shared occupancy register, ranks, strides, clamping — existed to keep a screen-space label
    // legible against a world-space anchor. That hybrid is what made three axes hard to label: the
    // labels had to be re-solved every frame while the lines never did. So the labels join the lines.
    // A mark is placed by its plane: origin O and two in-plane unit directions U, V, all in model
    // space. Projecting O, O+U, O+V gives the affine basis that maps model metres to screen pixels,
    // and canvas draws through it. A circle becomes the correct ellipse; text foreshortens, skews and
    // rotates with the plane it is written on. Nothing is corrected to face the viewer.
    function plane(ox, oy, oz, ux, uy, uz, vx, vy, vz) {
      var O = pr(P(ox, oy, oz)), U = pr(P(ox + ux, oy + uy, oz + uz)), V = pr(P(ox + vx, oy + vy, oz + vz));
      if (!O.front || !U.front || !V.front) return null;
      return { a: U.x - O.x, b: U.y - O.y, c: V.x - O.x, d: V.y - O.y, e: O.x, f: O.y };
    }
    var INK = '#c9d3df', HALO = 'rgba(8,11,16,0.92)';
    var UNIT = 100;   // canvas cannot set a sub-pixel font, so text is drawn at UNIT x and scaled back
    function withPlane(m, fn) {
      if (!m) return false;
      ctx.save(); ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f); fn(); ctx.restore(); return true;
    }
    // ⚠ THE FIGURES STAY IN THE MODEL, and this was settled twice from opposite directions.
    // USER (2026-09-07): "it is in 3D space, do not force it to be readable. Keep it static true to
    // its 2D plane" · "Optics will impress." Then (2026-09-08), asked for the measuring lengths of
    // the earlier screen-space frame back — so they were briefly drawn at a fixed pixel size, angle
    // from the plane — and then, on seeing it: "They maybe small but at least in real 3Dspace we can
    // make it out legibly at some point in the dive in."
    // That is the answer, and it is the stronger one: a figure that is small at 98 m is not
    // unreadable, it is FAR. The camera closes, and the number resolves the way a real one would.
    // Drawing it at a fixed pixel size would have made it the only thing in the drawing that does
    // not obey the perspective, and would have put this layer back to being re-laid out per frame.
    function inkText(m, txt, size) {           // size in MODEL METRES
      return withPlane(m, function () {
        ctx.scale(1 / UNIT, 1 / UNIT);
        ctx.font = '400 ' + (size * UNIT).toFixed(0) + 'px Segoe UI, system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round'; ctx.lineWidth = size * UNIT * 0.22;
        ctx.strokeStyle = HALO; ctx.strokeText(txt, 0, 0);
        ctx.fillStyle = INK; ctx.fillText(txt, 0, 0);
      });
    }
    // ⚠ r and th are PASSED IN. They used to close over module-level R_BUB/TXT; with sizing now per
    // axis those names do not exist at this scope, and the failure would be a ReferenceError at call
    // time that `node --check` cannot see.
    function inkBubble(m, txt, r, th) {
      return withPlane(m, function () {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(8,11,16,0.62)'; ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = r * 0.10; ctx.stroke();
        ctx.scale(1 / UNIT, 1 / UNIT);
        ctx.font = '400 ' + (th * UNIT).toFixed(0) + 'px Segoe UI, system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = INK; ctx.fillText(txt, 0, th * UNIT * 0.05);
      });
    }
    function seg(p1, p2) {
      var a = pr(p1), b = pr(p2);
      if (!a.front || !b.front) return false;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      return true;
    }

    var n = 0, _bub = 0, _figs = 0, _ov = 0, _thin = { x: 1, y: 1 };
    ctx.save(); ctx.globalAlpha = op; ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 1.1 * (h / 720);

    // ── 4. ONE AXIS ROUTINE, USED THREE TIMES. Ground X and Y lie in the ground plane; the upright
    //       lies in the far-Y plane. The only difference between them is which model directions are
    //       "along" and "outward" — the drawing itself is identical.
    function axis(vals, lab, at, along, out, isUpright) {
      // at(v, off) -> [ix,iy,iz] of the point for value v, off metres outward
      // along / out -> unit model directions, for the text plane
      // ⚠ ONE VALUE IS NOT AN AXIS. With vals.length < 2 the stride below evaluates vals[1] as
      // undefined, so step becomes NaN, `j += NaN` exits the loop on its first test, and the axis
      // draws nothing while reporting nothing — the silent-failure shape PRIMAL LAW §4 forbids.
      if (!vals || vals.length < 2) {
        console.log('§FLYTHRU_DATUM_AXIS VACUOUS — ' + ((vals && vals.length) || 0) +
                    ' value(s); an axis needs two to carry a dimension, so it is omitted');
        return { bubbles: 0, figures: 0, step: 1, sum: 0 };
      }
      // A figure is skipped only when the next one would overlap it IN THE MODEL, so the same
      // drawing thins the same way from any viewpoint. ⚠ Measured against the SMALLEST gap, not
      // vals[1]-vals[0]: the first gap is not the tightest, and on an irregular grid using it lets
      // figures collide wherever the spacing tightens later along the axis.
      var minGap = Infinity;
      for (var gi = 1; gi < vals.length; gi++) minGap = Math.min(minGap, Math.abs(vals[gi] - vals[gi - 1]));
      if (!isFinite(minGap) || minGap <= 0) minGap = 0.01;
      // ⚠ THE CLEARANCE IS PER AXIS, because each axis is spaced by a different thing — the ground
      // axes by their bays, the upright by its storey heights, and a coarser building does not make
      // its floors further apart. The grid ratio alone is not enough: MEASURED on Terminal, whose
      // storey table is federated, the tightest gap is 0.43 m against a 2.42 m bubble — 560%
      // occupancy, the level column drawn as a solid overlapping stack. Capping the radius at
      // 0.40 x this axis's own smallest gap guarantees clearance (diameter <= 0.8 of the gap) and,
      // CHECKED before it shipped, binds on exactly one axis across all three buildings — Terminal's
      // Z, 1.21 m -> 0.17 m — leaving HHS and Hospital, both already accepted, untouched.
      // ⚠ THE BUBBLE IS SIZED BY ITS OWN LABEL, nothing else. USER (2026-09-08): "keep them tight
      // smaller just enough to cover the letters/numerics. Now they are big and overlapping other
      // markings." A circle at the full grid radius is a container built for a module, not for a
      // two-character ref, so it swallowed the dimension lines and figures around it.
      // The text size and the whole ladder stay pinned to the GRID exactly as before — only the
      // circle shrinks — so nothing else in the drawing moves. The label width is MEASURED with
      // measureText at the real size, not assumed from a character count, because "15" and "L7A"
      // are not the same width and the widest ref on the axis is what has to fit.
      var TXT = 0.70 * R_GRID, OFF1 = 2.0 * R_GRID, OFF2 = 4.0 * R_GRID, OFFB = 6.0 * R_GRID;
      // ⚠ ONE RADIUS FOR THE WHOLE DRAWING, sized to the widest ref ANYWHERE on it — see R_ONE
      // above. Sizing each axis to its own label was tried first and is wrong: "L3" is 0.77 m wide
      // against "9" at 0.40 m, so the axes came out at 0.42/0.42/0.52 m and the consistency witness
      // correctly reported DIFFER. A drawing has one bubble size; the widest ref sets it.
      var R_BUB = R_ONE, _wMax = _wAll;
      var digits = 6, figW = digits * TXT * 0.62;
      var step = Math.max(1, Math.ceil(figW / minGap));
      var drewFig = 0, drewBub = 0, sum = 0, behindB = 0, behindF = 0;   // §36 W1 ledger: not drawn = behind the camera (plane() null)
      var _pxU = 0, _pxV = 0;    // projected semi-axes of a bubble on this axis, in screen px
      for (var i = 0; i < vals.length; i++) {
        var pB = at(vals[i], OFFB);
        var mB = plane(pB[0], pB[1], pB[2], along.x * R_BUB * 2, along.y * R_BUB * 2, along.z * R_BUB * 2,
                       out.x * R_BUB * 2, out.y * R_BUB * 2, out.z * R_BUB * 2);
        // ⚠ MEASURE THE MARK, do not infer it from the picture. The basis vectors of the plane
        // transform ARE the projected axes of the circle: a bubble of model radius R drawn through
        // them lands as an ellipse whose semi-axes are half their screen lengths. Recording them
        // makes "are the Z bubbles the same size as the ground ones" a question with an answer.
        if (mB && !_pxU) { _pxU = Math.hypot(mB.a, mB.b) / 2; _pxV = Math.hypot(mB.c, mB.d) / 2; }
        if (inkBubble(mB, lab(i), R_BUB, TXT)) { drewBub++; n++; } else behindB++;
        var pA = at(vals[i], OFF1), pC = at(vals[i], OFFB - R_BUB * 1.4);
        seg(P(pA[0], pA[1], pA[2]), P(pC[0], pC[1], pC[2]));           // witness line, rung to bubble
      }
      // ⚠ THE LAST SEGMENT IS OFTEN PARTIAL AND MUST STILL BE TAKEN. The guard was
      // `j + step < length`, which exits before a final stub: MEASURED on Hospital, 8 storey levels
      // at stride 2 ran 0-2, 2-4, 4-6 and never summed 6-7, so the witness reported
      // "Z storeys=31.000m overall=34.000m delta=3.0000 CHAIN MISMATCH". HHS hid it because every
      // stride there was 1. Walk while a segment remains and clamp its far end to the last value.
      for (var j = 0; j < vals.length - 1; j += step) {
        var k2 = Math.min(j + step, vals.length - 1);
        var a1 = at(vals[j], OFF1), b1 = at(vals[k2], OFF1);
        seg(P(a1[0], a1[1], a1[2]), P(b1[0], b1[1], b1[2]));
        var mv = (vals[j] + vals[k2]) / 2, mp = at(mv, OFF1 + TXT * 0.9);
        if (inkText(plane(mp[0], mp[1], mp[2], along.x * 1, along.y * 1, along.z * 1,
                          out.x * 1, out.y * 1, out.z * 1),
                    Math.round((vals[k2] - vals[j]) * 1000).toLocaleString('en-US'), TXT)) { drewFig++; n++; } else behindF++;
        sum += vals[k2] - vals[j];
        if (k2 === vals.length - 1) break;
      }
      var oA = at(vals[0], OFF2), oB = at(vals[vals.length - 1], OFF2);
      var drewOv = seg(P(oA[0], oA[1], oA[2]), P(oB[0], oB[1], oB[2]));
      var om = (vals[0] + vals[vals.length - 1]) / 2, op2 = at(om, OFF2 + TXT * 1.1);
      var ovTxt = lab(0) + ' – ' + lab(vals.length - 1) + '   ' +
                  Math.round((vals[vals.length - 1] - vals[0]) * 1000).toLocaleString('en-US');
      if (inkText(plane(op2[0], op2[1], op2[2], along.x, along.y, along.z, out.x, out.y, out.z), ovTxt, TXT * 1.25)) { n++; }
      if (drewOv) { _ov++; }
      _bub += drewBub; _figs += drewFig;
      return { bubbles: drewBub, figures: drewFig, step: step, sum: sum, R: R_BUB, gap: minGap, pxU: _pxU, pxV: _pxV, fit: R_BUB, wMax: _wMax, behindB: behindB, behindF: behindF };
    }

    // ⚠ THE BUBBLE IS SIZED BY ITS LABEL, AND BY THE WIDEST LABEL ON THE WHOLE DRAWING.
    // USER (2026-09-08): "keep them tight smaller just enough to cover the letters/numerics. Now
    // they are big and overlapping other markings." A circle at the full grid radius is a container
    // built for a module, not for a two-character ref, so it swallowed the lines and figures around
    // it. The text size and the entire ladder stay pinned to the GRID exactly as before — only the
    // circle shrinks — so nothing else in the drawing moves.
    // Widths are MEASURED with measureText at the real size, never assumed from a character count.
    var _txtAll = 0.70 * R_GRID, _wAll = 0;
    (function () {
      var sets = [];
      for (var i = 0; i < _lines.gx.length; i++) sets.push(label(i, false));
      for (var j = 0; j < _lines.gy.length; j++) sets.push(label(j, true));
      for (var k = 0; k < _lvz.length; k++) sets.push(storeyRefFor(_lvz, k));
      ctx.save();
      ctx.font = '400 ' + (_txtAll * UNIT).toFixed(0) + 'px Segoe UI, system-ui, sans-serif';
      for (var s = 0; s < sets.length; s++) _wAll = Math.max(_wAll, ctx.measureText(sets[s]).width / UNIT);
      ctx.restore();
    })();
    // half the widest label's box plus a hair of air, never smaller than the glyph is tall, never
    // larger than the grid radius, and never wider than 0.40 of the tightest gap on any axis
    var _gapMin = Infinity;
    [_lines.gx, _lines.gy, _lvz.map(function (L) { return L.z; })].forEach(function (v) {
      for (var i = 1; i < v.length; i++) _gapMin = Math.min(_gapMin, Math.abs(v[i] - v[i - 1]));
    });
    if (!isFinite(_gapMin) || _gapMin <= 0) _gapMin = B;
    var R_ONE = Math.min(Math.max(_wAll / 2 + 0.20 * _txtAll, 0.60 * _txtAll), R_GRID, 0.40 * _gapMin);

    var rX = axis(_lines.gx, function (i) { return label(i, false); },
                  function (v, o) { return [v, nearY + sgnY * o, z0]; },
                  { x: 1, y: 0, z: 0 }, { x: 0, y: sgnY, z: 0 }, false);
    var rY = axis(_lines.gy, function (i) { return label(i, true); },
                  function (v, o) { return [nearX + sgnX * o, v, z0]; },
                  { x: 0, y: 1, z: 0 }, { x: sgnX, y: 0, z: 0 }, false);
    var rZ = { bubbles: 0, figures: 0, step: 1, sum: 0, R: 0, gap: 0, pxU: 0, pxV: 0, fit: 0, wMax: 0, behindB: 0, behindF: 0 };
    if (_lvz.length > 1) {
      rZ = (_zPlane === 'X-face')
        ? axis(_lvz.map(function (L) { return L.z; }), function (i) { return storeyRefFor(_lvz, i); },
               function (v, o) { return [zNearX, zNearY + sgnZY * o, v]; },
               { x: 0, y: 0, z: 1 }, { x: 0, y: sgnZY, z: 0 }, true)
        : axis(_lvz.map(function (L) { return L.z; }), function (i) { return storeyRefFor(_lvz, i); },
               function (v, o) { return [zNearX + sgnZ * o, farY, v]; },
               { x: 0, y: 0, z: 1 }, { x: sgnZ, y: 0, z: 0 }, true);
    }
    ctx.restore();

    var ovX = _lines.gx[_lines.gx.length - 1] - _lines.gx[0],
        ovY = _lines.gy[_lines.gy.length - 1] - _lines.gy[0],
        ovZ = _lvz.length > 1 ? _lvz[_lvz.length - 1].z - _lvz[0].z : 0;
    if (_chainKey !== 1) {
      _chainKey = 1;
      var ex = Math.abs(rX.sum - ovX), ey = Math.abs(rY.sum - ovY), ez = Math.abs(rZ.sum - ovZ);
      console.log('§FLYTHRU_DATUM_CHAIN X bays=' + rX.sum.toFixed(3) + 'm overall=' + ovX.toFixed(3) +
        'm delta=' + ex.toFixed(4) + ' | Y bays=' + rY.sum.toFixed(3) + 'm overall=' + ovY.toFixed(3) +
        'm delta=' + ey.toFixed(4) + ' | Z storeys=' + rZ.sum.toFixed(3) + 'm overall=' + ovZ.toFixed(3) +
        'm delta=' + ez.toFixed(4) + ' -> ' + ((ex < 0.001 && ey < 0.001 && ez < 0.001) ? 'CHAIN ADDS UP' : 'CHAIN MISMATCH'));
    }
    // ⚠ CONSISTENCY IS ASSERTED IN THE NUMBERS, NEVER JUDGED FROM THE PICTURE (user, 2026-09-08:
    // "Consistent has to be on paper ie in the maths not relying merely on visual to judge").
    // Two separate claims, and they must not be confused: the marks are the SAME SIZE IN THE MODEL
    // (that is a property of the drawing), and they PROJECT to different screen sizes (that is a
    // property of the camera). Both are printed, so neither has to be taken on trust.
    var _rs = [rX.R, rY.R, rZ.R].filter(function (v) { return v > 0; });
    var _rMax = Math.max.apply(null, _rs), _rMin = Math.min.apply(null, _rs);
    var _same = _rs.length < 2 || (_rMax - _rMin) <= 0.005;
    console.log('§FLYTHRU_DATUM_CONSISTENCY modelRadius X/Y/Z = ' +
      rX.R.toFixed(3) + '/' + rY.R.toFixed(3) + '/' + rZ.R.toFixed(3) + 'm -> ' +
      (_same ? 'IDENTICAL' : 'DIFFER by ' + (_rMax - _rMin).toFixed(3) + 'm — UNEXPECTED, one radius is now used for the whole drawing') +
      ' | projected semi-axes px X ' + rX.pxU.toFixed(1) + 'x' + rX.pxV.toFixed(1) +
      ', Y ' + rY.pxU.toFixed(1) + 'x' + rY.pxV.toFixed(1) +
      ', Z ' + rZ.pxU.toFixed(1) + 'x' + rZ.pxV.toFixed(1) +
      ' — a flat ratio means that plane is edge-on to the camera, which is the CAMERA, not the drawing');
    // §33 §CLI_BAKE_OPENING — the counts as numbers, so a caller can ask "is the whole drawing in frame from
    // here?" without parsing this log line. The datum is the owner of that question.
    var _dDrawn = (_lastDrawn == null) ? null : n - _lastDrawn;
    A._flythruDatumLast = { drawn: n, bubbles: _bub, bubblesTotal: _lines.gx.length + _lines.gy.length + _lvz.length,
                            figures: _figs, overalls: _ov, filmSec: filmSec, dDrawn: _dDrawn, sidesChanged: _sidesChanged,
                            sidesKey: _sides.key, sidesNowKey: sidesNow.key, decidedAt: _sides.decidedAt,
                            behind: { bubbles: [rX.behindB, rY.behindB, rZ.behindB], figures: [rX.behindF, rY.behindF, rZ.behindF] }, enteredAt: _enteredAt, op: op, life: (_life2Started != null && filmSec >= _life2Started ? 2 : 1) };
    _lastDrawn = n;
    console.log('§FLYTHRU_DATUM_MARKS ' + (n ? 'drawn=' + n : 'NOTHING drawn=0') + ' filmSec=' + filmSec.toFixed(2) +
      ' IN-PLANE (no screen-space sizing, no register, no ranks, no clamping)' +
      ' sizedFromGrid(bubbleR = 0.153 x medianBay, the ratio read off the accepted HHS frame)' +
      ' medianBay=' + B.toFixed(2) + 'm gridR=' + R_GRID.toFixed(2) + 'm' +
      // ⚠ REPORT THE SHRINK. A bubble capped far below the grid's nominal size still counts as
      // "drawn" while being invisible — MEASURED on Terminal, the Z refs land at 0.16 m against a
      // 1.21 m nominal, 13%, and cannot be read at any viewing distance. Counting an invisible mark
      // as drawn is the vacuous witness PRIMAL LAW §4 forbids, so the ratio is stated per axis. When
      // it is small the cause is upstream: refs packed far tighter than the grid they belong to.
      ' perAxisR=' + rX.R.toFixed(2) + '/' + rY.R.toFixed(2) + '/' + rZ.R.toFixed(2) + 'm' +
      ' widestRef=' + rX.wMax.toFixed(2) + '/' + rY.wMax.toFixed(2) + '/' + rZ.wMax.toFixed(2) + 'm' +
      ' fitR=' + rX.fit.toFixed(2) + '/' + rY.fit.toFixed(2) + '/' + rZ.fit.toFixed(2) + 'm' +
      ' ofNominal=' + [rX, rY, rZ].map(function (r) { return R_GRID > 0 ? Math.round(r.R / R_GRID * 100) + '%' : '-'; }).join('/') +
      ' minGap=' + rX.gap.toFixed(2) + '/' + rY.gap.toFixed(2) + '/' + rZ.gap.toFixed(2) + 'm' +
      ' bubbles=' + _bub + '/' + (_lines.gx.length + _lines.gy.length + _lvz.length) +
      ' figures=' + _figs + ' overalls=' + _ov + '/3' +
      ' figStride=' + rX.step + '/' + rY.step + '/' + rZ.step +
      ' sides=(numerals Y@' + nearY.toFixed(1) + ' near, letters X@' + nearX.toFixed(1) + ' near, levels X@' + zNearX.toFixed(1) +
      ' back on the ' + _zPlane + ', faceOn Y ' + _fY.toFixed(2) + ' vs X ' + _fX.toFixed(2) + ')' +
      // §36 W1 — the drop ledger and the frame delta the reviewer asked for: what was NOT drawn and why,
      // how the count moved since the last frame, and whether a per-frame decision WOULD have flipped.
      ' dropped=[behindCam bubbles X/Y/Z=' + rX.behindB + '/' + rY.behindB + '/' + rZ.behindB +
      ' figures=' + rX.behindF + '/' + rY.behindF + '/' + rZ.behindF + '] dDrawn=' + (_dDrawn == null ? 'first' : (_dDrawn >= 0 ? '+' : '') + _dDrawn) +
      ' sidesChanged=' + (_sidesChanged ? 1 : 0) + ' decidedAt=' + _sides.decidedAt.toFixed(2) + 's life=' + (_life2Started != null && filmSec >= _life2Started ? 2 : 1));
    return n;
  };

  // §27.5.3 — the figures this drawing PRINTS, for the datum-restatement guard: storey heights (consecutive level
  // rules > 1 m apart), the three overalls, and every bay of the ground grid. Read from the build, never re-derived.
  A.flythruDatumFigures = function () {
    if (!_lines) return null;
    var lv = (_lines.levels || []).map(function (L) { return L.z; }).sort(function (a, b) { return a - b; });
    var storeys = [], bays = [], i;
    for (i = 1; i < lv.length; i++) if (lv[i] - lv[i - 1] > 1.0) storeys.push(lv[i] - lv[i - 1]);
    for (i = 1; i < _lines.gx.length; i++) bays.push(_lines.gx[i] - _lines.gx[i - 1]);
    for (i = 1; i < _lines.gy.length; i++) bays.push(_lines.gy[i] - _lines.gy[i - 1]);
    var ov = [];
    if (_lines.gx.length > 1) ov.push(_lines.gx[_lines.gx.length - 1] - _lines.gx[0]);
    if (_lines.gy.length > 1) ov.push(_lines.gy[_lines.gy.length - 1] - _lines.gy[0]);
    if (lv.length > 1) ov.push(lv[lv.length - 1] - lv[0]);
    var named = (_lines.levels || []).slice().sort(function (a, b) { return a.z - b.z; });
    return { storeys: storeys, bays: bays, overalls: ov, levels: lv, levelNames: named.map(function (L) { return String(L.name || ''); }) };
  };
  A.flythruDatumDispose = function () {
    if (_grp && A.scene) { A.scene.remove(_grp); _grp.children.forEach(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    // §36 W1/W3 — a dispose is a full reset, so the §33 gate can rebuild the datum at the opening it actually
    // chose (ribbon width and side decisions both read the camera at build/first composite).
    _grp = null; _built = false; _info = null; _faces = null; _lines = null; _sides = null; _camFar = null; _lastDrawn = null; _enteredAt = null; _envBox = null; _life2Started = null; _life2LeftAt = null; _life2Logged = false;
  };
  console.log('§FLYTHRU_DATUM_INIT wired (ground grid + ONE upright with storey rules; depth-tested, occluded by the build)');
}
if (typeof window !== 'undefined') window.setupCpeFlythruDatum = setupCpeFlythruDatum;
