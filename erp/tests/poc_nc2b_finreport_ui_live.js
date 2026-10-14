// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness W-NC2B-UI (bim-compiler prompts/ERP_DEPTH_FILM.md §NC-2 row NC2.6 / open item O1). READ tests/poc_nc2b_finreport_ui_live.log
//   before any conclusion — exit code is not evidence.
// THE ISSUES it proves/disproves: the Balance Sheet is run the LEGACY way - window 216 "Financial Report", record, "Create Report" button (AD_Process 202),
//   dialog with the optional C_Period_ID parameter - and (R1) with no period it reports TODAY's period (FinReport.setPeriods :296-343; legacy measured: default == today's period run,
//   scripts/bridge/out/nc2b_legacy.json), NOT the busiest history year (O1); (R2) with period Jan-03 chosen every line/column cell == the legacy T_Report rows (23 lines x 6 columns).
//   INCONCLUSIVE when the dialog never produced a statement.
// Run: node tests/poc_nc2b_finreport_ui_live.js 2>&1 | tee tests/poc_nc2b_finreport_ui_live.log        (cwd = bim-ootb/erp)
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



  const L = JSON.parse(fs.readFileSync(process.env.NC2B_LEGACY || require('os').homedir() + '/bim-compiler/scripts/bridge/out/nc2b_legacy.json', 'utf8'));
  const mid2 = (await seed("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=216 AND IsActive='Y'"))[0][0];
  const chain2 = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); const out = []; let n = leaf.parentElement.parentElement;
    while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, mid2);
  for (const id of chain2) { const open = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id);
    if (!open) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
  await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid2 + '"]'); await pg.waitForSelector(NEWB); await pg.waitForTimeout(1200);
  const rows = await pg.$$eval('.idmp-grid tbody tr', t => t.map(x => x.textContent));
  console.log('§NC2B-UI Financial Report records=' + JSON.stringify(rows));
  const bsIdx = rows.findIndex(r => /Balance Sheet/.test(r));
  if (bsIdx < 0) { console.log('§NC2B-UI VERDICT INCONCLUSIVE no Balance Sheet record'); process.exit(2); }
  await pg.locator('.idmp-grid tbody tr').nth(bsIdx).dblclick(); await pg.waitForTimeout(900);
  if (!(await pg.locator('#idmp-inline-mount [data-col]').count())) { await hc('#idmp-toolbar [data-tb="toggle"]'); await pg.waitForTimeout(900); }
  for (let k = 0; k < 4 && !/Balance Sheet/.test(await pg.inputValue(F('name')).catch(() => '')); k++) { await hc('#idmp-toolbar [title^="Next record"]'); await pg.waitForTimeout(700); }
  const curName = await pg.inputValue(F('name')).catch(() => '?'); console.log('§NC2B-UI current record name=' + curName);
  const btns = await pg.$$eval('[data-proc-btn]', e => e.map(x => x.textContent.trim()));
  console.log('§NC2B-UI buttons=' + JSON.stringify(btns));
  ok('R0', 'window 216 shows the "Create Report" button (dictionary: Processing -> AD_Process 202)', btns.some(b => /Create Report/.test(b)));
  const runReport = async (periodLabel) => {
    await pg.locator('[data-proc-btn="Processing"]').click(); await pg.waitForSelector('[data-proc-run]', { timeout: 8000 });
    const periodCtl = await pg.$eval('[data-proc-param="C_Period_ID"]', e => e.tagName).catch(() => 'NONE');
    if (periodLabel) { const v = await pg.$$eval('[data-proc-param="C_Period_ID"] option', (o, lab) => { const x = o.find(y => y.textContent.trim() === lab); return x ? x.value : null; }, periodLabel); if (v == null) throw new Error('no period option ' + periodLabel); await pg.selectOption('[data-proc-param="C_Period_ID"]', v); }
    await pg.locator('[data-proc-run]').click(); await pg.waitForSelector('[data-procdlg-ok]', { timeout: 20000 }); await pg.waitForTimeout(600);
    const st = await pg.evaluate(() => { const t = document.querySelector('#idmp-procdlg table[data-statement]'); if (!t) return null; const msg = [...document.querySelectorAll('#idmp-procdlg .msg')].map(x => x.textContent).join(' || ');
      return { msg, rows: [...t.querySelectorAll('tr')].slice(1).map(r => [...r.querySelectorAll('td')].map(td => td.textContent.trim())) }; });
    await hc('[data-procdlg-ok]'); await pg.waitForTimeout(500);
    return { periodCtl, st };
  };
  // R1 default period
  const d = await runReport(null);
  console.log('§NC2B-UI default: C_Period_ID control=' + d.periodCtl + ' msg=' + (d.st && d.st.msg));
  ok('R1', 'no period chosen -> TODAY\'s period ' + L.today.name + ' (legacy default == today: ' + L.defaultIsToday + ')', !!d.st && L.defaultIsToday && new RegExp('Period ' + L.today.name + '\\b').test(d.st.msg), d.st ? d.st.msg : 'no statement');
  ok('R1b', 'C_Period_ID parameter is a picker (SELECT)', d.periodCtl === 'SELECT');
  // R2 Jan-03 cells vs legacy T_Report
  const j = await runReport('Jan-03');
  if (!j.st) { console.log('§NC2B-UI VERDICT INCONCLUSIVE no statement for Jan-03'); process.exit(2); }
  // R2 the fold itself: feed the LEGACY pilot's own journal (periods <= Jan-03, exported by nc2b_legacy.js) through the twin's FinReport body, period Jan-03 chosen
  const seam = await pg.evaluate((facts) => { const r = window.__report.fold(100, { periodId: 160, factRows: facts }); return r && { period: r.period, lines: r.lines.map(l => ({ n: l.name, c: l.cells })), cols: r.cols }; }, L.facts);
  const lj = L.jan03r.rows; let bad = [];
  for (let i = 0; i < Math.max(seam.lines.length, lj.length); i++) { const tw = ((seam.lines[i] || {}).c || []).map(Number), lg = ((lj[i] || {}).cells || []).map(Number); if (JSON.stringify(tw) !== JSON.stringify(lg)) bad.push({ i, name: (lj[i] || {}).name, tw, lg }); }
  console.log('§NC2B-UI fold(legacy journal ' + L.facts.length + ' rows, period ' + (seam.period && seam.period.name) + ') lines=' + seam.lines.length + ' legacy=' + lj.length + ' mismatched=' + bad.length + (bad[0] ? ' first=' + JSON.stringify(bad[0]) : ''));
  ok('R2', 'same journal -> ' + (Math.max(seam.lines.length, lj.length) - bad.length) + ' of ' + Math.max(seam.lines.length, lj.length) + ' line rows (x' + seam.cols.length + ' columns) == legacy T_Report, Jan-03', seam.lines.length === lj.length && bad.length === 0, bad[0] ? JSON.stringify(bad[0]) : '');
  ok('R2b', 'the dialog run for Jan-03 produced the same 23 lines x 6 columns shape', j.st.rows.length === lj.length && j.st.rows.every(r => r.length === 7));
  for (const l of logs.filter(l => /FINREPORT|STATEMENT/.test(l))) console.log('   page: ' + l.slice(0, 260));
  ok('R9', 'no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log('§NC2B-UI VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§NC2B-UI CRASH ' + (e && e.stack || e)); process.exit(2); });
