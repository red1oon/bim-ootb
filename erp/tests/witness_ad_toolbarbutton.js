// ⚠ DO NOT REMOVE — W-AD-TBB (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §18). READ THE LOG after every run: the §TBB lines carry the evidence, exit code is not.
// THE ISSUE it proves/disproves: legacy attaches processes and forms to a window tab with AD_ToolBarButton rows (MToolBarButton.getProcessButtonOfTab + MRole.getProcessAccess,
//   ADTabpanel.loadToolbarButtons; a process with AD_Form_ID opens the form, AbstractADWindowContent.executeButtonProcess0). The twin had no such table, so every legacy button was missing.
//   T1 dictionary: the twin's ad_toolbarbutton rows == the pilot's (count; per row tab/process/component/seq/action)            X of N
//   T2 per tab: the process buttons the twin draws for GardenAdmin == the pilot's rows for that tab whose process the role can run   (tabs judged = those in the role's menu)
//   T3 the Libero bundle's rows (process 1000100 -> AD_Form 53007, button on tab 53054): the Manufacturing Order shows "Order Receipt & Issue"; a click opens AD_Form 53007
//      with the order choice EMPTY (Libero's WOrderReceiptIssue never reads its ProcessInfo), the form knows the window record it came from; Process with the order picked = 3 collectors CO
//   T4 bundle stopped -> its process, button and access rows are gone and the tab shows no button
//   Breaks: TBB_BREAK=noform (the AD_Form branch skipped) must turn T3 RED; TBB_BREAK=noaccess (role access ignored) must turn T2 RED where a hidden-by-access button exists.
//   A comparison over nothing prints INCONCLUSIVE.
// Run: [TBB_BREAK=noform|noaccess] node erp/tests/witness_ad_toolbarbutton.js > <log>
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const REPO = process.env.REPO || path.join(__dirname, '..', '..'), BREAK = process.env.TBB_BREAK || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.sql': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); const fp = path.join(REPO, p);
  fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); }); });
const pg = (sql) => execFileSync('docker', ['exec', '-i', 'postgres', 'psql', '-U', 'postgres', '-d', process.env.PG_DB || 'idempiere_pilot', '-tA', '-F', '|', '-c', 'set search_path=adempiere;' + sql], { encoding: 'utf8' }).split('\n').filter(l => l && l !== 'SET');
let fails = 0, judged = 0;
const verdict = (id, claim, cond, info, inconclusive) => { if (inconclusive) { fails++; console.log('§TBB ' + id + ' INCONCLUSIVE ' + claim + ' ' + JSON.stringify(info)); return; }
  judged++; if (!cond) fails++; console.log('§TBB ' + id + ' ' + (cond ? 'PASS' : 'FAIL') + ' ' + claim + (cond ? '' : ' ' + JSON.stringify(info))); };
