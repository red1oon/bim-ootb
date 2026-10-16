// ⚠ DO NOT REMOVE — Scope guard
// Scope: PHOTOREAL_STILL_RENDER.md §WALL_SIDE_AND_LIGHT_FLOOR — class-keyed material.side +
// non-directional light-floor retune. This witness GATES the ship. Read the log after every run.
// Claims (each is a §WWSLF_* line; numbers only, never a screenshot):
//   S1  resolved side per class in the LIVE material cache == census-derived FRONT_SIDE_CLASSES
//   S3  pick integrity: identical rays cast before (all-DoubleSide + old fill) and after
//       (shipped): same FIRST-HIT element, from OUTSIDE and from INSIDE a real room
//   S4  nothing vanishes: renderer.info triangles/calls equal across states; background
//       (sentinel) pixel delta per standpoint <= 0.5% of frame
//   T2/T3 light floor: single-light calibrated probe renders (linear, toneMapped:false) ->
//       away/lit contrast + interior luminance retention, against the spec targets
//   S5  diffuse census: per-face area-weighted N·L over REAL wall geometry+transforms (node
//       side, both buildings) -> mean away-face irradiance before/after
//   M1  unique-material + draw-call counts equal (side is keyed by class, cannot fragment)
//   M2  median frame time before vs after (backface culling should not cost; win reported)
//   M3  usedJSHeapSize delta   M4  sun shadow config untouched
// Verdict line can say NO-OP / VACUOUS / INCONCLUSIVE — never PASS when nothing was judged.
// Run: node viewer/tests/witness_wall_side_light_floor.js [--derive]
//   --derive = measurement mode: prints calibrated light terms + the solved ambient/hemi
//   constants for scene.js (asserts only calibration sanity). Ship mode asserts everything.
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const Database = require(process.env.BSQL3 || (os.homedir() + '/bim-compiler/node_modules/better-sqlite3'));

const DERIVE = process.argv.includes('--derive');
const ROOT = path.join(__dirname, '..', '..');
const BLD_DIR = path.join(ROOT, 'viewer', 'buildings');

// BEFORE-state constants = the shipped values this change replaces (scene.js history:
// ambient 0.785 / hemi 1.257, §S276 physically-correct block). Sun 4.4 untouched by the change.
const OLD_AMBIENT = 0.785, OLD_HEMI = 1.257;
// Spec targets (§WALL_SIDE_AND_LIGHT_FLOOR SPEC S2)
const T2_CONTRAST = 0.25;        // away/lit target for the representative vertical wall pair
const T3_P25 = 0.55, T3_MEAN = 0.70; // interior retention floors
const REPR_NL = 0.669;           // max horizontal N·L for the real sun vector (200,400,300)
const SENTINEL_TOL = 0.005;      // S4: <=0.5% of frame may change background coverage

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm',
  '.jpg': 'image/jpeg', '.bin': 'application/octet-stream', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  const fp = path.join(ROOT, p);
  if (req.method === 'HEAD') {
    fs.stat(fp, (e, st) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'Content-Length': st.size }); res.end(); } });
    return;
  }
  fs.readFile(fp, (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

let fails = 0, judged = 0;
function S(m) { console.log(m); }
function verdict(ok, label, detail) {
  judged++; if (!ok) fails++;
  S('  ' + (ok ? 'PASS' : 'FAIL') + ' ' + label + (detail ? ' — ' + detail : ''));
}

// ---- node-side sampling from the real meta DB (no mock) --------------------------------------
function sampleHospital() {
  const db = new Database(path.join(BLD_DIR, 'Hospital_meta.db'), { readonly: true });
  // up to 4 largest OPAQUE elements per class (transparent stays DoubleSide by design — not the flip under test)
  const els = db.prepare(`SELECT m.guid, m.ifc_class cls, m.material_rgba rgba,
      t.center_x cx, t.center_y cy, t.center_z cz, t.bbox_x bx, t.bbox_y by, t.bbox_z bz
    FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid`).all();
  const byCls = new Map();
  for (const e of els) {
    if (e.rgba) { const a = parseFloat(String(e.rgba).split(',')[3]); if (isFinite(a) && a < 1.0) continue; }
    const arr = byCls.get(e.cls) || []; arr.push(e); byCls.set(e.cls, arr);
  }
  const samples = [];
  for (const [cls, arr] of byCls) {
    arr.sort((p, q) => (q.bx * q.by + q.bx * q.bz + q.by * q.bz) - (p.bx * p.by + p.bx * p.bz + p.by * p.bz));
    for (const e of arr.slice(0, 4)) samples.push(e);
  }
  // scene bbox from element extents (IFC space)
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const e of els) {
    const c = [e.cx, e.cy, e.cz], h = [e.bx / 2, e.by / 2, e.bz / 2];
    for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], c[i] - h[i]); mx[i] = Math.max(mx[i], c[i] + h[i]); }
  }
  // interior standpoints: 3 largest real IfcSpace rows + their 4 nearest wall elements each
  const spaces = db.prepare(`SELECT name, center_x cx, center_y cy, center_z cz, size_x sx, size_y sy, size_z sz
    FROM spatial_structure WHERE type='IfcSpace' AND size_x > 2 AND size_y > 2
    ORDER BY size_x*size_y DESC LIMIT 3`).all();
  const walls = els.filter(e => e.cls === 'IfcWallStandardCase' || e.cls === 'IfcWall');
  for (const sp of spaces) {
    sp.targets = walls
      .map(w => ({ w, d: (w.cx - sp.cx) ** 2 + (w.cy - sp.cy) ** 2 + (w.cz - sp.cz) ** 2 }))
      .sort((a, b) => a.d - b.d).slice(0, 4).map(x => x.w);
  }
  db.close();
  return { samples, spaces, bboxMin: mn, bboxMax: mx };
}

