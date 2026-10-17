// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness W-NC2-UI (bim-compiler prompts/ERP_DEPTH_FILM.md §NC-2 rows NC2.1-NC2.5). READ tests/poc_nc2_period_control_ui_live.log
//   before any conclusion — exit code is not evidence.
// THE ISSUES it proves/disproves: through window 117 in the UI, Period tab "Open/Close All" (AD_Process 167) and Period Control tab "Open/Close" (168) act on
//   C_PeriodControl EXACTLY like the LEGACY pilot (scripts/bridge/out/nc2_legacy.json, measured by nc2_legacy.js): O / rerun / C / P / reopen-after-P and a single-row 168.
//   Also the dialog's PeriodAction control offers legacy's reference list 176 (Open/Close/Permanently Close/<No Action>/Document Close). INCONCLUSIVE if no period was created.
// Run: node tests/poc_nc2_period_control_ui_live.js 2>&1 | tee tests/poc_nc2_period_control_ui_live.log        (cwd = bim-ootb/erp)
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


  const L = JSON.parse(fs.readFileSync(process.env.NC2_LEGACY || require('os').homedir() + '/bim-compiler/scripts/bridge/out/nc2_legacy.json', 'utf8'));
  const dbt = (await seed("SELECT COUNT(DISTINCT docbasetype) FROM c_doctype WHERE ad_client_id=11 AND isactive='Y'"))[0][0];
  const TAB = n => '#idmp-tabstrip .idmp-adtab:text-is("' + n + '")';
  const toForm = async () => { if (!(await pg.locator('#idmp-inline-mount [data-col]').count())) { await hc('#idmp-toolbar [data-tb="toggle"]'); await pg.waitForTimeout(800); } };
  // Year 2033 + Create Periods (the NC-1 path)
  await hc(TAB('Year')); await pg.waitForTimeout(1200); await hc(NEWB); await pg.waitForSelector('#idmp-inline-mount .cfrow'); await pg.waitForTimeout(500);
  await pg.fill(F('fiscalyear'), '2033'); await pg.locator(F('fiscalyear')).first().blur().catch(() => {}); await pg.waitForTimeout(300);
  await hc('#idmp-toolbar [data-tb="save"]'); await pg.waitForTimeout(1500);
  const yid = (await tip("SELECT c_year_id AS id FROM c_year WHERE fiscalyear='2033'"))[0];
  if (!yid) { console.log('§NC2-UI VERDICT INCONCLUSIVE no year'); process.exit(2); }
  await toForm(); await hc('[data-proc-btn]'); await pg.waitForSelector('[data-proc-run]'); await hc('[data-proc-run]'); await pg.waitForSelector('[data-procdlg-ok]'); await hc('[data-procdlg-ok]'); await pg.waitForTimeout(800);
  const P = (await tip("SELECT c_period_id AS id FROM c_period WHERE c_year_id=" + yid.id + " ORDER BY periodno")).map(r => r.id);
  console.log('§NC2-UI year=' + yid.id + ' periods=' + P.length);
  if (P.length !== 12) { console.log('§NC2-UI VERDICT INCONCLUSIVE periods=' + P.length); process.exit(2); }
  const st = async p => { const o = {}; (await tip("SELECT periodstatus AS s, COUNT(*) AS n FROM c_periodcontrol WHERE c_period_id=" + p + " GROUP BY 1")).forEach(r => o[r.s] = r.n); return o; };
  const ac = async p => { const o = {}; (await tip("SELECT periodaction AS s, COUNT(*) AS n FROM c_periodcontrol WHERE c_period_id=" + p + " GROUP BY 1")).forEach(r => o[r.s] = r.n); return o; };
  // Period tab, first period, form; run Open/Close All with an action; return {summary, params}
  await hc(TAB('Period')); await pg.waitForTimeout(1300); await toForm();
  let optsSeen = null;
  const openCloseAll = async (act) => {
    await hc('[data-proc-btn]'); await pg.waitForSelector('[data-proc-param="PeriodAction"]', { timeout: 8000 });
    if (!optsSeen) optsSeen = await pg.$$eval('[data-proc-param="PeriodAction"] option', o => o.map(x => ({ v: x.value, t: x.textContent.trim() }))).catch(() => null);
    const tag = await pg.$eval('[data-proc-param="PeriodAction"]', e => e.tagName);
    if (tag === 'SELECT') await pg.selectOption('[data-proc-param="PeriodAction"]', act); else await pg.fill('[data-proc-param="PeriodAction"]', act);
    await hc('[data-proc-run]'); await pg.waitForSelector('[data-procdlg-ok]', { timeout: 15000 }); await pg.waitForTimeout(500);
    const msg = await pg.$eval('#procdlg-msg, #idmp-procdlg .msg', e => e.textContent).catch(() => '?'); await hc('[data-procdlg-ok]'); await pg.waitForTimeout(700);
    return { msg, tag };
  };
  const cmp = (id, got, gs, ga) => { const w = L.cases[id]; ok(id, 'twin == legacy: states ' + JSON.stringify(gs) + ' actions ' + JSON.stringify(ga) + ' msg "' + String(got.msg).slice(0, 40) + '" (legacy ' + JSON.stringify(w.states) + ' ' + JSON.stringify(w.actions) + ' "' + w.summary + '")',
    JSON.stringify(gs) === JSON.stringify(w.states) && JSON.stringify(ga) === JSON.stringify(w.actions) && String(got.msg).includes(w.summary.replace(/^Updated /, 'Updated ').slice(0, 11))); };
  const p1 = P[0];
  let r = await openCloseAll('O'); cmp('NC2.1', r, await st(p1), await ac(p1));
  console.log('§NC2-UI dialog PeriodAction control=' + r.tag + ' options=' + JSON.stringify(optsSeen));
  r = await openCloseAll('O'); cmp('NC2.1-rerun', r, await st(p1), await ac(p1));
  r = await openCloseAll('C'); cmp('NC2.2', r, await st(p1), await ac(p1));
  r = await openCloseAll('P'); cmp('NC2.3-P', r, await st(p1), await ac(p1));
  r = await openCloseAll('O'); cmp('NC2.3-reopen', r, await st(p1), await ac(p1));
  const want176 = L.ref176.map(x => x.v + '=' + x.n).sort();
  const got176 = (optsSeen || []).filter(x => x.v).map(x => x.v + '=' + x.t).sort();
  ok('NC2.5', 'PeriodAction control is a List offering legacy reference 176 (' + want176.length + ' entries, labels equal)', r.tag === 'SELECT' && JSON.stringify(got176) === JSON.stringify(want176), JSON.stringify({ tag: r.tag, got: got176, want: want176 }));
  // NC2.4: second period, Period Control tab, row SOO: set PeriodAction=O, Save, click Open/Close (168)
  await hc('#idmp-toolbar [title^="Next record"]'); await pg.waitForTimeout(900);
  await hc(TAB('Period Control')); await pg.waitForTimeout(1400);
  const row = (await tip("SELECT c_periodcontrol_id AS id FROM c_periodcontrol WHERE c_period_id=" + P[1] + " AND docbasetype='SOO'"))[0];
  if (await pg.evaluate(() => !!document.querySelector('#idmp-content #idmp-form, #idmp-content .idmp-form'))) { await hc('#idmp-toolbar [data-tb="toggle"]'); await pg.waitForTimeout(800); }   // §OPEN-MODE: a single-row child tab opens as a form
  const rows = await pg.$$eval('.idmp-grid tbody tr', t => t.map(x => x.textContent.slice(0, 80)));
  console.log('§NC2-UI period-control grid rows=' + rows.length);
  const idx = (await tip("SELECT docbasetype AS d FROM c_periodcontrol WHERE c_period_id=" + P[1] + " ORDER BY c_periodcontrol_id")).map(x => x.d).indexOf('SOO');
  await pg.locator('.idmp-grid tbody tr').nth(idx).click(); await pg.waitForTimeout(500); await toForm();
  const hasSOO = await pg.evaluate(() => (document.querySelector('#idmp-inline-mount') || document.body).innerText.includes('SOO') || true);
  const pa = F('periodaction', 'select'); const paTag = (await pg.locator(pa).count()) ? 'SELECT' : ((await pg.locator(F('periodaction')).count()) ? 'INPUT' : 'NONE');
  console.log('§NC2-UI Period Control form PeriodAction control=' + paTag);
  if (paTag === 'SELECT') await pg.selectOption(pa, 'O'); else if (paTag === 'INPUT') await pg.fill(F('periodaction'), 'O');
  await pg.locator(paTag === 'SELECT' ? pa : F('periodaction')).first().blur().catch(() => {}); await pg.waitForTimeout(300);
  await hc('#idmp-toolbar [data-tb="save"]'); await pg.waitForTimeout(1500);
  const preset = await ac(P[1]); const wp = L.cases['NC2.4-preset'].actions;
  ok('NC2.4-preset', 'PeriodAction=O saved on ONE row (legacy ' + JSON.stringify(wp) + ')', JSON.stringify(preset) === JSON.stringify(wp), JSON.stringify(preset));
  await hc('[data-proc-btn]'); await pg.waitForSelector('[data-proc-run], [data-procdlg-ok]', { timeout: 8000 });
  if (await pg.locator('[data-proc-run]').count()) await hc('[data-proc-run]');
  await pg.waitForSelector('[data-procdlg-ok]', { timeout: 15000 });
  const msg4 = await pg.$eval('#idmp-procdlg .msg', e => e.textContent).catch(() => '?'); await hc('[data-procdlg-ok]'); await pg.waitForTimeout(600);
  const s4 = await st(P[1]), a4 = await ac(P[1]), w4 = L.cases['NC2.4'];
  ok('NC2.4', 'single-row Open/Close (168): states ' + JSON.stringify(s4) + ' actions ' + JSON.stringify(a4) + ' (legacy ' + JSON.stringify(w4.states) + ' ' + JSON.stringify(w4.actions) + ', msg legacy "' + w4.summary + '" twin "' + msg4.slice(0, 30) + '")', JSON.stringify(s4) === JSON.stringify(w4.states) && JSON.stringify(a4) === JSON.stringify(w4.actions));
  ok('NC2.9', 'no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  for (const l of logs.filter(l => /DBGIDX|PROC-COMMIT|AD-PROC-LIVE proc=16|PeriodStatus|PERIOD|UNPORTED|PROC-/.test(l)).slice(0, 25)) console.log('   page: ' + l.slice(0, 260));
  console.log('§NC2-UI VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§NC2-UI CRASH ' + (e && e.stack || e)); process.exit(2); });
