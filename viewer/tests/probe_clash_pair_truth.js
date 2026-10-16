#!/usr/bin/env node
// ⚠ DO NOT REMOVE — PROBE §CLASH_PAIR_TRUTH (2026-09-04, CLASH_GATE_OBB_NARROWPHASE.md §M.8 Hospital I3)
// Ground truth for ONE named pair: local boxes (cached vs from positions), BVH root bounds, world
// placement, SAT verdict, intersectsGeometry both ways, the enumerated intersecting triangle pairs
// with their intersection segments (A-local + world), closest distance, and containment parity —
// so a module/oracle disagreement is explained by numbers, not a hypothesis. Read the log.
// Env: ROOT · BLD (default Hospital) · BLD_DIR · GPU · PORT · LOAD_MS · LOG · PAIRS ('guidA|guidB,guidA|guidB')
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLD = process.env.BLD || 'Hospital';
const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const GPU = process.env.GPU || 'real';
const PORT = +(process.env.PORT || 8579);
const LOAD_MS = +(process.env.LOAD_MS || 900000);
const PAIRS = (process.env.PAIRS || '2HaS6zNOX8xOGjmaNi_rOv|3iM76qwej9Tf9ttHcbQrfu,3GKM_ZECz7W9zLWaxxFO50|3iM76qwej9Tf9ttHcbQrYo').split(',').map(s => s.split('|'));
const LOG = process.env.LOG || ('/tmp/probe_clash_pair_truth_' + BLD + '.log');
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

