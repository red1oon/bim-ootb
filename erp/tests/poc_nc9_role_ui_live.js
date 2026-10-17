// ⚠ DO NOT REMOVE — W-NC9-ROLE-UI (bim-compiler prompts/ERP_DEPTH_FILM.md §NC-9): a Role typed in window 111 and Saved in the browser receives its access rows (MRole.afterSave) in ONE signed group.
//   THE ISSUE: does the model hook run through the UI save path (not only the headless model witness) and how long does the ~1,700-op group take? READ the §NC9-UI lines.
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
  const mid = await pg.evaluate(() => window.__idmpDb.exec("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=111 AND IsActive='Y'")[0].values[0][0]);
  const chain = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); const out = []; let n = leaf.parentElement.parentElement;
    while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, mid);
  for (const id of chain) { const open = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id); if (!open) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
  await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid + '"]'); await pg.waitForSelector('#idmp-toolbar [data-tb="new"]'); await pg.waitForTimeout(1200);
  await hc('#idmp-toolbar [data-tb="new"]'); await pg.waitForSelector('#idmp-inline-mount .cfrow'); await pg.waitForTimeout(600);
  await pg.fill(F('name'), 'NC9 UI Role'); await pg.locator(F('name')).first().blur().catch(() => {});
  const ul = await pg.$$eval(F('userlevel', 'select') + ' option', o => o.map(x => ({ v: x.value, t: x.text })));
  console.log('§NC9-UI userlevel options ' + JSON.stringify(ul));
  const lvl = ul.find(x => /Client\+Organization/.test(x.t)); if (lvl) await pg.selectOption(F('userlevel', 'select'), lvl.v);
  const man = pg.locator(F('ismanual')).first(); if (await man.count()) { if (await man.isChecked().catch(() => false)) await man.uncheck(); } console.log('§NC9-UI IsManual default was Manual=Y (dictionary default); unticked for this role so MRole.updateAccessRecords runs');
  await pg.waitForTimeout(400);
  const t0 = Date.now(); const n0 = logs.length;
  await hc('#idmp-toolbar [data-tb="save"]'); await pg.waitForFunction(() => true); await pg.waitForTimeout(4000);
  const dt = Date.now() - t0;
  const role = (await tip("SELECT ad_role_id AS id FROM ad_role WHERE name='NC9 UI Role'"))[0];
  ok('U0', 'role saved through the UI', !!role, role ? 'id ' + role.id : 'not found; log: ' + logs.slice(n0).filter(l => /REJECT|ERR|MODEL/.test(l)).slice(0, 3).join(' | '));
  if (role) {
    const c = async (t) => (await tip('SELECT COUNT(*) AS n FROM ' + t + ' WHERE ad_role_id=' + role.id))[0].n;
    const got = { window: await c('ad_window_access'), process: await c('ad_process_access'), form: await c('ad_form_access'), docaction: await c('ad_document_action_access'), info: await c('ad_infowindow_access') };
    console.log('§NC9-UI access rows ' + JSON.stringify(got) + ' save+commit ' + dt + ' ms');
    ok('U1', 'window/process/form/doc-action/info access rows exist in the tip for the new role', got.window > 250 && got.process > 250 && got.form > 20 && got.docaction > 500, JSON.stringify(got));
    const com = logs.slice(n0).filter(l => /MODEL|KRN_GROUP/.test(l)).slice(0, 8);
    console.log('   page: ' + com.join(' || ').slice(0, 300));
  }
  console.log('§NC9-UI ops ' + JSON.stringify(await pg.evaluate(() => new Promise(res => window.__crud.withSidecar(db => { const r = db.exec("SELECT op_type, substr(parameters,1,160) FROM kernel_ops ORDER BY id DESC LIMIT 4"); res(r.length ? r[0].values : []); })))));
  ok('U2', 'no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log('§NC9-UI VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§NC9-UI CRASH ' + (e && e.stack || e)); process.exit(2); });
