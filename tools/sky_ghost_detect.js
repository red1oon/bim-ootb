#!/usr/bin/env node
// ⚠ DO NOT REMOVE — §SKY_GHOST detector (offline frame analyser). Scope: finds the "ghostly mirror of the ground
// in the sky" in civil road films WITHOUT a human looking (CLAUDE.md PRIMAL LAW). Read the §SKY_GHOST log after every run.
//
// DEFINITION (all numbers, no eyes):
//   horizon row  h = H/2 + f*tan(pitch)         f = (H/2)/tan(fov/2), pitch from the per-frame pose (_poses.json:
//                                                [i, px,py,pz, tx,ty,tz, ...], Y up). Roll ignored (film paths do not roll).
//   sky band     rows [8, h-30) x cols [0, 0.72*W)   (right 28% = HUD panels). Needs >= 24 rows, else INCONCLUSIVE
//                                                (camera looks down — nothing to judge; never PASS). HUD labels / boxes are MASKED OUT:
//                                                every pixel with luma < 90 (a sky is bright) dilated 7 px, in the sky band and in its mirror.
//                                                (v1 of this detector scored the 'Ground works here' label as a ghost — measured, fixed.)
//   score        MIRROR_NCC = max over mirror axes a in h±30 rows of the normalised cross-correlation between the
//                high-pass (x - 5x5 box blur) sky rows (a-k) and the high-pass ground rows (a+k), k=4..54 step 2.
//                A planar reflection of the ground in the sky correlates (>0); a clean sky does not (~0).
//   E            mean |high-pass| of the sky band (sparkle/edge energy) — reported, not the verdict.
//   threshold    from controls (see calibrate()): clean synthetic skies vs the same skies with the flipped ground
//                pasted in at alpha 0.12; THR = midpoint of (clean p99, ghost p1) — printed as §SKY_GHOST_CAL.
//   HORIZON_BOXES  (skyline-box signature) count of narrow (2..14 px) dark (luma<80) column-runs in the strip [h-4, h+10) x cols<0.72W.
//                A clean horizon (terrain / haze) has none; the photo-skyline ring (effects.js _photoSkyline, 37 near-black boxes) gives >=3.
//                Measured: frame 450 before fix 8 runs, after fix 0.
// Usage: node tools/sky_ghost_detect.js --video V.mp4 --poses V_poses.json [--fov 60] [--log f] [--frames a:b]
'use strict';
const fs = require('fs');
const { spawnSync } = require('child_process');
const W = 640, H = 360;                       // analysis grid (video is scaled to this)
const SKY_COLS = Math.floor(W * 0.72), TOP = 8, MARGIN = 30, MIN_ROWS = 24, DARK = 90, DIL = 7;
const KS = []; for (let k = 4; k <= 54; k += 2) KS.push(k);

