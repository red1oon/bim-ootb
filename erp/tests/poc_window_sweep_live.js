// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — Scope guard
// Scope: W-WINDOW-SWEEP (bim-compiler prompts/ERP_DEPTH_FILM.md §NC-4+; CLAUDE.md AD-LAYER LAW 2: "X of N AD windows pass", N from the dictionary). READ tests/poc_window_sweep_live.log.
// THE ISSUE it proves/disproves, PER WINDOW: opening the window from its menu leaf shows EVERY dictionary tab (names, order) and, per tab, the form carries EVERY displayed dictionary field
//   (AD_Field IsActive+IsDisplayed, not a Button, not *_UU, no DisplayLogic) - a field the dictionary shows but the form lacks is a generic-layer gap. Output: one
//   §SWEEP line per window + §SWEEP-SUMMARY windows_ok X of N, tabs_ok, fields missing. A tab that cannot be put into form view is INCONCLUSIVE, never ok.
// Run: SWEEP=117,125,138 node tests/poc_window_sweep_live.js | tee tests/poc_window_sweep_live.log   (no SWEEP => every active window with a menu leaf)  (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': s.size }); fs.createReadStream(f).pipe(r); }); });
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 810 } })).newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('http://localhost:' + srv.address().port + '/erp/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
  await pg.waitForFunction(() => !!window.__idmpDb, null, { timeout: 30000 });
  await pg.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0);
  await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
  await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('" + (process.env.SWEEP_USER || 'GardenAdmin') + "'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
  await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0);
  const seed = (sql) => pg.evaluate(s => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; }, sql);
  const hc = async (sel) => { const l = pg.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click({ timeout: 8000 }); await pg.waitForTimeout(250); };
  let wins = (await seed("SELECT w.AD_Window_ID, w.Name, MIN(m.AD_Menu_ID) FROM AD_Window w JOIN AD_Menu m ON m.AD_Window_ID=w.AD_Window_ID AND m.Action='W' AND m.IsActive='Y' WHERE w.IsActive='Y' GROUP BY w.AD_Window_ID, w.Name ORDER BY w.AD_Window_ID")).map(r => ({ id: r[0], name: r[1], menu: r[2] }));
  const totalActive = (await seed("SELECT COUNT(*) FROM AD_Window WHERE IsActive='Y'"))[0][0];
  if (process.env.SWEEP) { const want = process.env.SWEEP.split(',').map(Number); wins = wins.filter(w => want.includes(w.id)); }
  console.log('§SWEEP-N windows_active=' + totalActive + ' with_menu_leaf=' + wins.length + ' (sweeping ' + wins.length + ')');
  const tot = { trl: 0, ok: 0, tabsOk: 0, tabs: 0, inconcl: 0, missing: 0, noLeaf: 0, fields: 0 };
  for (const w of wins) {
    const t0 = Date.now(); let line;
    try {
      const reach = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); return !!leaf; }, w.menu);
      if (reach && process.env.TREE_ONLY) { console.log('§SWEEP win=' + w.id + ' "' + w.name + '" LEAF'); continue; }
      if (!reach) { tot.noLeaf++; console.log('§SWEEP win=' + w.id + ' "' + w.name + '" NOLEAF (menu ' + w.menu + ' not in this role\'s tree)'); continue; }
      const chain = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); const out = []; let n = leaf.parentElement.parentElement;
        while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, w.menu);
      for (const id of chain) { const open = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id);
        if (!open) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
      await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + w.menu + '"]'); await pg.waitForSelector('#idmp-tabstrip .idmp-adtab', { timeout: 10000 }); await pg.waitForTimeout(700);
      const dictTabs = (await seed("SELECT AD_Tab_ID, Name, IsTranslationTab FROM AD_Tab WHERE AD_Window_ID=" + w.id + " AND IsActive='Y' ORDER BY SeqNo")).map(r => ({ id: r[0], name: r[1], trl: r[2] === 'Y' }));
      const domTabs = await pg.$$eval('#idmp-tabstrip .idmp-adtab', e => e.map(x => x.textContent.trim()));
      const tabsOk = JSON.stringify(dictTabs.map(t => t.name)) === JSON.stringify(domTabs); tot.tabs += dictTabs.length;
      let missingAll = [], inc = 0, okTabs = 0, nf = 0, detail = [], trlNo = 0;
      for (let ti = 0; ti < dictTabs.length; ti++) {
        const t = dictTabs[ti];
        await pg.locator('#idmp-tabstrip .idmp-adtab').nth(ti).click().catch(() => {}); await pg.waitForTimeout(700);
        let form = await pg.locator('#idmp-inline-mount [data-col]').count();
        if (!form) { const tg = pg.locator('#idmp-toolbar [data-tb="toggle"]'); if (await tg.count()) { await tg.first().click().catch(() => {}); await pg.waitForTimeout(600); } form = await pg.locator('#idmp-inline-mount [data-col]').count(); }
        if (!form) { const nb = pg.locator('#idmp-toolbar [data-tb="new"]'); if (await nb.count() && await nb.first().isEnabled().catch(() => false)) { await nb.first().click().catch(() => {}); await pg.waitForTimeout(800); form = await pg.locator('#idmp-inline-mount [data-col]').count(); } }
        const want = (await seed("SELECT lower(c.ColumnName) FROM AD_Field f JOIN AD_Column c ON c.AD_Column_ID=f.AD_Column_ID WHERE f.AD_Tab_ID=" + t.id + " AND f.IsActive='Y' AND f.IsDisplayed='Y' AND c.AD_Reference_ID<>28 AND c.ColumnName NOT LIKE '%\\_UU' ESCAPE '\\' AND (f.DisplayLogic IS NULL OR f.DisplayLogic='')")).map(r => r[0]);
        if (!form) { if (t.trl) { trlNo++; detail.push(t.name + ':TRL-NOFORM'); } else { inc++; detail.push(t.name + ':NOFORM'); } continue; }
        const dom = new Set(await pg.$$eval('#idmp-inline-mount [data-col]', e => e.map(x => x.getAttribute('data-col').toLowerCase())));
        const miss = want.filter(x => !dom.has(x)); tot.fields += want.length; nf += want.length; tot.missing += miss.length;
        if (miss.length) { missingAll.push(t.name + '=' + miss.join('/')); detail.push(t.name + ':' + (want.length - miss.length) + '/' + want.length); } else okTabs++;
        // leave an unsaved New: Ignore
        const ig = pg.locator('#idmp-toolbar [title^="Ignore"]'); if (await ig.count() && await ig.first().isEnabled().catch(() => false)) await ig.first().click().catch(() => {});
      }
      tot.tabsOk += okTabs; tot.trl += trlNo; tot.inconcl += inc ? 1 : 0;
      const winOk = tabsOk && !missingAll.length && !inc; if (winOk) tot.ok++;
      console.log('§SWEEP win=' + w.id + ' "' + w.name + '" ' + (winOk ? 'OK' : (inc && !missingAll.length && tabsOk ? 'INCONCLUSIVE' : 'GAP')) + ' tabs_names=' + (tabsOk ? 'ok' : 'DIFF dict=' + JSON.stringify(dictTabs.map(t => t.name)) + ' dom=' + JSON.stringify(domTabs)) + ' tabs=' + dictTabs.length + ' formtabs_ok=' + okTabs + ' noform=' + inc + (trlNo ? ' trl_noform=' + trlNo : '') + (detail.filter(d => /NOFORM/.test(d)).length ? '[' + detail.filter(d => /NOFORM/.test(d)).join(',') + ']' : '') + ' fields_want=' + nf + (missingAll.length ? ' missing=[' + missingAll.join(' ; ') + ']' : '') + ' ms=' + (Date.now() - t0));
    } catch (e) { tot.inconcl++; console.log('§SWEEP win=' + w.id + ' "' + w.name + '" INCONCLUSIVE ' + String(e.message).split('\n')[0].slice(0, 120)); try { await pg.keyboard.press('Escape'); } catch (e2) {} }
  }
  console.log('§SWEEP-SUMMARY windows_ok ' + tot.ok + ' of ' + wins.length + ' (inconclusive_or_noform ' + tot.inconcl + ', translation-tabs-noform ' + tot.trl + ', noleaf ' + tot.noLeaf + ') · tabs form-complete ' + tot.tabsOk + ' of ' + tot.tabs + ' · dictionary fields missing ' + tot.missing + ' of ' + tot.fields + ' · pageerrors ' + errs.length);
  await browser.close(); srv.close(); process.exit(0);
})().catch(e => { console.log('§SWEEP CRASH ' + (e && e.stack || e)); process.exit(2); });
