// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness W-GRID-CUSTOM-LIVE (bim-compiler prompts/ERP_DEPTH_FILM.md §GRID-CUSTOM). READ tests/poc_grid_custom_live.log
//   before any conclusion — exit code is not evidence.
// THE ISSUE: can a user customize a tab's grid like legacy's Customize dialog (CustomizeGridViewPanel + AD_Tab_Customization) - remove columns,
//   move one first, OK -> the grid shows exactly the Selected list in that order; the choice survives a reload (signed op-log); "Auto Hide
//   Empty Column" hides a column empty in every row; emptying Selected deletes the row and the grid is back to the dictionary columns?
//   Business Partner (window 123). RED on origin/main (no Customize button).
// Run: node tests/poc_grid_custom_live.js 2>&1 | tee tests/poc_grid_custom_live.log        (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.sql': 'text/plain' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': s.size }); fs.createReadStream(f).pipe(r); }); });
let pass = 0, fail = 0;
const ok = (id, name, cond, detail) => { console.log((cond ? '  ✅ ' : '  ❌ ') + id + ' ' + name + (detail ? ' — ' + detail : '')); cond ? pass++ : fail++; };
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const logs = [], errs = []; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => errs.push(e.message));
  const hc = async (sel) => { const l = pg.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click(); await pg.waitForTimeout(350); };
  const seed = (sql) => pg.evaluate(s => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; }, sql);
  const url = 'http://localhost:' + srv.address().port + '/erp/idempiere.html?lang=en_US';
  const login = async () => {
    await pg.waitForFunction(() => !!window.__idmpDb, null, { timeout: 30000 });
    await pg.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0);
    await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
    await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
    await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0);
  };
  const openWin = async (wid) => {
    const mid = (await seed("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=" + wid + " AND IsActive='Y'"))[0][0];
    const chain = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); const out = []; let n = leaf.parentElement.parentElement;
      while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, mid);
    for (const id of chain) { const open = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id);
      if (!open) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
    await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid + '"]'); await pg.waitForTimeout(1200);
    await require('./legacy_open.js').showAllRows(pg, { history: false });   // Business Partner is high volume: Find first -> OK
  };
  const head = () => pg.evaluate(() => [...document.querySelectorAll('#idmp-content .idmp-grid thead th[data-ad-col]')].filter(th => th.style.display !== 'none').map(th => th.getAttribute('data-ad-col')));
  const toGrid = async () => { if (await pg.locator('#idmp-inline-mount [data-col]').count()) { await hc('#idmp-toolbar [data-tb="toggle"]'); await pg.waitForTimeout(700); } };
  const dlg = async () => { await hc('#idmp-toolbar [data-tb="customize"]'); await pg.waitForSelector('#idmp-gcust-ov'); return pg.evaluate(() => ({ yes: [...document.querySelectorAll('#idmp-gcust-yes option')].map(o => o.textContent), no: [...document.querySelectorAll('#idmp-gcust-no option')].length })); };
  const pick = (selId, idxs) => pg.evaluate(([s, ix]) => { const o = [...document.querySelectorAll('#' + s + ' option')]; o.forEach((x, i) => { x.selected = ix.indexOf(i) >= 0; }); }, [selId, idxs]);
  const okDlg = async () => { const n = logs.length; await hc('#idmp-gcust-ov [data-gcust="ok"]'); for (let i = 0; i < 40 && !logs.slice(n).some(l => /§GRID-CUSTOM save/.test(l)); i++) await pg.waitForTimeout(150); await pg.waitForTimeout(900); return logs.slice(n).filter(l => /§GRID-CUSTOM save/.test(l)).pop() || ''; };
  await pg.goto(url, { waitUntil: 'networkidle' }); await login(); await openWin(123); await toGrid();
  const h0 = await head(); console.log('  dictionary columns=' + JSON.stringify(h0));
  const d0 = await dlg(); console.log('  dialog selected=' + d0.yes.length + ' available=' + d0.no);
  ok('G1', 'the Customize dialog opens with Selected = the grid\'s current columns', d0.yes.length === h0.length && d0.yes.length > 3, JSON.stringify(d0));
  await pick('idmp-gcust-yes', [0, 1]); await hc('#idmp-gcust-ov [data-gcust="remove"]');   // remove the first two columns
  const last = d0.yes.length - 3; await pick('idmp-gcust-yes', [last]);                    // move the (now) last one to the top
  for (let i = 0; i < last; i++) await hc('#idmp-gcust-ov [data-gcust="up"]');
  const sel = await pg.evaluate(() => [...document.querySelectorAll('#idmp-gcust-yes option')].map(o => o.textContent));
  const s1 = await okDlg(); const h1 = await head();
  const want = [h0[h0.length - 1]].concat(h0.slice(2, h0.length - 1));
  console.log('  saved: ' + s1 + '\n  grid now=' + JSON.stringify(h1));
  ok('G2', 'OK -> the grid shows exactly the Selected list: first two removed, the last column first (one signed op)', /committed=true/.test(s1) && JSON.stringify(h1) === JSON.stringify(want) && sel.length === want.length, JSON.stringify({ want: want, got: h1 }));
  await pg.reload({ waitUntil: 'networkidle' }); await login(); await openWin(123); await toGrid();
  const h2 = await head();
  ok('G3', 'after a reload the customization is still applied (signed op-log)', JSON.stringify(h2) === JSON.stringify(want), JSON.stringify(h2));
  // auto-hide: which visible columns are empty in every row?
  const empties = await pg.evaluate(() => { const t = document.querySelector('#idmp-content .idmp-grid'); return [...t.querySelectorAll('thead th[data-ad-col]')].map(th => th.getAttribute('data-ad-col')).filter(c => { const cells = [...t.querySelectorAll('tbody td[data-ad-col="' + c + '"]')]; return cells.length && cells.every(td => td.textContent.trim() === ''); }); });
  await dlg(); await pg.evaluate(() => { const c = document.getElementById('idmp-gcust-hide'); c.checked = true; }); const s2 = await okDlg(); const h3 = await head();
  console.log('  empty columns=' + JSON.stringify(empties) + ' after auto-hide=' + JSON.stringify(h3) + ' ' + s2);
  ok('G4', 'Auto Hide Empty Column hides exactly the columns empty in every row', empties.length > 0 ? JSON.stringify(h3) === JSON.stringify(want.filter(c => empties.indexOf(c) < 0)) && /autoHide=Y/.test(s2) : false, empties.length ? '' : 'INCONCLUSIVE: no all-empty column in this grid');
  // empty Selected -> row deleted -> dictionary columns
  await dlg(); await pg.evaluate(() => { const y = document.getElementById('idmp-gcust-yes'), n = document.getElementById('idmp-gcust-no'); [...y.options].forEach(o => n.appendChild(o)); });
  const s3 = await okDlg(); const h4 = await head();
  ok('G5', 'an empty Selected list deletes the customization: the grid is back to the dictionary columns', /\bdelete\b/.test(s3) && /committed=true/.test(s3) && JSON.stringify(h4) === JSON.stringify(h0), s3 + ' ' + JSON.stringify(h4));
  const real = errs.filter(e => !/ResizeObserver/.test(e));
  ok('G6', 'no page errors', real.length === 0, real.slice(0, 3).join(' | '));
  console.log('§GRIDCU-VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§GRIDCU-VERDICT INCONCLUSIVE ' + (e.stack || e)); process.exit(2); });
