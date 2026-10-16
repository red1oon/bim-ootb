// ⚠ DO NOT REMOVE — WARM PROBE (red1 2026-09-26: "is there no faster way to debug the code rather than long cycles?").
// Scope: ONE headless NVIDIA page per building stays loaded; each check is an HTTP call, so a check pays only staging + refine
// (zones cached) instead of a building load (60-90 s) + the bounce pass's one-time "copy building" (63 s). A code change still
// needs /open with reload=1. Every reply carries the § lines of THAT press only — read them; a reply without the expected §
// lines is INCONCLUSIVE, not a pass. One GPU browser at a time.
// RUN:  node viewer/tests/warm_probe.js [ctlPort=8699]    then e.g.
//   curl 'localhost:8699/open?port=8624&db=Hospital&q=%26ghost%3D1'        (reload=1 to force a fresh page after a code change)
//   curl 'localhost:8699/alts?cam=[13,19,-18]&tgt=[0,0,0]&gi=1&re=§FAULT|§METER'   (gi=0: return at §STILL_REFINE done)
//   curl -X POST localhost:8699/eval --data 'return window.APP._lampData.lamps.length'
//   curl 'localhost:8699/lines?re=§LAMP_EN&last=5'        curl localhost:8699/close
const http = require('http'), puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const CTL = +(process.argv[2] || 8699), sleep = ms => new Promise(r => setTimeout(r, ms));
let browser = null, page = null, url = null, L = [], guard = { shaderError: 0, contextLost: 0, pageError: 0 };
async function ensureBrowser() {
  if (browser) return;
  browser = await puppeteer.launch({ headless: true, protocolTimeout: 900000, env: Object.assign({}, process.env, { __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json' }),
    args: ['--no-sandbox', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--window-size=1705,1054'] });
}
async function open(q) {
  const u = 'http://127.0.0.1:' + (q.port || 8624) + '/viewer/viewer.html?db=' + (q.db && q.db.indexOf('/') >= 0 ? q.db : '/buildings/' + (q.db || 'Hospital') + '_extracted.db') + (q.q || '');
  if (page && url === u && q.reload !== '1') return { reused: true, url: u, elements: await count() };
  await ensureBrowser(); if (page) await page.close();
  page = await browser.newPage(); await page.setViewport({ width: 1685, height: 874 }); L = []; guard = { shaderError: 0, contextLost: 0, pageError: 0 }; url = u;
  page.on('console', m => { const t = m.text(); L.push(t); if (/Shader Error/.test(t)) guard.shaderError++; if (/Context Lost|CONTEXT_LOST/i.test(t)) guard.contextLost++; });
  page.on('pageerror', e => { guard.pageError++; L.push('PAGEERROR ' + e.message); });
  const t0 = Date.now(); await page.goto(u, { waitUntil: 'domcontentloaded' });
  let last = -1, same = 0; for (let i = 0; i < 300 && same < 4; i++) { await sleep(2000); const n = await count(); if (n > 0 && n === last) same++; else same = 0; last = n; }
  return { reused: false, url: u, elements: last, loadSecs: (Date.now() - t0) / 1000 };
}
async function count() { return page.evaluate(() => window.APP && window.APP.guidMap ? Object.keys(window.APP.guidMap).length : 0); }
async function alts(q) {
  if (!page) throw new Error('no page: call /open first');
  const i0 = L.length, t0 = Date.now(), gi = q.gi !== '0';
  await page.keyboard.press('Escape'); await sleep(800);   // leave any still
  if (q.cam && q.tgt) await page.evaluate((c, t) => { const A = window.APP; A.camera.position.fromArray(c); A.controls.target.fromArray(t); A.controls.update(); }, JSON.parse(q.cam), JSON.parse(q.tgt));
  await sleep(300); const j0 = L.length;
  await page.keyboard.down('Alt'); await page.keyboard.press('s'); await page.keyboard.up('Alt');
  const done = gi ? /§GI_STILL result|§GI_STILL_FAIL|§GI_STILL_OFF/ : /§STILL_REFINE done/;
  let ok = false; for (let i = 0; i < 1200; i++) { if (L.slice(j0).some(t => done.test(t))) { ok = true; break; } await sleep(250); }
  const re = new RegExp(q.re || '§FAULT|§METER camera|§GI_STILL result|§STILL_STAGE_MS|§LAMP_EN applied|§IRC_MAX build|PAGEERROR|Shader Error');
  return { verdict: ok ? 'DONE' : 'INCONCLUSIVE (no ' + done + ' within 300 s)', secs: (Date.now() - t0) / 1000, guard, lines: L.slice(j0).filter(t => re.test(t)).map(t => t.slice(0, 600)) , skippedBefore: j0 - i0 };
}
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), q = Object.fromEntries(u.searchParams); let body = '';
  req.on('data', d => body += d); await new Promise(r => req.on('end', r));
  let out;
  try {
    if (u.pathname === '/open') out = await open(q);
    else if (u.pathname === '/alts') out = await alts(q);
    else if (u.pathname === '/eval') out = { result: await page.evaluate(new Function(body)) };
    else if (u.pathname === '/lines') { const re = new RegExp(q.re || '.'); out = { lines: L.filter(t => re.test(t)).slice(-(+q.last || 20)).map(t => t.slice(0, 800)) }; }
    else if (u.pathname === '/close') { if (browser) await browser.close(); browser = page = url = null; out = { closed: true }; }
    else out = { help: 'open alts eval lines close — see the header of warm_probe.js' };
  } catch (e) { out = { error: e.message }; }
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out, null, 1));
}).listen(CTL, '127.0.0.1', () => console.log('warm probe on ' + CTL));
