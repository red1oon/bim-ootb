// ⚠ DO NOT REMOVE — W-FRIENDLY-OPS (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §15). READ THE LOG after every run: the §FOPS lines carry the evidence, exit code is not.
// THE ISSUE it proves/disproves, in a REAL browser through the page's own buttons: the opt-in friendly-ops lens (plugins/friendly_ops.mjs) shortens the Manufacturing Order
//   flow (Save & Complete in one gesture; Order Receipt & Issue opened from the order with the order already chosen) WITHOUT changing the model/doc event sequence
//   (§EVENT_SEQ) or the result, and WITHOUT changing the twin while it is not installed.
//   F1 lens absent -> no #idmp-lensbar (twin L&F unchanged)      F2 Save+Complete: plain == lens, event for event, both orders CO
//   F3 backflush: plain (menu, pick order, Process) == lens (record button, Process), event for event, same collectors
//   F4 gestures lens < plain, counted here                         F5 FOPS_BREAK=skipsave (lens completes WITHOUT saving) must go RED
//   A compare over an empty sequence prints INCONCLUSIVE, never PASS.
// Run: [FOPS_BREAK=skipsave] node erp/tests/witness_friendly_ops.js > <log>
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const REPO = process.env.REPO || path.join(__dirname, '..', '..'), BREAK = process.env.FOPS_BREAK || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); const fp = path.join(REPO, p);
  fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); }); });
let fails = 0, judged = 0;
const verdict = (id, claim, cond, info, inconclusive) => { if (inconclusive) { console.log('§FOPS ' + id + ' INCONCLUSIVE ' + claim + ' ' + JSON.stringify(info)); fails++; return; }
  judged++; if (!cond) fails++; console.log('§FOPS ' + id + ' ' + (cond ? 'PASS' : 'FAIL') + ' ' + claim + (cond ? '' : ' ' + JSON.stringify(info))); };
