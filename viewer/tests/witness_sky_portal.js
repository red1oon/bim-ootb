// ⚠ DO NOT REMOVE — witness for §SKY_PORTAL (bim-compiler PHOTOREAL_STILL_RENDER.md). Read the log after every run.
// Issue: red1 — interiors are lit by the flat sky alone, windows bring no light in. Proves: an Alt+S places pane lights
// (placed>0, shadowed<=8, skipped logged), they are removed on exit (removed=placed), and their COST: mean render ms
// over 10 frames with vs without the portals on the real GPU. Full-load gated.
// Usage: node viewer/tests/witness_sky_portal.js --db /buildings/Hospital_extracted.db --want 63182 --pose hosp_l1
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = (k, d) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d;
const DB = arg('--db', '/buildings/Hospital_extracted.db'), WANT = +arg('--want', 63182), POSE = arg('--pose', 'hosp_l1'), Q = arg('--q', '');
const POSES = { hosp_l1: { ifc: true }, courtyard: { pos: [-62, 38, -4], tgt: [-16, -2, -4] }, none: null };
const OUT = process.env.OUT || '/tmp/witness_sky_portal'; fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, 'log_' + POSE + '_' + path.basename(DB, '.db') + '.txt'); const lines = []; const T0 = Date.now();
function say(s) { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(LOG, lines.join('\n')); }
(async () => {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000,
    env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  p.on('console', m => { const t = m.text(); if (/§SKY_PORTAL|§STILL_GLOW daylight|§STILL_DIALS_LAMPS|PAGEERROR|§LOAD_FAIL/.test(t)) say('[page] ' + t.slice(0, 320)); });
  p.on('pageerror', e => say('PAGEERROR ' + e.message));
  await p.goto('http://127.0.0.1:8600/viewer/viewer.html?db=' + DB + Q, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.APP && window.APP.guidMap && window.APP.ifc2three, { timeout: 180000 });
  let n = 0; for (let i = 0; i < 150; i++) { n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n >= WANT) break; await sleep(2000); }
  say('loaded guids=' + n + '/' + WANT + (n >= WANT ? '' : ' VACUOUS — incomplete load, this run proves nothing'));
  if (n < WANT) { await b.close(); return; }
  await p.evaluate((P) => { const A = window.APP;
    if (P && P.ifc) { const wx = 55.25, wy = 73.17, wz = 167.49, fx = 54.3, fy = 74.27, L = Math.hypot(fx - wx, fy - wy);
      const c = A.ifc2three(wx + 6 * (fx - wx) / L, wy + 6 * (fy - wy) / L, wz), t = A.ifc2three(wx, wy, wz);
      A.camera.position.set(c.x, c.y, c.z); A.controls.target.set(t.x, t.y, t.z); }
    else if (P) { A.camera.position.set(...P.pos); A.controls.target.set(...P.tgt); }
    A.controls.update(); A.updateSky(25, 180); if (A.markDirty) A.markDirty(); }, POSES[POSE]);
  await sleep(1500);
  await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
  for (let i = 0; i < 60 && !lines.some(l => /§SKY_PORTAL (placed|off)/.test(l)); i++) await sleep(1000);
  await sleep(5000);
  const time = () => p.evaluate(() => { const A = window.APP, r = A.renderer; for (let i = 0; i < 2; i++) r.render(A.scene, A.camera);
    const gl = r.getContext(); gl.finish(); const t = performance.now(); for (let i = 0; i < 10; i++) r.render(A.scene, A.camera); gl.finish(); return (performance.now() - t) / 10; });
  const withP = await time();
  const cnt = await p.evaluate(() => { let s = 0, sh = 0; window.APP.scene.traverse(o => { if (o.userData && o.userData.skyPortal) { s++; if (o.castShadow) sh++; } }); return { s, sh }; });
  await p.evaluate(() => window.SkyPortal.unstage(window.APP));
  const without = await time();
  say('§SKY_PORTAL_COST inScene=' + cnt.s + ' shadowed=' + cnt.sh + ' renderMs with=' + withP.toFixed(2) + ' without=' + without.toFixed(2) + ' delta=' + (withP - without).toFixed(2) + 'ms (10-frame mean, plain scene render, real GPU)');
  const png = await p.evaluate(() => window.APP.renderer.domElement.toDataURL('image/png'));
  await b.close();
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
