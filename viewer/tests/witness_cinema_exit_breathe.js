// WITNESS — §CINEMA_EXIT_BREATHE + §CINEMA_TURN_SLERP
// (prompts/PHOTOREAL_STILL_RENDER.md, user report 2026-07-26).
//
// ISSUE PROVEN/DISPROVEN: "the 11-13 sec, the camera rush and turns too rapidly. It should allow
//   some more seconds into 15th sec to exit and not turn until the 15th sec to look back after
//   exiting a building. The outside 10 secs just going around is luxurious, and need not orbit the
//   building more than once." Emphasis: gracefully, no hurry, and NO hard stop.
//
// This measures the PLAN NUMERICALLY — camera position, gaze DIRECTION and its rate of change,
// sampled frame by frame from the real A.cinemaPathPlan(). Per the project's fundamental law, a
// screenshot or "looks right" is NOT evidence for continuous camera motion; these numbers are.
//
// ── THE METRIC (rebuilt 2026-07-26; the first version's G2/G3 were artifacts) ────────────────────
// Gaze rate is the angle between CONSECUTIVE UNIT GAZE VECTORS, acos(dot(u[i-1],u[i])), in 3D.
// NEVER atan2 azimuth. Two reasons, both measured, not theoretical:
//   * azimuth wraps, and worse, it INVERTS by exactly 180° whenever the look-at point passes near
//     the camera — the old peak of "2700.0 deg/s" was that inversion (180° in one 15fps frame),
//     i.e. a coordinate artifact reported as camera motion;
//   * the renderer only ever consumes the DIRECTION (camera.lookAt), so the angle between
//     successive directions is exactly the rotation actually rendered. Nothing else is.
// The turn detector uses ONE FIXED threshold (TURN_DEG_S) for both runs. The old detector took
// 3x each run's OWN median, so BEFORE and AFTER were held to different bars (23.7 vs 0.0 deg/s)
// and "the look-back starts later" was comparing nothing.
//
// ── THE DATA (G0; see §CINEMA_TURN_SLERP D3) ─────────────────────────────────────────────────────
// The viewer fetches viewer/buildings/<db>. In a worktree that 404s and SILENTLY FALLS BACK TO OCI,
// which serves a thinner Duplex (5 IfcSpaces vs 21 authored) — different rooms, different exit,
// different film. G0 fails the whole run if either side touched OCI or if the two runs did not plan
// the same route, because every other gate is meaningless when they didn't.
// Link the canonical DBs in before running:
//   ln -s ~/bim-ootb/viewer/buildings/Duplex_* <thisdir>/viewer/buildings/
//
//   G0 both runs planned the SAME film from LOCAL data (zero OCI, same exit/pathLen/spinDeg).
//   G1 the clock the user asked for — walk-out ends 13-15s, look-back completes 15-17s. Expected
//      green on BOTH runs: §CINEMA_TIMING_672 already delivered it, which is the evidence that
//      CINEMA_OUT_SEC must NOT be raised a second time (7s would push completion to 17s).
//   G2 the look-back begins only once the camera is OUTSIDE the doorway (measured crossing, not a
//      clock reading), at a fixed 60 deg/s bar for both runs.
//   G3 no single-frame gaze inversion in the LOOK-BACK WINDOW — max step < MAX_STEP_DEG. This is
//      the gate that fails on both `main` and on the retime-alone, and that §CINEMA_TURN_SLERP
//      exists to turn green: the turn must be a rotation, not a snap.
//   G4 exterior orbit is exactly ONE revolution (360 +/- 12 deg), never more.
//   G5 no hard stop / no positional discontinuity — max per-frame step against its LOCAL
//      neighbours, not the whole film's median (the dive, walk and orbit run at different speeds
//      by design; only a step that dwarfs its own neighbourhood is a discontinuity).
//   G6 the film still ends flat and decelerating (§CINEMA_FLAT_ENDING / §CINEMA_END_DECEL intact).
//
// NOT gated, but PRINTED so it stays visible: the walk-out corner whip (§CINEMA_TURN_SLERP D2) —
// _outPos takes a route corner in one frame (~1800 deg/s on Duplex). Pre-existing on `main`, lives
// BEFORE the look-back window opens, and is not what this change touches.
//
// Run: node witness_cinema_exit_breathe.js [--baseline /home/red1/bim-ootb]

