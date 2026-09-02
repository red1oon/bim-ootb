// ⚠ DO NOT REMOVE — Scope guard
// Scope: prompts/PHOTOREAL_STILL_RENDER.md §SUN_FILL_RATIO (AGENT_QUEUE D-1).
// Claim under test: in the Alt+S PHOTOREAL staged state an exterior wall facing AWAY from the sun
// must read darker than one facing it, by the same margin plain navigation already ships
// (§WALL_SIDE_AND_LIGHT_FLOOR / PR #1601). Every number below is a linear luminance READ FROM A
// REAL RENDER of a REAL building DB — never a screenshot, never an eyeball.
//
// METHOD (and why each part is the way it is):
//  * Wall pair — two REAL wall elements of the SAME ifc_class AND the SAME material_rgba (so
//    albedo cannot be the confound), one whose outward normal faces the LIVE sun vector, one whose
//    outward normal faces away. Outward is signed by the building centroid; exteriority is GATED
//    by a 25-ray coverage test (an interior wall's camera lands inside and fails).
//  * Camera — 12 m standoff (> CAM_LIGHT_DISTANCE 4, so the camera torch cannot contribute) with
//    the FOV narrowed so the wall fills the frame. Coverage >= 0.88 or the pair is rejected.
//  * Luminance — FloatType RT with toneMapping OFF. Lighting is then ADDITIVE, so each light
//    group's share is (all on) - (that group off); closure of the sum against the total is
//    asserted. Exposure is a uniform scale and cannot change a ratio, so it is deliberately out.
//  * A/B on ONE page load is valid HERE (contra §PHOTO_GRADE's rule, per CPE_4D_PERF_MEM_STUDY
//    §R10's own "re-check the trade-off for each new measurement"): these renders are deterministic
//    single renders, not AO/TAA accumulations, so there is no first-fold-does-the-work effect and
//    no scene reseed. Math.random is seeded anyway, and a RED CONTROL re-measures the untouched
//    condition at the end and asserts it reproduces.
//
// Verdict line can say NO-OP / VACUOUS / INCONCLUSIVE — never PASS when nothing was judged.
// Run:  node viewer/tests/witness_sun_fill_ratio.js            (assert the shipped state)
//       BLDS=Clinic node viewer/tests/witness_sun_fill_ratio.js --derive   (measurement only)
// Read the saved log after every run. Exit code is not evidence.
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const Database = require(process.env.BSQL3 || (os.homedir() + '/bim-compiler/node_modules/better-sqlite3'));

const DERIVE = process.argv.includes('--derive');
const ROOT = process.env.WT || path.join(__dirname, '..', '..');
const BLD = path.join(ROOT, 'viewer', 'buildings');
const BUILDINGS = (process.env.BLDS || 'Clinic,Hospital').split(',');
const STANDOFF = 12;        // m — beyond CAM_LIGHT_DISTANCE (4): the camera torch cannot reach
const RW = 320, RH = 240;
const COV_GATE = 0.88;      // >= 88% of the 25 sample rays must land on the target element
const T3_MEAN = 0.70, T3_P25 = 0.55;   // interior floors — §WALL_SIDE_AND_LIGHT_FLOOR SPEC S3/T3
const SEP_TOL = 0.02;       // staged separation must reach plain-nav separation within this
const GROUPS = ['sun', 'ambient', 'hemi', 'env', 'pl', 'camlight'];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm',
  '.jpg': 'image/jpeg', '.bin': 'application/octet-stream', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream' };
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
const S = m => console.log(m);
let judged = 0, fails = 0, conflicts = 0;
function verdict(ok, label, detail) { judged++; if (!ok) fails++; S('  ' + (ok ? 'PASS' : 'FAIL') + ' ' + label + (detail ? ' — ' + detail : '')); }

// ---------- node side: dominant vertical-face axis per wall, signed OUTWARD --------------------
// A wall slab carries near-equal area on both faces, so "which face is sun-facing" CANNOT be
// decided by area (a first pass that did produced 556 "sun-facing" of 602 walls — degenerate).
// The axis is the principal eigenvector of the area-weighted orientation tensor of vertical face
// normals; its SIGN is fixed by pointing away from the building's own centroid.
function wallCensus(THREE, B) {
  const meta = new Database(path.join(BLD, B + '_meta.db'), { readonly: true });
  const geo = new Database(path.join(BLD, B + '_geo.db'), { readonly: true });
  const rows = meta.prepare(`SELECT m.guid, m.ifc_class cls, m.material_rgba rgba, i.geometry_hash h,
      t.center_x cx, t.center_y cy, t.center_z cz, t.bbox_x bx, t.bbox_y by, t.bbox_z bz,
      t.rotation_x rx, t.rotation_y ry, t.rotation_z rz
    FROM elements_meta m JOIN element_instances i ON i.guid = m.guid
    JOIN element_transforms t ON t.guid = m.guid
    WHERE m.ifc_class IN ('IfcWall','IfcWallStandardCase')`).all();
  const spaces = meta.prepare(`SELECT name, center_x cx, center_y cy, center_z cz, size_x sx, size_y sy
    FROM spatial_structure WHERE type='IfcSpace' AND size_x > 3 AND size_y > 3
    ORDER BY size_x*size_y DESC LIMIT 3`).all();
  // aim each standpoint at ITS OWN nearest wall element (the §WWSLF pattern) — a space-centre to
  // space-centre shot can run clean out of the building and stops being an interior measurement.
  const wallCentres = meta.prepare(`SELECT t.center_x cx, t.center_y cy, t.center_z cz
    FROM elements_meta m JOIN element_transforms t ON t.guid = m.guid
    WHERE m.ifc_class IN ('IfcWall','IfcWallStandardCase')`).all();
  for (const sp of spaces) {
    let best = null, bd = Infinity;
    for (const w of wallCentres) {
      const d = (w.cx - sp.cx) ** 2 + (w.cy - sp.cy) ** 2 + (w.cz - sp.cz) ** 2;
      if (d > 1 && d < bd) { bd = d; best = w; }
    }
    sp.aim = best || { cx: sp.cx + 3, cy: sp.cy, cz: sp.cz };
  }
  if (!rows.length) { meta.close(); geo.close(); return { walls: [], spaces }; }
  let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
  for (const r of rows) { mnx = Math.min(mnx, r.cx); mxx = Math.max(mxx, r.cx); mny = Math.min(mny, r.cy); mxy = Math.max(mxy, r.cy); }
  const ctrX = (mnx + mxx) / 2, ctrY = (mny + mxy) / 2;   // IFC x,y
  const geoStmt = geo.prepare('SELECT vertices, faces FROM component_geometries WHERE geometry_hash = ?');
  const cache = new Map();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  const out = [];
  for (const r of rows) {
    let m = cache.get(r.h); if (m === undefined) { m = geoStmt.get(r.h) || null; cache.set(r.h, m); }
    if (!m) continue;
    const vs = new Float32Array(m.vertices.buffer, m.vertices.byteOffset, m.vertices.byteLength >> 2);
    const fs2 = new Uint32Array(m.faces.buffer, m.faces.byteOffset, m.faces.byteLength >> 2);
    const eul = new THREE.Euler(r.rx || 0, r.rz || 0, -(r.ry || 0), 'XYZ');   // streaming.js's own order
    const rot = new THREE.Matrix4().makeRotationFromEuler(eul);
    let sxx = 0, sxz = 0, szz = 0, aVert = 0;
    for (let t = 0; t < fs2.length; t += 3) {
      const i0 = fs2[t] * 3, i1 = fs2[t + 1] * 3, i2 = fs2[t + 2] * 3;
      va.set(vs[i0], vs[i0 + 2], -vs[i0 + 1]);      // blobToGeometry swap (x,y,z)->(x,z,-y)
      vb.set(vs[i1], vs[i1 + 2], -vs[i1 + 1]);
      vc.set(vs[i2], vs[i2 + 2], -vs[i2 + 1]);
      e1.subVectors(vb, va); e2.subVectors(vc, va);
      n.crossVectors(e1, e2);
      const a2 = n.length(); if (a2 < 1e-9) continue;
      n.divideScalar(a2).applyMatrix4(rot);
      if (Math.abs(n.y) > 0.25) continue;
      const area = a2 / 2, hl = Math.hypot(n.x, n.z); if (hl < 1e-6) continue;
      const ux = n.x / hl, uz = n.z / hl;
      sxx += area * ux * ux; sxz += area * ux * uz; szz += area * uz * uz; aVert += area;
    }
    if (aVert < 8) continue;
    const tr = sxx + szz, det = sxx * szz - sxz * sxz;
    const lam = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det));
    let dx, dz;
    if (Math.abs(sxz) > 1e-9) { dx = lam - szz; dz = sxz; } else { dx = (sxx >= szz) ? 1 : 0; dz = (sxx >= szz) ? 0 : 1; }
    const dl = Math.hypot(dx, dz); if (dl < 1e-9) continue;
    dx /= dl; dz /= dl;
    if (lam / aVert < 0.85) continue;              // not one clean planar wall
    const proj = dx * (r.cx - ctrX) + dz * (-(r.cy - ctrY));   // viewer z = -IFC y
    if (proj < 0) { dx = -dx; dz = -dz; }
    out.push({ guid: r.guid, cls: r.cls, rgba: String(r.rgba || ''), area: aVert / 2,
      outwardness: Math.abs(proj), nx: dx, nz: dz,
      cx: r.cx, cy: r.cy, cz: r.cz, bx: r.bx, by: r.by, bz: r.bz });
  }
  meta.close(); geo.close();
  out.sort((a, b) => b.outwardness - a.outwardness);
  return { walls: out, spaces };
}


