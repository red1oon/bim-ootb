#!/usr/bin/env node
/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// poc_flyout_beats.js — §40.3 PoC for §38.2's fly-out beats. SELECTION ONLY, NO GPU, NO BROWSER.
//
// USER, 2026-09-08: "during the fly out the wing spans should have been marked, even the edge of
// roof to window sill etc as the canvas was clean for that."
//
// WHAT THIS ANSWERS BEFORE ANY MODULE IS WRITTEN:
//  1. WHAT are the wings? — maximal axis-aligned rectangles of the largest plate's storey walkable
//     raster, taken greedily largest-first. Each is a real length x width, not a shape guess.
//  2. Roof edge to window sill — straight from the DB: the roof's own top, the placed IfcWindow's
//     bbox bottom, per facade.
//  3. WOULD THEY READ over the fly-out window? — scored against the REAL recorded camera track of
//     the film the user watched (`*_poses.json`), not a re-derived path, with §29.8's held-legibility
//     rule: a cue must clear the bar at t, t+1.1 AND t+2.1.
// It can say NO: VACUOUS (no raster / no poses), and each rejected subject is named with its reason.
//
// Command: node scripts/poc_flyout_beats.js --db buildings/Hospital_silent_local.db \
//            --poses out/Hospital_FULL_measure_2026-09-08_poses.json --from 69 --to 148
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const SR = require(path.join(__dirname, '..', 'common', 'storey_raster.js'));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const DB = arg('db', 'buildings/Hospital_silent_local.db');
const POSES = arg('poses', 'out/Hospital_FULL_measure_2026-09-08_poses.json');
const FROM = +arg('from', 69), TO = +arg('to', 148), FPS = +arg('fps', 24);
const W = +arg('w', 1280), H = +arg('h', 720), FOV = +arg('fov', 60);
const STEP = 0.25;                        // §29.8's own sampling cadence
const HOLD = [0, 1.1, 2.1];               // held legibility — the cue must read at all three
const MIN_PX = 24;                        // §29.8's legibility floor
const MIN_AREA_M2 = 150, MIN_LONG_M = 12; // a "wing" must be a real limb, not a lobby notch
const MIN_SHORT_M = 8;                    // ...and a limb has width: 4.75 m is a corridor, not a wing
const MAX_WINGS = 6;
const SEP = '|#|';

function q(sql) {
  const out = cp.execFileSync('sqlite3', ['-noheader', '-separator', SEP, DB, sql], { maxBuffer: 1 << 28 }).toString();
  return out.split('\n').filter(Boolean).map(l => l.split(SEP));
}
const log = s => console.log(s);
const fmt = n => (+n).toLocaleString('en-US', { maximumFractionDigits: 0 });

// ── 1. the largest plate, and its storey's raster
const slab = q("SELECT m.guid, m.storey, m.element_name, t.center_x, t.center_y, t.center_z, " +
               "t.bbox_x, t.bbox_y, t.bbox_z FROM elements_meta m JOIN element_transforms t USING(guid) " +
               "WHERE m.ifc_class='IfcSlab' AND t.bbox_z < 0.5*MIN(t.bbox_x,t.bbox_y) " +
               "ORDER BY t.bbox_x*t.bbox_y DESC LIMIT 1");
if (!slab.length) { log('§FLYOUT_POC VACUOUS — no planar IfcSlab in ' + DB); process.exit(0); }
const S = { guid: slab[0][0], storey: slab[0][1], name: slab[0][2],
            cx: +slab[0][3], cy: +slab[0][4], cz: +slab[0][5],
            bx: +slab[0][6], by: +slab[0][7], bz: +slab[0][8] };
log('§FLYOUT_POC_PLATE guid=' + S.guid + ' storey="' + S.storey + '" ' + S.bx.toFixed(2) + 'x' + S.by.toFixed(2) +
    ' m bbox=' + fmt(S.bx * S.by) + ' m2 name="' + S.name + '"');