const http = require('http'), fs = require('fs'), path = require('path');
let puppeteer;
try { puppeteer = require('puppeteer'); }
catch (e) { puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'); }

const DB = 'buildings/Duplex_extracted.db';
const DUR = 24, FPS = 15, N = DUR * FPS;
const TURN_DEG_S = 60;      // one fixed bar for BOTH runs — never a per-run median
const MAX_STEP_DEG = 25;    // per-frame gaze step allowed inside the look-back window. 25 deg/frame
                            // = 375 deg/s: 3.7x above what §CINEMA_TURN_SLERP measures (6.8) and 2x
                            // below what the snap measures (48.6), so the gate discriminates both ways
                            // instead of sitting on the boundary.
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
  const remote = []; pg.on('response', r => { if (!/^(https?:\/\/127\.0\.0\.1|blob:|data:)/.test(r.url())) remote.push(r.url()); });
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
      rows.push({ t: i / (n - 1) * dur, x: p.x, y: p.y, z: p.z, tx: p.tx, ty: p.ty, tz: p.tz });
    }
    return { rows, pivot: plan.pivot || null,
             exitP: (plan.exit && plan.exit.p) ? { x: plan.exit.p.x, y: plan.exit.p.y, z: plan.exit.p.z } : null };
  }, DUR, N);

  await b.close(); s.close();
  const beats = logs.find(l => l.startsWith('§CINEMA_BEATS')) || '(none)';
  const exit = logs.find(l => l.startsWith('§CINEMA_EXIT ')) || '(none)';
  const sun = logs.find(l => l.startsWith('§CINEMA_SUN_ORDER')) || '(none)';
  // OCI/CDN split: the BVH module is a known CDN import and is not building data. Only DB/asset
  // fetches falling through to object storage invalidate the comparison.
  const ociHits = remote.filter(u => /oraclecloud|objectstorage/.test(u));
  // CINEMA_TURN_OVERLAP decides where the look-back blend can first act, and it DIFFERS between the
  // tips being compared. Read it from each root's own source rather than hardcoding one value for
  // both — that mistake is the same class as the per-run median bar this witness replaced.
  let overlap = null;
  try {
    const m = /CINEMA_TURN_OVERLAP = ([0-9.]+)/.exec(fs.readFileSync(path.join(root, 'viewer/effects.js'), 'utf8'));
    if (m) overlap = Number(m[1]);
  } catch (e) { /* falls through to the §CINEMA_BEATS log below */ }
  if (overlap == null) { const m2 = /turnOverlap=([0-9.]+)/.exec(beats); if (m2) overlap = Number(m2[1]); }
  return { label, data, beats, exit, sun, ociHits, root, overlap };
}

function median(v) { const s = v.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }
function field(line, re) { const m = re.exec(line); return m ? m[1] : null; }

