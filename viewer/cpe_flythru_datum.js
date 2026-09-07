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
  var INK = 0x8899aa, INK_STOREY = 0xffd600, MIN_SEP = 6.0;
  var _grp = null, _built = false, _info = null;

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
    var seen = {}, out = [];
    rows.forEach(function (r) {
      var n = String(r[0] || '');
      if (/\s+(Ceiling|TOS)$/i.test(n)) return;                 // pseudo-level, not a floor
      var z = Math.round(Number(r[1]) * 100) / 100;
      if (seen[z]) return;
      seen[z] = 1; out.push({ name: n, z: z });
    });
    return { src: src, levels: out };
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
    var yBack = ext[3];
    gx.forEach(function (x) { g.push(P(x, yBack, ext[4]), P(x, yBack, ext[5])); });
    st.levels.forEach(function (L) { s.push(P(ext[0], yBack, L.z), P(ext[1], yBack, L.z)); });
    var mk = function (pts, m) { var gm = new T.BufferGeometry().setFromPoints(pts); var o = new T.LineSegments(gm, m); o.renderOrder = 1; return o; };
    if (g.length) _grp.add(mk(g, mat));
    if (s.length) _grp.add(mk(s, matS));
    _grp.visible = false;
    A.scene.add(_grp);
    _info = { gridX: gx.length, gridY: gy.length, storeys: st.levels.length, storeySrc: st.src, columns: cols.length,
              bayMedianM: (function () { var b = []; for (var i = 0; i < gx.length - 1; i++) b.push(gx[i + 1] - gx[i]); b.sort(function (p, q2) { return p - q2; }); return b.length ? +b[b.length >> 1].toFixed(2) : 0; })() };
    console.log('§FLYTHRU_DATUM_BUILT columns=' + cols.length + ' groundGrid=' + gx.length + 'x' + gy.length +
      ' medianBay=' + _info.bayMedianM + 'm upright=1(plane) storeyRules=' + st.levels.length + ' src=' + st.src +
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
    _grp.children.forEach(function (o) { o.material.opacity = (o.material.color.getHex() === INK_STOREY ? 0.75 : 0.5) * op; });
    return op;
  };
  A.flythruDatumDispose = function () { if (_grp && A.scene) { A.scene.remove(_grp); _grp.children.forEach(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); _grp = null; } };
  console.log('§FLYTHRU_DATUM_INIT wired (ground grid + ONE upright with storey rules; depth-tested, occluded by the build)');
}
if (typeof window !== 'undefined') window.setupCpeFlythruDatum = setupCpeFlythruDatum;
