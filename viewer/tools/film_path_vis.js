#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — verb 6 `film_path_visibility` (W-FILM-PATH-VIS)
// Spec: bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §19.3. Read the log after every run.
// SCOPE: READ ONLY. Per cinema_path band, how many drawn_walk_line pieces and drawn_walk_marker items
//        fall inside the film camera's frustum. Opens viewer/viewer.html headless on SwiftShader (CPU),
//        never the GPU; no bake, no DB write.
// The camera is the film's own: plan = A.cinemaPathPlan(dur, staged), pose = plan.poseAt(tNorm)
//        (fx_cinema_path_plan.js:1872), the stored path staged by the shipped loader (fx_cinema_orbit.js
//        _cpeLoadFromDb), dur by the bake's own rule (maxq_start.js: _total, then the plan's naturalTotal).
//        NOT applied: the bake-only §57.5 gaze blend (A._bakeCameraPoseAt, ±1.5 frames).
// Rules F1-F4 in the spec. byStorey = n/a: the drawn tables state no storey (DRAWN_SERVICES_FILM.md §2).
// The sheet column is never printed.
// Run: node viewer/tools/film_path_vis.js --db <viewer.db> [--path override.json] [--samples 240] [--min-band-samples 20]
//        [--width 1280 --height 720] [--json] [--log file] [--poses]
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');

const puppeteer = (function () {
  for (const id of [process.env.PUPPETEER_PATH, 'puppeteer', path.join(os.homedir(), 'bim-compiler', 'node_modules', 'puppeteer')]) {
    if (!id) continue; try { return require(id); } catch (e) { /* next */ }
  }
  console.error('§FILM-PATH-VIS FAIL could not load puppeteer (npm install puppeteer, or PUPPETEER_PATH=…)'); process.exit(2);
})();

const ROOT = path.resolve(__dirname, '..', '..');
const SW_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];   // cli_silent_bake.js `sw`
const BAND_TOL_M = 0.5;   // F1
const LINE_PTS = 9;       // F2

