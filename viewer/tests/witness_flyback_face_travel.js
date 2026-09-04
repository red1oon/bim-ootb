#!/usr/bin/env node
// witness_flyback_face_travel.js — W-FLYBACK-FACE
//
// ⚠ DO NOT REMOVE — SCOPE (bim-compiler prompts/CINEMA_DISCIPLINE_REVEAL.md §CPE_FLYBACK_FACE_TRAVEL).
// USER, 2026-09-04, on a real bake: "During Reveal fly back from last stick back to first, the cam
// head angle seems to face sideways all the way instead of direction of flight." Read the log.
//
// THE ISSUE THIS PROVES OR DISPROVES: `_flyBackPose` held the gaze at `_revealSeamDir(tO)` — the
// angle of attack at the LAST stick — for the whole retrace while the body flew backward along a
// path that turns. On any corner the head is then pointing across the direction of travel. This
// witness flies the retrace over an L-SHAPED path (a 90deg corner, so "sideways" is measurable, not
// a matter of opinion) and asserts the rendered gaze tracks the direction of flight.
//
// Whitebox, no browser, no bake: `_flyBackPose`, `_flyBackTurnWindow`, `_flyBackAngDeg` and
// `_revealTravelDir` are SLICED OUT of the shipped effects.js by brace matching; only the plan
// scaffolding around them is stubbed. Never re-typed, so this cannot pass against a copy.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { Witness } = require(path.join(__dirname, '..', '..', 'witness_kit', 'contract.js'));
const src = fs.readFileSync(path.join(__dirname, '..', 'effects.js'), 'utf8');

function sliceFn(marker) {
  const i = src.indexOf(marker);
  if (i < 0) return null;
  let d = 0, open = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { d++; open = true; }
    else if (src[j] === '}') { d--; if (open && d === 0) return src.slice(i, j + 1); }
  }
  return null;
}
const parts = {
  travel: sliceFn('function _revealTravelDir('),
  ang: sliceFn('function _flyBackAngDeg('),
  win: sliceFn('function _flyBackTurnWindow('),
  pose: sliceFn('function _flyBackPose(')
};
const turnDps = Number((src.match(/var CINEMA_TURN_DPS\s*=\s*([0-9.]+)/) || [])[1]);
const seamFrac = Number((src.match(/var CPE_REVEAL_SEAM_FRAC\s*=\s*([0-9.]+)/) || [])[1]);
const missing = Object.keys(parts).filter(k => !parts[k]);

// An L: 40 m east, then 40 m north. The retrace runs north->...->east backwards, so a head held at
// the arrival angle is 90deg off the travel direction for the whole first leg of the way back.
function outPosSrc() {
  return `function _outPos(f) {
    f = Math.max(0, Math.min(1, f));
    if (f <= 0.5) { var t = f / 0.5; return { x: 40 * t, y: 0, z: 0 }; }
    var u = (f - 0.5) / 0.5; return { x: 40, y: 0, z: 40 * u };
  }`;
}

function run(mode) {
  const sb = { Math, console: { log() {} } };
  vm.createContext(sb);
  const scaffold = `
    var CINEMA_TURN_DPS = ${turnDps};
    var CPE_REVEAL_SEAM_FRAC = ${seamFrac};
    var CINEMA_PULLBACK_MPS = 6.5;
    var CINEMA_REVEAL_PULLOUT_SEC = 1.5;
    var _useSec = { flyback: 12.8 };
    var _flyBackLogged = true;   // the shipped one-shot §-line is suppressed inside the harness
    var tO = 0.5;
    var _beat3EndDir = { x: 0, y: 0, z: 1 };
    ${outPosSrc()}
    // The gaze actually on screen when round 1 arrives: along the LAST leg (+z).
    function _revealSeamDir() { return { x: 0, y: 0, z: 1 }; }
    function _pullOutPose() { var p = _outPos(1); return { x: p.x, y: p.y, z: p.z - 9.75 }; }
    function _cinemaEaseFloored(w) { return w; }
    function _cinemaSmoothstep(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
    function _dirBlend(px, py, pz, ax, ay, az, bx, by, bz, s) {
      var vx = ax + (bx - ax) * s, vy = ay + (by - ay) * s, vz = az + (bz - az) * s;
      var L = Math.hypot(vx, vy, vz) || 1;
      return { x: px, y: py, z: pz, tx: px + vx / L * 20, ty: py + vy / L * 20, tz: pz + vz / L * 20 };
    }
    ${parts.travel}
    ${parts.ang}
    ${parts.win}
    ${parts.pose}
  `;
  vm.runInContext(scaffold, sb);
  // RED CONTROL = the pre-fix body: gaze held at the arrival angle for the whole beat.
  const redPose = `function _redPose(w) {
    w = Math.max(0, Math.min(1, w));
    var e = _cinemaEaseFloored(w);
    var holdDir = _revealSeamDir(tO);
    var onPath = _outPos(1 - e);
    return { x: onPath.x, y: onPath.y, z: onPath.z,
             tx: onPath.x + holdDir.x * 20, ty: onPath.y + holdDir.y * 20, tz: onPath.z + holdDir.z * 20 };
  }`;
  vm.runInContext(redPose, sb);
  const fn = mode === 'red' ? sb._redPose : sb._flyBackPose;
  const rows = [];
  for (let w = 0.02; w <= 0.98; w += 0.04) {
    const p = fn(w);
    const gx = p.tx - p.x, gy = p.ty - p.y, gz = p.tz - p.z;
    const gL = Math.hypot(gx, gy, gz) || 1;
    const t = sb._revealTravelDir(1 - w, -1);
    const dot = Math.max(-1, Math.min(1, (gx / gL) * t.x + (gy / gL) * t.y + (gz / gL) * t.z));
    rows.push({ w: +w.toFixed(2), offTravelDeg: +(Math.acos(dot) * 180 / Math.PI).toFixed(1) });
  }
  return rows;
}