function analyse(r) {
  const rows = r.data.rows, out = {};
  // ── unit gaze vectors, then the 3D angle between consecutive ones. No atan2, no wrap, no flip.
  const u = rows.map(p => {
    const gx = p.tx - p.x, gy = p.ty - p.y, gz = p.tz - p.z, L = Math.hypot(gx, gy, gz) || 1;
    return [gx / L, gy / L, gz / L];
  });
  const gazeStepDeg = [], posStep = [], gazeDist = [];
  for (let i = 1; i < rows.length; i++) {
    const a = u[i - 1], b = u[i];
    const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    gazeStepDeg.push(Math.acos(dot) * 180 / Math.PI);
    posStep.push(Math.hypot(rows[i].x - rows[i-1].x, rows[i].y - rows[i-1].y, rows[i].z - rows[i-1].z));
  }
  for (const p of rows) gazeDist.push(Math.hypot(p.tx - p.x, p.ty - p.y, p.tz - p.z));

  out.maxPosStep = Math.max(...posStep); out.medPosStep = median(posStep);
  // A DISCONTINUITY is a step that is huge compared with its NEIGHBOURS — not compared with the
  // whole film's median. The dive, the walk and the orbit legitimately run at different speeds, so
  // the global ratio flagged a perfectly smooth mid-orbit frame (3.079m at t=20.06s, ratio 3.03x)
  // while the worst LOCAL ratio in the same film is 1.07x. This is what the old Act III handoff's
  // ~10.8m single-frame jump would have shown, and what a beat-boundary kink would show.
  out.maxLocalRatio = 0; out.maxLocalRatioT = null;
  for (let i = 0; i < posStep.length; i++) {
    const m = median(posStep.slice(Math.max(0, i - 7), Math.min(posStep.length, i + 8))) || 1e-6;
    if (posStep[i] / m > out.maxLocalRatio) { out.maxLocalRatio = posStep[i] / m; out.maxLocalRatioT = rows[i + 1].t; }
  }
  out.maxGazeRate = Math.max(...gazeStepDeg) * FPS;
  out.medGazeRate = median(gazeStepDeg) * FPS;
  out.minGazeDist = Math.min(...gazeDist);
  out.minGazeDistT = rows[gazeDist.indexOf(out.minGazeDist)].t;

  // Beats, straight from the plan's own §-log — never re-derived here.
  out.tO = Number(field(r.beats, /out=([0-9.]+)/)) * DUR;
  out.tR = Number(field(r.beats, /rise=([0-9.]+)/)) * DUR;
  out.tS = Number(field(r.beats, /spin=([0-9.]+)/)) * DUR;
  out.pathLen = field(r.beats, /pathLen=([0-9.]+)/);
  out.spinDeg = field(r.beats, /spinDeg=(-?[0-9]+)/);
  out.exitGuid = field(r.exit, /chosen=(\S+)/);
  // Which ending branch this film took. §CINEMA_SUN_ORDER: sunFirst catches the reflection at eye
  // level FIRST and then climbs, so it ends ELEVATED at the look-down angle BY DESIGN
  // (§CINEMA_RISE_ENDING); only the sunLast branch glides back to flat (§CINEMA_FLAT_ENDING).
  // Gating "ends flat" unconditionally — as the first version of this witness did — asserts the
  // wrong contract on any sunFirst film, which is what Duplex is.
  out.sunFirst = /sunFirst=true/.test(r.sun);
  out.lookdownDeg = Number(field(r.sun, /lookdownDeg=([0-9.]+)/) || 45);

  // The look-back window: from where Beat 3's turn-overlap ramp can first act, to the end of Beat 4.
  // turnW3 keys off e3, which is _cinemaSmoothstep(f) of the LINEAR walk fraction f — so the window
  // opens where smoothstep(f) crosses 1-overlap, NOT at f = 1-overlap. (Taking the linear fraction
  // put the window start 0.7s too late and would have hidden any snap in that gap.)
  const overlap = r.overlap;                  // this root's OWN CINEMA_TURN_OVERLAP
  const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  let fOpen = 1;
  for (let k = 0; k <= 1000; k++) { const f = k / 1000; if (smooth(f) > 1 - overlap) { fOpen = f; break; } }
  out.overlap = overlap;
  out.winStart = out.tS + fOpen * (out.tO - out.tS);
  out.winEnd = out.tR;
  let winMax = 0, winMaxT = null;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].t < out.winStart || rows[i].t > out.winEnd) continue;
    if (gazeStepDeg[i-1] > winMax) { winMax = gazeStepDeg[i-1]; winMaxT = rows[i].t; }
  }
  out.winMaxStepDeg = winMax; out.winMaxStepT = winMaxT;

  // D2, printed not gated: the biggest single-frame gaze step BEFORE the window opens.
  let preMax = 0, preMaxT = null;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].t >= out.winStart) break;
    if (gazeStepDeg[i-1] > preMax) { preMax = gazeStepDeg[i-1]; preMaxT = rows[i].t; }
  }
  out.preWinMaxStepDeg = preMax; out.preWinMaxStepT = preMaxT;

  // When is the camera actually OUT of the doorway? The walk-out is radial, so the frame of closest
  // approach to the chosen door's own point is the crossing. This is what the user's "not turn until
  // ... after exiting a building" is anchored to — not a clock reading.
  out.tDoor = null;
  if (r.data.exitP) {
    let best = Infinity;
    for (const p of rows) {
      if (p.t < out.tS || p.t > out.tO) continue;
      const d = Math.hypot(p.x - r.data.exitP.x, p.y - r.data.exitP.y, p.z - r.data.exitP.z);
      if (d < best) { best = d; out.tDoor = p.t; }
    }
    out.doorDist = best;
  }

  // Turn start: first frame past the spin where the gaze rate crosses the FIXED bar and stays over
  // it for 5 consecutive frames (ignores single-frame noise, same bar for every run).
  let turnStart = null;
  for (let i = Math.round(out.tS * FPS); i < gazeStepDeg.length - 5; i++) {
    if (gazeStepDeg.slice(i, i + 5).every(v => v * FPS > TURN_DEG_S)) { turnStart = rows[i].t; break; }
  }
  out.turnStartSec = turnStart;

  // How much of the look-back is still OWED to Beat 4 when the walk-out ends? theta is the angle
  // between the gaze direction and the camera->pivot direction, so theta at tO is exactly what
  // Beat 4 must still sweep in its 2s. This is the "crushed into Beat 4" complaint as a number.
  const pv = r.data.pivot || { x: 0, y: 0, z: 0 };
  const thetaAt = t => {
    const i = Math.max(0, Math.min(rows.length - 1, Math.round(t * FPS))), p = rows[i];
    const px = pv.x - p.x, py = pv.y - p.y, pz = pv.z - p.z, L = Math.hypot(px, py, pz) || 1;
    const a = u[i];
    return Math.acos(Math.max(-1, Math.min(1, a[0]*px/L + a[1]*py/L + a[2]*pz/L))) * 180 / Math.PI;
  };
  out.thetaAtTO = thetaAt(out.tO);
  out.beat4Rate = out.thetaAtTO / Math.max(1e-6, out.tR - out.tO);

  const gz = rows[rows.length - 1];
  out.finalTilt = Math.atan2(-(gz.ty - gz.y), Math.hypot(gz.tx - gz.x, gz.tz - gz.z)) * 180 / Math.PI;
  out.endDecel = posStep[posStep.length - 1] / (median(posStep.slice(-60)) || 1);

  // Orbit revolution: total yaw swept from tR to the end, unwrapped. Safe here — the orbit never
  // passes its look-at point, so no inversion can contaminate it (unlike the turn).
  let sweep = 0;
  for (let i = Math.round(out.tR * FPS) + 1; i < rows.length; i++) {
    const a0 = Math.atan2(rows[i-1].z - rows[i-1].tz, rows[i-1].x - rows[i-1].tx);
    const a1 = Math.atan2(rows[i].z - rows[i].tz, rows[i].x - rows[i].tx);
    let d = (a1 - a0) * 180 / Math.PI;
    while (d > 180) d -= 360; while (d < -180) d += 360;
    sweep += d;
  }
  out.revDeg = Math.abs(sweep);
  return out;
}

