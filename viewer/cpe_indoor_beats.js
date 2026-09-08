/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * cpe_indoor_beats.js — §INDOOR_BEATS: the hall, the stair, the opening, the clear height.
 * Implementing bim-compiler prompts/MEP_CLASH_REVEAL_MOVIE.md §29 (+ §29.8 decisions). Witness: W-INDOOR-BEATS
 * (viewer/tests/witness_indoor_beats.js). Rides the Alt-C Measure checkbox.
 *
 * USER (2026-09-08): "Once indoors i reckoned we pursue the hall area which most bakes will land first … So it label
 * 'Hall-Corridor, Walkable area: #m²'. The tint remains until frame out. … Along the way we can catch the stairs as
 * the next prize. … Otherwise catch a door or window gives its XY and area dims. A tallest point height in middle of
 * hallway will be also a killer."
 *
 * FOUR SLOTS, FOUR CAPABILITIES (§29.1) — hall walkable area · stair going · door type · clear height. No fifth.
 * Every number is read: the hall from storey_walkable_raster bounded at IfcDoor footprints (§29.2a), the stair and
 * door from element_transforms, the clear height from a DB column cast (§29.8.6). Nothing is composed.
 *
 * CAN SAY NO (PRIMAL LAW §4): INCONCLUSIVE (no plan / no datum / no raster for the camera's storey), VACUOUS <class>,
 * NOTHING <beat> with the rule that rejected it, §INDOOR_BEAT_CAMERA_BELOW_FLOOR for the HHS path (§29.7 item 3).
 */
function setupCpeIndoorBeats(A) {
  if (!A) return;
  var ENV = { fadeIn: 0.6, hold: 1.0, fadeOut: 0.6 }, ENV_SPAN = 2.2, GAP = 0.5, SLOT = ENV_SPAN + GAP;  // §14
  var STEP = 0.25, MIN_PX = 24, DATUM_TOL = 0.02, INK = '#ffd600', HALL_TINT = 0x3fa9f5;
  var _built = false, _report = null, _beats = [], _hall = null, _grp = null, _lastLog = {};
  function log(s) { console.log(s); }
  function fmt(n, dp) { var s = (+n).toFixed(dp == null ? 0 : dp), p = s.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); return p.join('.'); }
  function fmtMM(m) { return fmt(Math.round(m * 1000)); }
  function envAt(dt) { if (dt < 0) return 0; if (dt < ENV.fadeIn) return dt / ENV.fadeIn; if (dt < ENV.fadeIn + ENV.hold) return 1; if (dt < ENV_SPAN) return 1 - (dt - ENV.fadeIn - ENV.hold) / ENV.fadeOut; return 0; }
  function semanticName(raw) { if (!raw) return null; var p = String(raw).split(':'); return (p.length >= 3 ? p.slice(1, p.length - 1).join(':') : String(raw)).trim(); }

  A.indoorBeatsBuild = function (plan, filmSecFull, bkState) {
    if (_built) return _report;
    _built = true; _beats = []; _hall = null;
    _report = { state: 'INCONCLUSIVE', why: null, beats: [], window: null, belowFloor: 0, samples: 0, rejected: {} };
    var T = window.THREE, SR = window.StoreyRaster;
    function fail(state, why) { _report.state = state; _report.why = why; log('§INDOOR_BEAT ' + state + ' — ' + why); return _report; }
    if (!T || !SR || typeof A.ifc2three !== 'function' || typeof A.three2ifc !== 'function' || typeof A.dbQuery !== 'function') return fail('INCONCLUSIVE', 'no THREE / StoreyRaster / ifc2three / three2ifc / dbQuery');
    if (!plan || typeof plan.poseAt !== 'function' || !(plan.beats && plan.beats.dive > 0 && plan.beats.out > plan.beats.dive)) return fail('INCONCLUSIVE', 'no plan.poseAt or no dive→out window on the plan');
    var figs = (typeof A.flythruDatumFigures === 'function') ? A.flythruDatumFigures() : null;
    if (!figs || !figs.levels || figs.levels.length < 1) return fail('INCONCLUSIVE', 'no datum levels — the datum must be built first (Measure on)');
    var t0 = plan.beats.dive * filmSecFull, t1 = plan.beats.out * filmSecFull;
    _report.window = { from: +t0.toFixed(2), to: +t1.toFixed(2) };
    var W = (A.renderer && A.renderer.domElement && A.renderer.domElement.width) || 1280, H = (A.renderer && A.renderer.domElement && A.renderer.domElement.height) || 720, k = H / 720;

    // ── taken windows from every other layer (§14 across layers)
    var taken = [];
    if (typeof A.flythruCuesWindows === 'function') A.flythruCuesWindows().forEach(function (w) { taken.push({ from: w.from, to: w.to, who: 'cue:' + w.key }); });
    var sb = (typeof A.slabBeatReport === 'function') ? A.slabBeatReport() : null; if (sb && sb.state === 'BEAT' && sb.beat) taken.push({ from: sb.beat.sec, to: sb.beat.sec + SLOT, who: 'plate' });
    var lb = (typeof A.linearBeatReport === 'function') ? A.linearBeatReport() : null; if (lb && lb.picks) lb.picks.forEach(function (p) { taken.push({ from: p.sec, to: p.sec + SLOT, who: p.cls }); });
    function free(t) { return taken.every(function (w) { return t + SLOT <= w.from || t >= w.to; }); }

    // ── the samples: camera pose, storey, floor, forward heading
    var lv = figs.levels, names = figs.levelNames || [];
    function storeyAt(iz) { var idx = -1; for (var i = 0; i < lv.length; i++) if (lv[i] <= iz + 0.3) idx = i; return idx; }
    var samples = [], below = 0;
    for (var t = t0; t <= t1 + 1e-9; t += STEP) {
      var p = plan.poseAt(t / filmSecFull), c = A.three2ifc(p.x, p.y, p.z), tg = A.three2ifc(p.tx, p.ty, p.tz);
      var si = storeyAt(c.iz), floorZ = si >= 0 ? lv[si] : null;
      var s = { t: +t.toFixed(3), pose: p, ifc: c, si: si, storey: si >= 0 ? names[si] : null, floorZ: floorZ, camAbove: floorZ == null ? null : c.iz - floorZ,
                fwd: { x: tg.ix - c.ix, y: tg.iy - c.iy } };
      var L = Math.hypot(s.fwd.x, s.fwd.y) || 1; s.fwd.x /= L; s.fwd.y /= L;
      if (floorZ != null && c.iz < floorZ - 1.0) { s.below = true; below++; }
      samples.push(s);
    }
    _report.samples = samples.length; _report.belowFloor = below;
    log('§INDOOR_BEAT_WINDOW from=' + t0.toFixed(2) + 's to=' + t1.toFixed(2) + 's (beats dive→out) samples=' + samples.length + ' @' + STEP + 's storeys=' + names.join('|') +
        (below ? ' ⚠ §INDOOR_BEAT_CAMERA_BELOW_FLOOR samples=' + below + ' (' + samples.filter(function (s) { return s.below; })[0].t + 's…) — the PATH is under its floor there (§29.7 item 3)' : ''));

    function camFor(s) { var cam = A.camera.clone(); cam.position.set(s.pose.x, s.pose.y, s.pose.z); cam.lookAt(s.pose.tx, s.pose.ty, s.pose.tz); cam.updateMatrixWorld(true); cam.updateProjectionMatrix(); return cam; }
    function camAtSec(t) { var p = plan.poseAt(Math.min(1, t / filmSecFull)); return camFor({ pose: p }); }
    // INDOORS THE CAMERA WALKS PAST THINGS. A cue is legible only if it stays in frame for its whole envelope, so the
    // score is the MINIMUM projected size over (t, t+1.1, t+2.1) with all three in frame — MEASURED before this rule:
    // the max-at-one-instant pick put HHS's stair and Hospital's height cast behind the camera within a second.
    var ENV_SAMPLES = [0, 1.1, 2.1];
    function heldPx(a3, b3, t) { var mn = Infinity; for (var i = 0; i < ENV_SAMPLES.length; i++) { var m = pxOf(a3, b3, camAtSec(t + ENV_SAMPLES[i])); if (!m.inF) return { px: 0, inF: false }; if (m.px < mn) mn = m.px; } return { px: mn, inF: true }; }
    function P3(ix, iy, iz) { var v = A.ifc2three(ix, iy, iz); return new T.Vector3(v.x, v.y, v.z); }
    function proj(v, cam) { var q = v.clone().project(cam); return { x: (q.x + 1) / 2 * W, y: (1 - q.y) / 2 * H, z: q.z, inF: Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 && q.z < 1 }; }
    function pxOf(a3, b3, cam) { var qa = proj(a3, cam), qb = proj(b3, cam); return { px: (qa.inF && qb.inF) ? Math.hypot(qa.x - qb.x, qa.y - qb.y) : 0, inF: qa.inF && qb.inF }; }

    // ── 1. THE HALL — walkable raster bounded at door thresholds, flooded from the camera cell
    var rasters = {}, doorsByStorey = {};
    function rasterFor(storey) {
      if (storey in rasters) return rasters[storey];
      var r = null; try { var wr = A.dbQuery('SELECT storey,res,x0,y0,cols,rows,bits FROM storey_walkable_raster WHERE storey=?', [storey]) || []; if (wr.length) r = SR.fromRow(wr[0]); } catch (e) {}
      rasters[storey] = r; return r;
    }
    var doorRows = []; try { doorRows = A.dbQuery("SELECT m.guid, m.element_name, m.storey, t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class='IfcDoor'") || []; } catch (e) {}
    var doors = doorRows.map(function (v) { return { guid: v[0], rawName: v[1], storey: String(v[2] == null ? '' : v[2]), cx: +v[3], cy: +v[4], cz: +v[5], bx: +v[6], by: +v[7], bz: +v[8] }; });
    function blockedRaster(storey, floorZ) {   // a COPY of the storey bitset with door cells cleared
      var r = rasterFor(storey); if (!r) return null;
      var bits = new Uint8Array(r.bits.length); bits.set(r.bits);
      var n = 0;
      doors.forEach(function (d) {
        if (Math.abs(d.cz - d.bz / 2 - floorZ) > 1.5) return;      // this storey's doors, by sill height
        var c0 = Math.floor((d.cx - d.bx / 2 - r.x0) / r.res) - 1, c1 = Math.floor((d.cx + d.bx / 2 - r.x0) / r.res) + 1;
        var r0 = Math.floor((d.cy - d.by / 2 - r.y0) / r.res) - 1, r1 = Math.floor((d.cy + d.by / 2 - r.y0) / r.res) + 1;
        for (var rr = Math.max(0, r0); rr <= Math.min(r.rows - 1, r1); rr++) for (var cc = Math.max(0, c0); cc <= Math.min(r.cols - 1, c1); cc++) {
          var i = rr * r.cols + cc; if (bits[i >> 3] & (1 << (i & 7))) { bits[i >> 3] &= ~(1 << (i & 7)); n++; }
        }
      });
      return { r: r, bits: bits, doorCells: n, get: function (c, rr) { if (c < 0 || rr < 0 || c >= r.cols || rr >= r.rows) return 0; var i = rr * r.cols + c; return (bits[i >> 3] >> (i & 7)) & 1; } };
    }
    function flood(B, c0, r0) {
      var r = B.r, seen = new Uint8Array(r.cols * r.rows), q = [[c0, r0]], head = 0, cells = [], minC = c0, maxC = c0, minR = r0, maxR = r0;
      seen[r0 * r.cols + c0] = 1;
      while (head < q.length) {
        var p = q[head++], c = p[0], rr = p[1]; cells.push(p);
        if (c < minC) minC = c; if (c > maxC) maxC = c; if (rr < minR) minR = rr; if (rr > maxR) maxR = rr;
        [[c + 1, rr], [c - 1, rr], [c, rr + 1], [c, rr - 1]].forEach(function (nb) { var i = nb[1] * r.cols + nb[0]; if (nb[0] < 0 || nb[1] < 0 || nb[0] >= r.cols || nb[1] >= r.rows || seen[i] || !B.get(nb[0], nb[1])) return; seen[i] = 1; q.push(nb); });
      }
      return { cells: cells, bbox: { minx: r.x0 + minC * r.res, maxx: r.x0 + (maxC + 1) * r.res, miny: r.y0 + minR * r.res, maxy: r.y0 + (maxR + 1) * r.res } };
    }
    function nearestWalkable(B, c, rr, reach) { for (var d = 0; d <= reach; d++) for (var dc = -d; dc <= d; dc++) for (var dr = -d; dr <= d; dr++) if (Math.abs(dc) === d || Math.abs(dr) === d) if (B.get(c + dc, rr + dr)) return [c + dc, rr + dr]; return null; }

    var hall = null, hallTried = 0, hallWhy = [];
    for (var hi = 0; hi < samples.length && !hall; hi++) {
      var s = samples[hi];
      if (s.below || s.storey == null) continue;
      if (!free(s.t)) continue;
      var B = blockedRaster(s.storey, s.floorZ); if (!B) { hallWhy.push('no raster for "' + s.storey + '"'); continue; }
      hallTried++;
      var c = Math.floor((s.ifc.ix - B.r.x0) / B.r.res), rr = Math.floor((s.ifc.iy - B.r.y0) / B.r.res);
      var start = B.get(c, rr) ? [c, rr] : nearestWalkable(B, c, rr, Math.round(2.0 / B.r.res));
      if (!start) { hallWhy.push(s.t + 's: camera not on walkable floor (' + s.storey + ')'); continue; }
      var comp = flood(B, start[0], start[1]);
      var area = comp.cells.length * B.r.res * B.r.res;
      var total = 0; for (var q2 = 0; q2 < B.r.cols * B.r.rows; q2++) if ((B.r.bits[q2 >> 3] >> (q2 & 7)) & 1) total++;
      hall = { t: s.t, storey: s.storey, floorZ: s.floorZ, area: area, cells: comp.cells.length, storeyWalkable: total * B.r.res * B.r.res, doorCellsBlocked: B.doorCells, bbox: comp.bbox, raster: B.r, comp: comp,
               centroid: { ix: (comp.bbox.minx + comp.bbox.maxx) / 2, iy: (comp.bbox.miny + comp.bbox.maxy) / 2 }, sample: s, startCell: start };
    }
    if (hall) {
      taken.push({ from: hall.t, to: hall.t + SLOT, who: 'hall' });
      log('§INDOOR_BEAT_HALL sec=' + hall.t.toFixed(2) + ' storey="' + hall.storey + '" walkable=' + fmt(hall.area) + 'm2 (' + hall.cells + ' cells @' + hall.raster.res + 'm; storey walkable ' + fmt(hall.storeyWalkable) +
          'm2; ' + hall.doorCellsBlocked + ' door cells blocked = the §29.2a bound) bbox=' + (hall.bbox.maxx - hall.bbox.minx).toFixed(1) + 'x' + (hall.bbox.maxy - hall.bbox.miny).toFixed(1) + 'm camAbove=' + hall.sample.camAbove.toFixed(2) + 'm');
      _beats.push({ key: 'hall', sec: hall.t, persist: true, hall: hall });
    } else { _report.rejected.hall = hallWhy.slice(0, 4); log('§INDOOR_BEAT_HALL NOTHING — ' + (hallTried ? hallTried + ' standing sample(s) tried; ' : 'no sample stood on a rastered storey; ') + (hallWhy[0] || 'no reason recorded') + (hallWhy.length > 1 ? ' (+' + (hallWhy.length - 1) + ' more)' : '')); }

    // generic picker: over free samples, the (instance, sample) with the largest legible projected size
    function pickLinear(list, spanOf, who) {
      var best = null;
      samples.forEach(function (s) {
        if (s.below || !free(s.t)) return;
        var cam = camFor(s);
        list.forEach(function (it) {
          var sp = spanOf(it); if (!sp) return;
          var m0 = pxOf(sp.a, sp.b, cam);
          if (!m0.inF || m0.px < MIN_PX * k) return;          // cheap first test at the sample itself
          var m = heldPx(sp.a, sp.b, s.t);                     // then held over the envelope
          if (!m.inF || m.px < MIN_PX * k) return;
          if (!best || m.px > best.px) best = { it: it, s: s, px: m.px, span: sp };
        });
      });
      if (best) taken.push({ from: best.s.t, to: best.s.t + SLOT, who: who });
      return best;
    }

    // ── 2. THE STAIR — the going, never the rise
    var stairRows = []; try { stairRows = A.dbQuery("SELECT m.guid, m.ifc_class, m.element_name, m.storey, t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class IN ('IfcStairFlight','IfcStair')") || []; } catch (e) {}
    var stairs = stairRows.filter(function (v) { return +v[9] > 1.0; });      // flights AND assemblies with a real rise (Hospital has 1 flight, 61 assemblies)
    var stairCls = 'IfcStairFlight+IfcStair', stairGuarded = 0;
    // A GOING IS A FLIGHT'S RUN. The flattest stair any code allows is ~355 mm going on a 150 mm riser (2.4:1); an
    // assembly's box may add landings, so run/rise ≤ 3.0 is the physical bound — MEASURED before it: Hospital offered a
    // 99,896 mm "going" on a 6,383 mm rise (a multi-storey stair GROUP's box), which is a corridor's length, not a stair's.
    var stairNotFlight = 0;
    var stairList = stairs.map(function (v) { var bx = +v[7], by = +v[8]; return { guid: v[0], cls: v[1], rawName: v[2], name: semanticName(v[2]), storey: String(v[3] || ''), cx: +v[4], cy: +v[5], cz: +v[6], bx: bx, by: by, bz: +v[9], going: Math.max(bx, by), alongX: bx >= by }; })
      .filter(function (st) { if (st.going > 3.0 * st.bz) { stairNotFlight++; return false; } return true; })
      .filter(function (st) { var g = st.going, hit = figs.bays.concat(figs.overalls).some(function (f) { return Math.abs(g - f) <= DATUM_TOL * f; }); if (hit) stairGuarded++; return !hit; });
    log('§INDOOR_BEAT_STAIR_POOL cls=' + stairCls + ' n=' + stairs.length + ' rejectedRunOver3xRise=' + stairNotFlight + ' rejectedAsBayRestatement=' + stairGuarded + ' pool=' + stairList.length + (stairRows.length ? '' : ' VACUOUS'));
    var stairPick = stairList.length ? pickLinear(stairList, function (st) { var z = st.cz - st.bz / 2 + 0.05; return st.alongX ? { a: P3(st.cx - st.bx / 2, st.cy, z), b: P3(st.cx + st.bx / 2, st.cy, z) } : { a: P3(st.cx, st.cy - st.by / 2, z), b: P3(st.cx, st.cy + st.by / 2, z) }; }, 'stair') : null;
    if (stairPick) { _beats.push({ key: 'stair', sec: stairPick.s.t, span: stairPick.span, metres: stairPick.it.going, label: 'going ' + fmtMM(stairPick.it.going) + ' mm', title: stairPick.it.cls, sem: stairPick.it.name, px: stairPick.px, it: stairPick.it });
      log('§INDOOR_BEAT_STAIR sec=' + stairPick.s.t.toFixed(2) + ' going=' + fmtMM(stairPick.it.going) + 'mm rise=' + fmtMM(stairPick.it.bz) + 'mm (not cued) px=' + stairPick.px.toFixed(0) + ' storey="' + stairPick.it.storey + '" "' + stairPick.it.name + '" guid=' + stairPick.it.guid); }
    else log('§INDOOR_BEAT_STAIR ' + (stairRows.length ? 'NOTHING — no going legible in frame in a free slot' : 'VACUOUS — no stairs in this model'));

    // ── 3. THE OPENING — the modal door leaf, one placed instance of it
    var buckets = {}; doors.forEach(function (d) { var w = Math.round(Math.max(d.bx, d.by) * 100) * 10, h = Math.round(d.bz * 100) * 10; var kk = w + 'x' + h; (buckets[kk] = buckets[kk] || { w: w, h: h, list: [] }).list.push(d); });
    var modal = null; Object.keys(buckets).forEach(function (kk) { if (!modal || buckets[kk].list.length > modal.list.length) modal = buckets[kk]; });
    log('§INDOOR_BEAT_DOOR_POOL n=' + doors.length + (modal ? ' modal=' + modal.w + 'x' + modal.h + 'mm x' + modal.list.length + ' (' + Math.round(100 * modal.list.length / doors.length) + '%)' : ' VACUOUS'));
    var doorPick = modal ? pickLinear(modal.list, function (d) { var alongX = d.bx >= d.by, w = Math.max(d.bx, d.by); return alongX ? { a: P3(d.cx - w / 2, d.cy, d.cz), b: P3(d.cx + w / 2, d.cy, d.cz), h: { a: P3(d.cx, d.cy, d.cz - d.bz / 2), b: P3(d.cx, d.cy, d.cz + d.bz / 2) } } : { a: P3(d.cx, d.cy - w / 2, d.cz), b: P3(d.cx, d.cy + w / 2, d.cz), h: { a: P3(d.cx, d.cy, d.cz - d.bz / 2), b: P3(d.cx, d.cy, d.cz + d.bz / 2) } }; }, 'door') : null;
    if (doorPick) { var d0 = doorPick.it; _beats.push({ key: 'door', sec: doorPick.s.t, span: doorPick.span, span2: doorPick.span.h, metres: Math.max(d0.bx, d0.by), metres2: d0.bz, label: fmt(modal.w) + ' × ' + fmt(modal.h) + ' mm', title: 'IfcDoor', sem: modal.list.length + ' of this type', px: doorPick.px, it: d0, modal: { w: modal.w, h: modal.h, n: modal.list.length } });
      log('§INDOOR_BEAT_DOOR sec=' + doorPick.s.t.toFixed(2) + ' leaf=' + modal.w + 'x' + modal.h + 'mm x' + modal.list.length + ' instance=' + fmtMM(Math.max(d0.bx, d0.by)) + 'x' + fmtMM(d0.bz) + 'mm px=' + doorPick.px.toFixed(0) + ' storey="' + d0.storey + '" guid=' + d0.guid); }
    else log('§INDOOR_BEAT_DOOR ' + (doors.length ? 'NOTHING — no instance of the modal leaf legible in frame in a free slot' : 'VACUOUS — no IfcDoor'));

    // ── 4. THE CLEAR HEIGHT — a DB column cast ahead of the camera inside the hall
    var height = null, heightWhy = null;
    if (hall) {
      var band = []; try { band = A.dbQuery("SELECT m.ifc_class, t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE t.center_z - t.bbox_z/2 > ? AND t.center_z - t.bbox_z/2 < ?", [hall.floorZ + 0.5, hall.floorZ + 12]) || []; } catch (e) {}
      var CEIL = { IfcSlab: 1, IfcCovering: 1, IfcRoof: 1, IfcSlabStandardCase: 1 };
      // §29.8.6 — a DB cast reads AABBs; a railing, stair, ramp, mullion or opening is diagonal or open-frame, so its
      // box claims air it does not fill. Those cannot be a headroom stop; ducts, pipes, trays, beams, fittings and
      // ceilings can. MEASURED before this list: Hospital's first cast hit "IfcRailing at 3,848 mm" — the floor above's
      // balustrade box hanging over the hall it does not touch.
      var NOT_OVERHEAD = { IfcRailing: 1, IfcStair: 1, IfcStairFlight: 1, IfcRamp: 1, IfcRampFlight: 1, IfcMember: 1, IfcPlate: 1, IfcOpeningElement: 1, IfcSpace: 1, IfcCurtainWall: 1, IfcWall: 1, IfcWallStandardCase: 1, IfcColumn: 1, IfcDoor: 1, IfcWindow: 1, IfcFurnishingElement: 1, IfcFurniture: 1, IfcBuildingElementProxy: 1 };
      var cands = [];
      samples.forEach(function (s) {
        if (s.below || s.storey !== hall.storey || !free(s.t)) return;
        var cam = camFor(s);
        for (var dist = 2; dist <= 10; dist += 1) {
          var px0 = s.ifc.ix + s.fwd.x * dist, py0 = s.ifc.iy + s.fwd.y * dist;
          if (!hall.raster.contains(px0, py0)) continue;
          var clear = null, clearCls = null, total = null;
          band.forEach(function (v) { if (NOT_OVERHEAD[v[0]]) return; var cx = +v[1], cy = +v[2], bot = +v[3] - +v[6] / 2; if (Math.abs(px0 - cx) > +v[4] / 2 || Math.abs(py0 - cy) > +v[5] / 2) return; if (clear == null || bot < clear) { clear = bot; clearCls = v[0]; } if (CEIL[v[0]] && (total == null || bot < total)) total = bot; });
          if (clear == null) continue;
          var ch = clear - hall.floorZ, th = total == null ? null : total - hall.floorZ;
          if (th != null && Math.abs(ch - th) < 0.05) continue;     // nothing hangs here — the cast restates the ceiling
          if (figs.storeys.some(function (f) { return Math.abs(ch - f) <= DATUM_TOL * f; })) continue;
          var a3 = P3(px0, py0, hall.floorZ), b3 = P3(px0, py0, clear), m = pxOf(a3, b3, cam);
          if (!m.inF || m.px < MIN_PX * k) continue;
          m = heldPx(a3, b3, s.t); if (!m.inF || m.px < MIN_PX * k) continue;
          cands.push({ s: s, px: m.px, span: { a: a3, b: b3 }, ch: ch, th: th, cls: clearCls, dist: dist });
        }
      });
      cands.sort(function (x, y) { return y.px - x.px; });
      if (cands.length) { height = cands[0]; taken.push({ from: height.s.t, to: height.s.t + SLOT, who: 'height' });
        _beats.push({ key: 'height', sec: height.s.t, span: height.span, metres: height.ch, label: 'clear height ' + fmtMM(height.ch) + ' mm', title: 'under ' + height.cls, sem: height.th != null ? 'ceiling ' + fmtMM(height.th) + ' mm (datum, not cued)' : '', px: height.px, cls: height.cls, ch: height.ch, th: height.th });
        log('§INDOOR_BEAT_HEIGHT sec=' + height.s.t.toFixed(2) + ' clear=' + fmtMM(height.ch) + 'mm under ' + height.cls + ' total=' + (height.th == null ? 'n/a' : fmtMM(height.th) + 'mm') + ' ' + height.dist + 'm ahead px=' + height.px.toFixed(0) + ' candidates=' + cands.length); }
      else { heightWhy = 'no point 2–10 m ahead inside the hall has something hanging below its ceiling that is legible in a free slot'; log('§INDOOR_BEAT_HEIGHT WITHDRAWN — ' + heightWhy); }
    } else log('§INDOOR_BEAT_HEIGHT WITHDRAWN — no hall to stand in');

    // ── draw: the hall tint mesh (row-run quads), depth-tested, on the floor
    if (hall) {
      _grp = new T.Group(); _grp.name = 'indoorBeats';
      _grp.userData.excludeFromAO = true;   // §46 / §AO_EXCLUDE — the hall tint is an annotation, not a surface
      var r = hall.raster, byRow = {}; hall.comp.cells.forEach(function (p) { (byRow[p[1]] = byRow[p[1]] || []).push(p[0]); });
      var pos = [], idx = [], vi = 0, z = hall.floorZ + 0.03;
      Object.keys(byRow).forEach(function (rr) { var cs = byRow[rr].sort(function (a, b) { return a - b; }), i = 0; rr = +rr;
        while (i < cs.length) { var j = i; while (j + 1 < cs.length && cs[j + 1] === cs[j] + 1) j++;
          var x0 = r.x0 + cs[i] * r.res, x1 = r.x0 + (cs[j] + 1) * r.res, y0 = r.y0 + rr * r.res, y1 = r.y0 + (rr + 1) * r.res;
          [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach(function (q) { var v = A.ifc2three(q[0], q[1], z); pos.push(v.x, v.y, v.z); });
          idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3, vi, vi + 2, vi + 1, vi, vi + 3, vi + 2); vi += 4; i = j + 1; } });
      var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      var mesh = new T.Mesh(g, new T.MeshBasicMaterial({ color: HALL_TINT, transparent: true, opacity: 0, depthTest: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
      mesh.name = 'indoorHallTint'; mesh.visible = false; _grp.add(mesh); if (A.scene) A.scene.add(_grp);
      hall.mesh = mesh; hall.quads = vi / 4;
      log('§INDOOR_BEAT_HALL_TINT quads=' + hall.quads + ' depthTest=true (occluded by walls) color=#' + HALL_TINT.toString(16));
    }
    _report.taken = taken.map(function (w) { return { from: +w.from.toFixed(3), to: +w.to.toFixed(3), who: w.who }; });
    _report.beats = _beats.map(function (b) { return { key: b.key, sec: +b.sec.toFixed(3), label: b.label || null, title: b.title || null, sem: b.sem || null, px: b.px == null ? null : +b.px.toFixed(1), metres: b.metres == null ? null : +b.metres.toFixed(4), metres2: b.metres2 == null ? null : +b.metres2.toFixed(4),
      hall: b.hall ? { storey: b.hall.storey, area: +b.hall.area.toFixed(2), cells: b.hall.cells, storeyWalkable: +b.hall.storeyWalkable.toFixed(2), doorCellsBlocked: b.hall.doorCellsBlocked, quads: b.hall.quads, camAbove: +b.hall.sample.camAbove.toFixed(3), startCell: b.hall.startCell } : null,
      it: b.it ? { guid: b.it.guid, storey: b.it.storey, going: b.it.going, bx: b.it.bx, by: b.it.by, bz: b.it.bz } : null, modal: b.modal || null, cls: b.cls || null, ch: b.ch == null ? null : +b.ch.toFixed(3), th: b.th == null ? null : +b.th.toFixed(3) }; });
    _report.state = _beats.length ? 'BEATS' : 'NOTHING'; _report.why = _beats.length ? null : 'no indoor beat placed';
    log('§INDOOR_BEAT_PLAN beats=' + _beats.length + '/4 [' + _beats.map(function (b) { return b.key + '@' + b.sec.toFixed(2); }).join(' ') + '] taken=' + taken.length + ' windows');
    return _report;
  };

  // ── per frame: hall tint opacity + persistence (§29.6); everything else is 2D
  A.indoorBeatsAt = function (filmSec) {
    var hb = _beats.filter(function (b) { return b.key === 'hall'; })[0]; if (!hb || !hb.hall.mesh) return null;
    var h = hb.hall, dt = filmSec - hb.sec, cam = A.camera;
    if (h.off) { h.mesh.visible = false; return { hall: 'off' }; }
    if (dt < 0) { h.mesh.visible = false; return { hall: 'pending' }; }
    var op = Math.min(1, dt / ENV.fadeIn);
    // frame-out: the hall's bbox corners all off-frame, or the camera left the storey → removed for good
    var T = window.THREE, cs = [[h.bbox.minx, h.bbox.miny], [h.bbox.maxx, h.bbox.miny], [h.bbox.maxx, h.bbox.maxy], [h.bbox.minx, h.bbox.maxy]], inF = 0;
    cs.forEach(function (q) { var v = A.ifc2three(q[0], q[1], h.floorZ), p = new T.Vector3(v.x, v.y, v.z).project(cam); if (Math.abs(p.x) <= 1.2 && Math.abs(p.y) <= 1.2 && p.z < 1) inF++; });
    var c = A.three2ifc(cam.position.x, cam.position.y, cam.position.z), onStorey = c.iz >= h.floorZ - 1.0 && c.iz < h.floorZ + 12;
    if (dt > ENV.fadeIn && (!inF || !onStorey)) { h.off = true; h.offAt = filmSec; h.mesh.visible = false; console.log('§INDOOR_BEAT_HALL off filmSec=' + filmSec.toFixed(2) + ' reason=' + (!inF ? 'frame-out' : 'left the storey') + ' (§29.6: persisted ' + (filmSec - hb.sec).toFixed(1) + 's)'); return { hall: 'off' }; }
    h.mesh.visible = true; h.mesh.material.opacity = 0.35 * op;
    return { hall: 'on', op: op };
  };

  A.indoorBeatsCompositeOntoCanvas = function (ctx, w, h, filmSec) {
    if (!_beats.length || !ctx || !A.camera || typeof A.flythruDrawDim !== 'function') return 0;
    var cam = A.camera, k = h / 720, drawn = 0, T = window.THREE;
    _beats.forEach(function (b) {
      if (b.key === 'hall') {
        var H0 = b.hall; if (H0.off || filmSec < b.sec) return;
        var op = Math.min(1, (filmSec - b.sec) / ENV.fadeIn);
        var pts = [[H0.centroid.ix, H0.centroid.iy], [H0.bbox.minx, H0.bbox.miny], [H0.bbox.maxx, H0.bbox.miny], [H0.bbox.maxx, H0.bbox.maxy], [H0.bbox.minx, H0.bbox.maxy]], q = null, best = Infinity;
        pts.forEach(function (pt) { var v = A.ifc2three(pt[0], pt[1], H0.floorZ), qq = new T.Vector3(v.x, v.y, v.z).project(cam); if (qq.z >= 1) return; var d = Math.hypot(qq.x, qq.y); if (d < best) { best = d; q = qq; } });
        if (!q) return;   // the whole hall is behind the camera this frame — the 3D tint still shows what is in front
        ctx.save(); ctx.globalAlpha = op;
        A.flythruDrawPanel(ctx, { x: Math.max(0, Math.min(w, (q.x + 1) / 2 * w)), y: Math.max(0, Math.min(h, (1 - q.y) / 2 * h)) }, ['Walkable area: ' + fmt(H0.area) + ' m²', H0.storey], 'Hall-Corridor', INK, k, w, h);
        ctx.restore(); drawn++;
        var key = 'hall|' + Math.floor(filmSec); if (!_lastLog[key]) { _lastLog[key] = 1; console.log('§INDOOR_BEAT_DRAW key=hall filmSec=' + filmSec.toFixed(2) + ' op=' + op.toFixed(2) + ' area=' + fmt(H0.area) + 'm2'); }
        return;
      }
      var op2 = envAt(filmSec - b.sec); if (op2 <= 0) return;
      var A2 = A.flythruProj(b.span.a, cam, w, h), B2 = A.flythruProj(b.span.b, cam, w, h);
      if (A2.z >= 1 || B2.z >= 1) return;
      ctx.save(); ctx.globalAlpha = op2;
      var ok = A.flythruDrawDim(ctx, A2, B2, b.metres, INK, k, true);
      if (b.span2) { var C2 = A.flythruProj(b.span2.a, cam, w, h), D2 = A.flythruProj(b.span2.b, cam, w, h); if (C2.z < 1 && D2.z < 1) A.flythruDrawDim(ctx, C2, D2, b.metres2, INK, k, true); }
      if (ok) { drawn++; A.flythruDrawPanel(ctx, { x: (A2.x + B2.x) / 2, y: (A2.y + B2.y) / 2 }, [b.label].concat(b.sem ? [b.sem] : []), b.title, INK, k, w, h);
        var key2 = b.key + '|' + Math.floor(filmSec * 2); if (!_lastLog[key2]) { _lastLog[key2] = 1; console.log('§INDOOR_BEAT_DRAW key=' + b.key + ' filmSec=' + filmSec.toFixed(2) + ' op=' + op2.toFixed(2) + ' ' + b.label); } }
      ctx.restore();
    });
    return drawn;
  };
  A.indoorBeatsReport = function () { return _report; };
  A.indoorBeatsDispose = function () { if (_grp && A.scene) { A.scene.remove(_grp); _grp.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); } _grp = null; _built = false; _report = null; _beats = []; _hall = null; _lastLog = {}; };
  log('§INDOOR_BEATS_INIT wired (hall walkable area bounded at doors · stair going · door type · clear height; 4 slots, rides Measure)');
}
if (typeof window !== 'undefined') window.setupCpeIndoorBeats = setupCpeIndoorBeats;
