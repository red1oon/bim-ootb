/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * cpe_flythru_cues.js — the BASELINE fly-through measurement cues (B1, B2, B4, B5).
 * Implementing bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §FLYTHRU_DIMENSIONS §11 (candidates),
 * §12 (least effort), §14 (sequence). Witness: W-FLYTHRU-CUES.
 *
 * ── WHY THIS FILE DOES NOT USE flythruFrameMap ────────────────────────────────────────────────────
 * §10.1 blamed the 16,576→12 build-pass collapse on the DB→scene transform. It was right about the
 * transform and wrong about which one to fix: `A.flythruFrameMap` RE-DERIVES, by matching envelope
 * extents, a relation that already has an owner — `A.ifc2three` (scene.js:499), exact, established at
 * load from A.modelOffset. When the extents fail to match within 2% it silently returns IDENTITY, and
 * an identity map on a Y-up scene fed from a Z-up DB misplaces every element while leaving the
 * envelope (whose dMax passes from anywhere) as the lone survivor — exactly the observed signature.
 * So: this file takes GEOMETRY FROM THE SCENE and NUMBERS FROM THE DB, and never converts anything
 * itself. Rooms already arrive in three-space from _allRoomVolumes(); storey meshes are found by
 * userData.storey. Nothing here can be corrupted by a bad frame map because nothing here uses one.
 *
 * ── WHAT IT DRAWS ─────────────────────────────────────────────────────────────────────────────────
 * §14: ONE cue on screen at a time — fade in 0.6s, hold 1.0s, fade out 0.6s, then a 0.5s clear gap.
 * No persistence, no re-sighting (that is §7's rule for an accumulating film; this film says each
 * number once). A cue with no legal slot is DROPPED, never overlapped.
 *
 * ⚠ BASELINE SCOPE — NO MATERIAL MUTATION. §FLYTHRU_MESH_TINT's emissive path (clone-then-tint, the
 * cpe_storey_reveal.js:249 pattern) is deliberately NOT used yet: the storey reveal owns material
 * state during the ending and this lane must not race it. The baseline draws an OUTLINED box plus a
 * translucent shine-through fill — which is also the honest shape for the three subjects that have no
 * mesh at all (envelope, corridor, room; see §FLYTHRU_MESH_TINT "BOX UNION where a mesh does not
 * exist"). Emissive mesh tint lands after this baseline has drawn in a real frame (§3.8).
 */
function setupCpeFlythruCues(A) {
  if (!A) return;

  var INK = 0xffd600;                                        // §7 yellow on dark
  var SLOT = { fadeIn: 0.6, hold: 1.0, fadeOut: 0.6, gap: 0.5 };  // §14, film seconds
  var SPAN = SLOT.fadeIn + SLOT.hold + SLOT.fadeOut;         // 2.2s on screen
  // NARRATIVE ORDER (user, §11). The ORDER is fixed; the SECOND is derived from the real camera
  // path, never hardcoded — the user's own storyboard times proved unsafe to assume (at 22s the
  // camera may be outside with the wing blocks in view rather than in a corridor). §12: no knobs.
  var ORDER = ['envelope', 'storey', 'corridor', 'room'];

  var _cues = null, _group = null, _built = false, _lastKey = null;


  // 300 samples over the film — §9's own sampling rate, cheap here because only a handful of cue
  // centres are tested against it. poseAt is cinema_maxq's owner of camera pose (plan.poseAt); fwd is
  // derived from pose target, never re-derived from the path parameter.
  function samplePath(plan, filmSecFull) {
    if (!plan || typeof plan.poseAt !== 'function' || !A.flythruPathWindows || !(filmSecFull > 0)) return null;
    var N = 300, out = [], i, tn, p, dx, dy, dz, L;
    for (i = 0; i <= N; i++) {
      tn = i / N;
      try { p = plan.poseAt(tn); } catch (e) { return null; }
      if (!p) return null;
      dx = p.tx - p.x; dy = p.ty - p.y; dz = p.tz - p.z;
      L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      out.push({ t: tn * filmSecFull, pos: { x: p.x, y: p.y, z: p.z }, fwd: { x: dx / L, y: dy / L, z: dz / L } });
    }
    return out;
  }

  function n0(v) { return Math.round(v).toLocaleString('en-US'); }
  function n2(v) { return (Math.round(v * 100) / 100).toFixed(2); }

  // ── numbers from the DB (the two primitives) ────────────────────────────────────────────────────
  // FlythruMaths/StoreyRaster are plain script globals (common/*.js, UMD). If either is missing the
  // cue DEGRADES to its extents-only label rather than inventing an area — §12, never fabricate.
  function dbMeasures() {
    var out = { ground: null, storeys: {} };
    var FM = window.FlythruMaths, SR = window.StoreyRaster;
    if (!FM || !A.dbQuery) return out;
    try {
      var rows = A.dbQuery('SELECT t.center_x,t.center_y,t.center_z,t.bbox_x,t.bbox_y,t.bbox_z,m.storey ' +
                           'FROM element_transforms t JOIN elements_meta m ON m.guid=t.guid') || [];
      if (!rows.length) return out;
      var all = [], byS = {}, i, r, b, k;
      for (i = 0; i < rows.length; i++) {
        r = rows[i];
        b = { cx: r[0], cy: r[1], cz: r[2], sx: r[3], sy: r[4], sz: r[5] };
        all.push(b);
        k = String(r[6] || 'Unknown').replace(/\s+(Ceiling|TOS)$/i, '');   // fold pseudo-storeys
        (byS[k] || (byS[k] = [])).push(b);
      }
      out.ground = FM.ftRasterArea(FM.ftRasterizeBoxes(all, FM.RES));
      for (k in byS) if (byS.hasOwnProperty(k) && k !== 'Unknown')
        out.storeys[k] = { gross: FM.ftRasterArea(FM.ftRasterizeBoxes(byS[k], FM.RES)) };
      if (SR) {
        var wr = A.dbQuery('SELECT storey,res,x0,y0,cols,rows,bits FROM storey_walkable_raster') || [];
        for (i = 0; i < wr.length; i++) {
          var R = SR.fromRow(wr[i]);
          if (out.storeys[wr[i][0]]) out.storeys[wr[i][0]].walk = FM.ftRasterArea(R);
        }
      }
    } catch (e) { console.log('§FLYTHRU_CUE_MEASURE_SKIP ' + (e && e.message)); }
    return out;
  }

  // ── build the cue list ONCE (geometry from the scene, numbers from the DB) ──────────────────────
  A.flythruCuesBuild = function (plan, filmSecFull) {
    if (_built) return _cues;
    _built = true; _cues = [];
    var T = window.THREE;
    if (!T || !A.collectMeshes) { console.log('§FLYTHRU_CUES INCONCLUSIVE — no THREE/collectMeshes'); return _cues; }
    var t0 = (window.performance && performance.now) ? performance.now() : 0;
    var meas = dbMeasures();

    // B1 ENVELOPE — scene box of meshes that belong to a storey (excludes ground/sky/helpers).
    var envBox = new T.Box3(), envN = 0;
    A.collectMeshes(function (o) { return o.isMesh && o.userData && o.userData.storey; })
      .forEach(function (o) { envBox.expandByObject(o); envN++; });
    if (envN && !envBox.isEmpty()) {
      var es = envBox.getSize(new T.Vector3());
      _cues.push({ key: 'envelope', box: envBox.clone(),
        label: 'Building Envelope — ' + n2(es.x) + ' × ' + n2(es.z) + ' × ' + n2(es.y) + ' m' +
               (meas.ground ? '  ·  Ground ' + n0(meas.ground) + ' m²' : '') });
    }

    // B2 STOREY — the storey with the largest WALKABLE area (derived, never hardcoded; §12).
    var bestS = null, sk;
    for (sk in meas.storeys) if (meas.storeys.hasOwnProperty(sk)) {
      var m = meas.storeys[sk];
      if (m.walk != null && (!bestS || m.walk > meas.storeys[bestS].walk)) bestS = sk;
    }
    if (bestS) {
      var sBox = new T.Box3(), sN = 0;
      A.collectMeshes(function (o) { return o.isMesh && o.userData && o.userData.storey === bestS; })
        .forEach(function (o) { sBox.expandByObject(o); sN++; });
      if (sN && !sBox.isEmpty()) {
        var sm = meas.storeys[bestS];
        _cues.push({ key: 'storey', box: sBox.clone(),
          label: bestS + ' — Floor ' + n0(sm.gross) + ' m²  ·  Walkable ' + n0(sm.walk) + ' m²' });
      }
    }

    // B4/B5 — rooms already arrive in THREE units and already carry a category (navigate_find.js).
    // A logical room is the UNION of its sub-rects, so group by guid before measuring (§5).
    var vols = (typeof A.allRoomVolumes === 'function') ? (A.allRoomVolumes() || []) : [];
    if (!vols.length) console.log('§FLYTHRU_CUES_ROOMS VACUOUS — allRoomVolumes unavailable or empty; corridor+room cues dropped');
    var byG = {}, j;
    for (j = 0; j < vols.length; j++) {
      var v = vols[j], g = v.guid || ('_' + j);
      if (!byG[g]) byG[g] = { guid: g, name: v.name, category: v.category, box: new T.Box3(), area: 0 };
      byG[g].box.expandByPoint(new T.Vector3(v.center.x - v.size.x / 2, v.center.y - v.size.y / 2, v.center.z - v.size.z / 2));
      byG[g].box.expandByPoint(new T.Vector3(v.center.x + v.size.x / 2, v.center.y + v.size.y / 2, v.center.z + v.size.z / 2));
      byG[g].area += v.size.x * v.size.z;                     // scene: x/z are the floor plane
    }
    var rooms = [];
    for (j in byG) if (byG.hasOwnProperty(j)) {
      var rr = byG[j], rs = rr.box.getSize(new T.Vector3());
      rr.long = Math.max(rs.x, rs.z); rr.short = Math.max(0.01, Math.min(rs.x, rs.z));
      rr.aspect = rr.long / rr.short;
      rooms.push(rr);
    }
    // A corridor is what the shipped classifier says it is; aspect is only the FALLBACK when the
    // building has no corridor labels at all (Hospital's compiled rects are one such case).
    var corr = rooms.filter(function (r) { return r.category === 'corridor'; });
    if (!corr.length) corr = rooms.filter(function (r) { return r.aspect >= 3; });
    corr.sort(function (a, b) { return b.long - a.long; });
    if (corr.length) _cues.push({ key: 'corridor', box: corr[0].box.clone(),
      label: 'Corridor — ' + n2(corr[0].long) + ' m long  ·  ' + n2(corr[0].short) + ' m wide' });

    // The room cue: biggest genuine room that is NOT the corridor pick. 9 m² is the floor below which
    // a compiled rect is a closet, not a room (§11 measured: 0.75 m² and 3.75 m² rects exist).
    var pickC = corr.length ? corr[0].guid : null;
    var habs = rooms.filter(function (r) { return r.guid !== pickC && r.aspect < 3 && r.area >= 9; });
    habs.sort(function (a, b) { return b.area - a.area; });
    if (habs.length) {
      var hs = habs[0].box.getSize(new T.Vector3());
      _cues.push({ key: 'room', box: habs[0].box.clone(),
        label: 'Room — ' + n0(habs[0].area) + ' m²  ·  ' + n2(hs.x) + ' × ' + n2(hs.z) + ' m' });
    } else if (rooms.length) {
      console.log('§FLYTHRU_CUES_ROOM DROPPED — no room >= 9 m2 with aspect < 3 (largest ' +
        n2(Math.max.apply(null, rooms.map(function (r) { return r.area; }))) + ' m2); showing a closet would advertise a weakness');
    }

    // ── PLACEMENT — derived from the REAL camera path, in narrative order, non-overlapping (§14) ──
    // A cue is placed at the earliest legal window in which its own box is in range and facing, at or
    // after the previous cue's slot has cleared. No window => the cue is DROPPED. There is no
    // fallback to a guessed second: inventing a time would put a measurement on screen while its
    // subject is out of frame, which is the defect this whole placement pass exists to prevent.
    var byKey = {}; _cues.forEach(function (c) { byKey[c.key] = c; });
    var path = samplePath(plan, filmSecFull);
    var kept = [], endPrev = -Infinity, oi, d, wins, w, start;
    if (!path) {
      console.log('§FLYTHRU_CUES_PLACE INCONCLUSIVE — no plan.poseAt/flythruPathWindows; ' +
                  _cues.length + ' built cue(s) dropped rather than placed at a guessed second');
      _cues = [];
    } else {
      for (oi = 0; oi < ORDER.length; oi++) {
        d = byKey[ORDER[oi]]; if (!d) continue;
        var bs = d.box.getSize(new T.Vector3()), ctr = d.box.getCenter(new T.Vector3());
        var spanM = Math.max(bs.x, bs.z);
        wins = A.flythruPathWindows(path, ctr, spanM, { minHoldSec: SPAN }) || [];
        start = null;
        for (var wi = 0; wi < wins.length; wi++) {
          w = wins[wi];
          var s0 = Math.max(w.startSec, endPrev + SLOT.gap);
          if (w.endSec - s0 >= SPAN) { start = s0; break; }
        }
        if (start == null) {
          console.log('§FLYTHRU_CUE_DROP ' + d.key + ' — no window >= ' + SPAN + 's in range+facing after ' +
                      (endPrev > -Infinity ? endPrev.toFixed(2) + 's' : 'film start') + ' (windows=' + wins.length + ')');
          continue;
        }
        d.at = start; kept.push(d); endPrev = start + SPAN;
        console.log('§FLYTHRU_CUE_PLACE ' + d.key + ' at=' + start.toFixed(2) + 's span=' + spanM.toFixed(1) +
                    'm windows=' + wins.length + ' dMax=' + (A.flythruMaxDist ? A.flythruMaxDist(spanM).toFixed(0) : '?') + 'm');
      }
      _cues = kept;
    }
    console.log('§FLYTHRU_CUES_BUILT n=' + _cues.length + ' [' + _cues.map(function (c) { return c.key + '@' + c.at + 's'; }).join(', ') +
      '] span=' + SPAN + 's gap=' + SLOT.gap + 's ms=' +
      (((window.performance && performance.now) ? performance.now() : 0) - t0).toFixed(0) +
      (_cues.length ? '' : ' — VACUOUS: no cue had both geometry and a number'));
    return _cues;
  };

  // ── envelope: 0 outside the slot, ramps in/out inside it (§14) ─────────────────────────────────
  function opacityAt(cue, filmSec) {
    var t = filmSec - cue.at;
    if (t < 0 || t > SPAN) return 0;
    if (t < SLOT.fadeIn) return t / SLOT.fadeIn;
    if (t > SLOT.fadeIn + SLOT.hold) return Math.max(0, (SPAN - t) / SLOT.fadeOut);
    return 1;
  }
  function activeAt(filmSec) {
    if (!_cues) return null;
    for (var i = 0; i < _cues.length; i++) { var o = opacityAt(_cues[i], filmSec); if (o > 0) return { cue: _cues[i], opacity: o }; }
    return null;
  }

  // The caption slots into cinema_maxq's existing _titleInfo chain — same {name,opacity} shape as
  // storeyRevealCaptionAt, so no new 2D draw code and no second text layer to collide with.
  A.flythruCueCaptionAt = function (filmSec) {
    var a = activeAt(filmSec);
    if (!a) { _lastKey = null; return null; }
    if (_lastKey !== a.cue.key) {
      _lastKey = a.cue.key;
      console.log('§FLYTHRU_CUE_ON key=' + a.cue.key + ' at=' + a.cue.at.toFixed(2) + 's filmSec=' + filmSec.toFixed(2) + ' "' + a.cue.label + '"');
    }
    return { name: a.cue.label, opacity: a.opacity };
  };

  // ── the 3D layer: outlined box + translucent shine-through fill, both depth-disabled (§7) ───────
  function ensureGroup() {
    var T = window.THREE;
    if (_group || !T || !A.scene) return _group;
    _group = new T.Group(); _group.name = 'flythruCue'; _group.renderOrder = 950;
    var g = new T.BoxGeometry(1, 1, 1);
    var fill = new T.Mesh(g, new T.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0,
      depthTest: false, depthWrite: false, side: T.DoubleSide }));
    fill.renderOrder = 950;
    var line = new T.LineSegments(new T.EdgesGeometry(g), new T.LineBasicMaterial({ color: INK,
      transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    line.renderOrder = 951;
    _group.add(fill); _group.add(line); _group.visible = false;
    A.scene.add(_group);
    return _group;
  }

  A.flythruCuesApplyVisual = function (filmSec) {
    var T = window.THREE;
    if (!T || !A.scene) return null;
    var a = (filmSec == null) ? null : activeAt(filmSec);
    var grp = ensureGroup();
    if (!grp) return null;
    if (!a) { if (grp.visible) { grp.visible = false; if (A.markDirty) A.markDirty(); } return null; }
    var c = a.cue.box.getCenter(new T.Vector3()), s = a.cue.box.getSize(new T.Vector3());
    grp.position.copy(c);
    grp.scale.set(Math.max(s.x, 0.01), Math.max(s.y, 0.01), Math.max(s.z, 0.01));
    grp.visible = true;
    grp.children[0].material.opacity = 0.13 * a.opacity;   // §7: a tint, not a curtain
    grp.children[1].material.opacity = 0.95 * a.opacity;
    if (A.markDirty) A.markDirty();
    return { key: a.cue.key, opacity: a.opacity };
  };

  A.flythruCuesDispose = function () {
    if (_group && A.scene) {
      A.scene.remove(_group);
      _group.children.forEach(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      _group = null;
    }
    _lastKey = null;
  };

  console.log('§FLYTHRU_CUES_INIT wired (baseline B1/B2/B4/B5; scene geometry + DB numbers, no frame map)');
}
if (typeof window !== 'undefined') window.setupCpeFlythruCues = setupCpeFlythruCues;
