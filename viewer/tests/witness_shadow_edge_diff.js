// ⚠ DO NOT REMOVE — witness for §SHADOW_EDGE_DIFF (bim-compiler PHOTOREAL_STILL_RENDER.md). Read the log after every run.
// Issue: red1 sees smooth shadow edges with nav Shadow but a stair-step in Alt+S, although nav's map is COARSER (2048
// vs 8192). Logs, for nav Shadow and for Alt+S at the same Hospital pose: shadowMap.type, mapSize, frustum, bias,
// normalBias, radius, sun elevation, and the texel footprint on flat ground = texel / sin(elev). Then Alt+S arms, one
// variable at a time (normalBias 0 · nav bias · 2048 map · nav's sun elevation), each a plain render crop saved for
// red1's eye (LOOK is his; the numbers are the evidence). Real GPU, full-load gated.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = process.env.OUT || '/tmp/witness_shadow_edge_diff'; fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, 'log.txt'); const lines = []; const T0 = Date.now();
function say(s) { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(LOG, lines.join('\n')); }
(async () => {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000,
    env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  p.on('console', m => { const t = m.text(); if (/§SHADOW_FRUSTUM|§PHOTO_SHADOW_CONTACT|§SHADOW_SIZE|PAGEERROR/.test(t)) say('[page] ' + t.slice(0, 260)); });
  await p.goto('http://127.0.0.1:8600/viewer/viewer.html?db=/buildings/Hospital_extracted.db', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.APP && window.APP.guidMap, { timeout: 180000 });
  let n = 0; for (let i = 0; i < 150; i++) { n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n >= 63182) break; await sleep(2000); }
  say('loaded guids=' + n + '/63182' + (n >= 63182 ? '' : ' VACUOUS'));
  if (n < 63182) { await b.close(); return; }
  const pose = () => p.evaluate(() => { const A = window.APP; A.camera.position.set(-62, 38, -4); A.controls.target.set(-16, -2, -4); A.controls.update(); });
  const state = (tag) => p.evaluate((tag) => { const A = window.APP, S = A.sun.shadow, c = S.camera, r = A.renderer;
    const d = A.sun.position.clone().sub(A.sun.target.position).normalize(), el = Math.asin(d.y) * 180 / Math.PI;
    const texel = (c.right - c.left) / S.mapSize.width;
    return tag + ' type=' + r.shadowMap.type + ' (PCF=1 PCFSoft=2 VSM=3) map=' + S.mapSize.width + ' frustumW=' + (c.right - c.left).toFixed(1) +
      'm near=' + c.near.toFixed(0) + ' far=' + c.far.toFixed(0) + ' bias=' + S.bias.toExponential(3) + ' normalBias=' + S.normalBias.toFixed(3) +
      ' radius=' + S.radius + ' sunElev=' + el.toFixed(1) + ' texel=' + texel.toFixed(3) + 'm groundFootprint=' + (texel / Math.sin(el * Math.PI / 180)).toFixed(3) + 'm'; }, tag);
  const crop = async (name) => { const png = await p.evaluate(() => { const A = window.APP; A.renderer.shadowMap.needsUpdate = true;
      A.renderer.render(A.scene, A.camera); return A.renderer.domElement.toDataURL('image/png'); });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(png.split(',')[1], 'base64')); };
  // NAV Shadow
  await pose(); await p.evaluate(() => window.APP.toggleShadow()); await sleep(6000); await pose(); await sleep(1500);
  say('§SHADOW_EDGE_DIFF ' + await state('NAV')); await crop('nav');
  await p.evaluate(() => window.APP.toggleShadow()); await sleep(1500);
  // shadow mode may cycle through several states — make sure it is off
  for (let i = 0; i < 4 && await p.evaluate(() => !!window.APP._shadowOn); i++) { await p.evaluate(() => window.APP.toggleShadow()); await sleep(800); }
  say('nav shadow off=' + !(await p.evaluate(() => !!window.APP._shadowOn)));
  // ALT+S at the same pose, sun from the still (real sun state)
  await pose(); await p.evaluate(() => { window.APP.updateSky(25, 180); });
  await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
  for (let i = 0; i < 60 && !lines.some(l => l.includes('§PHOTO_SHADOW_CONTACT')); i++) await sleep(1000);
  await sleep(4000);
  say('§SHADOW_EDGE_DIFF ' + await state('ALTS')); await crop('alts_asis');
  const base = await p.evaluate(() => { const S = window.APP.sun.shadow; return { bias: S.bias, nb: S.normalBias, map: S.mapSize.width, pos: window.APP.sun.position.toArray() }; });
  const arm = async (name, fn) => { await p.evaluate(fn); say('§SHADOW_EDGE_DIFF ' + await state('ALTS_' + name)); await crop('alts_' + name);
    await p.evaluate((B) => { const A = window.APP, S = A.sun.shadow; S.bias = B.bias; S.normalBias = B.nb;
      if (S.mapSize.width !== B.map) { S.mapSize.set(B.map, B.map); if (S.map) { S.map.dispose(); S.map = null; } } A.sun.position.fromArray(B.pos); A.sun.updateMatrixWorld(); }, base); };
  await arm('normalBias0', () => { window.APP.sun.shadow.normalBias = 0; });
  await arm('navBias', () => { const S = window.APP.sun.shadow; S.normalBias = 0; S.bias = -0.0005; });
  await arm('map2048', () => { const S = window.APP.sun.shadow; S.mapSize.set(2048, 2048); if (S.map) { S.map.dispose(); S.map = null; } });
  await arm('navSunElev', () => { const A = window.APP, t = A.sun.target.position, d = A.sun.position.distanceTo(t), h = A.sun.position.clone().sub(t); h.y = 0; h.normalize();
    const el = Math.atan2(2, 1); A.sun.position.copy(t).addScaledVector(h, d * Math.cos(el)).add({ x: 0, y: d * Math.sin(el), z: 0 }); A.sun.updateMatrixWorld(); });
  await b.close();
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
