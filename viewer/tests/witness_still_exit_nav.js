// ⚠ DO NOT REMOVE — witness for §STILL_EXIT_NAV (bim-compiler PHOTOREAL_STILL_RENDER.md). Read the log.
// Issue: after an Alt+S still red1 "has to refresh the viewer as it is stuck to continue" (v1294, OCI Hospital + &ghost=1).
// Proves or disproves, per exit path, that navigation comes back: after the still is closed the §STILL_LOCK is off,
// a mouse drag on the canvas moves the camera, and §FPS_MODE reports orbit=1. Two arms on red1's URL:
//   ARM close — the overlay's "Close (Esc)" BUTTON is clicked (not the key).  ARM esc — the Escape key.
// Real GPU, clean profile. Usage: node viewer/tests/witness_still_exit_nav.js <port>
/* global Buffer */
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms)); const T0 = Date.now(); const say = s => console.log('+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s);
const PORT = +(process.argv[2] || 8600);
(async () => { const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }), args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
  const p = await b.newPage(); await p.setViewport({ width: 1666, height: 864 }); let errs = 0; const L = [];
  p.on('console', m => { const t = m.text(); L.push(t); if (/§STILL_LOCK|§STILL_EXIT|§STILL_GHOST|§SHELL_GHOST_BBOX|§PHOTO_STAGING|§STILL_REFINE (done|cancelled)|§GI_STILL result|Uncaught|Shader Error/.test(t)) say('[page] ' + t.slice(0, 170)); });
  p.on('pageerror', e => { errs++; say('PAGEERROR ' + e.message); });
  const OCI = 'https://objectstorage.ap-kulai-2.oraclecloud.com/n/ax3cp6tzwuy2/b/bim-ootb/o/buildings/Hospital_extracted.db';
  await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=' + encodeURIComponent(OCI) + '&ghost=1', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.APP && window.APP.guidMap, { timeout: 240000 });
  let n = -1, st = 0; for (let i = 0; i < 200 && st < 3; i++) { await sleep(2000); const s = await p.evaluate(() => ({ n: Object.keys(window.APP.guidMap).length, s: !!window.APP.streaming })); if (!s.s && s.n > 0 && s.n === n) st++; else st = 0; n = s.n; }
  say('loaded ' + n);
  const cam = () => p.evaluate(() => { const c = window.APP.camera.position; return [c.x, c.y, c.z].map(v => +v.toFixed(3)); });
  const drag = async () => { const x = 833, y = 432; await p.mouse.move(x, y); await p.mouse.down(); for (let i = 1; i <= 12; i++) { await p.mouse.move(x + i * 20, y + i * 4); await sleep(30); } await p.mouse.up(); await sleep(1500); };
  const still = async () => { const b1 = L.length; await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
    for (let i = 0; i < 600 && !L.slice(b1).some(t => /§GI_STILL result|§GI_STILL_OFF/.test(t)); i++) await sleep(1000); await sleep(2500); };
  for (const arm of ['esc', 'close']) {
    await still();
    say('ARM ' + arm + ' still up: overlay=' + await p.evaluate(() => !!document.getElementById('gi-still-overlay')) + ' lock=' + await p.evaluate(() => !!window.APP._stillLockOn));
    if (!(await p.evaluate(() => !!document.getElementById('gi-still-overlay')))) { say('ARM ' + arm + ' VERDICT=VACUOUS (no overlay: the bounce never finished)'); await p.keyboard.press('Escape'); await sleep(3000); continue; }
    const b2 = L.length;
    if (arm === 'close') await p.evaluate(() => { const ov = document.getElementById('gi-still-overlay'); const btn = ov && [...ov.querySelectorAll('button')].find(x => /Close/.test(x.textContent)); btn && btn.click(); });
    else await p.keyboard.press('Escape');
    await sleep(3000);
    const st2 = await p.evaluate(() => ({ lock: !!window.APP._stillLockOn, active: !!window.APP._stillRefineActive, staging: !!window.APP._photoStagingOn, overlay: !!document.getElementById('gi-still-overlay') }));
    const c0 = await cam(); await drag(); const c1 = await cam();
    const moved = c0.some((v, i) => Math.abs(v - c1[i]) > 1e-3);
    await sleep(2500);
    const orbit = L.slice(b2).filter(t => /§FPS_MODE/.test(t)).map(t => (t.match(/orbit=\d/) || [''])[0]);
    say('ARM ' + arm + ' after exit: ' + JSON.stringify(st2) + ' camMoved=' + moved + ' ' + JSON.stringify(c0) + '->' + JSON.stringify(c1) + ' fpsModeOrbit=' + JSON.stringify(orbit.slice(-3)) + ' VERDICT=' + (moved && !st2.lock ? 'NAV_OK' : 'STUCK'));
    if (arm === 'close' && st2.lock) { await p.keyboard.press('Escape'); await sleep(3000); }   // release so arm 2 starts clean
  }
  say('pageErrors=' + errs); await b.close(); })().catch(e => { say('FATAL ' + e); process.exit(1); });
