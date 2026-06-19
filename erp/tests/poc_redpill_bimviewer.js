// poc_redpill_bimviewer.js — W-REDPILL-BIMVIEWER: the revived RED PILL "Link to BIM Viewer" on the iDempiere
// surface. Deep-links to the Hospital Project Order (GardenAdmin, win 130, record 990000) and proves:
//   §gate  — IdmpPillBimGate() true on the BIM-band Hospital project; the red pill (#pill-bimviewer) renders
//            with hover 'Link to BIM Viewer' and img redpill.png.
//   §click — clicking it opens ../viewer/viewer.html?db=../buildings/Hospital_extracted.db&bld=Hospital (§BIMVIEWER-PILL).
//   §pure  — on a NON-BIM seed project the gate is false → no red pill (surface stays pure iDempiere).
// §-log first (read the .log). Run: node tests/poc_redpill_bimviewer.js
'use strict';
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..', '..');   // serve the bim-ootb root (so ../viewer, ../buildings resolve)
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
  // intercept window.open so the click is observable without spawning a tab
  await page.addInitScript(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });

  await page.goto(`http://localhost:${port}/erp/idempiere.html?login=GardenAdmin&window=130&record=990000`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // wait until the Hospital project record is the focused form record
  let landed = false;
  for (let i = 0; i < 60; i++) {
    landed = await page.evaluate(() => typeof window.IdmpPillBimGate === 'function' && window.IdmpPillBimGate()).catch(() => false);
    if (landed) break; await sleep(1000);
  }
  W(landed, '§gate IdmpPillBimGate() true on Hospital (BIM band 990000)');

  // open the ⋯ pill rail
  await page.evaluate(() => { const t = document.getElementById('idmp-pill-trigger'); if (t) t.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await sleep(800);
  const pill = await page.evaluate(() => {
    const b = document.getElementById('pill-bimviewer'); if (!b) return null;
    const img = b.querySelector('img');
    return { present: true, title: b.title, img: img ? img.getAttribute('src') : null };
  });
  W(pill && pill.present, 'red pill #pill-bimviewer present in the rail');
  W(pill && pill.title === 'Link to BIM Viewer', "hover = 'Link to BIM Viewer' (got " + (pill && JSON.stringify(pill.title)) + ')');
  W(pill && /redpill\.png/.test(pill.img || ''), 'pill uses redpill.png (got ' + (pill && pill.img) + ')');

  // click → opens the viewer at the Hospital scene
  await page.evaluate(() => { const b = document.getElementById('pill-bimviewer'); if (b) b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await sleep(400);
  const opened = await page.evaluate(() => window.__opened.slice());
  const url = opened.find(u => /viewer\.html/.test(u)) || '';
  W(/\.\.\/viewer\/viewer\.html\?db=\.\.\/buildings\/Hospital_extracted\.db&bld=Hospital/.test(url), 'click opened the Hospital viewer URL (' + url + ')');

  // screenshot the pill rail
  const SHOT = path.join(os.homedir(), 'Pictures', 'Screenshots', 'redpill_bimviewer.png');
  try { fs.mkdirSync(path.dirname(SHOT), { recursive: true }); } catch (e) {}
  const bar = await page.$('#idmp-pillbar'); if (bar) await bar.screenshot({ path: SHOT }); else await page.screenshot({ path: SHOT });

  // negative: a non-BIM seed project → gate false (surface pure). Navigate to a low-PK project.
  const lowProj = await page.evaluate(() => { const db = window.__idmpDb; const r = db.exec("SELECT C_Project_ID FROM C_Project WHERE C_Project_ID<990000 LIMIT 1"); return r.length ? r[0].values[0][0] : null; });
  if (lowProj != null) {
    await page.goto(`http://localhost:${port}/erp/idempiere.html?login=GardenAdmin&window=130&record=${lowProj}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    let pure = false;
    for (let i = 0; i < 40; i++) { const g = await page.evaluate(() => typeof window.IdmpPillBimGate === 'function' ? window.IdmpPillBimGate() : null).catch(() => null); if (g === false) { pure = true; break; } if (g === true) break; await sleep(1000); }
    W(pure, '§pure non-BIM project (id=' + lowProj + ') → gate false, no red pill');
  } else W(true, '§pure (no non-BIM project to test — skipped)');

  console.log(log.join('\n'));
  const pass = log.filter(l => l.startsWith('🟢')).length;
  console.log('\nW-REDPILL-BIMVIEWER ' + pass + '/' + log.length + '  shot=' + SHOT);
  fs.writeFileSync(path.join(__dirname, 'poc_redpill_bimviewer.log'), log.join('\n') + '\n\n' + cons.filter(t => /§BIMVIEWER|§IDMP|PAGEERR/.test(t)).slice(0, 20).join('\n'));
  await browser.close(); server.close(); process.exit(pass === log.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
