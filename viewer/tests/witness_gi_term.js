// ⚠ DO NOT REMOVE — witness for §GI_STILL_TERM (bim-compiler PHOTOREAL_STILL_RENDER.md). Read the log after every run.
// Issue: outdoors the bounce added ~nothing and the composite came out darker than the app frame. Is the bounce
// itself weak, or only the dial? Measures, INDOORS with lamps on and a window in view, in LINEAR light (encode
// 'linear', so the parts add up): the app frame (coloronly), what the bounce ADDS (giterm) at gain 1.0 and 1.8,
// and what the occlusion TAKES (aoloss). Real GPU only. Full-load gated (Hospital 63,182, Hospital_meta.db JOIN).
// Pose: Hospital Level 1, window 0YwSvU9P50TPMJjkKz3eMm (the L1 window with the most lamps within 8 m, 14),
// camera 6 m inward toward those lamps' centre, at the window's centre height, looking at the window.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = (k, d) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d;
const PORT = +arg('--port', 8600), WANT = +arg('--want', 63182), ELEV = +arg('--elev', 25), INWARD = +arg('--inward', 6);
const OUT = process.env.OUT || '/tmp/witness_gi_term'; fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, 'log.txt'); const lines = []; const T0 = Date.now();
function say(s) { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(LOG, lines.join('\n')); }
(async () => {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000,
    env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--window-size=1300,860'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  p.on('console', m => { const t = m.text(); if (/§GI_STILL (gain|result)|§GI_STILL_OFF|§STILL_BASE sky|§STILL_DIALS_LAMPS|§STILL_GLOW daylight|§STILL_POSE|PAGEERROR|§LOAD_FAIL/.test(t)) say('[page] ' + t.slice(0, 300)); });
  p.on('pageerror', e => say('PAGEERROR ' + e.message));
  await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=/buildings/Hospital_extracted.db&bounce=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.APP && window.APP.guidMap && window.APP.ifc2three, { timeout: 180000 });
  let n = 0; for (let i = 0; i < 150; i++) { n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n >= WANT) break; await sleep(2000); }
  say('loaded guids=' + n + '/' + WANT + (n >= WANT ? '' : ' VACUOUS — incomplete load, this run proves nothing'));
  if (n < WANT) { await b.close(); return; }
  await p.evaluate((el, inw) => {
    const A = window.APP, wx = 55.25, wy = 73.17, wz = 167.49, fx = 54.3, fy = 74.27;
    const L = Math.hypot(fx - wx, fy - wy), cx = wx + inw * (fx - wx) / L, cy = wy + inw * (fy - wy) / L;
    const cam = A.ifc2three(cx, cy, wz), tgt = A.ifc2three(wx, wy, wz);
    A.camera.position.set(cam.x, cam.y, cam.z); A.controls.target.set(tgt.x, tgt.y, tgt.z); A.controls.update();
    A.updateSky(el, 180); if (A.markDirty) A.markDirty();
  }, ELEV, INWARD);
  await sleep(1500);
  await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
  for (let i = 0; i < 240; i++) { const d = await p.evaluate(() => !!window.__giStillDebug); if (d) break; await sleep(1000); }
  await sleep(1500);
  const shot = async (mode, gain) => {
    const r = await p.evaluate(async (m, g) => { window.APP._stillBounceGain = g; const R = await window.__giStillShoot({ mode: m, encode: 'linear' }); return R && { mode: R.mode, gain: R.gain, ao: R.ao, mean: R.compositeMean, app: R.appMean, err: R.err }; }, mode, gain);
    say('§GI_STILL_TERM ' + JSON.stringify(r)); return r;
  };
  const app = await shot('coloronly', 1.0), g1 = await shot('giterm', 1.0), g18 = await shot('giterm', 1.8), ao = await shot('aoloss', 1.0);
  const pct = (x) => (app && app.mean ? (100 * x / app.mean).toFixed(1) + '%' : '?');
  say('§GI_STILL_TERM VERDICT linear means: app=' + (app && app.mean) + ' bounceAdds@1.0=' + (g1 && g1.mean) + ' (' + pct(g1 && g1.mean) + ') bounceAdds@1.8=' + (g18 && g18.mean) +
    ' (' + pct(g18 && g18.mean) + ') aoTakes@0.55=' + (ao && ao.mean) + ' (' + pct(ao && ao.mean) + ')');
  await b.close();
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
