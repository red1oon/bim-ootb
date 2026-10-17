// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness W-ADMIN-RECINFO-LIVE (bim-compiler prompts/ERP_DEPTH_FILM.md §ADMIN-2). READ tests/poc_admin_recinfo_live.log
//   before any conclusion — exit code is not evidence.
// THE ISSUE: does the admin get legacy's paper trail - Record Info (WRecordInfo) with the record's Change Log (Name | New Value | Old Value |
//   Updated By | Updated | Column, newest first) - DERIVED from the signed op-log with legacy's write rule (an update of a logged column; the
//   old value = what the record held before the save, never a stored AD_ChangeLog), and is the change log hidden for a role whose
//   PreferenceType is not 'C' (WRecordInfo :416-417)? Edits a Business Partner Name twice as GardenAdmin. On origin/main the ⓘ popup shows
//   created/updated only and no change log (RED).
// Run: node tests/poc_admin_recinfo_live.js 2>&1 | tee tests/poc_admin_recinfo_live.log        (cwd = bim-ootb/erp)
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
  // the recent rows as the twin holds them: seed + signed op-log tip (the same read the save path uses)
  const recent = () => pg.evaluate(() => new Promise(res => {
    const base = (() => { try { const r = window.__idmpDb.exec('SELECT * FROM ad_recentitem WHERE ad_user_id=' + Number(window.APP.actor)); return r.length ? r[0].values.map(v => { const o = {}; r[0].columns.forEach((c, i) => o[c.toLowerCase()] = v[i]); return o; }) : []; } catch (e) { return []; } })();
    const c = window.__crud; if (!c || !c.withSidecar) { res(base); return; }
    c.withSidecar(sdb => { const rows = sdb ? c.core.listTip(sdb, 'ad_recentitem', 'ad_recentitem_id', base, null).rows : base;
      res((window.AdRecent ? window.AdRecent.listFor(rows, window.APP.actor, window.APP.clientId) : rows).map(r => ({ table: r.ad_table_id, record: r.record_id, window: r.ad_window_id, tab: r.ad_tab_id, updated: r.updated }))); });
  }));
  const F = c => '#idmp-inline-mount input[data-col="' + c + '"]';
  const toForm = async () => { if (!(await pg.locator('#idmp-inline-mount [data-col]').count())) { await hc('#idmp-toolbar [data-tb="toggle"]'); await pg.waitForTimeout(800); } };
  const editName = async (pk) => {   // reach record `pk` with the toolbar's record navigation (First / Next), then edit its Name in the form
    if (!(await pg.locator('#idmp-inline-mount [data-col]').count())) { await hc('#idmp-toolbar [data-tb="toggle"]'); await pg.waitForTimeout(800); }
    if (pk != null) {
      await hc('#idmp-toolbar button[title^="First record"]'); await pg.waitForTimeout(400);
      for (let i = 0; i < 60; i++) { const cur = await pg.evaluate(() => window.IdmpGridTab.snapshot().currentKey); if (String(cur) === String(pk)) break; await hc('#idmp-toolbar button[title^="Next record"]'); await pg.waitForTimeout(300); }
    }
    const v = await pg.$eval(F('name'), e => e.value); await pg.fill(F('name'), v + ' .'); await pg.locator(F('name')).blur().catch(() => {});
    const from = logs.length; await hc('#idmp-toolbar [data-tb="save"]');
    for (let i = 0; i < 40; i++) { if (logs.slice(from).some(l => /§UDP6-RECENT/.test(l))) break; await pg.waitForTimeout(250); }
    await pg.waitForTimeout(600);
    const id = await pg.evaluate(() => window.IdmpGridTab.snapshot().currentKey);
    return { id, line: logs.slice(from).filter(l => /§UDP6-RECENT/.test(l)).pop() || null };
  };
  const recInfo = async () => {
    await hc('#idmp-toolbar button[title^="Record info"]'); await pg.waitForTimeout(500);
    return pg.evaluate(() => { const ov = document.getElementById('idmp-recinfo-ov'); if (!ov) return null;
      const t = ov.querySelector('#idmp-recinfo-log'); return { title: ov.firstChild.firstChild.textContent, pre: (ov.querySelector('pre') || {}).textContent,
        rows: t ? [...t.querySelectorAll('tbody tr, tr')].filter(r => r.cells[0] && r.cells[0].tagName === 'TD').map(r => [...r.cells].map(c => c.textContent)) : null }; });
  };
  await pg.goto(url, { waitUntil: 'networkidle' }); await login(); await openWin(123);
  const before = await pg.$eval(F('name'), e => e.value).catch(async () => { await toForm(); return pg.$eval(F('name'), e => e.value); });
  const s1 = await editName(null); const n1 = await pg.$eval(F('name'), e => e.value);
  const s2 = await editName(s1.id); const n2 = await pg.$eval(F('name'), e => e.value);
  console.log('  record=' + s1.id + ' names: "' + before + '" -> "' + n1 + '" -> "' + n2 + '"');
  const ri = await recInfo();
  console.log('  recinfo=' + JSON.stringify(ri));
  const nameRows = ri && ri.rows ? ri.rows.filter(r => r[5].toLowerCase() === 'name') : [];
  ok('R1', 'Record Info title + info text like WRecordInfo (Record Info - <tab>, CreatedBy line)', ri && /^Record Info - /.test(ri.title) && /CreatedBy: /.test(ri.pre || ''), ri && (ri.title + ' | ' + ri.pre));
  ok('R1b', 'after the saves the info text shows UpdatedBy: GardenAdmin (the record\'s Updated/UpdatedBy as the fold stamped them)', ri && /UpdatedBy: GardenAdmin - \d{4}-/.test(ri.pre || ''), ri && ri.pre);
  ok('R2', 'the Change Log lists both Name edits, newest first, old -> new chained from the record state (not a stored AD_ChangeLog)',
    nameRows.length === 2 && nameRows[0][1] === n2 && nameRows[0][2] === n1 && nameRows[1][1] === n1 && nameRows[1][2] === before, JSON.stringify(nameRows));
  ok('R3', 'each row: column Name label, Updated By = the user who saved, Updated = a date-time', nameRows.length === 2 && nameRows.every(r => r[0] && r[3] === 'GardenAdmin' && /^\d{4}-\d\d-\d\d \d\d:\d\d/.test(r[4])), JSON.stringify(nameRows.map(r => [r[0], r[3], r[4]])));
  // §LOCAL-TIME: the Updated shown is the device's LOCAL wall clock (legacy: the server's local time), not UTC
  const localNow = await pg.evaluate(() => { const d = new Date(), p = n => ('0' + n).slice(-2); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); });
  const toMin = s => { const m = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000 : NaN; };
  ok('R3b', 'Updated is the LOCAL wall clock (within 3 minutes of the page\'s local time, not UTC)', nameRows.length > 0 && Math.abs(toMin(nameRows[0][4]) - toMin(localNow)) <= 3, nameRows.length && (nameRows[0][4] + ' vs local ' + localNow));
  ok('R4', 'no row for a column that did not change (legacy skips old==new) and no insert rows (SYSTEM_INSERT_CHANGELOG default N)', ri && ri.rows && ri.rows.every(r => r[1] !== r[2]) && ri.rows.length === nameRows.length + ri.rows.filter(r => r[5].toLowerCase() !== 'name').length, JSON.stringify(ri && ri.rows && ri.rows.map(r => r[5])));
  await pg.evaluate(() => { const o = document.getElementById('idmp-recinfo-ov'); if (o) o.remove(); });
  // the same record as a role whose PreferenceType is 'O' (GardenAdmin's GardenWorld User role): change log hidden
  await pg.reload({ waitUntil: 'networkidle' });
  await pg.waitForFunction(() => !!window.__idmpDb, null, { timeout: 30000 });
  await pg.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0);
  await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
  await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible');
  const roleSet = await pg.evaluate(() => { const s = document.querySelector('#idmp-login-step2 select'); if (!s) return null; const o = [...s.options].find(x => /GardenWorld User/.test(x.textContent)); if (!o) return null; s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); return o.textContent; });
  await pg.click('#idmp-login-ok'); await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0);
  const roleNow = await pg.evaluate(() => window.APP && window.APP.roleId);
  let ri2 = null;
  try { await openWin(123); await toForm(); for (let i = 0; i < 60; i++) { const cur = await pg.evaluate(() => window.IdmpGridTab.snapshot().currentKey); if (String(cur) === String(s1.id)) break; await hc('#idmp-toolbar button[title^="Next record"]'); }
    ri2 = await recInfo(); } catch (e) { console.log('  role O run: ' + e.message); }
  console.log('  roleSelected=' + roleSet + ' roleId=' + roleNow + ' recinfo=' + JSON.stringify(ri2));
  ok('R5', "a PreferenceType 'O' role sees Record Info WITHOUT the change log (WRecordInfo :416-417)", !!roleSet && ri2 && ri2.rows === null && /CreatedBy: /.test(ri2.pre || ''), JSON.stringify(ri2));
  const real = errs.filter(e => !/ResizeObserver/.test(e));
  ok('R6', 'no page errors', real.length === 0, real.slice(0, 3).join(' | '));
  console.log('§ADMRI-VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§ADMRI-VERDICT INCONCLUSIVE ' + (e.stack || e)); process.exit(2); });