const rr = q("SELECT storey, res, x0, y0, cols, rows, hex(bits) FROM storey_walkable_raster WHERE storey='" +
             S.storey.replace(/'/g, "''") + "'");
if (!rr.length) { log('§FLYOUT_POC VACUOUS — no storey_walkable_raster for "' + S.storey + '"'); process.exit(0); }
const R = SR.fromRow([rr[0][0], +rr[0][1], +rr[0][2], +rr[0][3], +rr[0][4], +rr[0][5], SR.hexToBits(rr[0][6])]);
const cols = R.cols, rows = R.rows, res = R.res;
const grid = new Uint8Array(cols * rows);
let setN = 0;
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const b = SR.getBit(R.bits, cols, c, r); grid[r * cols + c] = b; setN += b; }
log('§FLYOUT_POC_RASTER storey="' + S.storey + '" ' + cols + 'x' + rows + ' @' + res + 'm origin=(' +
    R.x0.toFixed(2) + ',' + R.y0.toFixed(2) + ') set=' + setN + ' cells = ' + fmt(setN * res * res) + ' m2 walkable');

// ── 2. WINGS: greedy maximal rectangles. Largest-area all-set rectangle, recorded, cleared, repeat.
// Deterministic (largest-rectangle-in-histogram per row band), and every rejection is printed
// rather than silently dropped.
function largestRect(g) {
  const hgt = new Int32Array(cols);
  let best = { area: 0 };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) hgt[c] = g[r * cols + c] ? hgt[c] + 1 : 0;
    const st = [];
    for (let c = 0; c <= cols; c++) {
      const h = c === cols ? 0 : hgt[c];
      let start = c;
      while (st.length && st[st.length - 1].h >= h) {
        const t = st.pop();
        const area = t.h * (c - t.c);
        if (area > best.area) best = { area: area, c0: t.c, c1: c - 1, r0: r - t.h + 1, r1: r };
        start = t.c;
      }
      st.push({ c: start, h: h });
    }
  }
  return best.area ? best : null;
}
const wings = [], rejected = [];
const g = Uint8Array.from(grid);
for (let k = 0; k < MAX_WINGS * 3 && wings.length < MAX_WINGS; k++) {
  const b = largestRect(g);
  if (!b) break;
  for (let r = b.r0; r <= b.r1; r++) for (let c = b.c0; c <= b.c1; c++) g[r * cols + c] = 0;
  const wM = (b.c1 - b.c0 + 1) * res, dM = (b.r1 - b.r0 + 1) * res, aM = wM * dM;
  const rec = { i: wings.length, wM: wM, dM: dM, aM: aM,
                x0: R.x0 + b.c0 * res, x1: R.x0 + (b.c1 + 1) * res,
                y0: R.y0 + b.r0 * res, y1: R.y0 + (b.r1 + 1) * res,
                longM: Math.max(wM, dM), axis: wM >= dM ? 'x' : 'y' };
  if (aM < MIN_AREA_M2) { rejected.push(Object.assign({ why: 'area ' + aM.toFixed(0) + ' m2 < ' + MIN_AREA_M2 }, rec)); continue; }
  if (rec.longM < MIN_LONG_M) { rejected.push(Object.assign({ why: 'long side ' + rec.longM.toFixed(1) + ' m < ' + MIN_LONG_M }, rec)); continue; }
  var shortM = Math.min(wM, dM);
  if (shortM < MIN_SHORT_M) { rejected.push(Object.assign({ why: 'short side ' + shortM.toFixed(2) + ' m < ' + MIN_SHORT_M + ' — a corridor run, not a wing' }, rec)); continue; }
  wings.push(rec);
}
wings.forEach(function (w) {
  log('§FLYOUT_POC_WING i=' + w.i + ' ' + w.wM.toFixed(2) + 'x' + w.dM.toFixed(2) + ' m = ' + fmt(w.aM) +
      ' m2 long=' + w.longM.toFixed(2) + 'm axis=' + w.axis +
      ' ifcBox=(' + w.x0.toFixed(1) + ',' + w.y0.toFixed(1) + ')-(' + w.x1.toFixed(1) + ',' + w.y1.toFixed(1) + ')');
});
rejected.forEach(function (w) { log('§FLYOUT_POC_WING_REJECT ' + w.wM.toFixed(2) + 'x' + w.dM.toFixed(2) + ' m — ' + w.why); });
if (!wings.length) log('§FLYOUT_POC_WING VACUOUS — no rectangle cleared ' + MIN_AREA_M2 + ' m2 / ' + MIN_LONG_M + ' m');

// ── 3. ROOF EDGE -> WINDOW SILL, per facade, straight from the DB
const roof = q("SELECT MAX(t.center_z + t.bbox_z/2.0) FROM elements_meta m JOIN element_transforms t USING(guid) " +
               "WHERE m.ifc_class IN ('IfcRoof','IfcSlab')");