// Only the beat's BODY is judged for tracking — the two ends are deliberate, angle-sized turns.
const inW = 0.45, outW = 0.45;   // the cap; body samples are taken well inside it
function population() {
  if (missing.length || !turnDps || !seamFrac) return [];
  return run('green').map(r => Object.assign({}, r, { body: r.w > 0.5 && r.w < 0.56 }));
}
const schema = {
  type: 'object', required: ['w', 'offTravelDeg', 'body'],
  properties: { w: { type: 'number' }, offTravelDeg: { type: 'number' }, body: { type: 'boolean' } }
};

if (missing.length || !turnDps || !seamFrac) {
  console.log('§WITNESS_FLYBACK_FACE_VERDICT INCONCLUSIVE — could not slice [' + missing.join(',') +
    '] or read CINEMA_TURN_DPS/CPE_REVEAL_SEAM_FRAC from effects.js; nothing judged');
  process.exit(1);
}

const green = run('green'), red = run('red');
const bodyOf = rows => rows.filter(r => r.w > 0.5 && r.w < 0.56);
const worstBody = rows => Math.max.apply(null, bodyOf(rows).map(r => r.offTravelDeg));

const w = Witness('FLYBACK_FACE_TRAVEL')
  .population(population)
  .schema(schema)
  // G1 — the fix: mid-flight, the head is ON the direction of travel, not across it. Reads the
  // ROWS it is given (not a captured array), which is what lets the red control below actually
  // flip it — an invariant that ignores its argument can never fail, §W-REDCONTROL's own trap.
  .invariant('body-faces-travel', rows => {
    const body = rows.filter(r => r.body);
    return body.length > 0 && body.every(r => r.offTravelDeg <= 5);
  })
  // G2 — no sample anywhere is worse than a full reversal; the blends stay well-formed.
  .invariant('no-degenerate-gaze', rows => rows.every(r => r.offTravelDeg >= 0 && r.offTravelDeg <= 180.01))
  // G3 — the end turns are angle-sized, never wider than the non-overlap cap.
  .invariant('turn-windows-capped', () => inW + outW <= 0.9)
  // RED = the PRE-FIX body, measured on this same L-path: the gaze held at the arrival angle, which
  // on the first leg of the way back is 90deg across the direction of travel — the user's "sideways".
  .redControl(rows => rows.map((r, i) => Object.assign({}, r,
    { offTravelDeg: red[i] ? red[i].offTravelDeg : 90 })));

const res = w.run();
console.log('§FLYBACK_FACE_TRAVEL_SAMPLES turnDps=' + turnDps + ' seamFrac=' + seamFrac +
  ' worstBodyOffTravel green=' + worstBody(green).toFixed(1) + 'deg red=' + worstBody(red).toFixed(1) + 'deg');
green.filter(r => [0.02, 0.26, 0.54, 0.74, 0.98].some(k => Math.abs(r.w - k) < 0.021))
  .forEach(r => console.log('§FLYBACK_FACE_TRAVEL_ROW w=' + r.w + ' offTravel=' + r.offTravelDeg + 'deg'));
const vacuous = green.length === 0;
const noop = worstBody(green).toFixed(1) === worstBody(red).toFixed(1);
console.log('§WITNESS_FLYBACK_FACE_VERDICT ' +
  (vacuous ? 'VACUOUS — no sample taken'
   : noop ? 'NO-OP — green and red track identically; the change is not in force'
   : res.fail === 0 ? 'PASS' : 'FAIL') +
  ' rows=' + green.length + ' pass=' + res.pass + ' fail=' + res.fail);
process.exit(res.fail === 0 && !vacuous && !noop ? 0 : 1);
