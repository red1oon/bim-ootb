#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — §CAM_FACE_CLOCK witness
 *   (bim-compiler prompts/LOADPATH_FREEZE_POLISH_RESUME.md §131.1)
 *
 * ISSUE IT PROVES OR DISPROVES: during the closing orbit, does the camera's FACE stay on the path
 * its BODY is on — in the film that was actually rendered?
 *
 * red1, twice: "the scene path seems to veer a bit off during the EscRoute. Check the slowing down
 * did not skew the cam face path." Then: "the path still veers."
 *
 * ⚠ NO PIXEL-DERIVED EVIDENCE. No frame is opened. The input is `<out>_poses.json`, which the bake
 * itself writes from `__maxqPoseTap` — one row per rendered frame,
 * `[i, camX, camY, camZ, targetX, targetY, targetZ, ms]`. That is the bake stating what it
 * rendered, which is the only kind of frame-time evidence this project accepts.
 *
 * RUN:  node witness_cam_face_path.js <poses.json> [...]
 *       (no argument: every *_poses.json in ~/Downloads, newest first)
 * EXIT: 0 all pass · 1 a claim failed · 2 INCONCLUSIVE (which is worse than a fail — say so)
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');

let pass = 0, fail = 0, inconclusive = 0;
const ck = (n, c, x) => { if (c) { pass++; console.log('  §WCFP ok    ' + n + (x ? '   ' + x : '')); }
                          else { fail++; console.log('  §WCFP WRONG ' + n + (x ? '   ' + x : '')); } };
const inc = (n, x) => { inconclusive++; console.log('  §WCFP INCONCLUSIVE ' + n + (x ? '   ' + x : '')); };

// The bound. 2.0° is a quarter of a degree per frame of drift at 24 fps over a 5.8 s beat — below
// what a viewer can read as the building sliding off centre, and far below the 42.21° the 13:11
// bake carried. It is NOT a number picked to pass: with one clock the excursion is 0 by
// construction, because a warp of time cannot move a camera off the curve it is walking.
const TOL_DEG = 2.0;
// The pull-back is DISCOVERED, not declared: the closing orbit is the trailing run of frames whose
// gaze distance is at least 3x the first frame's. A film that never pulls back has no such run and
// this witness says INCONCLUSIVE rather than passing vacuously.
const PULLBACK_X = 3;
const MIN_SPAN = 20;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = a => Math.hypot(a[0], a[1], a[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const angDeg = (a, b) => {
  const d = norm(a) * norm(b);
  if (d === 0) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b) / d))) * 180 / Math.PI;
};

