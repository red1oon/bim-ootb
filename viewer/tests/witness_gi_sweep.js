// ⚠ DO NOT REMOVE — witness for §GI_BOUNCE_STRENGTH (sweep; built on witness_gi_term.js) (bim-compiler PHOTOREAL_STILL_RENDER.md). Read the log after every run.
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
const POSE = arg('--pose', 'interior'); const LOG = path.join(OUT, 'log_' + POSE + '.txt'); const lines = []; const T0 = Date.now();
function say(s) { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(LOG, lines.join('\n')); }
(async () => {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000,
    env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--window-size=1300,860'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  p.on('console', m => { const t = m.text(); if (/§GI_STILL gain|§GI_STILL_OFF|§STILL_BASE sky|§STILL_DIALS_LAMPS|§STILL_GLOW daylight|§STILL_POSE|PAGEERROR|§LOAD_FAIL/.test(t)) say('[page] ' + t.slice(0, 300)); });
  p.on('pageerror', e => say('PAGEERROR ' + e.message));
  await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=/buildings/Hospital_extracted.db&bounce=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.APP && window.APP.guidMap && window.APP.ifc2three, { timeout: 180000 });
  let n = 0; for (let i = 0; i < 150; i++) { n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n >= WANT) break; await sleep(2000); }
  say('loaded guids=' + n + '/' + WANT + (n >= WANT ? '' : ' VACUOUS — incomplete load, this run proves nothing'));
  if (n < WANT) { await b.close(); return; }
  await p.evaluate((el, inw, pose) => {
    const A = window.APP;
    if (pose === 'courtyard') { A.camera.position.set(-62, 38, -4); A.controls.target.set(-16, -2, -4); }   // pose_p1 (red1's courtyard still)
    else { const wx = 55.25, wy = 73.17, wz = 167.49, fx = 54.3, fy = 74.27;
      const L = Math.hypot(fx - wx, fy - wy), cx = wx + inw * (fx - wx) / L, cy = wy + inw * (fy - wy) / L;
      const cam = A.ifc2three(cx, cy, wz), tgt = A.ifc2three(wx, wy, wz);
      A.camera.position.set(cam.x, cam.y, cam.z); A.controls.target.set(tgt.x, tgt.y, tgt.z); }
    A.controls.update(); A.updateSky(el, 180); if (A.markDirty) A.markDirty();
  }, ELEV, INWARD, POSE);
  await sleep(1500);
  await p.keyboard.down('Alt'); await p.keyboard.press('s'); await p.keyboard.up('Alt');
  for (let i = 0; i < 240; i++) { const d = await p.evaluate(() => !!window.__giStillDebug); if (d) break; await sleep(1000); }
  await sleep(1500);
  const ARMS = [['base', {}], ['rad24', { _stillGiRadius: 24 }], ['rad48', { _stillGiRadius: 48 }], ['steps32', { _stillGiSteps: 32 }],
    ['thick4', { _stillGiThick: 4 }], ['recv1', { _stillGiRecv: 1 }], ['recv1+rad24', { _stillGiRecv: 1, _stillGiRadius: 24 }]];
  const KEYS = ['_stillGiRadius', '_stillGiSteps', '_stillGiThick', '_stillGiRecv', '_stillBounceGain'];
  const shot = async (mode, set) => p.evaluate(async (m, st, keys) => { const A = window.APP; keys.forEach(k => delete A[k]); Object.assign(A, st);
    const R = await window.__giStillShoot({ mode: m, encode: 'linear' }); return R && { mean: R.compositeMean, err: R.err }; }, mode, set, KEYS);
  const app = await shot('coloronly', {});
  say('§GI_BOUNCE_STRENGTH pose=' + POSE + ' app(linear)=' + (app && app.mean));
  for (const [name, set] of ARMS) {
    const g = await shot('giterm', set), a = await shot('aoloss', set);
    const pc = x => (app && app.mean ? (100 * x / app.mean).toFixed(1) + '%' : '?');
    say('§GI_BOUNCE_STRENGTH pose=' + POSE + ' arm=' + name + ' ' + JSON.stringify(set) + ' bounceAdds=' + (g && g.mean) + ' (' + pc(g && g.mean) + ') aoTakes=' + (a && a.mean) + ' (' + pc(a && a.mean) + ')');
  }
  await b.close();
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