// ---------- in-page toolkit, injected once per page load --------------------------------------
function toolkit({ RW, RH }) {
  const A = window.APP, T = window.THREE, W = window.__sfr = { A, T };
  W.rt = new T.WebGLRenderTarget(RW, RH, { type: T.FloatType });
  W.px = new Float32Array(RW * RH * 4);
  // Linear read: toneMapping OFF so lighting is additive and exposure (a uniform scale) is out.
  W.renderLinear = () => {
    const tm = A.renderer.toneMapping, bg = A.scene.background;
    A.renderer.toneMapping = T.NoToneMapping;
    A.scene.background = new T.Color(0, 0, 0);
    A.renderer.setRenderTarget(W.rt);
    A.renderer.render(A.scene, A.camera);
    A.renderer.readRenderTargetPixels(W.rt, 0, 0, RW, RH, W.px);
    A.renderer.setRenderTarget(null);
    A.renderer.toneMapping = tm; A.scene.background = bg;
    let sum = 0, black = 0; const l = [];
    for (let i = 0; i < W.px.length; i += 4) {
      const y = 0.2126 * W.px[i] + 0.7152 * W.px[i + 1] + 0.0722 * W.px[i + 2];
      if (y <= 1e-6) black++;
      sum += y; l.push(y);
    }
    l.sort((a, b) => a - b);
    return { mean: sum / (RW * RH), blackFrac: black / (RW * RH), p25: l[Math.floor(l.length * 0.25)] };
  };
  // Whole-frame read for the "did anything get brighter" guard. NOTE, measured not assumed:
  // three.js applies tone mapping ONLY when the destination is the canvas, so a render-target
  // read is scene-linear here too (renderer.toneMapping is ACESFilmic, scene.js:110, and is
  // reported in lightState). ACES + exposure are monotonic, so a linear "not brighter" verdict
  // survives them unchanged.
  W.renderFrame = () => {
    const bg = A.scene.background;
    A.scene.background = new T.Color(0, 0, 0);
    A.renderer.setRenderTarget(W.rt);
    A.renderer.render(A.scene, A.camera);
    A.renderer.readRenderTargetPixels(W.rt, 0, 0, RW, RH, W.px);
    A.renderer.setRenderTarget(null);
    A.scene.background = bg;
    let sum = 0, sum2 = 0; const l = [];
    for (let i = 0; i < W.px.length; i += 4) {
      const y = 0.2126 * W.px[i] + 0.7152 * W.px[i + 1] + 0.0722 * W.px[i + 2];
      sum += y; sum2 += y * y; l.push(y);
    }
    l.sort((a, b) => a - b);
    const n = l.length, mean = sum / n;
    return { mean, p25: l[Math.floor(n * 0.25)], p50: l[Math.floor(n * 0.5)],
      std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), min: l[0], max: l[n - 1] };
  };
  W.pose = (p, t, fovDeg) => {
    if (W.savedFov === undefined) { W.savedFov = A.camera.fov; W.savedAspect = A.camera.aspect; }
    A.camera.position.set(p[0], p[1], p[2]);
    A.camera.up.set(0, 1, 0);
    A.camera.lookAt(t[0], t[1], t[2]);
    A.camera.fov = fovDeg || W.savedFov;
    A.camera.aspect = RW / RH;
    A.camera.updateProjectionMatrix();
    A.camera.updateMatrixWorld(true);
  };
  W.meshes = () => A.collectMeshes(o => (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible);
  W.guidOf = (hit) => {
    if (hit.object.isBatchedMesh && hit.batchId !== undefined && A._batchMeta && A._batchMeta[hit.object.id]) {
      const be = A._batchMeta[hit.object.id].find(m => m.slotId === hit.batchId); if (be) return be.guid;
    }
    if (hit.object.isInstancedMesh && hit.instanceId !== undefined && A._instanceMeta && A._instanceMeta[hit.object.id]) {
      const im = A._instanceMeta[hit.object.id][hit.instanceId]; if (im) return im.guid;
    }
    return A.guidMap[hit.object.id] || (hit.object.userData && hit.object.userData.guid) || null;
  };
  W.coverage = (guid) => {
    const rc = new T.Raycaster(); rc.firstHitOnly = false;
    const meshes = W.meshes(); let hit = 0, tot = 0;
    for (let i = 1; i <= 5; i++) for (let j = 1; j <= 5; j++) {
      rc.setFromCamera(new T.Vector2(-1 + 2 * i / 6, -1 + 2 * j / 6), A.camera);
      const hs = rc.intersectObjects(meshes, false).filter(h =>
        !(h.object.userData && h.object.userData._isOutline) &&
        !(h.object.userData && h.object.userData.isBboxPlaceholder));
      tot++; if (hs.length && W.guidOf(hs[0]) === guid) hit++;
    }
    return tot ? hit / tot : 0;
  };
  W.ifc2three = (x, y, z) => { const p = A.ifc2three(x, y, z); return [p.x, p.y, p.z]; };
  // LIVE sun direction — read, never assumed. A.updateSky() repositions A.sun at load, so the
  // scene.js source constant (200,400,300) is NOT necessarily what is lighting the frame.
  W.sunDir = () => {
    const tx = A.sun.target ? A.sun.target.position.x : 0, ty = A.sun.target ? A.sun.target.position.y : 0,
      tz = A.sun.target ? A.sun.target.position.z : 0;
    const v = new T.Vector3(A.sun.position.x - tx, A.sun.position.y - ty, A.sun.position.z - tz).normalize();
    return [v.x, v.y, v.z];
  };
  // ---- light groups (isolate one contributor at a time) ----
  W.pointLights = () => { const o = []; A.scene.traverse(x => { if (x.isPointLight && x !== A._camLight) o.push(x); }); return o; };
  W.groupSet = (g, on) => {
    if (g === 'sun') { if (W._sunI === undefined) W._sunI = A.sun.intensity; A.sun.intensity = on ? W._sunI : 0; }
    else if (g === 'ambient') { if (W._ambI === undefined) W._ambI = A.ambient.intensity; A.ambient.intensity = on ? W._ambI : 0; }
    else if (g === 'hemi') { if (W._hemI === undefined) W._hemI = A.hemi.intensity; A.hemi.intensity = on ? W._hemI : 0; }
    else if (g === 'camlight') { if (!A._camLight) return; if (W._camI === undefined) W._camI = A._camLight.intensity; A._camLight.intensity = on ? W._camI : 0; }
    else if (g === 'pl') {
      const ls = W.pointLights();
      if (!W._plI) W._plI = new Map(ls.map(l => [l.uuid, l.intensity]));
      ls.forEach(l => { const v = W._plI.get(l.uuid); l.intensity = on ? (v === undefined ? l.intensity : v) : 0; });
    } else if (g === 'env') {
      const mats = Object.values(A._matCache);
      if (!W._envI) W._envI = new Map(mats.map(m => [m.uuid, m.envMapIntensity]));
      mats.forEach(m => { if (typeof m.envMapIntensity !== 'number') return;
        const v = W._envI.get(m.uuid);
        m.envMapIntensity = on ? (v === undefined ? m.envMapIntensity : v) : 0; m.needsUpdate = true; });
      if (W._sceneEnv === undefined) W._sceneEnv = A.scene.environment || null;
      A.scene.environment = on ? W._sceneEnv : null;
    }
  };
  // Freeze the staged state for measurement. The 4096^2 shadow map is re-rendered from 700+
  // casters on EVERY render under software GL, and every camera move restarts a 16-frame
  // AO+TAA accumulation — together they made a 14-render pass take >25 min with no change to
  // any measured quantity. The sun's shadow frustum is fixed to the building envelope and the
  // geometry does not move, so the map is camera-independent and valid for every pose: build it
  // once, then stop re-rendering it. Nothing about the staged LIGHTING changes; asserted below.
  W.captureEnvRefs = () => {
    const matte = Object.values(A._matCache).filter(m => m && 'envMap' in m && !(A._isPhotoGlossyMat ? A._isPhotoGlossyMat(m) : false));
    W.hdriEnv = A._envMap;
    W.skyEnv = null;
    for (const m of matte) if (m.envMap && m.envMap !== A._envMap) { W.skyEnv = m.envMap; break; }
    return { matte: matte.length, hasSky: !!W.skyEnv, predicateAvailable: typeof A._isPhotoGlossyMat === 'function' };
  };
  // Reconstruct the PRE-fix state in the same page load: matte materials back on the staged HDRI.
  W.setMatteEnvMap = (mode) => {
    const t = mode === 'sky' ? W.skyEnv : W.hdriEnv;
    if (!t) return -1;
    let n = 0;
    Object.values(A._matCache).forEach(m => {
      if (!m || !('envMap' in m)) return;
      if (A._isPhotoGlossyMat && A._isPhotoGlossyMat(m)) return;
      if (m.envMap !== t) { m.envMap = t; m.needsUpdate = true; n++; }
    });
    return n;
  };
  W.freezeStaged = () => {
    A.renderer.shadowMap.needsUpdate = true;
    A.renderer.render(A.scene, A.camera);      // one render to build the map
    A.renderer.shadowMap.autoUpdate = false;
    A._stillRefineActive = false;              // stop the accumulation loop competing for the GPU
    return { castShadow: A.sun.castShadow, mapSize: A.sun.shadow.mapSize.width,
      autoUpdate: A.renderer.shadowMap.autoUpdate,
      boosted: Object.values(A._matCache).filter(m => m.userData && m.userData._photoBoosted).length,
      envMats: Object.values(A._matCache).filter(m => m.envMap).length };
  };
  // §SUN_FILL_RATIO teardown check: after Alt+S exits, no material may still be holding the
  // staged env map or a scaled envMapIntensity. (Before this change matte materials kept the
  // HDRI after teardown — a pre-existing leak the same restore pass closes.)
  W.teardownCensus = () => {
    const mats = Object.values(A._matCache);
    return {
      staged: !!A._photoStagingOn,
      stale: mats.filter(m => m && 'envMap' in m && m.envMap && A._envMap && m.envMap !== A._envMap).length,
      leftBoosted: mats.filter(m => m && m.userData && m.userData._photoBoosted).length,
      leftOrigEnv: mats.filter(m => m && m.userData && m.userData._photoOrigEnvMapIntensity !== undefined).length,
      castShadow: A.sun.castShadow, total: mats.length
    };
  };
  // §STAGED_PL_CUT sweep. The staged fixture point lights are the mechanism that is SUPPOSED to
  // light interiors once the sun is shadow-blocked; measured, they contribute ~0 to an exterior
  // facade, so this knob moves the interior without touching the wall separation. Multiplier is
  // relative to the SHIPPED _nightPLScaleStill, so f=1 is today's build.
  W.setPLScale = (f) => {
    // MUST move A._nightPLScale, not just the per-light intensity: tools.js's pooled fixture update
    // (§STAGED_PL_CUT, tools.js:1787/1821) recomputes every light's intensity from that scalar on
    // camera moves, so a per-light write is silently overwritten before the next render. A first
    // version of this sweep did exactly that and reported a clean 0.00000 "the fixtures do not
    // light interiors" — a FALSE finding produced by the instrument, caught by the sum read-back
    // below. Both are set, and the caller checks that the total intensity actually moved.
    const ls = W.pointLights();
    if (!W._plBase) { W._plBase = new Map(ls.map(l => [l.uuid, l.intensity])); W._plScaleBase = A._nightPLScale || 1; }
    A._nightPLScale = W._plScaleBase * f;
    let n = 0;
    ls.forEach(l => { const b = W._plBase.get(l.uuid); if (b === undefined) return; l.intensity = b * f; n++; });
    return { n, sum: +W.pointLights().reduce((a, l) => a + l.intensity, 0).toFixed(3), scale: A._nightPLScale };
  };
  W.unfreeze = () => { A.renderer.shadowMap.autoUpdate = true; A.renderer.shadowMap.needsUpdate = true; };
  W.lightState = () => ({
    sun: +A.sun.intensity.toFixed(4), ambient: +A.ambient.intensity.toFixed(4), hemi: +A.hemi.intensity.toFixed(4),
    sunDir: W.sunDir().map(v => +v.toFixed(3)),
    camLight: A._camLight ? A._camLight.intensity : -1, camLightDist: A._camLight ? A._camLight.distance : -1,
    pointLights: W.pointLights().length, plScale: A._nightPLScale,
    plIntensitySum: +W.pointLights().reduce((a, l) => a + l.intensity, 0).toFixed(3),
    plMaxIntensity: +W.pointLights().reduce((a, l) => Math.max(a, l.intensity), 0).toFixed(3),
    exposure: +A.renderer.toneMappingExposure.toFixed(4), castShadow: A.sun.castShadow,
    staged: !!A._photoStagingOn, hdriActive: !!A._envMapHdriActive,
    matCount: Object.keys(A._matCache).length,
    envMats: Object.values(A._matCache).filter(m => m.envMap).length,
    boosted: Object.values(A._matCache).filter(m => m.userData && m.userData._photoBoosted).length,
    matteSkyEnvPresent: !!A._photoMatteSkyEnv,
    glossyOnHdri: Object.values(A._matCache).filter(m => m.envMap && A._isPhotoGlossyMat && A._isPhotoGlossyMat(m) &&
      (m.envMap === A._envMap || (m.userData && m.userData._photoRoomProbeEligible))).length,
    glossyTotal: Object.values(A._matCache).filter(m => m.envMap && A._isPhotoGlossyMat && A._isPhotoGlossyMat(m)).length,
    matteOnSkyEnv: Object.values(A._matCache).filter(m =>
      m.envMap && A._envMap && m.envMap !== A._envMap && !(m.userData && m.userData._photoRoomProbeEligible)).length,
    toneMapping: A.renderer.toneMapping
  });
  // Emulate a candidate diffuse-env scale WITHOUT shipping it, so the constant can be DERIVED
  // from measurement instead of guessed. Applies only to the non-glossy (matte) materials —
  // exactly the population the shipped change targets.
  W.matteMats = () => Object.values(A._matCache).filter(m =>
    typeof m.envMapIntensity === 'number' &&
    !(m.userData && m.userData._photoEnvExempt) &&
    !(typeof m.metalness === 'number' && m.metalness > 0.3) &&
    !(typeof m.roughness === 'number' && m.roughness <= 0.5));
  W.setMatteEnvScale = (s) => {
    const ms = W.matteMats();
    // Base = the UNSTAGED intensity. Once the shipped change is live the staged material already
    // carries the scaled value, so read the saved original when it exists — otherwise a re-derive
    // would compound the scale on itself and read a false NO-OP.
    if (!W._matteBase) W._matteBase = new Map(ms.map(m => [m.uuid,
      (m.userData && m.userData._photoOrigEnvMapIntensity !== undefined) ? m.userData._photoOrigEnvMapIntensity : m.envMapIntensity]));
    let n = 0;
    ms.forEach(m => { const b = W._matteBase.get(m.uuid); if (b === undefined) return;
      m.envMapIntensity = b * s; m.needsUpdate = true; n++; });
    return n;
  };
}

