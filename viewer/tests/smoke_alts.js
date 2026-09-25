// ⚠ DO NOT REMOVE — 1-minute smoke (watchdog/red1 2026-09-26 loop): page loads, one Alt+S (real key) on Hospital at an
// optional pose, 0 Shader Error / Context Lost / pageerror; prints the §FAULT / §METER / §GI_STILL lines. Read the output.
// RUN: node smoke.js <port> [db] [want] [cam json] [tgt json]
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'); const sleep = ms => new Promise(r => setTimeout(r, ms));
const [PORT, DB = 'Hospital', WANT = '63182', CAMJ, TGTJ] = process.argv.slice(2);
(async () => { const T0 = Date.now(); const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }), args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--window-size=1705,1054'] });
  const p = await b.newPage(); await p.setViewport({ width: 1685, height: 874 }); const L = []; let se = 0, cl = 0, pe = 0;
  p.on('console', m => { const t = m.text(); L.push(t); if (/Shader Error/.test(t)) se++; if (/Context Lost|CONTEXT_LOST/i.test(t)) cl++; }); p.on('pageerror', e => { pe++; console.log('PAGEERROR ' + e.message.slice(0, 200)); });
  await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=/buildings/' + DB + '_extracted.db' + (process.env.QUERY || ''), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(w => window.APP && window.APP.guidMap && Object.keys(window.APP.guidMap).length >= w, { timeout: 400000, polling: 2000 }, +WANT); await sleep(1500);
  if (CAMJ) await p.evaluate((c, t) => { const A = window.APP; A.camera.position.fromArray(c); A.controls.target.fromArray(t); A.controls.update(); }, JSON.parse(CAMJ), JSON.parse(TGTJ));
  await sleep(500); await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
  for (let i = 0; i < 300 && !L.some(t => /§GI_STILL result|§GI_STILL_FAIL/.test(t)); i++) await sleep(1000);
  const sw = await p.evaluate(async () => (await (await fetch('/viewer/sw.js')).text()).match(/CACHE_VERSION = '([^']+)'/)[1]);
  L.filter(t => /§FAULT|§METER camera|§GI_STILL result|§LOAD_FAIL|§IRC|§SKY_VIEW_FIELD on|§SOURCED_LIGHT on/.test(t)).forEach(t => console.log('  ' + t.slice(0, 300)));
  console.log('SMOKE ' + ((se || cl || pe) ? 'FAIL' : 'PASS') + ' sw=' + sw + ' shaderError=' + se + ' contextLost=' + cl + ' pageError=' + pe + ' secs=' + ((Date.now() - T0) / 1000).toFixed(0));
  await b.close(); if (se || cl || pe) process.exitCode = 2; })().catch(e => { console.log('FATAL ' + e.message); process.exit(1); });
