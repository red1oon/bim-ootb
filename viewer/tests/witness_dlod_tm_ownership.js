#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §DLOD_TM_OWNERSHIP (2026-09-04, bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §BME.8)
// Scope: dlod.js's per-instance frustum culler and the Time Machine both write InstancedMesh
// matrices. Ordered exactly as the CLI silent bake orders them — idle camera through streaming, TM
// activated at day 0 BEFORE the first camera move, then a camera pass that takes every instance out
// of the frustum and back — does every placed instance still hold a non-zero matrix at the end?
// Read the log after every run — the exit code is not evidence.
//
// ISSUE THIS PROVES OR DISPROVES (user, 2026-09-04, Hospital CLI silent bake): "some window glass
// panels not landed completely … some chairs but not full table sets … before this it was not an
// issue". MEASURED by the full-film §SDC census: dlod.js built its _origMatrix refs at the bake's
// frame 0 (after TM had zero-scaled the unplaced instances) and at frame 718 "restored" 24,992
// instances to those zero matrices — gone for the rest of the film. RED before §DLOD_TM_OWNERSHIP,
// GREEN after. Run against an unfixed tree with ROOT=/path/to/checkout to see the RED.
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (no load / TM did not arm / dlod never enabled / no
// instances), VACUOUS (a class with 0 placed instances is named, not judged), RED CONTROL (witness_kit).
// Env: ROOT (checkout to serve, default this file's repo) · BLD · BLD_DIR · GPU=real|sw · PORT · LOAD_MS · LOG
// ⛔ STATUS 2026-09-04 (session close): this harness has NOT yet gone RED on the unfixed tree — the
// far/near pass left 25013/25013 non-zero on main (aa06d0f6) because dlod.js's evaluation did not run
// during flyTo(): main.js's animate loop self-parks when idle (§IDLE_GATE) and markDirty() alone did not
// wake it in headless. Next step: drive the culler directly the way tour.js:1636 does
// (`A._dlodFrame = -1; A.dlodTick();`) after each camera set, then re-run RED (ROOT=~/bim-ootb) and
// GREEN. The GREEN run already shows the hand-off firing (§DLOD_DISABLE(time-machine)=1, refs never
// rebuilt under TM). The primary evidence for the defect is the full-film §SDC census log, not this file.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'Hospital_silent_local';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const GPU = process.env.GPU || 'real';
const PORT = +(process.env.PORT || 8565);
const LOAD_MS = +(process.env.LOAD_MS || 900000);
const LOG = process.env.LOG || '/tmp/witness_dlod_tm_ownership.log';
const logStream = fs.createWriteStream(LOG, { flags: 'w' });
function log(l) { logStream.write(l + '\n'); console.log(l); }
function logRaw(l) { logStream.write(l + '\n'); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream', '.gz': 'application/gzip', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (!fs.existsSync(fp) && u.startsWith('/buildings/')) fp = path.join(BLD_DIR, u.slice('/buildings/'.length));
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  const st = fs.statSync(fp); res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });
function inconclusive(r) { log('§DLOD_TM_OWNERSHIP verdict=INCONCLUSIVE reason=' + r + ' — nothing was judged'); log('§WITNESS_DLOD_TM_OWNERSHIP pass=0 fail=0 ran=0 INCONCLUSIVE'); }

