/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * cpe_linear_beat.js — §LINEAR_BEAT: a column and a beam, measured as they go up.
 * Implementing bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §27 (+ §27.5 decisions). Witness: W-LINEAR-BEAT
 * (viewer/tests/witness_linear_beat.js). Rides the Alt-C Measure checkbox with the datum and the slab beat.
 *
 * USER (2026-09-08): "While beams and columns are going up, can we catch any and show their length with arrow
 * line cues?" · "catch also a good beam and column without overlapping with good label boxes [IFCtype
 * semantic, measure mm with arrow line cues]" · "we are after beam/col only."
 *
 * ── WHAT IT DOES ─────────────────────────────────────────────────────────────────────────────────
 * ONE column and ONE beam (§1: one cue per capability), each a §14 slot (2.2 s envelope + 0.5 s clear) inside
 * the dive, never overlapping each other or the floor plate's slot — which is READ from cpe_slab_beat.js
 * (§27.3d), never re-solved. The pop second is the bake's own clock (A.slabBeatClock, §26.8). Candidates are
 * ranked by PROJECTED length at their own pop second through plan.poseAt (§27.5.2) — a 9.7 m stick seen from
 * 100 m is a few pixels, and a mark nobody can see is the silent failure §24.12 names. The label prints the
 * TRUE length of the placed instance (§27.3b) and the IFC type semantic unless that semantic repeats the number.
 *
 * ── THE DATUM-RESTATEMENT GUARD (§27.3c, both classes) ──────────────────────────────────────────
 * A column's height IS a storey height; a beam's length is often a bay. The datum already prints both. Any
 * candidate within 2 % of a figure the datum draws (A.flythruDatumFigures: storeys, overalls, bays) says
 * nothing new and is rejected — MEASURED on Hospital: 181 of 427 in-dive columns, the modal type included.
 *
 * ── CAN SAY NO (PRIMAL LAW §4) ───────────────────────────────────────────────────────────────────
 *   VACUOUS <class>   none in the model (HHS has zero IfcBeam)
 *   INCONCLUSIVE      no plan / buildup off / no clock / no datum figures
 *   NOFIT             the dive cannot hold a slot, or no free slot remains — nothing squeezed
 *   NOTHING <class>   candidates exist but none is legible in frame at its own second
 */