function judge(file) {
  console.log('§CAM_FACE_PATH file=' + path.basename(file));
  let rows;
  try { rows = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { inc('W-CFP-0 the pose tap is readable', e.message); return; }
  if (!Array.isArray(rows) || rows.length < MIN_SPAN || !Array.isArray(rows[0]) || rows[0].length < 7) {
    inc('W-CFP-0 the pose tap has one row per frame with a camera and a target', 'rows=' + (rows && rows.length));
    return;
  }
  const P = rows.map(r => ({ i: r[0], c: [r[1], r[2], r[3]], t: [r[4], r[5], r[6]] }));
  const gaze = P.map(p => norm(sub(p.t, p.c)));

  // ── W-CFP-1 — find the closing orbit in the data itself ────────────────────────────────────
  const thresh = gaze[0] * PULLBACK_X;
  let a = P.length;
  while (a > 0 && gaze[a - 1] >= thresh) a--;
  const span = P.length - a;
  if (span < MIN_SPAN) {
    inc('W-CFP-1 this film has a closing pull-back to judge',
        'trailing frames with gaze >= ' + thresh.toFixed(1) + ' m (3x the first frame\'s ' +
        gaze[0].toFixed(1) + ' m): ' + span + ' — a film with no pull-back proves nothing here, and' +
        ' an INCONCLUSIVE sweep reads as "not red", so this is loud on purpose');
    return;
  }
  ck('W-CFP-1 the closing pull-back is discovered from the tap, not declared', true,
     'frames ' + P[a].i + '..' + P[P.length - 1].i + ' (' + span + '), gaze ' +
     gaze[a].toFixed(1) + ' m -> ' + gaze[gaze.length - 1].toFixed(1) + ' m');

  // ── W-CFP-2 — the face never leaves the path the body is on ────────────────────────────────
  // NOMINAL: the straight line between the look-at target at the pull-back's first frame and at its
  // last. Nothing about the beat's design is assumed — only that a target which starts somewhere,
  // bulges tens of metres, and returns to exactly where the chord says it should be is not a camera
  // move anybody authored. That bulge IS the veer.
  const T0 = P[a].t, T1 = P[P.length - 1].t;
  let worst = { deg: -1, i: -1, m: 0 };
  for (let k = a; k < P.length; k++) {
    const u = span === 1 ? 0 : (k - a) / (P.length - 1 - a);
    const nomT = [T0[0] + (T1[0] - T0[0]) * u, T0[1] + (T1[1] - T0[1]) * u, T0[2] + (T1[2] - T0[2]) * u];
    const deg = angDeg(sub(P[k].t, P[k].c), sub(nomT, P[k].c));
    if (deg > worst.deg) worst = { deg: deg, i: P[k].i, m: norm(sub(P[k].t, nomT)) };
  }
  ck('W-CFP-2 the camera\'s face never swings off the pose it is rendered from',
     worst.deg <= TOL_DEG,
     'worst ' + worst.deg.toFixed(2) + ' deg at frame ' + worst.i + ' (look-at target ' +
     worst.m.toFixed(1) + ' m off its chord; bound ' + TOL_DEG.toFixed(1) + ' deg). ' +
     (worst.deg > TOL_DEG
       ? 'THE FACE AND THE BODY ARE ON DIFFERENT CLOCKS — the pose comes from the eased time and the' +
         ' gaze from the raw one, so the camera stands where the ease put it and looks where it' +
         ' would have looked without it.'
       : 'one clock: the warp reparametrises time and cannot move the camera off its curve.'));
}

// ── W-CFP-3 — the source-side half. A grep is the right evidence here, because the claim IS about
//    which time variable the gaze is allowed to read. It is what stops the fix being reverted by a
//    later "contain the eased value" tidy-up — which is exactly how it was lost the first time.
function judgeSource() {
  const f = path.join(__dirname, 'viewer/cinema_maxq.js');
  let mq;
  try { mq = fs.readFileSync(f, 'utf8'); } catch (e) { inc('W-CFP-3 cinema_maxq.js is readable', e.message); return; }
  const loop = mq.slice(mq.indexOf('for (var i = 0; i < nFrames; i++) {'));
  const calls = loop.match(/_blendedGazeTarget\([^,]+,/g) || [];
  ck('W-CFP-3 the gaze blend is handed the POSE\'s own time, never the raw film clock',
     calls.length === 1 && /_blendedGazeTarget\(_poseTn,/.test(loop) && !/_blendedGazeTarget\(_tn,/.test(loop),
     'call sites in the frame loop: ' + (calls.length ? calls.join(' ') : 'none'));
  ck('W-CFP-4 _poseTn is the exact inverse of _tFilm, so no second camera clock is invented',
     /var _poseTn = \(_clip && _clip\.out > _clip\.in\) \? \(_poseFilmT - _clip\.in\) \/ \(_clip\.out - _clip\.in\) : _poseFilmT;/.test(loop) &&
     /function _tFilm\(tNorm\) \{ return _clip \? _clip\.in \+ tNorm \* \(_clip\.out - _clip\.in\) : tNorm; \}/.test(mq));
}

const args = process.argv.slice(2);
let files = args;
if (!files.length) {
  const dl = path.join(os.homedir(), 'Downloads');
  try {
    files = fs.readdirSync(dl).filter(n => /_poses\.json$/.test(n))
      .map(n => path.join(dl, n))
      .sort((x, y) => fs.statSync(y).mtimeMs - fs.statSync(x).mtimeMs);
  } catch (e) { files = []; }
}
if (!files.length) {
  console.log('§CAM_FACE_PATH INCONCLUSIVE — no *_poses.json given and none in ~/Downloads. This' +
    ' witness judges a REAL bake; without one it has nothing to judge and must not report green.');
  process.exit(2);
}
files.forEach(judge);
judgeSource();
console.log('§CAM_FACE_PATH ' + pass + '/' + (pass + fail) + (inconclusive ? '  INCONCLUSIVE=' + inconclusive : '') +
  ' => ' + (fail ? 'FAIL' : inconclusive ? 'INCONCLUSIVE' : 'PASS'));
process.exit(fail ? 1 : inconclusive ? 2 : 0);
