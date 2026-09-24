// ⚠ DO NOT REMOVE — witness for §SURFACE_R10 (bim-compiler PHOTOREAL_STILL_RENDER.md "§SURFACE_R10 — SPEC" +
// "R10 additions (watcher review)"). Scope: single-style windows/doors split in the viewer. Read the log after every run.
// Each arm names the issue it proves or disproves:
//  A1 SPLIT   — "the app splits the same openings the measurement did": the app's own §SURFACE_R10_SPLIT counts
//               (Terminal 223/228 windows clean, Hospital 118/118; Terminal doors 130 with hardware).
//  A2 PATHS   — "a split survives every routing path": every split mesh carries 2 groups + a 2-material array; no
//               split guid sits in a BatchedMesh slot or a merged range; split InstancedMeshes are in _instanceMeta
//               (the set dlod.js zero-scales) and DLOD really zero-scales some when the camera looks away.
//  A3 SHADOW  — "glass does not block the sun, frames still do": §SURFACE_R10_SHADOW paneCasters=0 frameCasters=n,
//               plus (--shadow) a readback of the shadow pass's OWN term (THREE.ShadowMaterial override, 1 = lit)
//               on the floor a sun ray reaches through a Hospital pane: pane-discard OFF vs ON, same pose.
//  A4 COST    — "what the split costs": renderer.info draw calls + render-list transparent count at a fixed pose
//               (from the DB's own element extents), written to cost_<db>_<mode>.json; the §SURFACE_R10_COST line
//               is printed when both the off and the default run exist.
//  A5 OFF     — "?surf=off = no split at all": §SURFACE_R10 OFF, zero split meshes, zero r10 guids.
//  A6 DLOD   — (--dlod) "a split mesh is culled whole, never one group": DLOD forced on, the camera turned away from
//               a split window, dlodTick run with camera nudges; zero-scaled split instances > 0, then restored on
//               turning back. On one split InstancedMesh a raycast at the pane (group 1) and the frame (group 0)
//               of the culled instance hits both before and NEITHER while culled (one instance matrix, both groups).
//  A7 GI      — (--gi) "the Alt+S bounce geometry pass draws split meshes": a real Alt+S keypress (as
//               witness_still_status_first.js), the §GI_STILL stage lines, and per split mesh whether gi_still swapped
//               it to its geometry material (drawn) or hid it as glass (must be 0).
//  A8 FPS     — (--fps) "what the split costs in frame time": fixed pose, camera nudged every rAF so the parked loop
//               renders (renderer.info.render.frame must advance), 300 frames; mean/p95 ms + fps, plus 100 forced
//               render+gl.finish frames (GPU work, not capped by vsync). Run once with --off, once without.
// GATE (every arm): elements loaded (guidMap + merged index) vs the DB's own count. Printed as
//   gate loaded/streamable (elements_meta=n); an arm below the streamable count prints VACUOUS and proves nothing.
//   streamable = the stream queue's own SQL (streaming.js: element_instances hash NOT NULL + element_transforms,
//   IfcOpeningElement excluded) — Hospital's elements_meta holds 233 rows with no geometry hash, which can
//   never load, so the raw COUNT(*) is printed beside it but cannot be the bar.
// Usage: node viewer/tests/witness_surface_r10.js --port 8605 --db /buildings/Hospital_extracted.db [--off] [--merge] [--shadow] [--dlod] [--gi] [--fps]
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = (k, d) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d;
const PORT = +arg('--port', 8605), DB = arg('--db', '/buildings/Hospital_extracted.db');
const OFF = process.argv.includes('--off'), MERGE = process.argv.includes('--merge'), SHADOW = process.argv.includes('--shadow');
const DLOD = process.argv.includes('--dlod'), GI = process.argv.includes('--gi'), FPS = process.argv.includes('--fps');
const OUT = process.env.OUT || '/tmp/witness_surface_r10'; fs.mkdirSync(OUT, { recursive: true });
const BASE = path.basename(DB, '.db');
const MODE = (OFF ? 'off' : 'on') + (MERGE ? '_merge' : '');
const TAG = BASE + '_' + MODE + (SHADOW ? '_shadow' : '') + (DLOD ? '_dlod' : '') + (GI ? '_gi' : '') + (FPS ? '_fps' : '');
const LOG = path.join(OUT, 'log_' + TAG + '.txt'); const lines = []; const T0 = Date.now();
function say(s) { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(LOG, lines.join('\n')); }

