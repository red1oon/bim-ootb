// ⚠ DO NOT REMOVE — witness for red1's crash report (effects.js:2934 Uncaught on sw v1292: a conflicted effects.js was cached
// during the merge window). Loads red1's exact URL (OCI Hospital db + &ghost=1) on a clean profile, real GPU: §EFFECTS_LOADED,
// 0 page errors, Alt+S stages, a click on the bounce overlay + its Save PNG button do NOT cancel, Esc does. Read the log.
// Repro red1's exact URL on the real GPU with a clean profile: OCI Hospital db + &ghost=1. §EFFECTS_LOADED, no Uncaught,
// Alt+S stages (§STILL_STATUS stagingStart / §STILL_BASE), lock on, Esc exits.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const T0 = Date.now(); const say = s => console.log('+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s);
(async () => { const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }), args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
  const p = await b.newPage(); await p.setViewport({ width: 1666, height: 864 }); let errs = 0; const L = [];
  p.on('console', m => { const t = m.text(); L.push(t); if (/§EFFECTS_(INIT|LOADED)|Uncaught|§STILL_STATUS stagingStart|§STILL_BASE sky|§STILL_LOCK|§STILL_REFINE (done|cancelled)|§GI_STILL result|Shader Error|§LOAD_FAIL|SyntaxError/.test(t)) say('[page] ' + t.slice(0, 180)); });
  p.on('pageerror', e => { errs++; say('PAGEERROR ' + e.message); });
  const OCI = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/buildings/Hospital_extracted.db';
  await p.goto('http://127.0.0.1:8600/viewer/viewer.html?db=' + encodeURIComponent(OCI) + '&ghost=1', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.APP && window.APP.guidMap, { timeout: 240000 });
  let n = -1, stable = 0; for (let i = 0; i < 200 && stable < 3; i++) { await sleep(2000); const s = await p.evaluate(() => ({ n: Object.keys(window.APP.guidMap).length, st: !!window.APP.streaming })); if (!s.st && s.n > 0 && s.n === n) stable++; else stable = 0; n = s.n; }
  say('loaded guids=' + n + ' pageErrors=' + errs + ' effectsLoadedLine=' + L.some(t => /§EFFECTS_LOADED|§EFFECTS_INIT/.test(t)));
  await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
  for (let i = 0; i < 300 && !L.some(t => /§GI_STILL result|§GI_STILL_OFF/.test(t)); i++) await sleep(1000);
  await p.mouse.click(600, 400); await sleep(500); const btn = await p.$("#gi-still-overlay button"); say("overlay button present=" + !!btn); if (btn) { await btn.click(); await sleep(800); }
  say('after click: stillActive=' + await p.evaluate(() => !!window.APP._stillRefineActive));
  await p.keyboard.press('Escape'); await sleep(2000);
  say('after Esc: stillActive=' + await p.evaluate(() => !!window.APP._stillRefineActive) + ' pageErrors=' + errs);
  await b.close(); })().catch(e => { say('FATAL ' + e); process.exit(1); });
