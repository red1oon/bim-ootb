/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// cinema_gaze.js — §CPE_GAZE_SOC (prompts/CINEMA_PATH_EDITOR.md): the composed film gaze in its
// OWN module. Input: the planner's raw look series (position + direction + owning rule per probe)
// plus the building's density points. Output: ONE direction per span fraction, with per-probe
// provenance (§GAZE_SRC). poseAt composes position + this direction; nothing else may write the
// look target. The precedent is cpe_room_title.js — own file, pure functions, witnessable without
// a bake — and the boundary rule is the point: pacing PRs may not touch this file, gaze PRs may
// not touch pacing, reviewable from the diff's file list alone.
//
// Implementing prompts/CINEMA_PATH_EDITOR.md §CPE_GAZE_BULK — Witness: witness_cpe_gaze_skyline.js
//
// §CPE_GAZE_BULK — the empty-GAZE corrector (measured cause, 2026-08-02): both existing aim rules
// trigger on where the camera STANDS (§CPE_AIM_DENSITY: outside the perimeter; §CPE_AIM_DEPTH:
// boxed-in, and hard-off under buildup). On an interior authored path with buildup on, BOTH are
// provably inert (user's own log: active=0/65 twice), so the composed gaze degenerates to the pure
// look-ahead — and an authored leg whose tangent runs off the building edge delivers a stare into
// empty skyline, on time, at the rate cap. The missing trigger is what the camera SEES: soft
// density in a cone along the gaze. Empty view + real mass nearby → turn onto the mass. Both
// trigger terms are CONTINUOUS (same argument as §CPE_AIM_DENSITY's own design note), the weight
// series is smoothed with the house 2x5-tap pass, and there is deliberately NO latch — a corridor
// that turns back to a healthy look-ahead must release the correction.
function setupCinemaGaze(A) {
  'use strict';
  // Cone/neighbourhood constants. Ranges reuse the film's own proximity scale (CINEMA_FAN_FAR is
  // passed in as farM/bulkM — never a second constant system). The floors are in the same soft
  // (1-u^2)^2 element-weight units as _AIM_DENS_FLOOR (12) in effects.js; SEEN_FLOOR is lower
  // because a cone at range collects less kernel mass than a full sphere — the witness prints the
  // measured seen-series on a healthy walk vs the stare window so the floor can be argued with
  // from numbers (Hospital: healthy interior probes measure hundreds, the stare window ~0-5).
  var CONE_HALF_TAN = Math.tan(20 * Math.PI / 180); // ~human central field half-angle
  var CONE_NEAR_M = 1.5;     // skip the camera's own immediate clutter (mullion it is flying past)
  var SEEN_FLOOR = 8;        // soft mass in the cone below which the view counts as empty
  var NEAR_FLOOR = 40;       // soft count within bulkM below which there is nothing to face anyway
  function _smoothstep(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
  function _smooth5(a) {                       // the house 2-pass 5-tap binomial, verbatim idiom
    function pass(v) {
      var o = [], k = [1, 4, 6, 4, 1], n = v.length;
      for (var j = 0; j < n; j++) {
        var acc = 0, ws = 0;
        for (var m = -2; m <= 2; m++) {
          var idx = j + m;
          if (idx < 0 || idx >= n) continue;
          acc += v[idx] * k[m + 2]; ws += k[m + 2];
        }
        o.push(acc / ws);
      }
      return o;
    }
    return pass(pass(a));
  }
  // What the gaze SEES: soft element mass in a cone along dIfc from qIfc, CONE_NEAR_M..farM ahead.
  // Same kernel family as effects.js _aimSoftDensity — an element fades in as it approaches the
  // cone rather than stepping, so the weight is continuous in both position and direction.
  function _coneSeen(pts, qIfc, dIfc, farM) {
    var acc = 0;
    for (var i = 0; i < pts.length; i++) {
      var rx = pts[i][0] - qIfc.ix, ry = pts[i][1] - qIfc.iy, rz = pts[i][2] - qIfc.iz;
      var proj = rx * dIfc.ix + ry * dIfc.iy + rz * dIfc.iz;
      if (proj <= CONE_NEAR_M || proj >= farM) continue;
      var lat2 = rx * rx + ry * ry + rz * rz - proj * proj;
      var R = proj * CONE_HALF_TAN + 1.0;      // +1m core so the cone has width at its apex
      var u = lat2 / (R * R);
      if (u >= 1) continue;
      var g = 1 - u;
      acc += g * g;
    }
    return acc;
  }
  // Where the mass IS: soft-kernel-weighted centroid of points within bulkM of the camera (beyond
  // 2m — the wall being brushed past is not a subject), plus the soft count that weighted it.
  function _bulkNear(pts, qIfc, bulkM) {
    var R2 = bulkM * bulkM, sx = 0, sy = 0, sz = 0, sw = 0;
    for (var i = 0; i < pts.length; i++) {
      var rx = pts[i][0] - qIfc.ix, ry = pts[i][1] - qIfc.iy, rz = pts[i][2] - qIfc.iz;
      var d2 = rx * rx + ry * ry + rz * rz;
      if (d2 < 4 || d2 >= R2) continue;
      var g = 1 - d2 / R2;
      var w = g * g;
      sx += pts[i][0] * w; sy += pts[i][1] * w; sz += pts[i][2] * w; sw += w;
    }
    if (sw <= 1e-9) return null;
    return { x: sx / sw, y: sy / sw, z: sz / sw, w: sw };
  }
  // ══ The builder — called once per plan, pure function of its inputs ═══════════════════════════
  // cfg: {
  //   N            probes across the span (beats 3+4 as ONE stretch — §CPE_GAZE_CONSTANT_RATE)
  //   spanSec      seconds the span runs (walkSec for the log line)
  //   walkSec      Beat 3 seconds alone (log parity with the old line)
  //   capDps       CINEMA_TURN_DPS — the film's one turn rate
  //   acquireMax   GAZE_ACQUIRE_MAX (log only; the curve lives in acquireCap)
  //   acquireCap   fn(residRad, baseMaxAng) — §CPE_GAZE_ACQUIRE, passed in, never reimplemented
  //   rotToward    fn(a, b, maxAng) — the planner's slerp step, same rule
  //   sampleRaw    fn(i, sp) -> { x,y,z (three pos), dx,dy,dz (unit three dir), src }
  //   densPoints   [[ix,iy,iz],...] element centroids (ifc) — the SAME array every aim rule reads
  //   three2ifc / three2ifcDir / ifc2threeDir   the scene's converters
  //   farM         cone reach (CINEMA_FAN_FAR)   bulkM  neighbourhood radius (CINEMA_FAN_FAR)
  //   bulkOff      test-only: suppress the corrector (witness A/B — same plan, rule off)
  // }
  A.cinemaGazeBuild = function (cfg) {
    var N = cfg.N, i;
    var raw = [], pos = [], srcs = [];
    for (i = 0; i <= N; i++) {
      var s = cfg.sampleRaw(i, i / N);
      raw.push({ x: s.dx, y: s.dy, z: s.dz });
      pos.push({ x: s.x, y: s.y, z: s.z });
      srcs.push(s.src || 'los');
    }
    // ── §CPE_GAZE_BULK weight + subject fields, probed at K and lerped up to N — the same
    // probe-and-smooth idiom (and cost argument) as §CPE_AIM_SERIES' own 64-probe series.
    var K = 64, ws = [], bx = [], by = [], bz = [], bulkActive = 0, wMax = 0;
    var pts = cfg.densPoints || [];
    var canConvert = pts.length && cfg.three2ifc && cfg.three2ifcDir && cfg.ifc2threeDir;
    if (canConvert && !cfg.bulkOff) {
      for (i = 0; i <= K; i++) {
        var j = Math.round(i / K * N);
        var q = cfg.three2ifc(pos[j].x, pos[j].y, pos[j].z);
        var dI = cfg.three2ifcDir(raw[j].x, raw[j].y, raw[j].z);
        var seen = _coneSeen(pts, q, dI, cfg.farM);
        var nb = _bulkNear(pts, q, cfg.bulkM);
        var w = 0, tx = 0, ty = 0, tz = 0;
        if (nb) {
          var toB = { ix: nb.x - q.ix, iy: nb.y - q.iy, iz: nb.z - q.iz };
          var L = Math.hypot(toB.ix, toB.iy, toB.iz) || 1;
          var t3 = cfg.ifc2threeDir(toB.ix / L, toB.iy / L, toB.iz / L);
          tx = t3.x; ty = t3.y; tz = t3.z;
          w = (1 - _smoothstep(seen / SEEN_FLOOR)) * _smoothstep(nb.w / NEAR_FLOOR);
        }
        ws.push(w); bx.push(tx); by.push(ty); bz.push(tz);
      }
      ws = _smooth5(ws); bx = _smooth5(bx); by = _smooth5(by); bz = _smooth5(bz);
    } else {
      for (i = 0; i <= K; i++) { ws.push(0); bx.push(0); by.push(0); bz.push(0); }
    }
    function bulkAt(f) {
      var u = Math.max(0, Math.min(1, f)) * K, a = Math.min(K - 1, Math.floor(u)), t = u - a;
      return { w: ws[a] * (1 - t) + ws[a + 1] * t,
               x: bx[a] * (1 - t) + bx[a + 1] * t,
               y: by[a] * (1 - t) + by[a + 1] * t,
               z: bz[a] * (1 - t) + bz[a + 1] * t };
    }
    // ── Correct the raw series BEFORE the limiter — law order is corrector → acquire → rate cap,
    // so the correction can never introduce a turn faster than the film already allows.
    var cor = [];
    for (i = 0; i <= N; i++) {
      var B = bulkAt(i / N);
      var bl = Math.hypot(B.x, B.y, B.z);
      if (B.w > 1e-3 && bl > 1e-6) {
        var b = { x: B.x / bl, y: B.y / bl, z: B.z / bl };
        var dot = Math.max(-1, Math.min(1, raw[i].x * b.x + raw[i].y * b.y + raw[i].z * b.z));
        var ang = Math.acos(dot);
        cor.push(cfg.rotToward(raw[i], b, B.w * ang));   // constant-fraction slerp: w of the way
        if (B.w > wMax) wMax = B.w;
        if (B.w > 0.5) { srcs[i] = 'bulk'; bulkActive++; }
        else if (B.w > 0.05) srcs[i] = srcs[i] + '+bulk';
      } else {
        cor.push(raw[i]);
      }
    }
    // ── §CPE_GAZE_CONSTANT_RATE + §CPE_GAZE_ACQUIRE — moved verbatim from effects.js. The
    // composed (now corrected) gaze is sampled in TIME and rate-limited to capDps, acquire-scaled
    // when far off-axis. Forward-only; pure function of the series; replans stay byte-identical.
    var stepSec = Math.max(1e-6, cfg.spanSec) / N;
    var maxAng = cfg.capDps * stepSec * Math.PI / 180;
    var lim = [cor[0]], cur = cor[0], rawPeak = 0, limPeak = 0, acqPeakMult = 1;
    for (i = 1; i <= N; i++) {
      var rp = Math.acos(Math.max(-1, Math.min(1,
        cor[i].x * cor[i - 1].x + cor[i].y * cor[i - 1].y + cor[i].z * cor[i - 1].z))) * 180 / Math.PI;
      if (rp > rawPeak) rawPeak = rp;
      var resid = Math.acos(Math.max(-1, Math.min(1,
        cur.x * cor[i].x + cur.y * cor[i].y + cur.z * cor[i].z)));
      var cap = cfg.acquireCap(resid, maxAng);
      if (cap / maxAng > acqPeakMult) acqPeakMult = cap / maxAng;
      var nxt = cfg.rotToward(cur, cor[i], cap);
      var lp = Math.acos(Math.max(-1, Math.min(1,
        nxt.x * cur.x + nxt.y * cur.y + nxt.z * cur.z))) * 180 / Math.PI;
      if (lp > limPeak) limPeak = lp;
      cur = nxt; lim.push(cur);
    }
    // §GAZE_SRC — the provenance the skyline stare was missing: the log states the rule in force
    // per stretch of film, so the next console paste NAMES the owner instead of costing a
    // diagnosis session. Compressed to segments (a per-probe dump would be 513 lines).
    var segs = [], s0 = 0;
    for (i = 1; i <= N + 1; i++) {
      if (i > N || srcs[i] !== srcs[s0]) {
        segs.push((s0 / N).toFixed(3) + '-' + (Math.min(i, N) / N).toFixed(3) + ':' + srcs[s0]);
        s0 = i;
      }
    }
    console.log('§GAZE_SRC probes=' + (N + 1) + ' ' + segs.join(' ') +
      ' — per-probe owner of the composed gaze (span fractions of beats 3+4)');
    console.log('§CPE_GAZE_BULK probes=' + (K + 1) + ' active=' + bulkActive + '/' + (N + 1) +
      ' maxW=' + wMax.toFixed(2) + ' seenFloor=' + SEEN_FLOOR + ' nearFloor=' + NEAR_FLOOR +
      ' coneDeg=20 nearM=' + CONE_NEAR_M + ' farM=' + cfg.farM + ' bulkM=' + cfg.bulkM +
      (cfg.bulkOff ? ' (SUPPRESSED — witness A/B)' : '') +
      ' — empty-GAZE corrector: trigger is what the camera sees, not where it stands');
    console.log('§CPE_GAZE_CONSTANT_RATE probes=' + (N + 1) + ' spanSec=' + cfg.spanSec.toFixed(2) +
      ' (beats 3+4) walkSec=' + cfg.walkSec.toFixed(2) +
      ' capDps=' + cfg.capDps + ' capPerProbeDeg=' + (maxAng * 180 / Math.PI).toFixed(3) +
      ' rawPeakDeg=' + rawPeak.toFixed(2) + ' limitedPeakDeg=' + limPeak.toFixed(2) +
      ' rawPeakDps=' + (rawPeak / stepSec).toFixed(1) + ' limitedPeakDps=' + (limPeak / stepSec).toFixed(1) +
      ' acquirePeakMult=' + acqPeakMult.toFixed(2) + 'x (max ' + cfg.acquireMax + 'x)' +
      ' — the composed gaze, bounded at the rate the spin and orbit already turn at');
    return { dirs: lim, srcs: srcs };
  };
}
