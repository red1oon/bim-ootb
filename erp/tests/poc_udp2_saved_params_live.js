// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness W-UDP2-LIVE (bim-compiler prompts/ERP_DEPTH_FILM.md §UDP-2). READ tests/poc_udp2_saved_params_live.log
//   before any conclusion — exit code is not evidence.
// THE ISSUE: does the twin's generic process dialog do what the ZK AbstractProcessDialog does with AD_PInstance -
//   Save a parameter set under a name, keep it across a page reload, list it (MPInstance.get), restore its values when chosen,
//   record each Run as a "Last Run" entry, and Delete a saved one? On origin/main there is no Saved Parameter control at all (RED).
//   Process = AD_Process 226 "Project Detail Accounting Report" (menu 403): a TableDir (C_AcctSchema_ID) + a Search (C_Project_ID) para.
// Run: node tests/poc_udp2_saved_params_live.js 2>&1 | tee tests/poc_udp2_saved_params_live.log        (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), MENU = 403, PROC = 226, NAME = 'W-UDP2 saved';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.sql': 'text/plain' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': s.size }); fs.createReadStream(f).pipe(r); }); });
let pass = 0, fail = 0;
const ok = (id, name, cond, detail) => { console.log((cond ? '  ✅ ' : '  ❌ ') + id + ' ' + name + (detail ? ' — ' + detail : '')); cond ? pass++ : fail++; };
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 } }), pg = await ctx.newPage();
  const logs = [], errs = []; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => errs.push(e.message));
  const url = 'http://localhost:' + srv.address().port + '/erp/idempiere.html?lang=en_US';
  const hc = async (sel) => { const l = pg.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click(); await pg.waitForTimeout(350); };
  const login = async () => {
    await pg.waitForFunction(() => !!window.__idmpDb, null, { timeout: 30000 });
    await pg.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0);
    await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
    await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
    await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0);
  };
  const openProc = async () => {
    const chain = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); if (!leaf) return null; const out = []; let n = leaf.parentElement.parentElement;
      while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, MENU);
    if (!chain) return false;
    for (const id of chain) { const open = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id);
      if (!open) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
    await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + MENU + '"]');
    await pg.waitForSelector('[data-proc-param="C_AcctSchema_ID"]', { timeout: 15000 }); await pg.waitForTimeout(900);
    return true;
  };
  const waitLog = async (re, from) => { for (let i = 0; i < 60; i++) { const l = logs.slice(from).find(x => re.test(x)); if (l) return l; await pg.waitForTimeout(250); } return null; };
  const listed = () => pg.$$eval('datalist[id^="idmp-savedparam-"] option', o => o.map(x => x.value)).catch(() => []);
  const vals = () => pg.evaluate(() => { const o = {}; document.querySelectorAll('[data-proc-param]').forEach(e => { o[e.getAttribute('data-proc-param')] = e.value; }); return o; });
  const choose = async (nm) => { await pg.fill('[data-proc-saved]', nm); await pg.dispatchEvent('[data-proc-saved]', 'input'); await pg.waitForTimeout(400); };

  await pg.goto(url, { waitUntil: 'networkidle' }); await login();
  if (!(await openProc())) { console.log('§UDP2L-VERDICT INCONCLUSIVE menu ' + MENU + ' not in the tree'); process.exit(2); }
  const has = await pg.locator('[data-proc-saved]').count();
  ok('U0', 'the process dialog has a Saved Parameter control (AbstractProcessDialog.savePrameterLayout)', has === 1, 'controls=' + has);
  if (!has) { console.log('§UDP2L-VERDICT FAIL ' + pass + '/' + (pass + fail) + ' (no Saved Parameter control - nothing else to judge)'); await browser.close(); srv.close(); process.exit(1); }
  ok('U1', 'Save + Delete disabled until a name is typed (:596-600)', await pg.$eval('[data-proc-saved-save]', b => b.disabled) && await pg.$eval('[data-proc-saved-delete]', b => b.disabled));

  // pick real values: 2nd accounting schema option (or the 1st non-blank), a real project id
  const schemaOpts = await pg.$$eval('[data-proc-param="C_AcctSchema_ID"] option', o => o.map(x => x.value).filter(Boolean));
  const proj = await pg.evaluate(() => { const r = window.__idmpDb.exec('SELECT c_project_id FROM c_project WHERE ad_client_id=11 ORDER BY c_project_id LIMIT 1'); return r.length ? String(r[0].values[0][0]) : null; });
  const want = { C_AcctSchema_ID: schemaOpts[schemaOpts.length - 1], C_Project_ID: proj };
  if (schemaOpts.length < 2 || !proj) { console.log('§UDP2L-VERDICT INCONCLUSIVE no schema/project in the seed'); process.exit(2); }
  await pg.selectOption('[data-proc-param="C_AcctSchema_ID"]', want.C_AcctSchema_ID); await pg.fill('[data-proc-param="C_Project_ID"]', want.C_Project_ID);
  let from = logs.length; await pg.fill('[data-proc-saved]', NAME); await pg.dispatchEvent('[data-proc-saved]', 'input');
  ok('U2', 'a typed new name enables Save, not Delete (:980-984)', !(await pg.$eval('[data-proc-saved-save]', b => b.disabled)) && await pg.$eval('[data-proc-saved-delete]', b => b.disabled));
  await hc('[data-proc-saved-save]');
  const sv = await waitLog(/§UDP2-SAVED save-new/, from);
  ok('U3', 'Save writes ONE signed group (new AD_PInstance with Name + its paras)', !!sv && /committed=true/.test(sv) && /ops=3/.test(sv), sv);
  await waitLog(/§UDP2-SAVED proc=226 .*W-UDP2 saved/, from);
  ok('U4', 'the saved name is listed straight after Save (querySaved :896)', (await listed()).includes(NAME), JSON.stringify(await listed()));

  // reload: does it survive?
  await pg.reload({ waitUntil: 'networkidle' }); await login(); await openProc(); await pg.waitForTimeout(800);
  const afterReload = await listed();
  ok('U5', 'after a page reload the saved name is still listed', afterReload.includes(NAME), JSON.stringify(afterReload));
  const v0 = await vals();
  from = logs.length; await choose(NAME);
  const v1 = await vals(), ld = await waitLog(/§UDP2-SAVED load/, from);
  ok('U6', 'choosing it restores the saved values (loadParameters :741-832)', v1.C_AcctSchema_ID === want.C_AcctSchema_ID && v1.C_Project_ID === want.C_Project_ID,
    'before=' + JSON.stringify(v0) + ' after=' + JSON.stringify(v1) + ' want=' + JSON.stringify(want));
  ok('U7', 'a listed name enables Save AND Delete', !(await pg.$eval('[data-proc-saved-save]', b => b.disabled)) && !(await pg.$eval('[data-proc-saved-delete]', b => b.disabled)));

  // Run -> a Last Run entry
  from = logs.length; await hc('[data-proc-run]');
  const rn = await waitLog(/§UDP2-SAVED run \(Last Run entry\)/, from);
  ok('U8', 'Run writes the run\'s own (unnamed) AD_PInstance first', !!rn && /committed=true/.test(rn), rn);
  await pg.waitForTimeout(1500);
  if (await pg.locator('[data-procdlg-ok]').count()) await hc('[data-procdlg-ok]');
  await openProc(); await pg.waitForTimeout(800);
  const afterRun = await listed(), lastRun = afterRun.filter(x => /^Last Run \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+$/.test(x));
  // the run used the SAME values as the saved set -> legacy dedups it away (paramsStr equal to a named entry, MPInstance.get :561)
  ok('U9', 'a run with the same values as a saved set is NOT listed again (paramsStr dedup)', lastRun.length === 0, JSON.stringify(afterRun));
  await pg.selectOption('[data-proc-param="C_AcctSchema_ID"]', schemaOpts[0]); await pg.fill('[data-proc-param="C_Project_ID"]', want.C_Project_ID);   // a different set (the dialog reopens on defaults)
  from = logs.length; await hc('[data-proc-run]');
  const rn2 = await waitLog(/§UDP2-SAVED run \(Last Run entry\)/, from); console.log('  second run: ' + rn2 + ' schema=' + schemaOpts[0]); await pg.waitForTimeout(1500);
  if (await pg.locator('[data-procdlg-ok]').count()) await hc('[data-procdlg-ok]');
  await openProc(); await pg.waitForTimeout(800);
  const afterRun2 = await listed(), lastRun2 = afterRun2.filter(x => /^Last Run \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+$/.test(x));
  ok('U10', 'a run with different values IS listed as "Last Run <Created>" after the named entries', lastRun2.length >= 1 && afterRun2.indexOf(NAME) < afterRun2.indexOf(lastRun2[0]), JSON.stringify(afterRun2));

  // Delete
  await choose(NAME); from = logs.length; await hc('[data-proc-saved-delete]');
  const dl = await waitLog(/§UDP2-SAVED delete/, from); await waitLog(/§UDP2-SAVED proc=226 /, from);
  const afterDel = await listed();
  ok('U11', 'Delete removes the instance + its paras (deleteEx :954-966)', !!dl && /committed=true/.test(dl) && !afterDel.includes(NAME), (dl || '') + ' list=' + JSON.stringify(afterDel));

  const real = errs.filter(e => !/ResizeObserver/.test(e));
  ok('U12', 'no page errors', real.length === 0, real.slice(0, 3).join(' | '));
  logs.filter(l => /§UDP2-SAVED/.test(l)).forEach(l => console.log('  log| ' + l));
  console.log('§UDP2L-VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§UDP2L-VERDICT INCONCLUSIVE ' + (e.stack || e)); process.exit(2); });
