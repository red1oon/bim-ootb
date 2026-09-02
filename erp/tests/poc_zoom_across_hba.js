// poc_zoom_across_hba.js — W-ZOOM-ACROSS-HBA: §2026-07-04c reverse Zoom Across (ERP→BIM) for the 5 HBA tables
// _zoomScope() gained (erp/idempiere.html) — m_warehouse, c_subscription, s_resource (room+person disambiguation),
// s_resourceunavailable, ad_user. Real user path: navigate to each real window/record (clicking through to a
// child tab where needed), read the SAME target URL the Zoom-Across pill would open (window.__opened), assert
// bld=<building> and find=<guid-or-code> per the §2026-07-04c Gap-1 table. §-log first.
// Run: node erp/tests/poc_zoom_across_hba.js
'use strict';
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.db':'application/octet-stream', '.png':'image/png', '.css':'text/css', '.wasm':'application/wasm', '.mjs':'text/javascript', '.bin':'application/octet-stream' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/erp/idempiere.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { res.writeHead(404); res.end('404 ' + p); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b); });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = []; const W = (ok, m) => log.push((ok ? '🟢' : '🔴') + ' ' + m);

async function launchAndRead(page) {
  await page.evaluate(() => { window.__opened = []; });
  await page.evaluate(() => { const b = document.getElementById('pill-zoomacross'); if (b) b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await sleep(300);
  const opened = await page.evaluate(() => window.__opened.slice());
  return (opened.find(u => /viewer\.html/.test(u)) || '');
}
function parseQS(url) { const q = {}; const idx = url.indexOf('?'); if (idx < 0) return q; url.slice(idx + 1).split('&').forEach(kv => { const [k, v] = kv.split('='); q[k] = v ? decodeURIComponent(v) : ''; }); return q; }

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });
  const cons = []; page.on('console', m => cons.push(m.text())); page.on('pageerror', e => cons.push('PAGEERR ' + e));
  await page.addInitScript(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });

  async function waitGate() {
    let ok = false;
    for (let i = 0; i < 60; i++) { ok = await page.evaluate(() => typeof window.IdmpPillZoomGate === 'function' && window.IdmpPillZoomGate()).catch(() => false); if (ok) break; await sleep(500); }
    return ok;
  }

  // ── 1. m_warehouse — a Building record itself (window 139, HHS record 990000) ──────────────────────────────
  await page.goto(`http://localhost:${port}/erp/idempiere.html?login=GardenAdmin&window=139&record=990000`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  W(await waitGate(), '§m_warehouse gate true (record=990000 HHS)');
  let url = await launchAndRead(page); let q = parseQS(url);
  W(q.bld === 'HHS_Office_Federated', '§m_warehouse bld=HHS_Office_Federated (got ' + q.bld + ')');
  W(q.find === undefined, '§m_warehouse find absent — a Warehouse record is not finer than the whole building');

  // ── 2. c_subscription — a Tenancy lease → its unit (window 316, record 990000 = L-0001, unit RM_Level_1_1) ──
  await page.goto(`http://localhost:${port}/erp/idempiere.html?login=GardenAdmin&window=316&record=990000`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  W(await waitGate(), '§c_subscription gate true (record=990000 lease L-0001)');
  url = await launchAndRead(page); q = parseQS(url);
  W(q.bld === 'HHS_Office_Federated', '§c_subscription bld=HHS_Office_Federated (got ' + q.bld + ')');
  W(q.find === 'RM_Level_1_1', '§c_subscription find=RM_Level_1_1 — re-derived via the M_Product→M_Locator join (got ' + q.find + ')');

  // ── 3. s_resource (person case) — EMP001's own resource row (window 236, record 990109) ──────────────────
  await page.goto(`http://localhost:${port}/erp/idempiere.html?login=GardenAdmin&window=236&record=990109`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  W(await waitGate(), '§s_resource(person) gate true (record=990109 EMP001)');
  url = await launchAndRead(page); q = parseQS(url);
  W(q.bld === 'HHS_Office_Federated', '§s_resource(person) bld=HHS_Office_Federated (got ' + q.bld + ')');
  W(q.find === 'EMP001', '§s_resource(person) find=EMP001 — the employee code, viewer resolves the zone (got ' + q.find + ')');

  // ── 4. s_resourceunavailable — a leave blackout row (window 236 → tab 1 "Unavailability" → record 990000) ──
  await page.goto(`http://localhost:${port}/erp/idempiere.html?login=GardenAdmin&window=236&record=990109`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitGate();
  await page.evaluate(() => { const tabs = document.querySelectorAll('.idmp-adtab'); if (tabs[1]) tabs[1].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await sleep(400);
  const uaTabName = await page.evaluate(() => { const t = document.querySelector('.idmp-adtab.active'); return t ? t.textContent : null; });
  W(uaTabName === 'Unavailability', '§s_resourceunavailable switched to the Unavailability child tab (got ' + uaTabName + ')');
  await page.evaluate(() => { const row = document.querySelector('tr[data-ad-record="990000"] td'); if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await sleep(300);
  W(await waitGate(), '§s_resourceunavailable gate true (record=990000, EMP001 blackout)');
  url = await launchAndRead(page); q = parseQS(url);
  W(q.bld === 'HHS_Office_Federated', '§s_resourceunavailable bld=HHS_Office_Federated (got ' + q.bld + ')');
  W(q.find === 'EMP001', '§s_resourceunavailable find=EMP001 — same S_Resource_ID resolution as the s_resource branch (got ' + q.find + ')');

  // ── 5. ad_user — HONEST GAP: bld resolves via the person's own S_Resource, find stays null (no zone column) ─
  await page.goto(`http://localhost:${port}/erp/idempiere.html?login=GardenAdmin&window=108&record=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  W(await waitGate(), '§ad_user gate true (record=1 EMP001)');
  url = await launchAndRead(page); q = parseQS(url);
  W(q.bld === 'HHS_Office_Federated', '§ad_user bld=HHS_Office_Federated via the person\'s own S_Resource (got ' + q.bld + ')');
  W(q.find === undefined, '§ad_user find absent — HONEST: no zone column exists on AD_User, never fabricated (got ' + q.find + ')');

  // ── negative: an unrelated non-BIM table → gate false, no pill ──────────────────────────────────────────────
  const low = await page.evaluate(() => { const r = window.__idmpDb.exec("SELECT C_Project_ID FROM C_Project WHERE C_Project_ID<990000 LIMIT 1"); return r.length ? r[0].values[0][0] : null; });
  if (low != null) {
    await page.goto(`http://localhost:${port}/erp/idempiere.html?login=GardenAdmin&window=130&record=${low}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    let pure = false;
    for (let i = 0; i < 40; i++) { const g = await page.evaluate(() => typeof window.IdmpPillZoomGate === 'function' ? window.IdmpPillZoomGate() : null).catch(() => null); if (g === false) { pure = true; break; } if (g === true) break; await sleep(1000); }
    W(pure, '§pure non-BIM project (id=' + low + ') → gate false, no red pill (regression, unchanged branch)');
  } else W(true, '§pure (no non-BIM project — skipped)');

  console.log(log.join('\n'));
  const pass = log.filter(l => l.startsWith('🟢')).length;
  console.log('\nW-ZOOM-ACROSS-HBA ' + pass + '/' + log.length);
  fs.writeFileSync(path.join(__dirname, 'poc_zoom_across_hba.log'), log.join('\n') + '\n\n' + cons.filter(t => /§ZOOM|§AD_PARSER getWindow|PAGEERR/.test(t)).slice(0, 30).join('\n'));
  await browser.close(); server.close(); process.exit(pass === log.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