function horizonRow(pose, fovDeg) {
  const d = [pose[4] - pose[1], pose[5] - pose[2], pose[6] - pose[3]];
  const pitch = Math.atan2(d[1], Math.hypot(d[0], d[2]));
  const f = (H / 2) / Math.tan(fovDeg * Math.PI / 360);
  return H / 2 + f * Math.tan(pitch);
}
function highpass(g) {                         // g: Float32Array W*H -> x - 5x5 box mean (edge-clamped)
  const out = new Float32Array(W * H), tmp = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0; for (let k = -2; k <= 2; k++) s += g[y * W + Math.min(W - 1, Math.max(0, x + k))]; tmp[y * W + x] = s / 5; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0; for (let k = -2; k <= 2; k++) s += tmp[Math.min(H - 1, Math.max(0, y + k)) * W + x]; out[y * W + x] = g[y * W + x] - s / 5; }
  return out;
}
function darkMask(g) {                          // 1 = usable pixel, 0 = within DIL px of a dark (HUD) pixel
  const m = new Uint8Array(W * H).fill(1), tmp = new Uint8Array(W * H).fill(1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y * W + x] < DARK) for (let k = -DIL; k <= DIL; k++) { const xx = x + k; if (xx >= 0 && xx < W) tmp[y * W + xx] = 0; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!tmp[y * W + x]) for (let k = -DIL; k <= DIL; k++) { const yy = y + k; if (yy >= 0 && yy < H) m[yy * W + x] = 0; }
  return m;
}
function horizonBoxes(g, h) {
  const y0 = Math.max(0, Math.round(h - 4)), y1 = Math.min(H, Math.round(h + 10)); if (y1 - y0 < 4) return null;
  const dark = new Uint8Array(SKY_COLS);
  for (let x = 0; x < SKY_COLS; x++) { let c = 0; for (let y = y0; y < y1; y++) if (g[y * W + x] < 80) c++; dark[x] = c >= 3 ? 1 : 0; }
  let runs = 0, x = 0; while (x < SKY_COLS) { if (!dark[x]) { x++; continue; } let e = x; while (e < SKY_COLS && dark[e]) e++; if (e - x >= 2 && e - x <= 14) runs++; x = e; }
  return runs;
}
// returns {verdict:'INCONCLUSIVE'|'MEASURED', ncc, axisOff, E, boxes, h}
function analyse(gray, pose, fovDeg) {
  const h = horizonRow(pose, fovDeg), bot = Math.floor(h - MARGIN);
  if (bot - TOP < MIN_ROWS) return { verdict: 'INCONCLUSIVE', reason: 'sky band empty (' + (bot - TOP) + ' rows)', h };
  const g = Float32Array.from(gray), hp = highpass(g), mk = darkMask(g);
  let E = 0, n = 0; for (let y = TOP; y < bot; y++) for (let x = 0; x < SKY_COLS; x++) if (mk[y * W + x]) { E += Math.abs(hp[y * W + x]); n++; }
  if (n < 2000) return { verdict: 'INCONCLUSIVE', reason: 'sky band is HUD/dark-masked (' + n + ' usable px)', h };
  E /= n;
  let best = -2, bestOff = 0, tried = 0;
  for (let dd = -30; dd <= 30; dd += 2) {
    const ax = h + dd; let ok = true;
    for (const k of KS) { const u = Math.round(ax - k), d = Math.round(ax + k); if (u < 2 || d > H - 3) { ok = false; break; } }
    if (!ok) continue; tried++;
    let sx = 0, sy = 0, c = 0;
    for (const k of KS) { const u = Math.round(ax - k) * W, d = Math.round(ax + k) * W; for (let x = 0; x < SKY_COLS; x++) if (mk[u + x] && mk[d + x]) { sx += hp[u + x]; sy += hp[d + x]; c++; } }
    if (c < 2000) continue;
    const mx = sx / c, my = sy / c; let sxy = 0, sxx = 0, syy = 0;
    for (const k of KS) { const u = Math.round(ax - k) * W, d = Math.round(ax + k) * W; for (let x = 0; x < SKY_COLS; x++) if (mk[u + x] && mk[d + x]) {
      const a = hp[u + x] - mx, b = hp[d + x] - my; sxy += a * b; sxx += a * a; syy += b * b; } }
    const r = sxy / Math.sqrt(sxx * syy + 1e-9); if (r > best) { best = r; bestOff = dd; }
  }
  if (!tried) return { verdict: 'INCONCLUSIVE', reason: 'ground band off-frame for every axis', h };
  return { verdict: 'MEASURED', ncc: best, axisOff: bestOff, E, boxes: horizonBoxes(g, h), h };
}
function decode(video, frames) {              // -> array of Uint8Array(W*H) gray
  const vf = 'scale=' + W + ':' + H + (frames ? ',select=between(n\\,' + frames[0] + '\\,' + (frames[1] - 1) + ')' : '');
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', video, '-vf', vf, '-vsync', '0', '-pix_fmt', 'gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error('ffmpeg: ' + String(r.stderr));
  const buf = r.stdout, out = [], sz = W * H; for (let o = 0; o + sz <= buf.length; o += sz) out.push(buf.subarray(o, o + sz)); return out;
}
module.exports = { analyse, decode, horizonRow, W, H };

if (require.main === module) {
  const argv = process.argv.slice(2), arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
  const video = arg('video'), poses = JSON.parse(fs.readFileSync(arg('poses'), 'utf8')), fov = +arg('fov', 60);
  const fr = arg('frames') ? arg('frames').split(':').map(Number) : null, thr = +arg('thr', 0.12);
  const frames = decode(video, fr), base = fr ? fr[0] : 0, rows = [];
  frames.forEach((g, j) => { const i = base + j, r = analyse(g, poses[i], fov);
    rows.push(Object.assign({ frame: i }, r));
    console.log('§SKY_GHOST frame=' + i + ' ' + (r.verdict === 'MEASURED' ? 'score=' + r.ncc.toFixed(4) + ' axisOff=' + r.axisOff + ' E=' + r.E.toFixed(3) + ' boxes=' + r.boxes + ' horizon=' + r.h.toFixed(0) + (r.boxes >= 3 ? ' FLAG' : '')
      : 'INCONCLUSIVE ' + r.reason)); });
  const m = rows.filter(r => r.verdict === 'MEASURED'), fl = m.filter(r => r.boxes >= 3).sort((a, b) => b.boxes - a.boxes || b.ncc - a.ncc);
  console.log('§SKY_GHOST_SUMMARY video=' + video + ' frames=' + rows.length + ' measured=' + m.length + ' inconclusive=' + (rows.length - m.length) + ' thr=' + thr + ' flagged=' + fl.length + ' (' + (100 * fl.length / Math.max(1, m.length)).toFixed(1) + '% of measured)');
  console.log('§SKY_GHOST_WORST ' + fl.slice(0, 10).map(r => r.frame + ':' + r.ncc.toFixed(3) + ' boxes=' + r.boxes).join(' '));
}
