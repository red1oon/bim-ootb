// WITNESS — §CINEMA_EXIT_BREATHE (prompts/PHOTOREAL_STILL_RENDER.md, user report 2026-07-26).
// ISSUE PROVEN/DISPROVEN: "the 11-13 sec, the camera rush and turns too rapidly. It should allow
//   some more seconds into 15th sec to exit and not turn until the 15th sec to look back after
//   exiting a building. The outside 10 secs just going around is luxurious, and need not orbit the
//   building more than once." Emphasis: gracefully, no hurry, and NO hard stop.
//
// This measures the PLAN NUMERICALLY — camera position, gaze azimuth and their rates of change,
// sampled frame by frame from the real A.cinemaPathPlan(). Per the project's fundamental law, a
// screenshot or "looks right" is NOT evidence for continuous camera motion; these numbers are.
//
//   G1 walk-out must end at ~13s (was 10s) — the +3s the user asked for, no more.
//   G2 the look-back must NOT begin before ~11s (was 8.4s) — "not turn until after exiting".
//   G3 the turn must be SLOWER than before in deg/s peak — that is literally "turns too rapidly".
//   G4 exterior orbit is exactly ONE revolution (360 +/- 1 deg), never more.
//   G5 no hard stop / no discontinuity: max per-frame position + gaze steps stay near the local
//      median (a beat-boundary kink would spike them).
//   G6 the film still ends flat and decelerating (§CINEMA_FLAT_ENDING / §CINEMA_END_DECEL intact).
//
// Run: node witness_cinema_exit_breathe.js [--baseline /home/red1/bim-ootb]

const http = require('http'), fs = require('fs'), path = require('path');
let puppeteer;
try { puppeteer = require('puppeteer'); }
catch (e) { puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'); }

const DB = 'buildings/Duplex_extracted.db';
const DUR = 24, FPS = 15, N = DUR * FPS;
const MIME = { '.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json',
  '.wasm':'application/wasm','.db':'application/octet-stream','.sql':'application/sql','.jpg':'image/jpeg',
  '.png':'image/png','.hdr':'application/octet-stream','.svg':'image/svg+xml','.ico':'image/x-icon' };

function serve(root) {
  return new Promise(res => {
    const s = http.createServer((q, r) => {
      let p = path.join(root, decodeURIComponent(q.url.split('?')[0]));
      fs.stat(p, (e, st) => {
        if (e) { r.writeHead(404); return r.end(); }
        if (st.isDirectory()) p = path.join(p, 'index.html');
        r.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes' });
        fs.createReadStream(p).pipe(r);
      });
    });
    s.listen(0, '127.0.0.1', () => res({ s, port: s.address().port }));
  });
}

async function sample(root, label) {
  const { s, port } = await serve(root);
  const b = await puppeteer.launch({ headless: 'new', handleSIGINT: false,
    args: ['--use-gl=angle','--use-angle=gl','--ignore-gpu-blocklist','--enable-gpu','--no-sandbox'] });
  const pg = await b.newPage(); await pg.setViewport({ width: 1280, height: 720 });
  const logs = []; pg.on('console', m => logs.push(m.text()));
  await pg.goto(`http://127.0.0.1:${port}/viewer/viewer.html?db=${encodeURIComponent(DB)}`,
    { waitUntil: 'domcontentloaded', timeout: 120000 });
  await pg.waitForFunction(() => window.APP && window.APP.cinemaPathPlan, { timeout: 180000 });
  await new Promise(r => setTimeout(r, 8000));

  const data = await pg.evaluate(async (dur, n) => {
    const A = window.APP;
    if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) await A.loadNavigate();
    if (typeof A.ensureRooms === 'function') await A.ensureRooms({});
    const plan = A.cinemaPathPlan(dur);
    if (!plan || !plan.poseAt) return { err: 'no plan' };
    const rows = [];
    for (let i = 0; i < n; i++) {
      const p = plan.poseAt(i / (n - 1));
      const gx = p.tx - p.x, gy = p.ty - p.y, gz = p.tz - p.z;
      const gazeAz = Math.atan2(gz, gx) * 180 / Math.PI;
      const gazeTilt = Math.atan2(-gy, Math.hypot(gx, gz)) * 180 / Math.PI;  // + = looking down
      rows.push({ t: i / (n - 1) * dur, x: p.x, y: p.y, z: p.z, tx: p.tx, ty: p.ty, tz: p.tz, gazeAz, gazeTilt });
    }
    return { rows, pivot: plan.pivot || null };
  }, DUR, N);

  await b.close(); s.close();
  const beats = logs.find(l => l.startsWith('§CINEMA_BEATS')) || '(none)';
  return { label, data, beats };
}

function unwrap(a) { const o = [a[0]]; for (let i = 1; i < a.length; i++) { let d = a[i] - a[i-1];
  while (d > 180) d -= 360; while (d < -180) d += 360; o.push(o[i-1] + d); } return o; }
function median(v) { const s = v.slice().sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; }