const roofTopZ = roof.length ? +roof[0][0] : null;
const wins = q("SELECT m.guid, m.storey, t.center_x, t.center_y, t.center_z, t.bbox_x, t.bbox_y, t.bbox_z " +
               "FROM elements_meta m JOIN element_transforms t USING(guid) WHERE m.ifc_class='IfcWindow'")
  .map(function (r) { return { guid: r[0], storey: r[1], cx: +r[2], cy: +r[3], cz: +r[4], bx: +r[5], by: +r[6], bz: +r[7] }; });
const sills = [];
if (!wins.length) {
  log('§FLYOUT_POC_SILL VACUOUS — no IfcWindow with a transform in this model');
} else {
  const ex = { x0: Math.min.apply(null, wins.map(function (w) { return w.cx; })),
               x1: Math.max.apply(null, wins.map(function (w) { return w.cx; })),
               y0: Math.min.apply(null, wins.map(function (w) { return w.cy; })),
               y1: Math.max.apply(null, wins.map(function (w) { return w.cy; })) };
  const facades = { N: [], S: [], E: [], W: [] };
  wins.forEach(function (w) {
    const d = { W: w.cx - ex.x0, E: ex.x1 - w.cx, S: w.cy - ex.y0, N: ex.y1 - w.cy };
    facades[Object.keys(d).sort(function (a, b) { return d[a] - d[b]; })[0]].push(w);
  });
  Object.keys(facades).forEach(function (f) {
    const list = facades[f];
    if (!list.length) { log('§FLYOUT_POC_SILL facade=' + f + ' VACUOUS — no IfcWindow nearest this side'); return; }
    const top = list.slice().sort(function (a, b) { return (b.cz - b.bz / 2) - (a.cz - a.bz / 2); })[0];
    const sillZ = top.cz - top.bz / 2;
    const drop = roofTopZ != null ? roofTopZ - sillZ : null;
    sills.push({ facade: f, guid: top.guid, storey: top.storey, sillZ: sillZ, drop: drop, n: list.length });
    log('§FLYOUT_POC_SILL facade=' + f + ' n=' + list.length + ' storey="' + top.storey + '" sillZ=' + sillZ.toFixed(2) +
        ' roofTopZ=' + (roofTopZ == null ? 'n/a' : roofTopZ.toFixed(2)) +
        ' roofEdgeToSill=' + (drop == null ? 'n/a' : drop.toFixed(2) + ' m') + ' guid=' + top.guid);
  });
}

// ── 4. WOULD IT READ? scored against the film's OWN recorded poses, with the held rule.
// modelOffset is not derivable from the DB (streaming sets it at load), so it is CALIBRATED from the
// film's own §SLAB_BEAT_DIAG corners against this same plate's DB bbox — an extracted number with a
// printed residual, never a guessed one.
const calX = +arg('calx', '46.24'), calY = +arg('caly', '92.99'), calZ = +arg('calz', '181.245');
log('§FLYOUT_POC_CALIB modelOffset=(' + calX + ',' + calY + ',' + calZ + ') src=§SLAB_BEAT_DIAG corners vs element_transforms bbox of ' + S.guid);
const i2t = function (ix, iy, iz) { return { x: ix - calX, y: iz - calZ, z: -(iy - calY) }; };