async function gate(p) {
  return p.evaluate(() => {
    const A = window.APP, bc = A._hasBuildingCol ? A._hasBuildingCol(A.db) : false, bld = A.activeBuilding;
    const w = bc ? ' WHERE m.building = ?' : '', args = bc ? [bld] : [];
    const all = A.dbQuery('SELECT COUNT(*) FROM elements_meta m' + w, args)[0][0];
    const streamable = A.dbQuery('SELECT COUNT(*) FROM elements_meta m JOIN element_instances i ON m.guid = i.guid JOIN element_transforms t ON t.guid = m.guid' +
      (bc ? ' WHERE m.building = ? AND' : ' WHERE') + " i.geometry_hash IS NOT NULL AND m.ifc_class != 'IfcOpeningElement'", args)[0][0];
    const loaded = Object.keys(A.guidMap).length + Object.keys(A._mergedIndex || {}).length;
    return { bld, all, streamable, loaded, full: loaded >= streamable && streamable > 0 };
  });
}
function gateStr(g) { return 'gate loaded=' + g.loaded + '/' + g.streamable + ' (elements_meta=' + g.all + ')' + (g.full ? '' : ' VACUOUS'); }
async function loadOnce(b) {
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  const seen = [];
  p.on('console', m => { const t = m.text(); seen.push(t); if (/§SURFACE_|PAGEERROR|§LOAD_FAIL|§CONTRACT|§MERGE_ROUTE|§DLOD_ENABLE|§DLOD_REFS|Uncaught|TypeError/.test(t)) say('[page] ' + t.slice(0, 2500)); });
  p.on('pageerror', e => say('PAGEERROR ' + e.message));
  await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=' + DB + (OFF ? '&surf=off' : '') + (MERGE ? '&merge=1' : ''), { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan, { timeout: 180000 });
  try { await p.waitForFunction(() => { try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; } catch (e) { return false; } }, { timeout: 120000, polling: 2000 }); } catch (e) {}
  let blds = await p.evaluate(() => { try { return (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]); } catch (e) { return []; } });
  // LTU_AHouse_meta.db's elements_meta has no `building` column (streaming.js §-note): nothing to name, so the
  // page's own auto-stream is awaited instead of calling streamBuilding.
  const AUTO = !blds.length; if (AUTO) { blds = [null]; say('no building column — awaiting the page auto-stream'); }
  let guids = 0;
  for (const bb of blds) for (let attempt = 0; attempt < 3; attempt++) {
    // attempt 0 waits for the page's own auto-stream (calling streamBuilding on top of it raced it and lost the
    // first 500-element batch: Terminal 47,928/48,428); later attempts stream explicitly.
    if (attempt > 0) await p.evaluate(x => { try { window.APP.streamBuilding(x || window.APP.activeBuilding); } catch (e) {} }, bb);
    let prev = -1, st = 0, zeroIdle = 0;
    for (let i = 0; i < 200 && st < 3; i++) {
      const n = await p.evaluate(() => Object.keys(window.APP.guidMap).length + Object.keys(window.APP._mergedIndex || {}).length);
      const done = await p.evaluate(() => !window.APP.streaming);
      st = (n === prev && n > 0 && done) ? st + 1 : 0; prev = n;
      zeroIdle = (n === 0 && done) ? zeroIdle + 1 : 0; if (zeroIdle >= 15) break;   // 30 s with nothing streaming
      await sleep(2000);
    }
    guids = prev;
    const g = await gate(p);
    say('streamed ' + bb + ' attempt=' + attempt + ' ' + gateStr(g));
    if (g.full) break;
  }
  return { p, guids, seen };
}

