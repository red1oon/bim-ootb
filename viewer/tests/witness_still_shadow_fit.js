// ⚠ DO NOT REMOVE — witness for §STILL_SHADOW_FIT + §STILL_CULL (bim-compiler PHOTOREAL_STILL_RENDER.md). Read the log.
// Issues: (1) jagged sun-shadow edges on Alt+S (0.088 m texel over the whole 362 m Hospital box, stretched at a grazing
// sun); (2) the still draws every instance (DLOD paused) — red1: "the non-DLOD flag may cost heavy".
// Proves or disproves, per pose, arm BASE (APP._stillShadowFit=false, APP._stillCullOff=true = main's behaviour) vs
// arm FIT (fit on): the logged box/texel (fit must shrink it), shadow-map renders, refine ms, and the
// SAFETY predicate: from a grid of visible surface points, a ray toward the sun hits something (= in shadow) in FIT
// exactly when it does in BASE (roof-through-sky guard), and RECEIVERS: no point the building shades falls outside the
// fitted box. §STILL_CULL was built, measured (0 culled at 5 poses: the sun box must hold the building) and removed.
// Gate: full element count (else VACUOUS). Frames saved for the eye sheet. Real GPU, clean profile.
// Usage: node viewer/tests/witness_still_shadow_fit.js <port> <db> <want> '<poses json>' [sun "el,trueAz"] [outdir] [radius]
/* global Buffer */
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const T0 = Date.now(); const say = s => console.log('+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s);
const [PORT, DB, WANT, POSES_J, SUN, OUT_ARG, RADIUS] = process.argv.slice(2);
const POSES = JSON.parse(POSES_J), OUT = OUT_ARG || '.', W = 1666, H = 864;
(async () => { const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }), args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: W, height: H }); let errs = 0; const L = [];
  p.on('console', m => { const t = m.text(); L.push(t); if (/§STILL_SHADOW|§PHOTO_SHADOW_CONTACT|§SHADOW_SIZE_BY_ENVELOPE|§PHOTO_SHADOW enabled|§STILL_REFINE done|§LIGHT_STACK|§DLOD_STILL_OWNERSHIP|Uncaught|Shader Error/.test(t)) say('[page] ' + t.slice(0, 260)); });
  p.on('pageerror', e => { errs++; say('PAGEERROR ' + e.message); });
  await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=' + DB, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.APP && window.APP.guidMap, { timeout: 240000 });
  let n = -1, st = 0; for (let i = 0; i < 200 && st < 3; i++) { await sleep(2000); const s = await p.evaluate(() => ({ n: Object.keys(window.APP.guidMap).length, s: !!window.APP.streaming })); if (!s.s && s.n > 0 && s.n === n) st++; else st = 0; n = s.n; }
  if (n !== +WANT) { say('VACUOUS loaded ' + n + ' want ' + WANT); await b.close(); return; }
  for (let i = 0; i < 60; i++) { if (await p.evaluate(() => !!window.APP._dlodEnabled)) break; await sleep(1000); }
  say('loaded ' + n + ' dlodOn=' + await p.evaluate(() => !!window.APP._dlodEnabled));
  if (SUN) { const r = await p.evaluate((el, trueAz) => { const A = window.APP; const tn = (typeof window._trueNorthAngle === 'number') ? window._trueNorthAngle : 0;
      const theta = ((180 - (trueAz - tn)) % 360 + 360) % 360; A.updateSky(el, theta); if (A.renderer) A.renderer.shadowMap.needsUpdate = true; if (A.markDirty) A.markDirty();
      const d = A.sun.position.clone().normalize(); return { el, trueAz, trueNorth: tn, theta, sunElevDeg: +(Math.asin(d.y) * 180 / Math.PI).toFixed(2) }; }, ...SUN.split(',').map(Number));
    say('SUN ' + JSON.stringify(r)); }
  const setPose = ps => p.evaluate(ps => { const A = window.APP; A.camera.position.fromArray(ps.pos); A.controls.target.fromArray(ps.tgt); if (ps.fov) { A.camera.fov = ps.fov; A.camera.updateProjectionMatrix(); } A.controls.update(); A.camera.lookAt(A.controls.target); A.camera.updateMatrixWorld(true); if (A.markDirty) A.markDirty(); }, ps);
  // Visible surface points: 48x25 screen grid, first hit with the full model (called in BASE, before any cull).
  const GRID = () => p.evaluate(() => { const A = window.APP, T = window.THREE, rc = new T.Raycaster(), tg = []; A.scene.traverse(o => { if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible && o !== A._sky && !(o.userData && o.userData.excludeFromShadow)) tg.push(o); });
    const pts = []; for (let gy = 0; gy < 25; gy++) for (let gx = 0; gx < 48; gx++) { rc.setFromCamera(new T.Vector2((gx + 0.5) / 48 * 2 - 1, -((gy + 0.5) / 25 * 2 - 1)), A.camera); const h = rc.intersectObjects(tg, false)[0];
      if (h && h.face) { const nrm = h.face.normal.clone().transformDirection(h.object.matrixWorld); pts.push([h.point.x, h.point.y, h.point.z, nrm.x, nrm.y, nrm.z]); } } return pts; });
  // Receiver check (during a still): is each visible point inside the sun camera's box? A point the building shades that
  // falls outside = a LOST shadow. Skyline-prop shadows (dropped by design) are counted apart.
  const RECV = pts => p.evaluate(pts => { const A = window.APP, T = window.THREE, sc = A.sun.shadow.camera; A.sun.updateMatrixWorld(); A.sun.shadow.updateMatrices(A.sun);
    const rc = new T.Raycaster(), sky = []; const g = A._getPhotoSkyline && A._getPhotoSkyline(); if (g && g.visible) g.traverse(o => { if (o.isMesh || o.isInstancedMesh) sky.push(o); });
    const d = A.sun.position.clone().sub(A.sun.target.position).normalize(); rc.far = 5000; const out = [];
    for (const q of pts) { const v = new T.Vector3(q[0], q[1], q[2]).applyMatrix4(sc.matrixWorldInverse); const inside = v.x >= sc.left && v.x <= sc.right && v.y >= sc.bottom && v.y <= sc.top;
      let skyHit = 0; if (sky.length) { rc.set(new T.Vector3(q[0] + q[3] * 0.05, q[1] + q[4] * 0.05, q[2] + q[5] * 0.05), d); skyHit = rc.intersectObjects(sky, true).length ? 1 : 0; }
      out.push([inside ? 1 : 0, skyHit]); } return { out, box: [sc.left, sc.right, sc.bottom, sc.top].map(x => +x.toFixed(1)), skyMeshes: sky.length }; }, pts);
  const SUNRAYS = pts => p.evaluate(pts => { const A = window.APP, T = window.THREE, rc = new T.Raycaster(), tg = []; const skySet = new Set(); const g = A._getPhotoSkyline && A._getPhotoSkyline(); if (g) g.traverse(o => skySet.add(o)); A.scene.traverse(o => { if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible && o !== A._sky && o !== A.ground && !(o.userData && o.userData.excludeFromShadow) && !skySet.has(o)) tg.push(o); });
    const d = A.sun.position.clone().sub(A.sun.target.position).normalize(); rc.far = 2000; const out = [];
    for (const q of pts) { const o = new T.Vector3(q[0] + q[3] * 0.05, q[1] + q[4] * 0.05, q[2] + q[5] * 0.05); if (new T.Vector3(q[3], q[4], q[5]).dot(d) <= 0) { out.push(2); continue; } rc.set(o, d); out.push(rc.intersectObjects(tg, false).length ? 1 : 0); } return out; }, pts);
  const still = async (arm) => { const b1 = L.length;
    await p.evaluate(arm => { const A = window.APP; A._stillShadowFit = arm !== 'base'; A._stillCullOff = arm === 'base'; delete A._stillShadowRadius; }, arm);
    if (RADIUS && arm === 'fit') await p.evaluate(r => { window.APP._stillShadowRadius = r; }, +RADIUS);
    await p.evaluate(() => window.APP.toggleStillRefine());
    for (let i = 0; i < 180 && !L.slice(b1).some(t => /§STILL_REFINE done/.test(t)); i++) await sleep(1000);
    await sleep(1500);
    const png = await p.evaluate(() => { const A = window.APP; try { A._composer ? A._composer.render() : A.renderer.render(A.scene, A.camera); } catch (e) {} return A.renderer.domElement.toDataURL('image/png'); });
    // BLANK check (watchdog): a capture that is one flat colour (sky only) is not a frame. Luma spread over a 64x32 sample.
    const spread = await p.evaluate(async (u) => { const im = new Image(); im.src = u; await im.decode(); const c = document.createElement('canvas'); c.width = 64; c.height = 32;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0, 64, 32); const d = x.getImageData(0, 0, 64, 32).data; let lo = 255, hi = 0;
      for (let i = 0; i < d.length; i += 4) { const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; lo = Math.min(lo, l); hi = Math.max(hi, l); } return +(hi - lo).toFixed(1); }, png);
    say('FRAME ' + arm + ' lumaSpread=' + spread + (spread < 8 ? ' BLANK' : ' ok'));
    return { lines: L.slice(b1), png }; };
  const grab = (lines, re) => (lines.find(t => re.test(t)) || '').slice(0, 240);
  for (const ps of POSES) {
    if (ps.auto === 'hall') Object.assign(ps, await p.evaluate(() => {   // witness_dlod_still_ownership.js's hall pose: from the building's own instances
      const A = window.APP, m4 = new THREE.Matrix4(), v = new THREE.Vector3(), xs = [], ys = [], zs = [];
      for (const id in A._instanceMeta) { const o = A.scene.getObjectById(+id); if (!o || !o.isInstancedMesh) continue;
        for (const m of A._instanceMeta[id]) { if (m.instanceIndex == null) continue; o.getMatrixAt(m.instanceIndex, m4); o.updateMatrixWorld(); v.setFromMatrixPosition(m4).applyMatrix4(o.matrixWorld); xs.push(v.x); ys.push(v.y); zs.push(v.z); } }
      const q = (a, f) => { a = a.slice().sort((x, y) => x - y); return a[Math.floor(f * (a.length - 1))]; };
      const x0 = q(xs, .05), x1 = q(xs, .95), y0 = q(ys, .02), y1 = q(ys, .98), z0 = q(zs, .05), z1 = q(zs, .95), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      return { pos: [cx - (x1 - x0) * 0.1, y0 + 2, cz], tgt: [cx + (x1 - x0) * 0.25, y1, cz] }; }));
    say('POSE ' + ps.name + ' ' + JSON.stringify({ pos: ps.pos.map(v => +v.toFixed(2)), tgt: ps.tgt.map(v => +v.toFixed(2)) }));
    await setPose(ps); await sleep(3000); await setPose(ps); await sleep(1500);
    const pts = await GRID(); const res = {};
    for (const arm of ['base', 'fit']) {
      const r = await still(arm);
      res[arm] = { recv: await RECV(pts), rays: await SUNRAYS(pts), fit: grab(r.lines, /§STILL_SHADOW_FIT/), cull: grab(r.lines, /§STILL_CULL kept/), renders: grab(r.lines, /§STILL_SHADOW_RENDERS/), done: grab(r.lines, /§STILL_REFINE done/), stack: grab(r.lines, /§LIGHT_STACK/), size: grab(r.lines, /§SHADOW_SIZE_BY_ENVELOPE/) };
      fs.writeFileSync(path.join(OUT, 'fit_' + ps.name + '_' + arm + '.png'), Buffer.from(r.png.split(',')[1], 'base64'));
      await p.evaluate(() => window.APP.toggleStillRefine()); await sleep(4000);
      if (arm === 'fit') say('POSE ' + ps.name + ' after exit: ' + grab(L.slice(-40), /§STILL_CULL restored/));
    }
    const a = res.base.rays, f = res.fit.rays; let lit = 0, sh = 0, back = 0, mism = 0; for (let i = 0; i < a.length; i++) { if (a[i] === 2) back++; else if (a[i]) sh++; else lit++; if (a[i] !== f[i]) mism++; }
    for (const arm of ['base', 'fit']) say('POSE ' + ps.name + ' ' + arm + ':\n   ' + [res[arm].size, res[arm].fit, res[arm].cull, res[arm].renders, res[arm].done, res[arm].stack].filter(Boolean).join('\n   '));
    const rv = res.fit.recv; let lost = 0, skyLost = 0; for (let i = 0; i < a.length; i++) { const [ins, skyHit] = rv.out[i]; if (!ins && a[i] === 1) lost++; if (!ins && skyHit && a[i] !== 2) skyLost++; }
    say('POSE ' + ps.name + ' RECEIVERS fitBox=' + JSON.stringify(rv.box) + ' outsideBox=' + rv.out.filter(x => !x[0]).length + ' buildingShadowLost=' + lost + ' skylineShadowDropped=' + skyLost + ' (skyline meshes ' + rv.skyMeshes + ') VERDICT=' + (lost ? 'FAIL' : 'PASS'));
    say('POSE ' + ps.name + ' SUNRAY points=' + a.length + ' lit=' + lit + ' shadowed=' + sh + ' facingAway=' + back + ' mismatchFitVsBase=' + mism + ' VERDICT=' + (a.length < 50 ? 'VACUOUS' : (mism ? 'FAIL' : 'PASS')));
  }
  say('pageErrors=' + errs); await b.close(); })().catch(e => { say('FATAL ' + e); process.exit(1); });
