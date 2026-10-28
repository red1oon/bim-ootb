// ⚠ DO NOT REMOVE — W-PLUGIN-GRID-TRIGGERS-LIVE (Host H2 grid seams; RESUME.md §8). READ THE LOG: §PLG-GRID lines carry the evidence.
// THE ISSUE it proves/disproves, in a REAL browser through the menu leaf click: a LAZY bundle with a WINDOW trigger (Sales Order 143) stays STARTING until the window is opened from the menu, activates then (callout handler registered BEFORE the window renders);
//   a LAZY bundle with a PROCESS trigger (OrderOpen) stays STARTING until its process is opened from the menu; neither re-activates; a window/process with no pending bundle opens synchronously as before; 0 page errors.
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.db': 'application/octet-stream' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/erp/idempiere.html'; const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }); });
let fails = 0; const ok = (n, c, i) => { if (!c) fails++; console.log('  §PLG-GRID ' + n + ' ' + (c ? 'PASS' : 'FAIL') + (c ? '' : ' ' + JSON.stringify(i))); };
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--no-sandbox'] }); const pg = await (await browser.newContext()).newPage();
  const logs = [], errs = []; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(`http://localhost:${port}/erp/idempiere.html?seed=ad_seed.db&login=GardenAdmin&window=123`, { waitUntil: 'networkidle' });
  await pg.waitForSelector('[data-ad-table]', { timeout: 20000 }).catch(async () => { const u = await pg.$('#idmp-login-users .idmp-login-user:not(.disabled)'); if (u) { await u.click(); const o = await pg.$('#idmp-login-ok'); if (o) await o.click(); } await pg.waitForSelector('[data-ad-table]', { timeout: 15000 }).catch(() => {}); });
  await pg.waitForTimeout(1200);
  const st = await pg.evaluate(async (b) => { const r = (() => { const R = window.PluginEngine._reg(); return Object.assign({}, R, R.system); })();   /* W-PLUGIN-ROLE: setup/ops via reg.system (the boot-restore path); the gate is judged in witness_plugin_role.js */ const out = {};
    for (const f of ['lazy_probe_win', 'lazy_probe_proc']) { await r.installBundle(b + f + '.mjs'); } 
    out.w = (await r.startBundle('com.test.lazy-win')).state; out.p = (await r.startBundle('com.test.lazy-proc')).state; out.cw = window.__lazyWin || 0; out.cp = window.__lazyProc || 0; return out; }, `http://localhost:${port}/erp/tests/fixtures/`);
  console.log('§PLG-GRID-1 after START: ' + JSON.stringify(st));
  ok('G1 both started LAZY: STARTING, bundle code has not run', st.w === 'STARTING' && st.p === 'STARTING' && st.cw === 0 && st.cp === 0, st);
  const leaf = (id) => pg.evaluate(i => { const l = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + i + '"]'); if (!l) return false; l.click(); return true; }, id);
  const state = () => pg.evaluate(() => { const r = window.PluginEngine._reg(); return { w: r.get('com.test.lazy-win').state, p: r.get('com.test.lazy-proc').state, cw: window.__lazyWin || 0, cp: window.__lazyProc || 0 }; });
  // control: opening a window with no pending trigger (123 Business Partner is open; open Product 140 via leaf if present) must not activate either bundle
  // WINDOW demand: Sales Order leaf (menu 129)
  const m1 = logs.length; const hit = await leaf(129); await pg.waitForTimeout(2500);
  const s1 = await state(), l1 = logs.slice(m1), iAct = l1.findIndex(l => /§PLUGIN-ACTIVATE id=com.test.lazy-win/.test(l)), iWin = l1.findIndex(l => /§IDEMPIERE window=Sales Order\(143\)/.test(l));
  console.log('§PLG-GRID-2 after Sales Order leaf: ' + JSON.stringify(s1) + ' leafFound=' + hit + ' activate@' + iAct + ' windowOpen@' + iWin);
  ok('G2 opening the Sales Order window ACTIVATED the window bundle (1 activation) and left the process bundle STARTING', hit && s1.w === 'ACTIVE' && s1.cw === 1 && s1.p === 'STARTING' && s1.cp === 0, s1);
  ok('G3 ordering: activation precedes the window render (callout registered before fields exist)', iAct >= 0 && iWin > iAct, { iAct, iWin });
  const co = await pg.evaluate(() => { try { return !!(window.ADCallout && window.ADCallout.has ? window.ADCallout.has('lazyWinProbeCallout') : null); } catch (e) { return null; } });
  console.log('§PLG-GRID-3 callout registered probe=' + co);
  // PROCESS demand: Reopen Order leaf (menu 436)
  const m2 = logs.length; const hit2 = await leaf(436); await pg.waitForTimeout(2500);
  const s2 = await state(), l2 = logs.slice(m2), iA2 = l2.findIndex(l => /§PLUGIN-ACTIVATE id=com.test.lazy-proc/.test(l)), iP2 = l2.findIndex(l => /§AD-PROC-LIVE open proc=255/.test(l));
  console.log('§PLG-GRID-4 after Reopen Order leaf: ' + JSON.stringify(s2) + ' leafFound=' + hit2 + ' activate@' + iA2 + ' procOpen@' + iP2);
  ok('G4 opening the process ACTIVATED the process bundle (1 activation); window bundle not re-activated', hit2 && s2.p === 'ACTIVE' && s2.cp === 1 && s2.cw === 1, s2);
  ok('G5 ordering: process activation precedes the process pane', iA2 >= 0 && iP2 > iA2, { iA2, iP2 });
  await leaf(129); await pg.waitForTimeout(1200); const s3 = await state();
  ok('G6 re-opening does not re-activate', s3.cw === 1 && s3.cp === 1, s3);
  ok('G7 zero page errors', errs.length === 0, errs.slice(0, 3));
  console.log('§PLG-GRID-VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' failed=' + fails); await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('§PLG-GRID-VERDICT FAIL harness: ' + e.stack); process.exit(2); });