(async () => {
  const baseIdx = process.argv.indexOf('--baseline');
  const baseline = baseIdx > 0 ? process.argv[baseIdx + 1] : '/home/red1/bim-ootb';
  const runs = [];
  runs.push(await sample(baseline, 'BEFORE'));
  runs.push(await sample(path.join(__dirname, '..', '..'), 'AFTER'));

  console.log('\n================= §CINEMA_EXIT_BREATHE / §CINEMA_TURN_SLERP WITNESS =================');
  const A = {};
  for (const r of runs) {
    if (r.data.err) { console.log(r.label + ': ERR ' + r.data.err); continue; }
    const a = analyse(r); A[r.label] = a;
    console.log('\n--- ' + r.label + '  (' + r.root + ')');
    console.log('  ' + r.beats);
    console.log('  off-localhost fetches to object storage: ' + r.ociHits.length);
    console.log('  look-back window            : ' + a.winStart.toFixed(2) + 's .. ' + a.winEnd.toFixed(2) + 's');
    console.log('  camera clears the doorway at: ' + (a.tDoor == null ? '-' : a.tDoor.toFixed(2) + 's (closest approach ' + a.doorDist.toFixed(2) + 'm)'));
    console.log('  first sustained >' + TURN_DEG_S + ' deg/s gaze : ' + (a.turnStartSec == null ? 'not detected' : a.turnStartSec.toFixed(2) + 's') +
                '   (NOT gated — also catches walk-path corners, not only the look-back)');
    console.log('  look-back still owed at tO  : ' + a.thetaAtTO.toFixed(1) + ' deg -> Beat 4 must sweep it in ' +
                (a.tR - a.tO).toFixed(1) + 's = ' + a.beat4Rate.toFixed(0) + ' deg/s mean');
    console.log('  MAX gaze step IN window     : ' + a.winMaxStepDeg.toFixed(1) + ' deg/frame (' + (a.winMaxStepDeg * FPS).toFixed(0) +
                ' deg/s) at t=' + (a.winMaxStepT == null ? '-' : a.winMaxStepT.toFixed(2)));
    console.log('  max gaze step BEFORE window : ' + a.preWinMaxStepDeg.toFixed(1) + ' deg/frame at t=' +
                (a.preWinMaxStepT == null ? '-' : a.preWinMaxStepT.toFixed(2)) + '   <- D2 corner whip, NOT gated');
    console.log('  min gaze distance           : ' + a.minGazeDist.toFixed(3) + ' m at t=' + a.minGazeDistT.toFixed(2) +
                (a.minGazeDist < 5 ? '   <- look-at point passing through the camera' : ''));
    console.log('  max per-frame position step : ' + a.maxPosStep.toFixed(3) + ' m (median ' + a.medPosStep.toFixed(3) +
                '), worst LOCAL ratio ' + a.maxLocalRatio.toFixed(2) + 'x at t=' + (a.maxLocalRatioT == null ? '-' : a.maxLocalRatioT.toFixed(2)));
    console.log('  orbit sweep after rise      : ' + a.revDeg.toFixed(1) + ' deg');
    console.log('  final gaze tilt             : ' + a.finalTilt.toFixed(2) + ' deg (0 = flat)');
    console.log('  last-step / recent-median   : ' + a.endDecel.toFixed(3) + ' (<1 = still decelerating, no hard stop)');
  }
  const before = A['BEFORE'], after = A['AFTER'];
  if (!before || !after) { console.log('\n  a run failed to produce a plan — no gates'); process.exit(1); }

  console.log('\n--- GATES');
  const g = [];
  const sameFilm = runs[0].ociHits.length === 0 && runs[1].ociHits.length === 0 &&
                   before.exitGuid === after.exitGuid && before.pathLen === after.pathLen &&
                   before.spinDeg === after.spinDeg;
  g.push(['G0 same film, local data both runs (else every gate below is void)', sameFilm,
          'oci ' + runs[0].ociHits.length + '/' + runs[1].ociHits.length + ', exit ' +
          (before.exitGuid === after.exitGuid ? 'same' : 'DIFFERENT') + ', pathLen ' + before.pathLen + '/' + after.pathLen +
          ', spin ' + before.spinDeg + '/' + after.spinDeg]);
  // G1 is the user's CLOCK: "more seconds into 15th sec to exit, and not turn until the 15th sec to
  // look back". §CINEMA_TIMING_672 (OUT 4->6) already delivers it on main — walk-out 8-14s,
  // look-back completing at 16s — so this gate is expected GREEN on BOTH runs, and that is the
  // point: it is the evidence that CINEMA_OUT_SEC must NOT be raised again. Measured, 7s pushes the
  // completion to 17s, past the 15th second. This branch therefore lands the overlap + the turn
  // fix only, and leaves the beat seconds alone.
  g.push(['G1 clock: walk-out ends 13-15s AND look-back completes 15-17s (unchanged from main, ' +
          'already delivered by §CINEMA_TIMING_672)',
          after.tO >= 13 && after.tO <= 15 && after.tR >= 15 && after.tR <= 17 &&
          Math.abs(after.tO - before.tO) < 0.01 && Math.abs(after.tR - before.tR) < 0.01,
          'out ' + after.tO.toFixed(2) + 's, rise ' + after.tR.toFixed(2) + 's (main: ' +
          before.tO.toFixed(2) + 's / ' + before.tR.toFixed(2) + 's)']);
  // The user's constraint is "not turn until ... AFTER EXITING a building". The look-back blend has
  // weight EXACTLY zero until winStart by construction, so the provable statement is winStart >
  // the MEASURED doorway crossing — no heuristic detector in the loop. (The 60 deg/s rate detector
  // is printed above but NOT gated: it fires at 9.43s on a walk-path CORNER, which is a turn of the
  // walk, not a look-back. A detector that cannot tell those apart cannot carry this gate.)
  // The second clause is what THIS branch changes: overlap 0.4 -> 0.25 delays the blend's opening.
  g.push(['G2 look-back cannot open before the door is cleared (' + (after.tDoor == null ? '?' : after.tDoor.toFixed(2) + 's') +
          '), and opens later than main (' + before.winStart.toFixed(2) + 's, overlap ' + before.overlap + ')',
          after.tDoor != null && after.winStart > after.tDoor && after.winStart > before.winStart,
          after.winStart.toFixed(2) + 's, overlap ' + after.overlap]);
  g.push(['G3 turn ROTATES, no snap: max gaze step in window < ' + MAX_STEP_DEG + ' deg (was ' +
          before.winMaxStepDeg.toFixed(1) + ' deg)', after.winMaxStepDeg < MAX_STEP_DEG,
          after.winMaxStepDeg.toFixed(1) + ' deg/frame']);
  g.push(['G4 orbit = ONE revolution (360+/-12 deg)', Math.abs(after.revDeg - 360) < 12, after.revDeg.toFixed(1) + ' deg']);
  g.push(['G5 no positional discontinuity (max step vs its LOCAL neighbours < 2.5x)',
          after.maxLocalRatio < 2.5,
          after.maxLocalRatio.toFixed(2) + 'x @ t=' + (after.maxLocalRatioT == null ? '-' : after.maxLocalRatioT.toFixed(2))]);
  // G6 asserts the ending contract of the branch this film actually took, plus §CINEMA_END_DECEL.
  const wantTilt = after.sunFirst ? after.lookdownDeg : 0;   // finalTilt is + = looking DOWN
  g.push(['G6 ends ' + (after.sunFirst ? 'ELEVATED at ' + after.lookdownDeg + ' deg (sunFirst/§CINEMA_RISE_ENDING)'
                                       : 'FLAT (sunLast/§CINEMA_FLAT_ENDING)') + ' and decelerating',
          Math.abs(after.finalTilt - wantTilt) < 2 && after.endDecel < 1.05,
          after.finalTilt.toFixed(2) + ' deg vs want ' + wantTilt + ', decel ' + after.endDecel.toFixed(3)]);
  let pass = 0;
  for (const [name, ok, val] of g) { console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + name + '  [' + val + ']'); if (ok) pass++; }
  console.log('\n  ' + pass + '/' + g.length + ' gates green');
  console.log('====================================================================================');
  process.exit(pass === g.length ? 0 : 1);
})().catch(e => { console.error('WITNESS CRASH ' + (e && e.stack || e)); process.exit(1); });
