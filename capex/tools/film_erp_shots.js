// capex/tools/film_erp_shots.js — stills of the REAL ERP window (Project, window 130) on a folded order, headless Chromium, software rendering, no GPU (prompts/CAPEX_DASHBOARD.md §5.37, spec B).
// The folded Project Order is seeded into the browser's OWN store (OPFS bim_analysis/bim_project_orders.db), exactly where the Viewer's push would write it; the ERP boot overlay (erp/bim_orders_overlay.js) loads it.
// Usage: NODE_PATH=<bim-ootb>/node_modules node capex/tools/film_erp_shots.js <fold.db> <outDir> [projectId=990001]
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const [foldDb, out, PID = '990001'] = process.argv.slice(2), ROOT = path.join(__dirname, '..', '..'), log = console.log;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/plain' };
fs.mkdirSync(out, { recursive: true });
(async () => {
  const server = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split('?')[0]); fs.readFile(path.join(ROOT, u), (e, b) => { if (e) { r.writeHead(404); return r.end('404'); } r.writeHead(200, { 'Content-Type': MIME[path.extname(u)] || 'application/octet-stream' }); r.end(b); }); });
  await new Promise(r => server.listen(0, r)); const base = 'http://localhost:' + server.address().port;
  const br = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] }), cx = await br.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 }), p = await cx.newPage();
  p.on('console', m => { const t = m.text(); if (/^§(PROJ|ERP|BIM_ORD|BIMORD|OVERLAY|FOLD)/.test(t) || /bim_orders/i.test(t)) log('  [page] ' + t.slice(0, 220)); }); p.on('pageerror', e => log('  [pageerror] ' + String(e).slice(0, 200)));
  await p.goto(base + '/prompts/CAPEX_DASHBOARD.md');   // any same-origin document: OPFS is per origin
  const b64 = fs.readFileSync(foldDb).toString('base64');
  const n = await p.evaluate(async (b64) => { const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('bim_analysis', { create: true });
    const w = await (await d.getFileHandle('bim_project_orders.db', { create: true })).createWritable(); await w.write(bin); await w.close(); return bin.length; }, b64);
  log('§FILM_ERP_SEED bytes=' + n + ' from=' + path.basename(foldDb));
  await p.goto(base + '/erp/idempiere.html?client=garden&window=130&record=' + PID, { waitUntil: 'load' });
  await p.waitForTimeout(25000);
  // the sign-in steps, as the earlier ERP films do (client, user, then OK): the deep link opens the window after login
  const ck = async sel => { await p.waitForSelector(sel, { timeout: 30000 }); await p.click(sel); await p.waitForTimeout(500); };
  await p.waitForSelector('#idmp-login-users .idmp-login-user, #idmp-login-clients .idmp-login-user', { timeout: 90000 });
  if (await p.$("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))")) await ck("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))");
  await ck("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))");
  await p.waitForSelector('#idmp-login-step2', { state: 'visible', timeout: 20000 }); await ck('#idmp-login-ok');
  await p.waitForTimeout(12000);
  const body = await p.evaluate(() => document.body.innerText.slice(0, 600).replace(/\s+/g, ' '));
  log('§FILM_ERP_BODY ' + body.slice(0, 400));
  await p.screenshot({ path: path.join(out, 'e1_window.png') });
  log('§FILM_ERP_TITLEBAR ' + JSON.stringify(await p.evaluate(() => [].slice.call(document.querySelectorAll('.idmp-win-title,.idmp-tab,[class*=tab]')).filter(e => e.offsetParent).slice(0, 14).map(e => e.textContent.trim().slice(0, 30))))); log('§FILM_ERP_SHOT e1_window');
  // the page's OWN store read (as the earlier ERP films: window.__crud.withModelTrx): the planned amount that every other screen must equal
  const tip = q => p.evaluate(x => window.__crud.withModelTrx(f => f(x)), q);
  const pr = (await tip('SELECT c_project_id, value, plannedamt, plannedqty FROM c_project WHERE c_project_id=' + PID))[0], ph = await tip('SELECT name, plannedamt FROM c_projectphase WHERE c_project_id=' + PID + ' ORDER BY seqno');
  log('§FILM_ERP_FACT project=' + JSON.stringify(pr)); log('§FILM_ERP_FACT phases=' + ph.length + ' sum_planned=' + ph.reduce((a, r) => a + Number(r.plannedamt || 0), 0).toFixed(3));
  await p.click('[class*=tab]:text-is("Accounting")'); await p.waitForTimeout(2000); await p.screenshot({ path: path.join(out, 'e2_planned.png') }); log('§FILM_ERP_SHOT e2_planned tab=Accounting');
  for (const [name, tab] of [['e3_phase', 'Phase'], ['e4_bimdocument', 'BIM Document']]) {
    const t = await p.$('.idmp-tabs :text-is("' + tab + '"), [class*=tab]:text-is("' + tab + '")'); if (!t) { log('§FILM_ERP_SHOT ' + name + ' MISSING tab ' + tab); continue; }
    await t.click(); await p.waitForTimeout(2500);
    const rows = await p.evaluate(() => document.querySelectorAll('table tbody tr').length);
    await p.screenshot({ path: path.join(out, name + '.png') }); log('§FILM_ERP_SHOT ' + name + ' tab=' + tab + ' grid_rows=' + rows);
  }
  await br.close(); server.close();
})().catch(e => { log('§FILM_ERP_FAIL ' + (e && e.stack || e)); process.exit(1); });
