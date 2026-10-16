// SPIKE — first-party three.js SSGINode + GTAONode (TSL / WebGPURenderer) on REAL bim-ootb geometry.
// Standalone: no import from viewer/*. The geometry decode + BatchedMesh/InstancedMesh build below mirrors
// viewer/scene.js A.blobToGeometry and viewer/streaming.js _flushInstanced (S260/S231 paths) — same DB
// tables, same Y/Z swap, same bucket key (storey|disc|rgba), same LOW_INSTANCE_BATCH_MAX=3 cutoff, same
// addGeometry()+addInstance()+setMatrixAt() sequence, same euler (rotX, rotZ, -rotY).
// Evidence is NUMERIC: render targets are read back with renderer.readRenderTargetPixelsAsync and the
// result is written to window.__spike (the driver prints it). A screenshot is taken by the driver only for
// the human record.
import * as THREE from 'three/webgpu';
import { pass, mrt, output, normalView, diffuseColor, velocity, add, vec3, vec4, packNormalToRGB, unpackRGBToNormal, sample, float } from 'three/tsl';
import { ssgi } from 'three/addons/tsl/display/SSGINode.js';

const Q = new URLSearchParams(location.search);
const DB = Q.get('db') || 'Clinic';
const VIEW = Q.get('view') || 'interior';
const USE_TRAA = Q.get('traa') === '1';
const USE_VELOCITY = Q.get('velocity') !== '0';
const CORE185 = Q.get('core') === '185';
const NO_GI = Q.get('nogi') === '1';   // before/after screenshot pair: nogi=1 -> direct light only, no SSGINode/GTAONode in the shown output
const W = +(Q.get('w') || 1280), H = +(Q.get('h') || 720);
const FRAMES = +(Q.get('frames') || 30);
// PRESENT=1 also renders the final composite to the WebGPU canvas. Off by default: headless Chrome 151 on this box
// fails the canvas swapchain import in Dawn ("Requested allocation size ... smaller than the image requires",
// MemoryServiceImplementationOpaqueFD.cpp:132) under BOTH --use-angle=gl-egl and vulkan; that is a headless
// presentation bug, not a render bug — every render-target readback in this file is unaffected by it (measured
// Duplex 2026-09-21: errorsDuringRender=0, errorsDuringCanvasPresent=4). The screenshot is drawn from the readback.
const PRESENT = Q.get('present') === '1';
const logEl = document.getElementById('log');
const lines = [];
function log(s) { lines.push(s); logEl.textContent = lines.slice(-30).join('\n'); console.log('§SPIKE ' + s); }
const result = { db: DB, view: VIEW, traa: USE_TRAA, velocity: USE_VELOCITY, core: CORE185 ? 'r185-vendored' : 'r186', nogi: NO_GI, revision: THREE.REVISION, w: W, h: H, errors: [], warnings: [] };
window.__spikeResult = result;
window.addEventListener('error', e => { result.errors.push(String(e.message || e)); });
window.addEventListener('unhandledrejection', e => { result.errors.push('unhandledrejection: ' + String(e.reason && e.reason.stack || e.reason)); });
const _warn = console.warn.bind(console), _err = console.error.bind(console);
console.warn = (...a) => { result.warnings.push(a.map(String).join(' ').slice(0, 300)); _warn(...a); };
console.error = (...a) => { result.errors.push(a.map(String).join(' ').slice(0, 300)); _err(...a); };

