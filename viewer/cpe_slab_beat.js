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
  var LABEL_SHARE = 1 / 3;  // label box spans a third of the plate's SHORTER side, so it sits inside the X

  var _built = false, _report = null, _beat = null, _grp = null, _label = null, _diag = null;
  var _tintOn = false, _touched = [], _clones = [], _labelOn = false, _labelOffReason = null;
  var _envDone = false, _labelNeverLogged = false, _C = null;

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
    _C = new T.Color();
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
    live.forEach(function (c) {
      var host = null;
      if (events.length && c.sec - events[events.length - 1].sec <= ENV_SPAN) host = events[events.length - 1];
      if (!host) { c.coArrivals = []; events.push(c); return; }
      if (c.area > host.area) { c.coArrivals = (host.coArrivals || []).concat([host]); events[events.length - 1] = c; }
      else host.coArrivals.push(c);
    });
    events.forEach(function (c, i) {
      c.stacked = (c.coArrivals || []).filter(function (x) { return planOverlap(c, x) >= STACK_FRAC && verticalContact(c, x); });
      c.coSignificant = (c.coArrivals || []).filter(function (x) { return x.area >= CO_FRAC * c.area && c.stacked.indexOf(x) < 0; });
      c.hold = (i + 1 < events.length) ? events[i + 1].sec - c.sec : Infinity;   // 6. hold
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
               frustum: e.frustum ? { ok: e.frustum.ok, why: e.frustum.why, diagPx: +e.frustum.diagPx.toFixed(1), dist: +e.frustum.dist.toFixed(2) } : null,
               semantic: e.semantic ? { verdict: e.semantic.verdict, ratio: e.semantic.ratio } : null,
               corners: e.cornersThree.map(function (v) { return [v.x, v.y, v.z]; }), centerTop: [e.centerTop.x, e.centerTop.y, e.centerTop.z] };
    });
    _report.rows.forEach(function (r) {
      log('§SLAB_BEAT_EVENT sec=' + r.sec.toFixed(2) + ' hold=' + (r.hold == null ? '∞' : r.hold.toFixed(2)) + ' area=' + fmt(r.area) + 'm2 storey="' + r.storey +
          '" name="' + r.name + '"' + (r.stacked.length ? ' stacked=[' + r.stacked.join(', ') + ']' : '') + ' -> ' +
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
    // X — both diagonals of the measured box, on the plate's top face, depth-tested with the tint
    var g = new T.BufferGeometry();
    var c4 = picked.cornersThree, pos = new Float32Array([
      c4[0].x, c4[0].y, c4[0].z, c4[2].x, c4[2].y, c4[2].z,
      c4[1].x, c4[1].y, c4[1].z, c4[3].x, c4[3].y, c4[3].z]);
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    _diag = new T.LineSegments(g, new T.LineBasicMaterial({ color: TINT_HEX, transparent: true, opacity: 0, depthTest: true, depthWrite: false }));
    _diag.name = 'slabBeatX'; _diag.visible = false; _diag.renderOrder = 10;
    _grp.add(_diag);
    // label — in the plate's plane at the crossing; shines through (depthTest:false, renderOrder 900)
    var text1 = fmt(picked.bx, 2) + ' × ' + fmt(picked.by, 2) + ' m = ' + fmt(picked.area, 0) + ' m² (est.)';
    var text2 = picked.name || '';
    var cw = 1024, ch = 256, cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.60)'; ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = '#' + INK.toString(16).padStart(6, '0'); ctx.lineWidth = 6; ctx.strokeRect(3, 3, cw - 6, ch - 6);
    ctx.fillStyle = ctx.strokeStyle; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '400 92px system-ui, sans-serif'; ctx.fillText(text1, cw / 2, ch * 0.36, cw - 40);
    ctx.font = '400 62px system-ui, sans-serif'; ctx.fillText(text2, cw / 2, ch * 0.74, cw - 40);
    var tex = new T.CanvasTexture(cv);
    try { if (A.renderer && A.renderer.capabilities) tex.anisotropy = A.renderer.capabilities.getMaxAnisotropy(); } catch (eAn) {}
    var lw = LABEL_SHARE * Math.min(picked.bx, picked.by), lh = lw * ch / cw;
    _label = new T.Mesh(new T.PlaneGeometry(lw, lh), new T.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, side: T.DoubleSide }));
    _label.name = 'slabBeatLabel'; _label.renderOrder = 900; _label.visible = false;
    _label.position.copy(picked.centerTop);
    // lie flat (plane faces +Y), then turn so the text's top points AWAY from the camera at the pop —
    // decided ONCE from the pose, from four axis choices; the camera cannot re-decide it per frame.
    var pf = picked.frustum && picked.frustum.cam ? picked.frustum.cam : null;
    var yaw = 0;
    if (pf) {
      var hx2 = picked.centerTop.x - pf.x, hz2 = picked.centerTop.z - pf.z;   // camera -> plate, horizontal
      var best = -Infinity;
      [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach(function (r) {
        // the plane's local +Y (text up) after rotation.x=-90° points to world -Z; a yaw r about Y turns it
        var ux = -Math.sin(r), uz = -Math.cos(r);
        var d = ux * hx2 + uz * hz2;
        if (d > best) { best = d; yaw = r; }
      });
    }
    // compose as Y(yaw) * X(-90): flat first, then turned so the text top points away from the camera
    _label.rotation.set(0, 0, 0);
    _label.rotateY(yaw); _label.rotateX(-Math.PI / 2);
    _grp.add(_label);
    if (A.scene) A.scene.add(_grp);
    _report.state = 'BEAT';
    _report.beat = { guid: picked.guid, storey: picked.storey, sec: picked.sec, hold: picked.hold, area: picked.area, bx: picked.bx, by: picked.by, name: picked.name, rawName: picked.rawName };
    _report.label = { text1: text1, text2: text2, w: lw, h: lh, depthTest: _label.material.depthTest, renderOrder: _label.renderOrder,
                      yawDeg: Math.round(yaw * 180 / Math.PI), position: [_label.position.x, _label.position.y, _label.position.z] };
    _report.diag = { depthTest: _diag.material.depthTest, endpoints: [[c4[0].x, c4[0].y, c4[0].z], [c4[2].x, c4[2].y, c4[2].z], [c4[1].x, c4[1].y, c4[1].z], [c4[3].x, c4[3].y, c4[3].z]] };
    log('§SLAB_BEAT_PICK take=1/' + TAKE + ' (cap ' + MAX_DIVE + ', in-dive candidates=' + dive.length + ') sec=' + picked.sec.toFixed(2) + ' hold=' +
        (picked.hold === Infinity ? '∞' : picked.hold.toFixed(2)) + 's storey="' + picked.storey + '" guid=' + picked.guid + ' envelope=' + ENV.fadeIn + '/' + ENV.hold + '/' + ENV.fadeOut +
        ' (' + ENV_SPAN.toFixed(1) + 's) popAt=endTs(' + new Date(picked.endTs).toISOString().slice(0, 10) + ')');
    log('§SLAB_BEAT_LABEL text="' + text1 + ' — ' + text2 + '" w=' + lw.toFixed(2) + 'm h=' + lh.toFixed(2) + 'm depthTest=' + _label.material.depthTest +
        ' renderOrder=' + _label.renderOrder + ' yaw=' + Math.round(yaw * 180 / Math.PI) + '° in the plate\'s plane; (est.) because the area is the bbox product');
    log('§SLAB_BEAT_DIAG depthTest=' + _diag.material.depthTest + ' corners=' + c4.map(function (v) { return '(' + v.x.toFixed(2) + ',' + v.y.toFixed(2) + ',' + v.z.toFixed(2) + ')'; }).join(' '));
    return _report;
  };

  // ── TINT — the cpe_storey_reveal.js:249 pattern, by GUID; clone per distinct material, exact restore ──
  var _tintLateFrames = 0;
  function applyTint(quiet) {
    _tintOn = true; _touched = []; _clones = [];
    var gid = _beat.guid, n = 0, matMap = new Map(), cl0 = null;
    A.collectMeshes(function (o) { return o.isMesh && !o.isInstancedMesh && !o.isBatchedMesh && o.userData && o.userData.guid === gid; }).forEach(function (o) {
      if (!o.material || Array.isArray(o.material) || !o.material.emissive || !o.material.clone) return;
      var orig = o.material, cl = matMap.get(orig);
      if (!cl) { cl = orig.clone(); cl.emissive.setHex(TINT_HEX); cl.emissiveIntensity = 0; matMap.set(orig, cl); _clones.push(cl); cl0 = cl0 || cl; }
      _touched.push({ m: o, mat: orig }); o.material = cl; n++;
    });
    A.collectMeshes(function (o) { return o.isInstancedMesh; }).forEach(function (mesh) {
      var meta = A._instanceMeta && A._instanceMeta[mesh.id];
      if (!meta || !mesh.setColorAt) return;
      for (var i = 0; i < meta.length; i++) {
        if (!meta[i] || meta[i].guid !== gid) continue;
        var prev = 0xffffff; if (mesh.instanceColor) { mesh.getColorAt(i, _C); prev = _C.getHex(); }
        _touched.push({ m: mesh, inst: i, c: prev }); n++;
      }
    });
    A.collectMeshes(function (o) { return o.isBatchedMesh; }).forEach(function (mesh) {
      var meta = A._batchMeta && A._batchMeta[mesh.id];
      if (!meta || !mesh.setColorAt) return;
      for (var i = 0; i < meta.length; i++) {
        if (!meta[i] || meta[i].guid !== gid) continue;
        var pb = 0xffffff; try { mesh.getColorAt(meta[i].slotId, _C); pb = _C.getHex(); } catch (e) {}
        _touched.push({ m: mesh, batch: meta[i].slotId, c: pb }); n++;
      }
    });
    _beat.tintTouched = n;
    if (quiet && !n) { _tintLateFrames++; return; }   // the pop can land a frame after the bisected second; retry silently
    log('§SLAB_BEAT_TINT guid=' + gid + ' meshesTouched=' + n + (n ? ' depthTest=' + (cl0 ? cl0.depthTest : 'inherited(instance colour)') :
        ' NO-MESH — the plate is not in the scene at this frame (not streamed, or not yet placed by the buildup); X and label still draw') +
        ' color=#' + TINT_HEX.toString(16) + (quiet && n ? ' (placed ' + _tintLateFrames + ' frame(s) after the bisected pop second)' : ''));
  }
  function setTintIntensity(env) {
    _clones.forEach(function (cl) { cl.emissiveIntensity = env; });
    var tint = new window.THREE.Color(TINT_HEX), any = null;
    _touched.forEach(function (s) {
      if (s.inst != null) { _C.setHex(s.c).lerp(tint, env); s.m.setColorAt(s.inst, _C); any = s.m; }
      else if (s.batch != null) { _C.setHex(s.c).lerp(tint, env); try { s.m.setColorAt(s.batch, _C); } catch (e) {} }
    });
    if (any && any.instanceColor) any.instanceColor.needsUpdate = true;
  }
  function restoreTint() {
    _touched.forEach(function (s) {
      if (s.inst != null && s.m.instanceColor) { s.m.setColorAt(s.inst, _C.setHex(s.c)); s.m.instanceColor.needsUpdate = true; }
      else if (s.batch != null && s.m.setColorAt) { try { s.m.setColorAt(s.batch, _C.setHex(s.c)); } catch (e) {} }
      else if (s.mat) s.m.material = s.mat;
    });
    _touched = [];
    _clones.forEach(function (c) { try { c.dispose(); } catch (e) {} });
    _clones = []; _tintOn = false;
  }

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
      if (!_tintOn) applyTint(false);
      else if (_beat.tintTouched === 0) applyTint(true);   // not placed yet at the first frame — keep asking, quietly
      setTintIntensity(env);
      _diag.visible = true; _diag.material.opacity = env;
    } else if (dt >= ENV_SPAN) {
      if (_tintOn) restoreTint();
      if (_diag.visible) _diag.visible = false;
      if (!_envDone) { _envDone = true; log('§SLAB_BEAT_ENVELOPE done filmSec=' + filmSec.toFixed(2) + ' tintTouched=' + (_beat.tintTouched || 0) + ' — tint and X released; the label stays while its crossing is in frame'); }
    }
    // label lifetime (§26.2): from the pop until the crossing leaves frame (a later beat may claim it — none yet)
    if (dt >= 0 && !_labelOffReason && A.camera) {
      var q = _beat.centerTop.clone().project(A.camera);
      var inF = Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 && q.z < 1;
      if (inF) { if (!_labelOn) { _labelOn = true; _label.visible = true; log('§SLAB_BEAT_LABEL on filmSec=' + filmSec.toFixed(2) + ' ndc=(' + q.x.toFixed(2) + ',' + q.y.toFixed(2) + ')'); } }
      else if (_labelOn) { _labelOn = false; _label.visible = false; _labelOffReason = 'crossing left the frame'; log('§SLAB_BEAT_LABEL off filmSec=' + filmSec.toFixed(2) + ' reason=' + _labelOffReason); }
      else if (dt >= ENV_SPAN && !_labelNeverLogged) { _labelNeverLogged = true; log('§SLAB_BEAT_LABEL never in frame through the envelope ndc=(' + q.x.toFixed(2) + ',' + q.y.toFixed(2) + ',' + q.z.toFixed(2) + ')'); }
    }
    return { env: env, tintOn: _tintOn, labelOn: _labelOn, tintTouched: _beat.tintTouched == null ? null : _beat.tintTouched };
  };

  A.slabBeatReport = function () { return _report; };
  A.slabBeatDispose = function () {
    try { if (_tintOn) restoreTint(); } catch (e) {}
    if (_grp && A.scene) { A.scene.remove(_grp); _grp.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }
    _grp = null; _label = null; _diag = null; _beat = null; _built = false; _report = null;
    _labelOn = false; _labelOffReason = null; _envDone = false; _labelNeverLogged = false;
  };
  log('§SLAB_BEAT_INIT wired (one floor plate per film, marked as it is laid: depth-tested tint + X, shine-through label in the plate\'s plane)');
}
if (typeof window !== 'undefined') window.setupCpeSlabBeat = setupCpeSlabBeat;
