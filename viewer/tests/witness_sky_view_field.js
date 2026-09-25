// ⚠ DO NOT REMOVE — §SKY_VIEW_FIELD + §LUX_CHECK + SKY_STEP witness (bim-compiler PHOTOREAL_STILL_RENDER.md "§SKY_VIEW_FIELD —
// SPEC", "§SKY_FRACTION — SPEC" COUNT, "§LUX_CHECK", build decisions V1-V10). Read the log after every run.
// Issues it exposes (numbers only, no pictures judged):
//   SKY_STEP     red1's stair-stepped light/dark walls (Terminal canteen / waiting hall): on a float readback of the still's
//                own camera, screen-adjacent pixel pairs on the SAME surface (view depth within 1%, normals within 5 deg, normals
//                from the world-position readback) whose sky factor differs by > 0.25 — count + metres of edge (pixel footprint).
//                Sky factor per pixel: AFTER (field on) = zone-debug w=6 (F_filtered); BEFORE (a tree without the field) =
//                zone-debug w=1's sky class (kept 1 / withheld 0: slSkyKeep with indoorSky 0). Target: FAIL before, 0 after.
//   SKY_STEP_GRID face-adjacent same-zone cells with |dF| > 0.5 (before: SKY_BIT 1/0; after: G/10000).
//   EXPOSURE     toneMappingExposure + §METER stops per pose (a > 2x drop between arms FAILs unless explained).
//   §SKY_VIEW_FIELD / _DIST / _ADF_CHECK / §LUX_CHECK / _CAM / §STILL_STAGE_MS lines are relayed from the page per press.
//   RED1 POSES   atrium stair / inner room / toilet: which building + zone each lands in, with that zone's §LUX_CHECK row.
// Target rule for a pose without one (V10): the camera looks along the longest free horizontal ray at eye height (32
// azimuths through the zone grid to the first SOLID cell); target = camera + that ray x its free length.
// GUARD (every run): FAIL on any console "Shader Error", "Context Lost" or pageerror.
// RUN: node viewer/tests/witness_sky_view_field.js <port> [outdir]      (ONLY=<regex of db> to limit)
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'); const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const T0 = Date.now();
const [PORT = '8621', OUT = '/tmp/witness_sky_view_field'] = process.argv.slice(2); fs.mkdirSync(OUT, { recursive: true });
const lines = []; const say = s => { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(path.join(OUT, 'log.txt'), lines.join('\n')); };
const RED1 = { atrium_stair: [-10.95, -2.91, 5.42], inner_room: [9.95, -7.70, 0.10], toilet: [8.34, -8.65, -3.58] };
const RUNS = [
  { db: 'Hospital', full: 63182, poses: [{ name: 'hospital_cafe', pos: [-11.15, 2.92, 4.08], tgt: [0.75, -13.08, -7.82] }, { name: 'atrium_stair (red1)', pos: RED1.atrium_stair, auto: true }] },
  { db: 'Clinic', full: 16071, poses: [{ name: 'clinic_corridor', pos: [-13.5, -1.4, -18.3], tgt: [4, -2.2, -18.3] }] },
  { db: 'Terminal', full: 48428, poses: [{ name: 'terminal_hall_floor', hallFloor: true }, { name: 'terminal_canteen (red1)', pos: [-20.06, -16.13, -1.00], auto: true, step: true },
    { name: 'terminal_waiting_hall (red1)', pos: [0.45, -12.80, 11.90], auto: true, step: true }] },
];
(async () => {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 1800000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--use-angle=' + (process.env.ANGLE || 'gl-egl'), '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--window-size=1686,1044'] });
  const guard = { shaderError: 0, contextLost: 0, pageError: 0 }; const summary = [];
  for (const R of RUNS) { if (process.env.ONLY && !new RegExp(process.env.ONLY).test(R.db)) continue;
    const p = await b.newPage(); await p.setViewport({ width: 1666, height: 864 }); const L = [];
    p.on('console', m => { const t = m.text(); L.push(t); if (/Shader Error/.test(t)) guard.shaderError++; if (/Context Lost|CONTEXT_LOST/i.test(t)) guard.contextLost++; });
    p.on('pageerror', e => { guard.pageError++; say('PAGEERROR ' + e.message.slice(0, 200)); });
    await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=/buildings/' + R.db + '_extracted.db' + (process.env.QUERY || ''), { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.APP && window.APP.guidMap && window.APP.db, { timeout: 240000 });
    let n = 0; for (let i = 0; i < 200; i++) { n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n >= R.full) break; await sleep(2000); }
    const sw = await p.evaluate(async () => { try { return (await (await fetch('/viewer/sw.js')).text()).match(/CACHE_VERSION = '([^']+)'/)[1]; } catch (e) { return '?'; } });
    say(R.db + ' loaded guids=' + n + '/' + R.full + (n >= R.full ? '' : ' VACUOUS') + ' sw=' + sw);
    if (n < R.full) { await p.close(); continue; }
    let first = true;
    for (const ps of R.poses) {
      const pose = await p.evaluate(ps => { const A = window.APP, LZ = window.LightZones;
        if (ps.hallFloor) { const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), xs = [], ys = [], zs = [];
          for (const id in A._instanceMeta) { const o = A.scene.getObjectById(+id); if (!o || !o.isInstancedMesh) continue;
            for (const m of A._instanceMeta[id]) { if (m.instanceIndex == null) continue; o.getMatrixAt(m.instanceIndex, m4); o.updateMatrixWorld(); v.setFromMatrixPosition(m4).applyMatrix4(o.matrixWorld); xs.push(v.x); ys.push(v.y); zs.push(v.z); } }
          const q = (a, f) => { a = a.slice().sort((x, y) => x - y); return a[Math.floor(f * (a.length - 1))]; };
          const x0 = q(xs, .05), x1 = q(xs, .95), y0 = q(ys, .02), z0 = q(zs, .05), z1 = q(zs, .95), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, h = y0 + 1.6;
          if (x1 - x0 >= z1 - z0) { A.camera.position.set(x0 + 0.1 * (x1 - x0), h, cz); A.controls.target.set(x0 + 0.9 * (x1 - x0), h, cz); }
          else { A.camera.position.set(cx, h, z0 + 0.1 * (z1 - z0)); A.controls.target.set(cx, h, z0 + 0.9 * (z1 - z0)); } }
        else if (ps.auto) { LZ.build(A); A.camera.position.fromArray(ps.pos); let best = 0, bd = null;
          for (let a = 0; a < 32; a++) { const th = a * Math.PI / 16, dx = Math.cos(th), dz = Math.sin(th); let d = 0;
            for (; d < 60; d += 0.25) { const v = LZ.at({ x: ps.pos[0] + dx * d, y: ps.pos[1], z: ps.pos[2] + dz * d }); if (v === LZ.SOLID || v === -1) break; }
            if (d > best) { best = d; bd = [dx, dz]; } }
          A.controls.target.set(ps.pos[0] + bd[0] * best, ps.pos[1], ps.pos[2] + bd[1] * best); }
        else { A.camera.position.fromArray(ps.pos); A.controls.target.fromArray(ps.tgt); }
        A.controls.update(); return { pos: A.camera.position.toArray().map(v => +v.toFixed(2)), tgt: A.controls.target.toArray().map(v => +v.toFixed(2)) }; }, ps);
      await p.evaluate(() => { const o = document.getElementById('gi-still-overlay'); if (o) o.remove(); });
      await sleep(1500); const b1 = L.length; await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
      for (let i = 0; i < 400 && !L.slice(b1).some(t => /§GI_STILL result|§GI_STILL_OFF|§GI_STILL_FAIL/.test(t)); i++) await sleep(1000);
      await sleep(1000);
      const r = await p.evaluate(async () => {
        const A = window.APP, THREE = window.THREE, Rn = A.renderer, SL = window.SourcedLight, LZ = window.LightZones, Z = LZ && LZ.get();
        const after = !!(SL.field && SL.field()), W = 480, H = Math.round(480 / A.camera.aspect);
        const glassy = m => m && m.transparent && m.opacity < 0.95; const hidden = [];
        A.scene.traverse(o => { if (!o.visible) return; const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : null;
          const glow = o.isSprite || o.isPoints || o.isLine || o === A._sky || (ms && ms.every(m => !m || m.isMeshBasicMaterial || m.isShaderMaterial || glassy(m)));
          if (glow && (o.isMesh || o.isSprite || o.isPoints || o.isLine || o.isInstancedMesh || o.isBatchedMesh)) { o.visible = false; hidden.push(o); } });
        const prevBg = A.scene.background, prevFog = A.scene.fog, prevOv = A.scene.overrideMaterial, prevRT = Rn.getRenderTarget(), cc = new THREE.Color(), ca = Rn.getClearAlpha(); Rn.getClearColor(cc);
        const read = (mode, ov) => { const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, depthBuffer: true }), buf = new Float32Array(W * H * 4);
          try { if (mode != null) SL.debugZones(mode); A.scene.background = null; A.scene.fog = null; A.scene.overrideMaterial = ov || null; Rn.setClearColor(0x000000, 0); Rn.setRenderTarget(rt); Rn.clear(true, true, true); Rn.render(A.scene, A.camera); Rn.readRenderTargetPixels(rt, 0, 0, W, H, buf); }
          finally { if (mode != null) SL.debugZones(0); Rn.setRenderTarget(prevRT); A.scene.background = prevBg; A.scene.fog = prevFog; A.scene.overrideMaterial = prevOv; Rn.setClearColor(cc, ca); rt.dispose(); } return buf; };
        const wm = new THREE.MeshBasicMaterial({ color: 0xffffff }); wm.onBeforeCompile = sh => {
          sh.vertexShader = 'varying vec3 vW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n\tvec4 _w = vec4( transformed, 1.0 );\n#ifdef USE_BATCHING\n\t_w = batchingMatrix * _w;\n#endif\n#ifdef USE_INSTANCING\n\t_w = instanceMatrix * _w;\n#endif\n\tvW = ( modelMatrix * _w ).xyz;');
          sh.fragmentShader = 'varying vec3 vW;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n\tgl_FragColor = vec4( vW, 1.0 );'); };
        wm.customProgramCacheKey = () => 'skyStepWorld';
        let zb, fb, pb; try { zb = read(1); fb = after ? read(6) : null; pb = read(null, wm); } finally { hidden.forEach(o => { o.visible = true; }); }
        const cam = A.camera.position, fwd = new THREE.Vector3(); A.camera.getWorldDirection(fwd); const px = 2 * Math.tan(A.camera.fov * Math.PI / 360) / H;
        const idx = (x, y) => y * W + x, ok = i => pb[i * 4 + 3] >= 0.5 && zb[i * 4 + 3] >= 0.5;
        const F = new Float32Array(W * H), zid = new Int32Array(W * H), dep = new Float32Array(W * H), nrm = new Float32Array(W * H * 3);
        for (let i = 0; i < W * H; i++) { if (!ok(i)) continue; zid[i] = Math.round(zb[i * 4] * 255) + Math.round(zb[i * 4 + 1] * 255) * 256;
          F[i] = after ? fb[i * 4] : (Math.abs(zb[i * 4 + 2] - 0.5) < 0.1 ? 1 : 0);
          dep[i] = (pb[i * 4] - cam.x) * fwd.x + (pb[i * 4 + 1] - cam.y) * fwd.y + (pb[i * 4 + 2] - cam.z) * fwd.z; }
        for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) { const i = idx(x, y), a = idx(x + 1, y), c = idx(x, y + 1); if (!ok(i) || !ok(a) || !ok(c)) continue;
          const ux = pb[a * 4] - pb[i * 4], uy = pb[a * 4 + 1] - pb[i * 4 + 1], uz = pb[a * 4 + 2] - pb[i * 4 + 2], vx = pb[c * 4] - pb[i * 4], vy = pb[c * 4 + 1] - pb[i * 4 + 1], vz = pb[c * 4 + 2] - pb[i * 4 + 2];
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz); if (!(l > 0)) continue; nrm[i * 3] = nx / l; nrm[i * 3 + 1] = ny / l; nrm[i * 3 + 2] = nz / l; }
        const cos5 = Math.cos(5 * Math.PI / 180); let pairs = 0, steps = 0, stepsZone = 0, metres = 0, metresZone = 0;
        const test = (i, j) => { if (!ok(i) || !ok(j) || !dep[i] || !dep[j]) return; const ni = nrm[i * 3] || nrm[i * 3 + 1] || nrm[i * 3 + 2], nj = nrm[j * 3] || nrm[j * 3 + 1] || nrm[j * 3 + 2]; if (!ni || !nj) return;
          if (Math.abs(dep[i] - dep[j]) > 0.01 * Math.min(dep[i], dep[j])) return; if (nrm[i * 3] * nrm[j * 3] + nrm[i * 3 + 1] * nrm[j * 3 + 1] + nrm[i * 3 + 2] * nrm[j * 3 + 2] < cos5) return;
          pairs++; if (Math.abs(F[i] - F[j]) > 0.25) { steps++; const m = dep[i] * px; metres += m; if (zid[i] > 0 && zid[j] > 0) { stepsZone++; metresZone += m; } } };
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = idx(x, y); if (x + 1 < W) test(i, idx(x + 1, y)); if (y + 1 < H) test(i, idx(x, y + 1)); }
        // grid-only raw count
        let grid = 0, gridPairs = 0; if (Z) { const nx = Z.nx, ny = Z.ny, nz = Z.nz, nxy = nx * ny, zone = Z.zone, G = after && Z.field ? Z.field.G : null;
          const fc = c => G ? G[c] / 10000 : ((zone[c] & LZ.SKY_BIT) ? 1 : 0);
          for (let c = 0; c < nx * ny * nz; c++) { const v = zone[c]; if (v === LZ.SOLID || v === 0) continue; const i = c % nx, j = ((c / nx) | 0) % ny, k = (c / nxy) | 0, zc = v & LZ.ZONE_MASK, f0 = fc(c);
            for (const [ok2, d] of [[i + 1 < nx, 1], [j + 1 < ny, nx], [k + 1 < nz, nxy]]) { if (!ok2) continue; const w = zone[c + d]; if (w === LZ.SOLID || w === 0 || (w & LZ.ZONE_MASK) !== zc) continue; gridPairs++; if (Math.abs(fc(c + d) - f0) > 0.5) grid++; } } }
        let lit = 0; for (let i = 0; i < W * H; i++) if (ok(i)) lit++;
        return { arm: after ? 'after(field w=6)' : 'before(SKY_BIT w=1)', W, H, litPixels: lit, surfacePairs: pairs, skyStep: steps, skyStepM: +metres.toFixed(2), skyStepZone: stepsZone, skyStepZoneM: +metresZone.toFixed(2), gridStep: grid, gridPairs,
          exposure: +Rn.toneMappingExposure.toFixed(3), meterStops: A._meterLast ? +A._meterLast.stops.toFixed(2) : 0, camZone: (A._sourcedCap && A._sourcedCap.camZone) || 0 };
      });
      const g = (re, n) => (L.slice(b1).find(t => re.test(t)) || '-').slice(0, n || 400);
      say('§SKY_STEP pose=' + ps.name + ' cam=' + JSON.stringify(pose.pos) + ' tgt=' + JSON.stringify(pose.tgt) + (ps.auto ? ' (V10 longest free ray)' : '') + ' ' + JSON.stringify(r));
      say('   ' + [g(/§METER camera/), g(/§SKY_VIEW_FIELD on|§SKY_VIEW_FIELD off/, 900), g(/§SKY_VIEW_FIELD_DIST/, 500), g(/§SKY_VIEW_ADF_CHECK/, 700), g(/§LUX_CHECK_CAM/, 500), g(/§STILL_STAGE_MS/, 500), g(/§SKY_PORTAL off|§SKY_PORTAL placed/, 200), g(/§LIGHT_UNIFORM_BUDGET/, 400)].join('\n   '));
      if (first) { say('   ' + [g(/§SKY_VIEW_FIELD_BENT/, 1200), g(/§LUX_CHECK zones/, 4000)].join('\n   ')); first = false;
        const red = await p.evaluate(RED1 => { const LZ = window.LightZones, SL = window.SourcedLight, lx = SL.lux ? SL.lux() : null, out = {};
          for (const k in RED1) { const q = RED1[k], z = LZ.at({ x: q[0], y: q[1], z: q[2] }); const row = lx && z > 0 && z !== LZ.SOLID ? lx.rows.find(r => r.z === z) : null;
            out[k] = { zone: z === LZ.SOLID ? 'SOLID' : z, lux: row ? { use: row.use, en: row.en, sky: +row.Esky.toFixed(0), lamps: +row.Elamps.toFixed(0), total: +row.Etotal.toFixed(0), Fwp: +(100 * row.Fwp).toFixed(2), verdict: row.verdict } : null }; }
          return out; }, RED1);
        say('§RED1_POSES bld=' + R.db + ' ' + JSON.stringify(red)); }
      summary.push(R.db + ' ' + ps.name + ': exposure=' + r.exposure + ' stops=' + r.meterStops + ' skyStep=' + r.skyStep + ' (' + r.skyStepM + ' m; zone ' + r.skyStepZone + ') grid=' + r.gridStep);
      await p.keyboard.press('Escape'); await sleep(3000);
    }
    await p.close();
  }
  summary.forEach(s => say('§SUMMARY ' + s));
  const fail = guard.shaderError || guard.contextLost || guard.pageError;
  say('GUARD ' + (fail ? 'FAIL' : 'PASS') + ' ' + JSON.stringify(guard)); await b.close(); if (fail) process.exitCode = 2;
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
