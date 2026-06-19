// transient — screenshot the TM variance drawer on a real building. The drawer is 2D canvas (renders from ops,
// not WebGL), so it shoots reliably. Captures §TM_VARIANCE + a PNG. Run: node tests/shot_tm_variance.js [bld]
'use strict';
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const os = require('os');
const ROOT = path.join(__dirname, '..');
const BLD = process.argv[2] || 'Hospital';
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.db':'application/octet-stream', '.bin':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm', '.mjs':'text/javascript' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  const cons = [];
  page.on('console', m => cons.push(m.text()));
  page.on('pageerror', e => cons.push('PAGEERR ' + e));
  const URL = `http://localhost:${port}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db&bld=${BLD}`;
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  // wait until the building db + TM toggle are ready
  for (let i = 0; i < 80; i++) {
    const ready = await page.evaluate(() => !!(window.toggleTimeMachine && window.APP && window.APP.db)).catch(() => false);
    if (ready) break; await sleep(1000);
  }
  await page.evaluate(() => window.toggleTimeMachine());
  // wait for the timeline to generate (panel visible + ops)
  let ok = false;
  for (let i = 0; i < 90; i++) {
    ok = await page.evaluate(() => { const p = document.getElementById('time-machine-panel'); return !!(p && p.style.display !== 'none' && window.tmGetState && window.tmGetState().cursor); }).catch(() => false);
    if (ok || cons.some(t => /§GANTT_(MINI|CACHE|SAVE)/.test(t))) { ok = true; break; } await sleep(1000);
  }
  // open the variance drawer
  await page.evaluate(() => { const b = document.getElementById('tm-var'); if (b) b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await sleep(1200);
  const varLog = cons.filter(t => /§TM_VARIANCE/.test(t));
  const SHOT = path.join(os.homedir(), 'Pictures', 'Screenshots', 'tm_variance_' + BLD + '.png');
  try { fs.mkdirSync(path.dirname(SHOT), { recursive: true }); } catch (e) {}
  const panel = await page.$('#time-machine-panel');
  if (panel) await panel.screenshot({ path: SHOT }); else await page.screenshot({ path: SHOT });
  console.log('bld=' + BLD + ' panelReady=' + ok);
  console.log(varLog.join('\n') || '(no §TM_VARIANCE log captured)');
  console.log('§GANTT lines: ' + cons.filter(t => /§GANTT/.test(t)).slice(0, 3).join(' | '));
  console.log('SHOT=' + SHOT);
  await browser.close(); server.close();
  process.exit(varLog.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
