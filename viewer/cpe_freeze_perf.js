// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT
// ══ §FREEZE_PERF_PANEL — Audio + Visual panels in the load-path FREEZE (bim-compiler prompts/PERFORMANCE_AS_CLASH.md §19)
// red1 2026-10-01: "acoustics audio test and visual blindspot with best CCTV locations ... special info panel during loadpath
// stack as the black is largely empty and can be filled when audio/visual box is checked" / "in conjunction with loadpath".
//
// BUILD (once per bake, before frame 0): A.freezePerfBuild(db) — every room's coverage from the SAME rooms the film's room graph
// reads (spatial_structure IfcSpace, common/room_graph.js:320). DECIDE/draw (freeze frames only): A.freezePerfCompositeOntoCanvas,
// called from A.loadPathCompositeOntoCanvas (cpe_load_path.js) after the stack panels + info card, so it can only ever draw while
// the load-path freeze is drawing. Nothing per frame but the panel.
//
// VISUAL (§19, M4): one camera per room at its best ceiling corner. The camera is the catalog product we hold,
// IFC/LOD/CCTV_Paxton10MiniBulletCamera_CORE.ifc — LensAngleOfView "Horizontal 103°; Vertical 55°; Diagonal 123°",
// 2560 x 1440. DORI px/m = IEC 62676-4:2014 (Detect 25 / Observe 62.5 / Recognise 125 / Identify 250, via the Axis whitepaper).
// Pinhole: at depth z along the optical axis the 2560 px span 2·z·tan(51.5°) m, so ppm(z) = 2560 / (2·z·tan 51.5°).
// Room = its box (plan-level, walls clip by the box, no exact rays — the panel says so).
// AUDIO (§19, M2) — not built yet (needs the α table vendored + the §N reference-room witness first).
(function () {
  'use strict';
  // main.js:10 REPLACES window.APP with a fresh object after this file loads (measured: the first freeze bake logged no §FREEZE_PERF line
  // at all), so functions are parked on a holder here and moved onto the real APP by setupCpeFreezePerf(APP), the main.js setup idiom.
  var A = {};
  var CAM = { name: 'Paxton10 Mini Bullet', hDeg: 103, vDeg: 55, px: 2560, src: 'IFC/LOD/CCTV_Paxton10MiniBulletCamera_CORE.ifc LensAngleOfView' };
  var DORI = [['I', 250], ['R', 125], ['O', 62.5], ['D', 25]];   // IEC 62676-4:2014 px/m
  var MOUNT_INSET_M = 0.1;    // ~design parameter: camera 0.1 m in from both walls and below the ceiling (logged, not a standard)
  var GRID_M = 0.1;           // floor sample pitch; margin = |result at GRID_M - result at 2·GRID_M| (derived, §18)
  var GRID_MAX = 300;         // cap per axis (a 30 m room at 0.1 m)

  function tanH() { return Math.tan(CAM.hDeg * Math.PI / 360); }
  function tanV() { return Math.tan(CAM.vDeg * Math.PI / 360); }
  function doriRangeM(ppm) { return CAM.px / (2 * ppm * tanH()); }

  // Coverage of one floor rectangle [x0,x1]x[y0,y1] at height zf from a camera at c aimed at t. z is up.
  // Returns per-ring area shares: ring 0..3 = I/R/O/D (the BEST level reached at that point), 4 = in view beyond Detect, 5 = blind.
  function coverage(c, t, x0, x1, y0, y1, zf, pitch) {
    var fx = t[0] - c[0], fy = t[1] - c[1], fz = t[2] - c[2], fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
    var rx = fy, ry = -fx, rz = 0, rl = Math.hypot(rx, ry) || 1; rx /= rl; ry /= rl;      // right = f x up(0,0,1)
    var ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;           // up = right x f
    var th = tanH(), tv = tanV(), k = CAM.px / (2 * th);                                    // ppm = k / depth
    var nx = Math.min(GRID_MAX, Math.max(4, Math.ceil((x1 - x0) / pitch))), ny = Math.min(GRID_MAX, Math.max(4, Math.ceil((y1 - y0) / pitch)));
    var cnt = [0, 0, 0, 0, 0, 0], n = nx * ny;
    for (var j = 0; j < ny; j++) {
      var py = y0 + (j + 0.5) * (y1 - y0) / ny;
      for (var i = 0; i < nx; i++) {
        var px = x0 + (i + 0.5) * (x1 - x0) / nx;
        var vx = px - c[0], vy = py - c[1], vz = zf - c[2];
        var z = vx * fx + vy * fy + vz * fz;
        if (z <= 1e-6) { cnt[5]++; continue; }
        var xc = vx * rx + vy * ry + vz * rz, yc = vx * ux + vy * uy + vz * uz;
        if (Math.abs(xc / z) > th || Math.abs(yc / z) > tv) { cnt[5]++; continue; }
        var ppm = k / z, ring = 4;
        for (var d = 0; d < 4; d++) if (ppm >= DORI[d][1]) { ring = d; break; }
        cnt[ring]++;
      }
    }
    return cnt.map(function (v) { return v / n; });
  }

  // One room: the 4 ceiling corners (inset) aimed at the floor centroid; best = most floor at Recognise-or-better.
  function judgeRoom(r, pitch) {
    var hx = r.sx / 2, hy = r.sy / 2, zf = r.cz - r.sz / 2, zc = r.cz + r.sz / 2 - MOUNT_INSET_M;
    var x0 = r.cx - hx, x1 = r.cx + hx, y0 = r.cy - hy, y1 = r.cy + hy, t = [r.cx, r.cy, zf], best = null;
    [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach(function (p, ci) {
      var c = [p[0] + (p[0] < r.cx ? MOUNT_INSET_M : -MOUNT_INSET_M), p[1] + (p[1] < r.cy ? MOUNT_INSET_M : -MOUNT_INSET_M), zc];
      var s = coverage(c, t, x0, x1, y0, y1, zf, pitch), rec = s[0] + s[1];
      if (!best || rec > best.rec + 1e-9) best = { corner: ci + 1, cam: c, shares: s, rec: rec };
    });
    return best;
  }

  var built = null;
  A.freezePerfBuild = function (dbQuery) {
    var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var q = dbQuery || A.dbQuery, rows = [];
    try {
      // §FREEZE_PERF_ROOMS (2026-10-01, HHS bake: "Rooms checked: 100" counted BOXES — one room spans several rectangles sharing a
      // name + room_guid). Logical room = room_guid, falling back to the row's guid: the SAME key common/room_graph.js:327 uses.
      var sel = " guid, name, object_type, center_x, center_y, center_z, size_x, size_y, size_z", wh = " FROM spatial_structure WHERE type='IfcSpace' AND center_x IS NOT NULL AND size_x > 0 AND size_y > 0 AND size_z > 0";
      try { rows = q("SELECT" + sel + ", room_guid" + wh) || []; } catch (eRg) { rows = (q("SELECT" + sel + ", NULL" + wh) || []); }
    } catch (e) { console.warn('§FREEZE_PERF_BUILD rooms query failed: ' + (e && e.message)); rows = []; }
    var rooms = [], area = 0, recArea = 0, blind = 0, compiled = 0, marginMax = 0, byRoom = {}, roomOrder = [];
    rows.forEach(function (r) {
      var room = { guid: r[0], name: r[1] || r[0], compiled: r[2] === 'COMPILED', cx: +r[3], cy: +r[4], cz: +r[5], sx: +r[6], sy: +r[7], sz: +r[8], key: r[9] || r[0] };
      var b = judgeRoom(room, GRID_M), b2 = judgeRoom(room, 2 * GRID_M);
      room.area = room.sx * room.sy; room.best = b;
      room.recPct = 100 * b.rec; room.blindM2 = room.area * b.shares[5];
      room.marginPct = Math.abs(100 * b.rec - 100 * b2.rec);     // derived: grid-pitch sensitivity (§18)
      marginMax = Math.max(marginMax, room.marginPct);
      area += room.area; recArea += room.area * b.rec; blind += room.blindM2;
      rooms.push(room);
      // one camera per BOX (each rectangle of a multi-rect room gets its own best corner); the room's numbers are its boxes' sums
      var g = byRoom[room.key]; if (!g) { g = byRoom[room.key] = { key: room.key, name: room.name, compiled: room.compiled, area: 0, rec: 0, blindM2: 0, boxes: 0 }; roomOrder.push(g); }
      g.area += room.area; g.rec += room.area * b.rec; g.blindM2 += room.blindM2; g.boxes++;
      console.log('§COVERAGE room="' + room.name + '" cam=corner' + b.corner + '@' + b.cam.map(function (v) { return v.toFixed(2); }).join(',') +
        ' covered%=' + room.recPct.toFixed(1) + ' (±' + room.marginPct.toFixed(1) + ') blind_m2=' + room.blindM2.toFixed(2) +
        ' dori=I' + (100 * b.shares[0]).toFixed(0) + '/R' + (100 * b.shares[1]).toFixed(0) + '/O' + (100 * b.shares[2]).toFixed(0) +
        '/D' + (100 * b.shares[3]).toFixed(0) + '/beyond' + (100 * b.shares[4]).toFixed(0) + '/blind' + (100 * b.shares[5]).toFixed(0) + '%' +
        ' box=' + room.sx.toFixed(1) + 'x' + room.sy.toFixed(1) + 'x' + room.sz.toFixed(1) + 'm');
    });
    var logical = roomOrder.map(function (g) { g.recPct = g.area ? 100 * g.rec / g.area : 0; if (g.compiled) compiled++; return g; });
    var byBlind = logical.slice().sort(function (a, b) { return b.blindM2 - a.blindM2; });
    var best = logical.slice().sort(function (a, b) { return (b.recPct - a.recPct) || (b.area - a.area); })[0] || null;
    console.log('§FREEZE_PERF_ROOMS boxes=' + rooms.length + ' rooms=' + logical.length + ' multiBox=' + logical.filter(function (g) { return g.boxes > 1; }).length + ' (key = room_guid, else guid — room_graph.js:327)');
    built = { rooms: logical, boxes: rooms, area: area, recPct: area ? 100 * recArea / area : 0, blindM2: blind, compiled: compiled,
              worst: byBlind.slice(0, 3), best: best, marginMax: marginMax,
              dori: DORI.map(function (d) { return [d[0], doriRangeM(d[1])]; }),
              ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0) };
    console.log('§PERF_CLASH_TIMING group=visual rooms=' + logical.length + ' boxes=' + rooms.length + ' ms=' + built.ms);
    if (best) console.log('§FREEZE_PERF_BEST group=visual room="' + best.name + '" value=' + best.recPct.toFixed(1) + '% basis=recognise%');
    console.log('§FREEZE_PERF_BUILD group=visual rooms=' + logical.length + ' boxes=' + rooms.length + ' compiled=' + compiled + ' floor_m2=' + area.toFixed(1) +
      ' recognise%=' + built.recPct.toFixed(1) + ' blind_m2=' + blind.toFixed(1) + ' marginMax=±' + marginMax.toFixed(1) + '%' +
      ' dori_m=' + built.dori.map(function (d) { return d[0] + d[1].toFixed(1); }).join('/') +
      ' cam="' + CAM.name + '" ' + CAM.hDeg + 'x' + CAM.vDeg + 'deg ' + CAM.px + 'px mountInset=' + MOUNT_INSET_M + 'm(~design) grid=' + GRID_M + 'm' +
      (logical.length ? '' : ' => INCONCLUSIVE reason=no-rooms'));
    return built;
  };

  // §19.4 plain-English copy. The compiled flag (⚠/≈ in the name) moves to one "estimated" note; "Level 1 R3" prints as "Level 1 · room 3"
  // (presentation only — the § lines keep the data name). Line 0 carries the count-up (pct is filled in per frame).
  function roomLabel(n) { return String(n || '').replace(/^[⚠≈]\s*/, '').replace(/\s+R(\d+)$/, ' · room $1'); }
  function visualLines(b) {
    var L = [];
    L.push({ t: function (k) { return 'People recognisable over ' + Math.round(b.recPct * k) + '% of the floor'; }, w: 'People recognisable over ' + Math.round(b.recPct) + '% of the floor', big: true });
    L.push({ t: 'Blind spots: ' + b.blindM2.toFixed(1) + ' m² no camera can see' });
    L.push({ t: 'Rooms checked: ' + b.rooms.length + ' (' + b.area.toFixed(0) + ' m²)' + (b.compiled ? ', rooms estimated from the model' : '') });
    if (b.best) L.push({ t: 'Best covered: ' + roomLabel(b.best.name) + ' — ' + b.best.recPct.toFixed(0) + '%' });
    b.worst.slice(0, 2).forEach(function (r) { if (r.blindM2 > 0.05) L.push({ t: 'Hardest to cover: ' + roomLabel(r.name) + ' — ' + r.blindM2.toFixed(1) + ' m² unseen' }); });
    var d = {}; b.dori.forEach(function (x) { d[x[0]] = x[1]; });
    L.push({ t: 'Range: identify ' + d.I.toFixed(0) + ' m · recognise ' + d.R.toFixed(0) + ' m · observe ' + d.O.toFixed(0) + ' m · detect ' + d.D.toFixed(0) + ' m' });
    L.push({ t: 'Camera: Paxton 10 mini bullet, ' + CAM.hDeg + '°×' + CAM.vDeg + '° · IEC 62676-4 · room-box plan check, ±' + Math.max(1, Math.ceil(b.marginMax)) + '%', dim: true });
    return L;
  }

  function overlaps(a, b) { return a && b && a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0; }

  // Called by cpe_load_path.js's composite with the freeze theme + the rects already drawn this frame.
  A.freezePerfCompositeOntoCanvas = function (ctx, w, h, theme, taken) {
    var on = A._freezePerfOn || {};
    if (!on.visual) return null;
    var out = [];
    try {
      if (!built) { if (!A._freezePerfNoBuildLogged) { A._freezePerfNoBuildLogged = true; console.warn('§FREEZE_PERF_PANEL group=visual drawn=0 => INCONCLUSIVE reason=not-built'); } return null; }
      var fontPx = theme.bodyPx(h), titlePx = Math.round(fontPx * 1.15), rowH = Math.round(fontPx * 1.55), pad = Math.round(fontPx * 0.6);
      var lines = visualLines(built), title = 'Security cameras', sub = 'Where one CCTV camera per room can see';
      var FA = A._freezeAnim, aPlate = FA ? FA.alpha(FA.sched.perfPlate) : 1, k = FA ? FA.countUp() : 1, subPx = Math.round(fontPx * 0.9);
      var txt = function (l) { return typeof l.t === 'function' ? l.t(k) : l.t; };
      ctx.save();
      ctx.font = '600 ' + titlePx + 'px ' + theme.font; var tw = ctx.measureText(title).width;
      ctx.font = '400 ' + subPx + 'px ' + theme.font; tw = Math.max(tw, ctx.measureText(sub).width);
      var mw = tw; lines.forEach(function (l) { ctx.font = (l.big ? '700 ' : '400 ') + fontPx + 'px ' + theme.font; mw = Math.max(mw, ctx.measureText(l.w || txt(l)).width); });
      var bandH = Math.round(titlePx * 1.25 + subPx * 1.35 + pad), bw = Math.round(mw + pad * 2.5), bh = Math.round(bandH + pad * 0.6 + lines.length * rowH + pad), m = Math.round(h * 0.028);
      // candidates in the black: bottom-left, bottom-right, mid-left, mid-right — first one clear of every drawn rect
      var cands = [[m, h - m - bh], [w - m - bw, h - m - bh], [m, Math.round((h - bh) / 2)], [w - m - bw, Math.round((h - bh) / 2)]];
      var pick = null, ov = 0;
      for (var c = 0; c < cands.length && !pick; c++) {
        var r = { x0: cands[c][0], y0: cands[c][1], x1: cands[c][0] + bw, y1: cands[c][1] + bh };
        if (!taken.some(function (t) { return overlaps(r, t); })) pick = r;
      }
      if (!pick) { pick = { x0: cands[0][0], y0: cands[0][1], x1: cands[0][0] + bw, y1: cands[0][1] + bh }; ov = taken.filter(function (t) { return overlaps(pick, t); }).length; }
      var rad = Math.round(Math.min(bw, bh) * 0.06), band = A._freezeBand && A._freezeBandsOn && A._freezeBandsOn();
      ctx.globalAlpha *= aPlate;   // §FREEZE_ANIM: the plate + band fade in first, then the lines one by one
      theme.plate(ctx, pick.x0, pick.y0, bw, bh, rad);
      if (band) A._freezeBand(ctx, pick.x0, pick.y0, bw, bh, rad, bandH, 'security', fontPx, 'cctv');   // §FREEZE_BANDS — Security teal
      ctx.textBaseline = 'middle';
      ctx.fillStyle = band ? '#FFFFFF' : 'rgba(20,22,28,0.95)'; ctx.font = '700 ' + titlePx + 'px ' + theme.font; ctx.fillText(title, pick.x0 + pad, pick.y0 + Math.round(pad * 0.5 + titlePx * 0.6));
      ctx.fillStyle = band ? 'rgba(255,255,255,0.9)' : 'rgba(20,22,28,0.72)'; ctx.font = '400 ' + subPx + 'px ' + theme.font; ctx.fillText(sub, pick.x0 + pad, pick.y0 + Math.round(pad * 0.5 + titlePx * 1.25 + subPx * 0.6));
      var y0 = pick.y0 + bandH + Math.round(pad * 0.6);
      lines.forEach(function (l, i) {
        var la = FA ? FA.alpha(FA.sched.perfLine(i)) : 1, dx = Math.round((1 - la) * fontPx * 0.6);
        ctx.save(); ctx.globalAlpha *= la;
        ctx.fillStyle = l.dim ? 'rgba(20,22,28,0.72)' : 'rgba(20,22,28,0.95)';
        ctx.font = (l.big ? '700 ' : '400 ') + fontPx + 'px ' + theme.font;
        ctx.fillText(txt(l), pick.x0 + pad - dx, y0 + i * rowH + rowH / 2);
        ctx.restore();
      });
      ctx.restore();
      out.push(pick);
      if (!A._freezePerfWitnessed) {
        A._freezePerfWitnessed = true;
        var inFrame = pick.x0 >= 0 && pick.y0 >= 0 && pick.x1 <= w && pick.y1 <= h;
        console.log('§FREEZE_PERF_PANEL group=visual drawn=1 rows=' + lines.length + ' minTextPx=' + Math.min(fontPx, subPx) + ' inFrame=' + (inFrame ? 1 : 0) +
          ' overlaps=' + ov + ' box=' + [pick.x0, pick.y0, pick.x1, pick.y1].map(Math.round).join(',') + ' frame=' + w + 'x' + h +
          ' => ' + (!built.rooms.length ? 'INCONCLUSIVE reason=no-rooms' : (inFrame && !ov ? 'PASS' : 'FAIL')));
      }
    } catch (e) { if (!A._freezePerfDrawWarned) { A._freezePerfDrawWarned = true; console.warn('§FREEZE_PERF_PANEL draw failed: ' + (e && e.message)); } }
    return out;
  };

  // test seam for the node witness (no DOM)
  A._freezePerfInternals = { coverage: coverage, judgeRoom: judgeRoom, doriRangeM: doriRangeM, CAM: CAM, DORI: DORI };
  var setup = function (app) {
    ['freezePerfBuild', 'freezePerfCompositeOntoCanvas', '_freezePerfInternals'].forEach(function (k) { app[k] = A[k]; });
    A = app;   // every closure above reads A — from here it is the live APP (A._freezePerfOn, A._freezeBand, A.dbQuery ...)
    console.log('§FREEZE_PERF_INIT wired (visual built; audio not built) — draws only inside the load-path freeze');
  };
  if (typeof window !== 'undefined') window.setupCpeFreezePerf = setup;
  if (typeof module !== 'undefined' && module.exports) { module.exports = A._freezePerfInternals; module.exports.build = function (q) { return A.freezePerfBuild(q); }; }
})();
