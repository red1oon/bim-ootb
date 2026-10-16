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
const GROUPS = ['sun', 'ambient', 'hemi', 'env', 'pl', 'camlight', 'emissive'];

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
  // §SFR_LIVELY (U-11, user 2026-09-02: "room lighting should be LIVELY. So far it has never been,
  // though lighting has been BRIGHT."). Mean luminance is precisely the metric that has been
  // satisfied while the room still read dead, so this returns the SHAPE of the luminance field
  // alongside its level. Every one of these is computed from the same single render — no extra
  // render pass, no extra cost — and every one is a number, never a look:
  //   cv        = std/mean, the classic coefficient of variation. A flat wash is LOW cv at ANY mean.
  //   p90p10    = the bright-to-dim ratio a person actually reads as "modelled" vs "washed".
  //   topShare  = share of the frame's total light carried by its brightest decile. A real light
  //               source makes a hot spot; a uniform fill spreads its energy evenly (0.10 = flat).
  //   tileCV    = SPATIAL structure: cv of the 8x6 tile means. cv can be raised by pixel noise or a
  //               single texture; tileCV only moves when the light varies ACROSS THE ROOM, which is
  //               what a falloff gradient is. This is the falloff-gradient metric, measured without
  //               needing to know where any fixture is.
  //   wcMean/wcStd = the warm/cool chromatic axis (r-b)/(r+b), luminance-weighted. wcStd is
  //               chromatic SEPARATION: one flat white everywhere is wcStd ~ 0 regardless of level.
  // Thresholds are NOT invented here: every liveliness number is reported as a RATIO against the
  // same measurement in the shipped state, so the claim is always "it moved by X", never "X is good".
  W.stats = (px) => {
    const n = RW * RH, l = new Float64Array(n);
    let sum = 0, sum2 = 0, wcW = 0, wcS = 0, wcS2 = 0;
    const TX = 8, TY = 6, tS = new Float64Array(TX * TY), tN = new Float64Array(TX * TY);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const r = px[p], g = px[p + 1], b = px[p + 2];
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      l[i] = y; sum += y; sum2 += y * y;
      const d = r + b;
      if (d > 1e-6) { const wc = (r - b) / d; wcW += y; wcS += y * wc; wcS2 += y * wc * wc; }
      const x = i % RW, yy = (i / RW) | 0;
      const ti = Math.min(TY - 1, (yy * TY / RH) | 0) * TX + Math.min(TX - 1, (x * TX / RW) | 0);
      tS[ti] += y; tN[ti] += 1;
    }
    const mean = sum / n, std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    const s = Float64Array.from(l).sort();
    const q = f => s[Math.min(n - 1, Math.floor(n * f))];
    let topSum = 0; for (let i = Math.floor(n * 0.9); i < n; i++) topSum += s[i];
    let tm = 0, tc = 0; for (let i = 0; i < tS.length; i++) if (tN[i]) { tS[i] /= tN[i]; tm += tS[i]; tc++; }
    tm /= (tc || 1);
    let tv = 0; for (let i = 0; i < tS.length; i++) if (tN[i]) tv += (tS[i] - tm) ** 2;
    tv = Math.sqrt(tv / (tc || 1));
    const wcMean = wcW > 0 ? wcS / wcW : 0;
    const wcStd = wcW > 0 ? Math.sqrt(Math.max(0, wcS2 / wcW - wcMean * wcMean)) : 0;
    return { mean, p10: q(0.10), p25: q(0.25), p50: q(0.50), p75: q(0.75), p90: q(0.90),
      std, min: s[0], max: s[n - 1],
      cv: mean > 0 ? std / mean : 0,
      p90p10: q(0.10) > 1e-6 ? q(0.90) / q(0.10) : -1,
      topShare: sum > 0 ? topSum / sum : 0,
      tileCV: tm > 0 ? tv / tm : 0,
      wcMean, wcStd };
  };
  W.renderFrame = () => {
    const bg = A.scene.background;
    A.scene.background = new T.Color(0, 0, 0);
    A.renderer.setRenderTarget(W.rt);
    A.renderer.render(A.scene, A.camera);
    A.renderer.readRenderTargetPixels(W.rt, 0, 0, RW, RH, W.px);
    A.renderer.setRenderTarget(null);
    A.scene.background = bg;
    return W.stats(W.px);
  };
  // Every measured pose must carry the fixture pool a REAL Alt+S still would place there, not the
  // one left over from the pose staging happened at. tools.js's still branch selects by camera
  // frustum, so the pool is pose-dependent by construction; measuring five poses against one
  // stale selection is measuring a scene that never exists. Cost is a shader recompile whenever
  // the light COUNT changes (§NIGHT_BAKE_POOL) — paid deliberately, and the count is logged.
  W.poseAndPool = (p, t, fovDeg) => { W.pose(p, t, fovDeg); return W.refreshNightPool(); };
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
      // §SFR_GROUP_RESTORE (U-11, 2026-09-02) — THIS WAS A REAL INSTRUMENT BUG AND IT MANUFACTURED
      // A PUBLISHED FINDING. The previous form captured the restore map ONCE, on first use:
      //     if (!W._plI) W._plI = new Map(ls.map(l => [l.uuid, l.intensity]));
      //     ls.forEach(l => { const v = W._plI.get(l.uuid);
      //                       l.intensity = on ? (v === undefined ? l.intensity : v) : 0; });
      // First use is the plainNav decomposition, where there are ZERO point lights (night mode is
      // off), so the map was captured EMPTY and never rebuilt. At Alt+S the 216 staged fixture
      // lights are all absent from it, so `off` set every one to 0 and `on` restored
      // `l.intensity = l.intensity` = 0. From the first pl toggle onward the fixture pool was dark
      // for the REST OF THE RUN — which is where "pl = 0.00000 on the away facade in every run"
      // and §SFR_INTERIOR_DECOMP's "pl=0.00000, the room is left on the non-directional fill
      // alone" came from. Both were ARTEFACTS of this line, not properties of the renderer, and
      // the closure check could not catch it because the all-on reference render for the SECOND
      // wall side was itself taken after the lights had been zeroed (0 - 0 = 0, closure 1.000).
      // Corrected form: capture the CURRENT value at the moment of switching off, restore exactly
      // that. Robust to a pool whose membership changes between calls, which this one does.
      const ls = W.pointLights();
      if (!W._plI) W._plI = new Map();
      if (!on) ls.forEach(l => { W._plI.set(l.uuid, l.intensity); l.intensity = 0; });
      else ls.forEach(l => { const v = W._plI.get(l.uuid); if (v !== undefined) l.intensity = v; });
    } else if (g === 'emissive') {
      // Night-mode fixture/window GLOW is emissive GEOMETRY, not a light — it is invisible to a
      // light-only decomposition. The first interior decomposition closed at 0.441 with it missing,
      // which is the witness saying it could not account for 56% of the light. Traverse the whole
      // scene, not just _matCache, because the glow quads are their own meshes.
      // Same §SFR_GROUP_RESTORE correction: the set is re-scanned at every switch-off rather than
      // cached from the first call. A._applyNightGlowToMatCache() CREATES the luminaire/window glow
      // during Alt+S staging, so a set captured at plainNav does not contain the very materials
      // this group exists to measure — which is why `emissive` read 0.00055 and why the Clinic
      // interior decomposition could only account for 44.7% of its own frame.
      if (!on) {
        W._emis = [];
        A.scene.traverse(o => {
          const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
          ms.forEach(m => { if (m && m.emissive && m.emissiveIntensity !== undefined) W._emis.push({ m, i: m.emissiveIntensity }); });
        });
        W._emis.forEach(e => { e.m.emissiveIntensity = 0; e.m.needsUpdate = true; });
      } else if (W._emis) {
        W._emis.forEach(e => { e.m.emissiveIntensity = e.i; e.m.needsUpdate = true; });
      }
    } else if (g === 'env') {
      // Same correction. A._matCache grows as geometry streams and as staging adds materials, so a
      // map captured once cannot restore a material created later — it would leave it at 0.
      const mats = Object.values(A._matCache);
      if (!W._envI) W._envI = new Map();
      if (!on) mats.forEach(m => { if (typeof m.envMapIntensity !== 'number') return;
        W._envI.set(m.uuid, m.envMapIntensity); m.envMapIntensity = 0; m.needsUpdate = true; });
      else mats.forEach(m => { const v = W._envI.get(m.uuid);
        if (v !== undefined) { m.envMapIntensity = v; m.needsUpdate = true; } });
      if (!on) { if (W._sceneEnv === undefined) W._sceneEnv = A.scene.environment || null; A.scene.environment = null; }
      else A.scene.environment = W._sceneEnv === undefined ? A.scene.environment : W._sceneEnv;
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
  // §SFR_MCURVE (U-11, 2026-09-02) — the fixture pool must be REPOPULATED AT THE MEASUREMENT POSE.
  // The first sweep did not, and printed INCONCLUSIVE for a reason that turned out to be an
  // INSTRUMENT artefact rather than a property of the feature: A._nightUpdateLights() is driven off
  // the controls 'change' event (>5 m of travel) and off the still-refine loop, and this witness
  // moves the camera by writing A.camera.position directly — so the pool stayed wherever the last
  // real camera move left it and read 0 intensity at every measured pose. Calling the SHIPPED
  // updater with A._stillRefineActive forced true takes the same §NIGHT_STILL_FRUSTUM branch a real
  // Alt+S still takes at this pose. Nothing is synthesised: the shipped function does the work.
  // §SFR_FROZEN_POOL — an INSTRUMENT cost, measured, and paid with the repo's own remedy.
  // Refreshing the pool at every pose is required (see poseAndPool), but the shipped Alt+S path
  // (tools.js §NIGHT_LIGHT_CHURN_FIX) lets the scene's point-light COUNT move, and a count is a
  // shader DEFINE: every count change recompiles every program in the scene. MEASURED HERE, not
  // assumed: two full runs (Clinic + Hospital, 2026-09-02) each sat >20 min inside the FIRST staged
  // wall pose and produced nothing — the same cost §NIGHT_BAKE_POOL was written for after the first
  // headless CLI bake ("count-stable frames fold in 0.8-1.3 s ... every count-changed frame costs
  // 13-53 s"). So this witness runs the SHIPPED bake-pool path (A._maxqActive) instead of inventing
  // its own: the pool size is frozen at min(200, fixtures), slots are assigned per pose by
  // position/colour/intensity (uniform updates, no recompile), and unused slots ride at intensity 0
  // and contribute nothing. It is also the path the FILM takes — and the film is the artefact the
  // user's complaint is about. The switch is GATED, not asserted: the same pose is read immediately
  // before and after and must agree (§SFR_POOLMODE below).
  W.bakePoolMode = (on) => {
    if (on && A._nightLightByPos && A._nightLightByPos.size) {
      // The bake branch returns before the churn branch's own cleanup, so the churn lights would
      // survive ALONGSIDE the 200 frozen slots and double the scene's light. Dispose them exactly
      // as _nightUpdateLights disposes an unwanted light — same three calls, same order.
      A._nightLightByPos.forEach(l => {
        A.scene.remove(l);
        if (l.shadow && l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; }
        l.dispose();
      });
      A._nightLightByPos.clear();
      A._nightLights = [];
    }
    A._maxqActive = !!on;
    const r = W.refreshNightPool();
    return Object.assign(r, { maxqActive: !!A._maxqActive, bakePoolSlots: (A._nightBakePool || []).length });
  };
  W.refreshNightPool = () => {
    const was = A._stillRefineActive;
    A._stillRefineActive = true;
    if (typeof A._nightUpdateLights === 'function') A._nightUpdateLights();
    A._stillRefineActive = was;
    const ls = W.pointLights();
    W._plBase = new Map(ls.map(l => [l.uuid, l.intensity]));   // rebase: the pool identity changed
    W._plScaleBase = A._nightPLScale || 1;
    return { nightMode: !!A._nightMode, fixtures: (A._nightFixtures || []).length,
      lights: ls.length, sum: +ls.reduce((a, l) => a + l.intensity, 0).toFixed(3),
      max: +ls.reduce((a, l) => Math.max(a, l.intensity), 0).toFixed(3), scale: A._nightPLScale };
  };
  // §SFR_POOL_CENSUS — a DIAGNOSTIC, never a light source. It answers WHY the fixture pool reads
  // what it reads at this pose, so the witness can tell three different failures apart instead of
  // printing one undifferentiated 0: (a) the building has no luminaires at all (total=0 -> VACUOUS),
  // (b) luminaires exist near this standpoint but the shipped still-branch selection is
  // frustum-CONTAINMENT (tools.js §NIGHT_STILL_FRUSTUM) so an overhead fixture just outside the
  // frustum is dropped even though NIGHT_LIGHT_RANGE = 0 means it still illuminates the frame
  // (inFrustum=0 while within5m>0 -> a code defect, not a tuning number), (c) they are selected and
  // lit and still do not move the room. The frustum test below is the SAME test tools.js runs; it is
  // reproduced only to COUNT, and changes nothing.
  W.fixtureCensus = () => {
    const all = (A._nightFixtureWorldPositions ? A._nightFixtureWorldPositions() : []) || [];
    const fr = new T.Frustum().setFromProjectionMatrix(
      new T.Matrix4().multiplyMatrices(A.camera.projectionMatrix, A.camera.matrixWorldInverse));
    const cp = A.camera.position;
    let inF = 0, n5 = 0, n15 = 0, inF5 = 0;
    const v = new T.Vector3();
    for (const p of all) {
      v.set(p.x, p.y, p.z);
      const inside = fr.containsPoint(v), d = v.distanceTo(cp);
      if (inside) inF++;
      if (d <= 5) { n5++; if (inside) inF5++; }
      if (d <= 15) n15++;
    }
    return { total: all.length, inFrustum: inF, within5m: n5, within15m: n15, inFrustumAndWithin5m: inF5,
      nightMode: !!A._nightMode, fixtures: (A._nightFixtures || []).length,
      source: A._nightFixtureSource || '(none)', maxLights: A._nightMaxLights,
      nearFadeFloor: A._nightNearFadeFloor, stillBoost: !!A._nightStillBoost };
  };
  // §NIGHT_LIGHT_MIX already derives a colour temperature per fixture from its own NAME/type
  // (tools.js A.nightLightColor — NIGHT_COOL 0xdce8ff / NIGHT_WARM 0xffdca8 / exit green). Whether
  // that mechanism actually REACHES the staged pool is a measurement, not an assumption: count the
  // distinct colours the live pool carries. One colour = the mix is a no-op here.
  W.poolColorCensus = () => {
    const c = {};
    W.pointLights().forEach(l => { const h = '#' + l.color.getHexString(); c[h] = (c[h] || 0) + 1; });
    const ds = W.pointLights().map(l => l.decay);
    return { distinct: Object.keys(c).length, colors: c,
      decay: ds.length ? Math.min(...ds) + '..' + Math.max(...ds) : 'n/a',
      distance: W.pointLights().map(l => l.distance)[0] };
  };
  // Option F — A._nightNearFadeFloorStill, the constant tools.js already defines for exactly this
  // ("still: no proximity penalty at all", tools.js:1089) and which MEASURES as never reaching an
  // Alt+S still: §SFR_POOL reports nearFadeFloor 0.3, the NAVIGATION value. effects.js's
  // §NIGHT_STILL_LIGHTS block (:4918) is guarded on `A._nightLights && A._nightLights.length`, but
  // `_applyPhotoStaging()` — the call that turns night mode on and BUILDS those lights — does not
  // run until :4945. So on the normal path (Alt+S from a session that was not already in Night
  // Mode) the guard is false, the block is skipped, and the fixture pool is built at the nav floor.
  // §NIGHT_NEAR_FADE's own words for that floor: "exactly backwards for the complaint now being
  // made: standing under a fixture gives the WEAKEST light in the scene". This probe sets the
  // floor to the value the repo already chose for a still and re-runs the SHIPPED updater.
  W.setNearFadeFloor = (f) => {
    if (W._nffBase === undefined) W._nffBase = A._nightNearFadeFloor;
    // HARD GUARD, added after the first run silently measured a BROKEN state: an undefined/null f
    // sails through `f < 0` and lands in A._nightNearFadeFloor, where the shipped intensity formula
    // `floor + (1 - floor) * fade` turns it into 0-or-NaN — which DARKENS the near field instead of
    // lifting it, and (because the pool is rebuilt from that value) poisons every probe that runs
    // after it. That is exactly what happened: on both buildings the four option rows downstream of
    // this probe reported byte-identical retP25/retP90/retP10, the signature of a dead pool. Refuse
    // rather than measure.
    if (f >= 0 && !(typeof f === 'number' && isFinite(f) && f <= 1))
      return { ok: false, why: 'non-finite or out-of-range floor: ' + String(f), applied: A._nightNearFadeFloor };
    A._nightNearFadeFloor = (f < 0) ? W._nffBase : f;
    const r = W.refreshNightPool();
    return Object.assign(r, { ok: true, applied: A._nightNearFadeFloor, navValue: W._nffBase,
      shippedStillConstant: A._nightNearFadeFloorStill });
  };
  // Option B — physically-correct inverse-square falloff. tools.js sets NIGHT_LIGHT_DECAY = 1.0
  // deliberately ("reaches further than physics"); decay is a per-light property that
  // _nightUpdateLights never rewrites (only intensity is recomputed), so this is a clean probe.
  W.setPLDecay = (d) => {
    // PER-LIGHT base. The first version cached ONE scalar from ls[0] — which is a city-prop light
    // (decay 2, see the §SFR_POOL colour census "decay":"1..2") — so restoring set every FIXTURE
    // light (decay 1.0) to 2 permanently, dimming the whole far field for the rest of the run.
    const ls = W.pointLights();
    if (!W._decayBase) W._decayBase = new Map();
    ls.forEach(l => { if (!W._decayBase.has(l.uuid)) W._decayBase.set(l.uuid, l.decay); });
    ls.forEach(l => { const b = W._decayBase.get(l.uuid); l.decay = d < 0 ? (b === undefined ? l.decay : b) : d; });
    const ds = ls.map(l => l.decay);
    return { n: ls.length, decayRange: Math.min(...ds) + '..' + Math.max(...ds) };
  };
  // Option D — the fixture's own geometry glowing. A._applyNightGlowToMatCache() already sets
  // emissive 0xffe4b5 @ 0.3 on luminaire materials and 0xfff8ec @ 0.55 on window glass; this scales
  // exactly that shipped set, so g=1 is the shipped state and the sweep's first sample re-proves it.
  W.setEmissiveGain = (g) => {
    if (!W._emisBase) {
      W._emisBase = [];
      A.scene.traverse(o => {
        const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        ms.forEach(m => { if (m && m.emissive && m.emissiveIntensity > 0) W._emisBase.push({ m, i: m.emissiveIntensity }); });
      });
    }
    W._emisBase.forEach(e => { e.m.emissiveIntensity = e.i * g; e.m.needsUpdate = true; });
    return { n: W._emisBase.length, gain: g,
      glowMats: (A._nightGlowMats || []).length,
      sum: +W._emisBase.reduce((a, e) => a + e.m.emissiveIntensity, 0).toFixed(3) };
  };
  // The §SFR_CLAMP fallback lever, as a REAL render rather than an interpolation: put the matte set
  // back on the staged HDRI at a fraction s of its staged envMapIntensity. s=1 reproduces the
  // measured RED state exactly (a built-in cross-check); s<0 restores the shipped GREEN (sky env).
  // envMapIntensity is NOT touched by the shipped fix — only the MAP is — so the saved base is the
  // staged matte intensity in both states and no compounding is possible across calls.
  W.setMatteHdriFill = (s) => {
    const ms = Object.values(A._matCache).filter(m => m && 'envMap' in m &&
      typeof m.envMapIntensity === 'number' && !(A._isPhotoGlossyMat && A._isPhotoGlossyMat(m)));
    if (!W._hBase) W._hBase = new Map(ms.map(m => [m.uuid, m.envMapIntensity]));
    let n = 0;
    ms.forEach(m => { const b = W._hBase.get(m.uuid); if (b === undefined) return;
      if (s < 0) { if (W.skyEnv) m.envMap = W.skyEnv; m.envMapIntensity = b; }
      else { if (W.hdriEnv) m.envMap = W.hdriEnv; m.envMapIntensity = b * s; }
      m.needsUpdate = true; n++; });
    return { n, s, map: s < 0 ? 'sky(shipped GREEN)' : 'hdri' };
  };
  // Every grid sample records this alongside its luminance. A sample whose pool total does not
  // match the pose's own baseline (outside a deliberate PL scaling) was taken against a scene the
  // witness had damaged, and must be reported INCONCLUSIVE rather than scored.
  W.poolSum = () => {
    const ls = W.pointLights();
    return { lights: ls.length, live: ls.filter(l => l.intensity > 0).length,
      sum: +ls.reduce((a, l) => a + l.intensity, 0).toFixed(3),
      floor: A._nightNearFadeFloor, scale: A._nightPLScale,
      decayRange: ls.length ? Math.min(...ls.map(l => l.decay)) + '..' + Math.max(...ls.map(l => l.decay)) : 'n/a' };
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
    for (let i = 0; i < 900 && !ready; i++) {   // 15 min: Hospital's split DB under software GL,
                                                // and two witness runs can share one machine
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
        const pool = await page.evaluate(({ o }) => window.__sfr.poseAndPool(o.p, o.t, o.fov), { o });
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
          GROUPS.map(g => g + '=' + c[g].toFixed(5)).join(' ') + ` closure=${out[side].closure.toFixed(3)} ` +
          `poolAtThisPose=${pool.lights}@${pool.sum}`);
      }
      const sep = out.sun.mean > 0 ? out.away.mean / out.sun.mean : -1;
      S(`§SFR_SEPARATION building=${B} state=${label} awayFacing/sunFacing=${sep.toFixed(4)}`);
      return { out, sep };
    }
    async function wallMeans(label) {   // cheap version: no group decomposition
      const m = {};
      for (const side of ['sun', 'away']) {
        const o = chosen[side];
        await page.evaluate(({ o }) => window.__sfr.poseAndPool(o.p, o.t, o.fov), { o });
        m[side] = (await page.evaluate(() => window.__sfr.renderLinear())).mean;
      }
      const sep = m.sun > 0 ? m.away / m.sun : -1;
      S(`§SFR_SEPARATION building=${B} state=${label} awayFacing/sunFacing=${sep.toFixed(4)} (away=${m.away.toFixed(5)} sun=${m.sun.toFixed(5)})`);
      return { m, sep };
    }
    async function frameGuard(label) {
      const r = {};
      for (const [n, o] of [['extSun', chosen.sun], ['extAway', chosen.away]]) {
        await page.evaluate(({ o }) => window.__sfr.poseAndPool(o.p, o.t, o.fov), { o });
        r[n] = await page.evaluate(() => window.__sfr.renderFrame());
      }
      for (let i = 0; i < inPoses.length; i++) {
        await page.evaluate(({ o }) => window.__sfr.poseAndPool(o.p, o.t, 0), { o: inPoses[i] });
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
    // POOL-MODE CONTROL (§SFR_FROZEN_POOL) — taken WITHOUT moving the camera, so the pool's
    // membership cannot change and only the storage mode does. If the two readings disagree, the
    // instrument change is not neutral and nothing measured after it is usable.
    // ORDER MATTERS, and the first attempt got it wrong: reading BEFORE the churn-path refresh
    // compared (stale pool) against (fresh pool + frozen mode) and reported relDrift 0.179 — a
    // confounded control, not a real disagreement. Refresh on the churn path FIRST, read, then
    // switch mode and read again: now only the storage mode differs.
    const churnPool = await page.evaluate(() => window.__sfr.refreshNightPool());
    const churnRead = await page.evaluate(() => window.__sfr.renderLinear());
    const bakePool = await page.evaluate(() => window.__sfr.bakePoolMode(true));
    const bakeRead = await page.evaluate(() => window.__sfr.renderLinear());
    const pmDrift = churnRead.mean > 0 ? Math.abs(bakeRead.mean - churnRead.mean) / churnRead.mean : 1;
    S(`§SFR_POOLMODE building=${B} churnPath{mean=${churnRead.mean.toFixed(5)} lights=${churnPool.lights} sum=${churnPool.sum}} -> ` +
      `frozenBakePool{mean=${bakeRead.mean.toFixed(5)} slots=${bakePool.bakePoolSlots} lights=${bakePool.lights} sum=${bakePool.sum}} ` +
      `relDrift=${pmDrift.toFixed(5)} (same pose, camera untouched — only the pool's storage mode changed)`);
    verdict(pmDrift < 0.01, `${B} POOL-MODE CONTROL: freezing the point-light count does not change what is measured`,
      `relDrift=${pmDrift.toFixed(5)}`);
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
        S(`§SFR_CONFLICT building=${B} the away-wall fix costs interior light: retention mean=${t3mean.toFixed(3)} p25=${t3p25.toFixed(3)} below floors ${T3_MEAN}/${T3_P25}. The middle point the user asked for is solved from a measured curve in §SFR_MCURVE below (measured facade contribution of the fixture lever at this pose: pl=${alt.out.away.c.pl.toFixed(5)} of ${alt.out.away.mean.toFixed(5)})`);
        conflicts++;
        S(`  DECLARED-CONFLICT ${B} T3 interior floor NOT held by part 1 alone — mean=${t3mean.toFixed(3)} p25=${t3p25.toFixed(3)}. ` +
          `This is reported, not scored: the fixture route (the user's own question — light the room from its own fixtures, not from unshadowed fill) is measured in §SFR_FIXTURE_FIRST / §SFR_FIXTURE_VERDICT below, and the fallback m-lever in §SFR_MSOLVE.`);
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

      // ---- 5c. §SFR_FIXTURE_FIRST + §SFR_LIVELY (U-11, re-scoped by the user 2026-09-02) --------
      // USER Q1: "Will room lighting be better if it has no Sun?" — i.e. light the room from its
      //   OWN fixtures instead of from sun/environment fill. That is the architecturally correct
      //   answer and it is measured FIRST, at m=0 (the shipped GREEN env state, byte-untouched):
      //   fixture point lights are DIRECTIONAL and distance-attenuated, while the HDRI fill the
      //   m-lever would add back is non-directional and, in three.js, NOT shadow-map-occluded —
      //   the exact property that caused the defect PR #1622 fixed. The m curve is the FALLBACK.
      // USER Q2: "it should be LIVELY. So far it has never been, though lighting has been BRIGHT."
      //   So mean luminance is NOT the objective — it is the metric that was already being met
      //   while the room read dead. §WALL_SIDE_AND_LIGHT_FLOOR's T3 floors (0.70/0.55) are kept as
      //   a FLOOR TO CLEAR; the OBJECTIVE is the shape of the field: cv, p90/p10, topShare, tileCV
      //   (spatial falloff), wcStd (warm/cool chromatic separation). Every one of them is reported
      //   as a RATIO against the shipped state, so nothing here needs an invented "good" threshold.
      //
      // STEP 1 — the instrument defect that made the previous sweep print INCONCLUSIVE is FIXED,
      // not worked around. A._nightUpdateLights() runs off the controls 'change' event and off the
      // still-refine loop; this witness poses the camera by writing A.camera.position directly, so
      // the pool stayed wherever the last real camera move left it. refreshNightPool() calls the
      // SHIPPED updater with A._stillRefineActive forced true — the same §NIGHT_STILL_FRUSTUM
      // branch a real Alt+S still takes at this pose. Nothing is synthesised.
      // Pose-major on purpose: repopulating the pool changes the scene's point-light COUNT, which
      // is a shader DEFINE (§NIGHT_BAKE_POOL) — one recompile per pose, none per sample.
      const PL_F = [1, 2, 4];      // x A._nightPLScaleStill (0.5) -> 0.5 / 1.0 / 2.0. Only f<=2 is
                                   // shippable without inventing a constant: 1.0 is A._nightPLScale's
                                   // own nav-tuned default, the value §STAGED_PL_CUT cut FROM.
      const HDRI_S = [0.25, 0.5, 1.0];   // the FALLBACK m-lever, measured not interpolated
      // Read the still floor OUT OF THE APP rather than typing 1.0 here: if tools.js ever retunes
      // A._nightNearFadeFloorStill, this witness follows it instead of silently testing a stale value.
      const A_STILL_FLOOR = await page.evaluate(() => window.APP._nightNearFadeFloorStill);
      const gPoses = [{ k: 'extSun', o: chosen.sun, fov: chosen.sun.fov, wall: true },
                      { k: 'extAway', o: chosen.away, fov: chosen.away.fov, wall: true }]
        .concat(inPoses.map((p, i) => ({ k: 'interior' + i, o: p, fov: 0, wall: false })));
      const grid = {};
      for (const P of gPoses) {
        await page.evaluate(({ o, fov }) => window.__sfr.pose(o.p, o.t, fov), { o: P.o, fov: P.fov });
        const cen = await page.evaluate(() => window.__sfr.fixtureCensus());
        const pool = await page.evaluate(() => window.__sfr.refreshNightPool());
        const col = await page.evaluate(() => window.__sfr.poolColorCensus());
        S(`§SFR_POOL building=${B} pose=${P.k} census=${JSON.stringify(cen)} pool=${JSON.stringify(pool)} colours=${JSON.stringify(col)}`);
        if (cen.total > 0 && cen.within5m > 0 && cen.inFrustum === 0)
          S(`§SFR_POOL_STARVED building=${B} pose=${P.k} — ${cen.within5m} luminaire(s) within 5 m of this standpoint and NOT ONE is inside the camera frustum, so the shipped still-branch selection (tools.js §NIGHT_STILL_FRUSTUM, containment) places no light here even though NIGHT_LIGHT_RANGE = 0 means every one of them would illuminate this frame. That is a selection defect, not a brightness number.`);
        // wall poses read renderLinear (the same call every separation number in this file came
        // from); interior poses read renderFrame (the same call the T3 retention floors came from,
        // now also carrying the §SFR_LIVELY shape statistics).
        // Every sample carries the pool state it was taken against (§SFR_POOL_INTEGRITY): a
        // luminance read whose fixture pool was dead is not a measurement of the lever, it is a
        // measurement of the witness's own damage. The first run had exactly that and scored it.
        const readS = async () => {
          const r = P.wall ? await page.evaluate(() => window.__sfr.renderLinear())
                           : await page.evaluate(() => window.__sfr.renderFrame());
          r.pool = await page.evaluate(() => window.__sfr.poolSum());
          return r;
        };
        const rec = { pool, cen, col, pl: {}, hdri: {}, opt: {} };
        for (const f of PL_F) {
          const st = await page.evaluate(({ f }) => window.__sfr.setPLScale(f), { f });
          rec.pl[f] = Object.assign(await readS(), { plSum: st.sum });
        }
        await page.evaluate(() => window.__sfr.setPLScale(1));
        // The FALLBACK m-lever is measured HERE, before any option probe, so it can never be
        // downstream of one. (In the first run it was last, and a broken probe upstream silently
        // moved its whole curve.)
        for (const s of HDRI_S) {
          const st = await page.evaluate(({ s }) => window.__sfr.setMatteHdriFill(s), { s });
          rec.hdri[s] = Object.assign(await readS(), { nMat: st.n });
        }
        await page.evaluate(() => window.__sfr.setMatteHdriFill(-1));
        // ---- the cheap liveliness options, each ONE render, each a probe of a mechanism that
        // ALREADY EXISTS in the repo (no new constant is introduced by measuring it) ----
        // F runs at EVERY pose, walls included: its whole claim is that it lifts light INSIDE a
        // room (every fixture there is within the 15 m fade window) and leaves a facade 12 m from
        // the building untouched (its fixtures are already past the window). That is a two-sided
        // claim, so both sides are measured.
        {
          const nf = await page.evaluate(({ f }) => window.__sfr.setNearFadeFloor(f), { f: A_STILL_FLOOR });
          rec.opt.nearFadeStill = Object.assign(await readS(), { probe: nf });
          await page.evaluate(() => window.__sfr.setNearFadeFloor(-1));
        }
        if (!P.wall) {
          const dec = await page.evaluate(() => window.__sfr.setPLDecay(2));
          rec.opt.decay2 = Object.assign(await readS(), { probe: dec });
          await page.evaluate(() => window.__sfr.setPLDecay(-1));
          const em = await page.evaluate(() => window.__sfr.setEmissiveGain(3));
          rec.opt.emissive3 = Object.assign(await readS(), { probe: em });
          await page.evaluate(() => window.__sfr.setEmissiveGain(1));
          // A+B together at the shippable PL ceiling — the combination, not two solo readings
          await page.evaluate(({ f }) => window.__sfr.setPLScale(f), { f: 2 });
          await page.evaluate(() => window.__sfr.setPLDecay(2));
          rec.opt.pl2_decay2 = await readS();
          await page.evaluate(() => window.__sfr.setPLDecay(-1));
          await page.evaluate(() => window.__sfr.setPLScale(1));
        }
        grid[P.k] = rec;
        const shape = r => `mean=${r.mean.toFixed(5)}` + (P.wall ? '' :
          ` cv=${r.cv.toFixed(3)} p90p10=${r.p90p10.toFixed(2)} topShare=${r.topShare.toFixed(3)} tileCV=${r.tileCV.toFixed(3)} wcStd=${r.wcStd.toFixed(4)}`) +
          ` pool[live=${r.pool.live} sum=${r.pool.sum} floor=${r.pool.floor} scale=${r.pool.scale} decay=${r.pool.decayRange}]`;
        S(`§SFR_GRID building=${B} pose=${P.k} ` +
          PL_F.map(f => `pl_x${f}{${shape(rec.pl[f])}}`).join(' ') +
          ' ' + HDRI_S.map(s => `hdri_s${s}{${shape(rec.hdri[s])}}`).join(' ') +
          ` nearFadeStill{${shape(rec.opt.nearFadeStill)} probe=${JSON.stringify(rec.opt.nearFadeStill.probe)}}` +
          (P.wall ? '' : ` decay2{${shape(rec.opt.decay2)}} emissive_x3{${shape(rec.opt.emissive3)}} pl2+decay2{${shape(rec.opt.pl2_decay2)}}`) +
          ` plIntensitySum ${rec.pl[PL_F[0]].plSum}->${rec.pl[PL_F[PL_F.length - 1]].plSum}`);
      }
      const avg = (pick, field) => inKeys.reduce((a, k) => a + pick(grid[k])[field], 0) / inKeys.length;
      const sepAt = pick => pick(grid.extSun).mean > 0 ? pick(grid.extAway).mean / pick(grid.extSun).mean : -1;
      const SHAPE = ['cv', 'p90p10', 'topShare', 'tileCV', 'wcStd'];
      // §SFR_REGISTER — the REAL-BAKE A/B of the user's own exported films (Clinic 31 Aug vs 2 Sep,
      // TerminalMerged 27 Aug vs 2 Sep, ffprobe signalstats over 19-26 sampled frames each) says the
      // defect is NOT "the shadows went wrong": the BRIGHT register drained. Brightest fifth
      // 140.7 -> 79.2 (-44%) against the darkest fifth 50.7 -> 35.4 (-30%), with peak barely moved
      // (149 -> 137) — the signature of a broad fill removed with nothing put back. So the upper and
      // lower registers are retained SEPARATELY here; a mean alone cannot tell those two apart.
      const rP90 = inKeys.reduce((a, k) => a + beforeFrame[k].p90, 0) / inKeys.length;
      const rP10 = inKeys.reduce((a, k) => a + beforeFrame[k].p10, 0) / inKeys.length;
      const row = (label, pick, wallPick) => {
        const r = { label, retMean: avg(pick, 'mean') / rm, retP25: avg(pick, 'p25') / rp,
          retP90: rP90 > 0 ? avg(pick, 'p90') / rP90 : -1, retP10: rP10 > 0 ? avg(pick, 'p10') / rP10 : -1,
          sep: wallPick === false ? null : sepAt(wallPick || pick),
          // §SFR_POOL_INTEGRITY — the smallest number of lights actually carrying intensity over the
          // standpoints this row averages. 0 means the row was measured against a scene with no
          // fixture light at all, which is a witness fault, not a property of the lever.
          poolLive: Math.min.apply(null, inKeys.map(k => pick(grid[k]).pool.live)),
          poolSum: Math.min.apply(null, inKeys.map(k => +pick(grid[k]).pool.sum)) };
        SHAPE.forEach(f => { r[f] = avg(pick, f); });
        return r;
      };
      // BASELINE RE-PROOF — (pl x1, env sky) IS the shipped GREEN state, so it must reproduce the
      // separation already measured above. It is measured with the fixture pool REPOPULATED, which
      // the earlier reading was not: any gap between the two IS the fixture pool's own effect on
      // the facade, and is reported rather than assumed away.
      const base = row('m0_shipped', r => r.pl[1]);
      S(`§SFR_MBASE building=${B} sep_shipped_earlier=${alt.sep.toFixed(5)} sep_at_m0_withPoolLive=${base.sep.toFixed(5)} ` +
        `delta=${Math.abs(base.sep - alt.sep).toFixed(5)} controlDrift=${drift.toFixed(5)} ` +
        `interior_retention_at_m0 mean=${base.retMean.toFixed(3)} p25=${base.retP25.toFixed(3)} ` +
        `upperRegister_p90=${base.retP90.toFixed(3)} lowerRegister_p10=${base.retP10.toFixed(3)} ` +
        SHAPE.map(f => `${f}=${base[f].toFixed(4)}`).join(' '));
      verdict(Math.abs(base.sep - alt.sep) < 0.02, `${B} m=0 re-proves the shipped GREEN separation with the fixture pool live`,
        `${base.sep.toFixed(4)} vs ${alt.sep.toFixed(4)}`);
      // ---- STEP 1's own gate: can this sweep judge itself at all? -------------------------------
      const poolLights = gPoses.map(P => grid[P.k].pool.lights);
      const poolSum = gPoses.map(P => +grid[P.k].pool.sum);
      const totalFix = grid[gPoses[0].k].cen.total;
      const plVacuous = poolLights.every(n => n === 0) || poolSum.every(s => s === 0);
      const plMoved = inKeys.some(k => Math.abs(grid[k].pl[PL_F[PL_F.length - 1]].plSum - grid[k].pl[PL_F[0]].plSum) > 1e-3);
      if (totalFix === 0) {
        S(`§SFR_FIXTURE_FIRST building=${B} VACUOUS — the building carries 0 luminaires (${JSON.stringify(grid[gPoses[0].k].cen)}); there is no fixture route to judge here.`);
        verdict(false, `${B} INCONCLUSIVE — no luminaire population to judge the fixture route on`, `total=0`);
      } else if (plVacuous || !plMoved) {
        S(`§SFR_FIXTURE_FIRST building=${B} INCONCLUSIVE — the staged fixture pool never carried intensity at these poses ` +
          `(lights=${poolLights.join('/')} sums=${poolSum.join('/')} plMoved=${plMoved}); nothing was judged, so NO claim is made about the fixture route. ` +
          `See §SFR_POOL / §SFR_POOL_STARVED above for which of the three failures this is.`);
        verdict(false, `${B} INCONCLUSIVE — the fixture sweep could not judge itself`, `lights=${poolLights.join('/')}`);
      } else {
        verdict(true, `${B} the fixture pool is LIVE at the measurement poses (step 1's instrument defect is fixed)`,
          `lights=${poolLights.join('/')} intensitySum=${poolSum.join('/')} distinctColours=${grid[inKeys[0]].col.distinct}`);
      }
      // ---- STEP 2: do the fixtures alone reach the floors at m=0, and do they raise LIVELINESS? --
      const plRows = PL_F.map(f => row(`PL_x${f}`, r => r.pl[f]));
      const hdriRows = HDRI_S.map(s => row(`HDRI_s${s}`, r => r.hdri[s]));
      // The option probes are applied at the INTERIOR standpoints only, so they carry no facade
      // measurement and print separation=n/a rather than repeating m=0's number as if it were
      // theirs. (Both probes can only ever REDUCE the facade's fixture term, which §SFR_WALL
      // already measures at pl=0.00000 there — so there is no facade risk to hide, only no data.)
      const optRows = [row('OPT_F_nearFadeStill', r => r.opt.nearFadeStill, r => r.opt.nearFadeStill)]
        .concat(grid[inKeys[0]].opt.decay2 ? [
          row('OPT_B_decay2', r => r.opt.decay2, false),
          row('OPT_D_emissive_x3', r => r.opt.emissive3, false),
          row('OPT_A+B_pl_x2_decay2', r => r.opt.pl2_decay2, false)] : []);
      for (const r of plRows.concat(optRows, hdriRows))
        S(`§SFR_MCURVE building=${B} lever=${r.label}${r.poolLive === 0 ? ' [INCONCLUSIVE — fixture pool carried no intensity for this sample]' : ''} ` +
          `retMean=${r.retMean.toFixed(3)} retP25=${r.retP25.toFixed(3)} ` +
          `retP90=${r.retP90.toFixed(3)} retP10=${r.retP10.toFixed(3)} ` +
          `separation=${r.sep === null ? 'n/a' : r.sep.toFixed(4)} ` +
          SHAPE.map(f => `${f}=${r[f].toFixed(4)}(x${(r[f] / (base[f] || 1e-9)).toFixed(2)})`).join(' ') +
          ` (floors ${T3_MEAN}/${T3_P25}, plainNav sep ${target.toFixed(4)}, shipped sep ${base.sep.toFixed(4)})`);
      const plTop = plRows[plRows.length - 1];
      const plShippable = plRows[1];        // f=2 -> _nightPLScaleStill 1.0, the pre-cut repo value
      const plFacadeCost = Math.abs(plTop.sep - plRows[0].sep);
      verdict(plFacadeCost < 0.01, `${B} the fixture lever does NOT disturb the wall separation (the facade is free)`,
        `separation ${plRows[0].sep.toFixed(4)} -> ${plTop.sep.toFixed(4)} across x1..x${PL_F[PL_F.length - 1]}, drift=${plFacadeCost.toFixed(5)}`);
      const plClears = plTop.retMean >= T3_MEAN && plTop.retP25 >= T3_P25;
      // TWO-SIDED, and it is the whole point of this section. PR #1622 already RAISED contrast as a
      // side effect of removing the unoccluded HDRI — measured on the user's own films, Clinic CV
      // 0.344 -> 0.430 (+25%), spread 42.9 -> 59.1 (+38%), on two buildings. So the baseline is not
      // "dead", it is "more alive but too dark", and a lever that buys the mean back by flattening
      // the field would UNDO #1622. Every option is therefore judged on BOTH sides against the
      // SHIPPED m=0 state: it must not lower cv and it must not lower tileCV. `keepsShape` is that
      // gate; a lever can only be called a win if it clears the floors AND keeps or raises shape.
      const SHAPE_TOL = 0.98;   // 2% headroom for render-to-render noise; the RED CONTROL measures
                                // the instrument's actual drift and is asserted separately.
      const keepsShape = r => r.cv >= base.cv * SHAPE_TOL && r.tileCV >= base.tileCV * SHAPE_TOL;
      const plLively = keepsShape(plTop) && (plTop.cv > base.cv || plTop.tileCV > base.tileCV);
      S(`§SFR_FIXTURE_VERDICT building=${B} atMax=x${PL_F[PL_F.length - 1]} retMean=${plTop.retMean.toFixed(3)}${plTop.retMean >= T3_MEAN ? '(floor MET)' : '(floor MISSED)'} ` +
        `retP25=${plTop.retP25.toFixed(3)}${plTop.retP25 >= T3_P25 ? '(floor MET)' : '(floor MISSED)'} ` +
        `atShippableCeiling(_nightPLScaleStill=1.0) retMean=${plShippable.retMean.toFixed(3)} retP25=${plShippable.retP25.toFixed(3)} ` +
        `LIVELINESS cv x${(plTop.cv / (base.cv || 1e-9)).toFixed(2)} tileCV x${(plTop.tileCV / (base.tileCV || 1e-9)).toFixed(2)} ` +
        `p90p10 x${(plTop.p90p10 / (base.p90p10 || 1e-9)).toFixed(2)} wcStd x${(plTop.wcStd / (base.wcStd || 1e-9)).toFixed(2)} ` +
        `upperRegister_p90 ${base.retP90.toFixed(3)} -> ${plTop.retP90.toFixed(3)} ` +
        `-> floors ${plClears ? 'REACHED' : 'NOT reached'} by fixtures alone at m=0; field shape ${plLively ? 'kept/raised' : 'FLATTENED — this lever would undo #1622'}`);
      for (const r of plRows.slice(1).concat(optRows, hdriRows)) {
        if (r.poolLive === 0) {
          S(`§SFR_TWOSIDED building=${B} option=${r.label} INCONCLUSIVE — measured against a dead fixture pool ` +
            `(poolLive=0, poolSum=${r.poolSum}); nothing was judged and no verdict is given for this lever.`);
          continue;
        }
        S(`§SFR_TWOSIDED building=${B} option=${r.label} floors=${r.retMean >= T3_MEAN && r.retP25 >= T3_P25 ? 'CLEARED' : 'missed'} ` +
          `shape=${keepsShape(r) ? 'kept' : 'FLATTENED'} cv=${r.cv.toFixed(4)}vs${base.cv.toFixed(4)} tileCV=${r.tileCV.toFixed(4)}vs${base.tileCV.toFixed(4)} ` +
          `upperRegister=${r.retP90.toFixed(3)} lowerRegister=${r.retP10.toFixed(3)} ` +
          `VERDICT=${(r.retMean >= T3_MEAN && r.retP25 >= T3_P25 && keepsShape(r)) ? 'WIN' : (keepsShape(r) ? 'shape kept, floors missed' : 'REJECT — buys brightness by flattening the field')}`);
      }
      verdict(keepsShape(base), `${B} the two-sided gate is anchored on the shipped state itself`, `cv=${base.cv.toFixed(4)} tileCV=${base.tileCV.toFixed(4)}`);
      // ---- the LIVELINESS-PER-COST ranking the user asked for. Cost is stated as what the option
      // costs to SHIP (parameter vs new mechanism), and gain as the measured shape ratios — both
      // printed, never averaged into a single invented score.
      for (const r of plRows.slice(1).concat(optRows))
        S(`§SFR_LIVELY building=${B} option=${r.label} dMean=${(r.retMean - base.retMean).toFixed(3)} ` +
          `dCV=${(r.cv - base.cv).toFixed(4)} dTileCV=${(r.tileCV - base.tileCV).toFixed(4)} ` +
          `dP90P10=${(r.p90p10 - base.p90p10).toFixed(3)} dWcStd=${(r.wcStd - base.wcStd).toFixed(4)} ` +
          `dSeparation=${r.sep === null ? 'n/a' : (r.sep - base.sep).toFixed(4)} ` +
          `brightnessNeutralLiveliness=${base.cv > 0 ? ((r.cv / base.cv) / Math.max(1e-9, r.retMean / base.retMean)).toFixed(3) : 'n/a'} ` +
          `(the last figure is the shape gain PER unit of brightness gain — an option that only adds light scores 1.0)`);
      // ---- STEP 3: the FALLBACK, only meaningful if the fixture route missed the floors ---------
      const hdriSolve = hdriRows.filter(r => r.retMean >= T3_MEAN && r.retP25 >= T3_P25)[0] || null;
      S(`§SFR_MSOLVE building=${B} fixturesReachFloors=${plClears} | FALLBACK m-lever (matte back on the staged HDRI at fraction s): ` +
        hdriRows.map(r => `${r.label}{retMean=${r.retMean.toFixed(3)} retP25=${r.retP25.toFixed(3)} sep=${r.sep.toFixed(4)} cv=${r.cv.toFixed(3)} tileCV=${r.tileCV.toFixed(3)}}`).join(' ') +
        ` | smallest s that clears both floors = ${hdriSolve ? hdriSolve.label : 'none of the sampled s'} ` +
        `| s=1.0 must reproduce the measured RED state: sep_here=${hdriRows[hdriRows.length - 1].sep.toFixed(4)} vs RED=${redSep.toFixed(4)}`);
      verdict(Math.abs(hdriRows[hdriRows.length - 1].sep - redSep) < 0.03,
        `${B} the fallback lever's s=1.0 sample reproduces the measured RED state (the m curve is anchored, not fitted)`,
        `${hdriRows[hdriRows.length - 1].sep.toFixed(4)} vs ${redSep.toFixed(4)}`);
      plSolve = { plClears, plLively, plFacadeCost, base, plRows, hdriRows, optRows,
        totalFixtures: totalFix, poolLights, vacuous: plVacuous || !plMoved };
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
      const decompPool = await page.evaluate(({ o }) => window.__sfr.poseAndPool(o.p, o.t, 0), { o: inPoses[idx] });
      const all = await page.evaluate(() => window.__sfr.renderFrame());
      const c = {};
      for (const g of GROUPS) {
        await page.evaluate(({ g }) => window.__sfr.groupSet(g, false), { g });
        const r = await page.evaluate(() => window.__sfr.renderFrame());
        await page.evaluate(({ g }) => window.__sfr.groupSet(g, true), { g });
        c[g] = all.mean - r[`mean`];
      }
      const sum = GROUPS.reduce((a, g) => a + c[g], 0);
      S(`§SFR_INTERIOR_DECOMP building=${B} standpoint=${inPoses[idx].name} pool=${JSON.stringify(decompPool)} meanLumaLinear=${all.mean.toFixed(5)} ` +
        GROUPS.map(g => g + '=' + c[g].toFixed(5)).join(' ') + ` closure=${(sum / (all.mean || 1)).toFixed(3)} ` +
        `(GREEN state — this is what is left to light an Alt+S interior once the sun is shadow-blocked)`);
      verdict(Math.abs(sum / (all.mean || 1) - 1) < 0.08, `${B} interior decomposition closes on the total`,
        `closure=${(sum / (all.mean || 1)).toFixed(3)}`);
    }

    // ---- 5b. FREEZE CONTROL, taken at the END when the scene has long settled ------------------
    await page.evaluate(({ o }) => window.__sfr.poseAndPool(o.p, o.t, o.fov), { o: chosen.away });
    const frozenRead = await page.evaluate(() => window.__sfr.renderLinear());
    await page.evaluate(() => window.__sfr.unfreeze());
    await page.evaluate(({ o }) => window.__sfr.poseAndPool(o.p, o.t, o.fov), { o: chosen.away });
    const liveRead = await page.evaluate(() => window.__sfr.renderLinear());
    const fzDrift = frozenRead.mean > 0 ? Math.abs(liveRead.mean - frozenRead.mean) / frozenRead.mean : 1;
    S(`§SFR_FREEZE_CONTROL building=${B} frozen=${frozenRead.mean.toFixed(5)} liveShadowMap=${liveRead.mean.toFixed(5)} relDrift=${fzDrift.toFixed(5)}`);
    verdict(fzDrift < 0.005, `${B} FREEZE CONTROL: the frozen shadow map reads the same as a freshly rendered one`,
      `relDrift=${fzDrift.toFixed(5)}`);

    // ---- 6. teardown: staging must leave nothing behind -----------------------------------
    // Hand the shipped churn path back before teardown, so the teardown census judges the real
    // exit path and A._nightBakePool is disposed by tools.js's own §NIGHT_BAKE_POOL teardown.
    await page.evaluate(() => window.__sfr.bakePoolMode(false));
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
      `T3 mean=${r.t3mean.toFixed(3)} p25=${r.t3p25.toFixed(3)} ` +
      (r.plSolve ? (r.plSolve.vacuous ? 'FIXTURES=INCONCLUSIVE ' :
        `fixtures_reach_floors=${r.plSolve.plClears} fixtures_raise_shape=${r.plSolve.plLively} ` +
        `facadeCost=${r.plSolve.plFacadeCost.toFixed(5)} luminaires=${r.plSolve.totalFixtures} `) : '') +
      `envShareOfAwayWall staged=${r.envShareStaged.toFixed(3)} plainNav=${r.envSharePlain.toFixed(3)}`);
  }

  const word = judged === 0 ? 'VACUOUS' : (fails > 0 ? 'FAIL' : (conflicts > 0 ? 'PASS-WITH-DECLARED-CONFLICT' : 'PASS'));
  S(`§SFR_VERDICT ${word} judged=${judged} fails=${fails} declaredConflicts=${conflicts} buildings=${perBuilding.length} t=${((Date.now() - t0) / 1000).toFixed(0)}s`);
  S(`§WITNESS_SUN_FILL_RATIO pass=${judged - fails} fail=${fails} ran=${judged}`);
  if (fails > 0) process.exitCode = 1;
})().catch(e => { S('§SFR_VERDICT INCONCLUSIVE — harness threw: ' + (e.stack || e)); process.exit(1); });
