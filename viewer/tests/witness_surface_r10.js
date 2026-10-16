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
// Usage: node viewer/tests/witness_surface_r10.js --port 8605 --db /buildings/Hospital_extracted.db [--off] [--merge] [--shadow]
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = (k, d) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d;
const PORT = +arg('--port', 8605), DB = arg('--db', '/buildings/Hospital_extracted.db');
const OFF = process.argv.includes('--off'), MERGE = process.argv.includes('--merge'), SHADOW = process.argv.includes('--shadow');
const OUT = process.env.OUT || '/tmp/witness_surface_r10'; fs.mkdirSync(OUT, { recursive: true });
const BASE = path.basename(DB, '.db');
const MODE = (OFF ? 'off' : 'on') + (MERGE ? '_merge' : '');
const TAG = BASE + '_' + MODE + (SHADOW ? '_shadow' : '');
const LOG = path.join(OUT, 'log_' + TAG + '.txt'); const lines = []; const T0 = Date.now();
function say(s) { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(LOG, lines.join('\n')); }

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
  for (const bb of blds) for (let attempt = 0; attempt < 2; attempt++) {
    if (!AUTO || attempt > 0) await p.evaluate(x => { try { window.APP.streamBuilding(x || window.APP.activeBuilding); } catch (e) {} }, bb);
    let prev = -1, st = 0;
    for (let i = 0; i < 200 && st < 3; i++) {
      const n = await p.evaluate(() => Object.keys(window.APP.guidMap).length + Object.keys(window.APP._mergedIndex || {}).length);
      const done = await p.evaluate(() => !window.APP.streaming);
      st = (n === prev && n > 0 && done) ? st + 1 : 0; prev = n; await sleep(2000);
    }
    guids = prev;
    const full = await p.evaluate(() => ({ streamed: window.APP.streamedCount, queue: (window.APP.streamQueue || []).length }));
    say('streamed ' + bb + ' guids(+merged)=' + prev + ' streamedCount=' + full.streamed + '/' + full.queue);
    // A short stream (streamedCount < queue, seen as whole 500-element first batches missing when the witness's
    // streamBuilding races the page's own auto-stream) would make the off/on cost compare different scenes.
    if (full.streamed === full.queue && full.queue > 0) break;
    say('short stream — re-streaming ' + bb + ' once');
  }
  return { p, guids, seen };
}