function pageProbe() {
  const A = window.APP, THREE = window.THREE;
  window.__cpt = function (ga, gb) {
    const out = { ga, gb };
    function info(g) {
      const t = A.dbQuery('SELECT t.center_x,t.center_y,t.center_z,t.rotation_x,t.rotation_y,t.rotation_z,t.bbox_x,t.bbox_y,t.bbox_z,i.geometry_hash,m.ifc_class FROM element_transforms t LEFT JOIN element_instances i ON i.guid=t.guid JOIN elements_meta m ON m.guid=t.guid WHERE t.guid=?', [g])[0];
      if (!t) return { err: 'no transform' };
      const geo = A.meshCache[t[9]];
      const o = { cls: t[10], hash: t[9], center: [t[0], t[1], t[2]], rot: [t[3], t[4], t[5]], bbox: [t[6], t[7], t[8]], hasGeo: !!geo };
      if (!geo) return o;
      const pos = geo.attributes.position;
      o.verts = pos.count; o.idx = geo.index ? geo.index.count : null; o.drawRange = geo.drawRange ? [geo.drawRange.start, geo.drawRange.count] : null;
      const pb = new THREE.Box3().setFromBufferAttribute(pos);
      o.posBox = [pb.min.toArray().map(v => +v.toFixed(4)), pb.max.toArray().map(v => +v.toFixed(4))];
      o.cachedBox = geo.boundingBox ? [geo.boundingBox.min.toArray().map(v => +v.toFixed(4)), geo.boundingBox.max.toArray().map(v => +v.toFixed(4))] : null;
      let bvhBox = null; try { const bb = new THREE.Box3(); geo.boundsTree.getBoundingBox(bb); bvhBox = [bb.min.toArray().map(v => +v.toFixed(4)), bb.max.toArray().map(v => +v.toFixed(4))]; } catch (e) { bvhBox = 'err ' + e.message; }
      o.bvhBox = bvhBox; o.bvhIndirect = !!(geo.boundsTree && geo.boundsTree.indirect);
      o.M = A.clashNarrow.worldMatrix({ cx: t[0], cy: t[1], cz: t[2], rx: t[3], ry: t[4], rz: t[5] }).elements.map(v => +v.toFixed(5));
      const wb = pb.clone().applyMatrix4(A.clashNarrow.worldMatrix({ cx: t[0], cy: t[1], cz: t[2], rx: t[3], ry: t[4], rz: t[5] }));
      o.worldPosBox = [wb.min.toArray().map(v => +v.toFixed(4)), wb.max.toArray().map(v => +v.toFixed(4))];
      const c3 = A.ifc2three(t[0], t[1], t[2]); o.storedWorldBox = [[c3.x - t[6] / 2, c3.y - t[8] / 2, c3.z - t[7] / 2].map(v => +v.toFixed(4)), [c3.x + t[6] / 2, c3.y + t[8] / 2, c3.z + t[7] / 2].map(v => +v.toFixed(4))];
      o._geo = geo; o._t = t;
      return o;
    }
    const a = info(ga), b = info(gb); out.a = a; out.b = b;
    if (!a._geo || !b._geo) { delete a._geo; delete b._geo; return out; }
    const MA = A.clashNarrow.worldMatrix({ cx: a._t[0], cy: a._t[1], cz: a._t[2], rx: a._t[3], ry: a._t[4], rz: a._t[5] });
    const MB = A.clashNarrow.worldMatrix({ cx: b._t[0], cy: b._t[1], cz: b._t[2], rx: b._t[3], ry: b._t[4], rz: b._t[5] });
    const relBA = new THREE.Matrix4().copy(MA).invert().multiply(MB), relAB = new THREE.Matrix4().copy(MB).invert().multiply(MA);
    // world-box gap per axis between the position-derived boxes (negative = overlap)
    const wa = new THREE.Box3().setFromBufferAttribute(a._geo.attributes.position).applyMatrix4(MA), wbx = new THREE.Box3().setFromBufferAttribute(b._geo.attributes.position).applyMatrix4(MB);
    out.worldGapXYZ = ['x', 'y', 'z'].map(k => +(Math.max(wa.min[k], wbx.min[k]) - Math.min(wa.max[k], wbx.max[k])).toFixed(6));
    out.module = A.clashNarrow.testPair(a._geo, MA, b._geo, MB); delete out.module.contact;
    out.moduleNoObb = A.clashNarrow.testPair(a._geo, MA, b._geo, MB, { skipObb: true }); delete out.moduleNoObb.contact;
    out.igAB = a._geo.boundsTree.intersectsGeometry(b._geo, relBA);
    out.igBA = b._geo.boundsTree.intersectsGeometry(a._geo, relAB);
    // enumerate intersecting triangle pairs with segments (A-local), first 6
    const segs = []; let n = 0; const seg = new THREE.Line3();
    a._geo.boundsTree.bvhcast(b._geo.boundsTree, relBA, { intersectsTriangles: (t1, t2, i1, i2) => {
      seg.start.set(NaN, NaN, NaN); seg.end.set(NaN, NaN, NaN);
      let hit = false; try { hit = t1.intersectsTriangle(t2, seg, true); } catch (e) {}
      if (!hit) return false; n++;
      if (segs.length < 6) segs.push({ i1, i2, seg: [seg.start.toArray().map(v => +v.toFixed(5)), seg.end.toArray().map(v => +v.toFixed(5))], len: +seg.start.distanceTo(seg.end).toFixed(6),
        t1: [t1.a.toArray(), t1.b.toArray(), t1.c.toArray()].map(p => p.map(v => +v.toFixed(4))), t2: [t2.a.toArray(), t2.b.toArray(), t2.c.toArray()].map(p => p.map(v => +v.toFixed(4))) });
      return n >= 5000; } });
    out.triPairs = n; out.segSamples = segs;
    try { const t1 = {}, t2 = {}; const d = a._geo.boundsTree.closestPointToGeometry(b._geo, relBA, t1, t2); out.closestDist = d; out.closestPtA = t1.point ? t1.point.toArray().map(v => +v.toFixed(5)) : null; } catch (e) { out.closestErr = e.message; }
    delete a._geo; delete b._geo; delete a._t; delete b._t;
    return out;
  };
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const gpuEnv = GPU === 'real' ? { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' } : {};
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cpt-profile-'));
  const browser = await puppeteer.launch({ headless: true, userDataDir: profile, protocolTimeout: 30 * 60 * 1000, env: Object.assign({}, process.env, gpuEnv), args: ['--no-sandbox', '--hide-crash-restore-bubble', '--window-size=1300,840'].concat(gpuArgs) });
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  page.on('console', m => logRaw('[con] ' + m.text()));
  page.on('pageerror', e => logRaw('[pageerror] ' + e.message));
  try {
    const url = `http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`; log('§CPT_NAV ' + url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.renderer && window.APP.camera, { timeout: LOAD_MS });
    await page.waitForFunction(() => { const A = window.APP; return A.activeBuilding && A.buildingsRendered && A.buildingsRendered.has(A.activeBuilding) && !A.streaming; }, { timeout: LOAD_MS, polling: 1000 });
    try { await page.waitForFunction(() => window._bvhReady && !window.APP._bvhRunning && !(window.APP._bvhPending || []).length, { timeout: 600000, polling: 1000 }); } catch (e) { logRaw('[wait] bvh: ' + e.message); }
    await page.evaluate(pageProbe);
    for (const [ga, gb] of PAIRS) {
      const r = await page.evaluate((x, y) => window.__cpt(x, y), ga, gb);
      log('§CLASH_PAIR_TRUTH ' + JSON.stringify(r));
    }
  } catch (e) { log('§CPT_ERROR ' + (e && e.stack || e)); process.exitCode = 1; }
  finally { try { await browser.close(); } catch (e) {} server.close(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }
  logStream.end();
})();
