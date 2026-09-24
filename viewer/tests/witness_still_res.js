// ⚠ DO NOT REMOVE — witness for §STILL_RES (bim-compiler PHOTOREAL_STILL_RENDER.md). Read the log.
// Issue: red1 "The Alt-S, can we bump up its resolution?" — the saved still is never bigger than the window (1666x864).
// Proves or disproves, per preset (window / 1440p / 4k), on a real Alt+S press with the bounce: the app drawing buffer and
// the saved bounce PNG equal the target size; the cost (refine ms, bounce ms, est GPU MB, readback MB); pixelRatio is back
// to the nav value after Esc; 0 page errors. Saves each still for the same-pose sheet. Full-count gate, else VACUOUS.
// Usage: node viewer/tests/witness_still_res.js <port> <db> <want> '<pose json>' <outdir> [presets csv]
/* global Buffer */
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const T0 = Date.now(); const say = s => console.log('+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s);
const [PORT, DB, WANT, POSE_J, OUT, PRESETS] = process.argv.slice(2); const POSE = JSON.parse(POSE_J);
(async () => { const b = await puppeteer.launch({ headless: true, protocolTimeout: 1800000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }), args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
  const p = await b.newPage(); await p.setViewport({ width: 1666, height: 864 }); let errs = 0; const L = [];
  p.on('console', m => { const t = m.text(); L.push(t); if (/§STILL_RES|§STILL_REFINE (done|cancelled)|§GI_STILL result|§GI_STILL_OFF|Uncaught|Shader Error/.test(t)) say('[page] ' + t.slice(0, 220)); });
  p.on('pageerror', e => { errs++; say('PAGEERROR ' + e.message); });
  await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=' + DB, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.APP && window.APP.guidMap, { timeout: 240000 });
  let n = -1, st = 0; for (let i = 0; i < 200 && st < 3; i++) { await sleep(2000); const s = await p.evaluate(() => ({ n: Object.keys(window.APP.guidMap).length, s: !!window.APP.streaming })); if (!s.s && s.n > 0 && s.n === n) st++; else st = 0; n = s.n; }
  if (n !== +WANT) { say('VACUOUS loaded ' + n + ' want ' + WANT); await b.close(); return; }
  const navPR = await p.evaluate(() => window.APP.renderer.getPixelRatio()); say('loaded ' + n + ' navPixelRatio=' + navPR);
  const setPose = () => p.evaluate(ps => { const A = window.APP; A.camera.position.fromArray(ps.pos); A.controls.target.fromArray(ps.tgt); A.controls.update(); A.camera.lookAt(A.controls.target); A.camera.updateMatrixWorld(true); if (A.markDirty) A.markDirty(); }, POSE);
  for (const preset of (PRESETS || 'window,1440p,4k').split(',')) {
    await setPose(); await sleep(2500); await setPose(); await sleep(1000);
    await p.evaluate(pr => { window.APP._stillRes = pr; }, preset);
    const b1 = L.length; await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
    for (let i = 0; i < 900 && !L.slice(b1).some(t => /§GI_STILL result|§GI_STILL_OFF|§GI_STILL_FAIL/.test(t)); i++) await sleep(1000);
    await sleep(2000);
    const got = await p.evaluate(() => { const A = window.APP, cv = A.renderer.domElement, ov = document.getElementById('gi-still-overlay'), c = ov && ov.querySelector('canvas');
      return { buffer: cv.width + 'x' + cv.height, pr: A.renderer.getPixelRatio(), bounce: c ? c.width + 'x' + c.height : null, png: c ? c.toDataURL('image/png') : null }; });
    const lines = L.slice(b1), grab = re => (lines.find(t => re.test(t)) || '').slice(0, 220);
    const tgt = (grab(/§STILL_RES preset/).match(/target=(\d+x\d+)/) || [])[1];
    if (got.png) fs.writeFileSync(path.join(OUT, 'res_' + preset + '.png'), Buffer.from(got.png.split(',')[1], 'base64'));
    await p.keyboard.press('Escape'); await sleep(3000);
    const after = await p.evaluate(() => ({ pr: window.APP.renderer.getPixelRatio(), buffer: window.APP.renderer.domElement.width + 'x' + window.APP.renderer.domElement.height }));
    say('PRESET ' + preset + ' target=' + tgt + ' appBuffer=' + got.buffer + ' bouncePNG=' + got.bounce + ' prDuring=' + got.pr.toFixed(3) + ' prAfterEsc=' + after.pr.toFixed(3) + ' bufferAfter=' + after.buffer +
      '\n   ' + [grab(/§STILL_RES preset/), grab(/§STILL_REFINE done/), grab(/§STILL_RES bounce/), grab(/§GI_STILL result/)].join('\n   ') +
      '\n   VERDICT=' + (got.bounce && got.buffer === tgt && (preset === 'window' || got.bounce === tgt) && Math.abs(after.pr - navPR) < 1e-6 ? 'PASS' : 'FAIL'));
  }
  say('pageErrors=' + errs); await b.close(); })().catch(e => { say('FATAL ' + e); process.exit(1); });