(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=gl-egl'] });
  let L = await loadOnce(b), G0 = await gate(L.p);
  if (!G0.full) { say('load below the gate (' + gateStr(G0) + ') — fresh page, re-running ONCE'); await L.p.close(); L = await loadOnce(b); G0 = await gate(L.p); }
  const p = L.p;
  say('§R10_W_GATE ' + gateStr(G0));
  if (!G0.full) { say('§R10_W_GATE VACUOUS — every arm below proves nothing on this load; re-run'); await b.close(); process.exit(2); }
  const armGate = async (name) => { const g = await gate(p); const line = '[' + name + ' ' + gateStr(g) + ']'; return { g, line }; };

  // ── A2 PATHS / A5 OFF: what is in the scene, read from the scene ──
  const paths = await p.evaluate(() => {
    const A = window.APP, r = { surf: A._surfRules, meshes: 0, instancedMeshes: 0, singleMeshes: 0, instances: 0, groupsOk: 0, groupsBad: [],
      byKind: {}, r10Guids: A._r10Guids ? A._r10Guids.size : 0, inBatch: 0, inMerged: 0, inInstanceMeta: 0, paneTransparent: 0, doorLeafR7: 0 };
    A.scene.traverse(o => {
      if (!o.userData || !o.userData.r10) return;
      r.meshes++; r.byKind[o.userData.r10] = (r.byKind[o.userData.r10] || 0) + (o.isInstancedMesh ? o.count : 1);
      if (o.isInstancedMesh) { r.instancedMeshes++; r.instances += o.count; if (A._instanceMeta[o.id]) r.inInstanceMeta++; } else { r.singleMeshes++; r.instances++; }
      const m = o.material, g = o.geometry;
      const ok = Array.isArray(m) && m.length === 2 && g.groups.length === 2 && g.groups[0].materialIndex === 0 && g.groups[1].materialIndex === 1 &&
        g.groups[0].count + g.groups[1].count === g.index.count && g.groups[1].count > 0 && !!g.getAttribute('aPane');
      if (ok) r.groupsOk++; else if (r.groupsBad.length < 5) r.groupsBad.push(o.id);
      if (o.userData.r10 === 'window' && Array.isArray(m) && m[1].transparent && m[1].opacity < 1) r.paneTransparent++;
      if (o.userData.r10 === 'door' && Array.isArray(m) && m[1].userData._surfRow === 'R7' && !m[1].userData._triTex) r.doorLeafR7++;
    });
    const G = A._r10Guids || new Set();
    for (const id in A._batchMeta) for (const e of A._batchMeta[id]) if (G.has(e.guid)) r.inBatch++;
    for (const id in (A._mergedMeta || {})) for (const e of A._mergedMeta[id]) if (G.has(e.guid)) r.inMerged++;
    r.mergedMeshes = Object.keys(A._mergedMeta || {}).length;
    return r;
  });
  const gP = await armGate('paths');
  say('§R10_W_PATHS ' + gP.line + ' ' + JSON.stringify(paths));
  if (OFF) {
    const offOk = paths.surf === false && paths.meshes === 0 && paths.r10Guids === 0 && L.seen.some(t => /§SURFACE_R10 OFF/.test(t)) && !L.seen.some(t => /§SURFACE_R10_SPLIT/.test(t));
    say('§R10_W_OFF ' + gP.line + ' ' + (!gP.g.full ? 'VACUOUS' : offOk ? 'PASS' : 'FAIL') + ' — ?surf=off: split meshes=' + paths.meshes + ' r10Guids=' + paths.r10Guids + ' OFF line=' + L.seen.some(t => /§SURFACE_R10 OFF/.test(t)));
  } else {
    say('§R10_W_GROUPS ' + gP.line + ' ' + (!gP.g.full ? 'VACUOUS' : '') + (paths.meshes > 0 && paths.groupsOk === paths.meshes && paths.inBatch === 0 && paths.inMerged === 0 && paths.inInstanceMeta === paths.instancedMeshes ? 'PASS' : 'FAIL') +
      ' meshes=' + paths.meshes + ' groupsOk=' + paths.groupsOk + ' splitGuidsInBatch=' + paths.inBatch + ' splitGuidsInMerged=' + paths.inMerged +
      ' instancedInInstanceMeta=' + paths.inInstanceMeta + '/' + paths.instancedMeshes + ' paneTransparentMeshes=' + paths.paneTransparent + ' doorLeafR7Meshes=' + paths.doorLeafR7);
    // Shadow report again, from the live scene (the app printed it at stream end too)
    await p.evaluate(() => window.APP._r10ShadowReport && window.APP._r10ShadowReport());
  }

  // ── A4 COST at a fixed pose derived from the DB (identical for off/on runs) ──
  const cost = await p.evaluate(() => {
    const A = window.APP;
    const r = A.dbQuery('SELECT MIN(center_x), MAX(center_x), MIN(center_y), MAX(center_y), MIN(center_z), MAX(center_z) FROM element_transforms')[0];
    const c = A.ifc2three((r[0] + r[1]) / 2, (r[2] + r[3]) / 2, (r[4] + r[5]) / 2);
    const ext = Math.max(r[1] - r[0], r[3] - r[2], r[5] - r[4]);
    A.camera.position.set(c.x + ext * 0.7, c.y + ext * 0.45, c.z + ext * 0.7); A.camera.lookAt(c.x, c.y, c.z); A.camera.updateMatrixWorld();
    if (A.controls && A.controls.target) A.controls.target.set(c.x, c.y, c.z);
    if (A.dlodTick) for (let i = 0; i < 12; i++) A.dlodTick();
    const out = A._r10Cost ? A._r10Cost() : null;
    return { loaded: Object.keys(A.guidMap).length + Object.keys(A._mergedIndex || {}).length, pose: [A.camera.position.x, A.camera.position.y, A.camera.position.z, c.x, c.y, c.z].map(x => +x.toFixed(2)), ...out };
  });
  const gC = await armGate('cost'); cost.gateFull = gC.g.full; cost.streamable = gC.g.streamable;
  if (!FPS) fs.writeFileSync(path.join(OUT, 'cost_' + BASE + '_' + MODE + '.json'), JSON.stringify(cost));
  say('§R10_W_COST_' + MODE.toUpperCase() + ' ' + gC.line + ' ' + JSON.stringify(cost));
  const offF = path.join(OUT, 'cost_' + BASE + '_off.json'), onF = path.join(OUT, 'cost_' + BASE + '_on.json');
  if (!MERGE && !FPS && fs.existsSync(offF) && fs.existsSync(onF)) {
    const a = JSON.parse(fs.readFileSync(offF)), c2 = JSON.parse(fs.readFileSync(onF));
    const vac = !(a.gateFull && c2.gateFull && a.loaded === c2.loaded);
    say('§SURFACE_R10_COST bld=' + BASE + (vac ? ' VACUOUS (a run below the gate or loads differ)' : '') + ' loaded ' + a.loaded + '->' + c2.loaded + '/' + c2.streamable + ' drawCalls ' + a.calls + '->' + c2.calls + ' transparent ' + a.transparent + '->' + c2.transparent +
      ' triangles ' + a.triangles + '->' + c2.triangles + ' (same pose ' + (JSON.stringify(a.pose) === JSON.stringify(c2.pose) ? 'CONFIRMED' : 'DIFFERS ' + JSON.stringify(a.pose) + ' vs ' + JSON.stringify(c2.pose)) + '; ?surf=off -> default)');
  }

  // ── A3 SHADOW arm: sun through a pane onto the floor behind it. Candidates are sorted by guid so every run
  // judges the SAME windows (the first two runs picked different windows because traversal order follows load
  // order). Up to 3 windows; each measured three ways at one pose: panes cast (three.js per-mesh default, the
  // customDepthMaterial removed), panes discarded (the fix), and every split window hidden (upper bound: no window).
  if (SHADOW && !OFF) {
    const gS = await armGate('shadow');
    const sh = await p.evaluate(async () => {
      const A = window.APP, T = THREE, R = A.renderer, S = A.scene;
      const ray = new T.Raycaster();
      const meshes = []; S.traverse(o => { if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible && !(o.userData && o.userData.r10)) meshes.push(o); });
      const cands = [];
      S.traverse(o => {
        if (!o.userData || o.userData.r10 !== 'window') return;
        const g = o.geometry, gr = g.groups[1], pos = g.attributes.position, ix = g.index.array;
        const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), n = new T.Vector3(), ctr = new T.Vector3();
        a.fromBufferAttribute(pos, ix[gr.start]); b.fromBufferAttribute(pos, ix[gr.start + 1]); c.fromBufferAttribute(pos, ix[gr.start + 2]);
        n.subVectors(c, b).cross(new T.Vector3().subVectors(a, b)).normalize();
        let k = 0; for (let j = gr.start; j < gr.start + gr.count; j++) { ctr.add(new T.Vector3().fromBufferAttribute(pos, ix[j])); k++; } ctr.multiplyScalar(1 / k);
        const nInst = o.isInstancedMesh ? o.count : 1, M = new T.Matrix4();
        for (let i = 0; i < nInst; i++) {
          if (o.isInstancedMesh) { o.getMatrixAt(i, M); M.premultiply(o.matrixWorld); } else { o.updateMatrixWorld(); M.copy(o.matrixWorld); }
          cands.push({ o, i, wc: ctr.clone().applyMatrix4(M), wn: n.clone().transformDirection(M), guid: (A._instanceMeta[o.id] ? A._instanceMeta[o.id][i].guid : o.userData.guid) });
        }
      });
      cands.sort((x, y) => x.guid < y.guid ? -1 : x.guid > y.guid ? 1 : 0);
      const elev = 40 * Math.PI / 180, picks = [];
      for (const cd of cands) {
        if (picks.length >= 12) break;
        const nh = new T.Vector3(cd.wn.x, 0, cd.wn.z); if (nh.lengthSq() < 0.5) continue; nh.normalize();
        for (const sgn of [1, -1]) {
          const d = nh.clone().multiplyScalar(-sgn * Math.cos(elev)).add(new T.Vector3(0, -Math.sin(elev), 0)).normalize();
          ray.set(cd.wc.clone().addScaledVector(d, -0.05), d.clone().negate()); ray.far = 60;
          if (ray.intersectObjects(meshes, false).length) continue;                         // sun side must be open
          ray.set(cd.wc.clone().addScaledVector(d, 0.05), d); ray.far = 12;
          const inn = ray.intersectObjects(meshes, false); if (!inn.length) continue;
          const h = inn[0]; const fn = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : null;
          if (!fn || Math.abs(fn.y) < 0.9 || h.distance < 1.0) continue;                   // a floor, not the sill
          picks.push({ cd, d, hit: h.point.clone(), dist: h.distance }); break;
        }
      }
      if (!picks.length) return { err: 'no pane with open sky outside and a floor behind it among ' + cands.length + ' split windows' };
      const sun = A.sun, cam = A.camera;
      const prev = { cs: sun.castShadow, pos: sun.position.clone(), tgt: sun.target.position.clone(), en: R.shadowMap.enabled, bg: S.background, ov: S.overrideMaterial, cam: cam.position.clone(), q: cam.quaternion.clone() };
      R.shadowMap.enabled = true; R.shadowMap.autoUpdate = true;
      if (sun.shadow.mapSize.x < 2048) { sun.shadow.mapSize.set(2048, 2048); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
      S.traverse(o => { if (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) { o.castShadow = true; o.receiveShadow = true; } });
      const W = 256, rt = new T.WebGLRenderTarget(W, W), px = new Uint8Array(W * W * 4);
      const smat = new T.ShadowMaterial({ color: 0x000000, opacity: 1 });
      const split = []; S.traverse(o => { if (o.userData && o.userData.r10 === 'window') split.push(o); });
      const measure = () => {
        S.background = null; S.overrideMaterial = smat; R.shadowMap.needsUpdate = true;
        const cc = new T.Color(); R.getClearColor(cc); const ca = R.getClearAlpha(); R.setClearColor(0xffffff, 1);
        const asp = cam.aspect; cam.aspect = 1; cam.updateProjectionMatrix();
        R.setRenderTarget(rt); R.clear(); R.render(S, cam); R.readRenderTargetPixels(rt, 0, 0, W, W, px); R.setRenderTarget(null);
        cam.aspect = asp; cam.updateProjectionMatrix(); R.setClearColor(cc, ca); S.overrideMaterial = prev.ov; S.background = prev.bg;
        let lit = 0; for (let i = 0; i < W * W; i++) if (px[i * 4] > 127) lit++;
        return lit;
      };
      const out = [];
      for (const pk of picks) {
        sun.castShadow = true; sun.position.copy(pk.hit).addScaledVector(pk.d, -40); sun.target.position.copy(pk.hit); sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
        const sc = sun.shadow.camera; sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 0.5; sc.far = 120; sc.updateProjectionMatrix();
        const dh = new T.Vector3(pk.d.x, 0, pk.d.z).normalize();
        cam.position.copy(pk.hit).add(new T.Vector3(0, 2.2, 0)).addScaledVector(dh, 1.2); cam.lookAt(pk.hit); cam.updateMatrixWorld();
        split.forEach(o => { o.customDepthMaterial = undefined; });
        const panesCast = measure();
        split.forEach(o => { o.customDepthMaterial = A._r10DepthMaterial(); });
        const panesDiscarded = measure();
        split.forEach(o => { o.userData._vis = o.visible; o.visible = false; });
        const noWindows = measure();
        split.forEach(o => { o.visible = o.userData._vis; delete o.userData._vis; });
        // a floor patch the sun cannot reach even with NO window (other geometry in the way) cannot judge a pane
        out.push({ window: pk.cd.guid, rayToFloor_m: +pk.dist.toFixed(2), litPx: { panesCast, panesDiscarded, noWindows }, judgeable: noWindows > 0 });
        if (out.filter(x => x.judgeable).length >= 3) break;
      }
      sun.castShadow = prev.cs; sun.position.copy(prev.pos); sun.target.position.copy(prev.tgt); R.shadowMap.enabled = prev.en;
      cam.position.copy(prev.cam); cam.quaternion.copy(prev.q); cam.updateMatrixWorld(); rt.dispose(); smat.dispose();
      return { term: 'THREE.ShadowMaterial override (the shadow pass own term), ' + W + 'x' + W + ' readback, lit = R > 127', sunElevDeg: 40, candidates: cands.length, windows: out };
    });
    const J = (sh.windows || []).filter(w => w.judgeable);
    const okW = J.filter(w => w.litPx.panesDiscarded > w.litPx.panesCast);
    const frameW = J.filter(w => w.litPx.noWindows > w.litPx.panesDiscarded);
    say('§R10_W_GLASS_SHADOW ' + gS.line + ' ' + JSON.stringify(sh) + (!gS.g.full ? ' VACUOUS' : !J.length ? ' INCONCLUSIVE — no judgeable window (floor dark even with no window)' :
      (okW.length === J.length ? ' PASS' : ' FAIL') + ' — pane discarded lets more sun onto the floor on ' + okW.length + '/' + J.length +
      ' judgeable windows (' + ((sh.windows || []).length - J.length) + ' skipped: floor dark even with no window); frames still shade (noWindows > panesDiscarded) on ' + frameW.length + '/' + J.length));
  }

  // ── A6 DLOD, forced ──
  if (DLOD && !OFF) {
    const gD = await armGate('dlod');
    const dl = await p.evaluate(async () => {
      const A = window.APP, T = THREE, cam = A.camera;
      if (!A._dlodEnabled && A.dlodEnable) A.dlodEnable();
      const r = { dlodEnabled: !!A._dlodEnabled };
      if (!r.dlodEnabled) return r;
      const e = new T.Matrix4(), s = new T.Vector3(), q = new T.Quaternion(), v = new T.Vector3();
      // zero-scale read from the matrix elements (Matrix4.decompose in r186 returns scale 1 for a singular matrix)
      const zeroed = () => { let z = 0, t = 0; A.scene.traverse(o => { if (!o.isInstancedMesh || !o.userData.r10) return; for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, e); const el = e.elements; t++; if (Math.abs(el[0]) + Math.abs(el[1]) + Math.abs(el[2]) + Math.abs(el[5]) + Math.abs(el[10]) < 1e-12) z++; } }); return { zeroScaled: z, of: t }; };
      // the split window InstancedMesh with the most instances (ties by id)
      let im = null; A.scene.traverse(o => { if (o.isInstancedMesh && o.userData.r10 === 'window' && (!im || o.count > im.count)) im = o; });
      if (!im) return Object.assign(r, { err: 'no split window InstancedMesh' });
      const meta = A._instanceMeta[im.id], k = 0, w = new T.Vector3(meta[k]._wx, meta[k]._wy, meta[k]._wz);
      const p0 = cam.position.clone(), q0 = cam.quaternion.clone(), t0 = A.controls && A.controls.target ? A.controls.target.clone() : null;
      // rays at instance k's pane (group 1) and frame (group 0) centroids, along the pane normal
      const g = im.geometry, pos = g.attributes.position, ix = g.index.array;
      const cen = (gr) => { const c = new T.Vector3(); for (let j = gr.start; j < gr.start + 3; j++) c.add(new T.Vector3().fromBufferAttribute(pos, ix[j])); return c.multiplyScalar(1 / 3); };
      const a0 = new T.Vector3().fromBufferAttribute(pos, ix[g.groups[1].start]), b0 = new T.Vector3().fromBufferAttribute(pos, ix[g.groups[1].start + 1]), c0 = new T.Vector3().fromBufferAttribute(pos, ix[g.groups[1].start + 2]);
      const nL = new T.Vector3().subVectors(c0, b0).cross(new T.Vector3().subVectors(a0, b0)).normalize();
      // a frame triangle facing along the pane normal (so a ray along the normal meets it)
      let fs = -1; for (let j = g.groups[0].start; j < g.groups[0].start + g.groups[0].count; j += 3) {
        const x = new T.Vector3().fromBufferAttribute(pos, ix[j]), y = new T.Vector3().fromBufferAttribute(pos, ix[j + 1]), z = new T.Vector3().fromBufferAttribute(pos, ix[j + 2]);
        const nn = new T.Vector3().subVectors(z, y).cross(new T.Vector3().subVectors(x, y)); const ar = nn.length(); if (ar < 1e-4) continue;
        if (Math.abs(nn.normalize().dot(nL)) > 0.95) { fs = j; break; } }
      const hitGroups = () => {
        const M = new T.Matrix4(); im.getMatrixAt(k, M); M.premultiply(im.matrixWorld);
        const res = {};
        for (const [name, lp] of [['pane', cen(g.groups[1])], ['frame', fs >= 0 ? cen({ start: fs }) : null]]) {
          if (!lp) { res[name] = 'no front-facing frame triangle'; continue; }
          const M0 = new T.Matrix4().copy(meta[k]._origMatrix).premultiply(im.matrixWorld);   // aim with the ORIGINAL placement
          const wp = lp.clone().applyMatrix4(M0), wn = nL.clone().transformDirection(M0);
          const rc = new T.Raycaster(wp.clone().addScaledVector(wn, 0.5), wn.clone().negate(), 0, 1.0);
          const hits = rc.intersectObject(im, false).filter(h => h.instanceId === k);
          res[name] = hits.map(h => 'group' + (h.face ? h.face.materialIndex : '?')).join(',') || 'none';
        }
        return res;
      };
      r.mesh = { id: im.id, instances: im.count, groups: g.groups.length, instanceMatrixAttributes: 1, guid: meta[k].guid };
      r.before = Object.assign(zeroed(), { rays: hitGroups() });
      // turn away from instance k and nudge the camera so dlodTick re-evaluates (EVAL_EVERY frames, moved camera)
      const away = p0.clone().add(new T.Vector3().subVectors(p0, w).normalize());
      cam.lookAt(away); if (t0) A.controls.target.copy(away); cam.updateMatrixWorld();
      for (let i = 0; i < 24; i++) { cam.position.x += 0.01; cam.updateMatrixWorld(); A.dlodTick(); }
      r.away = Object.assign(zeroed(), { instanceKCulled: !!meta[k]._dlodHid, rays: hitGroups() });
      cam.position.copy(p0); cam.quaternion.copy(q0); if (t0) A.controls.target.copy(t0); cam.updateMatrixWorld();
      for (let i = 0; i < 24; i++) { cam.position.x += 0.01; cam.updateMatrixWorld(); A.dlodTick(); }
      cam.position.copy(p0); cam.updateMatrixWorld(); for (let i = 0; i < 12; i++) A.dlodTick();
      r.back = Object.assign(zeroed(), { rays: hitGroups() });
      return r;
    });
    const both = x => x && /group1/.test(x.pane) && /group0/.test(x.frame);
    const none = x => x && x.pane === 'none' && x.frame === 'none';
    const pass = dl.dlodEnabled && dl.away && dl.away.zeroScaled > 0 && dl.away.instanceKCulled && both(dl.before.rays) && none(dl.away.rays) && both(dl.back.rays) && dl.back.zeroScaled < dl.away.zeroScaled;
    say('§R10_W_DLOD ' + gD.line + ' ' + JSON.stringify(dl) + (!gD.g.full ? ' VACUOUS' : pass ? ' PASS — split instances zero-scaled off-frustum and restored; the culled instance loses BOTH groups together (no group-only drop)' : ' FAIL'));
  }

  // ── A7 GI: a real Alt+S on the real GPU ──
  if (GI && !OFF) {
    const gG = await armGate('gi');
    const pre = await p.evaluate(async () => {
      // Record, per split mesh, every gi_still.js write to .material (the geometry-pass swap, :386) and every
      // .visible=false (glass / raw-GLSL skip at :373/:374, chunked compile elsewhere), keyed by gi_still line.
      const A = window.APP, rec = window.__r10GiRec = { swapped: new Set(), hiddenBy: {}, glassSkipped: new Set(), meshes: 0 };
      const giLine = () => { const m = /gi_still\.js[^:]*:(\d+)/.exec(new Error().stack || ''); return m ? +m[1] : 0; };
      A.scene.traverse(o => {
        if (!o.userData || !o.userData.r10) return; rec.meshes++;
        let mat = o.material, vis = o.visible;
        Object.defineProperty(o, 'material', { configurable: true, get() { return mat; }, set(v) { if (v && !Array.isArray(v) && giLine()) rec.swapped.add(o.id); mat = v; } });
        Object.defineProperty(o, 'visible', { configurable: true, get() { return vis; }, set(v) { if (v === false) { const ln = giLine(); if (ln) { rec.hiddenBy[ln] = (rec.hiddenBy[ln] || 0) + 1; if (ln === 373 || ln === 374) rec.glassSkipped.add(o.id); } } vis = v; } });
      });
      // mark the geometry pass: gi_still logs its glass-skip line from inside it; the swap happens there too
      return { gpu: !!navigator.gpu, giReady: typeof window.__giStillRelease === 'function', splitMeshes: rec.meshes };
    });
    say('§R10_W_GI_PRE ' + gG.line + ' ' + JSON.stringify(pre));
    await p.evaluate(() => { window.__r10Keys = []; window.addEventListener('keydown', e => window.__r10Keys.push((e.altKey ? 'Alt+' : '') + e.key + ' active=' + !!window.APP._stillRefineActive), true); });
    await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
    say('Alt+S pressed');
    let ok = false; for (let i = 0; i < 300; i++) { const st = await p.evaluate(() => ({ a: !!window.APP._stillRefineActive, b: !!window.APP._stillRefineBusy })); if (st.a && !st.b) { ok = true; break; } await sleep(1000); }
    say('still ready=' + ok);
    let ov = false; for (let i = 0; i < 600; i++) { if (await p.evaluate(() => !!document.getElementById('gi-still-overlay'))) { ov = true; break; } await sleep(1000); }
    const post = await p.evaluate(() => { const r = window.__r10GiRec; return { swappedToGeometryMaterial: r.swapped.size, glassSkipped: r.glassSkipped.size, hiddenByGiLine: r.hiddenBy, splitMeshes: r.meshes }; });
    const diag = await p.evaluate(() => { const t = document.getElementById('gi-still-toast'); const d = window.__giStillDebug || null;
      return { keys: window.__r10Keys, toast: t ? t.textContent : null, debug: d ? JSON.stringify(d).slice(0, 600) : null }; });
    say('  [gi-diag] ' + JSON.stringify(diag));
    const giLines = L.seen.filter(t => /§GI_STILL/.test(t));
    giLines.forEach(t => say('  [gi] ' + t.slice(0, 400)));
    const geomLine = giLines.find(t => /geom pass mode=/.test(t)) || '';
    const drew = /material-swap/.test(geomLine) ? post.swappedToGeometryMaterial === post.splitMeshes : /overrideMaterial/.test(geomLine);
    say('§R10_W_GI ' + gG.line + ' overlay=' + ov + ' ' + JSON.stringify(post) + (!gG.g.full ? ' VACUOUS' : !ov || !geomLine ? ' FAIL — no bounce ran (see §GI_STILL lines)' :
      (drew && post.glassSkipped === 0 ? ' PASS — the geometry pass drew every split mesh; none skipped as glass' : ' FAIL')));
  }

  // ── A8 FPS: frame time at a fixed pose ──
  if (FPS) {
    const gF = await armGate('fps');
    const fr = await p.evaluate(async () => {
      const A = window.APP, R = A.renderer, cam = A.camera, gl = R.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      const r = A.dbQuery('SELECT MIN(center_x), MAX(center_x), MIN(center_y), MAX(center_y), MIN(center_z), MAX(center_z) FROM element_transforms')[0];
      const c = A.ifc2three((r[0] + r[1]) / 2, (r[2] + r[3]) / 2, (r[4] + r[5]) / 2), ext = Math.max(r[1] - r[0], r[3] - r[2], r[5] - r[4]);
      const base = new THREE.Vector3(c.x + ext * 0.7, c.y + ext * 0.45, c.z + ext * 0.7);
      const pose = (i) => { const a = 0.002 * Math.sin(i * 0.3); cam.position.set(base.x + a * ext, base.y, base.z - a * ext); cam.lookAt(c.x, c.y, c.z); if (A.controls && A.controls.target) A.controls.target.set(c.x, c.y, c.z); cam.updateMatrixWorld(); };
      const stat = (a) => { const s = a.slice().sort((x, y) => x - y); const m = a.reduce((x, y) => x + y, 0) / a.length; return { meanMs: +m.toFixed(2), p95Ms: +s[Math.floor(s.length * 0.95)].toFixed(2), fps: +(1000 / m).toFixed(1), n: a.length }; };
      pose(0); A.markDirty && A.markDirty();
      for (let i = 0; i < 30; i++) await new Promise(res => requestAnimationFrame(() => { pose(i); A.markDirty && A.markDirty(); res(); }));   // warm-up
      const f0 = R.info.render.frame, dts = []; let last = performance.now();
      for (let i = 0; i < 300; i++) await new Promise(res => requestAnimationFrame(t => { const now = performance.now(); dts.push(now - last); last = now; pose(i); A.markDirty && A.markDirty(); res(); }));
      const framesRendered = R.info.render.frame - f0;
      const forced = [];
      for (let i = 0; i < 100; i++) { pose(i); const t = performance.now(); R.render(A.scene, cam); gl.finish(); forced.push(performance.now() - t); }
      R.info.autoReset = true; R.render(A.scene, cam); const calls = R.info.render.calls;
      return { gpu, rafFrames: stat(dts), framesRendered, forcedRenderFinish: stat(forced), drawCalls: calls, pose: [base.x, base.y, base.z].map(x => +x.toFixed(2)) };
    });
    fr.loaded = gF.g.loaded; fr.gateFull = gF.g.full;
    fs.writeFileSync(path.join(OUT, 'fps_' + BASE + '_' + MODE + '.json'), JSON.stringify(fr));
    say('§R10_W_FPS_' + MODE.toUpperCase() + ' ' + gF.line + ' ' + JSON.stringify(fr) + (!gF.g.full ? ' VACUOUS' : fr.framesRendered < 250 ? ' FAIL — the loop did not render every nudged frame' : ''));
    const oF = path.join(OUT, 'fps_' + BASE + '_off.json'), nF = path.join(OUT, 'fps_' + BASE + '_on.json');
    if (fs.existsSync(oF) && fs.existsSync(nF)) {
      const a = JSON.parse(fs.readFileSync(oF)), c2 = JSON.parse(fs.readFileSync(nF));
      const vac = !(a.gateFull && c2.gateFull && a.loaded === c2.loaded);
      say('§SURFACE_R10_FPS bld=' + BASE + (vac ? ' VACUOUS' : '') + ' loaded ' + a.loaded + '->' + c2.loaded + ' gpu="' + c2.gpu + '"' +
        ' raf mean ' + a.rafFrames.meanMs + '->' + c2.rafFrames.meanMs + 'ms p95 ' + a.rafFrames.p95Ms + '->' + c2.rafFrames.p95Ms + 'ms fps ' + a.rafFrames.fps + '->' + c2.rafFrames.fps +
        ' | forced render+finish mean ' + a.forcedRenderFinish.meanMs + '->' + c2.forcedRenderFinish.meanMs + 'ms p95 ' + a.forcedRenderFinish.p95Ms + '->' + c2.forcedRenderFinish.p95Ms + 'ms fps ' + a.forcedRenderFinish.fps + '->' + c2.forcedRenderFinish.fps +
        ' | drawCalls ' + a.drawCalls + '->' + c2.drawCalls + ' (same pose ' + (JSON.stringify(a.pose) === JSON.stringify(c2.pose) ? 'CONFIRMED' : 'DIFFERS') + '; ?surf=off -> default)');
    }
  }
  await b.close();
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
