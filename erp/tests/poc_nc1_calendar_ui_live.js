// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness W-NC1-UI (bim-compiler prompts/ERP_DEPTH_FILM.md §NC-1 rows NC1.1/NC1.2/NC1.8). READ tests/poc_nc1_calendar_ui_live.log
//   before any conclusion — exit code is not evidence.
// THE ISSUES it proves/disproves (each assertion names its own):
//   U1  window 117 "Calendar Year and Period" opens from the menu with the 5 dictionary tabs (AD_Tab of window 117), in order        → X of N tabs
//   U2  the Year tab FORM shows the dictionary's "Create Periods" button (AD_Column.Processing, Reference 28, AD_Process 100) — was NOT
//       rendered (the form showed 6 fields, the button field dropped; the toolbar Process only offered DocActions)                    → §AD-BUTTON form
//   U3  the button runs YearCreatePeriods for THIS year with the dialog's StartDate/DateFormat                                        → 12 c_period rows, names/dates == GregorianCalendar model
//   U4  C_PeriodControl born by MPeriod.afterSave: 12 x distinct active DocBaseType, all PeriodStatus N                                → counts
//   Expected rows come from an independent GregorianCalendar model below, never from the code under test. INCONCLUSIVE when nothing was created.
// Run: node tests/poc_nc1_calendar_ui_live.js 2>&1 | tee tests/poc_nc1_calendar_ui_live.log        (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': s.size }); fs.createReadStream(f).pipe(r); }); });
let pass = 0, fail = 0, inconclusive = 0;
const ok = (id, name, cond, detail) => { console.log((cond ? '  ✅ ' : '  ❌ ') + id + ' ' + name + (detail ? ' — ' + detail : '')); cond ? pass++ : fail++; };
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function model(start, f) {   // MYear.createStdPeriods :228-281 — month add clamps (GregorianCalendar)
  let [y, m, d] = start.split('-').map(Number); m--; const out = [], P = n => (n < 10 ? '0' : '') + n;
  const iso = (Y, M, D) => { const t = new Date(Date.UTC(Y, M, D)); return t.getUTCFullYear() + '-' + P(t.getUTCMonth() + 1) + '-' + P(t.getUTCDate()); };
  for (let i = 0; i < 12; i++) {
    const nm = (m + 1) % 12, ny = y + (m + 1 > 11 ? 1 : 0), last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
    const end = new Date(Date.UTC(ny, nm, Math.min(d, last) - 1)); const name = f === 'MMM yyyy' ? MON[m] + ' ' + y : MON[m] + '-' + String(y).slice(2);
    out.push({ no: i + 1, name, s: iso(y, m, d), e: end.toISOString().slice(0, 10) });
    const nx = new Date(end.getTime() + 86400000); y = nx.getUTCFullYear(); m = nx.getUTCMonth(); d = nx.getUTCDate();
  }
  return out;
}
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 810 } })).newPage();
  const logs = [], errs = []; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('http://localhost:' + srv.address().port + '/erp/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
  await pg.waitForFunction(() => !!window.__idmpDb, null, { timeout: 30000 });
  await pg.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0);
  await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
  await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
  await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0);
  const tip = (sql) => pg.evaluate(s => window.__crud.withModelTrx(q => q(s)), sql);
  const seed = (sql) => pg.evaluate(s => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; }, sql);
  const hc = async (sel) => { const l = pg.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click(); await pg.waitForTimeout(350); };
  const F = (c, t) => '#idmp-inline-mount ' + (t || 'input') + '[data-col="' + c + '"]';
  const NEWB = '#idmp-toolbar [data-tb="new"]';
  const mid = (await seed("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=117 AND IsActive='Y'"))[0][0];
  const chain = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); const out = []; let n = leaf.parentElement.parentElement;
    while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, mid);
  for (const id of chain) { const open = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id);
    if (!open) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
  await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid + '"]'); await pg.waitForSelector(NEWB); await pg.waitForTimeout(1200);

  // U1 tabs: dictionary vs DOM
  const dictTabs = (await seed('SELECT name FROM ad_tab WHERE ad_window_id=117 AND isactive=\'Y\' ORDER BY seqno')).map(r => r[0]);
  const domTabs = await pg.$$eval('#idmp-tabstrip .idmp-adtab', e => e.map(x => x.textContent.trim()));
  console.log('§NC1-UI tabs dict=' + JSON.stringify(dictTabs) + ' dom=' + JSON.stringify(domTabs));
  ok('U1', 'window 117 shows ' + domTabs.length + ' of ' + dictTabs.length + ' dictionary tabs, same order', dictTabs.length === 5 && JSON.stringify(dictTabs) === JSON.stringify(domTabs));

  // Year tab → New, FiscalYear 2031, Save
  await hc('#idmp-tabstrip .idmp-adtab[title^="TabLevel 1 · C_Year"]'); await pg.waitForTimeout(1200);
  const y0 = (await tip("SELECT COUNT(*) AS n FROM c_year WHERE fiscalyear='2031'"))[0].n;
  await hc(NEWB); await pg.waitForSelector('#idmp-inline-mount .cfrow'); await pg.waitForTimeout(600);
  await pg.fill(F('fiscalyear'), '2031'); await pg.locator(F('fiscalyear')).first().blur().catch(() => {}); await pg.waitForTimeout(400);
  await hc('#idmp-toolbar [title^="Save"]'); await pg.waitForTimeout(1800);
  const yr = await tip("SELECT c_year_id AS id, c_calendar_id AS cal FROM c_year WHERE fiscalyear='2031'");
  ok('U0', 'Year 2031 saved through the UI (was ' + y0 + ' → ' + yr.length + ')', y0 === 0 && yr.length === 1, JSON.stringify(yr));
  if (yr.length !== 1) { console.log('§NC1-UI VERDICT INCONCLUSIVE no year created'); process.exit(2); }
  const yid = yr[0].id;
  if (await pg.locator('#idmp-toolbar [data-tb="toggle"]').count()) { const inForm = await pg.locator(F('fiscalyear')).count(); if (!inForm) await hc('#idmp-toolbar [data-tb="toggle"]'); }
  await pg.waitForTimeout(800);

  // U2 the button
  const btn = await pg.locator('[data-proc-btn]').count();
  const dictBtn = await seed("SELECT f.name FROM ad_field f JOIN ad_column c ON c.ad_column_id=f.ad_column_id WHERE f.ad_tab_id=129 AND f.isactive='Y' AND f.isdisplayed='Y' AND c.ad_reference_id=28 AND c.ad_process_id=100");
  console.log('§NC1-UI button dict=' + JSON.stringify(dictBtn) + ' dom=' + btn);
  ok('U2', 'Year form renders ' + btn + ' of ' + dictBtn.length + ' dictionary process buttons ("Create Periods")', dictBtn.length === 1 && btn === 1);
  if (btn !== 1) { console.log('§NC1-UI VERDICT FAIL button missing'); process.exit(1); }
  await hc('[data-proc-btn]'); await pg.waitForSelector('[data-proc-param="StartDate"]', { timeout: 8000 });
  const paras = await pg.$$eval('[data-proc-param]', e => e.map(x => x.getAttribute('data-proc-param')));
  console.log('§NC1-UI process dialog params=' + JSON.stringify(paras));
  await pg.fill('[data-proc-param="StartDate"]', '2031-07-01'); await pg.fill('[data-proc-param="DateFormat"]', 'MMM yyyy');
  await hc('[data-proc-run]'); await pg.waitForSelector('.idmp-procresult', { timeout: 15000 }); await pg.waitForTimeout(1200);
  const chip = await pg.$eval('.idmp-procresult .ok-chip', e => e.textContent).catch(() => '?'), msg = await pg.$eval('.idmp-procresult .msg', e => e.textContent).catch(() => '?');
  console.log('§NC1-UI process result chip=' + chip + ' msg=' + JSON.stringify(msg));

  // U6 L&F: ProcessModalDialog — the window stays under a modal dialog; OK closes it
  const kept = await pg.evaluate(() => ({ dlg: !!document.querySelector('#idmp-procdlg .idmp-procresult'), tabs: document.querySelectorAll('#idmp-tabstrip .idmp-adtab').length, tb: getComputedStyle(document.querySelector('#idmp-toolbar')).display !== 'none', ts: getComputedStyle(document.querySelector('#idmp-tabstrip')).display !== 'none' }));
  console.log('§NC1-UI dialog ' + JSON.stringify(kept));
  ok('U6', 'result shows in a modal dialog over the window (tab strip ' + kept.tabs + ' tabs + toolbar kept), like ProcessModalDialog', kept.dlg && kept.tabs === 5 && kept.tb && kept.ts);
  await hc('[data-procdlg-ok]'); await pg.waitForTimeout(800);
  ok('U7', 'OK closes the dialog and the Year window is still there', await pg.evaluate(() => !document.querySelector('#idmp-procdlg') && !!document.querySelector('#idmp-tabstrip .idmp-adtab.active')));
  // U3/U4 rows
  const got = await tip("SELECT periodno AS no, name, substr(startdate,1,10) AS s, substr(enddate,1,10) AS e, periodtype AS t FROM c_period WHERE c_year_id=" + yid + " ORDER BY periodno");
  const want = model('2031-07-01', 'MMM yyyy');
  const bad = want.filter((w, i) => !got[i] || got[i].name !== w.name || got[i].s !== w.s || got[i].e !== w.e || got[i].no !== w.no);
  console.log('§NC1-UI periods=' + got.length + ' first=' + JSON.stringify(got[0]) + ' last=' + JSON.stringify(got[11]));
  ok('U3', 'process ran for THIS year: 12 periods, names/PeriodNo/Start/End == GregorianCalendar model (Jul 2031 … Jun 2032)', got.length === 12 && bad.length === 0, bad.length ? JSON.stringify(bad[0]) : '');
  const dbt = (await seed("SELECT COUNT(DISTINCT docbasetype) FROM c_doctype WHERE ad_client_id=11 AND isactive='Y'"))[0][0];
  const pc = await tip("SELECT COUNT(*) AS n, SUM(periodstatus='N') AS never FROM c_periodcontrol WHERE c_period_id IN (SELECT c_period_id FROM c_period WHERE c_year_id=" + yid + ")");
  ok('U4', 'C_PeriodControl = 12 x ' + dbt + ' DocBaseTypes, all PeriodStatus N', pc[0].n === 12 * dbt && pc[0].never === pc[0].n, JSON.stringify(pc[0]));
  ok('U5', 'no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  for (const l of logs.filter(l => /§AD-BUTTON|§PROC-COMMIT|§AD-PROC-LIVE proc=100|YearCreate/.test(l)).slice(0, 8)) console.log('   page: ' + l.slice(0, 200));
  console.log('§NC1-UI VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§NC1-UI CRASH ' + (e && e.stack || e)); process.exit(2); });
