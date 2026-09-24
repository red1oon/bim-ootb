// ⚠ DO NOT REMOVE — witness for §GI_STILL_GAIN_DIAL (bim-compiler PHOTOREAL_STILL_RENDER.md). Read the log after every run.
// Issue: the bounce gain was baked into the shader at first build and the renderer is kept, so a new gain on a
// later Alt+S did nothing. Proves: two presses at gain 0.6 (URL) then 1.8 (APP._stillBounceGain) log two different
// "§GI_STILL gain= applied" lines AND the bounce ran (a §GI_STILL result line, no §GI_STILL_OFF). Real GPU only.
// Usage: node viewer/tests/witness_gi_gain_dial.js --port 8600 [--db /buildings/HHS_Office_Federated_extracted.db --want 6839]
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = (k, d) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d;
const PORT = +arg('--port', 8600), DB = arg('--db', '/buildings/HHS_Office_Federated_extracted.db'), WANT = +arg('--want', 6839);
const OUT = process.env.OUT || '/tmp/witness_gi_gain_dial'; fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, 'log.txt'); const lines = []; const T0 = Date.now();
function say(s) { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(LOG, lines.join('\n')); }
(async () => {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000,
    env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--window-size=1300,860'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  p.on('console', m => { const t = m.text(); if (/§GI_STILL|§STILL_BASE|§STILL_DIALS|PAGEERROR|§LOAD_FAIL/.test(t)) say('[page] ' + t.slice(0, 260)); });
  p.on('pageerror', e => say('PAGEERROR ' + e.message));
  await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=' + DB + '&bounce=0.6', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.APP && window.APP.guidMap, { timeout: 180000 });
  let n = 0; for (let i = 0; i < 90; i++) { n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n >= WANT) break; await sleep(2000); }
  say('loaded guids=' + n + '/' + WANT + (n >= WANT ? '' : ' VACUOUS — incomplete load, this run proves nothing'));
  say('gpu ' + await p.evaluate(async () => { try { const a = await navigator.gpu.requestAdapter(); return a ? 'webgpu adapter ok' : 'no adapter'; } catch (e) { return 'no navigator.gpu'; } }));
  const press = async (tag) => {
    await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
    for (let i = 0; i < 180; i++) {
      const done = await p.evaluate(() => !!window.__giStillDebug && window.__giStillDebug.__seen !== true); if (done) { await p.evaluate(() => { window.__giStillDebug.__seen = true; }); break; } await sleep(1000); }
    say(tag + ' debug ' + JSON.stringify(await p.evaluate(() => { const d = window.__giStillDebug || {}; return { mode: d.mode, gain: d.gain, ao: d.ao, compositeMean: d.compositeMean, appMean: d.appMean, err: d.err }; })));
    await p.evaluate(() => { try { window.APP.toggleStillRefine(); } catch (e) {} }); await sleep(3000);
  };
  await press('press1 (url bounce=0.6)');
  await p.evaluate(() => { window.APP._stillBounceGain = 1.8; });
  await press('press2 (APP._stillBounceGain=1.8)');
  const g = lines.filter(l => /§GI_STILL gain=/.test(l)).map(l => l.replace(/.*§GI_STILL gain=([0-9.]+).*/, '$1'));
  const off = lines.some(l => /§GI_STILL_OFF/.test(l));
  say('VERDICT gains=' + JSON.stringify(g) + ' off=' + off + ' -> ' + (n < WANT ? 'VACUOUS' : (g.length >= 2 && g[0] !== g[g.length - 1] && !off ? 'PASS' : 'FAIL')));
  await b.close();
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