(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--use-angle=gl-egl'] });
  let L = await loadOnce(b);
  if (!(L.guids > 0)) { say('guids=0 — transient empty load, re-running ONCE'); await L.p.close(); L = await loadOnce(b); }
  const p = L.p;
  if (!(L.guids > 0)) { say('FAIL empty load twice (guids=0) — nothing judged'); await b.close(); process.exit(2); }

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
  say('§R10_W_PATHS ' + JSON.stringify(paths));
  if (OFF) {
    const offOk = paths.surf === false && paths.meshes === 0 && paths.r10Guids === 0 && L.seen.some(t => /§SURFACE_R10 OFF/.test(t)) && !L.seen.some(t => /§SURFACE_R10_SPLIT/.test(t));
    say('§R10_W_OFF ' + (offOk ? 'PASS' : 'FAIL') + ' — ?surf=off: split meshes=' + paths.meshes + ' r10Guids=' + paths.r10Guids + ' OFF line=' + L.seen.some(t => /§SURFACE_R10 OFF/.test(t)));
  } else {
    say('§R10_W_GROUPS ' + (paths.meshes > 0 && paths.groupsOk === paths.meshes && paths.inBatch === 0 && paths.inMerged === 0 && paths.inInstanceMeta === paths.instancedMeshes ? 'PASS' : 'FAIL') +
      ' meshes=' + paths.meshes + ' groupsOk=' + paths.groupsOk + ' splitGuidsInBatch=' + paths.inBatch + ' splitGuidsInMerged=' + paths.inMerged +
      ' instancedInInstanceMeta=' + paths.inInstanceMeta + '/' + paths.instancedMeshes + ' paneTransparentMeshes=' + paths.paneTransparent + ' doorLeafR7Meshes=' + paths.doorLeafR7);
    // DLOD: point the camera away from the model, tick, count zero-scaled split instances; then restore.
    const dl = await p.evaluate(async () => {
      const A = window.APP; if (!A._dlodEnabled || !A.dlodTick) return { skipped: 'dlod not enabled (' + A._dlodEnabled + ')' };
      const cam = A.camera, p0 = cam.position.clone(), q0 = cam.quaternion.clone();
      const e = new THREE.Matrix4(), s = new THREE.Vector3(), q = new THREE.Quaternion(), v = new THREE.Vector3();
      const count = (all) => { let z = 0, t = 0; A.scene.traverse(o => { if (!o.isInstancedMesh || (!all && !o.userData.r10)) return; for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, e); e.decompose(v, q, s); t++; if (s.lengthSq() < 1e-12) z++; } }); return { z, t }; };
      const before = count();
      cam.position.set(p0.x + 5000, p0.y + 5000, p0.z + 5000); cam.lookAt(p0.x + 10000, p0.y + 10000, p0.z + 10000); cam.updateMatrixWorld();
      for (let i = 0; i < 12; i++) A.dlodTick();
      const away = count(), awayAll = count(true);
      cam.position.copy(p0); cam.quaternion.copy(q0); cam.updateMatrixWorld();
      for (let i = 0; i < 12; i++) A.dlodTick();
      const back = count();
      return { before, away, back, awayAllInstances: awayAll };
    });
    say('§R10_W_DLOD ' + JSON.stringify(dl) + (!dl.away ? '' : dl.awayAllInstances.z === 0 ? ' INCONCLUSIVE — DLOD zero-scaled NO instance of ANY mesh in this headless run (not specific to split meshes); only the registration (instancedInInstanceMeta) is proved'
      : (dl.away.z > 0 && dl.back.z <= dl.before.z ? ' PASS — split instances zero-scaled when off-frustum and restored' : ' FAIL — DLOD culled other instances but not split ones')));
    // Alt+S bounce geometry pass predicate (gi_still.js §GI_GLASS_SKIP + material-swap): a mesh whose material is
    // an ARRAY is never hidden as glass and is swapped to the one geometry material -> split meshes are drawn.
    const gi = await p.evaluate(() => { let drawn = 0, hidden = 0; window.APP.scene.traverse(o => { if (!o.userData || !o.userData.r10 || !o.visible) return; const m = o.material; if (!m || Array.isArray(m)) drawn++; else if (m.transparent && m.opacity < 0.9) hidden++; else drawn++; }); return { drawn, hidden }; });
    say('§R10_W_GI_PREDICATE splitMeshesDrawnByGeometryPass=' + gi.drawn + ' hiddenAsGlass=' + gi.hidden + ' (gi_still.js swap rule applied to the live scene; the WebGPU pass itself is not run headless)');
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
    return { streamed: A.streamedCount, pose: [A.camera.position.x, A.camera.position.y, A.camera.position.z, c.x, c.y, c.z].map(x => +x.toFixed(2)), ...out };
  });
  fs.writeFileSync(path.join(OUT, 'cost_' + BASE + '_' + MODE + '.json'), JSON.stringify(cost));
  say('§R10_W_COST_' + MODE.toUpperCase() + ' ' + JSON.stringify(cost));
  const offF = path.join(OUT, 'cost_' + BASE + '_off.json'), onF = path.join(OUT, 'cost_' + BASE + '_on.json');
  if (!MERGE && fs.existsSync(offF) && fs.existsSync(onF)) {
    const a = JSON.parse(fs.readFileSync(offF)), c2 = JSON.parse(fs.readFileSync(onF));
    say('§SURFACE_R10_COST bld=' + BASE + ' drawCalls ' + a.calls + '->' + c2.calls + ' transparent ' + a.transparent + '->' + c2.transparent +
      ' triangles ' + a.triangles + '->' + c2.triangles + ' streamed ' + a.streamed + '->' + c2.streamed + ' (same pose ' + (JSON.stringify(a.pose) === JSON.stringify(c2.pose) ? 'CONFIRMED' : 'DIFFERS ' + JSON.stringify(a.pose) + ' vs ' + JSON.stringify(c2.pose)) + '; ?surf=off -> default)');
  }

  // ── A3 SHADOW arm: sun through a pane onto the floor behind it ──
  if (SHADOW && !OFF) {
    const sh = await p.evaluate(async () => {
      const A = window.APP, T = THREE, R = A.renderer, S = A.scene;
      const ray = new T.Raycaster(); const up = new T.Vector3(0, 1, 0);
      const meshes = []; S.traverse(o => { if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible && !(o.userData && o.userData.r10)) meshes.push(o); });
      // candidate panes: every split window instance
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
          const wc = ctr.clone().applyMatrix4(M), wn = n.clone().transformDirection(M);
          cands.push({ o, i, wc, wn, guid: (A._instanceMeta[o.id] ? A._instanceMeta[o.id][i].guid : o.userData.guid) });
        }
      });
      const elev = 40 * Math.PI / 180;
      let pick = null;
      for (const cd of cands) {
        const nh = new T.Vector3(cd.wn.x, 0, cd.wn.z); if (nh.lengthSq() < 0.5) continue; nh.normalize();
        for (const sgn of [1, -1]) {
          const d = nh.clone().multiplyScalar(-sgn * Math.cos(elev)).add(new T.Vector3(0, -Math.sin(elev), 0)).normalize();
          ray.set(cd.wc.clone().addScaledVector(d, -0.05), d.clone().negate()); ray.far = 60;
          const out = ray.intersectObjects(meshes, false); if (out.length) continue;          // sun side must be open
          ray.set(cd.wc.clone().addScaledVector(d, 0.05), d); ray.far = 12;
          const inn = ray.intersectObjects(meshes, false); if (!inn.length) continue;
          const h = inn[0]; const fn = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : null;
          if (!fn || Math.abs(fn.y) < 0.9 || h.distance < 1.0) continue;                   // must land on a floor, not the sill
          pick = { cd, d, hit: h.point.clone(), dist: h.distance, hitCls: h.object.userData.ifcClass || (A._batchMeta[h.object.id] ? 'batched' : '?') }; break;
        }
        if (pick) break;
      }
      if (!pick) return { err: 'no pane with open sky outside and a floor behind it among ' + cands.length + ' split windows' };
      // stage: sun along -d onto the hit point, all visible meshes cast + receive
      const sun = A.sun, prev = { cs: sun.castShadow, pos: sun.position.clone(), tgt: sun.target.position.clone(), en: R.shadowMap.enabled, bg: S.background, ov: S.overrideMaterial, cam: A.camera.position.clone(), q: A.camera.quaternion.clone() };
      R.shadowMap.enabled = true; R.shadowMap.autoUpdate = true;
      sun.castShadow = true; sun.position.copy(pick.hit).addScaledVector(pick.d, -40); sun.target.position.copy(pick.hit); sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
      const sc = sun.shadow.camera; sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 0.5; sc.far = 120; sc.updateProjectionMatrix();
      if (sun.shadow.mapSize.x < 2048) { sun.shadow.mapSize.set(2048, 2048); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
      S.traverse(o => { if (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) { o.castShadow = true; o.receiveShadow = true; } });
      const cam = A.camera, dh = new T.Vector3(pick.d.x, 0, pick.d.z).normalize();
      cam.position.copy(pick.hit).add(new T.Vector3(0, 2.2, 0)).addScaledVector(dh, 1.2); cam.lookAt(pick.hit); cam.updateMatrixWorld();
      const W = 256, rt = new T.WebGLRenderTarget(W, W), px = new Uint8Array(W * W * 4);
      const smat = new T.ShadowMaterial({ color: 0x000000, opacity: 1 });
      const measure = () => {
        S.background = null; S.overrideMaterial = smat; R.shadowMap.needsUpdate = true;
        const cc = new T.Color(); R.getClearColor(cc); const ca = R.getClearAlpha(); R.setClearColor(0xffffff, 1);
        const asp = cam.aspect; cam.aspect = 1; cam.updateProjectionMatrix();
        R.setRenderTarget(rt); R.clear(); R.render(S, cam); R.readRenderTargetPixels(rt, 0, 0, W, W, px); R.setRenderTarget(null);
        cam.aspect = asp; cam.updateProjectionMatrix(); R.setClearColor(cc, ca); S.overrideMaterial = prev.ov; S.background = prev.bg;
        let lit = 0, dark = 0; for (let i = 0; i < W * W; i++) { if (px[i * 4] > 127) lit++; else dark++; }
        return { lit, dark };
      };
      const split = []; S.traverse(o => { if (o.userData && o.userData.r10 === 'window') split.push(o); });
      split.forEach(o => { o.customDepthMaterial = undefined; });
      const before = measure();                                   // panes cast (what three.js does per mesh without the fix)
      split.forEach(o => { o.customDepthMaterial = A._r10DepthMaterial(); });
      const after = measure();                                    // panes discarded in the depth pass
      // restore
      sun.castShadow = prev.cs; sun.position.copy(prev.pos); sun.target.position.copy(prev.tgt); R.shadowMap.enabled = prev.en;
      cam.position.copy(prev.cam); cam.quaternion.copy(prev.q); cam.updateMatrixWorld(); rt.dispose(); smat.dispose();
      return { window: pick.cd.guid, hitClass: pick.hitCls, rayToFloor_m: +pick.dist.toFixed(2), sunElevDeg: 40, readback: W + 'x' + W,
        before, after, depthProgramsCompiled: A._r10DepthCompiled || 0, candidates: cands.length };
    });
    say('§R10_W_GLASS_SHADOW ' + JSON.stringify(sh) + (sh.after && sh.before ? (sh.after.lit > sh.before.lit ? ' PASS — more of the floor is lit with the pane discarded (frames still cast: see §SURFACE_R10_SHADOW)' : ' FAIL — the pane still blocks the sun') : ''));
  }
  await b.close();
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
