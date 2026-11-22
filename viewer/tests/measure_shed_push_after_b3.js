// ⚠ DO NOT REMOVE — MEASUREMENT, not a witness (no product code changed). READ THE LOG (the full page console is written to it); an exit code is not evidence.
// Question (bim-compiler prompts/SQLiteIDEMPIERE.md §INTERNAL-UAT, change set item (g)): the UAT guide's B3.1 opens Time Machine (key T) before B4.
//   If that leaves a 4D schedule in the building db, the Find bar and the › ERP push split the selection per 4D task (find_erp_push.js _pushBasis ->
//   ProjFold.pricedPerTask). Does the whole-Shed push total (F, tap "Level 1", › ERP) still equal B3.1's Ask total cost AFTER Time Machine has run?
//   Readings, in the tester's order: R1 Ask "total cost" before T · R2 Time Machine opened (tasks in the db, §PROJ_FOLD_SCHEDULE) · R3 Ask again after T ·
//   R4 the Level 1 bar · R5 the push's plannedAmt (§PROJ_PUSH). Headless software GL; the same open path as measure_whole_shed_push.js.
// Run: SHED_DB=<copy of SHED_extracted.db> LOG=<file> node viewer/tests/measure_shed_push_after_b3.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const SHED = process.env.SHED_DB, LOGF = process.env.LOG || '/tmp/measure_shed_push_after_b3.log';
if (!SHED || !fs.existsSync(SHED)) { console.error('SHED_DB not set / missing'); process.exit(2); }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404'); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
});
const out = fs.createWriteStream(LOGF); const T0 = Date.now();
const L = m => { const s = '[+' + ((Date.now() - T0) / 1000).toFixed(1) + 's] ' + m; out.write(s + '\n'); if (/§MEASURE|§PROJ_PUSH |§PROJ_FOLD_SCHEDULE|§FIND_COST|§ASK_COST/.test(m)) console.log(s); };
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu', '--use-gl=swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  // RATE_EDIT=<pack>:<class>:<rate> stands in for B3.2's Settings edit (the editor saves the copy under json_rates_<pack>; rates.js merges it over the shipped pack)
  if (process.env.RATE_EDIT) { const [pk, cls, rt] = process.env.RATE_EDIT.split(':'); await page.addInitScript(([pk, cls, rt]) => { try { localStorage.setItem('json_rates_' + pk, JSON.stringify({ materials: { [cls]: { rate: +rt } } })); } catch (e) {} }, [pk, cls, rt]); L('§MEASURE RATE_EDIT ' + process.env.RATE_EDIT); }
  page.on('console', m => L('[console] ' + m.text())); page.on('pageerror', e => L('[pageerror] ' + e));
  const sleep = ms => page.waitForTimeout(ms);
  const until = async (fn, ms, arg) => { for (let i = 0; i < ms / 250; i++) { const v = await page.evaluate(fn, arg).catch(() => null); if (v) return v; await sleep(250); } return null; };
  const status = () => page.evaluate(() => (window.APP && APP.status ? APP.status.textContent : (document.getElementById('status') || {}).textContent) || '');
  await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?blank=1&ghost=1', { waitUntil: 'load' });
  await page.waitForFunction('window.APP && typeof window.APP.openModelDb === "function"', null, { timeout: 240000 });
  await sleep(2000);
  await page.evaluate(() => { try { delete window.showOpenFilePicker; } catch (e) {} window.showOpenFilePicker = undefined; });
  await page.mouse.click(900, 640); await sleep(300);
  const fc = page.waitForEvent('filechooser', { timeout: 20000 });
  await page.keyboard.press('Control+o'); const chooser = await fc; await chooser.setFiles(SHED);
  let st = ''; for (let i = 0; i < 720 && !/DONE/.test(st); i++) { st = await status(); if (!/DONE/.test(st)) await sleep(500); }
  L('§MEASURE open status="' + st.slice(0, 140) + '"');
  const tasksIn = () => page.evaluate(() => { try { return { schedules: APP.dbQuery('SELECT count(*) FROM schedules')[0][0], tasks: APP.dbQuery('SELECT count(*) FROM tasks')[0][0], taskEls: APP.dbQuery('SELECT count(*) FROM task_elements')[0][0] }; } catch (e) { return { err: e.message }; } });
  L('§MEASURE R0 db before T ' + JSON.stringify(await tasksIn()));

  const openFind = async () => { await page.mouse.click(900, 640); await sleep(300); await page.keyboard.press('f');
    await until(() => { const p = document.getElementById('find-panel'); return !!(p && p.getBoundingClientRect().width > 0); }, 15000); await sleep(1500); };
  const askTotal = async (tag) => {
    await page.evaluate(() => { document.querySelectorAll('*').forEach(e => { if (e.children.length === 0 && /total building cost/.test(e.textContent || '')) e.setAttribute('data-old-ans', '1'); }); });
    await page.locator('#find-panel button', { hasText: /^total cost$/ }).first().click();
    const a = await until(() => { const e = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && !e.hasAttribute('data-old-ans') && /[A-Z]{3}\s*[\d,.]+.*total building cost/.test(e.textContent || '')); return e ? e.textContent.trim() : null; }, 30000);
    L('§MEASURE ' + tag + ' Ask total cost answer="' + a + '"'); return a; };

  await openFind(); const r1 = await askTotal('R1 (before T)');
  if (process.env.STAGE === 'r1') { L('§MEASURE SUMMARY r1="' + r1 + '"'); await browser.close(); server.close(); out.end(); return; }
  await page.keyboard.press('Escape'); await sleep(500);
  // ── R2 Time Machine, key T, as B3.1 says; wait for its schedule to reach the db (or 180 s)
  await page.mouse.click(900, 640); await sleep(300); await page.keyboard.press('t');
  let tc = null; for (let i = 0; i < 360; i++) { tc = await tasksIn(); if (tc && tc.tasks > 0) break; await sleep(500); }
  await sleep(3000); tc = await tasksIn();
  const tmText = await page.evaluate(() => { const p = document.getElementById('time-machine') || document.querySelector('[id*="tm-"],[class*="time-machine"]'); return p ? p.innerText.replace(/\s+/g, ' ').slice(0, 300) : null; });
  L('§MEASURE R2 after T db ' + JSON.stringify(tc) + ' panel="' + tmText + '"');
  await page.keyboard.press('t'); await sleep(1000);
  await openFind(); const r3 = await askTotal('R3 (after T)');
  // ── R4 tap Level 1 -> bar; R5 › ERP
  const row = page.locator('#find-tree .find-tree-row[data-find-parent="Level 1"]').first();
  const box = await row.boundingBox(); await page.mouse.click(box.x + 80, box.y + box.height / 2);
  const bar = await until(() => { const b = document.getElementById('find-erp-btn'), t = (document.getElementById('find-selected') || {}).innerText || ''; return b && b.getBoundingClientRect().width > 0 && /[A-Z]{3}\s*[\d,.]+/.test(t) ? t.replace(/\s+/g, ' ').trim() : null; }, 120000);
  const costTitle = await page.evaluate(() => (document.getElementById('find-selected-cost') || {}).title);
  L('§MEASURE R4 Level 1 bar text="' + bar + '" title="' + costTitle + '"');
  await page.locator('#find-erp-btn').click(); let s = '';
  for (let i = 0; i < 1200 && !/Project Order: \d+ lines|failed|Nothing costable|Select something|unavailable/.test(s); i++) { s = await status(); await sleep(150); }
  L('§MEASURE R5 push status="' + s.slice(0, 220) + '"');
  L('§MEASURE SUMMARY r1="' + r1 + '" r3="' + r3 + '" bar="' + bar + '" push="' + s.slice(0, 120) + '"');
  await browser.close(); server.close(); out.end();
})().catch(e => { L('§MEASURE ERROR ' + (e && e.stack || e)); process.exit(2); });
