// ⚠ DO NOT REMOVE — §ZONE_OPEN_SKY witness (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md "§ZONE_OPEN_SKY — SPEC"). Read the log after every run.
// Issues (red1 on v1337, watchdog brief 2026-09-25), proved or disproved per building after a REAL Alt+S, § numbers only:
//   §SKY_LOSS  sun-shaded exterior surfaces in courtyards / light wells / gaps between wings render BLACK because the 4.5 m-
//              closing OUTSIDE rule seals them as indoor zones (no hemi / ambient / IBL). 48x25 grid of camera-visible surface
//              points (glass / basic / shader / invisible materials, sky, portals skipped) at the default pose and an aerial
//              pose over the building centre: open = a straight-up ray from point + 0.05 m x normal hits nothing; denied = the
//              zone rule withholds sky (glass counts as a blocker for the up ray and the sideways rays: glazing is SOLID in the
//              grid, a glazed atrium is covered by spec) (CPU mirror of slSkyKeep: LightZones.surfaceInfo / atSurface with the eye-facing normal,
//              off-grid = OUTSIDE, every probe solid = unknown = denied). openDenied must be 0. gpu*: the same grid read back
//              from the SHADER (SourcedLight.debugZones(1): R = zone mod 256, G = zone / 256, B = 1 unknown / 0.5 sky kept /
//              0 sky off; non-lit materials hidden for that render; samples beyond camera.far skipped): gpuAgree / gpuDiffer
//              (zone) and gpuOpenDenied (open AND the shader withholds sky).
//   §JUNCTION  (red1: a thin bright-white strip at every wall/floor junction and around column / partition bases, Hospital
//              level-1 hall) a floor sample within 0.6 m of a vertical hit (4 horizontal rays from + 0.1 m) or a wall sample
//              within 0.6 m above a floor (down ray) whose zone/sky class differs from the NEAREST room sample (a floor sample
//              with no vertical hit within 1 m, at most 3 m away) — CPU mirror and shader readback. junctionMismatch must be 0.
//   §CANOPY    (red1: the Clinic entrance under the curved canopy renders as black cut-outs) direct (not through glass)
//              samples whose up ray is BLOCKED, split skyLit / denied with the blocker's class. coveredDirectSkyLit must not be 0
//              at an exterior pose that shows a canopy / porch / overhang.
//   §PORCH     a geometry-derived canopy pose per building (no per-building value): the PORCH zone = among the covered zones
//              with no up aperture, ground contact (lowest aperture cell within 2 layers of the ground plane) and MORE THAN HALF
//              of their cells sky-lit sideways (a porch is open at its sides by definition; the whole interior of a building
//              with a doorless opening has a large sideM2 but a low sky-lit share: Hospital 24%, Clinic 13%), the one with the
//              largest side-aperture m2; camera 8 m outside its side-aperture centroid along the mean outward face normal,
//              1.6 m above ground, looking at the centroid. Top 5 candidates logged.
//   clinic_entrance  named pose (red1's Clinic canopy still): 8 m outside the exterior double door M_Double-Flush 1830 x 2134mm
//              Exterior:18 at IFC (-37.0, -0.3, 1.1) on the Exterior Slab on Grade in front of it (elements_meta +
//              element_transforms), eye 1.6 m, looking at the door.
//              The §CANOPY split at that pose is the canopy proof. Before-arm: the new builder is injected as LightZonesNew
//              (CANOPY_BUILDER=<light_zones.js path>) so both arms use the identical pose.
//   §HALL_ZONE Terminal hall_floor stand-in (witness_wash_sources pose): the camera's zone (must be != 0) + its aperture m2.
//   §ZONE_STATS the §LIGHT_ZONE line, zone cells with no solid above (0 by construction after §ZONE_OPEN_SKY), ms.
//   §GLARE     (watchdog red1-c6 rule, every run) black_exterior = open-sky samples in SUN SHADOW (a ray to the sun from
//              point + 0.05 m x normal hits a drawn mesh, or the surface faces away) whose zone rule denies sky (shader readback
//              when available, else the CPU mirror) = would render ~black; junction_zone_flip = §JUNCTION mismatches (shader
//              when available); covered_open_side_black = direct covered samples in sun shadow, denied sky, that SEE THE SKY
//              SIDEWAYS: one of 16 world rays from point + 0.05 m x normal (8 azimuths x elevations 26.6 and 45 deg, the lattice
//              families of the §ZONE_OPEN_SKY sky-lit rule, cast against the drawn meshes) escapes without a hit (a porch /
//              canopy / arcade: sky reaches it, no daylight term yet; an atrium floor's rays meet its roof and walls, so it
//              reads 0). Per building and run total; any count > 0 = FAIL (exit 3).
// GUARD (every run): FAIL on any console "Shader Error", "Context Lost" or pageerror. Load gate: full element count or VACUOUS.
// RUN: node viewer/tests/witness_zone_open_sky.js <port> [outdir] [Hospital,Clinic,...]   (ONLY=regex, POSES=regex, QUERY=&...)
/* global Buffer */
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'); const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const T0 = Date.now();
const [PORT = '8614', OUT = '/tmp/witness_zone_open_sky', LIST = 'Hospital,Clinic,Terminal,HHS_Office_Federated,JKR,Duplex'] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });   // LTU_AHouse on request (its v1337 zone build returns null; ~5 min)
const lines = []; const say = s => { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(path.join(OUT, 'log.txt'), lines.join('\n')); };
// full element counts = the load gate (the counts the other witnesses gate on; a building without one settles on the fleet-smoke rule)
const FULL = { Hospital: 63182, Clinic: 16071, Terminal: 48428, HHS_Office_Federated: 6839 };
// interior stand-in poses (witness_sourced_stack / witness_wash_sources, 2026-09-25): the §JUNCTION poses
const INTERIOR = { Hospital: [{ name: 'cafe_atrium_high', pos: [-11.15, 2.92, 4.08], tgt: [0.75, -13.08, -7.82] }, { name: 'rail_L1', pos: [-11.15, -3.0, 4.08], tgt: [0.75, -4.5, -7.82] }],
  Clinic: [{ name: 'clinic_corridor', pos: [-13.5, -1.4, -18.3], tgt: [4, -2.2, -18.3] }, { name: 'clinic_entrance', ifcPos: [-37.0, -8.3, 1.6], ifcTgt: [-37.0, -0.3, 1.5] }] };