(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/erp';
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 810 } })).newPage();
  const PAGELOG = []; page.on('console', m => PAGELOG.push(m.text())); page.on('pageerror', e => PAGELOG.push('PAGEERR ' + e)); page.on('dialog', async d => { PAGELOG.push('DIALOG ' + d.message()); await d.accept(); });
  const hold = (ms) => page.waitForTimeout(ms);
  const q = (sql) => page.evaluate(s => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; }, sql);
  const tip = (sql) => page.evaluate(x => window.__crud.withModelTrx(f => f(x)), sql);
  try {
    await page.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    for (const n of ['erp_cache', 'fold_plugins']) await page.evaluate(x => new Promise(r => { const d = indexedDB.deleteDatabase(x); d.onsuccess = d.onerror = d.onblocked = () => r(); }), n);
    await page.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__idmpDb && !!window.PluginEngine && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 30000 });
    if (BREAK) await page.evaluate(b => { window.__tbbBreak = b; }, BREAK);
    // T1 dictionary rows == the pilot (before any bundle adds its own)
    const LCOLS = 'ad_toolbarbutton_id, ad_tab_id, ad_process_id, componentname, coalesce(seqno,0), action, isactive';
    const legacy = pg('select ' + LCOLS + ' from ad_toolbarbutton order by 1');
    const twin = (await q('SELECT ' + LCOLS.replace('coalesce(seqno,0)', 'COALESCE(seqno,0)') + ' FROM ad_toolbarbutton ORDER BY 1').catch(() => [])).map(r => r.map(v => v == null ? '' : String(v)).join('|'));
    const lSet = new Set(legacy), tSet = new Set(twin), onlyL = legacy.filter(x => !tSet.has(x)), onlyT = twin.filter(x => !lSet.has(x));
    console.log('§TBB dictionary legacy=' + legacy.length + ' twin=' + twin.length + ' onlyLegacy=' + onlyL.length + ' onlyTwin=' + onlyT.length);
    verdict('T1', 'AD_ToolBarButton: ' + twin.length + ' of ' + legacy.length + ' legacy rows, row for row', legacy.length > 0 && !onlyL.length && !onlyT.length, { onlyL: onlyL.slice(0, 5), onlyT: onlyT.slice(0, 5) }, !legacy.length);
    // setup: Libero installed + started, GardenAdmin logged in
    await page.evaluate(async (u) => { const r = window.PluginEngine._reg(); await r.installBundle(u); await r.startBundle('org.idempiere.mfg'); }, base + '/plugins/libero_manufacturing.mjs');
    await page.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await page.waitForSelector('#idmp-login-step1:visible');
    await page.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await page.waitForSelector('#idmp-login-step2:visible');
    await page.click('#idmp-login-ok'); await page.waitForSelector('#idmp-home', { timeout: 20000 }).catch(() => {}); await hold(1500);
    const role = await page.evaluate(() => window.APP && window.APP.roleId);
    // the films' off-camera prerequisite, scoped to seed order 50000's product and components: Standard costing (the Libero cost port refuses Average: 'Costing method not supported - A', a named limit)
    console.log('§TBB prerequisite ' + JSON.stringify(await page.evaluate(() => { const db = window.__idmpDb;
      const prods = db.exec('SELECT m_product_id FROM pp_order WHERE pp_order_id=50000 UNION SELECT m_product_id FROM pp_order_bomline WHERE pp_order_id=50000')[0].values.map(r => r[0]);
      const cats = db.exec('SELECT DISTINCT m_product_category_id FROM m_product WHERE m_product_id IN (' + prods.join(',') + ')')[0].values.map(r => r[0]);
      cats.forEach(c => db.run("UPDATE m_product_category_acct SET costingmethod='S' WHERE m_product_category_id=" + c)); return { prods, cats }; })));
    // T2 every legacy tab with process buttons, as GardenAdmin
    const tabs = pg("select t.ad_tab_id, w.name, tb.tablename, t.tablevel from ad_tab t join ad_window w on w.ad_window_id=t.ad_window_id join ad_table tb on tb.ad_table_id=t.ad_table_id where t.ad_tab_id in (select ad_tab_id from ad_toolbarbutton where action='W' and ad_process_id is not null and isactive='Y') order by 1").map(l => { const [id, win, table, lvl] = l.split('|'); return { id: Number(id), win, table, lvl: Number(lvl) }; });
    const roleProcs = new Set(pg('select ad_process_id from ad_process_access where isactive=\'Y\' and ad_role_id=' + Number(role)));
    let t2judged = 0, t2bad = [], t2skip = [], hiddenByAccess = 0;
    for (const t of tabs) {
      const want = pg("select b.componentname, b.ad_process_id from ad_toolbarbutton b join ad_process p on p.ad_process_id=b.ad_process_id and p.isactive='Y' where b.ad_tab_id=" + t.id + " and b.action='W' and b.ad_process_id is not null and b.isactive='Y' order by case when coalesce(b.seqno,0)=0 then b.ad_toolbarbutton_id else b.seqno end")
        .map(l => l.split('|')).filter(([, pid]) => { const ok = roleProcs.has(pid); if (!ok) hiddenByAccess++; return ok; }).map(([c]) => c);
      const n0 = PAGELOG.length;
      const opened = await page.evaluate(({ win, table }) => { const before = document.getElementById('idmp-status') ? document.getElementById('idmp-status').textContent : ''; window.IdmpHost.focus('tbb', { window: win, table: table }); return before; }, t);
      await hold(1800);
      const onTab = await page.evaluate(tn => { const a = document.querySelector('#idmp-tabstrip .idmp-adtab.active'); return a ? a.getAttribute('title') || a.textContent : null; }, t.table);
      const notInMenu = PAGELOG.slice(n0).some(l => /not in this menu/.test(l)) || await page.evaluate(() => /not in this menu/.test((document.getElementById('idmp-status') || {}).textContent || ''));
      if (notInMenu || !onTab || onTab.indexOf(t.table) < 0) { t2skip.push(t.win + '/' + t.table + (notInMenu ? ' (not in the role\'s menu)' : ' (tab not reached: ' + onTab + ')')); continue; }
      const got = await page.$$eval('#idmp-toolbar [data-tbb]', e => e.map(x => x.getAttribute('data-tbb')));
      t2judged++; if (JSON.stringify(got) !== JSON.stringify(want)) t2bad.push({ tab: t.id, win: t.win, table: t.table, got, want });
      console.log('§TBB tab ' + t.id + ' ' + t.win + '/' + t.table + ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));
    }
    console.log('§TBB T2 tabs=' + tabs.length + ' judged=' + t2judged + ' skipped=' + t2skip.length + ' ' + JSON.stringify(t2skip) + ' hiddenByAccessInLegacy=' + hiddenByAccess);
    verdict('T2', 'process buttons per tab: ' + (t2judged - t2bad.length) + ' of ' + t2judged + ' reachable tabs equal legacy for role ' + role + ' (' + t2skip.length + ' tabs outside the role\'s menu)', t2judged > 0 && !t2bad.length, { t2bad }, !t2judged);
    // T3 the Libero rows on the Manufacturing Order
    await page.evaluate(() => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="53055"]'); let n = leaf.parentElement; while (n && n.id !== 'idmp-tree') { if (n.classList && n.classList.contains('idmp-node')) n.classList.add('open'); n = n.parentElement; } leaf.click(); });
    await page.waitForSelector('#idmp-toolbar [data-tb="new"]', { timeout: 20000 }); await hold(1500);
    const dictRows = { process: await q('SELECT ad_form_id, name FROM ad_process WHERE ad_process_id=1000100'), button: await q('SELECT ad_tab_id, ad_process_id FROM ad_toolbarbutton WHERE ad_toolbarbutton_id=1000100'), access: await q('SELECT ad_role_id FROM ad_process_access WHERE ad_process_id=1000100') };
    const btn = await page.$$eval('#idmp-toolbar [data-tbb]', e => e.map(x => x.getAttribute('data-tbb') + '=' + x.textContent));
    console.log('§TBB libero rows ' + JSON.stringify(dictRows) + ' toolbar=' + JSON.stringify(btn));
    let formState = null, coll = null, menuState = null;
    if (btn.some(b => /^PP_Order_ReceiptIssue=/.test(b))) {
      // the form lists completed orders with open quantity: complete the record on screen first, through its own Complete button (the DocAction bar)
      if (!(await page.locator('#idmp-inline-mount [data-col], [data-doc-action]').count())) { await page.click('#idmp-toolbar [data-tb="toggle"]'); await hold(800); }
      const recNo = await page.evaluate(() => (document.querySelector('[data-doc-action="CO"]') ? 'CO-legal' : 'no-CO'));
      if (recNo === 'CO-legal') { await page.click('[data-doc-action="CO"]'); await hold(4000); }
      console.log('§TBB record completed first: ' + recNo + ' ' + (PAGELOG.filter(l => /§AD-DOCFSM-LIVE .*clicked=CO/.test(l)).pop() || ''));
      // the menu path's opening state, for comparison (Libero's form opens the same either way)
      await page.evaluate(() => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="53059"]'); let n = leaf.parentElement; while (n && n.id !== 'idmp-tree') { if (n.classList && n.classList.contains('idmp-node')) n.classList.add('open'); n = n.parentElement; } leaf.click(); });
      await page.waitForSelector('[data-gform]', { timeout: 10000 }).catch(() => {}); await hold(1000);
      menuState = await page.evaluate(() => { const f = document.querySelector('[data-gform]'); if (!f) return null; const s = f.querySelector('[data-gform-param=PP_Order_ID]'); return { cls: f.getAttribute('data-gform'), order: s && s.selectedIndex >= 0 ? s.options[s.selectedIndex].textContent : '', choices: s ? s.options.length : 0, rows: document.querySelectorAll('tr[data-gform-row]').length }; });
      console.log('§TBB form from the MENU: ' + JSON.stringify(menuState));
      await page.evaluate(() => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="53055"]'); leaf.click(); }); await page.waitForSelector('#idmp-toolbar [data-tbb]', { timeout: 20000 }); await hold(1200);
      const n3 = PAGELOG.length; await page.click('#idmp-toolbar [data-tbb="PP_Order_ReceiptIssue"]'); await page.waitForSelector('[data-gform]', { timeout: 10000 }).catch(() => {}); await hold(1200);
      formState = await page.evaluate(() => { const f = document.querySelector('[data-gform]'); if (!f) return null; const s = f.querySelector('[data-gform-param=PP_Order_ID]');
        return { cls: f.getAttribute('data-gform'), from: f.getAttribute('data-gform-from'), order: s ? (s.selectedIndex >= 0 ? (s.options[s.selectedIndex].textContent || '') : '') : 'absent', rows: document.querySelectorAll('tr[data-gform-row]').length }; });
      formState = formState || { cls: null, note: 'no generic form opened (a process dialog instead?)' };
      formState.log = PAGELOG.slice(n3).filter(l => /§AD-TBB|§AD-FORM-LIVE|§AD-FORM-GENERIC open/.test(l)).join(' || ').slice(0, 600);
      console.log('§TBB form from the button: ' + JSON.stringify(formState));
      // pick a draft order from the form's own list, Complete it first through the order? Use an order the seed holds in CO with open quantity, else note it.
      const opts = await page.$$eval('[data-gform-param=PP_Order_ID] option', os => os.map(o => ({ v: o.value, t: o.textContent })).filter(o => o.v));
      if (opts.length) { await page.selectOption('[data-gform-param=PP_Order_ID]', opts[0].v); await page.locator('[data-gform-param=PP_Order_ID]').dispatchEvent('change'); await hold(800);
        const nr = PAGELOG.length; await page.click('[data-gform-run]'); for (let i = 0; i < 60 && !(await page.$eval('[data-gform-msg]', e => e.textContent).catch(() => '')); i++) await hold(250); await hold(1200);
        coll = { order: opts[0].t, msg: await page.$eval('[data-gform-msg]', e => e.className + ' | ' + e.textContent).catch(() => ''), commit: PAGELOG.slice(nr).filter(l => /§AD-FORM-GENERIC commit/.test(l)).pop() || '' }; }
      console.log('§TBB process from the button form: ' + JSON.stringify(coll) + ' orderChoices=' + opts.length);
    }
    verdict('T3', 'the bundle\'s 3 dictionary rows exist, the Manufacturing Order shows "Order Receipt & Issue", the click opens AD_Form 53007 (org.eevolution.form.VOrderReceiptIssue) exactly as the menu opens it (the Libero form ignores the record it came from), handed the window record',
      dictRows.process.length === 1 && Number(dictRows.process[0][0]) === 53007 && dictRows.button.length === 1 && dictRows.access.length === 1 && btn.some(b => /^PP_Order_ReceiptIssue=Order Receipt & Issue$/.test(b)) &&
      !!formState && formState.cls === 'org.eevolution.form.VOrderReceiptIssue' && !!formState.from && /^PP_Order:/i.test(formState.from) && !!menuState && formState.order === menuState.order && formState.rows === menuState.rows,
      { dictRows, btn, formState, menuState });
    verdict('T3b', 'Process from that form commits its collectors (the same form run as the menu path)', !!coll && /committed=true/.test(coll.commit) && /ok/.test(coll.msg), { coll }, !coll);
    // T4 stop the bundle
    await page.evaluate(async () => { await window.PluginEngine._reg().stopBundle('org.idempiere.mfg'); }); await hold(800);
    const after = { process: await q('SELECT COUNT(*) FROM ad_process WHERE ad_process_id=1000100'), button: await q('SELECT COUNT(*) FROM ad_toolbarbutton WHERE ad_toolbarbutton_id=1000100'), access: await q('SELECT COUNT(*) FROM ad_process_access WHERE ad_process_id=1000100') };
    console.log('§TBB after stop ' + JSON.stringify(after));
    verdict('T4', 'bundle stopped: its process, button and access rows are gone', [after.process, after.button, after.access].every(r => Number(r[0][0]) === 0), { after });
    const errs = PAGELOG.filter(l => /^PAGEERR/.test(l)); verdict('T0', 'no page errors', !errs.length, errs.slice(0, 3));
  } catch (e) { fails++; console.log('§TBB ERROR ' + (e && e.stack || e)); }
  fs.writeFileSync(path.join(require('os').tmpdir(), 'witness_ad_toolbarbutton.page.log'), PAGELOG.join('\n'));
  console.log('§TBB_VERDICT ' + (fails ? 'RED' : 'GREEN') + ' judged=' + judged + ' failed=' + fails + (BREAK ? ' break=' + BREAK : ''));
  await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})();