// ── 1. DB → geometry (mirrors scene.js blobToGeometry) ───────────────────────────────────────────
function blobToGeometry(vBlob, fBlob) {
  const vArr = new Float32Array(vBlob.buffer, vBlob.byteOffset, vBlob.byteLength / 4);
  const fArr = new Uint32Array(fBlob.buffer, fBlob.byteOffset, fBlob.byteLength / 4);
  if (vArr.length < 9 || fArr.length < 3) return null;
  const positions = new Float32Array(vArr.length);
  for (let i = 0; i < vArr.length; i += 3) { positions[i] = vArr[i]; positions[i + 1] = vArr[i + 2]; positions[i + 2] = -vArr[i + 1]; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const vCount = positions.length / 3;
  let idx = fArr;
  if (vCount < 65536) { idx = new Uint16Array(fArr.length); for (let i = 0; i < fArr.length; i++) idx[i] = fArr[i]; }
  else { idx = new Uint32Array(fArr); }
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

async function loadDb() {
  const t0 = performance.now();
  const SQL = await initSqlJs({ locateFile: f => '/viewer/lib/' + f });
  // ?dbfile=<name.db> — exact filename override for DBs that don't follow the <DB>_extracted.db
  // convention (e.g. HHS_Office_Federated_silent.db, the one with the real saved cinema_path table).
  const url = Q.get('dbfile') ? ('/buildings/' + Q.get('dbfile')) : ('/buildings/' + DB + '_extracted.db');
  const buf = await (await fetch(url)).arrayBuffer();
  const db = new SQL.Database(new Uint8Array(buf));
  log(`db ${url} ${(buf.byteLength / 1048576).toFixed(1)} MB loaded in ${(performance.now() - t0).toFixed(0)} ms`);
  // same join as streaming.js (elements_meta + element_instances + element_transforms)
  const rows = [];
  const st = db.prepare(`SELECT m.guid, i.geometry_hash, m.material_rgba, m.discipline, t.center_x, t.center_y, t.center_z,
      t.rotation_x, t.rotation_y, t.rotation_z, m.storey, m.ifc_class, t.bbox_x, t.bbox_y, t.bbox_z
      FROM elements_meta m JOIN element_instances i ON m.guid = i.guid JOIN element_transforms t ON t.guid = m.guid`);
  while (st.step()) rows.push(st.get());
  st.free();
  const hashes = [...new Set(rows.map(r => r[1]).filter(Boolean))];
  // split DBs (Terminal): geometry lives in <name>_geo.db — same pairing streaming.js does (DB_URL → _geo.db)
  let libDb = db;
  if (!db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='component_geometries'").length) {
    const gurl = '/buildings/' + DB + '_geo.db';
    const gbuf = await (await fetch(gurl)).arrayBuffer();
    libDb = new SQL.Database(new Uint8Array(gbuf));
    log(`geo ${gurl} ${(gbuf.byteLength / 1048576).toFixed(1)} MB loaded`);
  }
  const meshCache = {};
  let fetched = 0;
  for (let ci = 0; ci < hashes.length; ci += 200) {
    const chunk = hashes.slice(ci, ci + 200);
    const ph = chunk.map(() => '?').join(',');
    const gs = libDb.prepare(`SELECT geometry_hash, vertices, faces FROM component_geometries WHERE geometry_hash IN (${ph})`);
    gs.bind(chunk);
    while (gs.step()) { const r = gs.get(); if (r[1] && r[2]) { const g = blobToGeometry(r[1], r[2]); if (g) { meshCache[r[0]] = g; fetched++; } } }
    gs.free();
  }
  if (libDb !== db) libDb.close();
  // modelOffset = mean centre, as the app's centres query does (AVG(center_x..))
  const off = new THREE.Vector3();
  for (const r of rows) off.add(new THREE.Vector3(r[4], r[5], r[6]));
  off.divideScalar(rows.length || 1);
  db.close();
  log(`elements=${rows.length} hashes=${hashes.length} geometries=${fetched}`);
  return { rows, meshCache, modelOffset: off };
}

// ── 2. scene build (mirrors streaming.js _flushInstanced bucket + BatchedMesh/InstancedMesh) ──────
function ifc2three(ix, iy, iz, off) { return { x: ix - off.x, y: iz - off.z, z: -(iy - off.y) }; }
const _matCache = {};
function getMaterial(rgba) {
  const key = rgba || '_default';
  if (_matCache[key]) return _matCache[key];
  let r = 0.92, g = 0.90, b = 0.85, a = 1;
  if (rgba && rgba.indexOf(',') !== -1) { const p = rgba.split(',').map(Number); r = p[0]; g = p[1]; b = p[2]; a = p[3]; }
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(r, g, b), roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide });
  if (a < 0.99) { m.transparent = true; m.opacity = a; }
  _matCache[key] = m;
  return m;
}
function buildScene(scene, { rows, meshCache, modelOffset }) {
  const pending = {};
  for (const row of rows) {
    const [guid, hash, rgba, disc, cx, cy, cz, rotX, rotY, rotZ, storey, ifcClass] = row;
    if (!hash || !meshCache[hash]) continue;
    (pending[hash] = pending[hash] || []).push({ guid, hash, rgba, disc, cx, cy, cz, rotX: rotX || 0, rotY: rotY || 0, rotZ: rotZ || 0, storey: storey || '', ifcClass });
  }
  const _pos = new THREE.Vector3(), _euler = new THREE.Euler(), _quat = new THREE.Quaternion(), _scale = new THREE.Vector3(1, 1, 1), _m4 = new THREE.Matrix4();
  const batchBuckets = {};
  const stats = { batchedMeshes: 0, batchedSlots: 0, instancedMeshes: 0, instancedSlots: 0, addGeoFail: 0, batchedFail: 0 };
  const LOW_INSTANCE_BATCH_MAX = 3;
  for (const [hash, elements] of Object.entries(pending)) {
    const geo = meshCache[hash];
    if (elements.length <= LOW_INSTANCE_BATCH_MAX) {
      for (const el of elements) {
        const key = (el.storey || '_') + '|' + (el.disc || '_') + '|' + (el.rgba || '_default');
        (batchBuckets[key] = batchBuckets[key] || []).push({ el, geo });
      }
    } else {
      const iMesh = new THREE.InstancedMesh(geo, getMaterial(elements[0].rgba), elements.length);
      iMesh.frustumCulled = false;
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i]; const p = ifc2three(el.cx, el.cy, el.cz, modelOffset);
        _pos.set(p.x, p.y, p.z); _euler.set(el.rotX, el.rotZ, -el.rotY); _quat.setFromEuler(_euler); _m4.compose(_pos, _quat, _scale);
        iMesh.setMatrixAt(i, _m4);
      }
      iMesh.instanceMatrix.needsUpdate = true;
      scene.add(iMesh); stats.instancedMeshes++; stats.instancedSlots += elements.length;
    }
  }
  for (const [key, items] of Object.entries(batchBuckets)) {
    let totalVerts = 0, totalIdx = 0;
    for (const it of items) { totalVerts += it.geo.attributes.position.count; totalIdx += it.geo.index ? it.geo.index.count : it.geo.attributes.position.count; }
    const rgba = key.split('|')[2];
    const mat = getMaterial(rgba === '_default' ? null : rgba);
    let bm;
    try { bm = new THREE.BatchedMesh(items.length, totalVerts, totalIdx, mat); }
    catch (e) { stats.batchedFail++; result.errors.push('BatchedMesh ctor: ' + e.message); continue; }
    bm.frustumCulled = true;
    for (const it of items) {
      let slotId;
      try { const geoId = bm.addGeometry(it.geo); slotId = bm.addInstance(geoId); }
      catch (e) { stats.addGeoFail++; if (stats.addGeoFail < 4) result.errors.push('addGeometry: ' + e.message); continue; }
      const el = it.el; const p = ifc2three(el.cx, el.cy, el.cz, modelOffset);
      _pos.set(p.x, p.y, p.z); _euler.set(el.rotX, el.rotZ, -el.rotY); _quat.setFromEuler(_euler); _m4.compose(_pos, _quat, _scale);
      bm.setMatrixAt(slotId, _m4);
      stats.batchedSlots++;
    }
    bm.matrixAutoUpdate = false; bm.updateMatrix();
    scene.add(bm); stats.batchedMeshes++;
  }
  return stats;
}