async function run(o) {
  const dbFile = path.resolve(o.db);
  if (!fs.existsSync(dbFile)) throw new Error('no such DB: ' + dbFile);
  const W = +o.width || 1280, H = +o.height || 720, N0 = Math.max(2, +o.samples || 240);
  const MINB = o.minBandSamples != null && o.minBandSamples !== '' ? Math.max(0, +o.minBandSamples) : 20;   // F5
  const NCAP = 24000;
  const override = o.path ? JSON.parse(fs.readFileSync(path.resolve(o.path), 'utf8')) : null;
  const logLines = [];
  const log = s => { logLines.push(s); if (!o.quiet) console.log(s); };

  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.hdr': 'application/octet-stream', '.webp': 'image/webp', '.woff2': 'font/woff2' };
  const server = http.createServer((req, res) => {
    try {
      const u = decodeURIComponent(req.url.split('?')[0]);
      const fp = u === '/__fpv/model.db' ? dbFile : path.join(ROOT, u.replace(/^\/+/, ''));
      if (!fp.startsWith(ROOT) && fp !== dbFile) { res.writeHead(403); res.end(); return; }
      if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('404'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(fp).pipe(res);
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fpv-prof-'));
  const browser = await puppeteer.launch({ headless: true, userDataDir: profile, protocolTimeout: 10 * 60 * 1000,
    args: ['--no-sandbox', '--disable-background-networking', '--disable-component-update', '--no-first-run', `--window-size=${W},${H}`].concat(SW_ARGS) });
  const pageErrors = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H });
    page.on('pageerror', e => pageErrors.push(String(e && e.message || e).slice(0, 200)));
    page.on('console', m => { const t = m.text(); if (o.pageLog) o.pageLog.push(t); });
    const url = `http://127.0.0.1:${port}/viewer/viewer.html?db=/__fpv/model.db`;
    log(`§FILM-PATH-VIS env db=${path.basename(dbFile)} gl=swiftshader viewport=${W}x${H} samples=${N0} minBandSamples=${MINB} path=${override ? 'file' : 'db:cinema_path'}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.camera && typeof window.APP.cinemaPathPlan === 'function' && window.THREE,
      { timeout: 300000, polling: 500 });
    await page.waitForFunction(() => window.APP.activeBuilding && window.APP.db && window.APP.buildingsRendered &&
      window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: 600000, polling: 1000 });

    const evalFn = (opt) => {
      const A = window.APP, T = window.THREE;
      const has = n => (A.dbQuery("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [n]) || []).length > 0;
      const lines = has('drawn_walk_line') ? A.dbQuery('SELECT rowid,x0,y0,z0,x1,y1,z1,system,basis FROM drawn_walk_line ORDER BY rowid') : [];
      const markers = has('drawn_walk_marker') ? A.dbQuery('SELECT rowid,x,y,z,kind,basis FROM drawn_walk_marker ORDER BY rowid') : [];
      // ── the path: a file override (IFC coords, converted exactly as the loader converts), or the stored table ──
      let ov = null, src;
      if (opt.override) {
        const f = opt.override; ov = {};
        for (const k in f) if (k !== 'bands') ov[k] = f[k];
        ov.bands = (f.bands || []).map(b => {
          const p = A.ifc2three(b.c.x, b.c.y, b.c.z), d = A.ifc2threeDir(b.d.x, b.d.y, b.d.z), L = Math.hypot(d.x, d.y, d.z) || 1;
          return { c: { x: p.x, y: p.y, z: p.z }, d: { x: d.x / L, y: d.y / L, z: d.z / L }, len: b.len, hold: +(b.hold || 0) };
        });
        src = 'file';
      } else {
        try { A.cinemaPathPlan(60); } catch (e) { /* the loader stages A._cinemaPathEdit as a side effect */ }
        ov = (A._getCinemaPathEdit && A._getCinemaPathEdit()) || null; src = 'db:cinema_path';
      }
      if (!ov || !ov.bands || ov.bands.length < 2) return { src, noPath: true, nLines: lines.length, nMarkers: markers.length };
      // ── duration: the bake's rule (maxq_start.js ~L565): _total, then the plan's own naturalTotal ──
      let dur = (typeof ov._total === 'number' && isFinite(ov._total) && ov._total > 0) ? ov._total : 60;
      const probe = A.cinemaPathPlan(dur, ov);
      if (probe && probe.naturalTotal > 0 && isFinite(probe.naturalTotal)) dur = probe.naturalTotal;
      const plan = A.cinemaPathPlan(dur, ov);
      const ends = b => { const h = b.len / 2; return [{ x: b.c.x - b.d.x * h, y: b.c.y - b.d.y * h, z: b.c.z - b.d.z * h }, { x: b.c.x + b.d.x * h, y: b.c.y + b.d.y * h, z: b.c.z + b.d.z * h }]; };
      const segDist = (p, a, b) => {
        const vx = b.x - a.x, vy = b.y - a.y, vz = b.z - a.z, L2 = vx * vx + vy * vy + vz * vz || 1e-12;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy + (p.z - a.z) * vz) / L2));
        return Math.hypot(p.x - a.x - vx * t, p.y - a.y - vy * t, p.z - a.z - vz * t);
      };
      const bandEnds = ov.bands.map(ends);
      const P = lines.map(r => { const a = A.ifc2three(r[1], r[2], r[3]), b = A.ifc2three(r[4], r[5], r[6]);
        const pts = []; for (let k = 0; k < opt.linePts; k++) { const t = k / (opt.linePts - 1); pts.push(new T.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t)); } return pts; });
      const M = markers.map(r => { const p = A.ifc2three(r[1], r[2], r[3]); return new T.Vector3(p.x, p.y, p.z); });
      const cam = new T.PerspectiveCamera(A.camera.fov, opt.W / opt.H, A.camera.near, A.camera.far);
      const fr = new T.Frustum(), m4 = new T.Matrix4();
      const buckets = new Map();   // band key → { samples, lines:Set, markers:Set }
      const bucket = k => { if (!buckets.has(k)) buckets.set(k, { samples: 0, still: 0, lines: new Set(), markers: new Set(), movLines: new Set(), movMarkers: new Set() }); return buckets.get(k); };
      const poses = [];
      for (let i = 0; i < opt.N; i++) {
        const t = i / (opt.N - 1), p = plan.poseAt(t);
        if (!p) continue;
        let best = -1, bd = Infinity;
        bandEnds.forEach((e, j) => { const d = segDist(p, e[0], e[1]); if (d < bd) { bd = d; best = j; } });
        // F1: on a band = within tol of its segment AND travelling along it (motion · d > 0.5) or holding still on it.
        // A leg that retraces a band the other way (a connector hop back to the next band) is off-path, still counted there.
        const pn = plan.poseAt(Math.min(1, t + 1e-4)), pp = plan.poseAt(Math.max(0, t - 1e-4));
        const vx = pn.x - pp.x, vy = pn.y - pp.y, vz = pn.z - pp.z, vL = Math.hypot(vx, vy, vz);
        const db = best >= 0 ? ov.bands[best].d : null;
        const along = !db || vL < 1e-6 || (vx * db.x + vy * db.y + vz * db.z) / vL > 0.5;
        const key = bd <= opt.tol && along ? String(best) : 'off-path';
        const B = bucket(key); B.samples++;
        const still = vL < 1e-6; if (still) B.still++;
        cam.position.set(p.x, p.y, p.z); cam.up.set(0, 1, 0); cam.lookAt(p.tx, p.ty, p.tz);
        cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
        fr.setFromProjectionMatrix(m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
        const inV = opt.brk ? () => true : q => fr.containsPoint(q);   // FPV_BREAK=1: the verb lies (sees everything) — must fail FV2
        P.forEach((pts, li) => { if (pts.some(inV)) { B.lines.add(li); if (!still) B.movLines.add(li); } });
        M.forEach((q, mi) => { if (inV(q)) { B.markers.add(mi); if (!still) B.movMarkers.add(mi); } });
        if (opt.poses) poses.push([t, p.x, p.y, p.z, p.tx, p.ty, p.tz, key, +bd.toFixed(4)]);
      }
      const tally = (set, rows, col) => { const o = {}; set.forEach(i => { const v = rows[i][col] == null ? 'null' : String(rows[i][col]); o[v] = (o[v] || 0) + 1; }); return o; };
      const out = [];
      const keys = [...buckets.keys()].sort((a, b) => (a === 'off-path') - (b === 'off-path') || (+a) - (+b));
      for (const k of keys) {
        const B = buckets.get(k);
        const byBasis = {}; for (const [o2, c] of [[tally(B.lines, lines, 8), 1], [tally(B.markers, markers, 5), 1]]) for (const x in o2) byBasis[x] = (byBasis[x] || 0) + o2[x] * c;
        out.push({ band: k, samples: B.samples, still: B.still, lines: B.lines.size, markers: B.markers.size, movingLines: B.movLines.size, movingMarkers: B.movMarkers.size, lineIdx: [...B.lines].sort((a, b) => a - b), markerIdx: [...B.markers].sort((a, b) => a - b),
          byBasis, bySystem: tally(B.lines, lines, 7) });
      }
      // FV3 measure = the bake's own (§CLI_BAKE_POSECHECK bandAnchorMinDistM): the flown track passes every stored band centre,
      // and the DERIVED plan (explicit null override) does not — so the verb flew the stored path, not a default one.
      const anchorMin = pl => ov.bands.map(b => { let mn = Infinity; for (let i = 0; i <= 2000; i++) { const q = pl.poseAt(i / 2000); if (q) mn = Math.min(mn, Math.hypot(q.x - b.c.x, q.y - b.c.y, q.z - b.c.z)); } return +mn.toFixed(3); });
      let derivedAnchor = null; try { derivedAnchor = anchorMin(A.cinemaPathPlan(dur, null)); } catch (e) { derivedAnchor = null; }
      const anyL = new Set(), anyM = new Set(); for (const B of buckets.values()) { B.lines.forEach(x => anyL.add(x)); B.markers.forEach(x => anyM.add(x)); }
      return { src, dur: +dur.toFixed(3), bands: ov.bands.length, nLines: lines.length, nMarkers: markers.length, fov: A.camera.fov, near: A.camera.near, far: A.camera.far,
        per: out, totalLines: anyL.size, totalMarkers: anyM.size, anchorMinDistM: anchorMin(plan), derivedAnchorMinDistM: derivedAnchor, poses };
    };
    const pass = n => page.evaluate(evalFn, { override, N: n, W, H, tol: BAND_TOL_M, linePts: LINE_PTS, poses: !!o.poses, brk: process.env.FPV_BREAK === '1' });
    // F5: every band gets at least MINB samples — repeat at N × ⌈MINB ÷ fewest⌉ until it does or the cap is hit
    let N = N0, R = await pass(N);
    const bandMin = r => { const b = (r.per || []).filter(x => x.band !== 'off-path'); const seen = new Set(b.map(x => +x.band));
      let k = -1, n = Infinity; for (let i = 0; i < (r.bands || 0); i++) { const c = seen.has(i) ? b.find(x => +x.band === i).samples : 0; if (c < n) { n = c; k = i; } } return { k, n }; };
    for (let guard = 0; !R.noPath && MINB > 0 && guard < 6; guard++) {
      const m = bandMin(R); if (m.n >= MINB || N >= NCAP) break;
      const to = Math.min(NCAP, N * Math.ceil(MINB / Math.max(1, m.n)));
      if (to <= N) break;
      log(`§FILM-PATH-VIS resample from=${N} to=${to} reason=band ${m.k} had ${m.n} < ${MINB}`);
      N = to; R = await pass(N);
    }
    R.samplesUsed = N;

    const J = JSON.stringify;
    let verdict;
    if (R.noPath) {
      log(`§FILM-PATH-VIS INCONCLUSIVE no path: ${R.src} has fewer than 2 bands (lines=${R.nLines} markers=${R.nMarkers}); nothing judged`);
      verdict = 'INCONCLUSIVE';
    } else {
      log(`§FILM-PATH-VIS plan src=${R.src} bands=${R.bands} durSec=${R.dur} fov=${R.fov} near=${R.near} far=${R.far} drawnLines=${R.nLines} drawnMarkers=${R.nMarkers}`);
      for (const b of R.per) log(`§FILM-PATH-VIS band=${b.band} samples=${b.samples} stillSamples=${b.still} linesInView=${b.lines}/${R.nLines} markersInView=${b.markers}/${R.nMarkers} whileMoving=${b.movingLines}+${b.movingMarkers} byBasis=${J(b.byBasis)} bySystem=${J(b.bySystem)} byStorey=n/a`);
      log(`§FILM-PATH-VIS anchors bandAnchorMinDistM=[${R.anchorMinDistM.join(',')}] derivedPlanAnchorMinDistM=[${(R.derivedAnchorMinDistM || []).join(',')}] (the bake's own posecheck measure)`);
      // F6: union over the bands only (interior views), beside the any-sample total
      const bl = new Set(), bm = new Set(); for (const b of R.per) if (b.band !== 'off-path') { b.lineIdx.forEach(x => bl.add(x)); b.markerIdx.forEach(x => bm.add(x)); }
      R.bandLines = bl.size; R.bandMarkers = bm.size;
      log(`§FILM-PATH-VIS bands linesInView=${bl.size}/${R.nLines} markersInView=${bm.size}/${R.nMarkers} (union over bands, off-path excluded)`);
      log(`§FILM-PATH-VIS total linesInView=${R.totalLines}/${R.nLines} markersInView=${R.totalMarkers}/${R.nMarkers} (distinct, any sample)`);
      const thin = []; for (let i = 0; i < R.bands; i++) { const b = R.per.find(x => x.band === String(i)); const c = b ? b.samples : 0; if (MINB > 0 && c < MINB) thin.push(i + ':' + c); }
      R.thin = thin;
      for (const t of thin) log(`§FILM-PATH-VIS THIN band=${t.split(':')[0]} samples=${t.split(':')[1]} < ${MINB} at samples=${N} (cap ${NCAP}): a view between samples can be missed`);
      const onBand = R.per.filter(b => b.band !== 'off-path').reduce((s, b) => s + b.samples, 0);
      if (!R.nLines && !R.nMarkers) verdict = 'INCONCLUSIVE';
      else if (!onBand) verdict = 'INCONCLUSIVE';
      else verdict = (R.totalLines + R.totalMarkers) > 0 ? 'SEES' : 'BLIND';
      const why = !R.nLines && !R.nMarkers ? ' (this DB states no drawn services: nothing judged)' : !onBand ? ` (no sample within ${BAND_TOL_M} m of a band: nothing judged)` : '';
      log(`§FILM-PATH-VIS verdict=${verdict}${why}${R.thin.length ? ` (${R.thin.length} THIN band${R.thin.length > 1 ? 's' : ''})` : ''} samplesUsed=${N}`);
    }
    log('§FILM-PATH-VIS not-checked: the bake-only §57.5 gaze blend (±1.5 frames); the findings-beat _cease3D hide; on-screen pixel size; storey (not stated in the drawn tables). Occlusion does not apply: the overlay is drawn depthTest:false.');
    if (pageErrors.length) log(`§FILM-PATH-VIS pageErrors=${pageErrors.length} first=${J(pageErrors[0])}`);
    return { verdict, ...R, pageErrors, log: logLines };
  } finally {
    await browser.close().catch(() => {});
    server.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

module.exports = { run };

if (require.main === module) {
  const a = process.argv.slice(2), arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
  if (!arg('db')) { console.error('usage: node viewer/tools/film_path_vis.js --db <viewer.db> [--path override.json] [--samples 240] [--min-band-samples 20] [--width 1280 --height 720] [--json] [--log f] [--poses]'); process.exit(2); }
  const quiet = a.includes('--json');
  run({ db: arg('db'), path: arg('path'), samples: arg('samples'), minBandSamples: arg('min-band-samples'), width: arg('width'), height: arg('height'), poses: a.includes('--poses'), quiet })
    .then(r => {
      if (arg('log')) fs.writeFileSync(arg('log'), r.log.join('\n') + '\n');
      if (quiet) process.stdout.write(JSON.stringify(r, null, 1) + '\n');
      process.exit(r.verdict === 'INCONCLUSIVE' ? 3 : 0);
    })
    .catch(e => { console.error('§FILM-PATH-VIS FAIL ' + (e && e.stack || e)); process.exit(1); });
}
