// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness W-UDP3-LIVE (bim-compiler prompts/ERP_DEPTH_FILM.md §UDP-3). READ tests/poc_udp3_find_live.log
//   before any conclusion — exit code is not evidence.
// THE ISSUE: does the twin have legacy's Find window on a real window (Sales Order, AD_Window 143) and does it DO what FindWindow does -
//   a Simple value narrows the grid to exactly the rows its WHERE selects, an Advanced row too, a query saved under a name survives a page
//   reload, is listed (MUserQuery.get), loads back into the Advanced tab and gives the same rows, Delete removes it, Reset clears the query.
//   The judge of "exactly the rows": the grid's own read (§AD_DATA readRecords where=...) re-run on the page DB, + every shown row checked.
//   On origin/main there is no Find button (RED).
// Run: node tests/poc_udp3_find_live.js 2>&1 | tee tests/poc_udp3_find_live.log        (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), WIN = 143, QNAME = 'W-UDP3 query';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.sql': 'text/plain' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': s.size }); fs.createReadStream(f).pipe(r); }); });
let pass = 0, fail = 0;
const ok = (id, name, cond, detail) => { console.log((cond ? '  ✅ ' : '  ❌ ') + id + ' ' + name + (detail ? ' — ' + detail : '')); cond ? pass++ : fail++; };
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }), pg = await ctx.newPage();
  const logs = [], errs = []; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => errs.push(e.message));
  const url = 'http://localhost:' + srv.address().port + '/erp/idempiere.html?lang=en_US';
  const hc = async (sel) => { const l = pg.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click(); await pg.waitForTimeout(350); };
  const seed = (sql) => pg.evaluate(s => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; }, sql);
  const login = async () => {
    await pg.waitForFunction(() => !!window.__idmpDb, null, { timeout: 30000 });
    await pg.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0);
    await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
    await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
    await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0);
  };
  const openWin = async () => {
    const mid = (await seed("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=" + WIN + " AND IsActive='Y'"))[0][0];
    const chain = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); const out = []; let n = leaf.parentElement.parentElement;
      while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, mid);
    for (const id of chain) { const open = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id);
      if (!open) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
    await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid + '"]'); await pg.waitForSelector('#idmp-toolbar [data-tb="new"]'); await pg.waitForTimeout(1200);
  };
  const lastRead = (from) => { const l = logs.slice(from).filter(x => /^§AD_DATA readRecords table=C_Order where=/i.test(x)).pop(); return l ? l.replace(/^§AD_DATA readRecords table=C_Order where=/i, '') : null; };
  const rowsLine = (from) => { const l = logs.slice(from).filter(x => /^§IDEMPIERE tab=.* table=C_Order rows=/i.test(x)).pop(); return l ? +/rows=(\d+)/.exec(l)[1] : null; };
  const judge = async (from, pred, label) => {   // the grid's own WHERE re-run on the page DB == the rows shown; every shown row satisfies pred
    const where = lastRead(from), shown = rowsLine(from);
    const n = where ? (await seed('SELECT count(*) FROM C_Order WHERE ' + where))[0][0] : null;
    const bad = where ? (await seed('SELECT count(*) FROM C_Order WHERE (' + where + ') AND NOT (' + pred + ')'))[0][0] : null;
    return { where, shown, n, bad, label };
  };

  await pg.goto(url, { waitUntil: 'networkidle' }); await login(); await openWin();
  const hasFind = await pg.locator('#idmp-toolbar [data-tb="find"]').count();
  ok('F0', 'the window toolbar has Find (ADWindowToolbar btnFind)', hasFind === 1, 'buttons=' + hasFind);
  if (!hasFind) { console.log('§UDP3L-VERDICT FAIL ' + pass + '/' + (pass + fail) + ' (no Find - nothing else to judge)'); await browser.close(); srv.close(); process.exit(1); }
  const before = rowsLine(0);
  let from = logs.length; await hc('#idmp-toolbar [data-tb="find"]'); await pg.waitForSelector('#idmp-find-ov');
  const openLine = logs.slice(from).find(l => /§UDP3-FIND open/.test(l)) || '';
  const simpleCols = await pg.$$eval('[data-find-panel="simple"] > .fld [data-find-s]', e => e.map(x => x.getAttribute('data-find-s')));
  const dictSel = (await seed("SELECT c.ColumnName FROM AD_Field f JOIN AD_Column c ON c.AD_Column_ID=f.AD_Column_ID WHERE f.AD_Tab_ID=186 AND f.IsActive='Y' AND c.IsActive='Y' AND COALESCE(f.IsSelectionColumn, c.IsSelectionColumn)='Y' ORDER BY CASE WHEN COALESCE(c.SeqNoSelection,0)=0 THEN 1 ELSE 0 END, c.SeqNoSelection, f.IsDisplayed DESC, f.SeqNo")).map(r => r[0]);
  ok('F1', 'the Simple tab shows exactly the tab\'s IsSelectionColumn fields in SeqNoSelection order (initFind; dictionary)', JSON.stringify(simpleCols) === JSON.stringify(dictSel), openLine + ' shown=' + JSON.stringify(simpleCols) + ' dictionary=' + JSON.stringify(dictSel));
  // a real document number prefix from the seed
  const dn = (await seed("SELECT DocumentNo FROM C_Order WHERE AD_Client_ID=11 AND IsSOTrx='Y' ORDER BY C_Order_ID LIMIT 1"))[0][0];
  const pre = String(dn).slice(0, 2);
  await pg.fill('[data-find-panel="simple"] [data-find-s="DocumentNo"]', pre.toLowerCase());
  from = logs.length; await hc('[data-find-ok]'); await pg.waitForTimeout(1200);
  const j1 = await judge(from, "UPPER(C_Order.DocumentNo) LIKE '" + pre.toUpperCase() + "%'", 'simple');
  ok('F2', 'Simple DocumentNo "' + pre.toLowerCase() + '" -> UPPER(DocumentNo) LIKE \'' + pre.toUpperCase() + '%\' (isSearchLike), grid = its WHERE\'s rows, all matching',
    j1.where && /UPPER\(C_Order\.DocumentNo\) LIKE UPPER\('/.test(j1.where) && j1.shown === Math.min(j1.n, 200) && j1.bad === 0 && j1.shown > 0, JSON.stringify(j1) + ' before=' + before + ' (a Find searches history too: doOnFind :2662)');
  ok('F3', 'the Find button shows the tab is filtered', await pg.$eval('#idmp-toolbar [data-tb="find"]', b => b.classList.contains('active')));
  // the query lives on its tab while the window stays open: open another window, switch back
  const bpMenu = (await seed("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=123 AND IsActive='Y'"))[0][0];
  await pg.evaluate(id => { const r = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); r && r.click(); }, bpMenu); await pg.waitForTimeout(1500);
  await require('./legacy_open.js').showAllRows(pg, { history: false });   // Business Partner is high volume: it opens on Find first (§UDP-4)
  from = logs.length; await pg.evaluate(() => { const t = Array.from(document.querySelectorAll('#idmp-wintabs .idmp-wintab')).find(x => /Sales Order/.test(x.textContent)); t && t.click(); }); await pg.waitForTimeout(1500);
  const jsw = lastRead(from);
  ok('F3b', 'switching to another window and back keeps the Find query (GridTab.setQuery lives with the open window)', !!jsw && /UPPER\(C_Order\.DocumentNo\) LIKE UPPER\('/.test(jsw), 'where=' + jsw);
  // Advanced: DocStatus = CO AND (GrandTotal > 0)
  from = logs.length; await hc('#idmp-toolbar [data-tb="find"]'); await pg.waitForSelector('#idmp-find-ov'); await hc('[data-find-tab="advanced"]');
  await pg.selectOption('[data-find-row] [data-find-col]', 'DocStatus'); await pg.waitForTimeout(200);
  await pg.selectOption('[data-find-row] [data-find-op]', '='); await pg.selectOption('[data-find-row] [data-find-v]', 'CO');
  await hc('[data-find-addrow]');
  const r2 = '[data-find-row]:nth-child(2)';
  await pg.selectOption(r2 + ' [data-find-andor]', 'AND'); await pg.selectOption(r2 + ' [data-find-col]', 'GrandTotal'); await pg.waitForTimeout(200);
  await pg.selectOption(r2 + ' [data-find-op]', '>'); await pg.fill(r2 + ' [data-find-v]', '0');
  from = logs.length; await hc('[data-find-ok]'); await pg.waitForTimeout(1200);
  const j2 = await judge(from, "C_Order.DocStatus='CO' AND C_Order.GrandTotal>0", 'advanced');
  ok('F4', 'Advanced DocStatus = CO AND GrandTotal > 0 -> grid = its WHERE\'s rows, all matching', j2.where && /DocStatus='CO'/.test(j2.where) && j2.shown === Math.min(j2.n, 200) && j2.bad === 0 && j2.shown > 0, JSON.stringify(j2));
  // save it under a name
  await hc('#idmp-toolbar [data-tb="find"]'); await pg.waitForSelector('#idmp-find-ov'); await hc('[data-find-tab="advanced"]');
  await pg.selectOption('[data-find-row] [data-find-col]', 'DocStatus'); await pg.waitForTimeout(200);
  await pg.selectOption('[data-find-row] [data-find-op]', '='); await pg.selectOption('[data-find-row] [data-find-v]', 'CO');
  await pg.fill('[data-find-query]', QNAME); await pg.dispatchEvent('[data-find-query]', 'input');
  from = logs.length; await hc('[data-find-save]');
  let sv = null; for (let i = 0; i < 40 && !sv; i++) { sv = logs.slice(from).find(l => /§UDP3-FIND save query=/.test(l)); if (!sv) await pg.waitForTimeout(250); }
  ok('F5', 'Save writes ONE signed AD_UserQuery (Name, AD_Tab_ID, AD_User_ID, Code in legacy format)', !!sv && /CRUD_CREATE/.test(sv) && /committed=true/.test(sv) && /code=DocStatus<\^>=<\^>CO<\^><\^><\^><\^><\^>/.test(sv), sv);
  await hc('[data-find-cancel]');
  // reload -> listed -> choose -> advanced restored -> same rows
  await pg.reload({ waitUntil: 'networkidle' }); await login(); await openWin();
  from = logs.length; await hc('#idmp-toolbar [data-tb="find"]'); await pg.waitForSelector('#idmp-find-ov'); await pg.waitForTimeout(800);
  const listed = await pg.$$eval('#idmp-find-queries option', o => o.map(x => x.value));
  ok('F6', 'after a page reload the saved query is listed (MUserQuery.get)', listed.includes(QNAME), JSON.stringify(listed));
  await pg.fill('[data-find-query]', QNAME); await pg.dispatchEvent('[data-find-query]', 'input'); await pg.waitForTimeout(400);
  const advShown = await pg.$eval('[data-find-panel="advanced"]', e => e.style.display !== 'none');
  const r1 = await pg.evaluate(() => { const r = document.querySelector('[data-find-row]'); return r ? { col: r.querySelector('[data-find-col]').value, op: r.querySelector('[data-find-op]').value, v: r.querySelector('[data-find-v]').value } : null; });
  ok('F7', 'choosing it loads the Advanced tab with its row (onSelectedQueryChanged + parseUserQuery)', advShown && r1 && r1.col === 'DocStatus' && r1.op === '=' && r1.v === 'CO', JSON.stringify(r1));
  from = logs.length; await hc('[data-find-ok]'); await pg.waitForTimeout(1200);
  const j3 = await judge(from, "C_Order.DocStatus='CO'", 'saved');
  ok('F8', 'running the saved query gives its rows', j3.where && j3.shown === Math.min(j3.n, 200) && j3.bad === 0 && j3.shown > 0, JSON.stringify(j3));
  // delete
  await hc('#idmp-toolbar [data-tb="find"]'); await pg.waitForSelector('#idmp-find-ov'); await pg.waitForTimeout(600);
  await pg.fill('[data-find-query]', QNAME); await pg.dispatchEvent('[data-find-query]', 'input'); await pg.waitForTimeout(300);
  from = logs.length; await hc('[data-find-delete]'); await pg.waitForTimeout(1200);
  const listed2 = await pg.$$eval('#idmp-find-queries option', o => o.map(x => x.value));
  const dl = logs.slice(from).find(l => /§UDP3-FIND delete/.test(l));
  ok('F9', 'Delete removes the saved query', !!dl && /committed=true/.test(dl) && !listed2.includes(QNAME), dl + ' list=' + JSON.stringify(listed2));
  // reset -> unfiltered again
  await hc('[data-find-reset]'); await hc('[data-find-cancel]'); from = logs.length; await hc('#idmp-toolbar [data-tb="refresh"], #idmp-toolbar button[title^="Refresh"]'); await pg.waitForTimeout(1000);
  const w10 = lastRead(from), n10 = w10 ? (await seed('SELECT count(*) FROM C_Order WHERE ' + w10))[0][0] : null;
  ok('F10', 'Reset removes the query: the grid is back to the tab\'s own rows (history included after a Find, doOnFind :2662)', rowsLine(from) === Math.min(n10, 200) && !/UPPER|DocStatus='CO'|Processed='N'/.test(w10 || ''), 'rows=' + rowsLine(from) + ' whereCount=' + n10 + ' initial=' + before + ' where=' + w10);
  const real = errs.filter(e => !/ResizeObserver/.test(e));
  ok('F11', 'no page errors', real.length === 0, real.slice(0, 3).join(' | '));
  logs.filter(l => /§UDP3-FIND/.test(l)).forEach(l => console.log('  log| ' + l.slice(0, 300)));
  console.log('§UDP3L-VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§UDP3L-VERDICT INCONCLUSIVE ' + (e.stack || e)); process.exit(2); });
