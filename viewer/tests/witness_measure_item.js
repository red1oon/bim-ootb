#!/usr/bin/env node
// ⚠ DO NOT REMOVE — WITNESS §MEASURE_ITEM (2026-10-05, bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §Y)
// Scope: Measure double-click on an element → that ELEMENT is highlighted and sized (area + extents along its own
// axes). Read the log after every run — the exit code is not evidence.
//
// ISSUE THIS PROVES OR DISPROVES: "double-click area highlight went away" — elements are drawn in shared batches, so
// the raycast object is a batch: the old code tinted/measured the whole batch. GREEN = the resolved guid is the element
// under the cursor (hover resolver at the same pixel), its overlay uses its own geometry, its area equals its own
// triangles, its L/W/H equal an INDEPENDENT oracle: raw DB vertex blob (IFC frame), plan size by brute-force angle sweep
// (0.01°, not the module's rotating calipers), height = z extent. On a batched hit the batch area differs (RED proof).
// CAN REPORT ITS OWN FAILURE: INCONCLUSIVE (load), VACUOUS (no candidate reachable at a pixel / no diagonal element),
// RED CONTROL. Env: ROOT · BLDS (name@dir,…) · GPU=sw|real · PORT · PER_BLD · LOG
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const { Witness } = require('../../witness_kit/contract');
const ROOT = path.resolve(process.env.ROOT || path.join(__dirname, '..', '..'));
const BLDS = (process.env.BLDS || ('Duplex_extracted@' + path.join(os.homedir(), 'bim-ootb', 'buildings') + ',JELAPANG_AFTER@' + path.join(os.homedir(), 'Downloads', 'JALAN JELAPANG IFC')))
  .split(',').map(x => { const [n, d] = x.split('@'); return { name: n, dir: d }; });
const GPU = process.env.GPU || 'sw';
const PORT = +(process.env.PORT || 8578);
const PER_BLD = +(process.env.PER_BLD || 12);
const LOG = process.env.LOG || '/tmp/witness_measure_item.log';
const logStream = fs.createWriteStream(LOG, { flags: 'w' });
function log(l) { logStream.write(l + '\n'); console.log(l); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream', '.gz': 'application/gzip', '.webp': 'image/webp', '.woff2': 'font/woff2', '.sql': 'application/sql', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => { try {
  const u = decodeURIComponent(req.url.split('?')[0]); let fp = path.join(ROOT, u.replace(/^\/+/, ''));
  if (!fs.existsSync(fp) && u.startsWith('/buildings/')) { const f = u.slice('/buildings/'.length); const b = BLDS.find(x => f.startsWith(x.name)); if (b) fp = path.join(b.dir, f); }
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  if (!fs.existsSync(fp)) { res.writeHead(404); res.end('404'); return; }
  const st = fs.statSync(fp); res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  fs.createReadStream(fp).pipe(res); } catch (e) { res.writeHead(500); res.end(String(e)); } });

