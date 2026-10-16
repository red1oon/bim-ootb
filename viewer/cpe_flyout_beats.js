/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * cpe_flyout_beats.js — §FLYOUT_BEATS: the wing spans and the facade heights, said on the clean
 * canvas of the pull-out. Implementing bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §38.2 + §40.3.
 * Witness: W-FLYOUT-BEATS (viewer/tests/witness_flyout_beats.js). Rides the Alt-C Measure checkbox.
 *
 * USER (2026-09-08, on the full 720p Hospital film): "during the fly out the wing spans should have
 * been marked, even the edge of roof to window sill etc as the canvas was clean for that."
 *
 * WHY IT DREW NOTHING BEFORE: §37.4 measured the camera INSIDE the building box for the whole
 * pull-out and pull-back (69 → 148.6 s on Hospital) and the 2D setting-out sheet is gated on being
 * OUTSIDE it. That gate was right for the sheet and wrong as a gate for exterior dimensioning —
 * the camera is above the roofs looking down the blocks, which is the best view of a wing there is.
 * This layer has no such gate; it has a legibility test instead.
 *
 * WHAT IS READ, NEVER COMPOSED (§40.3's PoC, scripts/poc_flyout_beats.js, measured these first):
 *   wings — maximal axis-aligned rectangles of the largest plate's storey walkable raster, greedy
 *           largest-first, each a real length x width. Hospital Level 3: 22.25x72.25, 23.50x59.75,
 *           18.00x18.50, 9.25x29.50, 20.25x10.50 m. A 4.75 m-wide run is a corridor and is REJECTED.
 *   sills — roof top (MAX top of IfcRoof/IfcSlab) minus the highest IfcWindow bbox bottom on the
 *           facade. Hospital: 31.25 m (N/E/W), 30.59 m (S).
 *
 * CAN SAY NO (PRIMAL LAW §4): INCONCLUSIVE (no plan / no raster / no windows), VACUOUS (nothing
 * cleared the legibility bar), and every rejected subject is named with the rule that rejected it.
 */
function setupCpeFlyoutBeats(A) {
  if (!A) return;
  var ENV = { fadeIn: 0.6, hold: 1.0, fadeOut: 0.6 }, ENV_SPAN = 2.2, GAP = 0.5, SLOT = ENV_SPAN + GAP;  // §14
  var STEP = 0.25, HOLD = [0, 1.1, 2.1], MIN_PX = 24, INK = '#ffd600';
  var MIN_AREA_M2 = 150, MIN_LONG_M = 12, MIN_SHORT_M = 8, MAX_WINGS = 6, MAX_CUES = 4;
  var _built = false, _report = null, _beats = [], _lastLog = {};
  function log(s) { console.log(s); }
  function fmt(n, dp) { var s = (+n).toFixed(dp == null ? 0 : dp), p = s.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); return p.join('.'); }
  function envAt(dt) { if (dt < 0) return 0; if (dt < ENV.fadeIn) return dt / ENV.fadeIn; if (dt < ENV.fadeIn + ENV.hold) return 1; if (dt < ENV_SPAN) return 1 - (dt - ENV.fadeIn - ENV.hold) / ENV.fadeOut; return 0; }

  // ── the greedy maximal-rectangle decomposition. Identical to the PoC's, deliberately: the PoC's
  // published numbers ARE this function's numbers, so the witness can compare them.
  function largestRect(g, cols, rows) {
    var hgt = new Int32Array(cols), best = { area: 0 };
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) hgt[c] = g[r * cols + c] ? hgt[c] + 1 : 0;
      var st = [];
      for (var c2 = 0; c2 <= cols; c2++) {
        var h = c2 === cols ? 0 : hgt[c2], start = c2;
        while (st.length && st[st.length - 1].h >= h) {
          var t = st.pop(), area = t.h * (c2 - t.c);
          if (area > best.area) best = { area: area, c0: t.c, c1: c2 - 1, r0: r - t.h + 1, r1: r };
          start = t.c;
        }
        st.push({ c: start, h: h });
      }
    }
    return best.area ? best : null;
  }

  A.flyoutBeatsBuild = function (plan, filmSecFull) {
    if (_built) return _report;
    _built = true; _beats = [];
    _report = { state: 'INCONCLUSIVE', why: null, beats: [], wings: [], sills: [], rejected: [], window: null, samples: 0 };
    var T = window.THREE, SR = window.StoreyRaster;
    function fail(state, why) { _report.state = state; _report.why = why; log('§FLYOUT_BEAT ' + state + ' — ' + why); return _report; }
    if (!T || !SR || typeof A.ifc2three !== 'function' || typeof A.dbQuery !== 'function') return fail('INCONCLUSIVE', 'no THREE / StoreyRaster / ifc2three / dbQuery');
    if (!plan || typeof plan.poseAt !== 'function' || !plan.beats) return fail('INCONCLUSIVE', 'no plan.poseAt / plan.beats');
    // §38.2's window: the pull-out through the pull-back, i.e. from `out` to the reveal round's
    // start. Both fractions are the plan's own; nothing here re-derives a beat second.
    var b = plan.beats;
    // ⚠ the plan's beat object names the second round `reveal`, NOT `round2` — `round2` is only the
    // §CINEMA_BEATS LOG's label for the same fraction (effects.js:9055 is the object). Reading a
    // `round2` that does not exist fell through to `rise` and opened the window to 187.8 s, which put
    // a wing cue at 168.6 s in the middle of the discipline parade. §38.2's window is out→reveal.
    var t0 = (b.out != null ? b.out : b.pullout) * filmSecFull;
    var t1 = (b.reveal != null ? b.reveal : b.rise) * filmSecFull;
    if (!(t1 - t0 > SLOT)) return fail('VACUOUS', 'the fly-out window is ' + (t1 - t0).toFixed(2) + 's, shorter than one ' + SLOT + 's slot (HHS has no pull-out stretch at all — §37)');
    _report.window = { from: +t0.toFixed(2), to: +t1.toFixed(2) };

    // ── 1. the largest planar plate and its storey raster
    var slab;
    try {
      slab = A.dbQuery("SELECT m.guid, m.storey, m.element_name, t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z " +
        "FROM elements_meta m JOIN element_transforms t USING(guid) WHERE m.ifc_class='IfcSlab' " +
        "AND t.bbox_z < 0.5*MIN(t.bbox_x,t.bbox_y) ORDER BY t.bbox_x*t.bbox_y DESC LIMIT 1") || [];
    } catch (e) { return fail('INCONCLUSIVE', 'elements_meta/element_transforms: ' + e.message); }
    if (!slab.length) return fail('VACUOUS', 'no planar IfcSlab in this model');
    var S = { guid: slab[0][0], storey: slab[0][1], name: slab[0][2], cx: +slab[0][3], cy: +slab[0][4], cz: +slab[0][5],
              bx: +slab[0][6], by: +slab[0][7], bz: +slab[0][8] };
    var rr;
    try { rr = A.dbQuery('SELECT storey,res,x0,y0,cols,rows,bits FROM storey_walkable_raster WHERE storey=?', [S.storey]) || []; }
    catch (e2) { return fail('INCONCLUSIVE', 'storey_walkable_raster: ' + e2.message); }
    if (!rr.length) return fail('VACUOUS', 'no walkable raster for the largest plate\'s storey "' + S.storey + '"');
    var R = SR.fromRow(rr[0]), cols = R.cols, rows = R.rows, res = R.res;
    var g = new Uint8Array(cols * rows), setN = 0;
    for (var r0 = 0; r0 < rows; r0++) for (var c0 = 0; c0 < cols; c0++) { var bit = SR.getBit(R.bits, cols, c0, r0); g[r0 * cols + c0] = bit; setN += bit; }
    log('§FLYOUT_BEAT_PLATE guid=' + S.guid + ' storey="' + S.storey + '" ' + S.bx.toFixed(2) + '×' + S.by.toFixed(2) +
        ' m raster=' + cols + '×' + rows + '@' + res + 'm walkable=' + fmt(setN * res * res) + ' m²');

    // ── 2. WINGS
    var zTop = S.cz + S.bz / 2;
    for (var k = 0; k < MAX_WINGS * 3 && _report.wings.length < MAX_WINGS; k++) {
      var box = largestRect(g, cols, rows);
      if (!box) break;
      for (var rr2 = box.r0; rr2 <= box.r1; rr2++) for (var cc = box.c0; cc <= box.c1; cc++) g[rr2 * cols + cc] = 0;
      var wM = (box.c1 - box.c0 + 1) * res, dM = (box.r1 - box.r0 + 1) * res, aM = wM * dM;
      var longM = Math.max(wM, dM), shortM = Math.min(wM, dM);
      var rec = { i: _report.wings.length, wM: +wM.toFixed(2), dM: +dM.toFixed(2), aM: +aM.toFixed(1), longM: +longM.toFixed(2), shortM: +shortM.toFixed(2),
                  axis: wM >= dM ? 'x' : 'y', x0: R.x0 + box.c0 * res, x1: R.x0 + (box.c1 + 1) * res, y0: R.y0 + box.r0 * res, y1: R.y0 + (box.r1 + 1) * res };
      if (aM < MIN_AREA_M2) { _report.rejected.push({ what: 'wing', dims: wM.toFixed(2) + '×' + dM.toFixed(2), why: 'area ' + aM.toFixed(0) + ' m² < ' + MIN_AREA_M2 }); continue; }
      if (longM < MIN_LONG_M) { _report.rejected.push({ what: 'wing', dims: wM.toFixed(2) + '×' + dM.toFixed(2), why: 'long side < ' + MIN_LONG_M + ' m' }); continue; }
      if (shortM < MIN_SHORT_M) { _report.rejected.push({ what: 'wing', dims: wM.toFixed(2) + '×' + dM.toFixed(2), why: 'short side ' + shortM.toFixed(2) + ' m < ' + MIN_SHORT_M + ' — a corridor run, not a wing' }); continue; }
      _report.wings.push(rec);
      log('§FLYOUT_BEAT_WING i=' + rec.i + ' ' + rec.wM.toFixed(2) + '×' + rec.dM.toFixed(2) + ' m = ' + fmt(rec.aM) +
          ' m² long=' + rec.longM.toFixed(2) + 'm axis=' + rec.axis);
    }
    _report.rejected.filter(function (x) { return x.what === 'wing'; }).forEach(function (x) { log('§FLYOUT_BEAT_WING_REJECT ' + x.dims + ' m — ' + x.why); });

    // ── 3. ROOF EDGE → WINDOW SILL, per facade
    var roofTopZ = null, wins = [];
    try {
      var rz = A.dbQuery("SELECT MAX(t.center_z + t.bbox_z/2.0) FROM elements_meta m JOIN element_transforms t USING(guid) WHERE m.ifc_class IN ('IfcRoof','IfcSlab')") || [];
      if (rz.length && rz[0][0] != null) roofTopZ = +rz[0][0];
      wins = (A.dbQuery("SELECT m.guid, m.storey, t.center_x, t.center_y, t.center_z, t.bbox_z FROM elements_meta m JOIN element_transforms t USING(guid) WHERE m.ifc_class='IfcWindow'") || [])
        .map(function (w) { return { guid: w[0], storey: w[1], cx: +w[2], cy: +w[3], cz: +w[4], bz: +w[5] }; });
    } catch (e3) { log('§FLYOUT_BEAT_SILL INCONCLUSIVE — ' + e3.message); }
    if (!wins.length || roofTopZ == null) {
      log('§FLYOUT_BEAT_SILL VACUOUS — ' + (!wins.length ? 'no placed IfcWindow' : 'no roof/slab top') + '; the facade-height beat is skipped, not faked');
    } else {
      var ex = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
      wins.forEach(function (w) { ex.x0 = Math.min(ex.x0, w.cx); ex.x1 = Math.max(ex.x1, w.cx); ex.y0 = Math.min(ex.y0, w.cy); ex.y1 = Math.max(ex.y1, w.cy); });
      var facades = { N: [], S: [], E: [], W: [] };
      wins.forEach(function (w) {
        var d = { W: w.cx - ex.x0, E: ex.x1 - w.cx, S: w.cy - ex.y0, N: ex.y1 - w.cy };
        facades[Object.keys(d).sort(function (a2, b2) { return d[a2] - d[b2]; })[0]].push(w);
      });
      Object.keys(facades).forEach(function (f) {
        var list = facades[f];
        if (!list.length) { log('§FLYOUT_BEAT_SILL facade=' + f + ' VACUOUS — no IfcWindow nearest this side'); return; }
        var top = list.slice().sort(function (a2, b2) { return (b2.cz - b2.bz / 2) - (a2.cz - a2.bz / 2); })[0];
        var sillZ = top.cz - top.bz / 2;
        _report.sills.push({ facade: f, guid: top.guid, storey: top.storey, sillZ: +sillZ.toFixed(3), roofTopZ: +roofTopZ.toFixed(3), drop: +(roofTopZ - sillZ).toFixed(3), n: list.length, cx: top.cx, cy: top.cy });
        log('§FLYOUT_BEAT_SILL facade=' + f + ' n=' + list.length + ' storey="' + top.storey + '" sillZ=' + sillZ.toFixed(2) +
            ' roofTopZ=' + roofTopZ.toFixed(2) + ' roofEdgeToSill=' + (roofTopZ - sillZ).toFixed(2) + ' m guid=' + top.guid);
      });
    }

    // ── 4. SLOTTING. Every candidate is scored by its HELD legibility over (t, t+1.1, t+2.1) with
    // BOTH ends of the dimension in frame — the PoC's first cut accepted one end and scored a 72 m
    // wing at 2,200 px on a 1,280 px frame, which is an arrow running off both sides of the picture.
    var Wpx = (A.renderer && A.renderer.domElement && A.renderer.domElement.width) || 1280;
    var Hpx = (A.renderer && A.renderer.domElement && A.renderer.domElement.height) || 720;
    var cam = A.camera;
    if (!cam) return fail('INCONCLUSIVE', 'no camera to score legibility against');
    var taken = [];
    if (typeof A.flythruCuesWindows === 'function') A.flythruCuesWindows().forEach(function (w) { taken.push({ from: w.from, to: w.to, who: 'cue:' + w.key }); });
    var sb = (typeof A.slabBeatReport === 'function') ? A.slabBeatReport() : null;
    if (sb && sb.state === 'BEAT' && sb.beat) taken.push({ from: sb.beat.sec, to: sb.beat.sec + SLOT, who: 'plate' });
    var lb = (typeof A.linearBeatReport === 'function') ? A.linearBeatReport() : null;
    if (lb && lb.picks) lb.picks.forEach(function (p) { taken.push({ from: p.sec, to: p.sec + SLOT, who: p.cls }); });
    var ib = (typeof A.indoorBeatsReport === 'function') ? A.indoorBeatsReport() : null;
    if (ib && ib.beats) ib.beats.forEach(function (p) { if (p.sec != null) taken.push({ from: p.sec, to: p.sec + SLOT, who: 'indoor:' + p.key }); });
    if (taken.length) log('§FLYOUT_BEAT_TAKEN ' + taken.map(function (w) { return w.who + ' ' + w.from.toFixed(2) + '-' + w.to.toFixed(2); }).join(' | '));

    var subjects = _report.wings.map(function (w) {
      var a = w.axis === 'x' ? A.ifc2three(w.x0, (w.y0 + w.y1) / 2, zTop) : A.ifc2three((w.x0 + w.x1) / 2, w.y0, zTop);
      var b2 = w.axis === 'x' ? A.ifc2three(w.x1, (w.y0 + w.y1) / 2, zTop) : A.ifc2three((w.x0 + w.x1) / 2, w.y1, zTop);
      return { key: 'wing' + w.i, title: 'Wing span', metres: w.longM.toFixed(2) + ' m',
               rows: [w.longM.toFixed(2) + ' m long × ' + w.shortM.toFixed(2) + ' m wide', fmt(w.aM) + ' m² · ' + S.storey],
               a: new T.Vector3(a.x, a.y, a.z), b: new T.Vector3(b2.x, b2.y, b2.z) };
    }).concat(_report.sills.map(function (s2) {
      var a = A.ifc2three(s2.cx, s2.cy, s2.sillZ), b2 = A.ifc2three(s2.cx, s2.cy, s2.roofTopZ);
      return { key: 'sill' + s2.facade, title: 'Roof edge to sill', metres: s2.drop.toFixed(2) + ' m',
               rows: [s2.drop.toFixed(2) + ' m roof edge to sill', s2.facade + ' facade · ' + s2.n + ' windows'],
               a: new T.Vector3(a.x, a.y, a.z), b: new T.Vector3(b2.x, b2.y, b2.z) };
    }));
    if (!subjects.length) return fail('VACUOUS', 'no wing and no facade height survived the rules above');

    var saveP = cam.position.clone(), saveQ = cam.quaternion.clone();
    function pxLen(sub, t) {
      var p = plan.poseAt(t / filmSecFull);
      cam.position.set(p.x, p.y, p.z); cam.lookAt(p.tx, p.ty, p.tz); cam.updateMatrixWorld(true);
      var A2 = sub.a.clone().project(cam), B2 = sub.b.clone().project(cam);
      if (A2.z >= 1 || B2.z >= 1) return null;
      var inF = function (q) { return Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1; };
      if (!inF(A2) || !inF(B2)) return null;
      return Math.hypot((B2.x - A2.x) / 2 * Wpx, (B2.y - A2.y) / 2 * Hpx);
    }
    var scored = subjects.map(function (sub) {
      var best = null;
      for (var t = t0; t <= t1 - ENV_SPAN; t += STEP) {
        var l0 = pxLen(sub, t), l1 = pxLen(sub, t + HOLD[1]), l2 = pxLen(sub, t + HOLD[2]);
        if (l0 == null || l1 == null || l2 == null) continue;
        var held = Math.min(l0, l1, l2);
        if (!best || held > best.held) best = { t: +t.toFixed(2), held: +held.toFixed(1) };
      }
      return { sub: sub, best: best };
    });
    cam.position.copy(saveP); cam.quaternion.copy(saveQ); cam.updateMatrixWorld(true);
    _report.samples = Math.round((t1 - ENV_SPAN - t0) / STEP) + 1;

    scored.sort(function (a2, b2) { return (b2.best ? b2.best.held : -1) - (a2.best ? a2.best.held : -1); });
    function free(t) { return taken.every(function (w) { return t + SLOT <= w.from || t >= w.to; }); }
    scored.forEach(function (x) {
      if (_beats.length >= MAX_CUES) { _report.rejected.push({ what: x.sub.key, why: 'no slot left — §1 takes ' + MAX_CUES }); return; }
      if (!x.best) { _report.rejected.push({ what: x.sub.key, why: 'never held wholly in frame for ' + HOLD[2] + ' s inside the window' });
        log('§FLYOUT_BEAT_SCORE key=' + x.sub.key + ' NO-SLOT — never held wholly in frame'); return; }
      if (x.best.held < MIN_PX) { _report.rejected.push({ what: x.sub.key, why: 'held ' + x.best.held + ' px < ' + MIN_PX });
        log('§FLYOUT_BEAT_SCORE key=' + x.sub.key + ' heldPx=' + x.best.held + ' BELOW ' + MIN_PX + 'px — declined'); return; }
      if (!free(x.best.t)) { _report.rejected.push({ what: x.sub.key, why: 'best second ' + x.best.t + 's collides with another layer\'s window' });
        log('§FLYOUT_BEAT_SCORE key=' + x.sub.key + ' heldPx=' + x.best.held + ' SLOT-TAKEN at ' + x.best.t + 's'); return; }
      var beat = { key: x.sub.key, sec: x.best.t, heldPx: x.best.held, title: x.sub.title, metres: x.sub.metres,
                   rows: x.sub.rows, a: x.sub.a, b: x.sub.b };
      _beats.push(beat);
      taken.push({ from: beat.sec, to: beat.sec + SLOT, who: 'flyout:' + beat.key });
      log('§FLYOUT_BEAT_SCORE key=' + x.sub.key + ' sec=' + x.best.t + 's heldPx=' + x.best.held + ' LEGIBLE "' + x.sub.rows[0] + '"');
    });
    _report.beats = _beats.map(function (b3) { return { key: b3.key, sec: b3.sec, heldPx: b3.heldPx, title: b3.title, metres: b3.metres, rows: b3.rows.slice(),
      a: [b3.a.x, b3.a.y, b3.a.z], b: [b3.b.x, b3.b.y, b3.b.z] }; });
    _report.state = _beats.length ? 'BEATS' : 'VACUOUS';
    if (!_beats.length) _report.why = 'every candidate was rejected — see §FLYOUT_BEAT_SCORE lines';
    log('§FLYOUT_BEAT_PICK state=' + _report.state + ' window=' + t0.toFixed(2) + '-' + t1.toFixed(2) + 's samples=' + _report.samples +
        ' subjects=' + subjects.length + ' cued=' + _beats.length + '/' + MAX_CUES +
        ' [' + _beats.map(function (b3) { return b3.key + '@' + b3.sec + 's'; }).join(' ') + ']' +
        ' rejected=' + _report.rejected.length);
    return _report;
  };

  // ── the 2D pass. Same contract as every other beat: the arrowed dimension is an in-model mark, the
  // figure posts to the fixed §MEASURE_BOX (§38.1a).
  A.flyoutBeatsCompositeOntoCanvas = function (ctx, w, h, filmSec) {
    if (!_beats.length || !ctx || !A.camera || typeof A.flythruDrawDim !== 'function') return 0;
    var cam = A.camera, k = h / 720, drawn = 0;
    _beats.forEach(function (b) {
      var op = envAt(filmSec - b.sec);
      if (op <= 0) return;
      var A2 = A.flythruProj(b.a, cam, w, h), B2 = A.flythruProj(b.b, cam, w, h);
      if (A2.z >= 1 || B2.z >= 1) return;
      ctx.save(); ctx.globalAlpha = op;
      var ok = A.flythruDrawDim(ctx, A2, B2, b.metres, INK, k, true);
      ctx.restore();
      if (!ok) return;
      drawn++;
      if (A.filmBoxesMeasurePost) A.filmBoxesMeasurePost(b.title, b.rows, INK);
      var key = b.key + '|' + Math.floor(filmSec * 2);
      if (!_lastLog[key]) { _lastLog[key] = 1; log('§FLYOUT_BEAT_DRAW key=' + b.key + ' filmSec=' + filmSec.toFixed(2) + ' op=' + op.toFixed(2) + ' ' + b.metres); }
    });
    return drawn;
  };
  A.flyoutBeatsReport = function () { return _report; };
  A.flyoutBeatsWindows = function () { return _beats.map(function (b) { return { key: b.key, from: b.sec, to: b.sec + SLOT }; }); };
  A.flyoutBeatsDispose = function () { _built = false; _report = null; _beats = []; _lastLog = {}; };
  log('§FLYOUT_BEATS_INIT wired (wing spans from the largest plate\'s raster + roof-edge-to-sill facade heights, ' +
      'slotted into the pull-out window by held legibility; rides Measure)');
}
if (typeof window !== 'undefined') window.setupCpeFlyoutBeats = setupCpeFlyoutBeats;