function setupCpeLinearBeat(A) {
  if (!A) return;
  var ENV = { fadeIn: 0.6, hold: 1.0, fadeOut: 0.6 }, ENV_SPAN = 2.2, GAP = 0.5, SLOT = ENV_SPAN + GAP;   // §14
  var DATUM_TOL = 0.02;        // §27.3c — within 2 % of a datum figure restates it
  var STICK = 4;               // §27.5.4 — long side ≥ 4× the other two
  var MIN_LEN = 1.0;           // a stick shorter than this is trim, not structure
  var MIN_PX = 24;             // the cues' own "too short to read" floor (drawDim), at 720 px
  var INK = '#ffd600';         // §7's measurement ink

  var _built = false, _report = null, _picks = [], _lastLog = {};
  function log(s) { console.log(s); }
  function semanticName(raw) { if (!raw) return null; var p = String(raw).split(':'); return (p.length >= 3 ? p.slice(1, p.length - 1).join(':') : String(raw)).trim(); }
  function fmtMM(m) { return Math.round(m * 1000).toLocaleString('en-US'); }

  A.linearBeatBuild = function (plan, filmSecFull, bkState, cursorTotalSec) {
    if (_built) return _report;
    _built = true; _picks = [];
    _report = { state: 'INCONCLUSIVE', why: null, rows: [], picks: [], clock: null, slots: [] };
    var T = window.THREE;
    function fail(state, why) { _report.state = state; _report.why = why; log('§LINEAR_BEAT ' + state + ' — ' + why); return _report; }
    if (!T || typeof A.ifc2three !== 'function' || typeof A.dbQuery !== 'function') return fail('INCONCLUSIVE', 'no THREE / A.ifc2three / A.dbQuery');
    if (!plan || typeof plan.poseAt !== 'function' || !(plan.beats && plan.beats.dive > 0)) return fail('INCONCLUSIVE', 'no plan.poseAt / no dive beat');
    if (!bkState) return fail('INCONCLUSIVE', 'buildup off — nothing goes up, so there is nothing to catch going up');
    if (typeof A.slabBeatClock !== 'function' || typeof window.tmGuidEndTs !== 'function') return fail('INCONCLUSIVE', 'no owner clock (A.slabBeatClock) / no tmGuidEndTs');
    if (!(filmSecFull > 0)) return fail('INCONCLUSIVE', 'filmSecFull ' + filmSecFull);
    if (!(cursorTotalSec > 0)) cursorTotalSec = filmSecFull;
    var figs = (typeof A.flythruDatumFigures === 'function') ? A.flythruDatumFigures() : null;
    if (!figs) return fail('INCONCLUSIVE', 'no datum figures — the datum must be built first (Measure on)');
    var guardStorey = figs.storeys.concat(figs.overalls), guardBay = figs.bays.concat(figs.overalls);
    var diveSec = plan.beats.dive * filmSecFull;
    var clock = A.slabBeatClock(plan, bkState, filmSecFull, cursorTotalSec);
    _report.clock = { filmSecFull: filmSecFull, diveSec: diveSec, monotone: clock.monotone };
    log('§LINEAR_BEAT_CLOCK filmSec=' + filmSecFull.toFixed(2) + ' diveSec=' + diveSec.toFixed(2) + ' slotSec=' + SLOT.toFixed(1) + ' monotone=' + (clock.monotone ? 'yes' : 'NO') +
        ' — owner clock (A.slabBeatClock), pop = end_ts');
    log('§LINEAR_BEAT_DATUM storeys=[' + figs.storeys.map(function (v) { return v.toFixed(2); }).join(',') + '] bays=' + figs.bays.length + ' (' +
        (figs.bays.length ? Math.min.apply(null, figs.bays).toFixed(2) + '–' + Math.max.apply(null, figs.bays).toFixed(2) : '–') + ' m) overalls=[' +
        figs.overalls.map(function (v) { return v.toFixed(2); }).join(',') + '] tol=' + (DATUM_TOL * 100) + '%');
    if (!clock.monotone) return fail('INCONCLUSIVE', 'clock not monotone');
    if (diveSec < SLOT) return fail('NOFIT', 'dive ' + diveSec.toFixed(2) + 's < one ' + SLOT.toFixed(1) + 's slot — nothing squeezed (§14)');

    // slots: the plate's is the owner's decision (§27.3d)
    var taken = [];
    var sb = (typeof A.slabBeatReport === 'function') ? A.slabBeatReport() : null;
    if (sb && sb.state === 'BEAT' && sb.beat) { taken.push({ from: sb.beat.sec, to: sb.beat.sec + SLOT, who: 'plate' }); }
    // §14 across layers: the cues module's own windows (envelope, storey, room, corridor) are occupied screen too
    if (typeof A.flythruCuesWindows === 'function') A.flythruCuesWindows().forEach(function (w) { taken.push({ from: w.from, to: w.to, who: 'cue:' + w.key }); });
    log('§LINEAR_BEAT_TAKEN ' + (taken.length ? taken.map(function (w) { return w.who + ' ' + w.from.toFixed(2) + '-' + w.to.toFixed(2); }).join(' | ') : 'none') + ' — slots already claimed by the plate and the 2D cues (§14 across layers)');
    function free(t) { return taken.every(function (w) { return t + SLOT <= w.from || t >= w.to; }); }
    var ends = window.tmGuidEndTs();
    var W = (A.renderer && A.renderer.domElement && A.renderer.domElement.width) || 1280, H = (A.renderer && A.renderer.domElement && A.renderer.domElement.height) || 720;
    var k = H / 720;

    function candidates(cls, wantVertical) {
      var rows = [];
      try { rows = A.dbQuery("SELECT m.guid, m.element_name, m.storey, t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z FROM elements_meta m JOIN element_transforms t ON m.guid = t.guid WHERE m.ifc_class = ?", [cls]) || []; } catch (e) { rows = []; }
      var out = [], n = rows.length, sticks = 0, inDive = 0, guarded = 0, noEnd = 0;
      rows.forEach(function (v) {
        var bx = +v[6], by = +v[7], bz = +v[8], cx = +v[3], cy = +v[4], cz = +v[5];
        var vert = bz >= STICK * Math.max(bx, by), horzX = bx >= STICK * Math.max(by, bz), horzY = by >= STICK * Math.max(bx, bz);
        if (wantVertical ? !vert : !(horzX || horzY)) return;
        var len = wantVertical ? bz : (horzX ? bx : by);
        if (len < MIN_LEN) return;
        sticks++;
        var e = ends[v[0]]; if (e == null) { noEnd++; return; }
        var sec = clock.secOf(e); if (sec == null) return;
        if (!(sec + ENV_SPAN <= diveSec)) return;
        inDive++;
        var guard = wantVertical ? guardStorey : guardBay, hit = null;
        for (var gi = 0; gi < guard.length; gi++) if (Math.abs(len - guard[gi]) <= DATUM_TOL * guard[gi]) { hit = guard[gi]; break; }
        if (hit != null) { guarded++; return; }
        var a = wantVertical ? [cx, cy, cz - bz / 2] : (horzX ? [cx - bx / 2, cy, cz] : [cx, cy - by / 2, cz]);
        var b = wantVertical ? [cx, cy, cz + bz / 2] : (horzX ? [cx + bx / 2, cy, cz] : [cx, cy + by / 2, cz]);
        var pa = A.ifc2three(a[0], a[1], a[2]), pb = A.ifc2three(b[0], b[1], b[2]);
        out.push({ cls: cls, guid: v[0], rawName: v[1], name: semanticName(v[1]), storey: String(v[2] == null ? 'Unknown' : v[2]), len: len, sec: sec, endTs: e,
                   a3: new T.Vector3(pa.x, pa.y, pa.z), b3: new T.Vector3(pb.x, pb.y, pb.z), vertical: wantVertical });
      });
      log('§LINEAR_BEAT_POOL cls=' + cls + ' n=' + n + ' sticks=' + sticks + ' noEndTs=' + noEnd + ' completeInDive=' + inDive + ' rejectedAsDatumRestatement=' + guarded + ' pool=' + out.length);
      return out;
    }
    function projectedAt(c) {   // the camera the bake flies at the element's OWN pop second
      var p = plan.poseAt(c.sec / filmSecFull), cam = A.camera.clone();
      cam.position.set(p.x, p.y, p.z); cam.lookAt(p.tx, p.ty, p.tz); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
      var qa = c.a3.clone().project(cam), qb = c.b3.clone().project(cam);
      var inA = Math.abs(qa.x) <= 1 && Math.abs(qa.y) <= 1 && qa.z < 1, inB = Math.abs(qb.x) <= 1 && Math.abs(qb.y) <= 1 && qb.z < 1;
      var px = Math.hypot((qa.x - qb.x) / 2 * W, (qa.y - qb.y) / 2 * H);
      return { px: px, inFrame: inA && inB, dist: c.a3.clone().lerp(c.b3, 0.5).distanceTo(cam.position) };
    }
    var classes = [{ cls: 'IfcColumn', vertical: true, word: 'height' }, { cls: 'IfcBeam', vertical: false, word: 'length' }];
    var pools = {};
    classes.forEach(function (C) {
      var pool = candidates(C.cls, C.vertical);
      if (!pool.length) { var nAll = 0; try { nAll = (A.dbQuery("SELECT COUNT(*) FROM elements_meta WHERE ifc_class=?", [C.cls]) || [[0]])[0][0]; } catch (e) {}
        log('§LINEAR_BEAT_' + C.cls + (nAll ? ' NOTHING — ' + nAll + ' in the model, none is a stick completing inside the dive past the datum guard' : ' VACUOUS — none in this model')); pools[C.cls] = []; return; }
      pool.forEach(function (c) { var pr = projectedAt(c); c.px = pr.px; c.inFrame = pr.inFrame; c.dist = pr.dist; });
      var legible = pool.filter(function (c) { return c.inFrame && c.px >= MIN_PX * k; }).sort(function (x, y) { return y.px - x.px; });
      log('§LINEAR_BEAT_RANK cls=' + C.cls + ' legibleInFrame=' + legible.length + '/' + pool.length + ' top=[' + legible.slice(0, 3).map(function (c) { return fmtMM(c.len) + 'mm@' + c.sec.toFixed(2) + 's ' + c.px.toFixed(0) + 'px'; }).join(' | ') + ']');
      pools[C.cls] = legible;
    });
    // allocation (§27.5.5, refined by the witness): try BOTH class orders against the already-taken windows and keep the
    // assignment with MORE picks, then the larger projected size. Greedy-by-best-px placed Hospital's beam in the only
    // window that also fit a column, and the column had nowhere to go.
    function assign(orderArr) {
      var tk = taken.slice(), res = [];
      orderArr.forEach(function (C) {
        var got = null;
        for (var i = 0; i < pools[C.cls].length; i++) { var c = pools[C.cls][i]; if (tk.every(function (w) { return c.sec + SLOT <= w.from || c.sec >= w.to; })) { got = c; break; } }
        if (got) { tk.push({ from: got.sec, to: got.sec + SLOT, who: C.cls }); res.push({ C: C, got: got }); }
      });
      return res;
    }
    var orders = [classes, classes.slice().reverse()], best = null;
    orders.forEach(function (o) { var r = assign(o), px = r.reduce(function (a, x) { return a + x.got.px; }, 0); if (!best || r.length > best.r.length || (r.length === best.r.length && px > best.px)) best = { r: r, px: px, o: o }; });
    log('§LINEAR_BEAT_ALLOC orders tried=2 picks=' + best.r.length + ' order=[' + best.o.map(function (C) { return C.cls; }).join('>') + ']');
    classes.forEach(function (C) {
      var hit = best.r.filter(function (x) { return x.C === C; })[0], got = hit ? hit.got : null;
      if (!got) { log('§LINEAR_BEAT_SLOT cls=' + C.cls + ' NOFIT — ' + (pools[C.cls].length ? pools[C.cls].length + ' legible candidate(s), none in a free slot; dropped, not squeezed (§14)' : 'no legible candidate')); return; }
      taken.push({ from: got.sec, to: got.sec + SLOT, who: C.cls });
      var label = fmtMM(got.len) + ' mm';
      var sem = got.name || '';
      if (sem && sem.indexOf(String(Math.round(got.len * 1000))) >= 0) sem = '';       // §27.3e — never repeat the cue's number
      got.word = C.word; got.label = label; got.sem = sem;
      _picks.push(got);
      log('§LINEAR_BEAT_PICK cls=' + C.cls + ' sec=' + got.sec.toFixed(2) + ' slot=' + got.sec.toFixed(2) + '-' + (got.sec + SLOT).toFixed(2) + ' ' + C.word + '=' + label + ' px@pop=' + got.px.toFixed(0) +
          ' dist=' + got.dist.toFixed(1) + 'm storey="' + got.storey + '" semantic="' + (sem || '(dropped: ' + (got.name || 'none') + ')') + '" guid=' + got.guid);
    });
    _report.slots = taken.map(function (w) { return { from: +w.from.toFixed(3), to: +w.to.toFixed(3), who: w.who }; });
    _report.rows = classes.map(function (C) { return (pools[C.cls] || []).slice(0, 5).map(function (c) { return { cls: c.cls, guid: c.guid, rawName: c.rawName, name: c.name, storey: c.storey, len: +c.len.toFixed(4), sec: +c.sec.toFixed(3), px: +c.px.toFixed(1), inFrame: c.inFrame, picked: _picks.indexOf(c) >= 0 }; }); }).reduce(function (a, b) { return a.concat(b); }, []);
    _report.picks = _picks.map(function (c) { return { cls: c.cls, guid: c.guid, sec: +c.sec.toFixed(3), len: +c.len.toFixed(4), label: c.label, sem: c.sem, word: c.word, px: +c.px.toFixed(1), storey: c.storey, rawName: c.rawName }; });
    _report.figures = figs;
    _report.state = _picks.length ? 'BEAT' : 'NOTHING';
    if (!_picks.length) log('§LINEAR_BEAT NOTHING drawn=0 — no column or beam is legible in a free slot inside the dive');
    return _report;
  };

  function envAt(dt) { if (dt < 0) return 0; if (dt < ENV.fadeIn) return dt / ENV.fadeIn; if (dt < ENV.fadeIn + ENV.hold) return 1; if (dt < ENV_SPAN) return 1 - (dt - ENV.fadeIn - ENV.hold) / ENV.fadeOut; return 0; }

  // 2D pass — composited beside the cues (cinema_maxq _captureFrame). Same standard cue as §7: extension lines,
  // inward arrows, the value breaking the line; a small plate with the IFC semantic beside it.
  A.linearBeatCompositeOntoCanvas = function (ctx, w, h, filmSec) {
    if (!_picks.length || !ctx || !A.camera || typeof A.flythruDrawDim !== 'function') return 0;
    var cam = A.camera, k = h / 720, drawn = 0;
    _picks.forEach(function (c) {
      var op = envAt(filmSec - c.sec); if (op <= 0) return;
      var A2 = A.flythruProj(c.a3, cam, w, h), B2 = A.flythruProj(c.b3, cam, w, h);
      if (A2.z >= 1 || B2.z >= 1) return;
      ctx.save(); ctx.globalAlpha = op;
      var ok = A.flythruDrawDim(ctx, A2, B2, c.len, INK, k, true);     // span decided at allocation — force (W1 lock rule)
      if (ok) {
        drawn++;
        if (c.sem) { var mid = { x: (A2.x + B2.x) / 2, y: (A2.y + B2.y) / 2 }; A.flythruDrawPanel(ctx, mid, [c.word + ' ' + c.label], c.sem, INK, k, w, h); }
        var key = c.cls + '|' + Math.floor(filmSec * 2);
        if (!_lastLog[key]) { _lastLog[key] = 1; console.log('§LINEAR_BEAT_DRAW cls=' + c.cls + ' filmSec=' + filmSec.toFixed(2) + ' op=' + op.toFixed(2) + ' px=' + Math.hypot(B2.x - A2.x, B2.y - A2.y).toFixed(0) + ' ' + c.word + '=' + c.label + (c.sem ? ' "' + c.sem + '"' : '')); }
      }
      ctx.restore();
    });
    return drawn;
  };
  A.linearBeatReport = function () { return _report; };
  A.linearBeatDispose = function () { _built = false; _report = null; _picks = []; _lastLog = {}; };
  log('§LINEAR_BEAT_INIT wired (one column + one beam per film, measured as they go up; 2D standard cue, rides Measure)');
}
if (typeof window !== 'undefined') window.setupCpeLinearBeat = setupCpeLinearBeat;
