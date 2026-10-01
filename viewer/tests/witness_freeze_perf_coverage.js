// §FREEZE_PERF_PANEL / §COVERAGE witness (bim-compiler prompts/PERFORMANCE_AS_CLASH.md §19).
// ISSUE IT PROVES OR DISPROVES: does cpe_freeze_perf.js's camera-basis coverage (angle test + pinhole ppm) give the same floor
// shares as an INDEPENDENT method — a lookAt view matrix + an off-axis projection with separate H/V half-angles, NDC in [-1,1],
// depth from the view matrix? Same room, same camera, 1 cm reference grid. FAIL if any ring share differs by > 1 point.
// Also: DORI ranges match d = 2560 / (2·ppm·tan 51.5°) to 0.01 m, and an empty population is not a PASS.
'use strict';
global.window = {};
const F = require('../cpe_freeze_perf.js');
const out = []; let fail = 0;
function chk(name, ok, msg) { out.push((ok ? 'PASS ' : 'FAIL ') + name + ' ' + msg); if (!ok) fail++; }

// 1. DORI ranges
const exp = { I: 4.07, R: 8.15, O: 16.29, D: 40.73 };
F.DORI.forEach(([k, ppm]) => { const d = F.doriRangeM(ppm); chk('dori_' + k, Math.abs(d - exp[k]) < 0.01, 'd=' + d.toFixed(3) + ' expected ' + exp[k]); });

// 2. independent reference: view matrix (lookAt, z up) + projection, 1 cm grid
function refShares(c, t, x0, x1, y0, y1, zf, pitch) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nrm = a => { const l = Math.hypot(...a); return a.map(v => v / l); };
  const back = nrm(sub(c, t)), right = nrm(cross([0, 0, 1], back)), up = cross(back, right);   // OpenGL lookAt: camera looks down -back
  const th = Math.tan(103 * Math.PI / 360), tv = Math.tan(55 * Math.PI / 360);
  const cnt = [0, 0, 0, 0, 0, 0]; const nx = Math.round((x1 - x0) / pitch), ny = Math.round((y1 - y0) / pitch);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = [x0 + (i + 0.5) * pitch, y0 + (j + 0.5) * pitch, zf], v = sub(p, c);
    const ve = [dot(v, right), dot(v, up), dot(v, back)];       // eye space, visible = ve[2] < 0
    if (ve[2] >= 0) { cnt[5]++; continue; }
    const ndcX = (ve[0] / -ve[2]) / th, ndcY = (ve[1] / -ve[2]) / tv;
    if (Math.abs(ndcX) > 1 || Math.abs(ndcY) > 1) { cnt[5]++; continue; }
    const widthAtDepth = 2 * -ve[2] * th, ppm = 2560 / widthAtDepth;
    let ring = 4; for (let d = 0; d < 4; d++) if (ppm >= [250, 125, 62.5, 25][d]) { ring = d; break; }
    cnt[ring]++;
  }
  return cnt.map(v => v / (nx * ny));
}
const room = { cx: 3, cy: 2, cz: 1.5, sx: 6, sy: 4, sz: 3 };
const best = F.judgeRoom(room, 0.1);
const ref = refShares(best.cam, [3, 2, 0], 0, 6, 0, 4, 0, 0.01);
const names = ['I', 'R', 'O', 'D', 'beyond', 'blind'];
names.forEach((n, i) => chk('share_' + n, Math.abs(100 * best.shares[i] - 100 * ref[i]) <= 1, 'module=' + (100 * best.shares[i]).toFixed(2) + '% reference=' + (100 * ref[i]).toFixed(2) + '%'));
chk('not_vacuous', best.shares.slice(0, 4).reduce((a, b) => a + b, 0) > 0.05 && best.shares[5] > 0.0, 'covered and blind both non-empty (a 0-or-100 case would prove nothing)');
// 3. long room: Recognise ring must stop it (range actually bites)
const longRoom = { cx: 15, cy: 2, cz: 1.5, sx: 30, sy: 4, sz: 3 }, lb = F.judgeRoom(longRoom, 0.1);
const lref = refShares(lb.cam, [15, 2, 0], 0, 30, 0, 4, 0, 0.01);
chk('long_room_beyond_R', Math.abs(100 * (lb.shares[2] + lb.shares[3]) - 100 * (lref[2] + lref[3])) <= 1 && lb.shares[2] + lb.shares[3] > 0.05,
  'O+D share module=' + (100 * (lb.shares[2] + lb.shares[3])).toFixed(1) + '% reference=' + (100 * (lref[2] + lref[3])).toFixed(1) + '% (> 5% proves the DORI range bites)');
out.forEach(l => console.log('§W_FREEZE_PERF_COVERAGE ' + l));
console.log('§W_FREEZE_PERF_COVERAGE ' + (fail ? 'FAIL ' + fail : 'PASS') + ' checks=' + out.length + ' best corner=' + best.corner + ' recognise%=' + (100 * best.rec).toFixed(1));
process.exit(fail ? 1 : 0);
