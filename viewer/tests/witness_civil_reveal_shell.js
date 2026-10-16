#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §REVEAL_SHELL (2026-10-06, bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §REVEAL_SHELL)
// Scope: the reveal's ghost round / disc parade hides the model's SHELL. On a road the shell must include the pavement
// (ROAD); on a building it stays ARC+STR. Read the log after every run — the exit code is not evidence.
//
// ISSUE THIS PROVES OR DISPROVES: "Reveal no ARC is not working" on the highway — the round hid only ARC/STR (the bridge,
// 2,677 of 10,413), the 4,008 ROAD pieces stayed solid, so along the road nothing changed. GREEN = on JELAPANG the shell
// names ROAD, the parade lists no shell discipline, applying the ghost leaves 0 visible ROAD meshes while every parade
// discipline stays visible, and the restore shows ROAD again. On a building (BLD=Duplex_extracted) shell = ARC,STR.
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (load failed / no ROAD meshes judged), RED CONTROL (ROAD left in the parade).
// Env: ROOT · BLD (default JELAPANG_AFTER) · BLD_DIR · GPU=sw|real · PORT · LOG
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'JELAPANG_AFTER';
const CIVIL = !/duplex|hospital|terminal|ltu/i.test(BLD);
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC');
const GPU = process.env.GPU || 'sw';
const PORT = +(process.env.PORT || 8578);
const LOG = process.env.LOG || '/tmp/witness_civil_reveal_shell.log';
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'crs-profile-'));
  const browser = await puppeteer.launch({ headless: true, userDataDir: profile, protocolTimeout: 30 * 60 * 1000, args: ['--no-sandbox', '--window-size=1300,840'].concat(gpuArgs) });
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => { const t = m.text(); logStream.write('[con] ' + t + '\n'); if (/§(CIVIL_MODEL|CPE_REVEAL|CPE_ARCH_FADE)/.test(t)) console.log('  ' + t.slice(0, 300)); });
  page.on('pageerror', e => logStream.write('[pageerror] ' + e.message + '\n'));
  const R = {};
  try {
    const url = `http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`; log('§CRS_NAV ' + url + ' gpu=' + GPU);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.activeBuilding && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: 1800000, polling: 1000 });
    Object.assign(R, await page.evaluate(() => {
      const A = window.APP;
      const shell = A.cpeRevealShellDiscs(), discs = A.cpeRevealDiscsPresent();
      // visible meshes per discipline, read from the live scene (the same enumeration §CPE_REVEAL_LEAK uses)
      const vis = () => { const c = {}; A.collectMeshes(o => o.isMesh && o.userData && o.userData.disc).forEach(o => { const d = o.userData.disc; c[d] = c[d] || { vis: 0, all: 0 }; c[d].all++; if (o.visible) c[d].vis++; }); return c; };
      const before = vis();
      // a minimal plan: ghost round from 0.2 to 0.5, sampled at 0.4 (past the 1 s arch fade on a 100 s plan)
      const plan = { durationSec: 100, beats: { out: 0.1, pullout: 0.1, flyback: 0.2, reveal: 0.5, rise: 0.9 }, reveal: { discs, tailSec: 2 * discs.length + 2, riseSec: 10 } };
      const st = A.cpeRevealVisualAt(plan, 0.4);
      A.cpeRevealApplyVisual(plan, 0.4); A._applyDiscVisibility && A._applyDiscVisibility();
      const ghost = vis();
      A.cpeRevealApplyVisual(null, 0); A._applyDiscVisibility && A._applyDiscVisibility();
      const after = vis();
      return { civil: A.isCivilModel(), shell, discs, phase: st && st.phase, shown: st && (st.visDiscs || st.discs), before, ghost, after };
    }));
    log('§CRS_RESULT ' + JSON.stringify(R));
  } catch (e) { log('§CRS verdict=INCONCLUSIVE reason=' + e.message); R.err = e.message; process.exitCode = 2; }
  finally { await browser.close(); server.close(); }
  if (R.err) { logStream.end(); return; }
  const v = (o, d, k) => (o[d] && o[d][k]) || 0;
  Witness('civil_reveal_shell')
    .population(() => [R])
    .schema({ type: 'object', required: ['shell', 'discs', 'before', 'ghost', 'after'] })
    .invariant('gate: civil model detected only on the road file', rs => rs.every(r => r.civil === CIVIL))
    .invariant('shell = ARC,STR (+ROAD on a road)', rs => rs.every(r => r.shell.join(',') === (CIVIL ? 'ARC,STR,ROAD' : 'ARC,STR')))
    .invariant('parade lists no shell discipline', rs => rs.every(r => r.discs.length > 0 && !r.discs.some(d => r.shell.indexOf(d) >= 0)))
    .invariant('ghost phase reached at t=0.4', rs => rs.every(r => r.phase === 'ghost'))
    .invariant('ghost hides every shell mesh that was visible (judged > 0)', rs => rs.every(r => { const judged = r.shell.reduce((n, d) => n + v(r.before, d, 'vis'), 0); return (CIVIL ? v(r.before, 'ROAD', 'vis') > 0 : judged > 0) && r.shell.every(d => v(r.ghost, d, 'vis') === 0); }))
    .invariant('ghost keeps every parade discipline visible', rs => rs.every(r => r.discs.every(d => v(r.before, d, 'vis') === 0 || v(r.ghost, d, 'vis') === v(r.before, d, 'vis'))))
    .invariant('restore shows the shell again (same visible count as before)', rs => rs.every(r => r.shell.every(d => v(r.after, d, 'vis') === v(r.before, d, 'vis'))))
    .redControl(rs => rs.map(r => Object.assign({}, r, { discs: r.discs.concat(['ARC']), shell: ['ARC', 'STR'] })))
    .run();
  logStream.end();
})();
