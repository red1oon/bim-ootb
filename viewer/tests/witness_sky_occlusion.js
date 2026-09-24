// ⚠ DO NOT REMOVE — witness for §SKY_OCCLUSION (bim-compiler PHOTOREAL_STILL_RENDER.md). Read the log after every run.
// Issue: red1 — "indoor floor too bright, not taking in shadows": the open-sky hemi + env light covered floors.
// Proves: the map is built (finite span, coveredFrac logged), materials get uSkyOcc=1 during the still and 0 after exit,
// and shoots each pose with occlusion ON (default) and OFF (&skyocc=1 equivalent, APP._stillSkyOcc=1) for red1's eye:
// L1 interior (should darken), ref 1 courtyard pose_p1 and ref 2 aerial (outdoor: should not change).
// No WebGPU flag: the bounce stands down (short GPU use; red1 shares the GPU). Real GPU WebGL, full-load gated.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = process.env.OUT || '/tmp/witness_sky_occlusion'; fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, 'log.txt'); const lines = []; const T0 = Date.now();
function say(s) { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(LOG, lines.join('\n')); }
const POSES = { l1: 'ifc', ref1: { pos: [-62, 38, -4], tgt: [-16, -2, -4] }, ref2: { pos: [-39.469, 12.563, 50.109], tgt: [3, -4, 3] } };
(async () => {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000,
    env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  p.on('console', m => { const t = m.text(); if (/§SKY_OCCLUSION|§STILL_REFINE done|Shader Error|PAGEERROR/.test(t)) say('[page] ' + t.slice(0, 300)); });
  p.on('pageerror', e => say('PAGEERROR ' + e.message));
  await p.goto('http://127.0.0.1:8600/viewer/viewer.html?db=/buildings/Hospital_extracted.db', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.APP && window.APP.guidMap && window.APP.ifc2three, { timeout: 180000 });
  let n = 0; for (let i = 0; i < 150; i++) { n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n >= 63182) break; await sleep(2000); }
  say('loaded guids=' + n + '/63182' + (n >= 63182 ? '' : ' VACUOUS'));
  if (n < 63182) { await b.close(); return; }
  const onCount = () => p.evaluate(() => { const R = window.APP.renderer, s = new Set(); let on = 0, has = 0; window.APP.scene.traverse(o => { if (o.material && o.visible) [].concat(o.material).forEach(m => s.add(m)); });
    s.forEach(m => { const U = R.properties.get(m).uniforms; if (U && U.uSkyOcc) { has++; if (U.uSkyOcc.value === 1) on++; } }); return on + '/' + has; });
  for (const [name, P] of Object.entries(POSES)) for (const occ of [true, false]) {
    await p.evaluate((P, occ) => { const A = window.APP; A._stillSkyOcc = occ ? undefined : 1;
      if (P === 'ifc') { const wx = 55.25, wy = 73.17, wz = 167.49, fx = 54.3, fy = 74.27, L = Math.hypot(fx - wx, fy - wy);
        const c = A.ifc2three(wx + 6 * (fx - wx) / L, wy + 6 * (fy - wy) / L, wz), t = A.ifc2three(wx, wy, wz); A.camera.position.set(c.x, c.y, c.z); A.controls.target.set(t.x, t.y, t.z); }
      else { A.camera.position.set(...P.pos); A.controls.target.set(...P.tgt); }
      A.controls.update(); A.updateSky(25, 180); if (A.markDirty) A.markDirty(); }, P, occ);
    await sleep(1200);
    const before = lines.length;
    await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
    for (let i = 0; i < 90; i++) { if (lines.slice(before).some(l => /§STILL_REFINE done/.test(l))) break; await sleep(1000); }
    await sleep(1500);
    say('§SKY_OCCLUSION_SHOT pose=' + name + ' occ=' + (occ ? 'on' : 'off') + ' materialsOn=' + await onCount());
    const png = await p.evaluate(() => window.APP.renderer.domElement.toDataURL('image/png'));
    fs.writeFileSync(path.join(OUT, name + '_' + (occ ? 'on' : 'off') + '.png'), Buffer.from(png.split(',')[1], 'base64'));
    await p.evaluate(() => { try { window.APP.toggleStillRefine(); } catch (e) {} }); await sleep(2000);
    say('§SKY_OCCLUSION_EXIT pose=' + name + ' materialsOn=' + await onCount());
  }
  await b.close();
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
