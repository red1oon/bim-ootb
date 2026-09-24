// ⚠ DO NOT REMOVE — witness for §GLASS_FRESNEL (bim-compiler PHOTOREAL_STILL_RENDER.md). Read the log after every run.
// Issue: red1 wants physically reflective windows; a first sheet was captured badly (a pose below ground, a frame with
// the building missing, described unseen). Proves, per pose x (off, on): full load (63,182), THIS press's
// §STILL_REFINE done seen before capture, visible-mesh count at capture, §GLASS_FRESNEL patched/skipped per class, no
// shader/page error. Poses: pose_p1 (ref 2 stand-in), courtyard_a (ref 1 stand-in, eye level between the wings,
// checked by eye 2026-09-24), L1 interior. WebGL real GPU, no WebGPU (bounce stands down; short GPU use).
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = process.env.OUT || '/tmp/witness_glass_fresnel'; fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, 'log.txt'); const lines = []; const T0 = Date.now();
function say(s) { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(LOG, lines.join('\n')); }
const POSES = { pose_p1: { pos: [-62, 38, -4], tgt: [-16, -2, -4] }, courtyard_a: { pos: [-40, 1.8, -4], tgt: [-10, 3, -4] }, l1: 'ifc' };
(async () => {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000,
    env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 1666, height: 864 });
  let errors = 0;
  p.on('console', m => { const t = m.text(); if (/Shader Error|WebGLProgram/.test(t)) errors++; if (/§GLASS_FRESNEL|§STILL_REFINE done|§GI_STILL (stage|result)|§GI_STILL_OFF|Shader Error|PAGEERROR/.test(t)) say('[page] ' + t.slice(0, 300)); });
  p.on('pageerror', e => { errors++; say('PAGEERROR ' + e.message); });
  await p.goto('http://127.0.0.1:8600/viewer/viewer.html?db=/buildings/Hospital_extracted.db', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.APP && window.APP.guidMap && window.APP.ifc2three, { timeout: 180000 });
  let n = 0; for (let i = 0; i < 150; i++) { n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n >= 63182) break; await sleep(2000); }
  say('loaded guids=' + n + '/63182' + (n >= 63182 ? '' : ' VACUOUS'));
  if (n < 63182) { await b.close(); return; }
  for (const [name, P] of Object.entries(POSES)) for (const on of [0, 1]) {
    await p.evaluate((P, on) => { const A = window.APP; A._stillFresnel = on;
      if (P === 'ifc') { const wx = 55.25, wy = 73.17, wz = 167.49, fx = 54.3, fy = 74.27, L = Math.hypot(fx - wx, fy - wy);
        const c = A.ifc2three(wx + 6 * (fx - wx) / L, wy + 6 * (fy - wy) / L, wz), t = A.ifc2three(wx, wy, wz); A.camera.position.set(c.x, c.y, c.z); A.controls.target.set(t.x, t.y, t.z); }
      else { A.camera.position.set(...P.pos); A.controls.target.set(...P.tgt); }
      A.controls.update(); if (A.markDirty) A.markDirty(); }, P, on);
    await sleep(2000);
    const before = lines.length;
    await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
    let done = false; for (let i = 0; i < 180; i++) { if (lines.slice(before).some(l => /§STILL_REFINE done/.test(l))) { done = true; break; } await sleep(1000); }
    // the bounce (if it runs) borrows the scene after the still is done: capture only once it has handed it back
    await sleep(3000); let waited = 0; while (waited < 300 && await p.evaluate(() => !!window.APP._sceneBorrowed)) { await sleep(1000); waited++; }
    say('bounce hand-back waited=' + waited + 's');
    await sleep(1500);
    const vis = await p.evaluate(() => { let v = 0; window.APP.scene.traverse(o => { if ((o.isMesh || o.isInstancedMesh || o.isBatchedMesh) && o.visible) v++; }); return v; });
    const png = await p.evaluate(() => window.APP.renderer.domElement.toDataURL('image/png'));
    fs.writeFileSync(path.join(OUT, name + '_' + (on ? 'on' : 'off') + '.png'), Buffer.from(png.split(',')[1], 'base64'));
    say('§GLASS_FRESNEL_SHOT pose=' + name + ' fresnel=' + on + ' refineDone=' + done + ' visibleMeshes=' + vis + ' errorsSoFar=' + errors + (done ? '' : ' VACUOUS — capture without a finished still'));
    await p.evaluate(() => { try { window.APP.toggleStillRefine(); } catch (e) {} }); await sleep(2500);
  }
  await b.close();
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
