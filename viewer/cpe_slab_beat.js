/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * cpe_slab_beat.js — §SLAB_BEAT: mark the floor plate AS IT IS LAID.
 * Implementing bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §26. Witness: W-SLAB-BEAT
 * (viewer/tests/witness_slab_beat.js). Rides the Alt-C Measure checkbox with the datum (§25).
 *
 * USER (2026-09-08): "a 3rd level or above slab is one that stays in the movie longer to mark out as
 * a wing slab and thus show a tint and an X marking out both diagonals with the middle a label box
 * 'X by Y = Area (estimate for [Ifc semantic name])' … This is for the user to note that this BIM
 * picks out arbitrarily rather accurately without AI in the loop." · "have a priority to just do 2 at
 * max during fly in and pick the longest visual potential."
 *
 * ── THE THREE LAYERS (§26.2) ──────────────────────────────────────────────────────────────────────
 *   amber tint on the plate's OWN mesh   WHAT/WHERE   depth-tested — the build laid on top buries it
 *   X across both diagonals of the box   WHAT WAS MEASURED   depth-tested, with the tint
 *   label at the diagonal crossing       HOW BIG      depthTest:false, renderOrder 900 — shines through
 * The label is laid IN THE PLATE'S PLANE (§25.1: ink lives in the model's own planes; nothing faces
 * the viewer), sized to the plate, its reading direction chosen ONCE at build from the camera pose at
 * the pop — never re-decided per frame (§24.10, the datum's own lesson).
 *
 * ── WHEN (§26.4 step 3, and §26.6.3's warning) ─────────────────────────────────────────────────────
 * The PoC (bim-compiler scripts/poc_slab_beat.js) mapped day→second LINEARLY and said so. The bake
 * does not: film fraction → A.buildupTAt (topout remap) → A.buildupCursorAt (even calendar + a 10 s
 * onset blend toward element order) → cursor ms, and an element POPS when its op's end_ts <= cursor
 * (time_machine.js renderAtTime). This file never re-derives that clock: it calls the two OWNERS and
 * inverts them by bisection (§I ownership table, CLAUDE.md §0). The pop second it prints is therefore
 * the second the bake will show — the PoC's 10.31 s is the number this replaces.
 *
 * ── HONESTY DEVICES ───────────────────────────────────────────────────────────────────────────────
 *   "(est.)" is REQUIRED: the area is the bbox product, an upper bound; the two diagonals draw the
 *   rectangle that produced it (§26.3). The semantic name is a SUBSTRING of element_name, never
 *   composed (§26.1). §26.6.2: a pick whose bbox is smaller than its storey's walkable raster cannot
 *   be that storey's floor plate (walkable ⊆ plate ⊆ bbox) — the beat WITHDRAWS and prints the ratio.
 *
 * ── CAN SAY NO (PRIMAL LAW §4) ────────────────────────────────────────────────────────────────────
 *   VACUOUS      no planar IfcSlab in this model
 *   INCONCLUSIVE no THREE / no plan / buildup off (nothing pops) / clock not monotone
 *   NOTHING      drawn=0 — no plate qualifies inside the dive, and it says which rule rejected each
 *   NO-MESH      the tint touched 0 meshes at the pop (not streamed, or not placed) — counted, not hidden
 * Same never-kills-a-bake contract as every overlay beside it: the caller wraps each call.
 */
function setupCpeSlabBeat(A) {
  if (!A) return;

  // §26.4 — every constant below is the spec's own, none is tuned here.
  var CAND_FRAC = 0.25;    // pool: >= this fraction of the building's largest plate
  var CO_FRAC   = 0.10;    // a co-arrival elsewhere >= this share of the host's area FRAGMENTS the frame
  var STACK_FRAC = 0.50;   // plan overlap >= this share of the smaller footprint = one floor, two layers
  var MIN_HOLD  = 2.0;     // user: a candidate must hold > 2 s before the next one
  var MAX_DIVE  = 2;       // user: "2 at max during fly in" — a CEILING
  var TAKE      = 1;       // §1: one cue per capability; the user: "nothing else needs to follow"
  var ENV = { fadeIn: 0.6, hold: 1.0, fadeOut: 0.6 };        // §26.2 (= §14's slot)
  var ENV_SPAN = ENV.fadeIn + ENV.hold + ENV.fadeOut;         // 2.2 s on screen
  var TINT_HEX = 0xffb300;                                     // amber (§26.2)
  var INK = 0xffd600;                                          // §7 yellow — the measurement ink

  var _built = false, _report = null, _beat = null, _grp = null, _label = null, _diag = null;
  var _labelRows = [], _labelTitle = 'Floor plate';   // §40.2 — what the §MEASURE_BOX posts
  var _labelOn = false, _labelOffReason = null;
  var _envDone = false, _labelNeverLogged = false;

  function log(s) { console.log(s); }
  function fmt(n, dp) {
    var s = (+n).toFixed(dp == null ? 0 : dp), p = s.split('.');
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return p.join('.');
  }
  // §26.1 — Revit type strings are `Family:Type:id`; drop the family and the element id. Extracted.
  function semanticName(raw) {
    if (!raw) return null;
    var p = String(raw).split(':');
    if (p.length >= 3) return p.slice(1, p.length - 1).join(':').trim();
    return String(raw).trim();
  }
  // §26.4.5 refined (witness, 2026-09-08): plan overlap alone called Hospital's Level 2 a "stacked layer" of
  // Level 3 — two STOREYS landing 2 s apart overlap 100% in plan. A stacked layer (HHS's STB 30.0 structural
  // + FB 15.0 tile finish) is in VERTICAL CONTACT: the gap between the two plates' centres is no more than
  // their half-thicknesses plus a hair. Two floors 4.87 m apart are not. Extracted from the two plates' own
  // z and thickness — no storey-height constant.
  function verticalContact(a, b) {
    return Math.abs(a.cz - b.cz) <= (a.bz + b.bz) / 2 + 0.05;
  }
  function planOverlap(a, b) {
    var ix = Math.min(a.cx + a.bx / 2, b.cx + b.bx / 2) - Math.max(a.cx - a.bx / 2, b.cx - b.bx / 2);
    var iy = Math.min(a.cy + a.by / 2, b.cy + b.by / 2) - Math.max(a.cy - a.by / 2, b.cy - b.by / 2);
    if (ix <= 0 || iy <= 0) return 0;
    return (ix * iy) / Math.min(a.area, b.area);
  }

  // ── THE CLOCK — owned by cinema_maxq (buildupTAt) + its cursor (buildupCursorAt); inverted here ──
  function makeClock(plan, bk, filmSecFull, cursorTotalSec) {
    var cur = function (u) { return A.buildupCursorAt(A.buildupTAt(u, plan), bk, cursorTotalSec); };
    var N = 64, prev = null, decreases = 0, i;
    for (i = 0; i <= N; i++) { var v = cur(i / N); if (prev != null && v < prev) decreases++; prev = v; }
    return {
      monotone: decreases === 0, decreases: decreases, c0: cur(0), c1: cur(1),
      secOf: function (ms) {              // first film second at which the cursor reaches ms
        if (cur(0) >= ms) return 0;
        if (cur(1) < ms) return null;     // never placed inside this film
        var lo = 0, hi = 1;
        for (var k = 0; k < 40; k++) { var mid = (lo + hi) / 2; if (cur(mid) >= ms) hi = mid; else lo = mid; }
        return hi * filmSecFull;
      }
    };
  }

  // ── FRUSTUM (§26.6.1) — the camera the bake will fly at that second, not a waypoint ────────────
  function frustumAt(c, plan, u) {
    var T = window.THREE, cam0 = A.camera;
    if (!T || !cam0 || !cam0.isPerspectiveCamera) return { ok: false, why: 'no perspective camera' };
    var p = plan.poseAt(u);
    var cam = cam0.clone();
    cam.position.set(p.x, p.y, p.z); cam.lookAt(p.tx, p.ty, p.tz);
    cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
    var fwd = new T.Vector3(p.tx - p.x, p.ty - p.y, p.tz - p.z).normalize();
    var W = (A.renderer && A.renderer.domElement && A.renderer.domElement.width) || 1280;
    var H = (A.renderer && A.renderer.domElement && A.renderer.domElement.height) || 720;
    var pts = c.cornersThree.concat([c.centerTop]), inside = 0, front = 0, px = [];
    pts.forEach(function (v) {
      var d = new T.Vector3().subVectors(v, cam.position);
      if (d.dot(fwd) > 0) front++;
      var q = v.clone().project(cam);
      if (Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 && q.z < 1) inside++;
      px.push({ x: (q.x + 1) / 2 * W, y: (1 - q.y) / 2 * H });
    });
    var d02 = Math.hypot(px[0].x - px[2].x, px[0].y - px[2].y), d13 = Math.hypot(px[1].x - px[3].x, px[1].y - px[3].y);
    var cq = c.centerTop.clone().project(cam);
    var centreIn = Math.abs(cq.x) <= 1 && Math.abs(cq.y) <= 1 && cq.z < 1;
    var centreFront = new T.Vector3().subVectors(c.centerTop, cam.position).dot(fwd) > 0;
    var ok = centreFront && centreIn;
    return { ok: ok, why: ok ? 'crossing in frame' : (!centreFront ? 'crossing BEHIND the camera' : 'crossing off-frame'),
             cornersFront: front - (centreFront ? 1 : 0), cornersInside: inside - (centreIn ? 1 : 0),
             diagPx: Math.max(d02, d13), cam: { x: p.x, y: p.y, z: p.z }, dist: c.centerTop.distanceTo(cam.position) };
  }

  // ── §26.6.2 — bbox vs the storey's walkable raster: a plate cannot be smaller than the floor it is ──
  function semanticCheck(c) {
    var FM = window.FlythruMaths, SR = window.StoreyRaster;
    if (!FM || !SR || !A.dbQuery) return { verdict: 'INCONCLUSIVE', why: 'no FlythruMaths/StoreyRaster', ratio: null };
    var wr;
    try { wr = A.dbQuery('SELECT storey,res,x0,y0,cols,rows,bits FROM storey_walkable_raster WHERE storey=?', [c.storey]) || []; }
    catch (e) { return { verdict: 'INCONCLUSIVE', why: 'storey_walkable_raster: ' + e.message, ratio: null }; }
    if (!wr.length) return { verdict: 'INCONCLUSIVE', why: 'no walkable raster for storey "' + c.storey + '"', ratio: null };
    var walk = 0;
    try { walk = FM.ftRasterArea(SR.fromRow(wr[0])); } catch (e2) { return { verdict: 'INCONCLUSIVE', why: 'raster decode: ' + e2.message, ratio: null }; }
    if (!(walk > 0)) return { verdict: 'INCONCLUSIVE', why: 'walkable area 0', ratio: null };
    var ratio = c.area / walk;
    return { verdict: ratio >= 1 ? 'FLOOR-PLATE' : 'NOT-A-FLOOR-PLATE', ratio: ratio, walk: walk,
             why: ratio >= 1 ? 'bbox covers the storey walkable' : 'bbox smaller than the storey it would floor — a finish patch, not the plate' };
  }

  // ── §40.2 THE PLATE'S SURFACE AREA, from the plate's OWN MESH (§38.1, user 2026-09-08: the plate
  // "is a 2+3 wing shape thus no other dims looks feasible" — so the bbox rectangle, and the X that
  // discharges it, are the wrong statement; the area is the statement).
  // Sums the XZ-projected area of the UP-FACING triangles only. Summing every triangle double-counts
  // a closed solid (its top face and its bottom face project onto the same footprint), which is why
  // the down-facing sum is measured too and printed beside it: the two should agree to within the
  // slab's own edge chamfers, and if they do not, the mesh is not a plate and the log says so.
  // World "up" is +Y here (A.ifc2three's convention — the picked plate's four corners all share y).
  var _tri = null;
  // `range` (BatchedMesh only) restricts the walk to ONE slot's own index/vertex span; without it the
  // walk would sum the whole shared batch buffer, i.e. the entire building, and report a footprint
  // hundreds of times too big.
  function _worldTris(o, out, range) {
    var T = window.THREE, g = o.geometry;
    if (!g || !g.attributes || !g.attributes.position) return 0;
    var pos = g.attributes.position, idx = g.index, added = 0;
    var from = 0, n = idx ? idx.count : pos.count;
    if (range) {
      if (idx && range.indexCount > 0) { from = range.indexStart; n = range.indexStart + range.indexCount; }
      else if (!idx && range.vertexCount > 0) { from = range.vertexStart; n = range.vertexStart + range.vertexCount; }
    }
    if (!_tri) _tri = { a: new T.Vector3(), b: new T.Vector3(), c: new T.Vector3(), m: new T.Matrix4() };
    var mats = [];
    if (o.isInstancedMesh) {
      var meta = A._instanceMeta && A._instanceMeta[o.id];
      for (var q = 0; q < o.count; q++) {
        if (meta && meta[q] && meta[q].guid !== _beatGuid) continue;
        var mm = new T.Matrix4(); o.getMatrixAt(q, mm);
        mats.push(new T.Matrix4().multiplyMatrices(o.matrixWorld, mm));
      }
    } else if (range && range.matrix) {
      mats.push(new T.Matrix4().multiplyMatrices(o.matrixWorld, range.matrix));
    } else mats.push(o.matrixWorld);
    for (var mi = 0; mi < mats.length; mi++) {
      for (var i = from; i < n; i += 3) {
        var i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i + 1) : i + 1, i2 = idx ? idx.getX(i + 2) : i + 2;
        _tri.a.fromBufferAttribute(pos, i0).applyMatrix4(mats[mi]);
        _tri.b.fromBufferAttribute(pos, i1).applyMatrix4(mats[mi]);
        _tri.c.fromBufferAttribute(pos, i2).applyMatrix4(mats[mi]);
        // N = (b-a) x (c-a); the projected area onto the ground plane is |N.y| / 2, and N.y's SIGN
        // is which way the face looks. No trig, no normals attribute to trust.
        var ny = (_tri.b.z - _tri.a.z) * (_tri.c.x - _tri.a.x) - (_tri.b.x - _tri.a.x) * (_tri.c.z - _tri.a.z);
        if (ny > 0) out.up += ny / 2; else out.down += -ny / 2;
        added++;
      }
    }
    return added;
  }
  var _beatGuid = null;
  // Returns {m2, src, up, down, tris, meshes} — src is one of 'mesh' | 'raster' | 'bbox', in §38.1's
  // own order of honesty. NEVER invents: with no mesh and no raster it says bbox and the caller
  // writes "(est., bbox)".
  function footprintArea(beat) {
    var out = { up: 0, down: 0 }, tris = 0, meshes = 0, batched = 0;
    _beatGuid = beat.guid;
    if (A.collectMeshes) {
      try {
        A.collectMeshes(function (o) {
          return (o.isMesh || o.isInstancedMesh) && !o.isBatchedMesh &&
                 ((o.userData && o.userData.guid === beat.guid) ||
                  (o.isInstancedMesh && A._instanceMeta && A._instanceMeta[o.id] &&
                   A._instanceMeta[o.id].some(function (m) { return m && m.guid === beat.guid; })));
        }).forEach(function (o) { var n = _worldTris(o, out); if (n) { tris += n; meshes++; } });
        // A BatchedMesh keeps every element's triangles in ONE shared buffer, so a naive walk would
        // sum the whole building. THREE exposes the per-slot span: getGeometryIdAt(instanceId) then
        // getGeometryRangeAt(geometryId) gives {indexStart,indexCount,vertexStart,vertexCount}, and
        // getMatrixAt(instanceId) gives that slot's own transform. MEASURED 2026-09-08: Hospital's
        // picked plate is a BATCHED slot, not an InstancedMesh instance — without this branch the
        // mesh path never fires on Hospital at all and the figure silently falls back to the raster.
        // Any THREE build without these accessors is COUNTED and named, never guessed at.
        var T2 = window.THREE;
        A.collectMeshes(function (o) { return o.isBatchedMesh; }).forEach(function (mesh) {
          var meta = A._batchMeta && A._batchMeta[mesh.id];
          if (!meta) return;
          for (var i = 0; i < meta.length; i++) {
            if (!meta[i] || meta[i].guid !== beat.guid) continue;
            var slot = meta[i].slotId;
            if (typeof mesh.getGeometryIdAt !== 'function' || typeof mesh.getGeometryRangeAt !== 'function') { batched++; continue; }
            var gid, rg = {};
            try {
              gid = mesh.getGeometryIdAt(slot);
              mesh.getGeometryRangeAt(gid, rg);
              if (typeof mesh.getMatrixAt === 'function') { rg.matrix = new T2.Matrix4(); mesh.getMatrixAt(slot, rg.matrix); }
            } catch (eB) { batched++; continue; }
            if (!(rg.indexCount > 0 || rg.vertexCount > 0)) { batched++; continue; }
            var nb = _worldTris(mesh, out, rg);
            if (nb) { tris += nb; meshes++; } else batched++;
          }
        });
      } catch (e) { log('§SLAB_BEAT_AREA mesh walk failed: ' + e.message); }
    }
    var bbox = beat.bx * beat.by;
    if (out.up > 0) {
      log('§SLAB_BEAT_AREA src=mesh m2=' + fmt(out.up) + ' up=' + fmt(out.up) + ' down=' + fmt(out.down) +
          ' tris=' + tris + ' meshes=' + meshes + (batched ? ' batchedSlotsSkipped=' + batched : '') +
          ' bboxM2=' + fmt(bbox) + ' fill=' + (out.up / bbox).toFixed(3) +
          ' (up-facing triangles projected to the ground plane; down-facing printed as the cross-check)');
      return { m2: out.up, src: 'mesh', up: out.up, down: out.down, tris: tris, meshes: meshes, bbox: bbox };
    }
    var sem = beat.semantic || {};
    if (sem.walk > 0) {
      log('§SLAB_BEAT_AREA src=raster m2=' + fmt(sem.walk) + ' (storey_walkable_raster, a LOWER bound — ' +
          'no plate mesh in the scene at the pop' + (batched ? ', ' + batched + ' batched slot(s) not addressable' : '') +
          ') bboxM2=' + fmt(bbox) + ' tris=0');
      return { m2: sem.walk, src: 'raster', up: 0, down: 0, tris: 0, meshes: 0, bbox: bbox };
    }
    log('§SLAB_BEAT_AREA src=bbox m2=' + fmt(bbox) + ' — no plate mesh and no walkable raster; the ' +
        'figure is the bbox product and is written "(est., bbox)"' + (batched ? ' batchedSlots=' + batched : ''));
    return { m2: bbox, src: 'bbox', up: 0, down: 0, tris: 0, meshes: 0, bbox: bbox };
  }

  // ── BUILD ONCE ─────────────────────────────────────────────────────────────────────────────────
  A.slabBeatBuild = function (plan, filmSecFull, bkState, cursorTotalSec) {
    if (_built) return _report;
    _built = true;
    _report = { state: 'INCONCLUSIVE', why: null, rows: [], beat: null, clock: null, label: null, diag: null };
    var T = window.THREE;
    function fail(state, why) { _report.state = state; _report.why = why; log('§SLAB_BEAT ' + state + ' — ' + why); return _report; }
    if (!T || typeof A.ifc2three !== 'function' || typeof A.dbQuery !== 'function') return fail('INCONCLUSIVE', 'no THREE / A.ifc2three / A.dbQuery');
    if (!plan || typeof plan.poseAt !== 'function') return fail('INCONCLUSIVE', 'no plan.poseAt — no camera to judge framing');
    if (!bkState) return fail('INCONCLUSIVE', 'buildup off — nothing is laid, so there is no pop to mark');
    if (typeof A.buildupTAt !== 'function' || typeof A.buildupCursorAt !== 'function') return fail('INCONCLUSIVE', 'no buildupTAt/buildupCursorAt owner on APP');
    if (typeof window.tmGuidEndTs !== 'function') return fail('INCONCLUSIVE', 'no tmGuidEndTs — cannot read when each plate is placed');
    if (!(plan.beats && plan.beats.dive > 0)) return fail('INCONCLUSIVE', 'plan has no dive beat');
    if (!(filmSecFull > 0)) return fail('INCONCLUSIVE', 'filmSecFull ' + filmSecFull);
    if (!(cursorTotalSec > 0)) cursorTotalSec = filmSecFull;
    var diveSec = plan.beats.dive * filmSecFull;

    // 1. candidates — DB extents, planar by their OWN footprint (§26.4.1)
    var rows = [];
    try {
      rows = A.dbQuery("SELECT m.guid, m.element_name, m.storey, t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z " +
                       "FROM elements_meta m JOIN element_transforms t ON m.guid = t.guid " +
                       "WHERE m.ifc_class IN ('IfcSlab','IfcSlabStandardCase')") || [];
    } catch (eQ) { return fail('INCONCLUSIVE', 'slab query: ' + eQ.message); }
    var cands = rows.map(function (v) {
      var bx = +v[6], by = +v[7], bz = +v[8];
      return { guid: v[0], rawName: v[1], storey: String(v[2] == null ? 'Unknown' : v[2]), cx: +v[3], cy: +v[4], cz: +v[5],
               bx: bx, by: by, bz: bz, area: bx * by, name: semanticName(v[1]) };
    }).filter(function (s) { return s.bz < 0.5 * Math.min(s.bx, s.by); });
    if (!cands.length) return fail('VACUOUS', 'no planar IfcSlab in this model (' + rows.length + ' IfcSlab rows, none planar)');

    // 3. the clock — owners, inverted
    var clock = makeClock(plan, bkState, filmSecFull, cursorTotalSec);
    var top = (typeof A.buildupTopoutU === 'function') ? A.buildupTopoutU(plan) : null;
    _report.clock = { filmSecFull: filmSecFull, cursorTotalSec: cursorTotalSec, diveSec: diveSec, monotone: clock.monotone,
                      topoutU: top ? top.u : null, topoutSrc: top ? top.src : null };
    log('§SLAB_BEAT_CLOCK filmSec=' + filmSecFull.toFixed(2) + ' cursorTotalSec=' + cursorTotalSec.toFixed(2) +
        ' diveSec=' + diveSec.toFixed(2) + ' (beats.dive=' + plan.beats.dive.toFixed(3) + ') topoutU=' + (top ? top.u.toFixed(3) + ' ' + top.src : 'n/a') +
        ' monotone=' + (clock.monotone ? 'yes' : 'NO decreases=' + clock.decreases) +
        ' — film second of a pop = bisection over A.buildupTAt+A.buildupCursorAt, the owners; NOT the PoC\'s linear day map');
    if (!clock.monotone) return fail('INCONCLUSIVE', 'the buildup clock is not monotone in film time; a pop second is undefined');
    var ends = window.tmGuidEndTs();
    var withEnd = 0;
    cands.forEach(function (c) { c.endTs = ends[c.guid]; if (c.endTs != null) withEnd++; c.sec = (c.endTs != null) ? clock.secOf(c.endTs) : null; });

    // 4. pool + co-arrivals (§26.4.4/5): largest plate takes the event; stacked layers merge, others fragment
    var amax = 0; cands.forEach(function (c) { if (c.area > amax) amax = c.area; });
    var pool = cands.filter(function (c) { return c.area >= CAND_FRAC * amax && c.sec != null; });
    var live = pool.slice().sort(function (a, b) { return a.sec - b.sec; }), events = [];
    log('§SLAB_BEAT_POOL ' + live.map(function (c) { return c.sec.toFixed(2) + 's ' + c.storey + ' ' + fmt(c.area) + 'm2 z=' + c.cz.toFixed(2) + ' t=' + c.bz.toFixed(2); }).join(' | '));
    // §26.14 §SLAB_BURIAL — three kinds of co-arrival, decided by plan overlap and height, never by area alone:
    //   in contact on the same plan  -> one floor in two layers, the larger keeps the event (HHS structure+finish)
    //   above, on the same plan      -> BURIAL: the upper, later plate inherits the event; the host is covered
    //   underneath, on the same plan -> hidden; recorded, neither buries nor fragments
    //   elsewhere                    -> a co-arrival that fragments the frame if it is >= CO_FRAC of the host
    // The chain's claimSec stays the FIRST pop of the chain — that is when the previous plate's mark was covered.
    live.forEach(function (c) {
      var host = events.length ? events[events.length - 1] : null;
      c.coArrivals = []; c.buried = []; c.under = []; c.claimSec = c.sec;
      if (!host || c.sec - host.sec > ENV_SPAN) { events.push(c); return; }
      var ov = planOverlap(c, host);
      if (ov >= STACK_FRAC && verticalContact(c, host)) {
        if (c.area > host.area) { c.coArrivals = host.coArrivals.concat([host]); c.buried = host.buried; c.under = host.under; c.claimSec = host.claimSec; events[events.length - 1] = c; }
        else host.coArrivals.push(c);
        return;
      }
      if (ov >= STACK_FRAC && c.cz > host.cz) {                 // BURIAL
        c.buried = host.buried.concat([host]); c.under = host.under; c.claimSec = host.claimSec;
        host.buriedBy = c;
        events[events.length - 1] = c;
        return;
      }
      if (ov >= STACK_FRAC) { host.under.push(c); return; }    // hidden underneath the host
      host.coArrivals.push(c);                                   // elsewhere
    });
    events.forEach(function (c, i) {
      c.stacked = (c.coArrivals || []).filter(function (x) { return planOverlap(c, x) >= STACK_FRAC && verticalContact(c, x); });
      c.coSignificant = (c.coArrivals || []).filter(function (x) { return x.area >= CO_FRAC * c.area && planOverlap(c, x) < STACK_FRAC; });
      c.hold = (i + 1 < events.length) ? events[i + 1].claimSec - c.sec : Infinity;   // 6. hold — until the next chain's FIRST pop
      c.reject = null;
      if (c.hold < MIN_HOLD) c.reject = 'hold ' + c.hold.toFixed(2) + 's < ' + MIN_HOLD;
      else if (c.coSignificant.length) c.reject = c.coSignificant.length + ' co-arrival(s) >= ' + (CO_FRAC * 100) + '% within ' + ENV_SPAN.toFixed(1) + 's, not in vertical contact (' +
        c.coSignificant.map(function (x) { return x.storey + '@' + x.sec.toFixed(2) + 's dz=' + (x.cz - c.cz).toFixed(2); }).join(', ') + ') — the frame fragments or the mark is buried';
    });
    log('§SLAB_BEAT_INPUT planarSlabs=' + cands.length + ' withEndTs=' + withEnd + ' pool(>=' + (CAND_FRAC * 100) + '% of ' + fmt(amax) + 'm2)=' + pool.length +
        ' events(co-arrivals collapsed within ' + ENV_SPAN.toFixed(1) + 's)=' + events.length);

    // geometry for every event (so the frustum test and the witness see the same numbers)
    events.forEach(function (c) {
      var zTop = c.cz + c.bz / 2, hx = c.bx / 2, hy = c.by / 2;
      var cIfc = [[c.cx - hx, c.cy - hy], [c.cx + hx, c.cy - hy], [c.cx + hx, c.cy + hy], [c.cx - hx, c.cy + hy]];
      c.cornersThree = cIfc.map(function (q) { var v = A.ifc2three(q[0], q[1], zTop + 0.03); return new T.Vector3(v.x, v.y, v.z); });
      var ct = A.ifc2three(c.cx, c.cy, zTop + 0.05); c.centerTop = new T.Vector3(ct.x, ct.y, ct.z);
    });

    // §14 across layers (2026-09-08): the 2D cues (envelope, storey, room, corridor) own their windows; a plate whose
    // 2.7 s slot overlaps one is not taken — HHS's Level 1 pops at 0.00 s, inside the envelope cue's 0–4.2 s window.
    var cueWins = (typeof A.flythruCuesWindows === 'function') ? A.flythruCuesWindows() : [];
    events.forEach(function (e) {
      if (e.reject) return;
      for (var wi = 0; wi < cueWins.length; wi++) { var w = cueWins[wi]; if (e.sec < w.to && e.sec + ENV_SPAN + 0.5 > w.from) { e.reject = 'screen taken by cue:' + w.key + ' ' + w.from.toFixed(2) + '-' + w.to.toFixed(2) + ' (§14 across layers)'; break; } }
    });
    if (cueWins.length) log('§SLAB_BEAT_TAKEN ' + cueWins.map(function (w) { return 'cue:' + w.key + ' ' + w.from.toFixed(2) + '-' + w.to.toFixed(2); }).join(' | '));
    // 7. the guard — inside the dive, longest hold first, the camera must frame the crossing at the pop
    var qual = events.filter(function (e) { return !e.reject; });
    var dive = qual.filter(function (e) { return e.sec < diveSec; }).sort(function (a, b) { return b.hold - a.hold; });
    var picked = null, rank = 0;
    dive.forEach(function (e) {
      rank++;
      e.frustum = frustumAt(e, plan, e.sec / filmSecFull);
      log('§SLAB_BEAT_FRUSTUM sec=' + e.sec.toFixed(2) + ' storey="' + e.storey + '" ' + (e.frustum.ok ? 'IN-FRAME' : 'FAIL') + ' (' + e.frustum.why + ')' +
          ' cornersFront=' + e.frustum.cornersFront + '/4 cornersInside=' + e.frustum.cornersInside + '/4 diagPx=' + (e.frustum.diagPx || 0).toFixed(0) +
          ' camDist=' + (e.frustum.dist || 0).toFixed(1) + 'm — plan.poseAt at the plate\'s OWN second, not a waypoint');
      if (!e.frustum.ok) { e.reject = 'off-frame at its own second: ' + e.frustum.why; return; }
      if (picked) { e.reject = 'not taken — §1 one cue per capability (hold ' + e.hold.toFixed(2) + 's, rank ' + rank + ' of ' + dive.length + ')'; return; }
      var sem = semanticCheck(e); e.semantic = sem;
      log('§SLAB_BEAT_SEMANTIC storey="' + e.storey + '" bbox=' + fmt(e.area) + 'm2 walkable=' + (sem.walk != null ? fmt(sem.walk) + 'm2' : 'n/a') +
          ' ratio=' + (sem.ratio != null ? sem.ratio.toFixed(2) : 'n/a') + ' -> ' + sem.verdict + ' (' + sem.why + ')');
      if (sem.verdict === 'NOT-A-FLOOR-PLATE') { e.reject = 'withdrawn — ' + sem.why + ' (ratio ' + sem.ratio.toFixed(2) + ')'; return; }
      picked = e;
    });
    qual.filter(function (e) { return e.sec >= diveSec; }).forEach(function (e) { e.reject = 'not taken — after the dive (' + diveSec.toFixed(1) + 's), and §1 takes one'; });

    _report.rows = events.map(function (e) {
      return { guid: e.guid, rawName: e.rawName, name: e.name, storey: e.storey, sec: +e.sec.toFixed(3), hold: e.hold === Infinity ? null : +e.hold.toFixed(3),
               area: +e.area.toFixed(2), bx: +e.bx.toFixed(3), by: +e.by.toFixed(3), inDive: e.sec < diveSec, picked: e === picked,
               reject: e.reject, stacked: (e.stacked || []).map(function (x) { return x.name; }),
               claimSec: +e.claimSec.toFixed(3), buried: (e.buried || []).map(function (x) { return x.storey + '@' + x.sec.toFixed(2); }),
               under: (e.under || []).map(function (x) { return x.storey + '@' + x.sec.toFixed(2); }), buriedBy: e.buriedBy ? e.buriedBy.storey : null,
               frustum: e.frustum ? { ok: e.frustum.ok, why: e.frustum.why, diagPx: +e.frustum.diagPx.toFixed(1), dist: +e.frustum.dist.toFixed(2) } : null,
               semantic: e.semantic ? { verdict: e.semantic.verdict, ratio: e.semantic.ratio } : null,
               corners: e.cornersThree.map(function (v) { return [v.x, v.y, v.z]; }), centerTop: [e.centerTop.x, e.centerTop.y, e.centerTop.z] };
    });
    _report.rows.forEach(function (r) {
      log('§SLAB_BEAT_EVENT sec=' + r.sec.toFixed(2) + ' hold=' + (r.hold == null ? '∞' : r.hold.toFixed(2)) + ' area=' + fmt(r.area) + 'm2 storey="' + r.storey +
          '" name="' + r.name + '"' + (r.stacked.length ? ' stacked=[' + r.stacked.join(', ') + ']' : '') +
          (r.buried.length ? ' buried=[' + r.buried.join(', ') + '] claimSec=' + r.claimSec.toFixed(2) : '') + (r.under.length ? ' under=[' + r.under.join(', ') + ']' : '') + ' -> ' +
          (r.picked ? '✅ DIVE BEAT' : (r.reject || (r.inDive ? 'qualifies' : 'qualifies (after dive)'))));
    });
    if (!picked) {
      _report.state = 'NOTHING';
      _report.why = 'no plate qualifies inside the dive (' + dive.length + ' in-dive candidate(s), each rejected above)';
      log('§SLAB_BEAT_PICK NOTHING drawn=0 — ' + _report.why + ' afterDiveQualified=' + qual.filter(function (e) { return e.sec >= diveSec; }).length);
      return _report;
    }

    // ── DRAW: geometry prepared once; opacity is the only per-frame write ─────────────────────────
    _beat = picked;
    _grp = new T.Group(); _grp.name = 'slabBeat';
    // §40.2 — OUTLINE, not an X. The X existed to discharge the bbox rectangle the label stated
    // (§26.3's honesty device: "here is the rectangle I measured"). The label no longer states a
    // rectangle — it states the plate's own surface area — so there is nothing for the diagonals to
    // discharge, and on a 2+3 wing plan they draw a cross over shapes that are not there. The four
    // edges of the measured box remain the honest mark: they say WHICH plate, and nothing more.
    var g = new T.BufferGeometry();
    var c4 = picked.cornersThree, pos = new Float32Array([
      c4[0].x, c4[0].y, c4[0].z, c4[1].x, c4[1].y, c4[1].z,
      c4[1].x, c4[1].y, c4[1].z, c4[2].x, c4[2].y, c4[2].z,
      c4[2].x, c4[2].y, c4[2].z, c4[3].x, c4[3].y, c4[3].z,
      c4[3].x, c4[3].y, c4[3].z, c4[0].x, c4[0].y, c4[0].z]);
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    // §45 (USER, 2026-09-08: "If tint is the issue, then drop tint, and just have label box with mark
    // outline similar to Clash pair shine thru"). The outline is now the ONLY in-model mark and it
    // SHINES THROUGH — depthTest:false, high renderOrder, the same §7 cue contract the clash marks
    // keep — so the plate is named without repainting a single pixel of the building.
    _diag = new T.LineSegments(g, new T.LineBasicMaterial({ color: INK, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    _diag.name = 'slabBeatOutline'; _diag.visible = false; _diag.renderOrder = 951;
    _grp.add(_diag);
    // §40.2 / §38.1a — THE INFO BOX. The in-plane textured plane is gone: from a camera 63 m off
    // and barely above the roof line it is a foreshortened sliver, which is exactly why the user did
    // not see it in the full film ("no info box giving its surface area"). The figure now posts to
    // the ONE fixed §MEASURE_BOX, the same 2D panel the indoor hall beat uses and the one the user
    // confirms works. Only the AREA is stated — the plate is a 2+3 wing shape, so a bbox X × Y is
    // the wrong sentence about it (§38.1).
    var _fp = footprintArea(picked);
    var text1 = (_fp.src === 'bbox')
      ? fmt(picked.bx, 2) + ' × ' + fmt(picked.by, 2) + ' m = ' + fmt(_fp.m2, 0) + ' m² (est., bbox)'
      : (_fp.src === 'raster')
        ? 'Floor area ≥ ' + fmt(_fp.m2, 0) + ' m² (walkable raster, lower bound)'
        : 'Floor area ' + fmt(_fp.m2, 0) + ' m² (mesh footprint)';
    var text2 = picked.name || '';
    _labelRows = [text1].concat(text2 ? [text2] : []).concat([picked.storey]);
    _labelTitle = 'Floor plate';
    _label = null;
    _grp.userData.excludeFromAO = true;   // §46 / §AO_EXCLUDE — a mark, not a surface
    if (A.scene) A.scene.add(_grp);
    _report.state = 'BEAT';
    _report.beat = { guid: picked.guid, storey: picked.storey, sec: picked.sec, hold: picked.hold, area: picked.area, bx: picked.bx, by: picked.by, name: picked.name, rawName: picked.rawName };
    _report.label = { text1: text1, text2: text2, title: _labelTitle, rows: _labelRows.slice(),
                      surface: 'measure-box', panel: true };
    _report.area = { m2: _fp.m2, src: _fp.src, up: _fp.up, down: _fp.down, tris: _fp.tris,
                     meshes: _fp.meshes, bboxM2: _fp.bbox };
    _report.tint = 'NONE (§45 — dropped; the outline names the plate, the §MEASURE_BOX carries the figures)';
    _report.diag = { depthTest: _diag.material.depthTest, shineThrough: true, renderOrder: _diag.renderOrder, shape: 'outline',
                     endpoints: [[c4[0].x, c4[0].y, c4[0].z], [c4[1].x, c4[1].y, c4[1].z],
                                 [c4[1].x, c4[1].y, c4[1].z], [c4[2].x, c4[2].y, c4[2].z],
                                 [c4[2].x, c4[2].y, c4[2].z], [c4[3].x, c4[3].y, c4[3].z],
                                 [c4[3].x, c4[3].y, c4[3].z], [c4[0].x, c4[0].y, c4[0].z]] };
    log('§SLAB_BEAT_PICK take=1/' + TAKE + ' (cap ' + MAX_DIVE + ', in-dive candidates=' + dive.length + ') sec=' + picked.sec.toFixed(2) + ' hold=' +
        (picked.hold === Infinity ? '∞' : picked.hold.toFixed(2)) + 's storey="' + picked.storey + '" guid=' + picked.guid + ' envelope=' + ENV.fadeIn + '/' + ENV.hold + '/' + ENV.fadeOut +
        ' (' + ENV_SPAN.toFixed(1) + 's) popAt=endTs(' + new Date(picked.endTs).toISOString().slice(0, 10) + ')');
    log('§SLAB_BEAT_LABEL title="' + _labelTitle + '" rows=[' + _labelRows.join(' · ') + '] surface=§MEASURE_BOX ' +
        '(2D fixed panel, §38.1a) areaSrc=' + _fp.src + ' m2=' + fmt(_fp.m2) +
        ' — the in-plane textured plane is retired; from 63 m off it read as a foreshortened sliver');
    log('§SLAB_BEAT_DIAG depthTest=' + _diag.material.depthTest + ' shape=outline segments=4 corners=' +
        c4.map(function (v) { return '(' + v.x.toFixed(2) + ',' + v.y.toFixed(2) + ',' + v.z.toFixed(2) + ')'; }).join(' '));
    return _report;
  };

  // ── §45 NO TINT. MEASURED (§44, real 0-30 s bake): every one of the 23 |dY|>15 jumps in the
  // opening landed in 8.88-11.00 s, i.e. on the plate beat's own 9.38 s pop + 2.2 s envelope — not
  // spread across the datum's continuous 0-11.34 s window. The tint wrote `setColorAt` into a SHARED
  // InstancedMesh/BatchedMesh colour buffer every frame of that envelope, so it could move pixels
  // anywhere in the picture, which is exactly what the film showed.
  // USER'S RULING: drop the tint. The plate is named by its OUTLINE and its figures by the fixed
  // §MEASURE_BOX — nothing repaints the model. `tintTouched` is kept in the report as a constant 0
  // so a reader of an old log is not left guessing whether the field vanished or the tint failed.

  // ── PER FRAME — called by the bake loop beside flythruDatumAt; one pure-ish function ─────────────
  A.slabBeatAt = function (filmSec) {
    if (!_beat || !_grp) return null;
    var dt = filmSec - _beat.sec, env;
    if (dt < 0) env = 0;
    else if (dt < ENV.fadeIn) env = dt / ENV.fadeIn;
    else if (dt < ENV.fadeIn + ENV.hold) env = 1;
    else if (dt < ENV_SPAN) env = 1 - (dt - ENV.fadeIn - ENV.hold) / ENV.fadeOut;
    else env = 0;
    if (env > 0) {
      _diag.visible = true; _diag.material.opacity = env;
    } else if (dt >= ENV_SPAN) {
      if (_diag.visible) _diag.visible = false;
      if (!_envDone) { _envDone = true; log('§SLAB_BEAT_ENVELOPE done filmSec=' + filmSec.toFixed(2) + ' tint=NONE (§45 retired) — the outline is released; the label stays while its crossing is in frame'); }
    }
    // label lifetime (§26.2): from the pop until the crossing leaves frame (a later beat may claim it — none yet).
    // §40.2 — the lifetime rule is UNCHANGED; only the surface changed. `_labelOn` now gates a
    // posting into the fixed §MEASURE_BOX instead of a mesh's `.visible`, so the panel appears at
    // the pop and leaves when the plate's crossing does, exactly as it did before.
    if (dt >= 0 && !_labelOffReason && A.camera) {
      var q = _beat.centerTop.clone().project(A.camera);
      var inF = Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 && q.z < 1;
      if (inF) { if (!_labelOn) { _labelOn = true; log('§SLAB_BEAT_LABEL on filmSec=' + filmSec.toFixed(2) + ' ndc=(' + q.x.toFixed(2) + ',' + q.y.toFixed(2) + ')'); } }
      else if (_labelOn) { _labelOn = false; _labelOffReason = 'crossing left the frame'; log('§SLAB_BEAT_LABEL off filmSec=' + filmSec.toFixed(2) + ' reason=' + _labelOffReason); }
      else if (dt >= ENV_SPAN && !_labelNeverLogged) { _labelNeverLogged = true; log('§SLAB_BEAT_LABEL never in frame through the envelope ndc=(' + q.x.toFixed(2) + ',' + q.y.toFixed(2) + ',' + q.z.toFixed(2) + ')'); }
    }
    return { env: env, tintOn: false, labelOn: _labelOn, tintTouched: 0 };   // §45 — no tint, ever
  };

  // ── §40.2 — the 2D pass. Called from cinema_maxq's _captureFrame chain beside the other beats, so
  // the posting lands INSIDE the frame's Measure queue (the queue is reset at the top of that
  // function; a post made earlier, from slabBeatAt, would be wiped before it could be drawn).
  A.slabBeatCompositeOntoCanvas = function (ctx, w, h, filmSec) {
    if (!_beat || !_labelOn || !A.filmBoxesMeasurePost) return 0;
    return A.filmBoxesMeasurePost(_labelTitle, _labelRows, INK) ? 1 : 0;
  };

  A.slabBeatReport = function () { return _report; };
  A.slabBeatClock = makeClock;   // §27.5.1 — the ONE owner-clock inverter, shared with cpe_linear_beat.js
  A.slabBeatDispose = function () {
    if (_grp && A.scene) { A.scene.remove(_grp); _grp.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }
    _grp = null; _label = null; _diag = null; _beat = null; _built = false; _report = null;
    _labelRows = []; _labelTitle = 'Floor plate';
    _labelOn = false; _labelOffReason = null; _envDone = false; _labelNeverLogged = false;
  };
  log('§SLAB_BEAT_INIT wired (one floor plate per film, marked as it is laid: NO TINT (§45) — a shine-through box OUTLINE plus the surface area in the fixed §MEASURE_BOX; §40.2 retired the X and the in-plane label plane)');
}
if (typeof window !== 'undefined') window.setupCpeSlabBeat = setupCpeSlabBeat;