const AERIAL = { Hospital: 1, Clinic: 1, Terminal: 1 };   // the aerial pose on the three reference buildings (run time < 15 min)
(async () => {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 1800000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--use-angle=' + (process.env.ANGLE || 'gl-egl'), '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--window-size=1686,1044'] });
  const guard = { shaderError: 0, contextLost: 0, pageError: 0 }, glareTot = { black_exterior: 0, junction_zone_flip: 0, covered_open_side_black: 0 };
  for (const db of LIST.split(',')) { if (process.env.ONLY && !new RegExp(process.env.ONLY).test(db)) continue;
    const p = await b.newPage(); await p.setViewport({ width: 1666, height: 864 }); const L = [];
    p.on('console', m => { const t = m.text(); L.push(t); if (/Shader Error/.test(t)) guard.shaderError++; if (/Context Lost|CONTEXT_LOST/i.test(t)) guard.contextLost++; });
    p.on('pageerror', e => { guard.pageError++; say('PAGEERROR ' + db + ' ' + e.message.slice(0, 200)); });
    await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=/buildings/' + db + '_extracted.db' + (process.env.QUERY || ''), { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.APP && window.APP.guidMap && window.APP.db, { timeout: 240000 });
    let n = -1, stable = 0; for (let i = 0; i < 200 && stable < 3; i++) { await sleep(2000);
      const s = await p.evaluate(() => ({ n: Object.keys(window.APP.guidMap).length, st: !!window.APP.streaming, bb: (window.APP._bboxPlaceholders || []).length }));
      if (!s.st && s.bb === 0 && s.n > 0 && s.n === n && (!FULL[db] || s.n >= FULL[db])) stable++; else stable = 0; n = s.n; }
    const full = stable >= 3 && (!FULL[db] || n >= FULL[db]);
    const sw = await p.evaluate(async () => { try { return (await (await fetch('/viewer/sw.js')).text()).match(/CACHE_VERSION = '([^']+)'/)[1]; } catch (e) { return '?'; } });
    say(db + ' loaded guids=' + n + (FULL[db] ? '/' + FULL[db] : ' (settled)') + (full ? '' : ' VACUOUS') + ' sw=' + sw);
    if (!full) { await p.close(); continue; }
    const glare = { black_exterior: 0, junction_zone_flip: 0, covered_open_side_black: 0 };
    const poses = [{ name: 'default' }].concat(AERIAL[db] ? [{ name: 'aerial' }] : [], [{ name: 'porch' }], INTERIOR[db] || []); if (db === 'Terminal') poses.push({ name: 'hall_floor' });
    if (process.env.CANOPY_BUILDER) await p.addScriptTag({ content: fs.readFileSync(process.env.CANOPY_BUILDER, 'utf8').replace('global.LightZones = {', 'global.LightZonesNew = {') });
    for (const ps of poses.filter(q => !process.env.POSES || new RegExp(process.env.POSES).test(q.name))) {
      const porch = await p.evaluate(ps => { const A = window.APP, THREE = window.THREE;
        if (ps.name === 'porch') {   // §PORCH pose from the zone build (see header)
          const LZn = window.LightZonesNew || window.LightZones, Zn = LZn.build(A); if (!Zn || !Zn.zoneInfo) return { err: 'no zoneInfo (builder without §ZONE_OPEN_SKY)' };
          const nx = Zn.nx, nxy = Zn.nx * Zn.ny, cl = Zn.cell; let best = null; const cands = [];
          Zn.zoneInfo.forEach((zi, i) => { if (zi.upM2 > 0 || !(zi.sideM2 > 0) || !(zi.skyLitCells > zi.cells / 2)) return; let minJ = 1e9; for (const c of zi.apertureCells) { const j = ((c / nx) | 0) % Zn.ny; if (j < minJ) minJ = j; }
            if (minJ > Zn.groundJ + 2) return; cands.push({ id: i + 1, zi, minJ }); if (!best || zi.sideM2 > best.zi.sideM2) best = { id: i + 1, zi, minJ }; });
          const top = cands.sort((a, b) => b.zi.sideM2 - a.zi.sideM2).slice(0, 5).map(q => ({ id: q.id, sideM2: q.zi.sideM2, cells: q.zi.cells, skyLit: q.zi.skyLitCells, m3: q.zi.m3 }));
          if (!best) return { err: 'no ground-level, mostly sky-lit side-aperture zone', candidates: top };
          const cen = new THREE.Vector3(), nrm = new THREE.Vector3(); let nf = 0;
          for (const c of best.zi.apertureCells) { const bits = Zn.aperture[c], i = c % nx, j = ((c / nx) | 0) % Zn.ny, k = (c / nxy) | 0, cx = Zn.org.x + (i + 0.5) * cl, cy = Zn.org.y + (j + 0.5) * cl, cz = Zn.org.z + (k + 0.5) * cl;
            if (bits & 2) { cen.x += cx - cl / 2; cen.y += cy; cen.z += cz; nrm.x -= 1; nf++; } if (bits & 4) { cen.x += cx + cl / 2; cen.y += cy; cen.z += cz; nrm.x += 1; nf++; }
            if (bits & 8) { cen.x += cx; cen.y += cy; cen.z += cz - cl / 2; nrm.z -= 1; nf++; } if (bits & 16) { cen.x += cx; cen.y += cy; cen.z += cz + cl / 2; nrm.z += 1; nf++; } }
          cen.divideScalar(nf); if (nrm.lengthSq() < 1e-6) nrm.set(1, 0, 0); nrm.normalize();
          const gy = Zn.org.y + Zn.groundJ * cl, cam = cen.clone().addScaledVector(nrm, 8); cam.y = gy + 1.6;
          A.camera.position.copy(cam); A.controls.target.copy(cen); A.controls.update();
          return { zone: best.id, sideM2: best.zi.sideM2, cells: best.zi.cells, skyLitCells: best.zi.skyLitCells, minJ: best.minJ, groundJ: Zn.groundJ, faces: nf, centroid: cen.toArray().map(v => +v.toFixed(1)), outward: nrm.toArray().map(v => +v.toFixed(2)), cam: cam.toArray().map(v => +v.toFixed(1)), candidates: top }; }
        if (ps.name === 'aerial') {   // over the centre of the drawn building (ground / sky / portals excluded), looking straight down
          const box = new THREE.Box3(), tb = new THREE.Box3(); A.scene.traverse(o => { if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh) || !o.visible || o === A.ground || o === A._sky || (o.userData && (o.userData.skyPortal || o.userData.excludeFromShadow))) return;
            if (!o.geometry || !o.geometry.attributes.position) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); o.updateMatrixWorld(); tb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); if (isFinite(tb.min.x) && isFinite(tb.max.x)) box.union(tb); });
          const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
          A.camera.position.set(c.x, box.max.y + 0.6 * Math.max(s.x, s.z), c.z + 0.01); A.controls.target.set(c.x, box.min.y, c.z); A.controls.update(); }
        else if (ps.name === 'hall_floor') {   // witness_wash_sources' terminal_hall_floor stand-in, verbatim
          const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), xs = [], ys = [], zs = [];
          for (const id in A._instanceMeta) { const o = A.scene.getObjectById(+id); if (!o || !o.isInstancedMesh) continue;
            for (const m of A._instanceMeta[id]) { if (m.instanceIndex == null) continue; o.getMatrixAt(m.instanceIndex, m4); o.updateMatrixWorld(); v.setFromMatrixPosition(m4).applyMatrix4(o.matrixWorld); xs.push(v.x); ys.push(v.y); zs.push(v.z); } }
          const q = (a, f) => { a = a.slice().sort((x, y) => x - y); return a[Math.floor(f * (a.length - 1))]; };
          const x0 = q(xs, .05), x1 = q(xs, .95), y0 = q(ys, .02), z0 = q(zs, .05), z1 = q(zs, .95), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, h = y0 + 1.6;
          if (x1 - x0 >= z1 - z0) { A.camera.position.set(x0 + 0.1 * (x1 - x0), h, cz); A.controls.target.set(x0 + 0.9 * (x1 - x0), h, cz); }
          else { A.camera.position.set(cx, h, z0 + 0.1 * (z1 - z0)); A.controls.target.set(cx, h, z0 + 0.9 * (z1 - z0)); } A.controls.update(); }
        else if (ps.ifcPos) { const f = v => { const q = A.ifc2three(v[0], v[1], v[2]); return [q.x, q.y, q.z]; }; A.camera.position.fromArray(f(ps.ifcPos)); A.controls.target.fromArray(f(ps.ifcTgt)); A.controls.update(); }
        else if (ps.pos) { A.camera.position.fromArray(ps.pos); A.controls.target.fromArray(ps.tgt); A.controls.update(); }
        const o = document.getElementById('gi-still-overlay'); if (o) o.remove(); return null; }, ps);
      if (ps.name === 'porch') { say('§PORCH bld=' + db + ' ' + JSON.stringify(porch)); if (!porch || porch.err) continue; }
      await sleep(1500); const b1 = L.length; await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
      for (let i = 0; i < 400 && !L.slice(b1).some(t => /§GI_STILL result|§GI_STILL_OFF|§GI_STILL_FAIL/.test(t)); i++) await sleep(1000);
      await sleep(1000);
      const r = await p.evaluate(() => {
        const A = window.APP, T = window.THREE, LZ = window.LightZones, SL = window.SourcedLight, Z = LZ && LZ.get();
        if (!Z) return { err: 'no light zones (LightZones.get() null)' };
        const SLon = !!(SL && SL.isActive && SL.isActive()), SOL = LZ.SOLID;
        const rc = new T.Raycaster(), up = new T.Vector3(0, 1, 0), down = new T.Vector3(0, -1, 0), tg = [], hide = [];
        const sunDir = A.sun ? A.sun.position.clone().sub(A.sun.target.position).normalize() : null;   // §GLARE: sun shadow ray
        // sees the sky sideways: 16 world rays (8 azimuths x elevations 26.6 / 45 deg) from point + 0.05 m x normal, none blocked
        const SIDE_RAYS = []; [Math.atan(0.5), Math.atan(1)].forEach(el => { for (let a = 0; a < 8; a++) { const az = a * Math.PI / 4; SIDE_RAYS.push(new T.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az))); } });
        const seesSkySideways = (pt, nn) => { const o = pt.clone().addScaledVector(nn, 0.05); for (const d of SIDE_RAYS) { rc.set(o, d); rc.far = 500; if (!rc.intersectObjects(occ, false).length) return true; } return false; };
        const glassy = m => m && m.transparent && m.opacity < 0.95 && !m.map && m.type !== 'MeshBasicMaterial';
        const skip = m => !m || m.isMeshBasicMaterial || m.isShaderMaterial || m.isSpriteMaterial || m.isPointsMaterial || m.visible === false || m.colorWrite === false || (m.transparent && m.opacity < 0.95);
        // occ = tg + pure-glass meshes: glazing is SOLID in the zone grid (a glazed atrium is covered; its daylight is the
        // §SOURCED_DAYLIGHT panes' term, not the sky), so the zenith and sideways sky rays treat glass as opaque too
        const occ = [];
        A.scene.traverse(o => { if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh || o.isSprite || o.isPoints || o.isLine) || !o.visible) return; const ms = Array.isArray(o.material) ? o.material : [o.material];
          if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o !== A._sky && !(o.userData && o.userData.skyPortal) && ms.some(glassy)) occ.push(o);
          if (o === A._sky || (o.userData && o.userData.skyPortal) || ms.every(skip)) { hide.push(o); return; } tg.push(o); occ.push(o); });
        const M = new T.Matrix4(), mi = new T.Matrix4(), W = 48, H = 25;
        // the shader's fragment zone + sky at the grid pixels (zone-debug colour), non-lit materials hidden, read once
        let px = null; if (SL && SL.debugZones && SLon) { const rt = new T.WebGLRenderTarget(W, H); SL.debugZones(1); const prevRT = A.renderer.getRenderTarget(); hide.forEach(o => { o.visible = false; });
          try { A.renderer.setRenderTarget(rt); A.renderer.render(A.scene, A.camera); px = new Uint8Array(W * H * 4); A.renderer.readRenderTargetPixels(rt, 0, 0, W, H, px); }
          finally { A.renderer.setRenderTarget(prevRT); SL.debugZones(0); hide.forEach(o => { o.visible = true; }); rt.dispose(); } }
        // CPU mirror of slFragZone / slSkyKeep -> { z: -1 unknown | 65534 outside | zone, sky: 0/1 }
        const mirror = (pt, nn) => { if (LZ.surfaceInfo) { const s = LZ.surfaceInfo(pt, nn); return { z: s.zone === SOL ? -1 : (s.zone <= 0 ? 65534 : s.zone), sky: s.sky ? 1 : 0 }; }
          const v = LZ.atSurface(pt, nn), z = (v === SOL) ? -1 : (v <= 0 ? 65534 : v); return { z, sky: (z === -1 || (z > 0 && z < 65534)) ? 0 : 1 }; };
        const clsOf = h => { const o = h.object; if (o === A.ground) return 'ground'; if (o.userData && o.userData.ifcClass) return o.userData.ifcClass;
          const gd = A.guidMap[o.id + '_' + (h.batchId != null ? h.batchId : h.instanceId)]; if (!gd) return '?'; try { const q = A.dbQuery("SELECT ifc_class FROM elements_meta WHERE guid=?", [gd]); return q.length ? q[0][0] : '?'; } catch (e) { return '?'; } };
        const G = { black_exterior: 0, black_exterior_cpu: 0, junction_zone_flip: 0, covered_open_side_black: 0, covered_open_side_black_cpu: 0, shaded: 0, coveredSeesSkySideways: 0 };
        const c = { samples: 0, through: 0, open: 0, openDenied: 0, deniedUnknown: 0, deniedZone: 0, covered: 0, coveredDenied: 0, coveredDirect: 0, coveredDirectSkyLit: 0, coveredDirectDenied: 0,
          gpuRead: 0, gpuBeyondFar: 0, gpuAgreeZone: 0, gpuDifferZone: 0, gpuAgreeSky: 0, gpuDifferSky: 0, gpuOpenDenied: 0, gpuCoveredDirectSkyLit: 0 };
        const zones = {}, ex = [], gex = [], blockers = {}, S = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          rc.setFromCamera(new T.Vector2((x + 0.5) / W * 2 - 1, 1 - (y + 0.5) / H * 2), A.camera); rc.far = Infinity;
          const hs = rc.intersectObjects(tg, false); let through = false, h = null;
          for (const hh of hs) { const m = Array.isArray(hh.object.material) ? hh.object.material[hh.face ? hh.face.materialIndex : 0] : hh.object.material; if (glassy(m)) { through = true; continue; } if (skip(m)) continue; h = hh; break; }
          if (!h || !h.face) continue; c.samples++; if (through) c.through++;
          M.copy(h.object.matrixWorld); if (h.object.isInstancedMesh && h.instanceId != null) { h.object.getMatrixAt(h.instanceId, mi); M.multiply(mi); } else if (h.object.isBatchedMesh && h.batchId != null) { h.object.getMatrixAt(h.batchId, mi); M.multiply(mi); }
          const nn = h.face.normal.clone().transformDirection(M); if (nn.dot(rc.ray.direction) > 0) nn.negate();
          rc.set(h.point.clone().addScaledVector(nn, 0.05), up); rc.far = 500; const upHit = rc.intersectObjects(occ, false)[0]; const open = !upHit;
          const mr = mirror(h.point, nn), denied = !mr.sky, cls = clsOf(h);
          let shaded = false; if (sunDir) { if (nn.dot(sunDir) <= 0) shaded = true; else { rc.set(h.point.clone().addScaledVector(nn, 0.05), sunDir); rc.far = 800; shaded = rc.intersectObjects(tg, false).length > 0; } } if (shaded) G.shaded++;
          if (open) { c.open++; if (denied) { c.openDenied++; if (mr.z === -1) c.deniedUnknown++; else { c.deniedZone++; zones[mr.z] = (zones[mr.z] || 0) + 1; }
            if (ex.length < 6) ex.push({ px: [x, y], p: h.point.toArray().map(q => +q.toFixed(1)), n: nn.toArray().map(q => +q.toFixed(2)), z: mr.z, raw02: LZ.at(h.point.clone().addScaledVector(nn, 0.2)), cls }); } }
          else { c.covered++; if (denied) c.coveredDenied++; if (!through) { c.coveredDirect++; const bc = clsOf(upHit) + '@' + (upHit.distance < 2 ? '<2m' : (upHit.distance < 6 ? '2-6m' : '>6m')); blockers[bc] = blockers[bc] || { n: 0, skyLit: 0 }; blockers[bc].n++;
            if (denied) c.coveredDirectDenied++; else { c.coveredDirectSkyLit++; blockers[bc].skyLit++; } } }
          // §JUNCTION geometry: floor sample near a vertical hit / wall sample just above a floor
          let kind = 'other', wallNear = Infinity; if (nn.y > 0.7) { kind = 'floor'; const q0 = h.point.clone().addScaledVector(up, 0.1);
            [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].forEach(d => { rc.set(q0, new T.Vector3(d[0], d[1], d[2])); rc.far = 1.0; const hh = rc.intersectObjects(tg, false)[0]; if (hh && hh.distance < wallNear) wallNear = hh.distance; }); }
          else if (Math.abs(nn.y) < 0.3) { kind = 'wall'; rc.set(h.point.clone().addScaledVector(nn, 0.05), down); rc.far = 0.6; const hh = rc.intersectObjects(tg, false)[0]; wallNear = hh ? hh.distance : Infinity; }
          let g = null; if (px) { const hm = Array.isArray(h.object.material) ? h.object.material[h.face.materialIndex] : h.object.material, hU = hm && A.renderer.properties.get(hm).uniforms;
            if (h.distance > A.camera.far) c.gpuBeyondFar++; else if (hU && hU.uSLParams) { c.gpuRead++; const j = ((H - 1 - y) * W + x) * 4, unk = px[j + 2] > 191, zs = unk ? -1 : px[j] + 256 * px[j + 1], sky = unk ? 0 : ((px[j + 2] > 64 || zs === 65534) ? 1 : 0);   // B 0.5 = sky kept (§ZONE_OPEN_SKY shader); OUTSIDE always keeps sky (both arms)
              g = { z: zs, sky }; if (zs === mr.z) c.gpuAgreeZone++; else { c.gpuDifferZone++; if (gex.length < 6) gex.push({ px: [x, y], cpu: mr, gpu: g, cls, d: +h.distance.toFixed(1), ny: +nn.y.toFixed(2) }); }
              if (sky === mr.sky) c.gpuAgreeSky++; else c.gpuDifferSky++; if (open && !sky) c.gpuOpenDenied++; if (!open && !through && sky) c.gpuCoveredDirectSkyLit++; } }
          // §GLARE counts (shader class when read, else the CPU mirror)
          const skyFinal = g ? g.sky : mr.sky;
          if (open && shaded) { if (!skyFinal) G.black_exterior++; if (!mr.sky) G.black_exterior_cpu++; }
          if (!open && !through && shaded && (!skyFinal || !mr.sky)) { const so = seesSkySideways(h.point, nn); if (so) { G.coveredSeesSkySideways++; if (!skyFinal) G.covered_open_side_black++; if (!mr.sky) G.covered_open_side_black_cpu++; } }
          S.push({ x, y, p: h.point, kind, wallNear, mr, g, cls, through });
        }
        // §JUNCTION: each junction sample vs its nearest room sample (floor, nothing vertical within 1 m, <= 3 m away)
        const room = S.filter(s => s.kind === 'floor' && s.wallNear === Infinity), J = { junction: 0, withRoomRef: 0, mismatch: 0, mismatchSky: 0, gpuMismatch: 0, gpuMismatchSky: 0 }, jex = [];
        S.forEach(s => { if (!((s.kind === 'floor' && s.wallNear <= 0.6) || (s.kind === 'wall' && s.wallNear <= 0.6))) return; J.junction++;
          let best = null, bd = 9; room.forEach(r => { const d = r.p.distanceTo(s.p); if (d <= 3 && d < bd) { bd = d; best = r; } }); if (!best) return; J.withRoomRef++;
          const mm = s.mr.z !== best.mr.z, ms = s.mr.sky !== best.mr.sky; if (mm || ms) { J.mismatch++; if (ms) J.mismatchSky++; if (jex.length < 6) jex.push({ px: [s.x, s.y], kind: s.kind, near: +s.wallNear.toFixed(2), z: s.mr, room: best.mr, cls: s.cls, p: s.p.toArray().map(q => +q.toFixed(1)) }); }
          if (s.g && best.g) { if (s.g.z !== best.g.z || s.g.sky !== best.g.sky) { J.gpuMismatch++; if (s.g.sky !== best.g.sky) J.gpuMismatchSky++; } } });
        G.junction_zone_flip = px ? J.gpuMismatch : J.mismatch;
        // zone cells with no SOLID above them in their column (0 by construction after §ZONE_OPEN_SKY)
        let openZoneCells = 0; const openByZone = {}, nx = Z.nx, ny = Z.ny, nz = Z.nz, nxy = nx * ny;
        for (let kk = 0; kk < nz; kk++) for (let ii = 0; ii < nx; ii++) { let covered = false;
          for (let jj = ny - 1; jj >= 0; jj--) { const zv = Z.zone[ii + jj * nx + kk * nxy]; if (zv === SOL) { covered = true; continue; } if (!covered && zv > 0) { openZoneCells++; const zid = zv & 0x3FFF; openByZone[zid] = (openByZone[zid] || 0) + 1; } } }
        const topOpen = Object.entries(openByZone).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const cam = A.camera.position; let camZ = LZ.at(cam); if (camZ === SOL) camZ = LZ.atSurface(cam, { x: 0, y: 1, z: 0 });
        const zi = (Z.zoneInfo && camZ > 0 && camZ !== SOL) ? Z.zoneInfo[camZ - 1] : null;
        const camZone = { zone: camZ, cells: zi ? zi.cells : (camZ > 0 && camZ !== SOL ? Z.sizes[camZ - 1] : null), apertureM2: zi ? zi.apertureM2 : null, upM2: zi ? zi.upM2 : null, sideM2: zi ? zi.sideM2 : null, surfaceM2: zi ? zi.surfaceM2 : null, skyLitCells: zi ? zi.skyLitCells : null };
        return { sourcedLight: SLon, c, glare: G, junction: J, junctionExamples: jex, deniedZones: zones, examples: ex, gpuExamples: gex, coveredDirectBlockers: blockers, openZoneCells, topOpenZones: topOpen, camZone, cam: cam.toArray().map(q => +q.toFixed(1)),
          zoneStats: { zones: Z.zones, cells: Z.stats.cells, ms: Z.stats.ms, closeR: Z.stats.closeR, outsideCells: Z.stats.outsideCells, openSkyCells: Z.stats.openSkyCells, indoorCells: Z.stats.indoorCells, largestZoneM3: Z.stats.largestZoneM3, apertureM2: Z.stats.apertureM2, zonesWithAperture: Z.stats.zonesWithAperture, skyLitCells: Z.stats.skyLitCells } };
      });
      const g = re => (L.slice(b1).find(t => re.test(t)) || '-').slice(0, 600);
      say('§SKY_LOSS bld=' + db + ' pose=' + ps.name + ' ' + JSON.stringify(r));
      if (r && r.junction) say('§JUNCTION bld=' + db + ' pose=' + ps.name + ' ' + JSON.stringify(r.junction) + ' ex=' + JSON.stringify(r.junctionExamples));
      if (r && r.glare) { say('§GLARE_POSE bld=' + db + ' pose=' + ps.name + ' ' + JSON.stringify(r.glare)); Object.keys(glare).forEach(k => { glare[k] += r.glare[k]; }); }
      if (r && r.c) say('§CANOPY bld=' + db + ' pose=' + ps.name + ' coveredDirect=' + r.c.coveredDirect + ' skyLit=' + r.c.coveredDirectSkyLit + ' denied=' + r.c.coveredDirectDenied + ' gpuSkyLit=' + r.c.gpuCoveredDirectSkyLit + ' blockers=' + JSON.stringify(r.coveredDirectBlockers));
      if (ps.name === 'default') say('§ZONE_STATS bld=' + db + ' ' + g(/§LIGHT_ZONE bld=/) + '\n   ' + g(/§SOURCED_LIGHT on|§SOURCED_LIGHT skipped|§SOURCED_LIGHT failed/) + '\n   ' + g(/§SOURCED_LIGHT_CAP/) + '\n   ' + g(/§SOURCED_LIGHT_LINK_FAIL|§GI_STILL_FAIL|RangeError|Array buffer allocation/));
      if (ps.name === 'hall_floor') say('§HALL_ZONE bld=' + db + ' ' + JSON.stringify(r.camZone) + ' ' + g(/§METER camera=/));
      await p.keyboard.press('Escape'); await sleep(3000);
    }
    const gf = Object.values(glare).some(v => v > 0); Object.keys(glare).forEach(k => { glareTot[k] += glare[k]; });
    say('§GLARE bld=' + db + ' ' + (gf ? 'FAIL' : 'PASS') + ' ' + Object.entries(glare).map(([k, v]) => k + '=' + v).join(' '));
    await p.close();
  }
  const fail = guard.shaderError || guard.contextLost || guard.pageError, gfail = Object.values(glareTot).some(v => v > 0);
  say('§GLARE total ' + (gfail ? 'FAIL' : 'PASS') + ' ' + Object.entries(glareTot).map(([k, v]) => k + '=' + v).join(' '));
  say('GUARD ' + (fail ? 'FAIL' : 'PASS') + ' ' + JSON.stringify(guard)); await b.close(); if (fail) process.exitCode = 2; else if (gfail) process.exitCode = 3;
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
