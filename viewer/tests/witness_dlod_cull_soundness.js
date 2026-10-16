#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §DLOD_CULL_SOUNDNESS (2026-09-04, bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §BME.12)
// Scope: dlod.js's per-instance frustum test, in a PLAIN live load — no Time Machine, no bake.
// It culls an InstancedMesh instance on a SPHERE it derives itself in _buildRefs() (dlod.js:54-95):
//   centre = the instance matrix's TRANSLATION, radius = sqrt(bx^2+by^2+bz^2)*0.5 from element meta.
// If that sphere does not CONTAIN the geometry actually drawn at that instance, the culler can hide
// an element that is on screen — and nothing downstream can tell, because the scene graph still
// says the element exists (§CONTRACT_CHECK orphans=0). This witness measures containment directly.
// Read the log after every run — the exit code is not evidence.
//
// ISSUE THIS PROVES OR DISPROVES (user, 2026-09-04, live viewer, HHS_Office_Federated, v1141):
// "Even in HHS Office, it is missing a wall slab on its right side, ground floor." Their log rules
// out the §DLOD_TM_OWNERSHIP defect (#1660): no Time Machine ran in that session. It also rules out
// a streaming loss (§CONTRACT_CHECK batch=3677 instanced=3162 guidMap=6839 streamed=6839 orphans=0
// — every element IS in the scene). What it does show is dlod.js culling live: §DLOD_ENABLE
// count=6839, §DLOD_TICK imHid=555 then imHid=259. On HHS a wall CAN be instanced (44
// IfcWallStandardCase + 30 IfcSlab share geometry), unlike Hospital where walls are batched. So:
// is the sphere dlod culls on actually big enough / in the right place for those walls?
// PASS = every instance's true world AABB (geometry.boundingBox × instance matrix) lies inside
// dlod's own sphere. Any row where it does not is an element dlod can hide while it is on screen.
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (no load / dlod never enabled / no instances / no
// geometry bounds), VACUOUS (a class with 0 instances is named, not judged), RED CONTROL (witness_kit).
// Env: ROOT · BLD (default HHS_Office_Federated_extracted) · BLD_DIR · GPU=real|sw · PORT · LOAD_MS · LOG
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'HHS_Office_Federated_extracted';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const GPU = process.env.GPU || 'real';
const PORT = +(process.env.PORT || 8566);
const LOAD_MS = +(process.env.LOAD_MS || 900000);
const LOG = process.env.LOG || '/tmp/witness_dlod_cull_soundness.log';
const logStream = fs.createWriteStream(LOG, { flags: 'w' });
function log(l) { logStream.write(l + '\n'); console.log(l); }
function logRaw(l) { logStream.write(l + '\n'); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream', '.gz': 'application/gzip', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2', '.sql': 'application/sql', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (!fs.existsSync(fp) && u.startsWith('/buildings/')) fp = path.join(BLD_DIR, u.slice('/buildings/'.length));
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  const st = fs.statSync(fp); res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });
function inconclusive(r) { log('§DCS verdict=INCONCLUSIVE reason=' + r + ' — nothing was judged'); log('§WITNESS_DLOD_CULL_SOUNDNESS pass=0 fail=0 ran=0 INCONCLUSIVE'); }