// ---------- main ------------------------------------------------------------------------------
(async () => {
  const t0 = Date.now();
  const tmpMjs = path.join(os.tmpdir(), 'sfr_three_' + process.pid + '.mjs');
  fs.copyFileSync(path.join(ROOT, 'viewer', 'lib', 'three.core.min.js'), tmpMjs);
  const THREE = await import('file://' + tmpMjs).catch(() => null);
  try { fs.unlinkSync(tmpMjs); } catch (e) {}
  if (!THREE || !THREE.Vector3) { S('§SFR_VERDICT INCONCLUSIVE — three.core import failed in node'); process.exit(1); }
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const perBuilding = [];

  for (const B of BUILDINGS) {
    S(`\n===================== ${B} =====================`);
    const { walls, spaces } = wallCensus(THREE, B);
    S(`§SFR_CENSUS building=${B} planar_walls=${walls.length} spaces=${spaces.length} (all planar walls, ranked by outwardness)`);
    if (!walls.length) { S(`§SFR_VERDICT VACUOUS — ${B}: no planar wall resolved from the real geometry`); fails++; judged++; continue; }

    const browser = await chromium.launch({ args: ['--js-flags=--expose-gc', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    const cons = []; page.on('console', m => cons.push(m.text()));
    page.on('pageerror', e => cons.push('[pageerror] ' + e));
    await page.addInitScript(() => { let s = 987654321; Math.random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; });
    await page.goto(`http://127.0.0.1:${port}/viewer/viewer.html?db=buildings/${B}_extracted.db&bld=${B}`,
      { waitUntil: 'domcontentloaded', timeout: 120000 });
    let ready = false;
    for (let i = 0; i < 300 && !ready; i++) {
      await page.waitForTimeout(1000);
      try { ready = await page.evaluate(() => !!(window.APP && window.APP.streaming === false && window.APP._matCache && Object.keys(window.APP._matCache).length > 0)); } catch (e) {}
    }
    if (!ready) { S(`§SFR_VERDICT INCONCLUSIVE — ${B} never reached streaming=false`); judged++; fails++; await browser.close(); continue; }
    S(`§SFR_LOADED ${B} ${(cons.find(l => l.includes('§SPLIT_GEO_LOADED')) || '(no split-geo line)')} t=${((Date.now() - t0) / 1000).toFixed(0)}s`);
    await page.evaluate(`(${toolkit.toString()})(${JSON.stringify({ RW, RH })})`);

    // --- classify against the LIVE sun vector, then gate exteriority by coverage ---
    const L = await page.evaluate(() => window.__sfr.sunDir());
    S(`§SFR_SUN building=${B} liveSunDir=[${L.map(v => v.toFixed(3)).join(',')}] (read from A.sun, NOT assumed from scene.js)`);
    const posed = await page.evaluate(({ walls, L, STANDOFF, RW, RH }) => {
      const W = window.__sfr;
      return walls.map(e => {
        const c = W.ifc2three(e.cx, e.cy, e.cz);
        const nl = e.nx * L[0] + e.nz * L[2];
        const halfV = Math.min(e.bz, Math.max(e.bx, e.by) / (RW / RH)) * 0.5 * 0.35;
        const fov = 2 * Math.atan(halfV / STANDOFF) * 180 / Math.PI;
        return { guid: e.guid, cls: e.cls, rgba: e.rgba, nl, fov, outwardness: e.outwardness,
          p: [c[0] + e.nx * STANDOFF, c[1], c[2] + e.nz * STANDOFF], t: c };
      }).filter(o => o.fov > 3 && o.fov < 70);
    }, { walls, L, STANDOFF, RW, RH });
    const sunC = posed.filter(o => o.nl > 0.30), awayC = posed.filter(o => o.nl < -0.30);
    S(`§SFR_CANDIDATES building=${B} sunFacing=${sunC.length} awayFacing=${awayC.length} (|N.L|>0.30, fov in 3..70deg)`);
    const key = o => o.cls + '|' + o.rgba;
    // Scan the two sides INDEPENDENTLY. A paired scan couples the two searches — one side's
    // failure consumes the other side's candidate — and on Hospital it burned 60 tries without
    // converging even though both sides had passing walls.
    async function firstCovered(list, label) {
      for (let i = 0; i < Math.min(list.length, 60); i++) {
        const o = list[i];
        const c = await page.evaluate(({ o }) => { window.__sfr.pose(o.p, o.t, o.fov); return window.__sfr.coverage(o.guid); }, { o });
        if (c >= COV_GATE) { S(`  §SFR_TRY building=${B} ${label} ACCEPT cov=${c.toFixed(2)} after ${i + 1} candidate(s) out=${o.outwardness.toFixed(1)} nl=${o.nl.toFixed(2)}`); return { o, c }; }
      }
      S(`  §SFR_TRY building=${B} ${label} none of ${Math.min(list.length, 60)} candidates reached cov>=${COV_GATE}`);
      return null;
    }
    // Take covered sun-facing walls in outwardness order; for each, look for a covered away-facing
    // wall with the SAME material key. Hospital's first covered pair was IfcWall|0.596,0.592,0.573
    // against IfcWall|0.439,0.498,0.557 — same class, different albedo, which would confound the
    // ratio outright, so the pairing must carry the key through the search rather than check it after.
    let chosen = null, sunPick = null, awayPick = null, sunTried = 0;
    for (let i = 0; i < Math.min(sunC.length, 60) && !chosen; i++) {
      const so = sunC[i];
      const cs = await page.evaluate(({ o }) => { window.__sfr.pose(o.p, o.t, o.fov); return window.__sfr.coverage(o.guid); }, { o: so });
      if (cs < COV_GATE) continue;
      sunPick = { o: so, c: cs };
      if (++sunTried > 8) break;
      const sameKey = awayC.filter(o => key(o) === key(so));
      S(`  §SFR_TRY building=${B} sunFacing ACCEPT cov=${cs.toFixed(2)} key='${key(so)}' out=${so.outwardness.toFixed(1)} nl=${so.nl.toFixed(2)} sameKeyAwayCandidates=${sameKey.length}`);
      const ap = await firstCovered(sameKey.slice(0, 40), 'awayFacing(sameKey)');
      if (ap) { awayPick = ap; chosen = { sun: so, away: ap.o, covS: cs, covA: ap.c }; }
    }
    if (!chosen) { S(`§SFR_VERDICT INCONCLUSIVE — ${B}: no albedo-matched exterior pair passed the ${COV_GATE} coverage gate (sunPick=${!!sunPick} awayPick=${!!awayPick})`); judged++; fails++; await browser.close(); continue; }
    S(`§SFR_PAIR building=${B} cls=${chosen.sun.cls} rgba=${chosen.sun.rgba} standoff=${STANDOFF}m | ` +
      `SUNFACING guid=${chosen.sun.guid} N.L=${chosen.sun.nl.toFixed(3)} cov=${chosen.covS.toFixed(2)} fov=${chosen.sun.fov.toFixed(1)} | ` +
      `AWAYFACING guid=${chosen.away.guid} N.L=${chosen.away.nl.toFixed(3)} cov=${chosen.covA.toFixed(2)} fov=${chosen.away.fov.toFixed(1)}`);

    // interior standpoint: real IfcSpace centre aimed at the next space (never an invented pose)
    const inPoses = spaces.length ? await page.evaluate(({ spaces }) => spaces.map(sp => ({
      p: window.__sfr.ifc2three(sp.cx, sp.cy, sp.cz),
      t: window.__sfr.ifc2three(sp.aim.cx, sp.aim.cy, sp.aim.cz),
      name: sp.name || '(unnamed)'
    })), { spaces }) : [];
    S(`§SFR_INTERIOR building=${B} standpoints=${inPoses.length} ${inPoses.map(p => p.name).join(' | ')}`);

    async function wallPair(label) {
      const out = {};
      for (const side of ['sun', 'away']) {
        const o = chosen[side];
        await page.evaluate(({ o }) => window.__sfr.pose(o.p, o.t, o.fov), { o });
        const cov = await page.evaluate(({ g }) => window.__sfr.coverage(g), { g: o.guid });
        const all = await page.evaluate(() => window.__sfr.renderLinear());
        const c = {};
        for (const g of GROUPS) {
          await page.evaluate(({ g }) => window.__sfr.groupSet(g, false), { g });
          const r = await page.evaluate(() => window.__sfr.renderLinear());
          await page.evaluate(({ g }) => window.__sfr.groupSet(g, true), { g });
          c[g] = all.mean - r.mean;
        }
        const sum = GROUPS.reduce((a, g) => a + c[g], 0);
        out[side] = { mean: all.mean, cov, black: all.blackFrac, c, closure: all.mean ? sum / all.mean : 0 };
        S(`§SFR_WALL building=${B} state=${label} face=${side}facing meanLumaLinear=${all.mean.toFixed(5)} cov=${cov.toFixed(2)} ` +
          GROUPS.map(g => g + '=' + c[g].toFixed(5)).join(' ') + ` closure=${out[side].closure.toFixed(3)}`);
      }
      const sep = out.sun.mean > 0 ? out.away.mean / out.sun.mean : -1;
      S(`§SFR_SEPARATION building=${B} state=${label} awayFacing/sunFacing=${sep.toFixed(4)}`);
      return { out, sep };
    }
    async function wallMeans(label) {   // cheap version: no group decomposition
      const m = {};
      for (const side of ['sun', 'away']) {
        const o = chosen[side];
        await page.evaluate(({ o }) => window.__sfr.pose(o.p, o.t, o.fov), { o });
        m[side] = (await page.evaluate(() => window.__sfr.renderLinear())).mean;
      }
      const sep = m.sun > 0 ? m.away / m.sun : -1;
      S(`§SFR_SEPARATION building=${B} state=${label} awayFacing/sunFacing=${sep.toFixed(4)} (away=${m.away.toFixed(5)} sun=${m.sun.toFixed(5)})`);
      return { m, sep };
    }
    async function frameGuard(label) {
      const r = {};
      for (const [n, o] of [['extSun', chosen.sun], ['extAway', chosen.away]]) {
        await page.evaluate(({ o }) => window.__sfr.pose(o.p, o.t, o.fov), { o });
        r[n] = await page.evaluate(() => window.__sfr.renderFrame());
      }
      for (let i = 0; i < inPoses.length; i++) {
        await page.evaluate(({ o }) => window.__sfr.pose(o.p, o.t, 0), { o: inPoses[i] });
        r['interior' + i] = await page.evaluate(() => window.__sfr.renderFrame());
      }
      S(`§SFR_FRAME building=${B} state=${label} ` + Object.keys(r).map(k =>
        `${k}{mean=${r[k].mean.toFixed(4)} p25=${r[k].p25.toFixed(4)}}`).join(' ') + ` (scene-linear; ACES+exposure are monotonic and applied after)`);
      return r;
    }

    // ---- 1. plain navigation: the TARGET separation (§WALL_SIDE_AND_LIGHT_FLOOR already shipped it)
    S(`§SFR_LIGHTS building=${B} state=plainNav ${JSON.stringify(await page.evaluate(() => window.__sfr.lightState()))}`);
    const nav = await wallPair('plainNav');
    verdict(nav.out.sun.cov >= COV_GATE && nav.out.away.cov >= COV_GATE, `${B} pair still covered at measurement time`, `cov ${nav.out.sun.cov}/${nav.out.away.cov}`);
    verdict(Math.abs(nav.out.sun.closure - 1) < 0.05 && Math.abs(nav.out.away.closure - 1) < 0.05,
      `${B} plainNav light groups close on the total (additivity holds)`, `closure ${nav.out.sun.closure.toFixed(3)}/${nav.out.away.closure.toFixed(3)}`);
    await frameGuard('plainNav');   // logged for the record; the ship guard compares altS RED vs GREEN

    // ---- 2. the real Alt+S staging ----
    await page.evaluate(() => { window.APP.startStillRefine(); });
    let staged = false;
    for (let i = 0; i < 90 && !staged; i++) {
      await page.waitForTimeout(500);
      staged = await page.evaluate(() => !!(window.APP._photoStagingOn && window.APP.sun && window.APP.sun.castShadow));
    }
    if (!staged) { S(`§SFR_VERDICT INCONCLUSIVE — ${B}: Alt+S staging never applied`); judged++; fails++; await browser.close(); continue; }
    await page.waitForTimeout(8000);   // HDRI fetch + PMREM generate + env reassert
    const hdriLine = cons.find(l => l.includes('§LAYER2_HDRI_READY'));
    S(`§SFR_STAGED building=${B} ${[hdriLine, cons.find(l => l.includes('§PHOTO_SHADOW ')), cons.find(l => l.includes('§MOVIE_SHADOW_TM')), cons.find(l => l.includes('§CAM_LIGHT on'))].filter(Boolean).join(' || ')}`);
    verdict(!!hdriLine, `${B} staged HDRI envMap actually loaded (else the measurement is not the shipped look)`, hdriLine || 'no §LAYER2_HDRI_READY');
    // FREEZE CONTROL — the 4096^2 shadow map is re-rendered from 700+ casters on every render
    // under software GL and every camera move restarts a 16-frame AO+TAA accumulation: a 14-render
    // pass ran >25 min. Freezing them is an INSTRUMENT change, so it is proven not to change what
    // is measured: the same pose is read immediately before and after the freeze and must agree.
    const fz = await page.evaluate(() => window.__sfr.freezeStaged());
    S(`§SFR_FREEZE building=${B} ${JSON.stringify(fz)} (shadow map built once then frozen; accumulation stopped)`);
    verdict(fz.castShadow === true && fz.mapSize >= 1024 && fz.boosted > 0,
      `${B} staged look intact after the freeze`, JSON.stringify(fz));
    const envRefs = await page.evaluate(() => window.__sfr.captureEnvRefs());
    S(`§SFR_ENVREFS building=${B} ${JSON.stringify(envRefs)}`);
    const stagedLights = await page.evaluate(() => window.__sfr.lightState());
    S(`§SFR_LIGHTS building=${B} state=altS ${JSON.stringify(stagedLights)}`);
    verdict(stagedLights.glossyTotal > 0 && stagedLights.glossyOnHdri === stagedLights.glossyTotal,
      `${B} the HDRI reflection feature is UNTOUCHED — every glossy material still reads it`,
      `${stagedLights.glossyOnHdri}/${stagedLights.glossyTotal} glossy on HDRI/room-probe, ${stagedLights.matteOnSkyEnv} matte on the sky env`);
    const alt = await wallPair('altS_asShipped');
    verdict(Math.abs(alt.out.sun.closure - 1) < 0.05 && Math.abs(alt.out.away.closure - 1) < 0.05,
      `${B} altS light groups close on the total`, `closure ${alt.out.sun.closure.toFixed(3)}/${alt.out.away.closure.toFixed(3)}`);
    const altFrame = await frameGuard('altS_asShipped');

    // ---- 3. the A/B, in ONE page load, on the SAME wall pair ----------------------------------
    // env is additive, so L(x) = R + E(x): the decomposition already gives the counterfactual.
    const Ra = alt.out.away.mean - alt.out.away.c.env, Ea = alt.out.away.c.env;
    const Rs = alt.out.sun.mean - alt.out.sun.c.env, Es = alt.out.sun.c.env;
    const target = nav.sep;
    // Prediction for "matte materials keep plain navigation's env term": swap the staged env
    // contribution for the plain-nav one measured on the SAME two walls. No fitted constant.
    const predAway = Ra + nav.out.away.c.env, predSun = Rs + nav.out.sun.c.env;
    const predSep = predSun > 0 ? predAway / predSun : -1;
    S(`§SFR_DERIVE building=${B} target_plainNav=${target.toFixed(4)} ` +
      `R_away=${Ra.toFixed(5)} E_away_staged=${Ea.toFixed(5)} E_away_plainNav=${nav.out.away.c.env.toFixed(5)} ` +
      `R_sun=${Rs.toFixed(5)} E_sun_staged=${Es.toFixed(5)} E_sun_plainNav=${nav.out.sun.c.env.toFixed(5)} ` +
      `envShareOfAwayWall_staged=${(Ea / alt.out.away.mean).toFixed(3)} envShareOfAwayWall_plainNav=${(nav.out.away.c.env / nav.out.away.mean).toFixed(3)} ` +
      `predicted_separation_with_plainNav_env=${predSep.toFixed(4)}`);

    let before = null, beforeFrame = null, ctrl = null, redSep = null, greenSep = null;
    if (stagedLights.matteSkyEnvPresent && envRefs.hasSky) {
      // The fix is LIVE: `alt` above is GREEN. Reconstruct RED by putting matte materials back on
      // the staged HDRI — same page load, same pair, same camera, same shadow map.
      const n = await page.evaluate(() => window.__sfr.setMatteEnvMap('hdri'));
      S(`§SFR_AB building=${B} reconstructed pre-fix state on ${n} matte material(s)`);
      before = await wallMeans('altS_RED_matteOnHDRI');
      beforeFrame = await frameGuard('altS_RED_matteOnHDRI');
      await page.evaluate(() => window.__sfr.setMatteEnvMap('sky'));
      ctrl = await wallMeans('altS_control_backToShipped');
      redSep = before.sep; greenSep = alt.sep;
    } else {
      // The fix is NOT live: `alt` is RED. Emulate GREEN by scaling the matte env term to the
      // plain-navigation level measured on these same walls (the same counterfactual as predSep).
      const sA = nav.out.away.c.env / (Ea || 1);
      const nMat = await page.evaluate(({ s }) => window.__sfr.setMatteEnvScale(s), { s: sA });
      S(`§SFR_AB building=${B} emulating the fix on ${nMat} matte material(s) via envMapIntensity x${sA.toFixed(4)} (fix not present in this tree)`);
      const after = await wallMeans('altS_GREEN_emulated');
      beforeFrame = altFrame;
      await page.evaluate(() => window.__sfr.setMatteEnvScale(1));
      ctrl = await wallMeans('altS_control_backToRed');
      redSep = alt.sep; greenSep = after.sep;
    }
    const drift = Math.abs(ctrl.sep - (before ? alt.sep : alt.sep));
    S(`§SFR_CONTROL building=${B} sep_first=${alt.sep.toFixed(5)} sep_repeat=${ctrl.sep.toFixed(5)} drift=${drift.toFixed(5)}`);
    verdict(drift < 0.005, `${B} RED CONTROL: the untouched condition reproduces (instrument is not noise)`, `drift=${drift.toFixed(5)}`);
    const moved = Math.abs(greenSep - redSep);
    if (moved <= 4 * Math.max(drift, 1e-4)) {
      S(`§SFR_NOOP building=${B} — separation moved ${moved.toFixed(5)} against a control drift of ${drift.toFixed(5)}: NO-OP, the change does nothing measurable here`);
      verdict(false, `${B} NO-OP — the change does not move the measured separation`, `moved=${moved.toFixed(5)}`);
    } else {
      verdict(true, `${B} the change MOVES the measured separation`, `RED=${redSep.toFixed(4)} -> GREEN=${greenSep.toFixed(4)} (control drift ${drift.toFixed(5)})`);
    }
    S(`§SFR_REDGREEN building=${B} plainNav=${target.toFixed(4)} RED_altS=${redSep.toFixed(4)} GREEN_altS=${greenSep.toFixed(4)} predicted=${predSep.toFixed(4)}`);
    verdict(Math.abs(greenSep - predSep) <= 0.02, `${B} measured GREEN matches the derived prediction (+/-0.02)`,
      `measured=${greenSep.toFixed(4)} predicted=${predSep.toFixed(4)}`);
    verdict(greenSep < redSep - 0.02, `${B} away-facing wall is materially darker relative to the sun-facing one`,
      `${redSep.toFixed(4)} -> ${greenSep.toFixed(4)}`);

    // ---- 4. brightness guard: NOTHING may get brighter -----------------------------------------
    if (before) {   // shipped run: altFrame IS the after state, beforeFrame the reconstructed pre-fix one
      for (const k of Object.keys(altFrame)) {
        verdict(altFrame[k].mean <= beforeFrame[k].mean + 1e-4,
          `${B} frame not brighter than the pre-fix state @${k}`,
          `GREEN=${altFrame[k].mean.toFixed(4)} RED=${beforeFrame[k].mean.toFixed(4)} ratio=${(altFrame[k].mean / beforeFrame[k].mean).toFixed(3)}`);
      }
    }
    // ---- 5. T3 interior floor (§WALL_SIDE_AND_LIGHT_FLOOR's own thresholds, not new ones) ------
    let t3mean = -1, t3p25 = -1, plSolve = null;
    const inKeys = Object.keys(altFrame).filter(k => k.startsWith('interior'));
    const varyOk = inKeys.filter(k => altFrame[k].std > 0.01 * Math.max(1e-6, altFrame[k].mean));
    if (before && inKeys.length) {
      const gm = inKeys.reduce((a, k) => a + altFrame[k].mean, 0) / inKeys.length;
      const rm = inKeys.reduce((a, k) => a + beforeFrame[k].mean, 0) / inKeys.length;
      const gp = inKeys.reduce((a, k) => a + altFrame[k].p25, 0) / inKeys.length;
      const rp = inKeys.reduce((a, k) => a + beforeFrame[k].p25, 0) / inKeys.length;
      t3mean = rm > 0 ? gm / rm : -1; t3p25 = rp > 0 ? gp / rp : -1;
      S(`§SFR_T3 building=${B} standpoints=${inKeys.length} withVariation=${varyOk.length} ` +
        inKeys.map(k => `${k}{RED=${beforeFrame[k].mean.toFixed(4)} GREEN=${altFrame[k].mean.toFixed(4)} std=${altFrame[k].std.toFixed(4)} min..max=${altFrame[k].min.toFixed(3)}..${altFrame[k].max.toFixed(3)}}`).join(' ') +
        ` retention mean=${t3mean.toFixed(3)} p25=${t3p25.toFixed(3)} floors mean>=${T3_MEAN} p25>=${T3_P25}`);
      if (!varyOk.length) S(`§SFR_T3 building=${B} INCONCLUSIVE — every interior frame is featureless (p50==p25); the standpoint is not judging a room`);
      const t3ok = t3mean >= T3_MEAN && t3p25 >= T3_P25;
      verdict(varyOk.length > 0, `${B} interior standpoints actually see a room (not a featureless frame)`, `${varyOk.length}/${inKeys.length}`);
      if (!t3ok) {
        // DECLARED CONFLICT — the same shape §WALL_SIDE_AND_LIGHT_FLOOR hit and clamped for.
        // Solve it on the knob that is measured to move interiors and NOT the facade: the staged
        // fixture point lights. Point-light contribution is additive, so retention is linear in f.
        S(`§SFR_CONFLICT building=${B} the away-wall fix costs interior light: retention mean=${t3mean.toFixed(3)} p25=${t3p25.toFixed(3)} below floors ${T3_MEAN}/${T3_P25}. Solving on §STAGED_PL_CUT (measured facade contribution: pl=${alt.out.away.c.pl.toFixed(5)} of ${alt.out.away.mean.toFixed(5)})`);
        const sweep = [], plSums = [];
        for (const f of [1, 2, 3]) {
          const st = await page.evaluate(({ f }) => window.__sfr.setPLScale(f), { f });
          const n = st.n; plSums.push(st.sum);
          const fr = await frameGuard(`altS_GREEN_plScale_x${f}`);
          const wm = await wallMeans(`altS_GREEN_plScale_x${f}`);
          const m = inKeys.reduce((a, k) => a + fr[k].mean, 0) / inKeys.length;
          const p = inKeys.reduce((a, k) => a + fr[k].p25, 0) / inKeys.length;
          sweep.push({ f, n, mean: m, p25: p, retMean: rm > 0 ? m / rm : -1, retP25: rp > 0 ? p / rp : -1, sep: wm.sep });
          S(`§SFR_PLSWEEP building=${B} f=${f} lights=${n} plIntensitySum=${st.sum} _nightPLScale=${st.scale} interior_mean=${m.toFixed(4)} retMean=${(m / rm).toFixed(3)} retP25=${(p / rp).toFixed(3)} wallSeparation=${wm.sep.toFixed(4)}`);
        }
        await page.evaluate(() => window.__sfr.setPLScale(1));   // restore before anything else is read
        // linear solve from the two end points of the sweep
        const a0 = sweep[0], a2 = sweep[sweep.length - 1];
        const slopeM = (a2.mean - a0.mean) / (a2.f - a0.f), slopeP = (a2.p25 - a0.p25) / (a2.f - a0.f);
        const fM = slopeM > 0 ? a0.f + (T3_MEAN * rm - a0.mean) / slopeM : Infinity;
        const fP = slopeP > 0 ? a0.f + (T3_P25 * rp - a0.p25) / slopeP : Infinity;
        plSolve = { fMean: fM, fP25: fP, f: Math.max(fM, fP), sepDrift: Math.abs(a2.sep - a0.sep) };
        const sumMoved = plSums.length > 1 && Math.abs(plSums[plSums.length - 1] - plSums[0]) > 1e-3;
        if (!sumMoved) {
          S(`§SFR_PLSOLVE building=${B} INCONCLUSIVE — the sweep never actually changed the staged fixture light total ` +
            `(${plSums.join(' -> ')}); nothing was judged, so no claim is made about whether §STAGED_PL_CUT can restore the interior.`);
        } else if (!isFinite(plSolve.f)) {
          S(`§SFR_PLSOLVE building=${B} NO-OP — tripling every staged fixture light changed the interior by ` +
            `${(a2.mean - a0.mean).toFixed(5)} (${a0.mean.toFixed(4)} -> ${a2.mean.toFixed(4)}). The ~${a0.n} night ` +
            `fixtures do NOT light these standpoints, so §STAGED_PL_CUT is NOT the interior remedy. ` +
            `HYPOTHESIS REFUTED BY MEASUREMENT — see §SFR_LIGHTS plIntensitySum for whether they carry any intensity at all.`);
        } else {
          S(`§SFR_PLSOLVE building=${B} f_for_T3mean=${fM.toFixed(2)} f_for_T3p25=${fP.toFixed(2)} f_required=${plSolve.f.toFixed(2)} ` +
            `-> _nightPLScaleStill ${(0.5 * plSolve.f).toFixed(3)} (from 0.5); wall separation across the whole sweep moved ${plSolve.sepDrift.toFixed(5)}`);
        }
        verdict(plSolve.sepDrift < 0.01, `${B} the interior knob does NOT disturb the wall separation`, `sepDrift=${plSolve.sepDrift.toFixed(5)}`);
        conflicts++;
        S(`  DECLARED-CONFLICT ${B} T3 interior floor NOT held by part 1 alone — mean=${t3mean.toFixed(3)} p25=${t3p25.toFixed(3)}. ` +
          `This is reported, not scored: the remedy and its derived value are in §SFR_PLSOLVE, and the alternative (clamping the env cut) is in §SFR_CLAMP.`);
        // The clamp alternative, priced from the same linear model, so the trade is on record both ways.
        const inRedM = inKeys.reduce((a, k) => a + beforeFrame[k].mean, 0) / inKeys.length;
        const inGrnM = inKeys.reduce((a, k) => a + altFrame[k].mean, 0) / inKeys.length;
        const inRedP = inKeys.reduce((a, k) => a + beforeFrame[k].p25, 0) / inKeys.length;
        const inGrnP = inKeys.reduce((a, k) => a + altFrame[k].p25, 0) / inKeys.length;
        const mMean = (inRedM - inGrnM) > 0 ? (T3_MEAN * inRedM - inGrnM) / (inRedM - inGrnM) : Infinity;
        const mP25 = (inRedP - inGrnP) > 0 ? (T3_P25 * inRedP - inGrnP) / (inRedP - inGrnP) : Infinity;
        const mReq = Math.max(mMean, mP25);
        const awayC2 = alt.out.away.mean + mReq * (before.m.away - alt.out.away.mean);
        const sunC2 = alt.out.sun.mean + mReq * (before.m.sun - alt.out.sun.mean);
        S(`§SFR_CLAMP building=${B} keeping fraction m=${mReq.toFixed(3)} of the HDRI matte fill would hold T3 ` +
          `(m_mean=${mMean.toFixed(3)} m_p25=${mP25.toFixed(3)}), but the wall separation would then be ` +
          `${(awayC2 / sunC2).toFixed(4)} instead of ${greenSep.toFixed(4)} — the single-knob clamp buys the interior back at the cost of the user's actual ask`);
      } else {
        verdict(true, `${B} T3 interior luminance floor held`, `mean=${t3mean.toFixed(3)} p25=${t3p25.toFixed(3)}`);
      }
    } else if (!before) {
      S(`§SFR_T3 building=${B} SKIPPED — fix not present in this tree`);
    }

    // ---- 5a. WHAT ACTUALLY LIGHTS AN Alt+S INTERIOR ------------------------------------------
    // The T3 conflict is only actionable if the interior's real light sources are named rather than
    // guessed. Same additive decomposition, at the interior standpoint with the most structure.
    if (inKeys.length) {
      let bestK = inKeys[0];
      for (const k of inKeys) if (altFrame[k].std > altFrame[bestK].std) bestK = k;
      const idx = parseInt(bestK.replace('interior', ''), 10);
      await page.evaluate(({ o }) => window.__sfr.pose(o.p, o.t, 0), { o: inPoses[idx] });
      const all = await page.evaluate(() => window.__sfr.renderFrame());
      const c = {};
      for (const g of GROUPS) {
        await page.evaluate(({ g }) => window.__sfr.groupSet(g, false), { g });
        const r = await page.evaluate(() => window.__sfr.renderFrame());
        await page.evaluate(({ g }) => window.__sfr.groupSet(g, true), { g });
        c[g] = all.mean - r[`mean`];
      }
      const sum = GROUPS.reduce((a, g) => a + c[g], 0);
      S(`§SFR_INTERIOR_DECOMP building=${B} standpoint=${inPoses[idx].name} meanLumaLinear=${all.mean.toFixed(5)} ` +
        GROUPS.map(g => g + '=' + c[g].toFixed(5)).join(' ') + ` closure=${(sum / (all.mean || 1)).toFixed(3)} ` +
        `(GREEN state — this is what is left to light an Alt+S interior once the sun is shadow-blocked)`);
      verdict(Math.abs(sum / (all.mean || 1) - 1) < 0.08, `${B} interior decomposition closes on the total`,
        `closure=${(sum / (all.mean || 1)).toFixed(3)}`);
    }

    // ---- 5b. FREEZE CONTROL, taken at the END when the scene has long settled ------------------
    await page.evaluate(({ o }) => window.__sfr.pose(o.p, o.t, o.fov), { o: chosen.away });
    const frozenRead = await page.evaluate(() => window.__sfr.renderLinear());
    await page.evaluate(() => window.__sfr.unfreeze());
    await page.evaluate(({ o }) => window.__sfr.pose(o.p, o.t, o.fov), { o: chosen.away });
    const liveRead = await page.evaluate(() => window.__sfr.renderLinear());
    const fzDrift = frozenRead.mean > 0 ? Math.abs(liveRead.mean - frozenRead.mean) / frozenRead.mean : 1;
    S(`§SFR_FREEZE_CONTROL building=${B} frozen=${frozenRead.mean.toFixed(5)} liveShadowMap=${liveRead.mean.toFixed(5)} relDrift=${fzDrift.toFixed(5)}`);
    verdict(fzDrift < 0.005, `${B} FREEZE CONTROL: the frozen shadow map reads the same as a freshly rendered one`,
      `relDrift=${fzDrift.toFixed(5)}`);

    // ---- 6. teardown: staging must leave nothing behind -----------------------------------
    await page.evaluate(() => { window.APP._stillRefineActive = true; window.APP.stopStillRefine(true, false); });
    await page.waitForTimeout(3000);
    const td = await page.evaluate(() => window.__sfr.teardownCensus());
    S(`§SFR_TEARDOWN building=${B} ${JSON.stringify(td)} ${(cons.filter(l => l.includes('§SUN_FILL_RATIO teardown')).slice(-1)[0] || '')}`);
    verdict(td.staged === false && td.stale === 0 && td.leftBoosted === 0 && td.leftOrigEnv === 0 && td.castShadow === false,
      `${B} Alt+S teardown leaves no material on the staged env map`, JSON.stringify(td));

    perBuilding.push({ B, target, redSep, greenSep, predSep, t3mean, t3p25, plSolve,
      live: !!before, envShareStaged: Ea / alt.out.away.mean, envSharePlain: nav.out.away.c.env / nav.out.away.mean });
    await browser.close();
  }
  server.close();

  S('\n---------------- SUMMARY ----------------');
  for (const r of perBuilding) {
    S(`§SFR_SUMMARY building=${r.B} plainNav=${r.target.toFixed(4)} RED_altS=${r.redSep.toFixed(4)} ` +
      `GREEN_altS=${r.greenSep.toFixed(4)} predicted=${r.predSep.toFixed(4)} fixLive=${r.live} ` +
      `T3 mean=${r.t3mean.toFixed(3)} p25=${r.t3p25.toFixed(3)} ` + (r.plSolve ? `PL_remedy=${isFinite(r.plSolve.f) ? r.plSolve.f.toFixed(2) : 'NO-OP(refuted)'} ` : '') +
      `envShareOfAwayWall staged=${r.envShareStaged.toFixed(3)} plainNav=${r.envSharePlain.toFixed(3)}`);
  }

  const word = judged === 0 ? 'VACUOUS' : (fails > 0 ? 'FAIL' : (conflicts > 0 ? 'PASS-WITH-DECLARED-CONFLICT' : 'PASS'));
  S(`§SFR_VERDICT ${word} judged=${judged} fails=${fails} declaredConflicts=${conflicts} buildings=${perBuilding.length} t=${((Date.now() - t0) / 1000).toFixed(0)}s`);
  S(`§WITNESS_SUN_FILL_RATIO pass=${judged - fails} fail=${fails} ran=${judged}`);
  if (fails > 0) process.exitCode = 1;
})().catch(e => { S('§SFR_VERDICT INCONCLUSIVE — harness threw: ' + (e.stack || e)); process.exit(1); });
