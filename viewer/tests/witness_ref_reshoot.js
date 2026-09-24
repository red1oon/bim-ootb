// ⚠ DO NOT REMOVE — witness for the §RESUME reference-look re-shoots (bim-compiler PHOTOREAL_STILL_RENDER.md). Read the log.
// Issue: every lighting/glass change must not regress red1's two reference stills (ref 1 courtyard "quite good outside",
// ref 2 aerial "see the bounce on the wall from the middle wing"). Shoots both poses at red1's window size with the
// served defaults, saves the bounce COMPOSITE (the #gi-still-overlay canvas, what red1 saves), logs the §STILL_POSE /
// §GI_STILL result lines. Sun left at the page default (red1's stills did not move it). Real GPU + WebGPU.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = process.env.OUT || '/tmp/witness_ref_reshoot'; fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, 'log.txt'); const lines = []; const T0 = Date.now();
function say(s) { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(LOG, lines.join('\n')); }
const POSES = { ref1: { pos: [-62, 38, -4], tgt: [-16, -2, -4] }, ref2: { pos: [-39.469, 12.563, 50.109], tgt: [3, -4, 3] } };
(async () => {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 1800000,
    env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--window-size=1686,1044'] });
  const p = await b.newPage(); await p.setViewport({ width: 1666, height: 864 });
  p.on('console', m => { const t = m.text(); if (/§STILL_POSE|§GI_STILL result|§GI_STILL_OFF|§SKY_PORTAL placed|§STILL_LIGHT_PAD lamps|Shader Error|PAGEERROR/.test(t)) say('[page] ' + t.slice(0, 260)); });
  await p.goto('http://127.0.0.1:8600/viewer/viewer.html?db=/buildings/Hospital_extracted.db', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.APP && window.APP.guidMap, { timeout: 180000 });
  let n = 0; for (let i = 0; i < 150; i++) { n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n >= 63182) break; await sleep(2000); }
  say('loaded guids=' + n + '/63182' + (n >= 63182 ? '' : ' VACUOUS'));
  if (n < 63182) { await b.close(); return; }
  for (const [name, P] of Object.entries(POSES)) {
    await p.evaluate((P) => { const A = window.APP; A.camera.position.set(...P.pos); A.controls.target.set(...P.tgt); A.controls.update(); window.__giStillDebug = null;
      const o = document.getElementById('gi-still-overlay'); if (o) o.remove(); }, P);
    await sleep(1500); const before = lines.length;
    await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
    for (let i = 0; i < 400; i++) { if (lines.slice(before).some(l => /§GI_STILL result|§GI_STILL_OFF/.test(l))) break; await sleep(1000); }
    await sleep(1000);
    const png = await p.evaluate(() => { const c = document.querySelector('#gi-still-overlay canvas'); return c ? c.toDataURL('image/png') : window.APP.renderer.domElement.toDataURL('image/png'); });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(png.split(',')[1], 'base64'));
    say('saved ' + name + '.png');
    await p.evaluate(() => { const o = document.getElementById('gi-still-overlay'); if (o) o.remove(); try { window.APP.toggleStillRefine(); } catch (e) {} }); await sleep(2500);
  }
  await b.close();
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