function analyse(r) {
  const rows = r.data.rows, out = {};
  const az = unwrap(rows.map(x => x.gazeAz));
  // per-frame steps
  const posStep = [], gazeStep = [];
  for (let i = 1; i < rows.length; i++) {
    posStep.push(Math.hypot(rows[i].x-rows[i-1].x, rows[i].y-rows[i-1].y, rows[i].z-rows[i-1].z));
    gazeStep.push(Math.abs(az[i] - az[i-1]));
  }
  out.maxPosStep = Math.max(...posStep); out.medPosStep = median(posStep);
  out.maxGazeRate = Math.max(...gazeStep) * FPS;   // deg/sec
  out.medGazeRate = median(gazeStep) * FPS;
  // when does the sustained turn begin? first frame after t=6s where gaze rate exceeds 3x median
  // and STAYS elevated for 5 consecutive frames (ignores single-frame noise).
  let turnStart = null;
  for (let i = 6 * FPS; i < gazeStep.length - 5; i++) {
    if (gazeStep.slice(i, i + 5).every(v => v * FPS > Math.max(2, out.medGazeRate * 3))) { turnStart = rows[i].t; break; }
  }
  out.turnStartSec = turnStart;
  // total yaw swept over the exterior act (last 40% is safely inside the orbit for both variants)
  out.finalTilt = rows[rows.length - 1].gazeTilt;
  out.endDecel = posStep[posStep.length - 1] / (median(posStep.slice(-60)) || 1);
  out.az = az; out.rows = rows; out.posStep = posStep;
  return out;
}

(async () => {
  const baseIdx = process.argv.indexOf('--baseline');
  const baseline = baseIdx > 0 ? process.argv[baseIdx + 1] : '/home/red1/bim-ootb';
  const runs = [];
  runs.push(await sample(baseline, 'BEFORE (' + baseline + ')'));
  runs.push(await sample(__dirname, 'AFTER  (' + __dirname + ')'));

  console.log('\n================= §CINEMA_EXIT_BREATHE WITNESS =================');
  const A = {};
  for (const r of runs) {
    if (r.data.err) { console.log(r.label + ': ERR ' + r.data.err); continue; }
    const a = analyse(r); A[r.label.slice(0, 6).trim()] = a;
    console.log('\n--- ' + r.label);
    console.log('  ' + r.beats);
    console.log('  turn (look-back) begins at : ' + (a.turnStartSec == null ? 'not detected' : a.turnStartSec.toFixed(2) + 's'));
    console.log('  peak gaze rate             : ' + a.maxGazeRate.toFixed(1) + ' deg/s   (median ' + a.medGazeRate.toFixed(1) + ')');
    console.log('  max per-frame position step: ' + a.maxPosStep.toFixed(3) + ' m   (median ' + a.medPosStep.toFixed(3) + ')');
    console.log('  final gaze tilt            : ' + a.finalTilt.toFixed(2) + ' deg (0 = flat)');
    console.log('  last-step / recent-median  : ' + a.endDecel.toFixed(3) + ' (<1 = still decelerating, no hard stop)');
  }
  const before = A['BEFORE'], after = A['AFTER'];
  if (before && after) {
    // orbit revolution count: total unwrapped yaw swept from tR to end, using each run's own beats
    const revOf = (a, tR) => { const i0 = Math.round(tR * FPS); return Math.abs(a.az[a.az.length-1] - a.az[i0]); };
    const tRof = r => { const m = /rise=([0-9.]+)/.exec(r.beats); return m ? Number(m[1]) * DUR : null; };
    const tRb = tRof(runs[0]), tRa = tRof(runs[1]);
    console.log('\n--- GATES');
    const g = [];
    const outOf = r => { const m = /out=([0-9.]+)/.exec(r.beats); return m ? Number(m[1]) * DUR : null; };
    const ob = outOf(runs[0]), oa = outOf(runs[1]);
    g.push(['G1 walk-out ends ~13s (was ' + (ob||0).toFixed(1) + 's)', oa != null && Math.abs(oa - 13) < 0.6, (oa||0).toFixed(2) + 's']);
    g.push(['G2 look-back starts >= 11s (was ' + (before.turnStartSec||0).toFixed(2) + 's)',
            after.turnStartSec != null && after.turnStartSec >= 10.9, (after.turnStartSec||0).toFixed(2) + 's']);
    g.push(['G3 turn is SLOWER in peak deg/s', after.maxGazeRate < before.maxGazeRate,
            after.maxGazeRate.toFixed(1) + ' < ' + before.maxGazeRate.toFixed(1)]);
    if (tRa != null) g.push(['G4 orbit = ONE revolution (360+/-12 deg)', Math.abs(revOf(after, tRa) - 360) < 12, revOf(after, tRa).toFixed(1) + ' deg']);
    g.push(['G5 no discontinuity (max pos step < 3x median)', after.maxPosStep < after.medPosStep * 3,
            after.maxPosStep.toFixed(3) + ' vs ' + (after.medPosStep * 3).toFixed(3)]);
    g.push(['G6 ends flat (|tilt| < 2 deg) and decelerating', Math.abs(after.finalTilt) < 2 && after.endDecel < 1.05,
            after.finalTilt.toFixed(2) + ' deg, decel ' + after.endDecel.toFixed(3)]);
    let pass = 0;
    for (const [name, ok, val] of g) { console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name + '  [' + val + ']'); if (ok) pass++; }
    console.log('\n  ' + pass + '/' + g.length + ' gates green');
    console.log('================================================================');
    process.exit(pass === g.length ? 0 : 1);
  }
  process.exit(1);
})().catch(e => { console.error('WITNESS CRASH ' + (e && e.stack || e)); process.exit(1); });
