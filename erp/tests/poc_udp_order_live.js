// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness W-UDP-ORDER-LIVE (bim-compiler prompts/ERP_DEPTH_FILM.md §UDP-ORDER). READ tests/poc_udp_order_live.log
//   before any conclusion — exit code is not evidence.
// THE ISSUE: does the grid list a window's rows in legacy's order - GridTab.getOrderByClause (Business Partner / Product: the Value
//   field's SortNo=1) under PostgreSQL's ORDER BY (the pilot DB's glibc en_US.utf8 collation, NULLs last) - and not in SQLite's byte order?
//   Judge: the grid's own row sequence (IdmpGridTab.snapshot, the rows the user sees) is non-decreasing under the legacy comparator
//   (AdGridTab.rowComparator + AdFind.collate, measured against the real GridTab by W-UDP-ORDER), and the SQLite ORDER BY alone gives a
//   different sequence on this data (so the check is not vacuous). RED on origin/main: the grid shows SQLite's order.
// Run: node tests/poc_udp_order_live.js 2>&1 | tee tests/poc_udp_order_live.log        (cwd = bim-ootb/erp)
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
  await pg.goto('http://localhost:' + srv.address().port + '/erp/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
  await pg.waitForFunction(() => !!window.__idmpDb, null, { timeout: 30000 });
  await pg.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0);
  await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
  await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
  await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0);
  const openWin = async (wid) => {
    const mid = (await seed("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=" + wid + " AND IsActive='Y'"))[0][0];
    const chain = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); const out = []; let n = leaf.parentElement.parentElement;
      while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, mid);
    for (const id of chain) { const open = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id);
      if (!open) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
    await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid + '"]'); await pg.waitForTimeout(1500);
    if (await pg.locator('#idmp-find-ov').count()) { await hc('[data-find-ok]'); await pg.waitForTimeout(1200); }   // a high-volume window opens on Find first (§UDP-4): OK = all rows
  };
  // the JUDGE's comparator: this branch's AdGridTab.rowComparator. When the page under test lacks it (origin/main, the RED run) it is loaded
  //   as window.AdGridTabJudge from JUDGE_GRIDTAB without touching the page's own AdGridTab.
  await pg.evaluate(() => { window.AdGridTabJudge = window.AdGridTab && window.AdGridTab.rowComparator ? window.AdGridTab : null; });
  if (!(await pg.evaluate(() => !!window.AdGridTabJudge)) && process.env.JUDGE_GRIDTAB) {
    await pg.evaluate(() => { window.__gtOrig = window.AdGridTab; });
    await pg.addScriptTag({ content: fs.readFileSync(process.env.JUDGE_GRIDTAB, 'utf8') });
    await pg.evaluate(() => { window.AdGridTabJudge = window.AdGridTab; window.AdGridTab = window.__gtOrig; });
  }
  for (const [wid, tn] of [[123, 'C_BPartner'], [140, 'M_Product']]) {
    const from = logs.length; await openWin(wid);
    const ordLine = logs.slice(from).filter(l => new RegExp('^§UDP-ORDER table=' + tn + ' ').test(l)).pop() || '';
    const res = await pg.evaluate(([tn]) => {
      const snap = window.IdmpGridTab.snapshot(), ids = snap.rows.map(r => String(r.pk));
      const ob = (/orderBy=(.*) applied=/.exec(window.__lastOrderLine || '') || [])[1];
      return { ids };
    }, [tn]);
    const ob = (/orderBy=(.*) applied=/.exec(ordLine) || [])[1] || '';
    const check = await pg.evaluate(([tn, ids, ob]) => {
      const kc = tn + '_ID', rows = {}; const r = window.__idmpDb.exec('SELECT * FROM ' + tn + ' WHERE ' + kc + ' IN (' + ids.join(',') + ')');
      if (r.length) r[0].values.forEach(v => { const o = {}; r[0].columns.forEach((c, i) => o[c] = v[i]); rows[String(o[kc] != null ? o[kc] : o[kc.toLowerCase()])] = o; });
      const rc = window.AdGridTabJudge.rowComparator(ob || (tn === 'C_BPartner' || tn === 'M_Product' ? 'Value' : ''), window.AdFind.collate); let inv = null;
      for (let i = 1; i < ids.length && rc.cmp; i++) if (rc.cmp(rows[ids[i - 1]], rows[ids[i]]) > 0) { inv = i; break; }
      const raw = window.__idmpDb.exec('SELECT ' + kc + ' FROM ' + tn + ' WHERE ' + kc + ' IN (' + ids.join(',') + ') ORDER BY ' + (ob || 'Value'));
      const rawIds = raw.length ? raw[0].values.map(v => String(v[0])) : [];
      return { inv, rawDiffers: rawIds.join() !== ids.join(), applied: !!rc.cmp, n: ids.length, first: ids.slice(0, 6).map(i => rows[i] && (rows[i].Value != null ? rows[i].Value : rows[i].value)), rawFirst: rawIds.slice(0, 6).map(i => rows[i] && (rows[i].Value != null ? rows[i].Value : rows[i].value)) };
    }, [tn, res.ids, ob]);
    ok('O-' + tn, tn + ': the grid is in legacy order (' + (ob || 'Value') + ' under the legacy collation) and SQLite\'s byte order would differ', check.applied && check.inv == null && check.rawDiffers && check.n > 1,
      ordLine + ' | rows=' + check.n + ' inversion=' + check.inv + ' grid=' + JSON.stringify(check.first) + ' sqlite=' + JSON.stringify(check.rawFirst));
  }
  const real = errs.filter(e => !/ResizeObserver/.test(e));
  ok('O-err', 'no page errors', real.length === 0, real.slice(0, 3).join(' | '));
  console.log('§UDPOL-VERDICT ' + (fail ? 'FAIL' : 'PASS') + ' ' + pass + '/' + (pass + fail));
  await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('§UDPOL-VERDICT INCONCLUSIVE ' + (e.stack || e)); process.exit(2); });
