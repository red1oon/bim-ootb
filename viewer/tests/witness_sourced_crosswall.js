// ⚠ DO NOT REMOVE — §SOURCED_LIGHT crossWall witness (bim-compiler PHOTOREAL_STILL_RENDER.md §SOURCED_LIGHT). Read the log after every run.
// Issue: "0 lamps reaching across a wall" must hold in the RENDERED shader, not only in the CPU stack model. After a real
// Alt+S: every light off except ONE lamp L that sits in a zone other than the camera's (the nearest such lit lamp), two
// fresh renders (TAA accumulation off) with L on / L off, and a 48x27 screen grid: for each grid point, the surface zone
// (raycast + LightZones.atSurface, the same lookup the shader makes) and the 8-bit luminance delta L-on minus L-off.
// crossWall = grid points in a KNOWN zone other than L's that L still brightens (delta > 2). Pass: crossWall = 0 with
// §SOURCED_LIGHT on; the &sourced=0 arm must show crossWall > 0 (proves the witness can see a leak).
// §GLARE (watchdog red1-c6 rule, every run): crossWall=N — FAIL (exit 3) when > 0, or when no candidate lamp exists (VACUOUS).
/* global Buffer */
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const [PORT = '8611', DB = 'Clinic', POSE = '{"pos":[-13.5,-1.4,-18.3],"tgt":[4,-2.2,-18.3]}', QUERY = ''] = process.argv.slice(2);
(async () => {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 1800000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--window-size=1686,1044'] });
  const p = await b.newPage(); await p.setViewport({ width: 1666, height: 864 }); const L = []; let errs = 0;
  p.on('console', m => L.push(m.text())); p.on('pageerror', e => { errs++; console.log('PAGEERROR ' + e.message); });
  await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=/buildings/' + DB + '_extracted.db' + QUERY, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.APP && window.APP.guidMap && window.APP.db, { timeout: 240000 });
  let n = -1, st = 0; for (let i = 0; i < 150 && st < 3; i++) { await sleep(2000); const k = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (k > 0 && k === n) st++; else st = 0; n = k; }
  await p.evaluate(ps => { const A = window.APP; A.camera.position.fromArray(ps.pos); A.controls.target.fromArray(ps.tgt); A.controls.update(); }, JSON.parse(POSE));
  await sleep(1500); const b1 = L.length; await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
  for (let i = 0; i < 400 && !L.slice(b1).some(t => /§GI_STILL result|§GI_STILL_OFF|§GI_STILL_FAIL/.test(t)); i++) await sleep(1000);
  if (!(await p.evaluate(() => !!window.LightZones))) await p.addScriptTag({ url: '/viewer/light_zones.js?w=' + Date.now() });
  const r = await p.evaluate(() => {
    const A = window.APP, THREE = window.THREE, LZ = window.LightZones, Z = LZ.build(A), SOL = LZ.SOLID;
    const o = document.getElementById('gi-still-overlay'); if (o) o.style.display = 'none';
    const camZ = LZ.at(A.camera.position);
    const lamps = (A._nightLights || []).filter(l => l.intensity > 0);
    const zoneOf = l => { const v = LZ.atLamp(l.position); return (v > 0 && v !== SOL) ? v : 0; };
    const cand = lamps.filter(l => { const z = zoneOf(l); return z > 0 && z !== camZ; }).sort((a, b) => a.position.distanceTo(A.camera.position) - b.position.distanceTo(A.camera.position));
    if (!cand.length) return { err: 'no lit lamp outside the camera zone', camZ };
    const Lp = cand[0], LzOf = zoneOf(Lp);
    // every light off but Lp; remember to restore
    const saved = []; A.scene.traverse(x => { if (x.isLight) { saved.push([x, x.intensity]); if (x !== Lp) x.intensity = 0; } });
    const taa = A._taaPass ? [A._taaPass.accumulate, A._taaPass.accumulateIndex] : null; if (A._taaPass) A._taaPass.accumulate = false;
    const W = 48, H = 27, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d');
    const grab = () => { if (A._composer) A._composer.render(); else A.renderer.render(A.scene, A.camera); cx.drawImage(A.renderer.domElement, 0, 0, W, H); const d = cx.getImageData(0, 0, W, H).data; const out = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) out[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]; return out; };
    const on = grab(); const I0 = Lp.intensity; Lp.intensity = 0; const off = grab(); Lp.intensity = I0;
    // lighting-path probes: force every point light's zone uniform, re-render with Lp on
    A._slForcePZ = LzOf; const onF = grab(); A._slForcePZ = 60000; const onX = grab(); delete A._slForcePZ;
    const lpIdx = A._slLastOrder ? A._slLastOrder.pts.indexOf(Lp) : -2;
    saved.forEach(([x, v]) => { x.intensity = v; }); if (taa) { A._taaPass.accumulate = taa[0]; A._taaPass.accumulateIndex = taa[1]; } if (o) o.style.display = '';
    const drawn = (x => { const ms = Array.isArray(x.material) ? x.material : [x.material]; return ms.some(m => m && m.visible !== false && m.colorWrite !== false && !(m.opacity === 0 && m.transparent)); }); const tg = []; A.scene.traverse(x => { if ((x.isMesh || x.isInstancedMesh || x.isBatchedMesh) && x.visible && drawn(x) && x !== A._sky && !(x.userData && (x.userData.excludeFromShadow || x.userData.skyPortal))) tg.push(x); });
    const rc = new THREE.Raycaster(), M = new THREE.Matrix4(), mi = new THREE.Matrix4();
    let crossNeedLateral = 0, crossSixOk = 0, crossF = 0, crossX = 0, cross = 0, own = 0, unknown = 0, outsideLit = 0, known = 0; const crossPts = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, dl = on[i] - off[i];
      rc.setFromCamera(new THREE.Vector2((x + 0.5) / W * 2 - 1, 1 - (y + 0.5) / H * 2), A.camera); const h = rc.intersectObjects(tg, false)[0]; if (!h || !h.face) continue;
      M.copy(h.object.matrixWorld); if (h.object.isInstancedMesh && h.instanceId != null) { h.object.getMatrixAt(h.instanceId, mi); M.multiply(mi); } else if (h.object.isBatchedMesh && h.batchId != null) { h.object.getMatrixAt(h.batchId, mi); M.multiply(mi); }
      const nn = h.face.normal.clone().transformDirection(M); if (nn.dot(rc.ray.direction) > 0) nn.negate();
      let z = LZ.atSurface(h.point, nn);
      if (z === SOL) { unknown++; continue; } if (z < 0) z = 0;   // off grid = outside (§ZONE_OPEN_SKY fix: was counted unknown)
      known++;
      if (z === LzOf) { if (dl > 2) own++; continue; }
      if (onF[i] - off[i] > 2) crossF++; if (onX[i] - off[i] > 2) crossX++;
      if (dl > 2) { if (z === 0) outsideLit++; else { cross++;
        const steps = [0.2, 0.5, 0.8].map(t => LZ.at(h.point.clone().addScaledVector(nn, t))).concat([0.2, 0.5, 0.8].map(t => LZ.at(h.point.clone().addScaledVector(nn, -t))));
        const six = steps.find(v => v !== SOL); const ob = h.object; const gd = A.guidMap[ob.id + '_' + (h.batchId != null ? h.batchId : h.instanceId)] || (ob.userData && ob.userData.guid);
        let cls = (ob.userData && ob.userData.ifcClass) || '?'; if (gd) { try { const qq = A.dbQuery("SELECT ifc_class, element_name FROM elements_meta WHERE guid=?", [gd]); if (qq.length) cls = qq[0][0] + ':' + String(qq[0][1]).slice(0, 30); } catch (e) {} }
        if (six === undefined) crossNeedLateral++; else crossSixOk++;
        if (crossPts.length < 12) crossPts.push({ x, y, z, dl: +dl.toFixed(1), d: +h.distance.toFixed(1), n: [nn.x, nn.y, nn.z].map(v => +v.toFixed(2)), steps, cls, P: [h.point.x, h.point.y, h.point.z].map(v => +v.toFixed(2)) }); } }
    }
    // SHADER zones at the grid points: render the zone-debug colour into a W x H target, compare with the CPU zone per point
    let zAgree = 0, zDiff = 0, zSkip = 0, zDiffPts = [];
    if (window.SourcedLight && window.SourcedLight.debugZones) {
      const rt = new THREE.WebGLRenderTarget(W, H); window.SourcedLight.debugZones(true); const prevRT = A.renderer.getRenderTarget();
      A.renderer.setRenderTarget(rt); A.renderer.render(A.scene, A.camera); A.renderer.setRenderTarget(prevRT); window.SourcedLight.debugZones(false);
      const px = new Uint8Array(W * H * 4); A.renderer.readRenderTargetPixels(rt, 0, 0, W, H, px); rt.dispose();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        rc.setFromCamera(new THREE.Vector2((x + 0.5) / W * 2 - 1, 1 - (y + 0.5) / H * 2), A.camera); const h = rc.intersectObjects(tg, false)[0]; if (!h || !h.face) continue;
        M.copy(h.object.matrixWorld); if (h.object.isInstancedMesh && h.instanceId != null) { h.object.getMatrixAt(h.instanceId, mi); M.multiply(mi); } else if (h.object.isBatchedMesh && h.batchId != null) { h.object.getMatrixAt(h.batchId, mi); M.multiply(mi); }
        const nn = h.face.normal.clone().transformDirection(M); if (nn.dot(rc.ray.direction) > 0) nn.negate();
        const hm = Array.isArray(h.object.material) ? h.object.material[h.face.materialIndex] : h.object.material, hU = hm && A.renderer.properties.get(hm).uniforms;
        if (!(hU && hU.uSLParams)) { zSkip++; continue; }   // unlit / unpatched surface (MeshBasic glow, sky): no zone colour written
        const zc = LZ.atSurface(h.point, nn), j = ((H - 1 - y) * W + x) * 4, zs = px[j + 2] > 127 ? -1 : px[j] + 256 * px[j + 1];
        const zcN = (zc === SOL) ? -1 : (zc <= 0 ? 65534 : zc);   // the shader's convention: 0 / off grid = OUTSIDE 65534 (§ZONE_OPEN_SKY fix)
        if (zs === zcN) zAgree++; else { zDiff++; if (zDiffPts.length < 10) { const ob = h.object, chain = []; for (let q = ob; q && chain.length < 5; q = q.parent) chain.push((q.name || q.type) + (q.visible ? '' : '(hid)'));
          zDiffPts.push({ x, y, cpu: zcN, gpu: zs, d: +h.distance.toFixed(1), ny: +nn.y.toFixed(2), obj: ob.type, name: ob.name, chain, ud: Object.keys(ob.userData || {}).slice(0, 8), layers: ob.layers.mask,
            prog: (() => { const pp = A.renderer.properties.get(hm), cp = pp && pp.currentProgram; if (!cp) return 'none'; const um = cp.getUniforms().map; const gl = A.renderer.getContext(), sh = gl.getAttachedShaders(cp.program).map(x => gl.getShaderSource(x)), fs = sh.find(t => t.indexOf('gl_FragColor') >= 0 || t.indexOf('pc_fragColor') >= 0) || '';
              const tail = fs.slice(fs.lastIndexOf('#include') >= 0 ? fs.lastIndexOf('#include') : Math.max(0, fs.length - 900));
              return { fsLen: fs.length, hasDebug: fs.indexOf('uSLParams.w > 4.5') >= 0, hasSlPass: fs.indexOf('slPass( uSLPZ') >= 0, tail: fs.slice(-700), name: cp.name, usesSLParams: !!um.uSLParams, usesSLZone: !!um.uSLZone, usesSkyOcc: !!um.uSkyOcc, cacheKey: String(cp.cacheKey || '').slice(0, 80) }; })(),
            obc: hm && hm.onBeforeCompile ? hm.onBeforeCompile.toString().slice(0, 160) : null, cpk: hm && hm.customProgramCacheKey ? String(hm.customProgramCacheKey()).slice(0, 60) : null,
            mat: hm && { type: hm.type, name: hm.name, side: hm.side, transparent: hm.transparent, opacity: hm.opacity, depthWrite: hm.depthWrite, depthTest: hm.depthTest, colorWrite: hm.colorWrite }, frustumCulled: ob.frustumCulled, renderOrder: ob.renderOrder, geoVerts: ob.geometry && ob.geometry.attributes.position.count }); } }
      }
    }
    // debug modes 2 (raw cell at +0.2 m) and 3 (grid-space position) at the first few differing points
    const dbgRead = (mode) => { const rt = new THREE.WebGLRenderTarget(W, H); window.SourcedLight.debugZones(mode); const pr = A.renderer.getRenderTarget(); A.renderer.setRenderTarget(rt); A.renderer.render(A.scene, A.camera); A.renderer.setRenderTarget(pr); window.SourcedLight.debugZones(0);
      const px = new Uint8Array(W * H * 4); A.renderer.readRenderTargetPixels(rt, 0, 0, W, H, px); rt.dispose(); return px; };
    const px2 = dbgRead(2), px3 = dbgRead(3), px4 = dbgRead(4), px5 = dbgRead(5), dbg2 = zDiffPts.slice(0, 6).map(q => { const j = ((H - 1 - q.y) * W + q.x) * 4;
      rc.setFromCamera(new THREE.Vector2((q.x + 0.5) / W * 2 - 1, 1 - (q.y + 0.5) / H * 2), A.camera); const h = rc.intersectObjects(tg, false)[0];
      M.copy(h.object.matrixWorld); if (h.object.isInstancedMesh && h.instanceId != null) { h.object.getMatrixAt(h.instanceId, mi); M.multiply(mi); } else if (h.object.isBatchedMesh && h.batchId != null) { h.object.getMatrixAt(h.batchId, mi); M.multiply(mi); }
      const nn = h.face.normal.clone().transformDirection(M); if (nn.dot(rc.ray.direction) > 0) nn.negate(); const qq = h.point.clone().addScaledVector(nn, 0.2);
      const gc = [(qq.x - Z.org.x) / (Z.cell * Z.nx), (qq.y - Z.org.y) / (Z.cell * Z.ny), (qq.z - Z.org.z) / (Z.cell * Z.nz)].map(v => +v.toFixed(3));
      return { x: q.x, y: q.y, gpuRaw: px2[j + 2] > 127 ? -1 : px2[j] + 256 * px2[j + 1], cpuRaw: LZ.at(qq), gpuGrid: [px3[j], px3[j + 1], px3[j + 2]].map(v => +(v / 255).toFixed(3)), cpuGrid: gc, m4_viewLen_wpToCam_yRel: [px4[j] / 25.5, px4[j + 1] / 25.5, px4[j + 2] / 255 * 20].map(v => +v.toFixed(2)), cpuDist: +h.distance.toFixed(2), gpuViewPos: [px5[j], px5[j + 1], px5[j + 2]].map(v => +((v / 255 - 0.5) * 40).toFixed(2)), cpuViewPos: h.point.clone().applyMatrix4(A.camera.matrixWorldInverse).toArray().map(v => +v.toFixed(2)), camPos: A.camera.position.toArray().map(v => +v.toFixed(2)), cpuYRel: +(h.point.y - Z.org.y).toFixed(2) }; });
    // which materials lack the §SOURCED_LIGHT uniforms in their live program (a ShaderMaterial / custom chunk user)
    const miss = {}; A.scene.traverse(x => { if (!x.material || !x.visible) return; (Array.isArray(x.material) ? x.material : [x.material]).forEach(m => { const U = A.renderer.properties.get(m).uniforms;
      if (U && !U.uSLParams) { const k = m.type + (m.name ? ':' + m.name : '') + (m.onBeforeCompile && m.onBeforeCompile.toString().length > 20 ? '+obc' : ''); miss[k] = miss[k] || { n: 0, cls: {} }; miss[k].n++; const c = (x.userData && x.userData.ifcClass) || x.type; miss[k].cls[c] = (miss[k].cls[c] || 0) + 1; } }); });
    // what the cross points hit
    const crossHit = crossPts.map(q => { rc.setFromCamera(new THREE.Vector2((q.x + 0.5) / W * 2 - 1, 1 - (q.y + 0.5) / H * 2), A.camera); const h = rc.intersectObjects(tg, false)[0]; const m = h && (Array.isArray(h.object.material) ? h.object.material[h.face.materialIndex] : h.object.material);
      const U = m && A.renderer.properties.get(m).uniforms; return { mat: m && m.type, hasSL: !!(U && U.uSLParams), cls: h && ((h.object.userData && h.object.userData.ifcClass) || h.object.type), obj: h && h.object.type }; });
    return { dbg2, shaderZone: { agree: zAgree, differ: zDiff, skippedUnpatched: zSkip, pts: zDiffPts }, missingSL: miss, crossHit, camZone: camZ, lamp: { pos: [Lp.position.x, Lp.position.y, Lp.position.z].map(v => +v.toFixed(2)), zone: LzOf, I: +I0.toFixed(2), distToCam: +Lp.position.distanceTo(A.camera.position).toFixed(1) },
      grid: W * H, known, unknown, ownZoneLit: own, crossWall: cross, crossWhereSixStepsAllSolid: crossNeedLateral, crossWhereSixStepsFindZone: crossSixOk, forceLampZone_litOtherZone: crossF, forceNoZone_litOtherZone: crossX, lpIndexInThreeOrder: lpIdx, outsideLitByIndoorLamp: outsideLit, crossPts };
  });
  console.log('§SOURCED_LIGHT_CROSSWALL bld=' + DB + ' query=' + (QUERY || '-') + ' ' + JSON.stringify(r));
  console.log((L.slice(b1).find(t => /§SOURCED_LIGHT on/.test(t)) || '§SOURCED_LIGHT on: (none)').slice(0, 300));
  const gl = r && r.err ? null : (r ? r.crossWall : null), gfail = gl == null || gl > 0;
  console.log('§GLARE bld=' + DB + ' ' + (gfail ? 'FAIL' : 'PASS') + ' crossWall=' + (gl == null ? 'VACUOUS(' + (r && r.err) + ')' : gl) + ' pageErrors=' + errs);
  console.log('pageErrors=' + errs); await b.close(); if (errs) process.exitCode = 2; else if (gfail) process.exitCode = 3;
})().catch(e => { console.log('FATAL ' + (e && e.stack || e)); process.exit(1); });
