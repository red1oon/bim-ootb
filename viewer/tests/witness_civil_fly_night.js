#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §CIVIL_FLY_NIGHT (2026-10-05, bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §W.1)
// Scope: Night mode ON, then Fly Tour on a civil model — does the flight stay lit by the road lamps it passes?
// Read the log after every run — the exit code is not evidence.
//
// ISSUE THIS PROVES OR DISPROVES: user, 2026-10-05: "How is the Fly proper with Night lighting". Night picks the N
// lamps nearest the camera (navigation budget) — on a 2.4 km road the pool must FOLLOW the drone. GREEN = at every
// sample the tour is progressing, night is still on, the lit point lights are real lamp heads, and they are the lamps
// NEAREST the camera (each lit light within the N nearest fixtures). Also logs the nearest lit lamp distance.
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (load / tour did not start), VACUOUS (no lights lit at a sample), RED CONTROL.
// Env: ROOT · BLD · BLD_DIR · GPU · PORT · SAMPLES · LOG
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'JELAPANG_AFTER';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC');
const GPU = process.env.GPU || 'sw';
const PORT = +(process.env.PORT || 8579);
const SAMPLES = +(process.env.SAMPLES || 13);
const LOG = process.env.LOG || '/tmp/witness_civil_fly_night.log';
const logStream = fs.createWriteStream(LOG, { flags: 'w' });
function log(l) { logStream.write(l + '\n'); console.log(l); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream', '.gz': 'application/gzip', '.webp': 'image/webp', '.woff2': 'font/woff2', '.sql': 'application/sql', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (!fs.existsSync(fp) && u.startsWith('/buildings/')) fp = path.join(BLD_DIR, u.slice('/buildings/'.length));
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  const st = fs.statSync(fp); res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cfn-profile-'));
  const browser = await puppeteer.launch({ headless: true, userDataDir: profile, protocolTimeout: 30 * 60 * 1000, args: ['--no-sandbox', '--window-size=1300,840'].concat(gpuArgs) });
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => { const t = m.text(); logStream.write('[con] ' + t + '\n'); if (/§(NIGHT_CIVIL_LAMPS|NIGHT_MODE|CIVIL_ROUTE )|START cinematic/.test(t)) console.log('  ' + t.slice(0, 260)); });
  page.on('pageerror', e => logStream.write('[pageerror] ' + e.message + '\n'));
  const rows = [];
  try {
    const url = `http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`; log('§CFN_NAV ' + url + ' gpu=' + GPU + ' root=' + ROOT);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.activeBuilding && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: 1800000, polling: 1000 });
    await page.evaluate(() => { window.APP.toggleNightMode(); window.APP.toggleFlyAround(); });
    await page.waitForFunction(() => window.APP.walkMode && window.APP.walkActions && window.APP.walkActions.length, { timeout: 600000, polling: 500 });
    // Seek along the WHOLE flight (pose = f(T), tour.js A.tourSeek) — frame-rate independent; software GL plays ~1 frame
    // every few seconds, so wall-clock sampling only ever saw the first 5 m. Playback paused so walkTick cannot move it.
    for (let i = 0; i < SAMPLES; i++) {
      const r = await page.evaluate((i, n) => {
        const A = window.APP; A._tourPaused = true;
        const T = (A._tourTotal || 0) * i / (n - 1), sk = A.tourSeek(T, false);
        A.camera.updateMatrixWorld(true);
        A._nightUpdateLights();
        const cam = A.camera.position, tg = A.controls.target;
        // the owner's own definition of "near" (tools.js _nightPickNearest): distance to the point HALFWAY between eye
        // and look-at, 4 m spacing between picks — so the oracle allows the spacing to push picks out to 2N
        const aim = { x: (cam.x + tg.x) / 2, y: (cam.y + tg.y) / 2, z: (cam.z + tg.z) / 2 };
        const fx = A._nightFixtureWorldPositions() || [];
        const dAim = p => Math.hypot(p.x - aim.x, p.y - aim.y, p.z - aim.z);
        const byDist = fx.map(p => ({ p, d: dAim(p) })).sort((a, b) => a.d - b.d);
        const lit = (A._nightLights || []).filter(l => l.visible !== false && l.intensity > 0);
        const N = lit.length, near2N = byDist.slice(0, Math.max(2 * N, 1)).map(e => e.p);
        let onFixture = 0, inNearest = 0, nearestLitD = Infinity, nearestLitCam = Infinity;
        lit.forEach(l => {
          const f = fx.find(p => Math.hypot(p.x - l.position.x, p.y - l.position.y, p.z - l.position.z) < 0.01);
          if (f) onFixture++;
          if (f && near2N.indexOf(f) >= 0) inNearest++;
          nearestLitD = Math.min(nearestLitD, dAim(l.position));
          nearestLitCam = Math.min(nearestLitCam, l.position.distanceTo(cam));
        });
        const ifc = A.three2ifc(cam.x, cam.y, cam.z);
        return { T: +T.toFixed(1), idx: sk ? sk.idx : -1, action: (A.walkActions[A.walkActionIdx] || {}).name || (A.walkActions[A.walkActionIdx] || {}).type || '',
          walk: !!A.walkMode, night: !!A._nightMode, scrub: !!(A._scrubVisible && A._scrubVisible()), fixtures: fx.length, lit: N, onFixture, inNearest,
          nearestLitToAimM: isFinite(nearestLitD) ? +nearestLitD.toFixed(1) : null, nearestFixtureToAimM: byDist.length ? +byDist[0].d.toFixed(1) : null,
          nearestLitToCamM: isFinite(nearestLitCam) ? +nearestLitCam.toFixed(1) : null, camIfc: [ifc.ix, ifc.iy, ifc.iz].map(v => +v.toFixed(0)), budget: A._nightMaxLights };
      }, i, SAMPLES);
      r.t = i; rows.push(r); log('§CFN_SAMPLE ' + JSON.stringify(r));
    }
  } catch (e) { log('§CFN verdict=INCONCLUSIVE reason=' + e.message); process.exitCode = 2; }
  finally { await browser.close(); server.close(); }
  if (!rows.length) { logStream.end(); return; }
  rows.filter(r => !r.lit).forEach(r => log('§CFN_VACUOUS sample=' + r.t + ' no light lit'));
  Witness('civil_fly_night')
    .population(() => rows)
    .schema({ type: 'object', required: ['idx', 'walk', 'night', 'lit', 'onFixture', 'inNearest'] })
    .invariant('tour playing + scrubber at every sample', rs => rs.every(r => r.walk && r.scrub))
    .invariant('samples span the whole flight (first action → last action)', rs => rs[0].idx === 0 && rs[rs.length - 1].idx > 0 && new Set(rs.map(r => r.idx)).size >= 3)
    .invariant('night stays on through the flight', rs => rs.every(r => r.night))
    .invariant('lights lit at every sample (not VACUOUS)', rs => rs.every(r => r.lit > 0))
    .invariant('every lit light is a real lamp head', rs => rs.every(r => r.onFixture === r.lit))
    .invariant('lit lights FOLLOW the drone: each among the 2N lamps nearest the view (owner\'s aim point, 4 m spacing)', rs => rs.every(r => r.inNearest === r.lit))
    .invariant('the lamp nearest the view is lit at every sample', rs => rs.every(r => Math.abs(r.nearestLitToAimM - r.nearestFixtureToAimM) < 0.05))
    .redControl(rs => rs.map(r => Object.assign(r, { inNearest: 0 })))
    .run();
  logStream.end();
})();