(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port, base = 'http://localhost:' + port + '/erp';
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 810 } })).newPage();
  const PAGELOG = []; page.on('console', m => PAGELOG.push(m.text())); page.on('pageerror', e => PAGELOG.push('PAGEERR ' + e)); page.on('dialog', async d => { PAGELOG.push('DIALOG ' + d.message()); await d.accept(); });
  const hold = (ms) => page.waitForTimeout(ms);
  const tip = (q) => page.evaluate(x => window.__crud.withModelTrx(f => f(x)), q);
  // gesture tally (same unit as the Odoo recorder and the film): every user click, select and typed field the measured paths make
  let G = { click: 0, select: 0, type: 0 }; const gReset = () => { const o = G; G = { click: 0, select: 0, type: 0 }; return o; };
  const click = async (sel, counted) => { await page.locator(sel).first().click(); if (counted !== false) G.click++; await hold(250); };
  const select = async (sel, val, counted) => { await page.selectOption(sel, val); if (counted !== false) G.select++; await hold(250); };
  const type = async (sel, text, counted) => { await page.fill(sel, text); await page.locator(sel).first().dispatchEvent('change'); if (counted !== false) G.type++; await hold(150); };
  const seqSince = (n) => PAGELOG.slice(n).map(l => /^§EVENT_SEQ n=\d+ table=(\S+) event=(\S+)/.exec(l)).filter(Boolean).map(m => m[2] + '@' + m[1]);
  async function openMenuById(menuId, counted) {
    const chain = await page.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); if (!leaf) return null; const out = []; let n = leaf.parentElement.parentElement;
      while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, menuId);
    if (!chain) throw new Error('menu id not in tree: ' + menuId);
    for (const id of chain) { const open = await page.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id); if (!open) await click('#idmp-tree .idmp-row[data-menu-id="' + id + '"]', counted); }
    await click('#idmp-tree .idmp-row.leaf[data-menu-id="' + menuId + '"]', counted); await hold(1200);
  }
  const NEWB = '#idmp-toolbar [data-tb="new"]', SAVEB = '#idmp-toolbar [title^="Save"]', F = (c, t) => '#idmp-inline-mount ' + (t || 'input') + '[data-col="' + c + '"]';
  const optBy = async (col, re) => { const o = (await page.$$eval('#idmp-inline-mount select[data-col="' + col + '"] option', os => os.map(x => ({ v: x.value, t: x.text })))).find(x => x.v && re.test(x.t)); if (!o) throw new Error('no option ' + col + ' ' + re); return o.v; };
  const nOrders = async () => (await tip('SELECT COUNT(*) AS n FROM pp_order'))[0].n;
  const lastOrder = async () => (await tip('SELECT pp_order_id AS id, documentno, docstatus FROM pp_order WHERE pp_order_id<0 ORDER BY pp_order_id ASC LIMIT 1'))[0];
  // the order header, typed identically for both paths; NOT counted (both paths type the same fields; the measured part starts at Save)
  async function fillOrder() {
    await click(NEWB, false); await page.waitForSelector('#idmp-inline-mount .cfrow', { timeout: 10000 }); await hold(600);
    await select(F('c_doctypetarget_id', 'select'), await optBy('c_doctypetarget_id', /^Manufacturing Order/), false);
    await select(F('ad_org_id', 'select'), await optBy('ad_org_id', /^Fertilizer \(/), false);
    await select(F('m_warehouse_id', 'select'), await optBy('m_warehouse_id', /^Fertilizer \(/), false);
    await select(F('s_resource_id', 'select'), await optBy('s_resource_id', /Fertilizer Plant/), false);
    await select(F('m_product_id', 'select'), await optBy('m_product_id', /Fertilizer #70/), false); await hold(800);
    await select(F('priorityrule', 'select'), await optBy('priorityrule', /Medium/), false); await type(F('qtyentered'), '100', false);
    await type(F('datestartschedule'), '2008-08-16', false); await type(F('datepromised'), '2008-08-17', false); await type(F('datefinishschedule'), '2008-08-17', false); await hold(400);
  }
  const waitStatus = async (want) => { let o; for (let i = 0; i < 60; i++) { o = await lastOrder(); if (o && o.docstatus === want) return o; await hold(200); } return o; };
  const collectors = async (ordId) => (await tip('SELECT costcollectortype AS t, m_product_id AS p, movementqty AS q, docstatus AS s FROM pp_cost_collector WHERE pp_order_id=' + ordId + ' ORDER BY pp_cost_collector_id DESC')).map(r => [r.t, r.p, Number(r.q), r.s]).sort();
  const stock = async () => (await tip('SELECT m_product_id AS p, SUM(qtyonhand) AS q FROM m_storageonhand WHERE m_product_id IN (50007,50008,50014) GROUP BY m_product_id ORDER BY 1')).map(r => [r.p, Number(r.q)]);
  const delta = (a, b) => { const m = {}; a.forEach(([p, q]) => { m[p] = -q; }); b.forEach(([p, q]) => { m[p] = (m[p] || 0) + q; }); return Object.keys(m).sort().map(p => [Number(p), +m[p].toFixed(6)]); };
  try {
    await page.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    for (const dbn of ['erp_cache', 'fold_plugins']) await page.evaluate(n => new Promise(r => { const q = indexedDB.deleteDatabase(n); q.onsuccess = q.onerror = q.onblocked = () => r(); }), dbn);
    await page.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__idmpDb && !!window.PluginEngine && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 30000 });
    // setup, NOT measured: Libero installed + started (as the film's b1), login, the film's off-camera prerequisite (with ample on-hand so both runs issue from one storage row)
    await page.evaluate(async (u) => { const r = window.PluginEngine._reg(); await r.installBundle(u); await r.startBundle('org.idempiere.mfg'); }, base + '/plugins/libero_manufacturing.mjs');
    await click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))", false); await page.waitForSelector('#idmp-login-step1:visible');
    await click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))", false); await page.waitForSelector('#idmp-login-step2:visible');
    await click('#idmp-login-ok', false); await page.waitForSelector('#idmp-home', { timeout: 20000 }).catch(() => {}); await hold(1500);
    await page.evaluate(() => { const db = window.__idmpDb, run = (s) => db.run(s);
      const cats = db.exec('SELECT DISTINCT m_product_category_id FROM m_product WHERE m_product_id IN (50007,50008,50014)')[0].values.map(r => r[0]);
      cats.forEach(c => run("UPDATE m_product_category_acct SET costingmethod='S' WHERE m_product_category_id=" + c));
      run('UPDATE m_cost SET currentcostprice=2.5 WHERE m_product_id=50008 AND m_costelement_id=100 AND c_acctschema_id=101 AND m_costtype_id=100 AND ad_org_id=0');
      run('UPDATE m_cost SET currentcostprice=0.4 WHERE m_product_id=50014 AND m_costelement_id=100 AND c_acctschema_id=101 AND m_costtype_id=100 AND ad_org_id=0');
      run('DELETE FROM m_storageonhand WHERE m_product_id IN (50007,50008,50014)');
      run("INSERT INTO m_storageonhand (ad_client_id, ad_org_id, isactive, m_locator_id, m_product_id, m_attributesetinstance_id, qtyonhand, datematerialpolicy, m_storageonhand_uu) VALUES (11,50006,'Y',50001,50008,0,100000,'2026-01-01 00:00:00','fops-kg'),(11,50006,'Y',50001,50014,0,5000,'2026-01-01 00:00:00','fops-bag')"); });
    await page.evaluate(() => { window.__eventSeq = true; });
    await openMenuById(53055, false); await page.waitForSelector(NEWB, { timeout: 20000 });

    // ═══ PLAIN path (no lens) ═══
    await fillOrder();
    const f1 = await page.evaluate(() => !!document.getElementById('idmp-lensbar'));
    await page.evaluate(() => { const b = document.querySelector('#idmp-toolbar [data-tb="refresh"]'); });
    const nP0 = PAGELOG.length, c0 = await nOrders(); gReset();
    await click(SAVEB); for (let i = 0; i < 60 && (await nOrders()) === c0; i++) await hold(200); await hold(1500);
    if (!(await page.locator('#idmp-inline-mount [data-col]').count())) await click('#idmp-toolbar [data-tb="toggle"]');
    await hold(600); await click('[data-doc-action="CO"]'); const oP = await waitStatus('CO'); await hold(1500);
    const gPc = gReset(), seqPc = seqSince(nP0);
    const f1b = await page.evaluate(() => !!document.getElementById('idmp-lensbar'));
    verdict('F1', 'lens not installed: no lens bar while editing a new order and on the saved order (the toolbar is the twin\'s)', !f1 && !f1b, { whileEditing: f1, onSaved: f1b });
    const sP0 = await stock(), nP1 = PAGELOG.length;
    await openMenuById(53059); await page.waitForSelector('[data-gform]', { timeout: 20000 }); await hold(800);
    const lbl = await page.$$eval('[data-gform-param=PP_Order_ID] option', (os, d) => (os.find(o => o.textContent.startsWith(d + ' ')) || {}).textContent, oP.documentno);
    await select('[data-gform-param=PP_Order_ID]', { label: lbl }); await hold(800);
    await click('[data-gform-run]'); for (let i = 0; i < 80 && !(await page.$eval('[data-gform-msg]', e => e.textContent).catch(() => '')); i++) await hold(250); await hold(1500);
    const gPb = gReset(), seqPb = seqSince(nP1), colP = await collectors(oP.id), dP = delta(sP0, await stock());
    console.log('§FOPS plain order=' + JSON.stringify(oP) + ' saveComplete.gestures=' + JSON.stringify(gPc) + ' events=' + seqPc.length + ' backflush.gestures=' + JSON.stringify(gPb) + ' events=' + seqPb.length + ' collectors=' + JSON.stringify(colP) + ' stockDelta=' + JSON.stringify(dP));

    // ═══ LENS path: install the lens bundle (setup, not measured), back to the window ═══
    await page.evaluate(async (a) => { if (a.brk) globalThis.__FOPS_BREAK = a.brk; const r = window.PluginEngine._reg(); await r.installBundle(a.u); await r.startBundle('org.kernel.friendly-ops'); }, { u: base + '/plugins/friendly_ops.mjs', brk: BREAK });
    console.log('§FOPS lens installed: ' + JSON.stringify(await page.evaluate(() => ({ lenses: window.AdLens.describe(), state: window.PluginEngine._reg().get('org.kernel.friendly-ops').state }))));
    await openMenuById(53055, false); await page.waitForSelector(NEWB, { timeout: 20000 });
    await fillOrder();
    const lensBtns = await page.$$eval('[data-lens-action]', e => e.map(x => x.getAttribute('data-lens-action')));
    console.log('§FOPS lens bar while editing: ' + JSON.stringify(lensBtns));
    const nL0 = PAGELOG.length; gReset();
    if (lensBtns.indexOf('friendly-ops:save-complete') >= 0) { await click('[data-lens-action="friendly-ops:save-complete"]'); }
    const oL = await waitStatus('CO'); await hold(1500);
    const gLc = gReset(), seqLc = seqSince(nL0);
    const lensBtns2 = await page.$$eval('[data-lens-action]', e => e.map(x => x.getAttribute('data-lens-action')));
    console.log('§FOPS lens bar on the completed order: ' + JSON.stringify(lensBtns2));
    const sL0 = await stock(), nL1 = PAGELOG.length; const fb = lensBtns2.find(a => /^friendly-ops:form:/.test(a));
    let preset = null;
    if (fb) { await click('[data-lens-action="' + fb + '"]'); await page.waitForSelector('[data-gform]', { timeout: 20000 }); await hold(800);
      preset = await page.$eval('[data-gform-param=PP_Order_ID]', s => (s.options[s.selectedIndex] || {}).textContent);
      await click('[data-gform-run]'); for (let i = 0; i < 80 && !(await page.$eval('[data-gform-msg]', e => e.textContent).catch(() => '')); i++) await hold(250); await hold(1500); }
    const gLb = gReset(), seqLb = seqSince(nL1), colL = oL ? await collectors(oL.id) : [], dL = delta(sL0, await stock());
    console.log('§FOPS lens order=' + JSON.stringify(oL) + ' saveComplete.gestures=' + JSON.stringify(gLc) + ' events=' + seqLc.length + ' formPreset=' + JSON.stringify(preset) + ' backflush.gestures=' + JSON.stringify(gLb) + ' events=' + seqLb.length + ' collectors=' + JSON.stringify(colL) + ' stockDelta=' + JSON.stringify(dL));

    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const firstDiff = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return { at: i, plain: a.slice(Math.max(0, i - 2), i + 3), lens: b.slice(Math.max(0, i - 2), i + 3) }; return null; };
    verdict('F2', 'Save & Complete: the lens fires the same ' + seqPc.length + ' model/doc events in the same order as Save then Complete, and both orders end CO', same(seqPc, seqLc) && oP && oP.docstatus === 'CO' && oL && oL.docstatus === 'CO' && oL.id !== oP.id,
      { plainN: seqPc.length, lensN: seqLc.length, diff: firstDiff(seqPc, seqLc), oP, oL }, !seqPc.length || !seqLc.length);
    verdict('F3', 'Order Receipt & Issue opened from the order: same ' + seqPb.length + ' events in order as the menu path, the order is pre-chosen, same collectors and stock deltas', same(seqPb, seqLb) && same(colP.map(c => c.slice(0, 1).concat(c.slice(2))), colL.map(c => c.slice(0, 1).concat(c.slice(2)))) && same(dP, dL) && !!preset && oL && preset.startsWith(oL.documentno + ' '),
      { plainN: seqPb.length, lensN: seqLb.length, diff: firstDiff(seqPb, seqLb), colP, colL, dP, dL, preset }, !seqPb.length || !seqLb.length);
    const tot = (g) => g.click + g.select + g.type, plainG = tot(gPc) + tot(gPb), lensG = tot(gLc) + tot(gLb);
    verdict('F4', 'gestures from a filled order to backflushed: plain ' + plainG + ' (save+complete ' + tot(gPc) + ', backflush ' + tot(gPb) + ') > lens ' + lensG + ' (' + tot(gLc) + ' + ' + tot(gLb) + ')', lensG < plainG && lensG > 0, { gPc, gPb, gLc, gLb });
    const errs = PAGELOG.filter(l => /^PAGEERR/.test(l)); verdict('F0', 'no page errors', !errs.length, errs.slice(0, 3));
  } catch (e) { fails++; console.log('§FOPS ERROR ' + (e && e.stack || e)); }
  fs.writeFileSync(path.join(require('os').tmpdir(), 'witness_friendly_ops.page.log'), PAGELOG.join('\n'));
  console.log('§FOPS_VERDICT ' + (fails ? 'RED' : 'GREEN') + ' judged=' + judged + ' failed=' + fails + (BREAK ? ' break=' + BREAK : '') + ' pagelog=' + path.join(require('os').tmpdir(), 'witness_friendly_ops.page.log'));
  await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})();
