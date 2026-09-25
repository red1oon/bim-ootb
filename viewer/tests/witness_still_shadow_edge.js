// ⚠ DO NOT REMOVE — §STILL_SHADOW_EDGE witness (bim-compiler PHOTOREAL_STILL_RENDER.md §STILL_SHADOW_EDGE). Read the log
// after every run; the exit code is not evidence.
// Issues (red1 on v1337, 2026-09-25): sun shadows are "jagged and with a base gap"; on the Hospital aerial "too blocky and
// not correct on the wall by the wings". Proves or disproves, per pose x sun, on a 48x25 grid of camera-visible opaque
// surface points (glass skipped: it casts nothing since §SUN_GLASS_CASTERS):
//   RAY    = a ray toward the sun from point + 0.05 m x normal hits an opaque sun caster (= truly shadowed);
//   LOOKUP = the renderer's own sun term at that pixel: one float render, white Lambert override, every other light at
//            intensity 0, divided by the unshadowed sun term Isun x N.L / pi (three's Lambert) -> ~1 lit, ~0 shadowed;
//   EDGE   = the ray answer flips for a point moved (R+1) fitted texels in light space (4 directions): penumbra, apart.
//   ACNE   = RAY lit, LOOKUP < 0.5, not EDGE (false shadow).  GAP = RAY shadowed, LOOKUP > 0.5, not EDGE (lost shadow;
//   the base gap and thin casters erased by the normal offset show here; THIN = its caster's smallest extent < 0.3 m).
//   Walls are bucketed by the angle between the wall normal and the sun (horizontal), with the projected texel on the
//   surface (fitted texel / N.L) — the stretch red1 sees as blocks on walls nearly parallel to the rays.
// Also logged: every §STILL_SHADOW_FIT / §STILL_SHADOW_EDGE / §PHOTO_SHADOW_CONTACT / §PHOTO_SHADOW_BIAS line, and the
// shadow pass ms (a frame with the shadow map re-rendered minus one without, gl.finish-timed, median of 3).
// GUARD (every run): FAIL on any console "Shader Error", "Context Lost" or pageerror. Real GPU (ANGLE gl-egl, NVIDIA EGL).
// RUN: node viewer/tests/witness_still_shadow_edge.js <port> [outdir]   env: DB (default /buildings/Hospital_extracted.db),
//      WANT (63182), SUNS ("45,20" elevations, scene azimuth AZ default 200), POSES (regex over pose names), ARM (label)
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'); const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const T0 = Date.now();
const [PORT = '8615', OUT = '/tmp/witness_still_shadow_edge'] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
const DB = process.env.DB || '/buildings/Hospital_extracted.db', WANT = +(process.env.WANT || 63182), AZ = +(process.env.AZ || 200);
const SUNS = (process.env.SUNS || '45,20').split(',').map(Number), ARM = process.env.ARM || 'run';
// PREV=<before-arm log>: its §GLARE lines give sun_gap_thin per pose@sun for the thin-caster increase check
const PREV_THIN = process.env.PREV ? Object.fromEntries(fs.readFileSync(process.env.PREV, 'utf8').split('\n').map(l => /§GLARE (?:FAIL|PASS) arm=\S+ pose=(\S+) sun=(\S+) .*?sun_gap_thin=(\d+)/.exec(l)).filter(Boolean).map(m => [m[1] + '@' + m[2], +m[3]])) : null;
const lines = []; const say = s => { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(path.join(OUT, 'log_' + ARM + '.txt'), lines.join('\n')); };
const POSES = [
  { name: 'default_exterior', default: true },
  { name: 'aerial_centre', aerial: true },
  { name: 'hospital_cafe', pos: [-11.15, 2.92, 4.08], tgt: [0.75, -13.08, -7.82] },
  // Terminal (DB=/buildings/Terminal_extracted.db WANT=48428): red1's "amazing" hall still — stand-ins from witness_wash_sources.js
  { name: 'terminal_hall', hall: true }, { name: 'terminal_hall_floor', hallFloor: true },
].filter(p => !process.env.POSES || new RegExp(process.env.POSES).test(p.name));
(async () => {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 1800000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--use-angle=' + (process.env.ANGLE || 'gl-egl'), '--ignore-gpu-blocklist', '--window-size=1686,1044'] });
  const guard = { shaderError: 0, contextLost: 0, pageError: 0 };
  const p = await b.newPage(); await p.setViewport({ width: 1666, height: 864 }); const L = [];
  p.on('console', m => { const t = m.text(); L.push(t); if (/Shader Error/.test(t)) guard.shaderError++; if (/Context Lost|CONTEXT_LOST/i.test(t)) guard.contextLost++; });
  p.on('pageerror', e => { guard.pageError++; say('PAGEERROR ' + e.message.slice(0, 200)); });
  await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=' + DB + (process.env.QUERY || ''), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.APP && window.APP.guidMap && window.APP.db, { timeout: 240000 });
  let n = 0; for (let i = 0; i < 200; i++) { n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n >= WANT) break; await sleep(2000); }
  const sw = await p.evaluate(async () => { try { return (await (await fetch('/viewer/sw.js')).text()).match(/CACHE_VERSION = '([^']+)'/)[1]; } catch (e) { return '?'; } });
  say('arm=' + ARM + ' ' + DB + ' loaded ' + n + '/' + WANT + (n >= WANT ? '' : ' VACUOUS') + ' sw=' + sw);
  if (n < WANT) { await b.close(); process.exitCode = 3; return; }
  await sleep(3000);
  let glareFail = 0; const posesRun = [];
  const home = await p.evaluate(() => { const A = window.APP; return { pos: A.camera.position.toArray(), tgt: A.controls.target.toArray() }; });
  for (const ps of POSES) for (const el of SUNS) {
    await p.evaluate(() => { const o = document.getElementById('gi-still-overlay'); if (o) o.remove(); });
    await p.evaluate((ps, home) => { const A = window.APP;
      if (ps.default) { A.camera.position.fromArray(home.pos); A.controls.target.fromArray(home.tgt); }
      else if (ps.aerial) { const Z = new THREE.Box3(); A.scene.traverse(o => { if ((o.isInstancedMesh || o.isMesh) && o.visible && o.userData && /IfcSlab|IfcRoof|IfcWall/.test(o.userData.ifcClass || '')) { if (o.isInstancedMesh) { if (!o.boundingBox) o.computeBoundingBox(); Z.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld)); } else Z.union(new THREE.Box3().setFromObject(o)); } });
        const c = Z.getCenter(new THREE.Vector3()), s = Z.getSize(new THREE.Vector3()), D = Math.max(s.x, s.z);
        A.camera.position.set(c.x - 0.35 * D, Z.max.y + 0.6 * D, c.z - 0.35 * D); A.controls.target.set(c.x, Z.min.y + 0.3 * s.y, c.z); }
      else if (ps.hall || ps.hallFloor) { const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), xs = [], ys = [], zs = [];
        for (const id in A._instanceMeta) { const o = A.scene.getObjectById(+id); if (!o || !o.isInstancedMesh) continue;
          for (const m of A._instanceMeta[id]) { if (m.instanceIndex == null) continue; o.getMatrixAt(m.instanceIndex, m4); o.updateMatrixWorld(); v.setFromMatrixPosition(m4).applyMatrix4(o.matrixWorld); xs.push(v.x); ys.push(v.y); zs.push(v.z); } }
        const q = (a, f) => { a = a.slice().sort((x, y) => x - y); return a[Math.floor(f * (a.length - 1))]; };
        const x0 = q(xs, .05), x1 = q(xs, .95), y0 = q(ys, .02), y1 = q(ys, .98), z0 = q(zs, .05), z1 = q(zs, .95), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, h = y0 + 1.6;
        if (ps.hall) { A.camera.position.set(cx - (x1 - x0) * 0.1, y0 + 2, cz); A.controls.target.set(cx + (x1 - x0) * 0.25, y1, cz); }
        else if (x1 - x0 >= z1 - z0) { A.camera.position.set(x0 + 0.1 * (x1 - x0), h, cz); A.controls.target.set(x0 + 0.9 * (x1 - x0), h, cz); }
        else { A.camera.position.set(cx, h, z0 + 0.1 * (z1 - z0)); A.controls.target.set(cx, h, z0 + 0.9 * (z1 - z0)); } }
      else { A.camera.position.fromArray(ps.pos); A.controls.target.fromArray(ps.tgt); }
      A.controls.update(); A.camera.updateMatrixWorld(true); if (A.markDirty) A.markDirty(); }, ps, home);
    const sunSet = await p.evaluate((el, az) => { const A = window.APP; A.updateSky(el, az); if (A.renderer) A.renderer.shadowMap.needsUpdate = true; const d = A.sun.position.clone().normalize(); return +(Math.asin(d.y) * 180 / Math.PI).toFixed(2); }, el, AZ);
    // the still must be OFF before the press (Escape leaves a refine-only still on: a second toggle would turn it off)
    for (let i = 0; i < 20 && await p.evaluate(() => !!window.APP._stillRefineActive); i++) { if (i === 0) await p.evaluate(() => window.APP.toggleStillRefine()); await sleep(1000); }
    await sleep(1500); const b1 = L.length;
    await p.evaluate(() => window.APP.toggleStillRefine());
    for (let i = 0; i < 300 && !L.slice(b1).some(t => /§STILL_REFINE done/.test(t)); i++) await sleep(1000);
    await sleep(1500);
    const doPortals = el === SUNS[0];   // portal lights do not depend on the sun: once per pose
    const r = await p.evaluate((doPortals) => {
      const A = window.APP, T = window.THREE, R = A.renderer, gl = R.getContext(), lum = c => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      const glassy = m => m && m.transparent && m.opacity < 0.95 && !m.map && m.type !== 'MeshBasicMaterial';
      const skip = m => !m || m.isMeshBasicMaterial || m.isShaderMaterial || m.isSpriteMaterial || m.isPointsMaterial || m.visible === false || m.colorWrite === false;
      const tg = [], occ = [];
      A.scene.traverse(o => { if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh) || !o.visible || o === A._sky || (o.userData && o.userData.skyPortal)) return;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        const glassCast = o.customDepthMaterial && o.customDepthMaterial.userData && o.customDepthMaterial.userData.slGlassDiscard;
        // occluders = every drawn shadow caster, whatever its material (the skyline props are MeshBasic and cast: 2026-09-25,
        // their ground shadows were first counted as acne)
        if (o.castShadow && !glassCast && !ms.every(glassy) && o !== A.ground) occ.push(o);
        // raycast targets = every DRAWN mesh (MeshBasic props too: a sample must be the surface the frame shows, 2026-09-25)
        if (ms.every(m => !m || m.visible === false || m.colorWrite === false)) return; tg.push(o); });
      const unlit = m => !m || m.isMeshBasicMaterial || m.isShaderMaterial || m.isSpriteMaterial || m.isPointsMaterial;
      const sc = A.sun.shadow.camera, mz = A.sun.shadow.mapSize.width, texel = Math.max(sc.right - sc.left, sc.top - sc.bottom) / mz;
      const Rr = A.sun.shadow.radius, sd = A.sun.position.clone().sub(A.sun.target.position).normalize(), elev = Math.asin(sd.y) * 180 / Math.PI;
      const W = 48, H = 25, cw = R.domElement.width, ch = R.domElement.height, rc = new T.Raycaster(), M = new T.Matrix4(), mi = new T.Matrix4();
      // light-space axes (for the EDGE offsets)
      const lx = new T.Vector3().setFromMatrixColumn(sc.matrixWorld, 0).normalize(), ly = new T.Vector3().setFromMatrixColumn(sc.matrixWorld, 1).normalize();
      const pts = []; let skipFar = 0, skipBox = 0, skipUnlit = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const ndc = new T.Vector2((x + 0.5) / W * 2 - 1, 1 - (y + 0.5) / H * 2); rc.setFromCamera(ndc, A.camera); rc.far = Infinity;
        const hs = rc.intersectObjects(tg, false); let h = null;
        for (const hh of hs) { const m = Array.isArray(hh.object.material) ? hh.object.material[hh.face ? hh.face.materialIndex : 0] : hh.object.material; if (glassy(m) || !m || m.visible === false || m.colorWrite === false) continue; h = hh; break; }
        if (!h || !h.face) continue;
        { const m = Array.isArray(h.object.material) ? h.object.material[h.face.materialIndex] : h.object.material; if (unlit(m)) { skipUnlit++; continue; } }   // basic/shader: receives no sun shadow
        M.copy(h.object.matrixWorld); if (h.object.isInstancedMesh && h.instanceId != null) { h.object.getMatrixAt(h.instanceId, mi); M.multiply(mi); } else if (h.object.isBatchedMesh && h.batchId != null) { h.object.getMatrixAt(h.batchId, mi); M.multiply(mi); }
        const nn = h.face.normal.clone().transformDirection(M); if (nn.dot(rc.ray.direction) > 0) nn.negate();
        // not drawn / not shadow-mapped: beyond the camera's far plane, or outside the fitted sun box (three returns lit there)
        if (h.distance > A.camera.far * 0.98) { skipFar++; continue; }
        { const v = h.point.clone().applyMatrix4(A.sun.shadow.camera.matrixWorldInverse), c = A.sun.shadow.camera; if (v.x < c.left || v.x > c.right || v.y < c.bottom || v.y > c.top) { skipBox++; continue; } }
        pts.push({ x, y, px: Math.floor((ndc.x + 1) / 2 * cw), py: Math.floor((ndc.y + 1) / 2 * ch), P: h.point.clone(), n: nn, ground: h.object === A.ground, cls: (h.object.userData && h.object.userData.ifcClass) || (h.object === A.ground ? 'ground' : (h.object.name || h.object.type)) });
      }
      const sunRay = new T.Raycaster(); sunRay.far = 3000;
      const extent = hh => { try { const o = hh.object, bb = new T.Box3(); let m4 = o.matrixWorld.clone();
        if (o.isInstancedMesh && hh.instanceId != null) { const im = new T.Matrix4(); o.getMatrixAt(hh.instanceId, im); m4.multiply(im); if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); bb.copy(o.geometry.boundingBox); }
        else if (o.isBatchedMesh && hh.batchId != null) { const im = new T.Matrix4(); o.getMatrixAt(hh.batchId, im); m4.multiply(im); o.getBoundingBoxAt(o.getGeometryIdAt(hh.batchId), bb); }
        else { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); bb.copy(o.geometry.boundingBox); }
        const s = bb.applyMatrix4(m4).getSize(new T.Vector3()); return Math.min(s.x, s.y, s.z); } catch (e) { return null; } };
      const castAt = (P, nrm) => { sunRay.set(P.clone().addScaledVector(nrm, 0.05), sd); const h = sunRay.intersectObjects(occ, false)[0]; return h || null; };
      const casterName = h => (h.object.userData && h.object.userData.ifcClass) || h.object.name || h.object.type;
      pts.forEach(q => { q.nl = q.n.dot(sd); if (q.nl <= 0.1) return; const h = castAt(q.P, q.n); q.ray = h ? 1 : 0; q.thin = h ? (extent(h) != null && extent(h) < 0.3) : false; q.caster = h ? casterName(h) : ''; });
      // EDGE is tested only where RAY and LOOKUP disagree (after the lookup): 5x fewer rays, same verdicts
      const edgeTest = q => { const off = (Rr + 1) * texel; for (const v of [lx, ly]) for (const sg of [-1, 1]) { const P2 = q.P.clone().addScaledVector(v, sg * off); if ((castAt(P2, q.n) ? 1 : 0) !== q.ray) return true; } return false; };
      // LOOKUP: sun-only white Lambert, float target, no tone mapping (render target)
      const saved = []; A.scene.traverse(l => { if (l.isLight && l !== A.sun) { saved.push([l, l.intensity]); l.intensity = 0; } });
      const prevEnv = A.scene.environment, prevBg = A.scene.background, prevOv = A.scene.overrideMaterial, prevRT = R.getRenderTarget(), vo = A.camera.view ? Object.assign({}, A.camera.view) : null;
      if (A.camera.clearViewOffset) A.camera.clearViewOffset();
      const white = new T.MeshLambertMaterial({ color: 0xffffff }), rt = new T.WebGLRenderTarget(cw, ch, { type: T.FloatType, depthBuffer: true });
      const buf = new Float32Array(4);
      let lookupOk = true;
      try { A.scene.environment = null; A.scene.background = null; A.scene.overrideMaterial = white; R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear(true, true, true); R.render(A.scene, A.camera);
        if (A.markDirty) A.markDirty();
        const Isun = lum(A.sun.color) * A.sun.intensity;
        pts.forEach(q => { if (q.ray == null) return; R.readRenderTargetPixels(rt, q.px, q.py, 1, 1, buf); q.look = (0.2126 * buf[0] + 0.7152 * buf[1] + 0.0722 * buf[2]) / Math.max(1e-9, Isun * q.nl / Math.PI); }); }
      catch (e) { lookupOk = String(e.message || e); }
      finally { R.setRenderTarget(prevRT); A.scene.environment = prevEnv; A.scene.background = prevBg; A.scene.overrideMaterial = prevOv; saved.forEach(s => { s[0].intensity = s[1]; }); rt.dispose(); white.dispose();
        if (vo && vo.enabled && A.camera.setViewOffset) A.camera.setViewOffset(vo.fullWidth, vo.fullHeight, vo.offsetX, vo.offsetY, vo.width, vo.height); }
      // SHADOWED LOCAL LIGHTS (the 8 shadowed sky portals; lamps cast none today — counted): per light, the samples in its cone
      // with a clear expected term; RAY = a ray from the sample toward the light hits an opaque caster before it; LOOKUP = the
      // render with ONLY this light on / three's analytic term (I x 1/max(d^decay,0.01) x cone smoothstep x N.L / pi); EDGE =
      // the ray flips for the point moved (R+1) of that map's texels (at the sample's distance) across the ray, 4 directions.
      function T0s() { return { n: 0, litOk: 0, shOk: 0, acne: 0, gap: 0, gapThin: 0, edge: 0, edgeMismatch: 0 }; }
      const kindOf = q => q.ground ? 'ground' : (q.n.y > 0.7 ? 'floor' : (q.n.y < -0.7 ? 'ceiling' : (Math.abs(q.n.y) < 0.3 ? 'wall' : 'slope')));
      const spotRes = { why: {}, lights: 0, shadowedLamps: 0, byLight: [], all: T0s(), ceilings: T0s(), columns: T0s(), walls: T0s(), floors: T0s() };
      const locals = []; A.scene.traverse(l => { if ((l.isSpotLight || l.isPointLight) && l.visible && l.castShadow && l.intensity > 0) locals.push(l); });
      spotRes.lights = locals.length; spotRes.shadowedLamps = locals.filter(l => l.isPointLight).length;
      const lightRay = new T.Raycaster();
      const LZ = window.LightZones, SLon = !!(window.SourcedLight && window.SourcedLight.isActive && window.SourcedLight.isActive() && LZ && LZ.get());
      // §SOURCED_LIGHT binds each portal to its zone (sourced_light.js bindLights/slPass): a sample in another zone gets NO light
      // from it by design — not a shadow. Mirror: fragment zone = LZ.atSurface (off-grid / 0 -> OUTSIDE 65534, SOLID -> -1 unknown).
      const fragZone = q => { if (!SLon) return -1; const v = LZ.atSurface(q.P, q.n); return v === LZ.SOLID ? -1 : ((v <= 0) ? 65534 : v); };
      const portalZone = l => { if (!SLon) return 0; let v = LZ.at(l.position); if (v === LZ.SOLID) v = LZ.atLamp(l.position); return (v > 0 && v !== LZ.SOLID) ? v : 0; };
      spotRes.zoneCulled = 0; spotRes.run = doPortals;
      for (const Lt of (doPortals ? locals.filter(l => l.isSpotLight) : [])) { const pz = portalZone(Lt);
        const lp = Lt.getWorldPosition(new T.Vector3()), ld = Lt.target.getWorldPosition(new T.Vector3()).sub(lp).normalize();
        const coneCos = Math.cos(Lt.angle), penCos = Math.cos(Lt.angle * (1 - Lt.penumbra)), I = lum(Lt.color) * Lt.intensity, ms2 = Lt.shadow.mapSize.width, Rs = Lt.shadow.radius;
        const cand = [];
        pts.forEach(q => { const v = lp.clone().sub(q.P), d = v.length(); v.normalize(); const nl = q.n.dot(v); if (nl <= 0.1) return;
          if (pz > 0) { const fz = fragZone(q); if (fz !== -1 && fz !== pz) { spotRes.zoneCulled++; return; } }
          const ac = -v.dot(ld); const tt = Math.max(0, Math.min(1, (ac - coneCos) / Math.max(1e-6, penCos - coneCos))), cone = tt * tt * (3 - 2 * tt); if (cone < 0.05) return;
          const exp = I / Math.max(Math.pow(d, Lt.decay), 0.01) * cone * nl / Math.PI; if (!(exp > 1e-6)) return;
          lightRay.set(q.P.clone().addScaledVector(q.n, 0.05), v); lightRay.far = Math.max(0, d - 0.1); const hh = lightRay.intersectObjects(occ, false)[0];
          const tx = 2 * d * Math.tan(Lt.angle) / ms2, off = (Rs + 1) * tx, a1 = new T.Vector3().crossVectors(v, Math.abs(v.y) < 0.9 ? new T.Vector3(0, 1, 0) : new T.Vector3(1, 0, 0)).normalize(), a2 = new T.Vector3().crossVectors(v, a1).normalize();
          const flipF = () => { for (const ax of [a1, a2]) for (const sg of [-1, 1]) { const P2 = q.P.clone().addScaledVector(ax, sg * off), v2 = lp.clone().sub(P2), d2 = v2.length(); lightRay.set(P2.addScaledVector(q.n, 0.05), v2.normalize()); lightRay.far = Math.max(0, d2 - 0.1); if ((lightRay.intersectObjects(occ, false).length ? 1 : 0) !== (hh ? 1 : 0)) return true; } return false; };
          cand.push({ q, exp, ray: hh ? 1 : 0, thin: hh ? (extent(hh) != null && extent(hh) < 0.3) : false, caster: hh ? casterName(hh) : '', flipF }); });
        if (!cand.length) continue;
        const keep = []; A.scene.traverse(l => { if (l.isLight && l !== Lt) { keep.push([l, l.intensity]); l.intensity = 0; } });
        const rt2 = new T.WebGLRenderTarget(cw, ch, { type: T.FloatType, depthBuffer: true }), white2 = new T.MeshLambertMaterial({ color: 0xffffff }), vo2 = A.camera.view ? Object.assign({}, A.camera.view) : null;
        const pEnv = A.scene.environment, pBg = A.scene.background, pOv = A.scene.overrideMaterial, pRT = R.getRenderTarget(); if (A.camera.clearViewOffset) A.camera.clearViewOffset();
        const rec = { pos: lp.toArray().map(v => +v.toFixed(1)), samples: cand.length, acne: 0, gap: 0, edge: 0, bias: Lt.shadow.bias, normalBias: Lt.shadow.normalBias, mapSize: ms2, radius: Rs };
        try { A.scene.environment = null; A.scene.background = null; A.scene.overrideMaterial = white2; R.setRenderTarget(rt2); R.setClearColor(0x000000, 0); R.clear(true, true, true); R.render(A.scene, A.camera);
          cand.forEach(c => { R.readRenderTargetPixels(rt2, c.q.px, c.q.py, 1, 1, buf); const look = (0.2126 * buf[0] + 0.7152 * buf[1] + 0.0722 * buf[2]) / c.exp, lk = look > 0.5 ? 1 : 0;
            c.edge = (lk !== 1 - c.ray) ? c.flipF() : false; c.look = look;
            if (!c.edge && lk !== 1 - c.ray) { const k = (c.ray ? 'gap ' : 'acne ') + (c.q.cls || '?') + ' ' + kindOf(c.q) + (c.ray ? ' by ' + c.caster : ''); spotRes.why[k] = (spotRes.why[k] || 0) + 1; }
            const bks = [spotRes.all]; if (c.q.cls === 'IfcColumn') bks.push(spotRes.columns); if (c.q.n.y < -0.7) bks.push(spotRes.ceilings); else if (c.q.n.y > 0.7) bks.push(spotRes.floors); else if (Math.abs(c.q.n.y) < 0.3) bks.push(spotRes.walls);
            bks.forEach(t => { t.n++; if (c.edge) { t.edge++; if (lk === c.ray) t.edgeMismatch++; return; } if (c.ray === 0 && lk === 1) t.litOk++; else if (c.ray === 1 && lk === 0) t.shOk++; else if (c.ray === 0) t.acne++; else { t.gap++; if (c.thin) t.gapThin++; } });
            if (!c.edge && lk !== 1 - c.ray) { if (c.ray === 0) rec.acne++; else rec.gap++; } if (c.edge) rec.edge++; }); }
        finally { R.setRenderTarget(pRT); A.scene.environment = pEnv; A.scene.background = pBg; A.scene.overrideMaterial = pOv; keep.forEach(k => { k[0].intensity = k[1]; }); rt2.dispose(); white2.dispose();
          if (vo2 && vo2.enabled && A.camera.setViewOffset) A.camera.setViewOffset(vo2.fullWidth, vo2.fullHeight, vo2.offsetX, vo2.offsetY, vo2.width, vo2.height); if (A.markDirty) A.markDirty(); }
        spotRes.byLight.push(rec);
      }
      // shadow-pass ms: frame with the map re-rendered minus frame without, median of 3
      const tf = up => { if (up) R.shadowMap.needsUpdate = true; gl.finish(); const t0 = performance.now(); R.render(A.scene, A.camera); gl.finish(); return performance.now() - t0; };
      const ms = []; for (let i = 0; i < 3; i++) ms.push(tf(true) - tf(false)); ms.sort((a, b) => a - b);
      // tallies
      const shInt = A.sun.shadow.intensity == null ? 1 : A.sun.shadow.intensity, thr = 1 - shInt / 2;
      const T0 = () => ({ n: 0, litOk: 0, shOk: 0, acne: 0, gap: 0, gapThin: 0, edge: 0, edgeMismatch: 0 });
      const all = T0(), ground = T0(), floors = T0(), ceilings = T0(), columns = T0(), walls = {}, wallTexel = {}, mism = [];
      const add = (t, q) => { t.n++; const lk = q.look > thr ? 1 : 0; if (q.edge) { t.edge++; if (lk === q.ray) t.edgeMismatch++; return; }
        if (q.ray === 0 && lk === 1) t.litOk++; else if (q.ray === 1 && lk === 0) t.shOk++; else if (q.ray === 0) t.acne++; else { t.gap++; if (q.thin) t.gapThin++; } };
      const why = {};
      pts.forEach(q => { if (q.ray == null || q.look == null) return; const lk0 = q.look > thr ? 1 : 0; q.edge = (lk0 === q.ray) ? edgeTest(q) : false;
        if (!q.edge && lk0 === q.ray) { const hn = new T.Vector3(q.n.x, 0, q.n.z), hs = new T.Vector3(sd.x, 0, sd.z).normalize(); const ang = hn.lengthSq() > 1e-6 ? Math.round(Math.acos(Math.max(-1, Math.min(1, hn.normalize().dot(hs)))) * 180 / Math.PI / 15) * 15 : '-';
          const k = (q.ray ? 'gap ' : 'acne ') + q.cls + ' ' + kindOf(q) + ' nrm-sun' + ang + (q.ray ? ' by ' + q.caster + (q.thin ? ' (thin)' : '') : ''); why[k] = (why[k] || 0) + 1; }
        add(all, q);
        if (q.cls === 'IfcColumn') add(columns, q);
        if (q.ground) add(ground, q); else if (q.n.y > 0.7) add(floors, q); else if (q.n.y < -0.7) add(ceilings, q);
        else if (Math.abs(q.n.y) < 0.3) { const hn = new T.Vector3(q.n.x, 0, q.n.z).normalize(), hs = new T.Vector3(sd.x, 0, sd.z).normalize(); const ang = Math.round(Math.acos(Math.max(-1, Math.min(1, hn.dot(hs)))) * 180 / Math.PI / 15) * 15;
          const k = 'nrm-sun ' + ang + 'deg'; walls[k] = walls[k] || T0(); add(walls[k], q); (wallTexel[k] = wallTexel[k] || []).push(texel / q.nl); }
        const lk = q.look > thr ? 1 : 0; if (!q.edge && lk === q.ray && mism.length < 12) mism.push({ px: [q.x, q.y], p: q.P.toArray().map(v => +v.toFixed(2)), n: q.n.toArray().map(v => +v.toFixed(2)), ray: q.ray, look: +q.look.toFixed(3), thin: q.thin, cls: q.cls, ground: q.ground }); });
      const med = a => { a = a.slice().sort((x, y) => x - y); return +a[Math.floor(a.length / 2)].toFixed(3); };
      const wt = {}; Object.keys(wallTexel).forEach(k => { wt[k] = med(wallTexel[k]); });
      return { lookupOk, sunElevDeg: +elev.toFixed(2), texel: +texel.toFixed(4), box: [+(sc.right - sc.left).toFixed(1), +(sc.top - sc.bottom).toFixed(1)], mapSize: mz, near: +sc.near.toFixed(1), far: +sc.far.toFixed(1), range: +(sc.far - sc.near).toFixed(1),
        radius: Rr, normalBias: +A.sun.shadow.normalBias.toFixed(4), bias: A.sun.shadow.bias, worldBias: +(-A.sun.shadow.bias * (sc.far - sc.near)).toFixed(4), shadowIntensity: shInt,
        predictedBaseGap45: +((-A.sun.shadow.bias * (sc.far - sc.near)) / Math.tan(Math.PI / 4)).toFixed(4), predictedBaseGapHere: +((-A.sun.shadow.bias * (sc.far - sc.near)) / Math.tan(elev * Math.PI / 180)).toFixed(4),
        shadowPassMs: +ms[1].toFixed(1), samples: pts.length, skippedBeyondCameraFar: skipFar, skippedOutsideSunBox: skipBox, cameraFar: A.camera.far, skippedUnlitSurface: skipUnlit, why: Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 5), portalWhy: Object.entries(spotRes.why).sort((a, b) => b[1] - a[1]).slice(0, 5), all, ground, floors, ceilings, columns, walls, spots: spotRes, wallProjectedTexelMedian: wt, mismatches: mism, cam: A.camera.position.toArray().map(v => +v.toFixed(1)) };
    }, doPortals);
    const G = { sun_acne: r.all.acne, sun_gap: r.all.gap, sun_gap_thin: r.all.gapThin, sun_ceiling_acne: r.ceilings.acne, sun_column_acne: r.columns.acne,
      portal_acne: r.spots.all.acne, portal_gap: r.spots.all.gap, portal_ceiling_acne: r.spots.ceilings.acne, portal_column_acne: r.spots.columns.acne, portal_ceiling_gap: r.spots.ceilings.gap };
    // THIN (watchdog): sun_gap_thin in this arm vs the same pose x sun in the kept before-arm log (PREV=<log path>); any increase FAILs
    let thinUp = 0, thinPrev = null; if (PREV_THIN) { thinPrev = PREV_THIN[ps.name + '@' + el]; if (thinPrev != null && r.all.gapThin > thinPrev) thinUp = r.all.gapThin - thinPrev; }
    G.sun_gap_thin_increase = thinUp;
    const bad = Object.values(G).some(v => v > 0) || r.lookupOk !== true; if (bad) glareFail++; posesRun.push(ps.name);
    say('§GLARE ' + (bad ? 'FAIL' : 'PASS') + ' arm=' + ARM + ' pose=' + ps.name + ' sun=' + el + ' ' + Object.entries(G).map(e => e[0] + '=' + e[1]).join(' ') + ' (outside EDGE; target 0 each) sunSamples=' + r.all.n + ' portalSamples=' + r.spots.all.n + ' shadowedLocalLights=' + r.spots.lights + ' (lamps ' + r.spots.shadowedLamps + ')' + (r.spots.run ? ' portalZoneCulled=' + r.spots.zoneCulled : ' portals=once-per-pose(skipped)') +
      ' thinPrev=' + thinPrev + ' skippedUnlit=' + r.skippedUnlitSurface + ' skippedOutsideSunBox=' + r.skippedOutsideSunBox);
    say('   §GLARE_WHY sun top5 ' + JSON.stringify(r.why) + ' | portal top5 ' + JSON.stringify(r.portalWhy));
    const g = re => L.slice(b1).filter(t => re.test(t)).map(t => t.slice(0, 400));
    say('§STILL_SHADOW_EDGE_WITNESS arm=' + ARM + ' pose=' + ps.name + ' sunSet=' + sunSet + ' ' + JSON.stringify(r));
    [/§STILL_SHADOW_FIT env/, /§STILL_SHADOW_EDGE /, /§PHOTO_SHADOW_CONTACT/, /§PHOTO_SHADOW_BIAS/, /§STILL_SHADOW_RADIUS/].forEach(re => g(re).forEach(t => say('   [page] ' + t)));
    const act = await p.evaluate(() => !!window.APP._stillRefineActive); say('   stillActiveAtSample=' + act);
    if (act) await p.evaluate(() => window.APP.toggleStillRefine()); await sleep(2500);
  }
  // PENDING = red1's reported v1337 defects this witness does not measure in THIS run: a green summary must not hide them
  const pending = ['black_exterior (zone witness)', 'junction_zone_flip (zone witness)', 'covered_open_side_black (zone witness)'];
  if (!posesRun.some(n => /^terminal_hall/.test(n))) pending.push('terminal_hall ceiling halos / column-top band / mid-ceiling smear (no Terminal pose in this run)');
  if (!posesRun.some(n => /stair/.test(n))) pending.push('hospital atrium stair-tower wall sawtooth (red1 pose not yet known)');
  say('§GLARE_SUMMARY ' + (glareFail ? 'FAIL' : (pending.length ? 'PASS-WITH-PENDING' : 'PASS')) + ' arm=' + ARM + ' failingPoseSuns=' + glareFail + ' PENDING=' + JSON.stringify(pending));
  if (glareFail) process.exitCode = 4;
  const fail = guard.shaderError || guard.contextLost || guard.pageError;
  say('GUARD ' + (fail ? 'FAIL' : 'PASS') + ' ' + JSON.stringify(guard)); await b.close(); if (fail) process.exitCode = 2;
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
