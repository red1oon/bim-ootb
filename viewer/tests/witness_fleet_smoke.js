// ⚠ DO NOT REMOVE — witness for the end-of-session PR gate (bim-compiler PHOTOREAL_STILL_RENDER.md). Read the log.
// Issue: the PR ships §SURFACE_R10 split meshes, portals, Fresnel clones, light budget/pads, the Alt+S guard/lock and
// the bounce fixes to EVERY building; any of them could break the live site for a building nobody looked at today.
// Per building (real GPU, WebGPU on): full load (streaming done, bbox cleared, guid count stable), 0 PAGEERROR / shader
// errors / §LOAD_FAIL, nav render ms (60 frames, orbiting), one Alt+S that completes (refine done + bounce result or
// OFF) and exits on Esc, and DLOD on split meshes: zero-scaled > 0 when looking away, 0 after restore.
// Usage: node witness_fleet_smoke.js --port 8600 [--only LTU_AHouse]
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = (k, d) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d;
const PORT = +arg('--port', 8600), ONLY = arg('--only', ''), FULL = !process.argv.includes('--nav-only');
const FLEET = ['Hospital', 'Terminal', 'HHS_Office_Federated', 'Clinic', 'JKR', 'LTU_AHouse', 'Duplex'].filter(b => !ONLY || b === ONLY);
const OUT = process.env.OUT || '/tmp/witness_fleet_smoke'; fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, 'log_' + PORT + '.txt'); const lines = []; const T0 = Date.now();
function say(s) { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(LOG, lines.join('\n')); }
(async () => {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 1800000,
    env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
  const verdicts = [];
  for (const bld of FLEET) {
    const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
    let errs = 0; const L = [];
    p.on('console', m => { const t = m.text(); L.push(t); if (/Shader Error|§LOAD_FAIL|THREE\.WebGLProgram/.test(t)) { errs++; say(bld + ' ERR ' + t.slice(0, 200)); } });
    p.on('pageerror', e => { errs++; say(bld + ' PAGEERROR ' + e.message); });
    await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=/buildings/' + bld + '_extracted.db', { waitUntil: 'domcontentloaded', timeout: 60000 });
    try { await p.waitForFunction(() => window.APP && window.APP.guidMap, { timeout: 180000 }); } catch (e) { say(bld + ' FAIL no APP'); verdicts.push(bld + ' FAIL'); await p.close(); continue; }
    let n = -1, stable = 0;
    for (let i = 0; i < 200 && stable < 3; i++) { await sleep(2000);
      const s = await p.evaluate(() => ({ n: Object.keys(window.APP.guidMap).length, st: !!window.APP.streaming, bb: (window.APP._bboxPlaceholders || []).length }));
      if (!s.st && s.bb === 0 && s.n > 0 && s.n === n) stable++; else stable = 0; n = s.n; }
    const full = stable >= 3;
    say(bld + ' load guids=' + n + ' stable=' + full + (full ? '' : ' VACUOUS — never settled'));
    // nav render cost: 60 frames orbiting the target
    const navMs = await p.evaluate(async () => { const A = window.APP, gl = A.renderer.getContext(), t0 = A.controls.target.clone(), r = A.camera.position.distanceTo(t0);
      const ts = []; for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; A.camera.position.set(t0.x + r * Math.cos(a), A.camera.position.y, t0.z + r * Math.sin(a)); A.camera.lookAt(t0);
        if (A.dlodTick) A.dlodTick(); const t = performance.now(); A.renderer.render(A.scene, A.camera); gl.finish(); ts.push(performance.now() - t); }
      ts.sort((x, y) => x - y); return { median: ts[30], p90: ts[54] }; });
    say(bld + ' §FLEET_NAV renderMs median=' + navMs.median.toFixed(2) + ' p90=' + navMs.p90.toFixed(2) + ' (fps~' + (1000 / navMs.median).toFixed(0) + ')');
    // DLOD on split (R10) instanced meshes: look away -> some zero-scaled; restore -> none.
    const dl = await p.evaluate(async () => { const A = window.APP, m4 = new THREE.Matrix4(); const split = [];
      A.scene.traverse(o => { if (o.isInstancedMesh && o.geometry && o.geometry.getAttribute && o.geometry.getAttribute('aPane')) split.push(o); });
      const zero = () => { let z = 0, t = 0; split.forEach(o => { for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); t++; if (Math.abs(m4.determinant()) < 1e-12) z++; } }); return { z, t }; };
      const before = zero(); if (A.dlodEnable && !A._dlodEnabled) A.dlodEnable();
      const tg = A.controls.target.clone(); A.controls.target.set(tg.x + 5000, tg.y, tg.z + 5000); A.camera.lookAt(A.controls.target); A.controls.update();
      for (let i = 0; i < 20; i++) { if (A.dlodTick) A.dlodTick(); await new Promise(r => setTimeout(r, 50)); }
      const away = zero(); A.controls.target.copy(tg); A.camera.lookAt(tg); A.controls.update();
      if (A.dlodDisable) A.dlodDisable('fleet-smoke'); await new Promise(r => setTimeout(r, 300));
      const restored = zero(); if (A.dlodEnable) A.dlodEnable();
      return { splitMeshes: split.length, instances: before.t, zeroBefore: before.z, zeroAway: away.z, zeroRestored: restored.z }; });
    say(bld + ' §FLEET_DLOD_SPLIT ' + JSON.stringify(dl) + (dl.splitMeshes === 0 ? ' (no split instanced meshes: n/a)' : (dl.zeroAway > 0 && dl.zeroRestored === 0 ? ' OK' : ' CHECK')));
    let stillOk = 'skipped';
    if (FULL) {
      const before = L.length;
      await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
      let done = false, gi = false;
      for (let i = 0; i < 400; i++) { const sl = L.slice(before); done = sl.some(t => /§STILL_REFINE done/.test(t)); gi = sl.some(t => /§GI_STILL result|§GI_STILL_OFF/.test(t)) || (done && sl.some(t => /§STILL_GUARD refused/.test(t)));
        if (done && gi) break; if (L.slice(before).some(t => /§STILL_GUARD refused/.test(t))) break; await sleep(1000); }
      const guard = L.slice(before).find(t => /§STILL_GUARD/.test(t)) || '';
      await sleep(1000); await p.keyboard.press('Escape'); await sleep(2000);
      const active = await p.evaluate(() => !!window.APP._stillRefineActive);
      stillOk = (done && gi && !active) ? 'OK' : ('FAIL done=' + done + ' bounce=' + gi + ' stillActiveAfterEsc=' + active + ' ' + guard.slice(0, 120));
      say(bld + ' §FLEET_ALTS ' + stillOk + ' ' + (L.slice(before).find(t => /§GI_STILL result|§GI_STILL_OFF/.test(t)) || '').slice(0, 120));
    }
    const ok = full && errs === 0 && (stillOk === 'OK' || stillOk === 'skipped');
    verdicts.push(bld + ' ' + (ok ? 'PASS' : 'FAIL') + ' errors=' + errs); say(bld + ' VERDICT ' + (ok ? 'PASS' : 'FAIL') + ' errors=' + errs);
    await p.close();
  }
  say('§FLEET_SMOKE ' + verdicts.join(' | '));
  await b.close();
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
