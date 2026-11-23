// ⚠ DO NOT REMOVE — MEASUREMENT, not a witness (no product code changed). READ THE LOG (the full page console is written to it); an exit code is not evidence.
// Question: in the Viewer with the Shed open, a tester taps the storey group "Level 1" in the Find tree and presses › ERP
//   (find_erp_push.js _pushToErp -> ProjFold.foldProjectOrder). What Project Order results, and does its plannedAmt equal the
//   Viewer's total cost (UAT guide B3.1, USD 96,839)?   Drives the real Viewer the way film scenes3.js r0-r2 do (Ctrl+O -> the .db,
//   key F -> Find panel, tap a tree group, tap › ERP twice), headless software GL.
// Run: SHED_DB=<copy of SHED_extracted.db> LOG=<file> NODE_PATH=... node viewer/tests/measure_whole_shed_push.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SHED = process.env.SHED_DB, LOGF = process.env.LOG || '/tmp/measure_whole_shed_push.log';
if (!SHED || !fs.existsSync(SHED)) { console.error('SHED_DB not set / missing'); process.exit(2); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
});
const out = fs.createWriteStream(LOGF); const T0 = Date.now();
const L = m => { const s = '[+' + ((Date.now() - T0) / 1000).toFixed(1) + 's] ' + m; out.write(s + '\n'); console.log(s); };
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--use-gl=swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('console', m => L('[console] ' + m.text())); page.on('pageerror', e => L('[pageerror] ' + e));
  const sleep = ms => page.waitForTimeout(ms);
  const until = async (fn, ms, arg) => { for (let i = 0; i < ms / 250; i++) { const v = await page.evaluate(fn, arg).catch(() => null); if (v) return v; await sleep(250); } return null; };
  const status = () => page.evaluate(() => (window.APP && APP.status ? APP.status.textContent : (document.getElementById('status') || {}).textContent) || '');
  await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?blank=1&ghost=1', { waitUntil: 'load' });
  await page.waitForFunction('window.APP && typeof window.APP.openModelDb === "function"', null, { timeout: 240000 });
  await sleep(2000);
  // ── open the Shed exactly as B2.9: Ctrl+O -> native picker; headless has no FSA picker UI, so drop showOpenFilePicker and the
  //    page's own <input type=file> fallback raises a file chooser we answer with the Shed .db
  await page.evaluate(() => { try { delete window.showOpenFilePicker; } catch (e) {} window.showOpenFilePicker = undefined; });
  await page.mouse.click(900, 640); await sleep(300);
  const t0 = Date.now(); const fc = page.waitForEvent('filechooser', { timeout: 20000 });
  await page.keyboard.press('Control+o'); const chooser = await fc; await chooser.setFiles(SHED);
  let st = ''; for (let i = 0; i < 720 && !/DONE/.test(st); i++) { st = await status(); if (!/DONE/.test(st)) await sleep(500); }
  L('§MEASURE open status="' + st.slice(0, 140) + '" ms=' + (Date.now() - t0));
  const dbCounts = await page.evaluate(() => { const q = s => APP.dbQuery(s); return { n: q('SELECT count(*) FROM elements_meta')[0][0], storey: q('SELECT storey,count(*) FROM elements_meta GROUP BY storey'), disc: q('SELECT discipline,count(*) FROM elements_meta GROUP BY discipline'), priced: q('SELECT count(*) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE t.bbox_x IS NOT NULL AND t.bbox_x>0')[0][0] }; });
  L('§MEASURE db ' + JSON.stringify(dbCounts));

  // ── 1. Find panel (key F), look for a Level 1 node in the storey axis
  await page.mouse.click(900, 640); await sleep(300); await page.keyboard.press('f');
  await until(() => { const p = document.getElementById('find-panel'); return !!(p && p.getBoundingClientRect().width > 0); }, 15000);
  await sleep(1500);
  const tree0 = await page.evaluate(() => { const p = document.getElementById('find-panel'); return { mode: (window.APP && APP.NF && APP.NF._treeMode) || null, text: p.innerText.replace(/\s+/g, ' ').slice(0, 900), pills: [...p.querySelectorAll('button,.find-axis-pill,[data-axis],[data-mode]')].map(e => (e.innerText || e.title || '').trim()).filter(Boolean).slice(0, 40) }; });
  L('§MEASURE find-panel on open ' + JSON.stringify(tree0));
  require('fs').writeFileSync(LOGF + '.panel0.html', await page.evaluate(() => document.getElementById('find-panel').outerHTML));
  await page.screenshot({ path: LOGF + '.0.png' });   // debugging aid for the script only, NOT evidence
  const stage = process.env.STAGE || 'full';
  if (stage === 'explore') { await browser.close(); server.close(); out.end(); return; }

  // ── B3.1 as a tester does it: the Ask chip "total cost" (Find panel) BEFORE any selection
  const askText = () => page.evaluate(() => { const p = document.getElementById('find-panel'); return p.innerText.replace(/\s+/g, ' '); });
  const tc0 = Date.now();
  await page.locator('#find-panel button', { hasText: /^total cost$/ }).first().click();
  const tcAns = await until(() => { const e = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /USD\s*[\d,.]+.*total building cost/.test(e.textContent || '')); return e ? e.textContent.trim() : null; }, 30000);
  L('§MEASURE B3.1 total-cost ms=' + (Date.now() - tc0) + ' answer="' + tcAns + '"');
  const bodyCost = await page.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && /USD\s*[\d,.]+/.test(e.textContent || '')); return els.map(e => (e.id || e.className || e.tagName) + ': ' + e.textContent.trim().slice(0, 160)).slice(0, 8); });
  L('§MEASURE B3.1 USD-bearing leaves ' + JSON.stringify(bodyCost));

  // ── tap the storey group "Level 1" (its label, not the chevron) -> bottom bar
  const row = page.locator('#find-tree .find-tree-row[data-find-parent="Level 1"]').first();
  const box = await row.boundingBox(); L('§MEASURE Level 1 row box ' + JSON.stringify(box));
  const tt0 = Date.now(); await page.mouse.click(box.x + 80, box.y + box.height / 2);
  const bar = await until(() => { const b = document.getElementById('find-erp-btn'), t = (document.getElementById('find-selected') || {}).innerText || ''; return b && b.getBoundingClientRect().width > 0 && /USD\s*[\d,.]+/.test(t) ? t.replace(/\s+/g, ' ').trim() : null; }, 120000);
  L('§MEASURE bar-after-tap ms=' + (Date.now() - tt0) + ' text="' + bar + '"');
  const barParts = await page.evaluate(() => ({ label: (document.getElementById('find-selected-text') || {}).innerText, cost: (document.getElementById('find-selected-cost') || {}).innerText, costTitle: (document.getElementById('find-selected-cost') || {}).title, selSet: (window.APP && APP.NF && APP.NF._lastSelSet) ? APP.NF._lastSelSet.size : null, selLabel: (window.APP && APP.NF) ? APP.NF._lastSelLabel : null }));
  L('§MEASURE bar parts ' + JSON.stringify(barParts));

  // ── › ERP, then again
  const push = async (tag) => { const t = Date.now(); await page.locator('#find-erp-btn').click(); let s = ''; for (let i = 0; i < 1200 && !/Project Order: \d+ lines|failed|Nothing costable|Select something|unavailable/.test(s); i++) { s = await status(); await sleep(150); } L('§MEASURE push ' + tag + ' ms=' + (Date.now() - t) + ' status="' + s.slice(0, 220) + '"'); return s; };
  await push('1');
  const link = await until(() => { const a = document.getElementById('find-erp-open'); return a && getComputedStyle(a).display !== 'none' ? (a.innerText.trim() + ' ' + (a.getAttribute('href') || '')) : null; }, 20000);
  L('§MEASURE open-link ' + JSON.stringify(link));
  await sleep(1500);
  await push('2');
  // ── the pushed Project Order as the Kernel ERP store now holds it
  const sto = await page.evaluate(async () => { try { const r = await navigator.storage.getDirectory(); const names = []; for await (const [n] of r.entries()) names.push(n); return names; } catch (e) { return 'opfs: ' + e.message; } });
  L('§MEASURE opfs entries ' + JSON.stringify(sto));
  // ── why the two differ: per class, the Ask "total cost" basis (getRate x element COUNT) vs the selection/push basis (rate x qty in the rate's unit)
  const brk = await page.evaluate(() => {
    const R = window.RATES || {}, rows = APP.dbQuery("SELECT m.discipline, m.ifc_class, m.storey, COUNT(*) cnt, SUM(MAX(t.bbox_x,t.bbox_y,t.bbox_z)) len, SUM(MAX(t.bbox_x,t.bbox_y,t.bbox_z) * CASE WHEN t.bbox_x>=t.bbox_y AND t.bbox_x>=t.bbox_z THEN MAX(t.bbox_y,t.bbox_z) WHEN t.bbox_y>=t.bbox_x AND t.bbox_y>=t.bbox_z THEN MAX(t.bbox_x,t.bbox_z) ELSE MAX(t.bbox_x,t.bbox_y) END) area, SUM(t.bbox_x*t.bbox_y*t.bbox_z) vol FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE t.bbox_x IS NOT NULL AND t.bbox_x>0 GROUP BY 1,2,3");
    let tAsk = 0, tSel = 0, tSelL1 = 0; const per = rows.map(r => { const rt = R[r[1]], unit = rt ? rt.unit : 'EA', rate = rt ? rt.rate : (typeof getRate === 'function' ? getRate(r[1]) : 0), qty = unit === 'M' ? r[4] : unit === 'M2' ? r[5] : unit === 'M3' ? r[6] : r[3], ask = (typeof getRate === 'function' ? getRate(r[1]) : 0) * r[3], sel = Math.round((rt ? rt.rate : 0) * qty); tAsk += ask; tSel += sel; if (r[2] === 'Level 1') tSelL1 += sel; return [r[0], r[1], r[2], r[3], unit, rate, +qty.toFixed(2), Math.round(ask), sel, !!rt]; });
    return { tAskCount: Math.round(tAsk), tSelAllStoreys: tSel, tSelLevel1: tSelL1, usdPerRM: window._TRL && _TRL.cur_rate, cur: window._TRL && _TRL.cur, pack: window.RATE_TEMPLATE_NAME, rows: per };
  });
  L('§MEASURE breakdown totals ' + JSON.stringify({ tAskCount: brk.tAskCount, tSelAllStoreys: brk.tSelAllStoreys, tSelLevel1: brk.tSelLevel1, cur: brk.cur, pack: brk.pack, cur_rate: brk.usdPerRM }));
  brk.rows.forEach(r => L('§MEASURE row disc=' + r[0] + ' cls=' + r[1] + ' storey=' + r[2] + ' count=' + r[3] + ' unit=' + r[4] + ' rate=' + r[5] + ' qty=' + r[6] + ' askBasis(rate*count)=' + r[7] + ' pushBasis=' + r[8] + ' ratedInPack=' + r[9]));
  // ── the other storey group, bar only (not pushed)
  await page.locator('#find-tree .find-tree-row[data-find-parent="Unknown"]').first().click({ position: { x: 80, y: 10 } }); await sleep(2500);
  L('§MEASURE Unknown-group bar text="' + (await page.evaluate(() => (document.getElementById('find-selected') || {}).innerText.replace(/\s+/g, ' '))) + '"');
  await browser.close(); server.close(); out.end();
})().catch(e => { L('§MEASURE ERROR ' + (e && e.stack || e)); process.exit(2); });
