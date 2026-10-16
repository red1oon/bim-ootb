#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §BM_BOUNDS_CULL (2026-09-04, bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §BME.8)
// Scope: three r185 BatchedMesh culls each slot by `_geometryInfo[g].boundingSphere`, which
// setGeometryAt COPIES from the source geometry (`e.boundingSphere.clone()` — extracted from
// three.core.min.js class Eo). §SDC measured 14,138/38,169 stored spheres with a vertex OUTSIDE
// them (worst 62 m). This witness answers the load-bearing question: at the film's OWN recorded
// poses, how many visible slots does the stale sphere cull while their true vertices are in view,
// per ifc_class? Read the log after every run — the exit code is not evidence.
//
// ISSUE THIS PROVES OR DISPROVES (user, 2026-09-04): "some window glass panels not landed …
// selective … some chairs but not full table sets" at Day 310/310 — an element the scene graph
// shows but the culler drops is exactly "scheduled, has geometry, not drawn, selective within a set".
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (no load / no BatchedMesh / no poses), VACUOUS (a class
// with 0 visible slots at every pose is named, not judged), RED CONTROL (witness_kit).
// Env: BLD · BLD_DIR · GPU=real|sw · PORT · LOAD_MS · LOG · POSES (json from cli_silent_bake) ·
//      FRAMES (comma list of frame indices in POSES) · END=1 (drive TM to the end cursor first)
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const ROOT = path.resolve(__dirname, '..', '..');
const BLD = process.env.BLD || 'Hospital_silent_local';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const GPU = process.env.GPU || 'real';
const PORT = +(process.env.PORT || 8563);
const LOAD_MS = +(process.env.LOAD_MS || 900000);
const LOG = process.env.LOG || '/tmp/witness_bm_bounds_cull.log';
const POSES = process.env.POSES || path.join(os.homedir(), 'Downloads', 'Hospital_silent_bake_2026-09-04_poses.json');
const FRAMES = (process.env.FRAMES || '705,750,780,825,1170,1230,2000').split(',').map(Number);
const END = process.env.END !== '0';
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
function inconclusive(r) { log('§BM_BOUNDS_CULL verdict=INCONCLUSIVE reason=' + r + ' — nothing was judged'); log('§WITNESS_BM_BOUNDS_CULL pass=0 fail=0 ran=0 INCONCLUSIVE'); }

function pageInstrument() {
  const A = window.APP, THREE = window.THREE, D = window.__bmc = {};
  const box = new THREE.Box3(), v = new THREE.Vector3(), sph = new THREE.Sphere(), m4 = new THREE.Matrix4();
  // fresh sphere per (bm, geometryId) from the INDEX range, the way r185 computes a null one
  function freshSphere(bm, g, target) {
    const info = bm._geometryInfo[g], geo = bm.geometry, pos = geo.attributes.position, idx = geo.getIndex();
    box.makeEmpty();
    for (let i = info.start, l = info.start + info.count; i < l; i++) { let iv = i; if (idx) iv = idx.getX(iv); v.fromBufferAttribute(pos, iv); box.expandByPoint(v); }
    box.getCenter(target.center); let r2 = 0;
    for (let i = info.start, l = info.start + info.count; i < l; i++) { let iv = i; if (idx) iv = idx.getX(iv); v.fromBufferAttribute(pos, iv); r2 = Math.max(r2, target.center.distanceToSquared(v)); }
    target.radius = Math.sqrt(r2); return target;
  }
  D.index = function () {
    D.bms = []; let geoms = 0, stale = 0, worst = 0; const worstList = []; const kinds = { centreFar: 0, tooSmall: 0 };
    A.scene.traverse(o => {
      if (!(o.isBatchedMesh && A._batchMeta && A._batchMeta[o.id])) return;
      const rec = { bm: o, meta: A._batchMeta[o.id], fresh: [], stored: [], staleG: {} };
      const slotOfGeom = {}; for (const m of rec.meta) { const inf = o._instanceInfo[m.slotId]; if (inf) slotOfGeom[inf.geometryIndex] = m; }
      for (let g = 0; g < o._geometryInfo.length; g++) {
        const gi = o._geometryInfo[g]; if (!gi || !gi.active) { rec.fresh[g] = null; rec.stored[g] = null; continue; }
        geoms++; const st = o.getBoundingSphereAt(g, new THREE.Sphere()); const fr = freshSphere(o, g, new THREE.Sphere());
        rec.fresh[g] = fr; rec.stored[g] = st;
        const off = st.center.distanceTo(fr.center), over = off + fr.radius - st.radius;
        if (over > 0.01) { stale++; rec.staleG[g] = over; if (off > st.radius) kinds.centreFar++; else kinds.tooSmall++;
          if (over > worst) worst = over;
          const m = slotOfGeom[g]; worstList.push({ over: +over.toFixed(2), cls: m ? m.ifcClass : '?', guid: m ? m.guid : '?', storedC: st.center.toArray().map(x => +x.toFixed(2)), storedR: +st.radius.toFixed(2), freshC: fr.center.toArray().map(x => +x.toFixed(2)), freshR: +fr.radius.toFixed(2), vCount: gi.vertexCount, vRes: gi.reservedVertexCount, iCount: gi.indexCount, iRes: gi.reservedIndexCount });
        }
      }
      D.bms.push(rec);
    });
    worstList.sort((a, b) => b.over - a.over);
    // stale by class
    const byCls = {};
    for (const rec of D.bms) for (const m of rec.meta) { const inf = rec.bm._instanceInfo[m.slotId]; if (!inf) continue; const c = m.ifcClass || '?'; const r = byCls[c] || (byCls[c] = { slots: 0, staleSlots: 0 }); r.slots++; if (rec.staleG[inf.geometryIndex]) r.staleSlots++; }
    return { bms: D.bms.length, geoms, stale, worst: +worst.toFixed(3), kinds, worstList: worstList.slice(0, 8), byCls };
  };
  function treeVisible(o) { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; }
  D.cullAt = function (pose) {
    const cam = A.camera; cam.position.set(pose[1], pose[2], pose[3]); A.controls.target.set(pose[4], pose[5], pose[6]); A.controls.update();
    cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
    const fr = new THREE.Frustum(); fr.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const per = {}; let tot = { visible: 0, storedIn: 0, freshIn: 0, wrong: 0, wrongDrawn: 0 };
    for (const rec of D.bms) {
      const bm = rec.bm; if (!treeVisible(bm)) continue; bm.updateMatrixWorld();
      // whole-object test three applies first (bm.frustumCulled=true): stale per-geometry spheres feed this too
      if (bm.boundingSphere === null) bm.computeBoundingSphere();
      const objIn = fr.intersectsSphere(sph.copy(bm.boundingSphere).applyMatrix4(bm.matrixWorld));
      for (const m of rec.meta) {
        const inf = bm._instanceInfo[m.slotId]; if (!inf || !inf.active || !inf.visible) continue;
        const c = m.ifcClass || '?', R = per[c] || (per[c] = { visible: 0, storedIn: 0, freshIn: 0, wrong: 0, wrongDrawn: 0, objCulled: 0, sample: [] });
        R.visible++; tot.visible++;
        bm.getMatrixAt(m.slotId, m4); m4.premultiply(bm.matrixWorld);
        const sIn = objIn && fr.intersectsSphere(sph.copy(rec.stored[inf.geometryIndex]).applyMatrix4(m4));
        const fIn = fr.intersectsSphere(sph.copy(rec.fresh[inf.geometryIndex]).applyMatrix4(m4));
        if (sIn) { R.storedIn++; tot.storedIn++; } if (fIn) { R.freshIn++; tot.freshIn++; }
        if (fIn && !sIn) { R.wrong++; tot.wrong++; if (!objIn) R.objCulled++; if (R.sample.length < 4) R.sample.push(m.guid); }
        if (sIn && !fIn) { R.wrongDrawn++; tot.wrongDrawn++; }
      }
    }
    return { per, tot, cam: cam.position.toArray().map(x => +x.toFixed(2)), fov: cam.fov, aspect: +cam.aspect.toFixed(3) };
  };
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const gpuEnv = GPU === 'real' ? { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' } : {};
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bmc-profile-'));
  const commit = (() => { try { return require('child_process').execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD']).toString().trim(); } catch (e) { return '?'; } })();
  let poses = null; try { poses = JSON.parse(fs.readFileSync(POSES, 'utf8')); } catch (e) {}
  log(`§BMC_ENV root=${ROOT} commit=${commit} bld=${BLD} gpu=${GPU} poses=${POSES} n=${poses ? poses.length : 0} frames=${FRAMES.join(',')} end=${END}`);
  if (!poses || !poses.length) { inconclusive('no poses file'); server.close(); process.exitCode = 2; return; }
  const browser = await puppeteer.launch({ headless: true, userDataDir: profile, protocolTimeout: 15 * 60 * 1000, env: Object.assign({}, process.env, gpuEnv), args: ['--no-sandbox', '--hide-crash-restore-bubble', '--window-size=1300,840'].concat(gpuArgs) });
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => logRaw('[con] ' + m.text())); page.on('pageerror', e => logRaw('[pageerror] ' + e.message));
  let rows = [];
  try {
    const url = `http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`; log('§BMC_NAV ' + url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.renderer && window.APP.camera && typeof window.tmActivateForBake === 'function', { timeout: LOAD_MS });
    await page.waitForFunction(() => window.APP.activeBuilding && window.APP.db && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming, { timeout: LOAD_MS, polling: 1000 });
    log('§BMC_LOADED building=' + (await page.evaluate(() => window.APP.activeBuilding)));
    if (END) {
      const tm = await page.evaluate(async () => { let ok = await window.tmActivateForBake(); if (!ok) ok = await window.tmActivateForBake(); return ok; });
      const bk = tm ? await page.evaluate(() => window.tmFollowTimeline()) : null;
      if (bk && bk.projectEnd > bk.projectStart) { await page.evaluate(c => { window.__forceFull = true; window.tmSetCursor(c); }, bk.projectEnd); log(`§BMC_TM end cursor set (Day ${((bk.projectEnd - bk.projectStart) / 86400000).toFixed(0)}) placed=${bk.placed}`); }
      else log('§BMC_TM not driven (tm=' + tm + ') — visibility is the plain load state');
    }
    await page.evaluate(pageInstrument);
    const idx = await page.evaluate(() => window.__bmc.index());
    if (!idx.bms) { inconclusive('no BatchedMesh with meta'); process.exitCode = 2; return; }
    log(`§BM_BOUNDS_STALE bm=${idx.bms} geoms=${idx.geoms} stale=${idx.stale} worstM=${idx.worst} kinds=centreFar:${idx.kinds.centreFar},tooSmall:${idx.kinds.tooSmall}`);
    for (const w of idx.worstList) log(`§BM_BOUNDS_WORST over=${w.over} cls=${w.cls} guid=${w.guid} stored=c${JSON.stringify(w.storedC)}r${w.storedR} fresh=c${JSON.stringify(w.freshC)}r${w.freshR} v=${w.vCount}/${w.vRes} i=${w.iCount}/${w.iRes}`);
    const bc = Object.entries(idx.byCls).filter(([c, r]) => r.staleSlots).sort((a, b) => b[1].staleSlots - a[1].staleSlots).slice(0, 12);
    for (const [c, r] of bc) log(`§BM_BOUNDS_CLASS cls=${c} slots=${r.slots} staleSlots=${r.staleSlots}`);
    const perCls = {};
    for (const f of FRAMES) {
      const pose = poses[f]; if (!pose) { log(`§BM_CULL frame=${f} — no such pose`); continue; }
      const r = await page.evaluate(p => window.__bmc.cullAt(p), pose);
      log(`§BM_CULL frame=${f} film_s=${(f / 15).toFixed(1)} visible=${r.tot.visible} storedIn=${r.tot.storedIn} freshIn=${r.tot.freshIn} WRONGLY_CULLED=${r.tot.wrong} wronglyDrawn=${r.tot.wrongDrawn} cam=${JSON.stringify(r.cam)} fov=${r.fov} aspect=${r.aspect}`);
      const cls = Object.entries(r.per).sort((a, b) => b[1].wrong - a[1].wrong);
      for (const [c, R] of cls) { if (R.wrong || /Plate|Window|Furni|Member/.test(c)) log(`§BM_CULL_CLASS frame=${f} cls=${c} visible=${R.visible} freshIn=${R.freshIn} storedIn=${R.storedIn} wronglyCulled=${R.wrong} (byWholeObject=${R.objCulled})${R.sample.length ? ' sample=' + R.sample.join(',') : ''}`);
        const a = perCls[c] || (perCls[c] = { cls: c, visibleSum: 0, freshIn: 0, wrong: 0, worst: 0, worstF: -1 }); a.visibleSum += R.visible; a.freshIn += R.freshIn; a.wrong += R.wrong; if (R.wrong > a.worst) { a.worst = R.wrong; a.worstF = f; } }
    }
    const vac = []; for (const c in perCls) { if (!perCls[c].visibleSum) vac.push(c); else rows.push(perCls[c]); }
    if (vac.length) log('§BMC_VACUOUS classes with 0 visible slots at every pose (not judged): ' + vac.length);
  } catch (e) { log('§BMC_ERROR ' + (e && e.stack || e)); inconclusive('exception ' + String(e && e.message).slice(0, 120)); process.exitCode = 2; }
  finally { try { await browser.close(); } catch (e) {} server.close(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }
  if (!rows.length) return;
  Witness('bm_bounds_cull').population(() => rows)
    .schema({ type: 'object', required: ['cls', 'freshIn', 'wrong'], properties: { cls: { type: 'string', minLength: 1 }, freshIn: { type: 'integer', minimum: 0 }, wrong: { type: 'integer', minimum: 0 } } })
    .invariant('no visible slot whose true vertices are in the frustum is culled by its stored sphere', rs => rs.every(r => r.wrong === 0))
    .redControl(rs => { const c = rs.map(r => Object.assign({}, r)); if (c[0]) c[0].wrong = 1; return c; })
    .run();
  logStream.end();
})();