// ── 3. camera placement ──────────────────────────────────────────────────────────────────────────
// Framing from the WALLS (ifc_class IfcWall*), in IFC coords, then ifc2three — the whole-scene box includes
// footings/site elements and put the first interior eye under the ground slab (measured: Clinic sceneBox.min.y
// was the footing level, the frame showed the slab underside). ?eye=x,y,z&look=x,y,z (IFC) overrides.
function median(a) { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; }
function placeCamera(camera, scene, data) {
  const { rows, modelOffset } = data;
  const box = new THREE.Box3();
  scene.traverse(o => { if (o.isBatchedMesh || o.isInstancedMesh) { o.computeBoundingBox(); if (o.boundingBox) box.union(o.boundingBox); } });
  result.sceneBox = { min: box.min.toArray().map(v => +v.toFixed(2)), max: box.max.toArray().map(v => +v.toFixed(2)) };
  const walls = rows.filter(r => /^IfcWall/.test(r[11] || ''));
  const byStorey = {};
  for (const w of walls) (byStorey[w[10] || ''] = byStorey[w[10] || ''] || []).push(w);
  const storeys = Object.entries(byStorey).sort((a, b) => b[1].length - a[1].length);
  const top = storeys[0] ? storeys[0][1] : walls;
  const floorZ = median(top.map(w => w[6] - (w[14] || 0) / 2));
  const mx = median(top.map(w => w[4])), my = median(top.map(w => w[5]));
  const xs = top.map(w => w[4]), ys = top.map(w => w[5]);
  const xr = Math.max(...xs) - Math.min(...xs), yr = Math.max(...ys) - Math.min(...ys);
  let eyeI, lookI;
  if (Q.get('eye') && Q.get('look')) { eyeI = Q.get('eye').split(',').map(Number); lookI = Q.get('look').split(',').map(Number); }
  else if (VIEW === 'exterior') {
    const ax = walls.map(w => w[4]), ay = walls.map(w => w[5]), az = walls.map(w => w[6]);
    const cx = (Math.max(...ax) + Math.min(...ax)) / 2, cy = (Math.max(...ay) + Math.min(...ay)) / 2, cz = (Math.max(...az) + Math.min(...az)) / 2;
    const sx = Math.max(...ax) - Math.min(...ax), sy = Math.max(...ay) - Math.min(...ay);
    eyeI = [cx + sx * 0.75, cy - sy * 0.9, Math.max(...az) + Math.max(sx, sy) * 0.3];
    lookI = [cx, cy, cz];
  } else {
    // interior: eye 1.6 m above the floor of the storey with the most walls, at the median wall XY, looking
    // along the storey's long axis toward its far side
    eyeI = [mx, my, floorZ + 1.6];
    const dx = xr >= yr ? Math.sign((Math.max(...xs) + Math.min(...xs)) / 2 - mx || 1) : 0;
    const dy = xr >= yr ? 0 : Math.sign((Math.max(...ys) + Math.min(...ys)) / 2 - my || 1);
    lookI = [mx + dx * 10, my + dy * 10, floorZ + 1.6];
  }
  // ?eye3=x,y,z&look3=tx,ty,tz — RAW three.js/app render-space override (NOT IFC coords, no
  // ifc2three/modelOffset transform applied). Use this for poses extracted directly from the real
  // app's window.APP.cinemaPathPlan(dur).poseAt(tNorm), which already returns app-scene-space
  // {x,y,z,tx,ty,tz} (see probe_hospital_pose.js) — those numbers are meaningless as IFC coords.
  let e, l;
  if (Q.get('eye3') && Q.get('look3')) {
    const e3 = Q.get('eye3').split(',').map(Number), l3 = Q.get('look3').split(',').map(Number);
    e = { x: e3[0], y: e3[1], z: e3[2] }; l = { x: l3[0], y: l3[1], z: l3[2] };
  } else {
    e = ifc2three(eyeI[0], eyeI[1], eyeI[2], modelOffset); l = ifc2three(lookI[0], lookI[1], lookI[2], modelOffset);
  }
  camera.position.set(e.x, e.y, e.z);
  camera.lookAt(l.x, l.y, l.z);
  const size = box.getSize(new THREE.Vector3());
  // ROOT CAUSE (found 2026-09-22, HHS_Office_Federated): box.union() is only called when
  // o.boundingBox is truthy after o.computeBoundingBox() — for HHS's BatchedMesh/InstancedMesh
  // objects that never fires (boundingBox stays null for every one of them; addGeoFail=0/
  // batchedFail=0 so it's not a build error), so `box` stays THREE.Box3's default empty state
  // (min=+Inf, max=-Inf). size.length() is then +Infinity, camera.far becomes Infinity (serializes
  // as `"far":null` in result JSON — the tell). An Infinity far plane produces a degenerate
  // projection matrix: EVERY subsequent render shows background only, no geometry, for ANY camera
  // pose — which is what actually produced the whole "frozen frame" appearance across the last two
  // debugging sessions (frame 0 was ALSO blank, just a very slightly different tone-mapped sky
  // shade — never actually checked visually until now). Guard against it here.
  const finiteFar = Number.isFinite(size.length()) ? size.length() * 2 : 0;
  camera.near = 0.1; camera.far = Math.max(200, finiteFar || 500);
  camera.updateProjectionMatrix();
  result.camera = { storey: storeys[0] ? storeys[0][0] : null, walls: walls.length, floorZ_ifc: +floorZ.toFixed(2), eye_ifc: eyeI.map(v => +v.toFixed(2)), look_ifc: lookI.map(v => +v.toFixed(2)), pos: camera.position.toArray().map(v => +v.toFixed(2)), near: camera.near, far: camera.far, raw3: !!(Q.get('eye3') && Q.get('look3')) };
}