// in-page: census of instanced matrices per class + a camera pass that renders real frames
function pageInstrument() {
  const A = window.APP, THREE = window.THREE, D = window.__dto = {};
  const m4 = new THREE.Matrix4();
  D.census = function () {
    const per = {}; let objs = 0, inst = 0, nonZero = 0;
    A.scene.traverse(o => {
      if (!(o.isInstancedMesh && A._instanceMeta && A._instanceMeta[o.id])) return;
      objs++; const meta = A._instanceMeta[o.id];
      const c = (meta[0] && meta[0].ifcClass) || '?', R = per[c] || (per[c] = { inst: 0, nonZero: 0 });
      for (let i = 0; i < meta.length; i++) { inst++; R.inst++; o.getMatrixAt(meta[i].instanceIndex, m4); const e = m4.elements; if (!(e[0] === 0 && e[5] === 0 && e[10] === 0)) { nonZero++; R.nonZero++; } }
    });
    return { objs, inst, nonZero, per, dlodEnabled: !!A._dlodEnabled, tmOn: !!A._tmOn };
  };
  // move the camera and let the real animate loop run N frames (dlodTick evaluates every 6 frames)
  D.flyTo = function (p, frames) {
    return new Promise(res => {
      A.camera.position.set(p[0], p[1], p[2]); A.controls.target.set(p[3], p[4], p[5]); A.controls.update();
      if (A.markDirty) A.markDirty();
      let n = 0; (function step() { if (A.markDirty) A.markDirty(); if (++n >= frames) return res(n); requestAnimationFrame(step); })();
    });
  };
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const gpuEnv = GPU === 'real' ? { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' } : {};
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dto-profile-'));
  const commit = (() => { try { return require('child_process').execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD']).toString().trim(); } catch (e) { return '?'; } })();
  log(`§DTO_ENV root=${ROOT} commit=${commit} bld=${BLD} gpu=${GPU} log=${LOG}`);
  const browser = await puppeteer.launch({ headless: true, userDataDir: profile, protocolTimeout: 15 * 60 * 1000, env: Object.assign({}, process.env, gpuEnv), args: ['--no-sandbox', '--hide-crash-restore-bubble', '--window-size=1300,840'].concat(gpuArgs) });
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  const claims = { disable: 0, skipTm: 0, gated: 0, refs: [], ticks: 0 };
  page.on('console', m => { const t = m.text(); logRaw('[con] ' + t);
    if (/§DLOD_DISABLE reason=time-machine/.test(t)) claims.disable++; if (/§DLOD_SKIP_TM/.test(t)) claims.skipTm++; if (/§DLOD_TM_GATED/.test(t)) claims.gated++;
    if (/§DLOD_REFS built/.test(t)) claims.refs.push(t.slice(0, 120)); if (/§DLOD_TICK/.test(t)) claims.ticks++; });
  page.on('pageerror', e => logRaw('[pageerror] ' + e.message));
  let rows = [];
  try {
    const url = `http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`; log('§DTO_NAV ' + url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.renderer && window.APP.camera && typeof window.tmActivateForBake === 'function', { timeout: LOAD_MS });
    await page.waitForFunction(() => window.APP.activeBuilding && window.APP.db && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: LOAD_MS, polling: 1000 });
    await page.evaluate(pageInstrument);
    const c0 = await page.evaluate(() => window.__dto.census());
    log(`§DTO_LOADED building=${await page.evaluate(() => window.APP.activeBuilding)} instancedObjs=${c0.objs} instances=${c0.inst} nonZero=${c0.nonZero} dlodEnabled=${c0.dlodEnabled} (camera untouched since streaming, as in the CLI)`);
    if (!c0.inst) { inconclusive('no InstancedMesh instances'); process.exitCode = 2; return; }
    if (!c0.dlodEnabled) { inconclusive('dlod.js not enabled on this building (MIN_ELEMENTS)'); process.exitCode = 2; return; }
    // 1. TM on at day 0, BEFORE any camera move — the CLI's ordering
    const tm = await page.evaluate(async () => { let ok = await window.tmActivateForBake(); if (!ok) ok = await window.tmActivateForBake(); return ok; });
    if (!tm) { inconclusive('tmActivateForBake=false'); process.exitCode = 2; return; }
    const bk = await page.evaluate(() => window.tmFollowTimeline());
    if (!bk || !(bk.projectEnd > bk.projectStart)) { inconclusive('no timeline span'); process.exitCode = 2; return; }
    await page.evaluate(c => window.tmSetCursor(c), bk.projectStart);
    const c1 = await page.evaluate(() => window.__dto.census());
    log(`§DTO_TM_DAY0 nonZero=${c1.nonZero}/${c1.inst} dlodEnabled=${c1.dlodEnabled} tmOn=${c1.tmOn} dlodDisableLines=${claims.disable}`);
    // 2. first camera move (the bake's frame 0) — dlod.js builds its refs NOW on an unfixed tree
    const poseA = [-25, 6.32, -3.02, -44.61, 2.67, -1.56];      // the film's frame 1170 pose (Downloads poses.json)
    const poseFar = [900, 600, 900, 1200, 0, 1200];              // nothing in the frustum
    await page.evaluate((p) => window.__dto.flyTo(p, 14), poseA);
    const refsAfterMove = claims.refs.length;
    log(`§DTO_FIRST_MOVE refsBuiltLines=${refsAfterMove} ticks=${claims.ticks} gatedLines=${claims.gated} last=${claims.refs[claims.refs.length - 1] || '-'}`);
    // 3. everything placed
    await page.evaluate(c => { window.__forceFull = true; window.tmSetCursor(c); }, bk.projectEnd);
    const c2 = await page.evaluate(() => window.__dto.census());
    log(`§DTO_TM_END nonZero=${c2.nonZero}/${c2.inst} (placed instances now real)`);
    // 4. the fight: out of the frustum (dlod.js zeroes) and back (dlod.js "restores" _origMatrix)
    await page.evaluate((p) => window.__dto.flyTo(p, 14), poseFar);
    const c3 = await page.evaluate(() => window.__dto.census());
    await page.evaluate((p) => window.__dto.flyTo(p, 14), poseA);
    const c4 = await page.evaluate(() => window.__dto.census());
    log(`§DTO_PASS out-of-view nonZero=${c3.nonZero}/${c3.inst} → back-in-view nonZero=${c4.nonZero}/${c4.inst} ticks=${claims.ticks} gatedLines=${claims.gated}`);
    // expected: every instance TM placed (c2.nonZero) still non-zero after the pass, per class
    const vac = [];
    for (const cls in c2.per) { const p2 = c2.per[cls], p4 = c4.per[cls] || { nonZero: 0 }; if (!p2.nonZero) { vac.push(cls); continue; }
      rows.push({ cls, placed: p2.nonZero, afterPass: p4.nonZero, lost: Math.max(0, p2.nonZero - p4.nonZero) });
      if (p2.nonZero !== p4.nonZero || /Plate|Furni|Member|Window/.test(cls)) log(`§DTO_CLASS cls=${cls} placed=${p2.nonZero} afterPass=${p4.nonZero} lost=${Math.max(0, p2.nonZero - p4.nonZero)}`); }
    if (vac.length) log('§DTO_VACUOUS classes with 0 placed instances (not judged): ' + vac.length);
    rows.push({ cls: '§claim:dlod-stood-down-at-TM-activation', placed: 1, afterPass: claims.disable > 0 ? 1 : 0, lost: claims.disable > 0 ? 0 : 1 });
    log(`§DTO_CLAIMS §DLOD_DISABLE(time-machine)=${claims.disable} §DLOD_SKIP_TM=${claims.skipTm} §DLOD_TM_GATED=${claims.gated}`);
  } catch (e) { log('§DTO_ERROR ' + (e && e.stack || e)); inconclusive('exception ' + String(e && e.message).slice(0, 120)); process.exitCode = 2; }
  finally { try { await browser.close(); } catch (e) {} server.close(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }
  if (!rows.length) return;
  Witness('dlod_tm_ownership').population(() => rows)
    .schema({ type: 'object', required: ['cls', 'placed', 'afterPass', 'lost'], properties: { cls: { type: 'string', minLength: 1 }, placed: { type: 'integer', minimum: 1 }, afterPass: { type: 'integer', minimum: 0 }, lost: { type: 'integer', minimum: 0 } } })
    .invariant('every instance the Time Machine placed still holds a non-zero matrix after a frustum out-and-back', rs => rs.every(r => r.lost === 0))
    .redControl(rs => { const c = rs.map(r => Object.assign({}, r)); if (c[0]) c[0].lost = 1; return c; })
    .run();
  logStream.end();
})();