let poses = null;
try { poses = JSON.parse(fs.readFileSync(POSES, 'utf8')); } catch (e) { log('§FLYOUT_POC_SCORE VACUOUS — no poses at ' + POSES); }
if (poses) {
  const at = function (sec) { return poses[Math.max(0, Math.min(poses.length - 1, Math.round(sec * FPS)))]; };
  const fpx = (H / 2) / Math.tan(FOV * Math.PI / 360);
  function projLen(a, b, p) {
    const eye = { x: p[1], y: p[2], z: p[3] }, tgt = { x: p[4], y: p[5], z: p[6] };
    const f = [tgt.x - eye.x, tgt.y - eye.y, tgt.z - eye.z];
    const fl = Math.hypot(f[0], f[1], f[2]); if (!fl) return null;
    const fu = f.map(function (v) { return v / fl; });
    let s = [fu[1] * 0 - fu[2] * 1, fu[2] * 0 - fu[0] * 0, fu[0] * 1 - fu[1] * 0];   // f x up(0,1,0)
    const sl = Math.hypot(s[0], s[1], s[2]); if (sl < 1e-9) return null;
    s = s.map(function (v) { return v / sl; });
    const u = [s[1] * fu[2] - s[2] * fu[1], s[2] * fu[0] - s[0] * fu[2], s[0] * fu[1] - s[1] * fu[0]];
    const px = function (pt) {
      const d = [pt.x - eye.x, pt.y - eye.y, pt.z - eye.z];
      const zc = d[0] * fu[0] + d[1] * fu[1] + d[2] * fu[2];
      if (zc <= 0.1) return null;
      const xc = d[0] * s[0] + d[1] * s[1] + d[2] * s[2];
      const yc = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
      return { x: W / 2 + xc * fpx / zc, y: H / 2 - yc * fpx / zc };
    };
    const A2 = px(a), B2 = px(b);
    if (!A2 || !B2) return null;
    // BOTH ends must be on screen. The first cut of this PoC accepted one — and scored a 72 m wing
    // at 2,200 px on a 1,280 px frame, i.e. an arrow running clean off both sides, which reads as
    // nothing at all. A dimension cue is legible only when the whole of it is in the picture.
    const inF = function (q2) { return q2.x >= 0 && q2.x <= W && q2.y >= 0 && q2.y <= H; };
    return { len: Math.hypot(B2.x - A2.x, B2.y - A2.y), inFrame: inF(A2) && inF(B2) };
  }
  const zTop = S.cz + S.bz / 2;
  const subjects = wings.map(function (w) {
    const a = w.axis === 'x' ? i2t(w.x0, (w.y0 + w.y1) / 2, zTop) : i2t((w.x0 + w.x1) / 2, w.y0, zTop);
    const b = w.axis === 'x' ? i2t(w.x1, (w.y0 + w.y1) / 2, zTop) : i2t((w.x0 + w.x1) / 2, w.y1, zTop);
    return { key: 'wing' + w.i, label: w.longM.toFixed(2) + ' m wing span', a: a, b: b, m: w.longM };
  }).concat(sills.filter(function (s2) { return s2.drop != null; }).map(function (s2) {
    const win = wins.filter(function (x) { return x.guid === s2.guid; })[0];
    return { key: 'sill' + s2.facade, label: s2.drop.toFixed(2) + ' m roof edge to sill (' + s2.facade + ')',
             a: i2t(win.cx, win.cy, s2.sillZ), b: i2t(win.cx, win.cy, roofTopZ), m: s2.drop };
  }));
  const scored = subjects.map(function (sub) {
    let best = null;
    for (let t = FROM; t <= TO - HOLD[2]; t += STEP) {
      const trio = HOLD.map(function (d) { return projLen(sub.a, sub.b, at(t + d)); });
      if (trio.some(function (x) { return !x || !x.inFrame; })) continue;
      const held = Math.min.apply(null, trio.map(function (x) { return x.len; }));
      if (!best || held > best.held) best = { t: +t.toFixed(2), held: +held.toFixed(1),
        peak: +Math.max.apply(null, trio.map(function (x) { return x.len; })).toFixed(1) };
    }
    return { sub: sub, best: best };
  });
  scored.sort(function (a, b) { return (b.best ? b.best.held : -1) - (a.best ? a.best.held : -1); });
  scored.forEach(function (x) {
    if (!x.best) { log('§FLYOUT_POC_SCORE key=' + x.sub.key + ' NO-SLOT — never held in frame for ' + HOLD[2] +
      ' s inside ' + FROM + '-' + TO + ' s ("' + x.sub.label + '")'); return; }
    log('§FLYOUT_POC_SCORE key=' + x.sub.key + ' bestAt=' + x.best.t + 's heldPx=' + x.best.held + ' peakPx=' + x.best.peak +
        ' ' + (x.best.held >= MIN_PX ? 'LEGIBLE' : 'BELOW ' + MIN_PX + 'px — declined') + ' "' + x.sub.label + '"');
  });
  const legible = scored.filter(function (x) { return x.best && x.best.held >= MIN_PX; });
  log('§FLYOUT_POC_VERDICT subjects=' + subjects.length + ' legible=' + legible.length + '/' + subjects.length +
      ' window=' + FROM + '-' + TO + 's poses=' + poses.length +
      (legible.length ? ' cueOrder=[' + legible.map(function (x) { return x.sub.key + '@' + x.best.t + 's'; }).join(' ') + ']'
                      : ' — INCONCLUSIVE for a module: nothing clears ' + MIN_PX + ' px held; the beat family would be VACUOUS on this film'));
}