// in-page: dlod's own sphere vs the true world AABB of the geometry drawn at that instance
function pageProbe() {
  const A = window.APP, THREE = window.THREE;
  window.__dcs = function () {
    // force dlod to build the same refs it culls on (idle camera never triggers the tick)
    if (A.dlodTick) { A._dlodFrame = -1; try { A.dlodTick(); } catch (e) {} }
    const m4 = new THREE.Matrix4(), box = new THREE.Box3(), c = new THREE.Vector3();
    const per = {}, worst = [];
    let objs = 0, inst = 0, noBounds = 0;
    A.scene.traverse(o => {
      if (!(o.isInstancedMesh && A._instanceMeta && A._instanceMeta[o.id])) return;
      objs++;
      const g = o.geometry;
      if (!g.boundingBox) { try { g.computeBoundingBox(); } catch (e) {} }
      if (!g.boundingBox) { noBounds += A._instanceMeta[o.id].length; return; }
      const meta = A._instanceMeta[o.id];
      for (let i = 0; i < meta.length; i++) {
        const m = meta[i];
        if (!m._origMatrix) continue;              // ref not built for this instance — dlod skips it too
        inst++;
        const cls = m.ifcClass || '?';
        const R = per[cls] || (per[cls] = { n: 0, bad: 0, hid: 0, maxOver: 0, maxOff: 0 });
        R.n++;
        if (m._dlodHid) R.hid++;
        // true world AABB of what is DRAWN at this instance
        o.getMatrixAt(m.instanceIndex, m4);
        box.copy(g.boundingBox).applyMatrix4(m4);
        if (box.isEmpty()) continue;
        box.getCenter(c);
        // dlod's own sphere (dlod.js:75-81)
        const sx = m._wx, sy = m._wy, sz = m._wz, sr = m._radius;
        // the farthest corner of the true AABB from the sphere centre
        const dx = Math.max(Math.abs(box.max.x - sx), Math.abs(box.min.x - sx));
        const dy = Math.max(Math.abs(box.max.y - sy), Math.abs(box.min.y - sy));
        const dz = Math.max(Math.abs(box.max.z - sz), Math.abs(box.min.z - sz));
        const need = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const over = need - sr;                         // >0 ⇒ geometry sticks out of the cull sphere
        const off = Math.hypot(c.x - sx, c.y - sy, c.z - sz);  // sphere centre vs true centre
        if (over > 0.05) {                              // 5 cm tolerance
          R.bad++;
          if (over > R.maxOver) R.maxOver = over;
          if (off > R.maxOff) R.maxOff = off;
          if (worst.length < 4000) worst.push({ cls, guid: m.guid, over: +over.toFixed(2), off: +off.toFixed(2), sr: +sr.toFixed(2), need: +need.toFixed(2), hid: !!m._dlodHid });
        }
      }
    });
    // ── BatchedMesh half: in a plain load (no TM, no storey/discipline filter) every slot that
    // carries an element must be VISIBLE. A slot left invisible here is an element that is in the
    // scene, passes §CONTRACT_CHECK, and is still not on screen — the shape of the user's report.
    const bm = {};
    A.scene.traverse(o => {
      if (!(o.isBatchedMesh && A._batchMeta && A._batchMeta[o.id])) return;
      const meta = A._batchMeta[o.id];
      for (let i = 0; i < meta.length; i++) {
        const m = meta[i], cls = m.ifcClass || '?';
        const R = bm[cls] || (bm[cls] = { slots: 0, invisible: 0, sample: [] });
        R.slots++;
        let vis = true;
        try { vis = o.getVisibleAt(m.slotId); } catch (e) { vis = true; }
        if (!vis) { R.invisible++; if (R.sample.length < 6) R.sample.push(m.guid); }
      }
    });
    return { objs, inst, noBounds, per, bm, worst: worst.sort((a, b) => b.over - a.over).slice(0, 25), dlodEnabled: !!A._dlodEnabled, tmOn: !!A._tmOn };
  };
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const gpuEnv = GPU === 'real' ? { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' } : {};
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dcs-profile-'));
  const commit = (() => { try { return require('child_process').execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD']).toString().trim(); } catch (e) { return '?'; } })();
  log(`§DCS_ENV root=${ROOT} commit=${commit} bld=${BLD} gpu=${GPU} log=${LOG}`);
  const browser = await puppeteer.launch({ headless: true, userDataDir: profile, protocolTimeout: 15 * 60 * 1000, env: Object.assign({}, process.env, gpuEnv), args: ['--no-sandbox', '--hide-crash-restore-bubble', '--window-size=1300,840'].concat(gpuArgs) });
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => logRaw('[con] ' + m.text()));
  page.on('pageerror', e => logRaw('[pageerror] ' + e.message));
  let rows = [];
  try {
    const url = `http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`; log('§DCS_NAV ' + url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.renderer && window.APP.camera, { timeout: LOAD_MS });
    await page.waitForFunction(() => window.APP.activeBuilding && window.APP.db && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: LOAD_MS, polling: 1000 });
    await page.evaluate(pageProbe);
    const r = await page.evaluate(() => window.__dcs());
    log(`§DCS_SCOPE building=${await page.evaluate(() => window.APP.activeBuilding)} instancedObjs=${r.objs} instancesJudged=${r.inst} noGeometryBounds=${r.noBounds} dlodEnabled=${r.dlodEnabled} tmOn=${r.tmOn}`);
    if (!r.dlodEnabled) { inconclusive('dlod.js not enabled on this building (MIN_ELEMENTS=5000)'); process.exitCode = 2; return; }
    if (!r.inst) { inconclusive('no instances with dlod refs — the culler has nothing to judge'); process.exitCode = 2; return; }
    const vac = [];
    for (const cls in r.per) { const p = r.per[cls];
      if (!p.n) { vac.push(cls); continue; }
      rows.push({ cls, instances: p.n, outsideSphere: p.bad, hiddenNow: p.hid, maxOverrunM: +p.maxOver.toFixed(2) });
      if (p.bad) log(`§DCS_CLASS cls=${cls} instances=${p.n} outsideSphere=${p.bad} maxOverrun=${p.maxOver.toFixed(2)}m maxCentreOffset=${p.maxOff.toFixed(2)}m hiddenNow=${p.hid}`);
    }
    if (vac.length) log('§DCS_VACUOUS classes with 0 judged instances (not judged): ' + vac.length);
    for (const w of r.worst) log(`§DCS_WORST cls=${w.cls} guid=${w.guid} sphereR=${w.sr}m needsR=${w.need}m overrun=${w.over}m centreOffset=${w.off}m dlodHiddenNow=${w.hid}`);
    let bmSlots = 0, bmInv = 0;
    for (const cls in r.bm) { const b = r.bm[cls]; bmSlots += b.slots; bmInv += b.invisible;
      rows.push({ cls: 'BM:' + cls, instances: b.slots, outsideSphere: b.invisible, hiddenNow: b.invisible, maxOverrunM: 0 });
      if (b.invisible) log(`§DCS_BM_HIDDEN cls=${cls} slots=${b.slots} invisibleAtLoad=${b.invisible} sample=${b.sample.join(',')}`); }
    log(`§DCS_BM batchedSlots=${bmSlots} invisibleAtLoad=${bmInv} classes=${Object.keys(r.bm).length} (plain load — no Time Machine, no storey/discipline filter, so every slot should be visible)`);
    const tot = rows.reduce((a, x) => a + x.outsideSphere, 0);
    log(`§DCS_TOTAL instances=${r.inst} outsideSphere=${tot} classes=${rows.length}`);
  } catch (e) { log('§DCS_ERROR ' + (e && e.stack || e)); inconclusive('exception ' + String(e && e.message).slice(0, 160)); process.exitCode = 2; }
  finally { try { await browser.close(); } catch (e) {} server.close(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }
  if (!rows.length) return;
  Witness('dlod_cull_soundness').population(() => rows)
    .schema({ type: 'object', required: ['cls', 'instances', 'outsideSphere', 'hiddenNow', 'maxOverrunM'], properties: { cls: { type: 'string', minLength: 1 }, instances: { type: 'integer', minimum: 1 }, outsideSphere: { type: 'integer', minimum: 0 }, hiddenNow: { type: 'integer', minimum: 0 }, maxOverrunM: { type: 'number', minimum: 0 } } })
    .invariant('the geometry drawn at every instance lies inside the sphere dlod.js culls it on', rs => rs.filter(r => !r.cls.startsWith('BM:')).every(r => r.outsideSphere === 0))
    .invariant('every BatchedMesh slot carrying an element is visible in a plain load', rs => rs.filter(r => r.cls.startsWith('BM:')).every(r => r.outsideSphere === 0))
    .redControl(rs => { const c = rs.map(r => Object.assign({}, r)); if (c[0]) c[0].outsideSphere = 1; return c; })
    .run();
  logStream.end();
})();
