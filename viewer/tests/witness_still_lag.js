// ⚠ DO NOT REMOVE — witness for §STILL_LAG (bim-compiler PHOTOREAL_STILL_RENDER.md). Read the log after every run.
// Issue: red1 — Alt+S "getting laggy": §STILL_REFINE elapsedMs 5.9 s (placed=0) -> 42-47 s (§SKY_PORTAL placed 16-24),
// §GI_STILL bounce passes 1.4 s -> 13 s, heap 1688 -> 2127 MB. Measures, per press, on one page: refine elapsedMs,
// the GI stage times, portals placed, heap — for the URL dials given (--q), N presses. Real GPU, full-load gated.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = (k, d) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d;
const Q = arg('--q', ''), TAG = arg('--tag', 'x'), PRESSES = +arg('--presses', 2);
const OUT = process.env.OUT || '/tmp/witness_still_lag'; fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, 'log_' + TAG + '.txt'); const lines = []; const T0 = Date.now();
function say(s) { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(LOG, lines.join('\n')); }
(async () => {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 1800000,
    env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--enable-precise-memory-info'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  p.on('console', m => { const t = m.text(); if (/§STILL_REFINE (done|start)|§SKY_PORTAL (placed|removed|off)|§GI_STILL stage|§GI_STILL result|§NIGHT_MEM_WITNESS|§GI_PRESS_COST|PAGEERROR/.test(t)) say('[page] ' + t.slice(0, 220)); });
  await p.goto('http://127.0.0.1:8600/viewer/viewer.html?db=/buildings/Hospital_extracted.db' + Q, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.APP && window.APP.guidMap && window.APP.ifc2three, { timeout: 180000 });
  let n = 0; for (let i = 0; i < 150; i++) { n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n >= 63182) break; await sleep(2000); }
  say('loaded guids=' + n + '/63182' + (n >= 63182 ? '' : ' VACUOUS'));
  if (n < 63182) { await b.close(); return; }
  for (let k = 1; k <= PRESSES; k++) {
    await p.evaluate(() => { const A = window.APP, wx = 55.25, wy = 73.17, wz = 167.49, fx = 54.3, fy = 74.27, L = Math.hypot(fx - wx, fy - wy);
      const c = A.ifc2three(wx + 6 * (fx - wx) / L, wy + 6 * (fy - wy) / L, wz), t = A.ifc2three(wx, wy, wz);
      A.camera.position.set(c.x, c.y, c.z); A.controls.target.set(t.x, t.y, t.z); A.controls.update(); A.updateSky(25, 180); window.__giStillDebug = null; });
    await sleep(1500);
    const before = lines.length;
    await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
    for (let i = 0; i < 400; i++) { if (lines.slice(before).some(l => /§GI_STILL result|§GI_STILL_OFF/.test(l))) break; await sleep(1000); }
    const heap = await p.evaluate(() => performance.memory ? (performance.memory.usedJSHeapSize / 1048576).toFixed(0) : 'n/a');
    say('§STILL_LAG press=' + k + ' heapMB=' + heap);
    await p.evaluate(() => { try { window.APP.toggleStillRefine(); } catch (e) {} }); await sleep(3000);
  }
  await b.close();
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
