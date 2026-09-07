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
  // The user's storyboard order: envelope, then a storey, then "a room shine thru while traversing
  // the corridor", then the corridor measured length-wise. Room BEFORE corridor is theirs, not a
  // convenience — and it matters, because each cue may only take a window after the previous one.
  var ORDER = ['envelope', 'storey', 'room', 'corridor'];

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


  // DB (IFC, Z-up) extents -> scene Box3, via A.ifc2three — the relation's OWNER (scene.js:499),
  // exact and established at load from A.modelOffset. Both corners are converted and then re-min/maxed,
  // because the axis swap sends iy -> -z and so exchanges which corner is the minimum.
  function dbExtToSceneBox(e) {
    var T = window.THREE;
    if (!e || !T || typeof A.ifc2three !== 'function') return null;
    var a = A.ifc2three(e.minx, e.miny, e.minz), b = A.ifc2three(e.maxx, e.maxy, e.maxz);
    return new T.Box3(new T.Vector3(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z)),
                      new T.Vector3(Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z)));
  }

  // Rooms. PREFER A.allRoomVolumes (cached, and it carries the shipped `category` classifier), but
  // navigate_find.js is LAZY-LOADED (main.js:137) so in a headless bake its init() never runs and the
  // handle is absent — MEASURED: rooms=false on the first placement probe. Fall back to the same
  // query it makes, converted through the same owner transform. Never a third convention.
  function roomRects() {
    var T = window.THREE;
    if (typeof A.allRoomVolumes === 'function') {
      var v = A.allRoomVolumes() || [];
      if (v.length) return { src: 'allRoomVolumes', rects: v };
    }
    if (!A.dbQuery || !T || typeof A.ifc2three !== 'function') return { src: 'none', rects: [] };
    try {
      var rows = A.dbQuery("SELECT guid,name,center_x,center_y,center_z,size_x,size_y,size_z,room_guid " +
                           "FROM spatial_structure WHERE type='IfcSpace' AND center_x IS NOT NULL AND size_x IS NOT NULL") || [];
      var out = [], i, r, c;
      for (i = 0; i < rows.length; i++) {
        r = rows[i]; c = A.ifc2three(r[2], r[3], r[4]);
        out.push({ guid: r[8] || r[0], name: r[1], category: null,
                   center: new T.Vector3(c.x, c.y, c.z),
                   size: new T.Vector3(r[5], r[7], r[6]) });   // IFC sx,sy,sz -> scene x,y,z (z-up swap)
      }
      return { src: 'spatial_structure', rects: out };
    } catch (e) { return { src: 'error:' + (e && e.message), rects: [] }; }
  }

  function n0(v) { return Math.round(v).toLocaleString('en-US'); }
  function n2(v) { return (Math.round(v * 100) / 100).toFixed(2); }

  // ── numbers from the DB (the two primitives) ────────────────────────────────────────────────────
  // FlythruMaths/StoreyRaster are plain script globals (common/*.js, UMD). If either is missing the
  // cue DEGRADES to its extents-only label rather than inventing an area — §12, never fabricate.
  function dbMeasures() {
    var out = { ground: null, storeys: {}, ext: null };
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
      out.ext = FM.ftExtents(all);
      for (k in byS) if (byS.hasOwnProperty(k) && k !== 'Unknown')
        out.storeys[k] = { gross: FM.ftRasterArea(FM.ftRasterizeBoxes(byS[k], FM.RES)),
                           ext: FM.ftExtents(byS[k]) };
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
    if (!T || typeof A.ifc2three !== 'function') { console.log('§FLYTHRU_CUES INCONCLUSIVE — no THREE / no A.ifc2three (scene.js owns the DB->scene relation)'); return _cues; }
    var t0 = (window.performance && performance.now) ? performance.now() : 0;
    var meas = dbMeasures();

    // B1 ENVELOPE — extents from the DB (all 64,150 elements), box through the owner transform.
    // NOT a mesh-filter union: filtering on userData.storey silently dropped the 10,192 elements whose
    // storey is 'Unknown' and understated the building 115.75 -> 102.03 m (MEASURED, first probe).
    var envBox = dbExtToSceneBox(meas.ext);
    if (envBox && meas.ext) {
      var e = meas.ext;
      _cues.push({ key: 'envelope', box: envBox,
        label: 'Building Envelope — ' + n2(e.sx) + ' × ' + n2(e.sy) + ' × ' + n2(e.sz) + ' m' +
               (meas.ground ? '  ·  Ground ' + n0(meas.ground) + ' m²' : ''),
        // X/Y/Z are spans -> arrowed lines. Ground area and volume are SCALARS with no span to
        // arrow (§20.11), so they go in the panel.
        spanAxes: ['x', 'z', 'y'], title: 'Building Envelope',
        dims: meas.ground ? ['Ground  ' + n0(meas.ground) + ' m²',
                             'Envelope  ' + n0(meas.ground * e.sz) + ' m³'] : [] });
    } else { console.log('§FLYTHRU_CUE_DROP envelope — no DB extents or no A.ifc2three'); }

    // B2 STOREY — the storey with the largest WALKABLE area (derived, never hardcoded; §12).
    var bestS = null, sk;
    for (sk in meas.storeys) if (meas.storeys.hasOwnProperty(sk)) {
      var m = meas.storeys[sk];
      if (m.walk != null && (!bestS || m.walk > meas.storeys[bestS].walk)) bestS = sk;
    }
    if (bestS) {
      var sm = meas.storeys[bestS], sBox = dbExtToSceneBox(sm.ext);
      if (sBox) _cues.push({ key: 'storey', box: sBox,
        label: bestS + ' — Floor ' + n0(sm.gross) + ' m²  ·  Walkable ' + n0(sm.walk) + ' m²',
        spanAxes: ['x', 'z'], title: bestS,
        dims: ['Floor  ' + n0(sm.gross) + ' m²', 'Walkable  ' + n0(sm.walk) + ' m²'] });
    }

    // B4/B5 — rooms already arrive in THREE units and already carry a category (navigate_find.js).
    // A logical room is the UNION of its sub-rects, so group by guid before measuring (§5).
    var rr0 = roomRects(), vols = rr0.rects;
    console.log('§FLYTHRU_CUES_ROOMS src=' + rr0.src + ' rects=' + vols.length +
      (vols.length ? '' : ' — VACUOUS: corridor+room cues dropped'));
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
    if (corr.length) _cues.push({ key: 'corridor', opts: corr.map(function (r) {
      var rs = r.box.getSize(new T.Vector3());
      var cs = r.box.getSize(new T.Vector3());
      return { box: r.box.clone(), guid: r.guid,
               label: 'Corridor — ' + n2(r.long) + ' m long  ·  ' + n2(r.short) + ' m wide',
               spanAxes: [cs.x >= cs.z ? 'x' : 'z'], dims: [] };
    }) });

    // The room cue: biggest genuine room that is NOT the corridor pick. 9 m² is the floor below which
    // a compiled rect is a closet, not a room (§11 measured: 0.75 m² and 3.75 m² rects exist).
    var habs = rooms.filter(function (r) { return r.aspect < 3 && r.area >= 9; });
    habs.sort(function (a, b) { return b.area - a.area; });
    if (habs.length) {
      _cues.push({ key: 'room', opts: habs.map(function (r) {
        var hs = r.box.getSize(new T.Vector3());
        return { box: r.box.clone(), guid: r.guid,
                 label: 'Room — ' + n0(r.area) + ' m²  ·  ' + n2(hs.x) + ' × ' + n2(hs.z) + ' m',
                 spanAxes: [], title: 'Room',
                 dims: [n2(hs.x) + ' × ' + n2(hs.z) + ' m', 'Area  ' + n0(r.area) + ' m²',
                        'Volume  ' + n0(r.area * hs.y) + ' m³'] };
      }) });
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
        // §12/§15 — HUNT for the clear-sighted chance rather than assuming the biggest subject is the
        // visible one. Every candidate of this class is tested in preference order and the FIRST with a
        // legal window wins. MEASURED why: picking the largest room gave windows=0 (never faced on this
        // path) and dropped the cue entirely, while smaller rooms were in clear view.
        var opts = d.opts || [{ box: d.box, label: d.label }];
        var pick = null, seen = []; start = null;
        for (var oj = 0; oj < opts.length && !pick; oj++) {
          var ob = opts[oj].box, bs = ob.getSize(new T.Vector3()), ctr = ob.getCenter(new T.Vector3());
          var spanM = Math.max(bs.x, bs.z);
          wins = A.flythruPathWindows(path, ctr, spanM, { minHoldSec: SPAN }) || [];
          seen.push(spanM.toFixed(1) + 'm:' + wins.length + 'w' +
            (wins.length ? '@' + wins.map(function (q) { return q.startSec.toFixed(0) + '-' + q.endSec.toFixed(0); }).join('/') : ''));
          for (var wi = 0; wi < wins.length; wi++) {
            w = wins[wi];
            var s0 = Math.max(w.startSec, endPrev + SLOT.gap);
            if (w.endSec - s0 >= SPAN) { pick = opts[oj]; start = s0; pick._span = spanM; pick._wins = wins.length; break; }
          }
        }
        if (!pick) {
          console.log('§FLYTHRU_CUE_DROP ' + d.key + ' — none of ' + opts.length +
                      ' candidate(s) has a window >= ' + SPAN + 's in range+facing after ' +
                      (endPrev > -Infinity ? endPrev.toFixed(2) + 's' : 'film start') + ' — [' + seen.join(' | ') + ']');
          continue;
        }
        d.box = pick.box; d.label = pick.label; d.at = start;
        d.spanAxes = pick.spanAxes || d.spanAxes || []; d.dims = pick.dims || d.dims || []; d.title = pick.title || d.title; kept.push(d); endPrev = start + SPAN;
        console.log('§FLYTHRU_CUE_PLACE ' + d.key + ' at=' + start.toFixed(2) + 's cand=' + opts.length +
                    ' span=' + pick._span.toFixed(1) + 'm windows=' + pick._wins +
                    ' dMax=' + (A.flythruMaxDist ? A.flythruMaxDist(pick._span).toFixed(0) : '?') + 'm "' + pick.label + '"');
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


  // ⚠ NEVER CALL A.markDirty() FROM HERE. MEASURED 2026-09-07: a per-frame markDirty while a cue was
  // up stalled a bake dead at frame 12/294 — the log shows `§STILL_REFINE cancelled (interaction)` and
  // `§PHOTO_AO off (cancelled (interaction))` repeating forever, because markDirty is read as USER
  // INTERACTION and tears down the refine/AO passes the bake is waiting on, which then restart and are
  // cancelled again. cinema_maxq drives rendering itself during a bake, so the call buys nothing.
  // The convention is already unanimous: cpe_storey_reveal.js and clash_film.js call it ZERO times.
  A.flythruCuesApplyVisual = function (filmSec) {
    var T = window.THREE;
    if (!T || !A.scene) return null;
    var a = (filmSec == null) ? null : activeAt(filmSec);
    var grp = ensureGroup();
    if (!grp) return null;
    if (!a) { if (grp.visible) grp.visible = false; return null; }
    var c = a.cue.box.getCenter(new T.Vector3()), s = a.cue.box.getSize(new T.Vector3());
    grp.position.copy(c);
    grp.scale.set(Math.max(s.x, 0.01), Math.max(s.y, 0.01), Math.max(s.z, 0.01));
    grp.visible = true;
    grp.children[0].material.opacity = 0.13 * a.opacity;   // §7: a tint, not a curtain
    grp.children[1].material.opacity = 0.95 * a.opacity;
    return { key: a.cue.key, opacity: a.opacity };
  };


  // ══ §FLYTHRU_DIM_CUE — THE MARKING. Composited onto the bake's 2D pass, never the WebGL canvas ══
  // Ported from probe_flythru_dims_still.js:197-222, which the user accepted visually. That geometry
  // only ever lived in a probe; shipping a plain box + caption instead is what made the first preview
  // "a bad job" (user, 2026-09-07).
  //
  // §20.11 — FORM FOLLOWS HOW MANY NUMBERS THERE ARE, not taste:
  //   a SINGLE number  -> one arrowed dimension line, which points at what it measured
  //   a SET of numbers -> one panel; five strings round a room is clutter, and a SCALAR (area,
  //                       volume) has no span to arrow in the first place.
  // Ink is §7's: yellow on dark. Pixel constants scale with height so a 1440p frame is not hairline.
  var EXT = 13, AR = 11, ARW = 4.5, FS = 15;

  function proj(v, cam, w, h) {
    var p = v.clone().project(cam);
    return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h, z: p.z };
  }
  // The three box edges NEAREST the camera, so the triad reads as an orthogonal corner instead of
  // crossing the model. Each is [a,b] in world space plus the axis it measures.
  function edgeSpans(box, cam) {
    var T = window.THREE, mn = box.min, mx = box.max, c = cam.position;
    var xz = (c.z > (mn.z + mx.z) / 2) ? mx.z : mn.z, zx = (c.x > (mn.x + mx.x) / 2) ? mx.x : mn.x;
    return [
      { axis: 'x', m: mx.x - mn.x, a: new T.Vector3(mn.x, mn.y, xz), b: new T.Vector3(mx.x, mn.y, xz) },
      { axis: 'z', m: mx.z - mn.z, a: new T.Vector3(zx, mn.y, mn.z), b: new T.Vector3(zx, mn.y, mx.z) },
      { axis: 'y', m: mx.y - mn.y, a: new T.Vector3(zx, mn.y, xz), b: new T.Vector3(zx, mx.y, xz) }
    ];
  }

  function drawDim(ctx, A2, B2, metres, ink, k) {
    var dx = B2.x - A2.x, dy = B2.y - A2.y, L = Math.hypot(dx, dy);
    if (L < 24 * k) return false;                        // too short to read — decline, don't scribble
    var ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    var ext = EXT * k, ar = AR * k, arw = ARW * k, fs = FS * k;
    ctx.save();
    ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 1.6 * k;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var line = function (x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    line(A2.x + nx * ext, A2.y + ny * ext, A2.x - nx * ext, A2.y - ny * ext);   // witness line
    line(B2.x + nx * ext, B2.y + ny * ext, B2.x - nx * ext, B2.y - ny * ext);
    var mm = Math.round(metres * 1000).toLocaleString('en-US') + ' mm';
    ctx.font = '700 ' + fs.toFixed(0) + 'px Segoe UI, system-ui, sans-serif';
    var tw = ctx.measureText(mm).width + 14 * k, th = 21 * k, gap = tw / 2 + 6 * k;
    var mx2 = (A2.x + B2.x) / 2, my2 = (A2.y + B2.y) / 2;
    if (L > tw + 24 * k) {                               // value BREAKS the line at its midpoint
      line(A2.x, A2.y, mx2 - ux * gap, my2 - uy * gap);
      line(mx2 + ux * gap, my2 + uy * gap, B2.x, B2.y);
    } else line(A2.x, A2.y, B2.x, B2.y);
    var tri = function (px, py, s) {                     // arrow heads turned INWARD
      ctx.beginPath(); ctx.moveTo(px, py);
      ctx.lineTo(px + s * ux * ar + nx * arw, py + s * uy * ar + ny * arw);
      ctx.lineTo(px + s * ux * ar - nx * arw, py + s * uy * ar - ny * arw);
      ctx.closePath(); ctx.fill();
    };
    tri(A2.x, A2.y, 1); tri(B2.x, B2.y, -1);
    // ⚠ NO BOX ROUND A DIMENSION VALUE. Drafting breaks the line and sets the number in the gap —
    // that is the whole convention. The "outlined box" ruling was about the PANEL (a container for a
    // SET of numbers), and applying it to every individual value put a rectangle round every figure.
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3 * k; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(mm, mx2, my2); ctx.fillText(mm, mx2, my2);   // opposite-colour halo, §7
    ctx.restore();
    return true;
  }

  function drawPanel(ctx, anchor2, rows, title, ink, k, w, h) {
    var fs = FS * k, pad = 9 * k, rowH = 20 * k;
    ctx.save();
    ctx.font = '700 ' + fs.toFixed(0) + 'px Segoe UI, system-ui, sans-serif';
    var tw = ctx.measureText(title).width;
    rows.forEach(function (r) { tw = Math.max(tw, ctx.measureText(r).width); });
    var pw = tw + pad * 2, ph = rowH * (rows.length + 1) + pad * 2;
    // Keep it on screen and off the anchor itself
    var px = Math.min(Math.max(anchor2.x + 26 * k, 6), w - pw - 6);
    var py = Math.min(Math.max(anchor2.y - ph / 2, 6), h - ph - 6);
    ctx.strokeStyle = ink; ctx.lineWidth = 1.4 * k;
    ctx.fillStyle = 'rgba(10,14,20,0.62)';               // §20.11: a PLATE is allowed for a panel
    ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(anchor2.x, anchor2.y);   // leader
    ctx.lineTo(px, py + ph / 2); ctx.stroke();
    ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(title, px + pad, py + pad + rowH / 2);
    ctx.font = (fs * 0.92).toFixed(0) + 'px Segoe UI, system-ui, sans-serif';
    rows.forEach(function (r, i) { ctx.fillText(r, px + pad, py + pad + rowH * (i + 1.5)); });
    ctx.restore();
  }

  // Called by cinema_maxq's _captureFrame chain and by scripts/snap_timeline.js.
  A.flythruCuesCompositeOntoCanvas = function (ctx, w, h, filmSec) {
    var T = window.THREE, cam = A.camera;
    if (!T || !cam || !ctx) return 0;
    var a = activeAt(filmSec);
    if (!a) { console.log('§FLYTHRU_DIM_DRAW INACTIVE filmSec=' + filmSec.toFixed(2) +
      ' cues=' + ((_cues && _cues.length) || 0) +
      ' windows=[' + ((_cues || []).map(function (c) { return c.key + ':' + c.at.toFixed(1) + '-' + (c.at + SPAN).toFixed(1); }).join(' ')) + ']'); return 0; }
    var k = h / 720, ink = '#ffd600', cue = a.cue, drawn = 0, _diag = [];
    ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, a.opacity));
    var spans = edgeSpans(cue.box, cam);
    if (cue.dims && cue.dims.length) {                    // a SET of numbers -> panel (§20.11)
      var c3 = cue.box.getCenter(new T.Vector3()), c2 = proj(c3, cam, w, h);
      if (c2.z < 1) { drawPanel(ctx, c2, cue.dims, cue.title || cue.key, ink, k, w, h); drawn++; }
      else _diag.push('panel:behind(z=' + c2.z.toFixed(2) + ')');
    }
    (cue.spanAxes || []).forEach(function (ax) {          // a SINGLE number -> arrowed line
      var sp = spans.filter(function (q) { return q.axis === ax; })[0];
      if (!sp) return;
      var A2 = proj(sp.a, cam, w, h), B2 = proj(sp.b, cam, w, h);
      if (A2.z >= 1 || B2.z >= 1) { _diag.push(ax + ':behind(z=' + A2.z.toFixed(2) + ',' + B2.z.toFixed(2) + ')'); return; }
      var _L = Math.hypot(B2.x - A2.x, B2.y - A2.y);
      if (drawDim(ctx, A2, B2, sp.m, ink, k)) drawn++; else _diag.push(ax + ':short(L=' + _L.toFixed(0) + 'px)');
    });
    ctx.restore();
    // §4 PRIMAL LAW — a pass that draws nothing must SAY so, with the reason. Silence here cost a
    // three-frame run: the function ran, threw nothing, returned 0, and looked like success.
    if (!drawn) console.log('§FLYTHRU_DIM_DRAW NOTHING key=' + cue.key + ' filmSec=' + filmSec.toFixed(2) +
      ' spanAxes=[' + (cue.spanAxes || []).join(',') + '] panelRows=' + ((cue.dims && cue.dims.length) || 0) +
      ' diag=' + JSON.stringify(_diag));
    if (drawn && _lastDrawKey !== cue.key + '|' + Math.round(filmSec)) {
      _lastDrawKey = cue.key + '|' + Math.round(filmSec);
      console.log('§FLYTHRU_DIM_DRAW key=' + cue.key + ' filmSec=' + filmSec.toFixed(2) +
                  ' marks=' + drawn + ' spans=[' + (cue.spanAxes || []).join(',') + ']' +
                  ' panelRows=' + ((cue.dims && cue.dims.length) || 0));
    }
    return drawn;
  };
  var _lastDrawKey = null;

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
