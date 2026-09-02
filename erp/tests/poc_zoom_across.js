// poc_zoom_across.js — W-ZOOM-ACROSS: the RED "Zoom Across" pill (abstract cross-surface registry,
// zoom_across.js). Deep-links to the Hospital Project Order (GardenAdmin, win 130, record 990000) and proves:
//   §gate   — IdmpPillZoomGate() true (ZoomAcross has an available target); the red pill #pill-zoomacross
//             renders with hover 'Zoom Across' + img redpill.png.
//   §click  — clicking launches the BIM Viewer at the Hospital scene (§ZOOM-ACROSS launch id=viewer).
//   §key    — the ',' keyboard shortcut triggers the same launch.
//   §pure   — on a NON-BIM seed project the gate is false → no pill (iDempiere chrome stays pure).
// §-log first. Run: node tests/poc_zoom_across.js
'use strict';
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm', '.mjs':'text/javascript', '.bin':'application/octet-stream' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/erp/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { res.writeHead(404); res.end('404 ' + p); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = []; const W = (ok, m) => log.push((ok ? '🟢' : '🔴') + ' ' + m);
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  const cons = []; page.on('console', m => cons.push(m.text())); page.on('pageerror', e => cons.push('PAGEERR ' + e));
  await page.addInitScript(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });

  await page.goto(`http://localhost:${port}/erp/idempiere.html?login=GardenAdmin&window=130&record=990000`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  let landed = false;
  for (let i = 0; i < 60; i++) { landed = await page.evaluate(() => typeof window.IdmpPillZoomGate === 'function' && window.IdmpPillZoomGate()).catch(() => false); if (landed) break; await sleep(1000); }
  W(landed, '§gate IdmpPillZoomGate() true on Hospital (ZoomAcross target available)');
  const targets = await page.evaluate(() => window.ZoomAcross ? window.ZoomAcross.destinations().map(d => d.id) : []);
  W(targets.indexOf('viewer') >= 0, "registry has the 'viewer' destination (" + JSON.stringify(targets) + ')');

  await page.evaluate(() => { const t = document.getElementById('idmp-pill-trigger'); if (t) t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await sleep(700);
  const pill = await page.evaluate(() => { const b = document.getElementById('pill-zoomacross'); if (!b) return null; const img = b.querySelector('img'); return { title: b.title, img: img && img.getAttribute('src') }; });
  W(!!pill, 'red pill #pill-zoomacross present in the rail');
  W(pill && pill.title === 'Zoom Across', "hover = 'Zoom Across' (got " + (pill && JSON.stringify(pill.title)) + ')');
  W(pill && /redpill\.png/.test(pill.img || ''), 'pill uses redpill.png');

  // click → launches the Hospital viewer
  await page.evaluate(() => { const b = document.getElementById('pill-zoomacross'); if (b) b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await sleep(300);
  let url = (await page.evaluate(() => window.__opened.slice())).find(u => /viewer\.html/.test(u)) || '';
  W(/\.\.\/viewer\/viewer\.html\?db=\.\.\/buildings\/Hospital_extracted\.db&bld=Hospital/.test(url), 'click → opened Hospital viewer (' + url + ')');

  // ',' shortcut → launches too
  await page.evaluate(() => { window.__opened = []; document.dispatchEvent(new KeyboardEvent('keydown', { key: ',', bubbles: true })); });
  await sleep(300);
  let kurl = (await page.evaluate(() => window.__opened.slice())).find(u => /viewer\.html/.test(u)) || '';
  W(/Hospital_extracted\.db/.test(kurl), "',' shortcut → opened Hospital viewer (" + kurl + ')');

  const SHOT = path.join(os.homedir(), 'Pictures', 'Screenshots', 'zoom_across.png');
  try { fs.mkdirSync(path.dirname(SHOT), { recursive: true }); } catch (e) {}
  const bar = await page.$('#idmp-pillbar'); if (bar) await bar.screenshot({ path: SHOT });

  // negative: non-BIM project → gate false
  const low = await page.evaluate(() => { const r = window.__idmpDb.exec("SELECT C_Project_ID FROM C_Project WHERE C_Project_ID<990000 LIMIT 1"); return r.length ? r[0].values[0][0] : null; });
  if (low != null) {
    await page.goto(`http://localhost:${port}/erp/idempiere.html?login=GardenAdmin&window=130&record=${low}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    let pure = false;
    for (let i = 0; i < 40; i++) { const g = await page.evaluate(() => typeof window.IdmpPillZoomGate === 'function' ? window.IdmpPillZoomGate() : null).catch(() => null); if (g === false) { pure = true; break; } if (g === true) break; await sleep(1000); }
    W(pure, '§pure non-BIM project (id=' + low + ') → gate false, no red pill');
  } else W(true, '§pure (no non-BIM project — skipped)');

  console.log(log.join('\n'));
  const pass = log.filter(l => l.startsWith('🟢')).length;
  console.log('\nW-ZOOM-ACROSS ' + pass + '/' + log.length + '  shot=' + SHOT);
  fs.writeFileSync(path.join(__dirname, 'poc_zoom_across.log'), log.join('\n') + '\n\n' + cons.filter(t => /§ZOOM|§IDMP|PAGEERR/.test(t)).slice(0, 20).join('\n'));
  await browser.close(); server.close(); process.exit(pass === log.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
