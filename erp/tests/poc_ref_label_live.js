// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — W-REF-LABEL (bim-compiler prompts/ERP_DEPTH_FILM.md §NC-6): a Table-reference picker (Currency Rate window 116, C_Currency_ID, AD_Ref_Table 112) labels a table WITHOUT a Name column by its first IsIdentifier column (MLookupFactory.getLookup_TableDir: ISO_Code) - was the bare id "100 (100)".
//   THE ISSUE: option labels of C_Currency pickers are ISO codes. READ the §REFLABEL lines.
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': s.size }); fs.createReadStream(f).pipe(r); }); });
let pass = 0, fail = 0; const ok = (id, name, cond, detail) => { console.log((cond ? '  ✅ ' : '  ❌ ') + id + ' ' + name + (detail ? ' — ' + detail : '')); cond ? pass++ : fail++; };
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] }); const pg = await (await browser.newContext({ viewport: { width: 1440, height: 810 } })).newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); const logs = []; pg.on('console', m => logs.push(m.text()));
  await pg.goto('http://localhost:' + srv.address().port + '/erp/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
  await pg.waitForFunction(() => !!window.__idmpDb, null, { timeout: 30000 });
  await pg.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0);
  await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
  await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
  await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0);
  const tip = (sql) => pg.evaluate(s => window.__crud.withModelTrx(q => q(s)), sql);
  const hc = async (sel) => { const l = pg.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click(); await pg.waitForTimeout(350); };
  const F = (c, t) => '#idmp-inline-mount ' + (t || 'input') + '[data-col="' + c + '"]';
  const mid = await pg.evaluate(() => window.__idmpDb.exec("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=116 AND IsActive='Y'")[0].values[0][0]);
  const chain = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); const out = []; let n = leaf.parentElement.parentElement;
    while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, mid);
  for (const id of chain) { const open = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id); if (!open) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
  await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid + '"]'); await pg.waitForSelector('#idmp-toolbar [data-tb="new"]'); await pg.waitForTimeout(1200);
  await hc('#idmp-toolbar [data-tb="new"]'); await pg.waitForSelector('#idmp-inline-mount .cfrow'); await pg.waitForTimeout(600);
  const o = await pg.$$eval(F('c_currency_id', 'select') + ' option', e => e.filter(x => x.value).map(x => x.value + '=' + x.text));
  const usd = o.find(x => x.startsWith('100=')), cad = o.find(x => x.startsWith('116='));
  console.log('§REFLABEL options=' + o.length + ' usd=' + usd + ' cad=' + cad);
  ok('L1', 'C_Currency picker labels 100 -> USD and 116 -> CAD (ISO_Code identifier), not the bare id', /USD/.test(usd || '') && /CAD/.test(cad || ''));
  ok('L2', 'every one of the ' + o.length + ' options carries a non-numeric label', o.every(x => /[A-Za-z]/.test(x.split('=')[1])), o.filter(x => !/[A-Za-z]/.test(x.split('=')[1])).slice(0, 3).join(','));
  ok('L3', 'no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log('§REFLABEL VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§REFLABEL CRASH ' + (e && e.stack || e)); process.exit(2); });
