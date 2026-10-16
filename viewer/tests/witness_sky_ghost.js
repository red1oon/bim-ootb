// ⚠ DO NOT REMOVE — §SKY_GHOST witness. Scope: the "ghost boxes on the horizon / in the sky" of civil road films (cause: the photo
// skyline ring, effects.js _buildPhotoProps, built around a km-scale road). Numbers only, no eyes (CLAUDE.md PRIMAL LAW). Read the log after every run.
//   node viewer/tests/witness_sky_ghost.js [--before V.mp4 --before-poses P.json --before-frame N] [--after A.mp4 --after-poses P.json]
//        [--after-log page.log]    Defaults: BEFORE = ~/Videos/CivilWorks_film_v5_BEFORE.mp4 frame 450 (baked from
//        ~/Downloads/JALAN JELAPANG IFC/CivilWorksPath.db, the canonical model); AFTER = /tmp/skyg/fix_450.mp4 (re-render of that frame:
//        node cli_silent_bake.js --db CivilWorksPath --buildup --label --clash --gpu real --frame-range 450:451 --log <after-log>).
//   Verdict lines: CONTROLS / BEFORE / AFTER / SKYLINE_GATE; overall GREEN only if every part judged something (else INCONCLUSIVE).
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const D = require('../../tools/sky_ghost_detect.js');
const argv = process.argv.slice(2), arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const HOME = os.homedir();
const W = D.W, H = D.H, out = [], log = s => { out.push(s); console.log(s); };
let bad = 0, vac = 0;
function expect(name, ok, detail) { log('§SKY_GHOST_W ' + name + ' ' + (ok ? 'PASS' : 'FAIL') + ' ' + (detail || '')); if (!ok) bad++; }

// ── controls: synthetic frames at a level camera (horizon row 180), so the detector is calibrated by construction ──────────────
const POSE_LEVEL = [0, 0, 100, 0, 0, 100, -10];            // looks along -z, pitch 0 -> horizon = H/2
const POSE_DOWN = [0, 0, 100, 0, 0, 20, -10];             // looks steeply down -> no sky
function synth(kind) {
  const g = new Uint8Array(W * H), hz = 180; let s = 12345; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = y < hz ? 190 - (hz - y) * 0.2 : 110 + 25 * rnd();   // bright gradient sky / noisy olive ground
  if (kind === 'skyline') for (let i = 0; i < 6; i++) { const x0 = 40 + i * 70; for (let y = hz - 2; y < hz + 7; y++) for (let x = x0; x < x0 + 8; x++) g[y * W + x] = 40; }
  if (kind === 'flipghost') for (let y = 8; y < hz - 30; y++) { const yy = 2 * hz - y; for (let x = 0; x < W; x++) g[y * W + x] = Math.round(0.8 * g[y * W + x] + 0.2 * g[yy * W + x]); }
  if (kind === 'hudlabel') for (let y = 60; y < 110; y++) for (let x = 20; x < 300; x++) g[y * W + x] = ((x * 7 + y * 3) % 5 === 0) ? 230 : 45;   // dark label with bright text pixels
  return g;
}
const cl = D.analyse(synth('clean'), POSE_LEVEL, 60), sk = D.analyse(synth('skyline'), POSE_LEVEL, 60), fg = D.analyse(synth('flipghost'), POSE_LEVEL, 60),
  hl = D.analyse(synth('hudlabel'), POSE_LEVEL, 60), dn = D.analyse(synth('clean'), POSE_DOWN, 60);
log('§SKY_GHOST_CAL clean ncc=' + cl.ncc.toFixed(3) + ' boxes=' + cl.boxes + ' | skyline-control ncc=' + sk.ncc.toFixed(3) + ' boxes=' + sk.boxes + ' | flipped-ground-in-sky control ncc=' + fg.ncc.toFixed(3) + ' | HUD-label control ncc=' + hl.ncc.toFixed(3) + ' boxes=' + hl.boxes + ' | verdict rule: boxes>=3 = ghost boxes');
expect('control_clean_not_flagged', cl.verdict === 'MEASURED' && cl.boxes < 3, 'boxes=' + cl.boxes);
expect('control_skyline_flagged', sk.verdict === 'MEASURED' && sk.boxes >= 3, 'boxes=' + sk.boxes);
expect('control_flipghost_ncc_above_clean', fg.ncc > cl.ncc + 0.15, 'ncc ' + fg.ncc.toFixed(3) + ' vs clean ' + cl.ncc.toFixed(3));
expect('control_hud_label_not_flagged', hl.boxes < 3 && hl.ncc < cl.ncc + 0.1, 'boxes=' + hl.boxes + ' ncc=' + hl.ncc.toFixed(3));
expect('control_camera_down_inconclusive', dn.verdict === 'INCONCLUSIVE', dn.verdict + ' ' + (dn.reason || ''));

// ── before / after on real frames ───────────────────────────────────────────────────────────────────────────────────────────────
function score(video, posesFile, frame) {
  if (!video || !fs.existsSync(video) || !fs.existsSync(posesFile)) return null;
  const poses = JSON.parse(fs.readFileSync(posesFile, 'utf8')), fr = D.decode(video, frame == null ? null : [frame, frame + 1]);
  if (!fr.length) return null; return D.analyse(fr[0], poses[frame == null ? 0 : frame], 60);
}
const bf = +arg('before-frame', 450);
const B = score(arg('before', path.join(HOME, 'Videos/CivilWorks_film_v5_BEFORE.mp4')), arg('before-poses', path.join(HOME, 'Videos/CivilWorks_film_v5_BEFORE_poses.json')), bf);
const A = score(arg('after', '/tmp/skyg/fix_450.mp4'), arg('after-poses', '/tmp/skyg/poses_450_452.json').replace(/.*/, p => p), null);
if (!B || B.verdict !== 'MEASURED') { log('§SKY_GHOST_W BEFORE INCONCLUSIVE ' + (B ? B.reason : 'video/poses missing')); vac++; }
else expect('before_frame_' + bf + '_has_ghost_boxes', B.boxes >= 3, 'boxes=' + B.boxes + ' ncc=' + B.ncc.toFixed(3) + '  (RED state: boxes>=3 = defect present)');
if (!A || A.verdict !== 'MEASURED') { log('§SKY_GHOST_W AFTER INCONCLUSIVE ' + (A ? A.reason : 'after video/poses missing')); vac++; }
else expect('after_frame_' + bf + '_clean', A.boxes === 0, 'boxes=' + A.boxes + ' ncc=' + A.ncc.toFixed(3) + (B && B.verdict === 'MEASURED' ? ' (before ncc=' + B.ncc.toFixed(3) + ')' : ''));
// the gate itself, read from the re-render's page log (§-line the shipped code emits)
const alog = arg('after-log', '/tmp/skyg/fix_450.log');
if (fs.existsSync(alog)) { const t = fs.readFileSync(alog, 'utf8');
  expect('civil_skips_skyline', /§SKY_GHOST_SKYLINE skipped/.test(t) && !/§PHOTO_PROPS built skylineBoxes=[1-9]/.test(t), 'log=' + alog); }
else { log('§SKY_GHOST_W SKYLINE_GATE INCONCLUSIVE no after-log'); vac++; }
log('§SKY_GHOST_VERDICT ' + (bad ? 'RED fails=' + bad : (vac ? 'INCONCLUSIVE vacuous_parts=' + vac : 'GREEN')));
process.exit(bad ? 1 : 0);