// ── 4. readback + statistics ─────────────────────────────────────────────────────────────────────
function statsRGBA(buf, w, h, depthMask) {
  // buf: Float32Array RGBA. Returns NaN count, black fraction (over covered pixels), mean/max luminance, 5x5 samples.
  const n = w * h; let nan = 0, black = 0, covered = 0, sum = 0, max = 0, sumR = 0, sumG = 0, sumB = 0;
  for (let i = 0; i < n; i++) {
    const r = buf[i * 4], g = buf[i * 4 + 1], b = buf[i * 4 + 2];
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || !Number.isFinite(r + g + b)) { nan++; continue; }
    if (depthMask && !depthMask[i]) continue;
    covered++;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += l; sumR += r; sumG += g; sumB += b; if (l > max) max = l;
    if (l < 1e-4) black++;
  }
  const samples = [];
  for (let sy = 0; sy < 5; sy++) for (let sx = 0; sx < 5; sx++) {
    const x = Math.floor((sx + 0.5) * w / 5), y = Math.floor((sy + 0.5) * h / 5), i = (y * w + x) * 4;
    samples.push([x, y, +buf[i].toFixed(4), +buf[i + 1].toFixed(4), +buf[i + 2].toFixed(4)]);
  }
  return { nan, covered, blackFrac: covered ? +(black / covered).toFixed(4) : null, meanLum: covered ? +(sum / covered).toFixed(5) : null, maxLum: +max.toFixed(4), meanRGB: covered ? [sumR, sumG, sumB].map(v => +(v / covered).toFixed(4)) : null, samples5x5: samples };
}

