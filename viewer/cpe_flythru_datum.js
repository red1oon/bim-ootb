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
    // ⚠ MERGE NEAR-DUPLICATES. Hospital records 'Level 2' at BOTH 6.00 and 6.10 — the same floor
    // twice, 100 mm apart. Exact-value dedupe kept both and drew a doubled rule (12 rules for ~8
    // floors). Anything within TOL of an existing level is the same floor.
    var TOL = 0.30, out = [];
    rows.forEach(function (r) {
      var n = String(r[0] || '');
      if (/\s+(Ceiling|TOS)$/i.test(n)) return;                 // pseudo-level, not a floor
      var z = Math.round(Number(r[1]) * 100) / 100;
      for (var i = 0; i < out.length; i++) if (Math.abs(out[i].z - z) <= TOL) return;
      out.push({ name: n, z: z });
    });
    out.sort(function (a, b) { return a.z - b.z; });
    return { src: src, levels: out, rawRows: rows.length };
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

  // ══ BUBBLES + THE TWO-TIER STRING, on the NEAR edges, drawn in the 2D composite pass ═══════════
  // USER: "make the ground 2D markings on the near sides of course unless u dont want anyone to read
  // well". So the PLANE goes AWAY from the camera (occluded by the build) while the ANNOTATION comes
  // TOWARD it (readable). Same camera vector, opposite sign — and that is also how a drawing works:
  // the strings sit on the side you read from, not tucked behind the plan.
  // ⚠ NEAR must be evaluated PER FRAME. The camera moves through the dive, so a side chosen at build
  // time ends up on the wrong edge halfway through.
  //
  // The string is the standard nested pair (user: "u have length between inner lines, then outer"):
  //   TIER 1 — bay, gridline to gridline, nearest the building
  //   TIER 2 — overall, stepped further out
  // The overall MUST equal the sum of the bays; that is the check a drawing is verified by, and it
  // is asserted rather than assumed (§FLYTHRU_DATUM_CHAIN below).
  var INKS = '#ffd600';
  var BUB_R = 11, OFF1 = 34, OFF2 = 74;                 // screen px at 720p, scaled by h/720
  // Standard grid letters omit I (confusable with 1). Practice omits O as well; grid_dims.js's own
  // sequence keeps O, which is why this defines its own rather than importing it.
  var LET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  function label(i, useLetters) { return useLetters ? (LET[i] || ('Z' + i)) : String(i + 1); }

  A.flythruDatumCompositeOntoCanvas = function (ctx, w, h, filmSec, filmSecFull) {
    if (!_lines || !ctx || !A.camera) return 0;
    var T = window.THREE, cam = A.camera, k = h / 720;
    var holdTo = Math.max(6, (filmSecFull || 0) * 0.094);
    var op = filmSec <= holdTo ? 1 : Math.max(0, 1 - (filmSec - holdTo) / 2.0);
    if (op <= 0.01) return 0;
    var ext = _lines.ext, z0 = ext[4];
    var P = function (ix, iy, iz) { var p = A.ifc2three(ix, iy, iz); return new T.Vector3(p.x, p.y, p.z); };
    // ⚠ NDC z > 1 means BEYOND THE FAR PLANE, not behind the camera — and the x/y projection is still
    // correct for anything in front of the lens. Rejecting on z>=1 threw away a valid overall whose
    // far end simply sat past the far plane (MEASURED: declined behind z=0.99,1.23). The real test is
    // VIEW-SPACE depth: in front of the near plane or not.
    var pr = function (v) {
      var vs = v.clone().applyMatrix4(cam.matrixWorldInverse);
      var p = v.clone().project(cam);
      return { x: (p.x * .5 + .5) * w, y: (-p.y * .5 + .5) * h, z: p.z, front: vs.z < -0.1 };
    };
    // NEAR edge per axis, chosen against the camera THIS frame
    // BOTTOM and LEFT of frame — and they need DIFFERENT tests. The bottom edge is the one that
    // projects LOWEST (largest screen y); the left edge is the one that projects LEFTMOST (smallest
    // screen x). Using the y-comparison for both put the letter bubbles on whichever long edge
    // happened to sit lower, not on the left.
    var midX = (ext[0]+ext[1])/2, midY = (ext[2]+ext[3])/2;
    var yA = pr(P(midX, ext[2], z0)), yB = pr(P(midX, ext[3], z0));
    var xA = pr(P(ext[0], midY, z0)), xB = pr(P(ext[1], midY, z0));
    var nearY = (yA.y >= yB.y) ? ext[2] : ext[3];      // bottom of frame -> numerals
    var nearX = (xA.x <= xB.x) ? ext[0] : ext[1];      // left of frame   -> letters
    var n = 0;
    ctx.save(); ctx.globalAlpha = op;
    ctx.lineWidth = 1.3 * k; ctx.font = '700 ' + (13 * k).toFixed(0) + 'px Segoe UI, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // ⚠ NO-SPACE CASE. A sheet is fixed, so a drawing never has this problem; a moving camera does.
    // When the near edge leaves the frame — the camera descends into the building, or the plan fills
    // the view — the bubble's natural position is off-screen. Slide it ALONG ITS OWN GRIDLINE to the
    // frame boundary so it still sits on the line it names; only drop it when the whole line is gone.
    // Report both, because silently losing the bubbles would look like the feature simply stopped.
    function bubble(p2, txt, along) {
      if (!p2.front) { _bubDrop++; return false; }
      var m = (BUB_R + 4) * k, cl = false;
      if (p2.x < m || p2.x > w - m || p2.y < m || p2.y > h - m) {
        if (along && isFinite(along.x) && isFinite(along.y)) {
          var dx = along.x - p2.x, dy = along.y - p2.y, L = Math.hypot(dx, dy);
          if (L > 1) {
            var ux = dx / L, uy = dy / L, t = 0;
            if (p2.x < m && ux > 0) t = Math.max(t, (m - p2.x) / ux);
            if (p2.x > w - m && ux < 0) t = Math.max(t, (w - m - p2.x) / ux);
            if (p2.y < m && uy > 0) t = Math.max(t, (m - p2.y) / uy);
            if (p2.y > h - m && uy < 0) t = Math.max(t, (h - m - p2.y) / uy);
            p2 = { x: p2.x + ux * t, y: p2.y + uy * t, z: p2.z }; cl = true;
          }
        }
        if (p2.x < -m || p2.x > w + m || p2.y < -m || p2.y > h + m) { _bubDrop++; return false; }
        if (cl) _bubClamp++;
      }
      ctx.beginPath(); ctx.arc(p2.x, p2.y, BUB_R * k, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10,14,20,0.72)'; ctx.fill();
      ctx.strokeStyle = '#8899aa'; ctx.stroke();
      ctx.fillStyle = '#dfe6ee'; ctx.fillText(txt, p2.x, p2.y + 0.5 * k);
      return true;
    }
    function dim(a3, b3, metres, tier, refA, refB) {
      var a2 = pr(a3), b2 = pr(b3);
      if (!a2.front || !b2.front) { if (tier === 2) console.log('§FLYTHRU_DATUM_OVERALL declined — an end is BEHIND the camera'); return false; }
      var dx = b2.x - a2.x, dy = b2.y - a2.y, L = Math.hypot(dx, dy);
      // An OVERALL must draw if it can be drawn at all — it is the headline figure. A bay may
      // decline when it would be unreadable, but the total should not vanish because the axis is
      // foreshortened toward the camera. MEASURED: overalls=1/2 at HHS t=0 with a flat 26px floor.
      var floor = (tier === 2) ? 12 * k : 26 * k;
      if (L < floor) { if (tier === 2) console.log('§FLYTHRU_DATUM_OVERALL declined len=' + L.toFixed(0) + 'px floor=' + floor.toFixed(0)); return false; }
      var ux = dx / L, uy = dy / L, nx = -uy, ny = ux, e = (tier === 2 ? OFF2 : OFF1) * k;
      var A2 = { x: a2.x + nx * e, y: a2.y + ny * e }, B2 = { x: b2.x + nx * e, y: b2.y + ny * e };
      ctx.strokeStyle = '#8899aa'; ctx.fillStyle = '#8899aa';
      var ln = function (x1,y1,x2,y2){ ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); };
      // TIER 2 runs bubble-to-bubble: start the witness lines just clear of the bubble so the
      // overall visibly CONNECTS the two end bubbles instead of floating beside them.
      var start = (tier === 2) ? (BUB_R + 3) * k : (e - 8 * k);
      ln(a2.x + nx*start, a2.y + ny*start, A2.x, A2.y);
      ln(b2.x + nx*start, b2.y + ny*start, B2.x, B2.y);
      ctx.font = '700 ' + ((tier === 2 ? 18 : 15) * k).toFixed(0) + 'px Segoe UI, system-ui, sans-serif';
      var txt = Math.round(metres * 1000).toLocaleString('en-US');
      if (tier === 2 && refA != null && refB != null) txt = refA + ' \u2013 ' + refB + '   ' + txt;
      var tw = ctx.measureText(txt).width + 8 * k, gap = tw / 2 + 5 * k;
      var mx = (A2.x + B2.x) / 2, my = (A2.y + B2.y) / 2;
      if (L > tw + 20 * k) { ln(A2.x, A2.y, mx - ux*gap, my - uy*gap); ln(mx + ux*gap, my + uy*gap, B2.x, B2.y); }
      else ln(A2.x, A2.y, B2.x, B2.y);
      var tri = function (px,py,sg){ ctx.beginPath(); ctx.moveTo(px,py);
        ctx.lineTo(px+sg*ux*9*k+nx*3.6*k, py+sg*uy*9*k+ny*3.6*k);
        ctx.lineTo(px+sg*ux*9*k-nx*3.6*k, py+sg*uy*9*k-ny*3.6*k); ctx.closePath(); ctx.fill(); };
      tri(A2.x,A2.y,1); tri(B2.x,B2.y,-1);
      // the number is the point of the string — give it a real halo so it survives any backdrop
      ctx.lineWidth = 4*k; ctx.strokeStyle = 'rgba(8,11,16,0.95)'; ctx.lineJoin = 'round';
      ctx.strokeText(txt, mx, my);
      ctx.fillStyle = (tier === 2) ? '#ffd600' : '#e8eef5';
      ctx.fillText(txt, mx, my);
      ctx.lineWidth = 1.3*k; ctx.strokeStyle = '#8899aa';
      ctx.font = '700 ' + (13 * k).toFixed(0) + 'px Segoe UI, system-ui, sans-serif';
      return true;
    }
    // X gridlines -> bubbles on the near Y edge, numerals; bays + overall along that edge
    var farY2 = (nearY === ext[2]) ? ext[3] : ext[2], farX2 = (nearX === ext[0]) ? ext[1] : ext[0];
    _bubClamp = 0; _bubDrop = 0;
    _lines.gx.forEach(function (x, i) { if (bubble(pr(P(x, nearY, z0)), label(i, false), pr(P(x, farY2, z0)))) n++; });
    _lines.gy.forEach(function (y, i) { if (bubble(pr(P(nearX, y, z0)), label(i, true), pr(P(farX2, y, z0)))) n++; });
    var sumX = 0, sumY = 0, _bay = 0, _ov = 0;
    for (var i = 0; i < _lines.gx.length - 1; i++) {
      if (dim(P(_lines.gx[i], nearY, z0), P(_lines.gx[i+1], nearY, z0), _lines.gx[i+1]-_lines.gx[i], 1)) { n++; _bay++; }
      sumX += _lines.gx[i+1] - _lines.gx[i];
    }
    for (var j = 0; j < _lines.gy.length - 1; j++) {
      if (dim(P(nearX, _lines.gy[j], z0), P(nearX, _lines.gy[j+1], z0), _lines.gy[j+1]-_lines.gy[j], 1)) { n++; _bay++; }
      sumY += _lines.gy[j+1] - _lines.gy[j];
    }
    // LEVEL TAGS on the upright. USER: the ground has too many lines to name, but "the upright
    // storeys are few and well known, easily given by the DB". A level datum on a drawing reads
    // name + elevation, and the elevation printed is the LOCAL one (Level 2 +6.000), never the
    // 156 m global figure the geometry needs.
    var farY = (nearY === ext[2]) ? ext[3] : ext[2];
    (_lines.levels || []).forEach(function (L) {
      var e2 = pr(P(nearX, farY, L.z));
      if (!e2.front) return;
      var zTxt = (L.zRaw == null ? L.z : L.zRaw);
      var txt = L.name + '   ' + (zTxt >= 0 ? '+' : '') + zTxt.toFixed(3);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = '600 ' + (12 * k).toFixed(0) + 'px Segoe UI, system-ui, sans-serif';
      var tw2 = ctx.measureText(txt).width;
      var bx = e2.x + 8 * k, by = e2.y;
      if (bx + tw2 + 10 * k > w) bx = e2.x - tw2 - 14 * k;      // keep it on screen
      ctx.strokeStyle = INKS; ctx.lineWidth = 1.1 * k;
      ctx.beginPath(); ctx.moveTo(e2.x, e2.y); ctx.lineTo(bx - 4 * k, by); ctx.stroke();
      ctx.fillStyle = 'rgba(10,14,20,0.72)';
      ctx.fillRect(bx - 4 * k, by - 9 * k, tw2 + 8 * k, 18 * k);
      ctx.strokeRect(bx - 4 * k, by - 9 * k, tw2 + 8 * k, 18 * k);
      ctx.fillStyle = INKS; ctx.fillText(txt, bx, by + 0.5 * k);
      n++;
    });
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 ' + (13 * k).toFixed(0) + 'px Segoe UI, system-ui, sans-serif';
    var ovX = _lines.gx[_lines.gx.length-1] - _lines.gx[0], ovY = _lines.gy[_lines.gy.length-1] - _lines.gy[0];
    if (dim(P(_lines.gx[0], nearY, z0), P(_lines.gx[_lines.gx.length-1], nearY, z0), ovX, 2,
            label(0, false), label(_lines.gx.length - 1, false))) { n++; _ov++; }
    if (dim(P(nearX, _lines.gy[0], z0), P(nearX, _lines.gy[_lines.gy.length-1], z0), ovY, 2,
            label(0, true), label(_lines.gy.length - 1, true))) { n++; _ov++; }
    ctx.restore();
    if (_chainKey !== 1) {           // assert the chain ONCE: the overall must equal the sum of bays
      _chainKey = 1;
      var ex = Math.abs(sumX - ovX), ey = Math.abs(sumY - ovY);
      console.log('§FLYTHRU_DATUM_CHAIN X bays=' + sumX.toFixed(3) + 'm overall=' + ovX.toFixed(3) +
        'm delta=' + ex.toFixed(4) + ' | Y bays=' + sumY.toFixed(3) + 'm overall=' + ovY.toFixed(3) +
        'm delta=' + ey.toFixed(4) + ' -> ' + ((ex < 0.001 && ey < 0.001) ? 'CHAIN ADDS UP' : 'CHAIN MISMATCH'));
    }
    if (n) console.log('§FLYTHRU_DATUM_MARKS drawn=' + n + ' filmSec=' + filmSec.toFixed(2) +
      ' bays=' + _bay + '/' + (_lines.gx.length-1+_lines.gy.length-1) + ' overalls=' + _ov + '/2 bubblesClamped=' + _bubClamp + ' bubblesDropped=' + _bubDrop + ' levelTags=' + ((_lines.levels||[]).length) + ' edges=(bottomY@' + nearY.toFixed(1) + ', leftX@' + nearX.toFixed(1) + ') nearEdge=(x@' + nearX.toFixed(1) + ', y@' + nearY.toFixed(1) + ')');
    return n;
  };
  var _chainKey = 0, _bubClamp = 0, _bubDrop = 0;

  A.flythruDatumDispose = function () { if (_grp && A.scene) { A.scene.remove(_grp); _grp.children.forEach(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); _grp = null; } };
  console.log('§FLYTHRU_DATUM_INIT wired (ground grid + ONE upright with storey rules; depth-tested, occluded by the build)');
}
if (typeof window !== 'undefined') window.setupCpeFlythruDatum = setupCpeFlythruDatum;