// ---- S5: per-face N·L census over real wall geometry (node, both buildings) ------------------
async function faceCensus(THREE) {
  const L = new THREE.Vector3(200, 400, 300).normalize(); // the real sun vector, scene.js:183
  const out = {};
  for (const B of ['Terminal', 'Hospital']) {
    const meta = new Database(path.join(BLD_DIR, B + '_meta.db'), { readonly: true });
    const geo = new Database(path.join(BLD_DIR, B + '_geo.db'), { readonly: true });
    const rows = meta.prepare(`SELECT m.guid, m.ifc_class cls, i.geometry_hash h,
        t.rotation_x rx, t.rotation_y ry, t.rotation_z rz
      FROM elements_meta m JOIN element_instances i ON i.guid = m.guid
      JOIN element_transforms t ON t.guid = m.guid
      WHERE m.ifc_class IN ('IfcWall','IfcWallStandardCase')`).all();
    const geoStmt = geo.prepare('SELECT vertices, faces FROM component_geometries WHERE geometry_hash = ?');
    const meshCache = new Map();
    let litArea = 0, litNLA = 0, awayArea = 0, awayNLA = 0, faces = 0;
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
    for (const r of rows) {
      let m = meshCache.get(r.h);
      if (m === undefined) { m = geoStmt.get(r.h) || null; meshCache.set(r.h, m); }
      if (!m) continue;
      const vs = new Float32Array(m.vertices.buffer, m.vertices.byteOffset, m.vertices.byteLength >> 2);
      const fsB = new Uint32Array(m.faces.buffer, m.faces.byteOffset, m.faces.byteLength >> 2);
      // world rotation exactly as streaming.js applies it: rotation.set(rotX, rotZ, -rotY), XYZ
      const eul = new THREE.Euler(r.rx || 0, r.rz || 0, -(r.ry || 0), 'XYZ');
      const rot = new THREE.Matrix4().makeRotationFromEuler(eul);
      for (let t = 0; t < fsB.length; t += 3) {
        const i0 = fsB[t] * 3, i1 = fsB[t + 1] * 3, i2 = fsB[t + 2] * 3;
        // blobToGeometry axis swap: (x,y,z) -> (x,z,-y)
        va.set(vs[i0], vs[i0 + 2], -vs[i0 + 1]);
        vb.set(vs[i1], vs[i1 + 2], -vs[i1 + 1]);
        vc.set(vs[i2], vs[i2 + 2], -vs[i2 + 1]);
        e1.subVectors(vb, va); e2.subVectors(vc, va);
        n.crossVectors(e1, e2); // length = 2*area, direction = face normal from winding
        const a2 = n.length();
        if (a2 < 1e-12) continue;
        n.divideScalar(a2).applyMatrix4(rot);
        const nl = n.dot(L), area = a2 / 2;
        faces++;
        if (nl > 0) { litArea += area; litNLA += nl * area; }
        else { awayArea += area; awayNLA += nl * area; }
      }
    }
    out[B] = { faces, litArea, awayArea, meanNLlit: litArea ? litNLA / litArea : 0 };
    meta.close(); geo.close();
  }
  return out;
}