// in-page: choose candidates, aim the camera at each, double-click the screen centre, compare with the raw-blob oracle
async function probe(perBld) {
  const A = window.APP, T = window.THREE, W = window.innerWidth, H = window.innerHeight;
  A.measureActive = true;
  const disc = A.dbQuery("SELECT COUNT(*) FROM elements_meta WHERE discipline='MARKING'")[0][0];
  // diagonal civil items first when present (the case an axis box gets wrong), then a spread of everything else
  const cand = (disc ? A.dbQuery("SELECT m.guid FROM elements_meta m JOIN element_instances i ON i.guid=m.guid WHERE m.discipline IN ('MARKING','FURNITURE') ORDER BY m.guid LIMIT 400") : [])
    .concat(A.dbQuery("SELECT m.guid FROM elements_meta m JOIN element_instances i ON i.guid=m.guid WHERE m.ifc_class NOT IN ('IfcSpace','IfcOpeningElement') ORDER BY substr(m.guid, 9) LIMIT 400")).map(r => r[0]);
  const oracle = guid => {
    const r = A.dbQuery("SELECT g.vertices, g.faces FROM element_instances i JOIN component_geometries g ON g.geometry_hash=i.geometry_hash WHERE i.guid=?", [guid]);
    if (!r.length || !r[0][0]) return null;
    const vb = r[0][0], fb = r[0][1];
    const v = new Float32Array(vb.buffer.slice(vb.byteOffset, vb.byteOffset + vb.byteLength));
    const f = new Uint32Array(fb.buffer.slice(fb.byteOffset, fb.byteOffset + fb.byteLength));
    let zmin = Infinity, zmax = -Infinity, area = 0;
    for (let i = 2; i < v.length; i += 3) { if (v[i] < zmin) zmin = v[i]; if (v[i] > zmax) zmax = v[i]; }
    for (let i = 0; i + 2 < f.length; i += 3) {
      const a = f[i] * 3, b = f[i + 1] * 3, c = f[i + 2] * 3;
      const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2], wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
      area += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
    }
    // brute-force plan sweep: min area of the (x, y) extents over 0..90° at 0.01° (a rectangle repeats every 90°)
    let best = null; const n = v.length / 3;
    const at = deg => { const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
      let u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity;
      for (let i = 0; i < n; i++) { const x = v[i * 3], y = v[i * 3 + 1], u = x * c + y * s, w = -x * s + y * c; if (u < u0) u0 = u; if (u > u1) u1 = u; if (w < w0) w0 = w; if (w > w1) w1 = w; }
      return { a: (u1 - u0) * (w1 - w0), p: u1 - u0, q: w1 - w0, deg }; };
    for (let k = 0; k <= 9000; k++) { const r = at(k / 100); if (!best || r.a < best.a) best = r; }          // coarse 0.01°
    const c0 = best.deg; for (let k = -100; k <= 100; k++) { const r = at(c0 + k / 10000); if (r.a < best.a) best = r; }   // refine 0.0001°
    let ax0 = Infinity, ax1 = -Infinity, ay0 = Infinity, ay1 = -Infinity;
    for (let i = 0; i < n; i++) { const x = v[i * 3], y = v[i * 3 + 1]; if (x < ax0) ax0 = x; if (x > ax1) ax1 = x; if (y < ay0) ay0 = y; if (y > ay1) ay1 = y; }
    return { L: Math.max(best.p, best.q), W: Math.min(best.p, best.q), H: zmax - zmin, area, deg: best.deg, axisL: Math.max(ax1 - ax0, ay1 - ay0), n };
  };
  const out = []; let tried = 0, unreachable = 0;
  for (const guid of cand) {
    if (out.filter(o => o.diag).length >= Math.ceil(perBld / 2) && out.length >= perBld) break;
    if (out.length >= perBld * 2) break;
    const o = oracle(guid); if (!o || o.n > 60000) continue;
    const isDiag = o.deg > 5 && o.deg < 85 && o.L > 1 && Math.abs(o.axisL - o.L) > 0.05;
    if (out.length >= perBld && !isDiag) continue;
    tried++;
    const t = A.dbQuery("SELECT center_x, center_y, center_z FROM element_transforms WHERE guid=?", [guid])[0];
    const c = A.ifc2three(t[0], t[1], t[2]), d = Math.max(o.L, o.H, 1) * 2.5;
    A.camera.position.set(c.x + d * 0.3, c.y + d, c.z + d * 0.3); A.camera.lookAt(c.x, c.y, c.z);
    if (A.controls && A.controls.target) { A.controls.target.set(c.x, c.y, c.z); A.controls.update(); }
    A.camera.updateMatrixWorld(true); A.camera.updateProjectionMatrix();
    const cx = W / 2, cy = H / 2;
    if (A.hoverGuidAt(cx, cy) !== guid) { unreachable++; continue; }
    A.clearMeasures(false);
    // the batch-level answer the OLD code gave (area of whatever object the ray hit)
    const rc = new T.Raycaster(); rc.setFromCamera({ x: 0, y: 0 }, A.camera);
    const meshes = []; A.scene.traverse(x => { if (x.isMesh && x !== A.ground && x.visible && x.parent !== A.measureGroup) meshes.push(x); });
    const hit = rc.intersectObjects(meshes, false)[0];
    const batched = !!(hit && (hit.object.isBatchedMesh || hit.object.isInstancedMesh));
    let batchArea = null; if (batched && out.filter(x => x.batchArea != null).length < 3) { try { batchArea = A._meshArea(hit.object); } catch (e) {} }
    const r = A.handleMeasureDblClick({ clientX: cx, clientY: cy });
    if (!r) { out.push({ guid, resolved: null }); continue; }
    const overlay = A.measureGroup.children.find(m => m.userData && m.userData.guid === r.guid);
    out.push({ guid, resolved: r.guid, overlayOwnGeometry: !!overlay && !!A.meshCache && Object.values(A.meshCache).includes(overlay.geometry),
      L: r.length, W: r.width, H: r.height, area: r.area, oL: o.L, oW: o.W, oH: o.H, oArea: o.area, diag: isDiag, sweepDeg: o.deg, axisL: o.axisL,
      batched, batchArea, labels: A.measureLabels.length });
  }
  A.clearMeasures(false);
  return { rows: out, tried, unreachable };
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const gpuArgs = { sw: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], real: ['--use-angle=gl-egl', '--ignore-gpu-blocklist'] }[GPU] || [];
  const all = [];
  for (const b of BLDS) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cmi-profile-'));
    const browser = await puppeteer.launch({ headless: true, userDataDir: profile, protocolTimeout: 30 * 60 * 1000, args: ['--no-sandbox', '--window-size=1300,840'].concat(gpuArgs) });
    const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
    page.on('console', m => { const t = m.text(); logStream.write('[con] ' + t + '\n'); });
    page.on('pageerror', e => logStream.write('[pageerror] ' + e.message + '\n'));
    try {
      const url = `http://127.0.0.1:${PORT}/viewer/viewer.html?db=/buildings/${b.name}.db`; log('§CMI_NAV ' + url + ' gpu=' + GPU);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => window.APP && window.APP.activeBuilding && window.APP.buildingsRendered && window.APP.buildingsRendered.has(window.APP.activeBuilding) && !window.APP.streaming && window.APP.guidForHit && window.APP._measureItem, { timeout: 1800000, polling: 1000 });
      const R = await page.evaluate(probe, PER_BLD);
      log('§CMI_SCOPE ' + b.name + ' judged=' + R.rows.length + ' tried=' + R.tried + ' unreachableAtPixel=' + R.unreachable);
      R.rows.forEach(r => { r.bld = b.name; all.push(r); log('§CMI_ROW ' + JSON.stringify(r)); });
    } catch (e) { log('§CMI ' + b.name + ' INCONCLUSIVE reason=' + e.message); }
    finally { await browser.close(); }
  }
  server.close();
  const mm = (a, b) => Math.abs(a - b) <= 0.002, rel = (a, b) => Math.abs(a - b) <= Math.max(0.002, 0.002 * Math.abs(b));
  Witness('measure_item')
    .population(() => all)
    .schema({ type: 'object', required: ['guid', 'resolved'] })
    .invariant('resolved element == the element under the cursor (hover resolver, same pixel)', rs => rs.every(r => r.resolved === r.guid))
    .invariant('highlight overlay uses the element\'s own cached geometry', rs => rs.every(r => r.overlayOwnGeometry))
    .invariant('L / W / H == raw-blob oracle (brute-force sweep) within 2 mm', rs => rs.every(r => mm(r.L, r.oL) && mm(r.W, r.oW) && mm(r.H, r.oH)))
    .invariant('area == own triangles within 0.2 %', rs => rs.every(r => rel(r.area, r.oArea)))
    .invariant('diagonal items judged (not VACUOUS): L = own-axis length, ≠ the axis-box side', rs => rs.some(r => r.diag) && rs.filter(r => r.diag).every(r => mm(r.L, r.oL) && Math.abs(r.axisL - r.L) > 0.05))
    .invariant('batched hits judged and the batch area != element area (the old answer was the batch)', rs => rs.some(r => r.batched && r.batchArea != null) && rs.filter(r => r.batchArea != null).every(r => Math.abs(r.batchArea - r.area) > 0.01))
    .invariant('3 dimension labels + 1 summary label per measure', rs => rs.every(r => r.labels >= 4))
    .redControl(rs => rs.map(r => Object.assign(r, { L: r.L + 0.1 })))
    .run();
  logStream.end();
})();