async function main() {
  if (!navigator.gpu) { result.fatal = 'navigator.gpu missing'; window.__spike = JSON.stringify(result); return; }
  const t0 = performance.now();
  const data = await loadDb();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fb8d4);
  const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 500);
  const buildStats = buildScene(scene, data);
  result.build = buildStats;
  log(`BatchedMesh=${buildStats.batchedMeshes} (slots ${buildStats.batchedSlots}) InstancedMesh=${buildStats.instancedMeshes} (slots ${buildStats.instancedSlots}) addGeoFail=${buildStats.addGeoFail}`);
  placeCamera(camera, scene, data);

  // lights: one sun + hemisphere (same shape as the app's photoreal fold: direct + sky)
  const sun = new THREE.DirectionalLight(0xfff2e0, 3.0);
  sun.position.set(30, 60, 20); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sb = 80; sun.shadow.camera.left = -sb; sun.shadow.camera.right = sb; sun.shadow.camera.top = sb; sun.shadow.camera.bottom = -sb; sun.shadow.camera.far = 300;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x806a50, 0.6));

  // trackTimestamp is a constructor parameter in r186 (setting the property after construction leaves it disabled)
  const renderer = new THREE.WebGPURenderer({ antialias: false, forceWebGL: false, trackTimestamp: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  if (PRESENT) document.body.appendChild(renderer.domElement);   // default: never present the WebGPU canvas (see PRESENT)
  await renderer.init();
  result.backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL(fallback)';
  result.rg11b10 = renderer.hasFeature('rg11b10ufloat-renderable');
  try { const a = await navigator.gpu.requestAdapter(); result.adapter = a && a.info ? (a.info.vendor + '/' + a.info.architecture) : 'n/a'; } catch (e) {}
  log(`backend=${result.backend} rev=${THREE.REVISION} rg11b10=${result.rg11b10} adapter=${result.adapter}`);

  // ── pipeline (mirrors examples/webgpu_postprocessing_ssgi.html @r186) ──
  const Pipeline = THREE.RenderPipeline || THREE.PostProcessing;
  const pipeline = new Pipeline(renderer);
  const scenePass = pass(scene, camera);
  const mrtSpec = { output: output, diffuseColor: diffuseColor, normal: packNormalToRGB(normalView) };
  if (USE_VELOCITY) mrtSpec.velocity = velocity;
  scenePass.setMRT(mrt(mrtSpec));
  const scenePassColor = scenePass.getTextureNode('output');
  const scenePassDiffuse = scenePass.getTextureNode('diffuseColor');
  const scenePassDepth = scenePass.getTextureNode('depth');
  const scenePassNormal = scenePass.getTextureNode('normal');
  scenePass.getTexture('diffuseColor').type = THREE.UnsignedByteType;
  scenePass.getTexture('normal').type = THREE.UnsignedByteType;
  const sceneNormal = sample((uv) => unpackRGBToNormal(scenePassNormal.sample(uv)));

  const giPass = ssgi(scenePassColor, scenePassDepth, sceneNormal, camera);
  giPass.sliceCount.value = USE_TRAA ? 2 : 3;
  giPass.stepCount.value = 8;
  giPass.useTemporalFiltering = USE_TRAA;
  const aoNode = giPass.getAONode();
  const giNode = giPass.getGINode();
  const composite = vec4(add(scenePassColor.rgb.mul(aoNode), scenePassDiffuse.rgb.mul(giNode.rgb)), scenePassColor.a);

  let gtaoNode = null;
  if (!CORE185) {
    const { ao } = await import('three/addons/tsl/display/GTAONode.js');
    gtaoNode = ao(scenePassDepth, sceneNormal, camera);
    gtaoNode.resolutionScale = 1.0;
  }

  let finalNode = composite;
  if (USE_TRAA) {
    const { traa } = await import('three/addons/tsl/display/TRAANode.js');
    finalNode = traa(composite, scenePassDepth, scenePass.getTextureNode('velocity'), camera);
  }
  // before/after pair: nogi=1 shows the beauty pass straight (direct sun+hemisphere light only, no SSGINode/
  // GTAONode contribution) — same scene, same camera, same lights; only the SHOWN node differs. All the GI/AO
  // numeric readbacks below still run unchanged (giPass/gtaoNode are still built either way).
  if (NO_GI) finalNode = vec4(scenePassColor.rgb, scenePassColor.a);
  pipeline.outputNode = finalNode;
  const rt = new THREE.RenderTarget(W, H, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false });

  // ── SEQ mode: ?posesFile=<url to a JSON array of {x,y,z,tx,ty,tz}> — a real moving-camera clip
  // (Alt+C-shape question, not Alt+S). ONE render per pose, no per-frame warmup/convergence loop —
  // a real bake could never afford re-rendering N frames per output frame. Whatever noise reduction
  // happens has to come from SSGINode/GTAONode's own frame-to-frame temporal jitter (useTemporalFiltering)
  // resolved by TRAANode's velocity-based reprojection across the ACTUAL moving-camera sequence — the
  // same mechanism the stills use, just never exercised under motion before. Frames are POSTed to the
  // driver's own static server (POST /__saveFrame/NNNN) as they're produced, not buffered in page memory
  // (240 * 1920x1080 PNGs would be hundreds of MB of JS heap/string if collected into one JSON blob).
  const SEQ_POSES_URL = Q.get('posesFile');
  const SEQ_RAW = Q.get('seqRaw') === '1';   // DIAG ONLY: bypass pipeline/PassNode entirely, plain
  // renderer.render(scene,camera) — isolates whether the freeze is in the TSL pipeline or fundamental.
  const SEQ_SIMPLE = Q.get('seqSimple') === '1';   // DIAG ONLY: swap in a trivial default-Mesh box
  // scene instead of the real BatchedMesh/InstancedMesh building — isolates whether the freeze is
  // specific to BatchedMesh/InstancedMesh (matrixAutoUpdate=false on BatchedMesh, etc.) or fundamental.
  if (SEQ_SIMPLE) {
    scene.clear();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));
    const box = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshStandardMaterial({ color: 0xff4444 }));
    box.position.set(0, 0, 0);
    scene.add(box);
    log('SEQ_SIMPLE: swapped scene for a single default THREE.Mesh box at origin');
  }
  if (SEQ_POSES_URL) {
    const poses = await (await fetch(SEQ_POSES_URL)).json();
    pipeline.outputColorTransform = true;
    const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
    const ctx2 = c2.getContext('2d'); const img = ctx2.createImageData(W, H);
    const seqT0 = performance.now(); const errsBeforeSeq = result.errors.length;
    for (let i = 0; i < poses.length; i++) {
      const p = poses[i];
      camera.position.set(p.x, p.y, p.z);
      camera.lookAt(p.tx, p.ty, p.tz);
      camera.updateMatrixWorld(true);
      console.log('§SEQ_DIAG i=' + i + ' campos=' + camera.position.x.toFixed(2) + ',' + camera.position.y.toFixed(2) + ',' + camera.position.z.toFixed(2) + ' mw=' + camera.matrixWorld.elements.slice(12, 15).map(v => v.toFixed(2)).join(','));
      pipeline.needsUpdate = true;   // WITHOUT this, frames after the first are byte-identical — the
      // pipeline caches per-frame uniforms (camera view/proj etc.) and only refreshes them when told to
      // (measured 2026-09-21: md5 of frame 60/120/180/239 identical without this line, despite wildly
      // different poses in poses[] — same flag the still-mode's own readOutput() already sets whenever
      // it changes something).
      let buf;
      if (SEQ_RAW) {
        // DIAG: identity-cache theory — construct a BRAND-NEW camera object per frame (same
        // intrinsics) instead of mutating the persistent one, see if the freeze disappears.
        const freshCam = new THREE.PerspectiveCamera(camera.fov, camera.aspect, camera.near, camera.far);
        freshCam.position.set(p.x, p.y, p.z);
        freshCam.lookAt(p.tx, p.ty, p.tz);
        freshCam.updateMatrixWorld(true);
        // DIAG round 2: also use a BRAND-NEW RenderTarget per frame — tests whether the freeze is
        // actually in readRenderTargetPixelsAsync's readback caching, not the render itself.
        const freshRt = new THREE.RenderTarget(W, H, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false });
        if (Q.get('seqDelay') === '1') await new Promise(res => setTimeout(res, 50));
        renderer.setRenderTarget(freshRt);
        renderer.render(scene, freshCam);   // bypass pipeline/PassNode entirely
        renderer.setRenderTarget(null);
        if (Q.get('seqDelay') === '1') await new Promise(res => setTimeout(res, 50));
        buf = await renderer.readRenderTargetPixelsAsync(freshRt, 0, 0, W, H);
        freshRt.dispose();
        const _f32chk = buf instanceof Float32Array ? buf : Float32Array.from(buf);
        const _ctr = (Math.floor(H / 2) * W + Math.floor(W / 2)) * 4;
        console.log('§SEQ_DIAG2 i=' + i + ' centerRGBA=' + _f32chk[_ctr].toFixed(4) + ',' + _f32chk[_ctr + 1].toFixed(4) + ',' + _f32chk[_ctr + 2].toFixed(4) + ' sum=' + Array.from(_f32chk.slice(0, 4000)).reduce((a, b) => a + b, 0).toFixed(4));
      } else {
        if (Q.get('seqProbeRaw') === '1') {
          // DIAG: read the RAW scenePassColor (no GI/AO/TRAA at all) via the SAME outputNode-swap
          // technique the still-mode's own (proven-working) readOutput() uses, to check whether the
          // G-buffer itself is updating independent of the finalNode graph being captured below.
          const savedOut = pipeline.outputNode;
          pipeline.outputNode = vec4(scenePassColor.rgb, 1); pipeline.needsUpdate = true;
          renderer.setRenderTarget(rt);
          pipeline.render();
          renderer.setRenderTarget(null);
          const rawBuf = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, W, H);
          const rawF32 = rawBuf instanceof Float32Array ? rawBuf : Float32Array.from(rawBuf);
          const _ctr = (Math.floor(H / 2) * W + Math.floor(W / 2)) * 4;
          console.log('§SEQ_PROBE_RAW i=' + i + ' centerRGB=' + rawF32[_ctr].toFixed(4) + ',' + rawF32[_ctr + 1].toFixed(4) + ',' + rawF32[_ctr + 2].toFixed(4) + ' sum4000=' + Array.from(rawF32.slice(0, 4000)).reduce((a, b) => a + b, 0).toFixed(4));
          pipeline.outputNode = savedOut; pipeline.needsUpdate = true;
        }
        renderer.setRenderTarget(rt);
        pipeline.render();
        renderer.setRenderTarget(null);
        buf = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, W, H);
      }
      const f32 = buf instanceof Float32Array ? buf : Float32Array.from(buf);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const s = ((H - 1 - y) * W + x) * 4, d = (y * W + x) * 4;
        img.data[d] = Math.max(0, Math.min(255, f32[s] * 255));
        img.data[d + 1] = Math.max(0, Math.min(255, f32[s + 1] * 255));
        img.data[d + 2] = Math.max(0, Math.min(255, f32[s + 2] * 255));
        img.data[d + 3] = 255;
      }
      ctx2.putImageData(img, 0, 0);
      const blob = await new Promise(res => c2.toBlob(res, 'image/png'));
      await fetch('/__saveFrame/' + String(i).padStart(4, '0'), { method: 'POST', body: blob });
      if (i % 20 === 0) log(`seq frame ${i}/${poses.length} (${(performance.now() - seqT0).toFixed(0)} ms elapsed)`);
    }
    result.seq = { frames: poses.length, w: W, h: H, totalMs: +(performance.now() - seqT0).toFixed(0), errorsDuringSeq: result.errors.length - errsBeforeSeq };
    log(`SEQ DONE frames=${poses.length} totalMs=${result.seq.totalMs} errors=${result.seq.errorsDuringSeq}`);
    window.__spike = JSON.stringify(result);
    return;
  }

  // ── warm-up + timing. pipeline.render() only ENQUEUES GPU work, so each frame is forced to complete with a
  // 1x1 readback (wall-clock, includes ~1 ms readback overhead) and the GPU timestamp query is read as well.
  const frameTimes = [], gpuTimes = [];
  const errsBefore = result.errors.length;
  for (let i = 0; i < FRAMES; i++) {
    const f0 = performance.now();
    renderer.setRenderTarget(rt);
    pipeline.render();
    renderer.setRenderTarget(null);
    await renderer.readRenderTargetPixelsAsync(rt, 0, 0, 1, 1);
    frameTimes.push(performance.now() - f0);
    try { await renderer.resolveTimestampsAsync(THREE.TimestampQuery.RENDER); gpuTimes.push(renderer.info.render.timestamp); } catch (e) {}
    if (i === 0) log(`first frame (compile+render) ${frameTimes[0].toFixed(0)} ms`);
  }
  const tail = frameTimes.slice(5), gtail = gpuTimes.slice(5);
  result.frameMs = { first: +frameTimes[0].toFixed(1), meanAfterWarmup: +(tail.reduce((a, b) => a + b, 0) / tail.length).toFixed(2), min: +Math.min(...tail).toFixed(2), max: +Math.max(...tail).toFixed(2) };
  result.gpuTimestampMs = gtail.length ? { mean: +(gtail.reduce((a, b) => a + b, 0) / gtail.length).toFixed(2), min: +Math.min(...gtail).toFixed(2), max: +Math.max(...gtail).toFixed(2) } : null;
  result.renderInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  result.errorsDuringRender = result.errors.length - errsBefore;
  result.ssgiKnobs = { sliceCount: giPass.sliceCount.value, stepCount: giPass.stepCount.value, radius: giPass.radius.value, giIntensity: giPass.giIntensity.value, temporal: giPass.useTemporalFiltering };
  log(`frame ms (GPU-synced) mean=${result.frameMs.meanAfterWarmup} min=${result.frameMs.min} max=${result.frameMs.max} gpuTs=${JSON.stringify(result.gpuTimestampMs)}`);

  // ── numeric readback: each output rendered into a FloatType RGBA target and read back, RAW (no tone map / sRGB) ──
  pipeline.outputColorTransform = false;
  async function readOutput(node) {
    pipeline.outputNode = node; pipeline.needsUpdate = true;
    renderer.setRenderTarget(rt);
    pipeline.render();
    renderer.setRenderTarget(null);
    const buf = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, W, H);
    return buf instanceof Float32Array ? buf : Float32Array.from(buf);
  }
  // depth mask: which pixels have geometry (depth < 1)
  const depthBuf = await readOutput(vec4(vec3(scenePassDepth.r), 1));
  const depthMask = new Uint8Array(W * H); let cov = 0;
  for (let i = 0; i < W * H; i++) { if (depthBuf[i * 4] < 0.99999) { depthMask[i] = 1; cov++; } }
  result.depth = { coveredFrac: +(cov / (W * H)).toFixed(4), sample: [depthBuf[(Math.floor(H / 2) * W + Math.floor(W / 2)) * 4]] };

  const beauty = await readOutput(vec4(scenePassColor.rgb, 1));
  const gi = await readOutput(vec4(giNode.rgb, 1));
  const ssgiAo = await readOutput(vec4(vec3(aoNode), 1));
  const comp = await readOutput(composite);
  result.beauty = statsRGBA(beauty, W, H, depthMask);
  result.gi = statsRGBA(gi, W, H, depthMask);
  result.ssgiAO = statsRGBA(ssgiAo, W, H, depthMask);
  result.composite = statsRGBA(comp, W, H, depthMask);
  // GI contribution = composite - beauty*ao, i.e. exactly the diffuse*gi term; count covered pixels where it is > 1% of beauty
  let lit = 0, sumAdd = 0;
  for (let i = 0; i < W * H; i++) {
    if (!depthMask[i]) continue;
    const a = 0.2126 * gi[i * 4] + 0.7152 * gi[i * 4 + 1] + 0.0722 * gi[i * 4 + 2];
    sumAdd += a; if (a > 0.01) lit++;
  }
  result.giContribution = { coveredPixels: cov, pixelsWithGIgt0_01: lit, fracLit: cov ? +(lit / cov).toFixed(4) : null, meanGILum: cov ? +(sumAdd / cov).toFixed(5) : null };
  if (gtaoNode) {
    const g = await readOutput(vec4(vec3(gtaoNode), 1));
    result.gtao = statsRGBA(g, W, H, depthMask);
  }
  // normal buffer sanity (unpacked normals should be unit length; NaN/zero-length = broken normal MRT for batched geometry)
  const nrm = await readOutput(vec4(sceneNormal.rgb, 1));
  let nBad = 0, nCount = 0;
  for (let i = 0; i < W * H; i++) { if (!depthMask[i]) continue; nCount++; const x = nrm[i * 4], y = nrm[i * 4 + 1], z = nrm[i * 4 + 2]; const l = Math.hypot(x, y, z); if (!(l > 0.8 && l < 1.2)) nBad++; }
  result.normals = { covered: nCount, badFrac: nCount ? +(nBad / nCount).toFixed(4) : null };
  if (USE_VELOCITY) {
    const vel = await readOutput(vec4(scenePass.getTextureNode('velocity').rgb, 1));
    let vNan = 0, vMax = 0;
    for (let i = 0; i < W * H; i++) { const x = vel[i * 4], y = vel[i * 4 + 1]; if (Number.isNaN(x) || Number.isNaN(y)) vNan++; else { const m = Math.hypot(x, y); if (m > vMax) vMax = m; } }
    result.velocityStatic = { nan: vNan, maxMagnitude: +vMax.toFixed(6) };  // static camera → should be ~0 everywhere
  }

  // human-record image: tone-mapped composite rendered to the RT, read back, drawn on a plain 2D canvas
  pipeline.outputColorTransform = true;
  const shown = await readOutput(finalNode);
  const c2 = document.createElement('canvas'); c2.width = W; c2.height = H; document.body.appendChild(c2);
  const img = c2.getContext('2d').createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {   // readback rows are bottom-up
    const s = ((H - 1 - y) * W + x) * 4, d = (y * W + x) * 4;
    img.data[d] = Math.max(0, Math.min(255, shown[s] * 255)); img.data[d + 1] = Math.max(0, Math.min(255, shown[s + 1] * 255)); img.data[d + 2] = Math.max(0, Math.min(255, shown[s + 2] * 255)); img.data[d + 3] = 255;
  }
  c2.getContext('2d').putImageData(img, 0, 0);
  window.__spikeShotPNG = c2.toDataURL('image/png');   // exact tone-mapped pixels, read by the driver — sidesteps
  // Page.captureScreenshot page-compositing (log-div/canvas stacking made earlier body screenshots show text only)
  if (PRESENT) {
    pipeline.outputNode = finalNode; pipeline.needsUpdate = true;
    const errsBeforePresent = result.errors.length;
    pipeline.render();
    await renderer.readRenderTargetPixelsAsync(rt, 0, 0, 1, 1);  // sync so any present-time validation error lands before we count
    result.errorsDuringCanvasPresent = result.errors.length - errsBeforePresent;
  }
  result.totalMs = +(performance.now() - t0).toFixed(0);
  log(`DONE gi.meanLum=${result.gi.meanLum} gi.nan=${result.gi.nan} gi.black=${result.gi.blackFrac} ao.mean=${result.ssgiAO.meanLum} gtao.mean=${result.gtao ? result.gtao.meanLum : 'n/a'} normals.bad=${result.normals.badFrac}`);
  window.__spike = JSON.stringify(result);
}

main().catch(e => { result.fatal = String(e && e.stack || e); console.error('§SPIKE FATAL', e); window.__spike = JSON.stringify(result); });