(async () => {
  const t0 = Date.now();
  // three.core.min.js is ESM with a .js extension — node needs an .mjs copy to import it.
  // Math classes only (Vector3/Euler/Matrix4); no renderer, no browser globals.
  const tmpMjs = path.join(os.tmpdir(), 'wwslf_three_core_' + process.pid + '.mjs');
  fs.copyFileSync(path.join(ROOT, 'viewer', 'lib', 'three.core.min.js'), tmpMjs);
  const THREE = await import('file://' + tmpMjs).catch(() => null);
  try { fs.unlinkSync(tmpMjs); } catch (e) {}
  if (!THREE || !THREE.Vector3) { S('§WWSLF_VERDICT INCONCLUSIVE — three.core import failed in node'); process.exit(1); }

  S('§WWSLF_START mode=' + (DERIVE ? 'derive' : 'assert') + ' building=Hospital(live)+Terminal(node)');
  const { samples, spaces, bboxMin, bboxMax } = sampleHospital();
  S(`§WWSLF_SAMPLES classes_sampled=${new Set(samples.map(s => s.cls)).size} elements=${samples.length} spaces=${spaces.length}`);
  if (!samples.length || !spaces.length) { S('§WWSLF_VERDICT VACUOUS — no samples/spaces resolved from meta DB'); process.exit(1); }

  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--js-flags=--expose-gc'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const cons = [];
  page.on('console', m => cons.push(m.text()));
  page.on('pageerror', e => cons.push('[pageerror] ' + e));

  await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=buildings/Hospital_extracted.db&bld=Hospital',
    { waitUntil: 'domcontentloaded', timeout: 120000 });
  let ready = false;
  for (let i = 0; i < 300 && !ready; i++) {
    await page.waitForTimeout(1000);
    try {
      ready = await page.evaluate(() => !!(window.APP && window.APP.streaming === false &&
        window.APP._matCache && Object.keys(window.APP._matCache).length > 0));
    } catch (e) {}
  }
  if (!ready) { S('§WWSLF_VERDICT INCONCLUSIVE — viewer never reached streaming=false'); await browser.close(); server.close(); process.exit(1); }
  const splitLine = cons.find(l => l.includes('§SPLIT_GEO_LOADED'));
  S('§WWSLF_LOADED ' + (splitLine || 'split-geo line not seen (extracted fallback?)') + ' t=' + ((Date.now() - t0) / 1000).toFixed(0) + 's');

  // ---- in-page toolkit ------------------------------------------------------------------------
  await page.evaluate(({ OLD_AMBIENT, OLD_HEMI }) => {
    const A = window.APP, T = window.THREE;
    const W = window.__wwslf = { A, T };
    W.mats = () => Object.values(A._matCache);
    W.clsOf = k => k.split('|')[1] || '';
    W.matCensus = () => {
      const per = {}; let incoherent = 0, transparentNonDouble = 0;
      for (const [k, m] of Object.entries(A._matCache)) {
        const cls = W.clsOf(k) || '(none)';
        per[cls] = per[cls] || { front: 0, dbl: 0, transp: 0 };
        if (m.userData.origOpacity < 1.0) { per[cls].transp++; if (m.side !== T.DoubleSide) transparentNonDouble++; }
        else if (m.side === T.FrontSide) per[cls].front++;
        else per[cls].dbl++;
        if (!A.xrayOn && m.userData.origSide !== m.side) incoherent++;
      }
      return { per, incoherent, transparentNonDouble, matCount: Object.keys(A._matCache).length,
        frontMap: A._frontSideClasses || null };
    };
    W.setState = (which) => {
      let flipped = 0;
      for (const m of W.mats()) {
        if (m.userData.origOpacity < 1.0) continue;
        const want = which === 'before' ? T.DoubleSide : m.userData.origSide;
        if (m.side !== want) { m.side = want; m.needsUpdate = true; flipped++; }
      }
      A.ambient.intensity = which === 'before' ? OLD_AMBIENT : W.shipAmbient;
      A.hemi.intensity = which === 'before' ? OLD_HEMI : W.shipHemi;
      return flipped;
    };
    W.shipAmbient = A.ambient.intensity; W.shipHemi = A.hemi.intensity;
    W.rt = new T.WebGLRenderTarget(512, 384, { type: T.FloatType });
    W.px = new Float32Array(512 * 384 * 4);
    W.renderRead = () => {
      A.renderer.setRenderTarget(W.rt);
      A.renderer.render(A.scene, A.camera);
      A.renderer.readRenderTargetPixels(W.rt, 0, 0, 512, 384, W.px);
      A.renderer.setRenderTarget(null);
    };
    W.pose = (p, t) => {
      A.camera.position.set(p[0], p[1], p[2]);
      A.camera.lookAt(t[0], t[1], t[2]);
      A.camera.updateMatrixWorld(true);
    };
    // background sentinel + luminance stats. Two renders differing ONLY in background colour:
    // pixels that change between them ARE background (or blend with it) — exact, no assumption
    // about how the background pass is drawn. Geometry pixels are read from the first render.
    W.px2 = new Float32Array(512 * 384 * 4);
    W.measurePose = (p, t) => {
      W.pose(p, t);
      const oldBg = A.scene.background;
      A.scene.background = new T.Color(0, 1, 0); W.renderRead();
      W.px2.set(W.px);
      A.scene.background = new T.Color(1, 0, 1); W.renderRead();
      A.scene.background = oldBg;
      let sentinel = 0; const lums = [];
      for (let i = 0; i < W.px.length; i += 4) {
        if (Math.abs(W.px[i] - W.px2[i]) > 1e-5 || Math.abs(W.px[i + 1] - W.px2[i + 1]) > 1e-5 ||
            Math.abs(W.px[i + 2] - W.px2[i + 2]) > 1e-5) { sentinel++; continue; }
        lums.push(0.2126 * W.px2[i] + 0.7152 * W.px2[i + 1] + 0.0722 * W.px2[i + 2]);
      }
      lums.sort((a, b) => a - b);
      const n = lums.length;
      const mean = n ? lums.reduce((a, x) => a + x, 0) / n : 0;
      return { sentinel, covered: n, mean,
        p25: n ? lums[Math.floor(n * 0.25)] : 0, p50: n ? lums[Math.floor(n * 0.5)] : 0 };
    };
    // single-light calibration probes: tiny own scene, toneMapped:false -> raw linear response
    W.calib = () => {
      const ps = new T.Scene();
      const mat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, toneMapped: false });
      const quad = new T.Mesh(new T.PlaneGeometry(2, 2), mat); ps.add(quad);
      const cam = new T.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
      const rt = new T.WebGLRenderTarget(8, 8, { type: T.FloatType });
      const buf = new Float32Array(8 * 8 * 4);
      const read = () => {
        A.renderer.setRenderTarget(rt); A.renderer.render(ps, cam);
        A.renderer.readRenderTargetPixels(rt, 0, 0, 8, 8, buf); A.renderer.setRenderTarget(null);
        return 0.2126 * buf[0] + 0.7152 * buf[1] + 0.0722 * buf[2];
      };
      const aim = (n) => { // orient quad so its +z normal points along world n; camera looks back down n
        const N = new T.Vector3(...n).normalize();
        quad.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), N);
        cam.position.copy(N).multiplyScalar(1.5); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(true);
      };
      const use = (lights) => { ps.children.slice().forEach(c => { if (c !== quad) ps.remove(c); }); lights.forEach(l => ps.add(l)); };
      const horiz = [1, 0, 0];
      const out = {};
      aim(horiz);
      use([new T.AmbientLight(0xffffff, 1.0)]); out.unit = read();
      use([new T.AmbientLight(0xffffff, 1.0)]); out.amb1 = read() / out.unit; // linearity anchor == 1
      const hemi = new T.HemisphereLight(A.hemi.color.getHex(), A.hemi.groundColor.getHex(), 1.0);
      use([hemi]); out.hemi1 = read() / out.unit; // per unit intensity at horizontal N
      use([]); mat.envMap = A._envMap; mat.envMapIntensity = 0.6; mat.needsUpdate = true;
      out.env06 = A._envMap ? read() / out.unit : 0;
      mat.envMap = null; mat.needsUpdate = true;
      const sunL = new T.DirectionalLight(0xfff0dd, 1.0); sunL.position.set(200, 400, 300);
      const Ln = new T.Vector3(200, 400, 300).normalize();
      aim([Ln.x, Ln.y, Ln.z]); use([sunL]); out.sun1 = read() / out.unit; // per unit intensity, N==L
      rt.dispose();
      return out;
    };
    W.frameTime = (n) => {
      const times = [];
      for (let i = 0; i < 5; i++) W.renderRead(); // warmup incl. any recompile
      for (let i = 0; i < n; i++) { const s = performance.now(); W.renderRead(); times.push(performance.now() - s); }
      times.sort((a, b) => a - b);
      return { median: times[Math.floor(n / 2)], p90: times[Math.floor(n * 0.9)] };
    };
    W.heap = () => { if (window.gc) { try { window.gc(); } catch (e) {} } return performance.memory ? performance.memory.usedJSHeapSize : -1; };
    W.info = () => ({ tris: A.renderer.info.render.triangles, calls: A.renderer.info.render.calls });
    W.shadow = () => ({ cast: A.sun.castShadow, w: A.sun.shadow.mapSize.width, h: A.sun.shadow.mapSize.height });
    W.collectMeshes = () => A.collectMeshes(o => (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible);
    W.resolveGuid = (hit) => {
      const A2 = window.APP;
      if (hit.object.isBatchedMesh && hit.batchId !== undefined && A2._batchMeta && A2._batchMeta[hit.object.id]) {
        const be = A2._batchMeta[hit.object.id].find(m => m.slotId === hit.batchId); if (be) return be.guid;
      }
      if (hit.object.isInstancedMesh && hit.instanceId !== undefined && A2._instanceMeta && A2._instanceMeta[hit.object.id]) {
        const im = A2._instanceMeta[hit.object.id][hit.instanceId]; if (im) return im.guid;
      }
      return A2.guidMap[hit.object.id] || (hit.object.userData && hit.object.userData.guid) || null;
    };
    W.castRays = (rays) => { // rays: [{ox,oy,oz,dx,dy,dz,tag}] in world coords
      const rc = new T.Raycaster(); rc.firstHitOnly = false;
      const meshes = W.collectMeshes();
      return rays.map(r => {
        rc.set(new T.Vector3(r.ox, r.oy, r.oz), new T.Vector3(r.dx, r.dy, r.dz).normalize());
        const hits = rc.intersectObjects(meshes, false).filter(h =>
          !(h.object.userData && h.object.userData._isOutline) &&
          !(h.object.material && h.object.material.opacity < 0.3) &&
          !(h.object.userData && h.object.userData.isBboxPlaceholder));
        return { tag: r.tag, n: hits.length,
          first: hits.length ? W.resolveGuid(hits[0]) : null,
          top3: hits.slice(0, 3).map(W.resolveGuid) };
      });
    };
    W.ifc2three = (x, y, z) => A.ifc2three(x, y, z);
  }, { OLD_AMBIENT, OLD_HEMI });

  // ---- world-space geometry for poses and rays ------------------------------------------------
  const world = await page.evaluate(({ samples, spaces, bboxMin, bboxMax }) => {
    const W = window.__wwslf;
    const c1 = W.ifc2three(bboxMin[0], bboxMin[1], bboxMin[2]);
    const c2 = W.ifc2three(bboxMax[0], bboxMax[1], bboxMax[2]);
    const mn = [Math.min(c1.x, c2.x), Math.min(c1.y, c2.y), Math.min(c1.z, c2.z)];
    const mx = [Math.max(c1.x, c2.x), Math.max(c1.y, c2.y), Math.max(c1.z, c2.z)];
    const ctr = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    const els = samples.map(s => { const p = W.ifc2three(s.cx, s.cy, s.cz); return { guid: s.guid, cls: s.cls, p: [p.x, p.y, p.z], h: Math.max(s.bx, s.by, s.bz) / 2 }; });
    const sps = spaces.map(sp => {
      const p = W.ifc2three(sp.cx, sp.cy, sp.cz);
      return { name: sp.name, p: [p.x, p.y, p.z],
        targets: sp.targets.map(w => { const q = W.ifc2three(w.cx, w.cy, w.cz); return { guid: w.guid, cls: w.cls, p: [q.x, q.y, q.z] }; }) };
    });
    return { mn, mx, ctr, els, sps };
  }, { samples, spaces, bboxMin, bboxMax });

  const diag = Math.hypot(world.mx[0] - world.mn[0], world.mx[1] - world.mn[1], world.mx[2] - world.mn[2]);
  const L = [0.371, 0.743, 0.557]; // normalized (200,400,300)
  const hL = Math.hypot(L[0], L[2]); const sunDir = [L[0] / hL, 0, L[2] / hL];
  const eyeY = world.ctr[1] + (world.mx[1] - world.ctr[1]) * 0.3;
  const poseSun = { p: [world.ctr[0] + sunDir[0] * diag * 0.9, eyeY, world.ctr[2] + sunDir[2] * diag * 0.9], t: world.ctr };
  const poseAway = { p: [world.ctr[0] - sunDir[0] * diag * 0.9, eyeY, world.ctr[2] - sunDir[2] * diag * 0.9], t: world.ctr };
  const poseIn = { p: world.sps[0].p, t: world.sps[0].targets[0].p };

  // rays: OUTSIDE — radially outward origin per sampled element; INSIDE — space center -> wall
  const rays = [];
  for (const e of world.els) {
    let d = [e.p[0] - world.ctr[0], 0, e.p[2] - world.ctr[2]];
    let dl = Math.hypot(d[0], d[2]); if (dl < 1) { d = [1, 0, 0]; dl = 1; }
    d = [d[0] / dl, 0.25, d[2] / dl];
    const off = e.h * 4 + 8;
    rays.push({ ox: e.p[0] + d[0] * off, oy: e.p[1] + d[1] * off, oz: e.p[2] + d[2] * off,
      dx: -d[0], dy: -d[1], dz: -d[2], tag: 'out|' + e.cls + '|' + e.guid });
  }
  for (const sp of world.sps) for (const tg of sp.targets) {
    rays.push({ ox: sp.p[0], oy: sp.p[1], oz: sp.p[2],
      dx: tg.p[0] - sp.p[0], dy: tg.p[1] - sp.p[1], dz: tg.p[2] - sp.p[2], tag: 'in|' + tg.cls + '|' + tg.guid });
  }

  // ---- calibration (state-independent: probe scene has its own lights) ------------------------
  const cal = await page.evaluate(() => window.__wwslf.calib());
  const calOk = Math.abs(cal.amb1 - 1.0) < 0.02 && cal.sun1 > 0 && cal.hemi1 > 0;
  S(`§WWSLF_CALIB unit=${cal.unit.toFixed(5)} amb1=${cal.amb1.toFixed(4)} hemi1=${cal.hemi1.toFixed(4)} env06=${cal.env06.toFixed(4)} sun1=${cal.sun1.toFixed(4)} (ambient-equivalent units per unit intensity)`);
  if (!calOk) { S('§WWSLF_VERDICT INCONCLUSIVE — calibration failed (amb1 must be 1.0 +/-2%)'); await browser.close(); server.close(); process.exit(1); }

  // fill + contrast model in calibrated units
  const fillOld = OLD_AMBIENT + OLD_HEMI * cal.hemi1 + cal.env06;
  const sunEff = 4.4 * cal.sun1 * REPR_NL;
  const contrastOld = fillOld / (fillOld + sunEff);
  const kForT2 = (sunEff * T2_CONTRAST / (1 - T2_CONTRAST) - cal.env06) / (OLD_AMBIENT + OLD_HEMI * cal.hemi1);
  const kForT3 = (T3_P25 * fillOld - cal.env06) / (OLD_AMBIENT + OLD_HEMI * cal.hemi1);
  const conflict = kForT2 < kForT3;
  const k = conflict ? kForT3 : kForT2;
  const fillNew = k * (OLD_AMBIENT + OLD_HEMI * cal.hemi1) + cal.env06;
  const contrastNew = fillNew / (fillNew + sunEff);
  S(`§WWSLF_DERIVE fill_old=${fillOld.toFixed(3)} sun_eff=${sunEff.toFixed(3)} contrast_old=${contrastOld.toFixed(3)} ` +
    `k_T2=${kForT2.toFixed(3)} k_T3floor=${kForT3.toFixed(3)} conflict=${conflict} k=${k.toFixed(3)} ` +
    `-> ambient=${(OLD_AMBIENT * k).toFixed(3)} hemi=${(OLD_HEMI * k).toFixed(3)} contrast_new=${contrastNew.toFixed(3)}`);
  if (conflict) S(`§WWSLF_CONFLICT T2 wants k=${kForT2.toFixed(3)} but T3 interior floor binds at k=${kForT3.toFixed(3)} — ` +
    `shipping the T3-clamped k; achieved contrast ${contrastNew.toFixed(3)} vs target ${T2_CONTRAST}`);

  if (DERIVE) {
    S(`§WWSLF_PROPOSAL scene.js ambient=${(OLD_AMBIENT * k).toFixed(3)} hemi=${(OLD_HEMI * k).toFixed(3)} (sun 4.4 untouched)`);
    await browser.close(); server.close();
    S('§WWSLF_VERDICT DERIVE-ONLY — nothing asserted beyond calibration');
    return;
  }

  // ---- S1: resolved side per class ------------------------------------------------------------
  const mc = await page.evaluate(() => window.__wwslf.matCensus());
  if (!mc.frontMap) { S('§WWSLF_VERDICT NO-OP — A._frontSideClasses missing (part 1 not live)'); await browser.close(); server.close(); process.exit(1); }
  let s1Bad = 0, frontMats = 0, dblMats = 0;
  for (const [cls, c] of Object.entries(mc.per)) {
    const wantFront = !!mc.frontMap[cls];
    if (wantFront && c.dbl > 0) { s1Bad += c.dbl; }
    if (!wantFront && c.front > 0) { s1Bad += c.front; }
    frontMats += c.front; dblMats += c.dbl;
  }
  S(`§WWSLF_S1 mats=${mc.matCount} front=${frontMats} double=${dblMats} mismatched=${s1Bad} origSide_incoherent=${mc.incoherent} transparent_nondouble=${mc.transparentNonDouble}`);
  verdict(s1Bad === 0, 'S1 side-per-class matches census map', s1Bad + ' opaque materials on the wrong side');
  verdict(mc.incoherent === 0, 'S1 userData.origSide coherent with live side');
  verdict(mc.transparentNonDouble === 0, 'S1 transparent path untouched (still DoubleSide)');
  if (frontMats === 0) { S('§WWSLF_VERDICT NO-OP — zero FrontSide materials resolved; flip not applied'); await browser.close(); server.close(); process.exit(1); }

  // ---- shipped-constants check against derivation --------------------------------------------
  const ship = await page.evaluate(() => ({ a: window.__wwslf.shipAmbient, h: window.__wwslf.shipHemi }));
  S(`§WWSLF_SHIPPED ambient=${ship.a} hemi=${ship.h} derived=${(OLD_AMBIENT * k).toFixed(3)}/${(OLD_HEMI * k).toFixed(3)}`);
  verdict(Math.abs(ship.a - OLD_AMBIENT * k) <= 0.02 && Math.abs(ship.h - OLD_HEMI * k) <= 0.02,
    'S2 shipped light constants match in-page derivation +/-0.02',
    `shipped ${ship.a}/${ship.h} vs derived ${(OLD_AMBIENT * k).toFixed(3)}/${(OLD_HEMI * k).toFixed(3)}`);
  const shipFill = ship.a + ship.h * cal.hemi1 + cal.env06;
  const shipContrast = shipFill / (shipFill + sunEff);
  S(`§WWSLF_T2 contrast_before=${contrastOld.toFixed(3)} contrast_after=${shipContrast.toFixed(3)} target<=${T2_CONTRAST} conflict=${conflict}`);
  verdict(conflict ? shipContrast <= contrastOld - 0.04 : shipContrast <= T2_CONTRAST + 0.01,
    conflict ? 'T2(conflict-clamped) contrast improves materially vs before' : 'T2 contrast target met',
    `after=${shipContrast.toFixed(3)}`);

  // ---- state A/B measurements -----------------------------------------------------------------
  async function measureState(which) {
    const flipped = await page.evaluate(w => window.__wwslf.setState(w), which);
    // frame time at a PINNED pose (poseSun) so before/after are comparable — measureState leaves
    // the camera at the interior pose, which would otherwise skew the second state's timing.
    await page.evaluate(({ p, t }) => window.__wwslf.pose(p, t), poseSun);
    const ft = await page.evaluate(n => window.__wwslf.frameTime(n), 30); // includes recompile warmup
    const out = { flipped, ft, poses: {} };
    for (const [name, pose] of [['sun', poseSun], ['away', poseAway], ['interior', poseIn]]) {
      out.poses[name] = await page.evaluate(({ p, t }) => window.__wwslf.measurePose(p, t), pose);
    }
    out.info = await page.evaluate(() => window.__wwslf.info());
    out.heap = await page.evaluate(() => window.__wwslf.heap());
    out.shadow = await page.evaluate(() => window.__wwslf.shadow());
    out.picks = await page.evaluate(r => window.__wwslf.castRays(r), rays);
    out.matCount = (await page.evaluate(() => window.__wwslf.matCensus())).matCount;
    return out;
  }
  const before = await measureState('before');
  const after = await measureState('after');
  await page.evaluate(() => window.__wwslf.setState('after')); // leave page in shipped state

  // ---- S3 pick integrity ----------------------------------------------------------------------
  let pickJudged = 0, pickBad = 0, hitDropTotal = 0; const badByCls = {};
  for (let i = 0; i < before.picks.length; i++) {
    const b = before.picks[i], a = after.picks[i];
    if (b.first === null && a.first === null) continue; // ray hit nothing in either state — not judged
    pickJudged++;
    hitDropTotal += b.n - a.n;
    if (b.first !== a.first) {
      pickBad++;
      const cls = b.tag.split('|')[1];
      badByCls[cls] = (badByCls[cls] || 0) + 1;
      S(`  §WWSLF_PICK_DIVERGE tag=${b.tag} before=${b.first}(n=${b.n}) after=${a.first}(n=${a.n})`);
    }
  }
  S(`§WWSLF_S3 rays=${before.picks.length} judged=${pickJudged} first_hit_diverged=${pickBad} mean_hitcount_drop=${pickJudged ? (hitDropTotal / pickJudged).toFixed(2) : 0} bad_classes=${JSON.stringify(badByCls)}`);
  if (pickJudged === 0) S('§WWSLF_S3 VACUOUS — no ray resolved a hit in either state');
  verdict(pickJudged > 0 && pickBad === 0, 'S3 pick first-hit identity stable across side flip (outside+inside)',
    pickJudged === 0 ? 'VACUOUS' : pickBad + ' rays diverged: ' + JSON.stringify(badByCls));

  // ---- S4 nothing vanishes --------------------------------------------------------------------
  S(`§WWSLF_S4 tris_before=${before.info.tris} tris_after=${after.info.tris} calls_before=${before.info.calls} calls_after=${after.info.calls}`);
  verdict(before.info.tris === after.info.tris, 'S4 submitted triangles identical', `${before.info.tris} vs ${after.info.tris}`);
  verdict(before.info.calls === after.info.calls, 'S4 draw calls identical', `${before.info.calls} vs ${after.info.calls}`);
  const FRAME = 512 * 384;
  for (const name of ['sun', 'away', 'interior']) {
    const d = (after.poses[name].sentinel - before.poses[name].sentinel) / FRAME;
    S(`§WWSLF_S4_BG pose=${name} sentinel_before=${before.poses[name].sentinel} after=${after.poses[name].sentinel} delta_frac=${d.toFixed(4)}`);
    verdict(d <= SENTINEL_TOL, `S4 background coverage stable @${name}`, `delta=${(d * 100).toFixed(2)}% (tol 0.5%)`);
  }

  // ---- T3 interior floor (measured on the real render, ACES-mapped linear RT values) ----------
  const ip = { b: before.poses.interior, a: after.poses.interior };
  const meanRet = ip.b.mean > 0 ? ip.a.mean / ip.b.mean : 0;
  const p25Ret = ip.b.p25 > 0 ? ip.a.p25 / ip.b.p25 : 0;
  S(`§WWSLF_T3 interior mean_before=${ip.b.mean.toFixed(4)} mean_after=${ip.a.mean.toFixed(4)} retention=${meanRet.toFixed(3)} ` +
    `p25_before=${ip.b.p25.toFixed(4)} p25_after=${ip.a.p25.toFixed(4)} p25_retention=${p25Ret.toFixed(3)} floors mean>=${T3_MEAN} p25>=${T3_P25}`);
  verdict(ip.b.covered > FRAME * 0.5, 'T3 interior pose actually covered by geometry (not vacuous)', `covered=${ip.b.covered}/${FRAME}`);
  verdict(meanRet >= T3_MEAN && p25Ret >= T3_P25, 'T3 interior luminance floor held', `mean_ret=${meanRet.toFixed(3)} p25_ret=${p25Ret.toFixed(3)}`);

  // ---- away-facade darkening on the real render ----------------------------------------------
  const ap = { b: before.poses.away, a: after.poses.away };
  const awayRet = ap.b.mean > 0 ? ap.a.mean / ap.b.mean : 0;
  S(`§WWSLF_AWAY facade mean_before=${ap.b.mean.toFixed(4)} mean_after=${ap.a.mean.toFixed(4)} ratio=${awayRet.toFixed(3)} (fill-model predicts ~${(shipFill / fillOld).toFixed(3)})`);
  verdict(awayRet < 0.90, 'away facade measurably darker on the real render', `ratio=${awayRet.toFixed(3)}`);

  // ---- S5 node-side N·L census ---------------------------------------------------------------
  const fc = await faceCensus(THREE);
  for (const B of Object.keys(fc)) {
    const f = fc[B];
    const litB = fillOld + 4.4 * cal.sun1 * f.meanNLlit, litA = shipFill + 4.4 * cal.sun1 * f.meanNLlit;
    S(`§WWSLF_S5 building=${B} wall_faces=${f.faces} lit_area=${f.litArea.toFixed(0)}m2 away_area=${f.awayArea.toFixed(0)}m2 ` +
      `meanNL_lit=${f.meanNLlit.toFixed(3)} away_irr before=${fillOld.toFixed(3)} after=${shipFill.toFixed(3)} ratio=${(shipFill / fillOld).toFixed(3)} ` +
      `contrast before=${(fillOld / litB).toFixed(3)} after=${(shipFill / litA).toFixed(3)}`);
    verdict(f.faces > 1000, `S5 ${B} face census populated`, `${f.faces} faces`);
  }

  // ---- M1..M4 ---------------------------------------------------------------------------------
  S(`§WWSLF_M1 mats_before=${before.matCount} mats_after=${after.matCount} calls_delta=${after.info.calls - before.info.calls}`);
  verdict(before.matCount === after.matCount, 'M1 material cache does not fragment', `${before.matCount} vs ${after.matCount}`);
  const ftDelta = after.ft.median - before.ft.median;
  S(`§WWSLF_M2 frame_median_before=${before.ft.median.toFixed(1)}ms after=${after.ft.median.toFixed(1)}ms delta=${ftDelta.toFixed(1)}ms p90 ${before.ft.p90.toFixed(1)}->${after.ft.p90.toFixed(1)}ms`);
  verdict(ftDelta <= Math.max(1.5, before.ft.median * 0.10), 'M2 frame time does not regress (>10% or >1.5ms)', `delta=${ftDelta.toFixed(1)}ms`);
  const heapDelta = (after.heap - before.heap) / 1048576;
  S(`§WWSLF_M3 heap_before=${(before.heap / 1048576).toFixed(0)}MB heap_after=${(after.heap / 1048576).toFixed(0)}MB delta=${heapDelta.toFixed(0)}MB`);
  verdict(before.heap > 0 && Math.abs(heapDelta) <= 50, 'M3 heap delta within noise (+/-50MB)', `${heapDelta.toFixed(0)}MB`);
  S(`§WWSLF_M4 shadow before=${JSON.stringify(before.shadow)} after=${JSON.stringify(after.shadow)}`);
  verdict(JSON.stringify(before.shadow) === JSON.stringify(after.shadow) && after.shadow.cast === false,
    'M4 sun shadow config untouched');

  await browser.close(); server.close();
  const verdictWord = judged === 0 ? 'VACUOUS' : (fails > 0 ? 'FAIL' : 'PASS');
  S(`§WWSLF_VERDICT ${verdictWord} judged=${judged} fails=${fails} t=${((Date.now() - t0) / 1000).toFixed(0)}s`);
  S(`§WITNESS_WALL_SIDE_LIGHT_FLOOR pass=${judged - fails} fail=${fails} ran=${judged}`);
  if (fails > 0) process.exitCode = 1;
})().catch(e => { console.log('§WWSLF_VERDICT INCONCLUSIVE — harness threw: ' + (e.stack || e)); process.exit(1); });
