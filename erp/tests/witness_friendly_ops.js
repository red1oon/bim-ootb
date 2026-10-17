// ⚠ DO NOT REMOVE — W-FRIENDLY-OPS (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §15). READ THE LOG after every run: the §FOPS lines carry the evidence, exit code is not.
// THE ISSUE it proves/disproves, in a REAL browser through the page's own buttons: the opt-in friendly-ops lens (plugins/friendly_ops.mjs) shortens the Manufacturing Order
//   flow (Save & Complete in one gesture; Order Receipt & Issue opened from the order with the order already chosen) WITHOUT changing the model/doc event sequence
//   (§EVENT_SEQ) or the result, and WITHOUT changing the twin while it is not installed.
//   RETIRED F2/F3/F4/F8 (see ERP_FRIENDLY_OPS_LENS.md §42). Kept: F1, F6, F7, F9 (F5 skipsave went with Save & Complete).
//   F1 lens absent -> no #idmp-lensbar (twin L&F unchanged)      F2 Save+Complete: plain == lens, event for event, both orders CO
//   F3 backflush: plain (menu, pick order, Process) == lens (record button, Process), event for event, same collectors
//   F4 gestures lens < plain, counted here                         F5 FOPS_BREAK=skipsave (lens completes WITHOUT saving) must go RED
//   F6 Preview (§16 FO-M1): the preview's ops == the model ops the following real Save writes   F7 the preview commits nothing (kernel_ops, pp_order, AD_Sequence unchanged)
//   F8 related counts (§16 FO-B): each lens "<window> (<n>)" button's n == the tip count; after the backflush the order shows its 3 cost collectors and opening them lists 3 rows
//   F9 a preview of an order Save refuses (start before the BOM is valid) shows Save's own refusal text and writes nothing
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
  const NEWB = '#idmp-toolbar [data-tb="new"]', SAVEB = '#idmp-toolbar [data-tb="save"]', F = (c, t) => '#idmp-inline-mount ' + (t || 'input') + '[data-col="' + c + '"]';
  const optBy = async (col, re) => { const o = (await page.$$eval('#idmp-inline-mount select[data-col="' + col + '"] option', os => os.map(x => ({ v: x.value, t: x.text })))).find(x => x.v && re.test(x.t)); if (!o) throw new Error('no option ' + col + ' ' + re); return o.v; };
  const nOrders = async () => (await tip('SELECT COUNT(*) AS n FROM pp_order'))[0].n;
  const lastOrder = async () => (await tip('SELECT pp_order_id AS id, documentno, docstatus FROM pp_order WHERE pp_order_id<0 ORDER BY pp_order_id ASC LIMIT 1'))[0];
  // the order header, typed identically for both paths; NOT counted (both paths type the same fields; the measured part starts at Save)
  async function fillOrder(o) { o = o || {};
    await click(NEWB, false); await page.waitForSelector('#idmp-inline-mount .cfrow', { timeout: 10000 }); await hold(600);
    await select(F('c_doctypetarget_id', 'select'), await optBy('c_doctypetarget_id', /^Manufacturing Order/), false);
    await select(F('ad_org_id', 'select'), await optBy('ad_org_id', /^Fertilizer \(/), false);
    await select(F('m_warehouse_id', 'select'), await optBy('m_warehouse_id', /^Fertilizer \(/), false);
    await select(F('s_resource_id', 'select'), await optBy('s_resource_id', /Fertilizer Plant/), false);
    await select(F('m_product_id', 'select'), await optBy('m_product_id', /Fertilizer #70/), false); await hold(800);
    await select(F('priorityrule', 'select'), await optBy('priorityrule', /Medium/), false); await type(F('qtyentered'), '100', false);
    await type(F('datestartschedule'), o.start || '2008-08-16', false); await type(F('datepromised'), '2008-08-17', false); await type(F('datefinishschedule'), '2008-08-17', false); await hold(400);
  }
  const waitStatus = async (want) => { let o; for (let i = 0; i < 60; i++) { o = await lastOrder(); if (o && o.docstatus === want) return o; await hold(200); } return o; };
  const collectors = async (ordId) => (await tip('SELECT costcollectortype AS t, m_product_id AS p, movementqty AS q, docstatus AS s FROM pp_cost_collector WHERE pp_order_id=' + ordId + ' ORDER BY pp_cost_collector_id DESC')).map(r => [r.t, r.p, Number(r.q), r.s]).sort();
  const stock = async () => (await tip('SELECT m_product_id AS p, SUM(qtyonhand) AS q FROM m_storageonhand WHERE m_product_id IN (50007,50008,50014) GROUP BY m_product_id ORDER BY 1')).map(r => [r.p, Number(r.q)]);
  const kmax = () => page.evaluate(() => { const k = window.__crud.kernelDb(); return k ? Number(k.exec('SELECT COALESCE(MAX(id),0) FROM kernel_ops')[0].values[0][0]) : null; });
  const kops = (after) => page.evaluate(a => { const k = window.__crud.kernelDb(); return ((k.exec('SELECT id, op_type, parameters FROM kernel_ops WHERE id>' + a + ' ORDER BY id')[0]) || { values: [] }).values.map(v => { const o = JSON.parse(v[2]); return { t: v[1], table: o.table, fields: o.fields || null, changes: o.changes || null }; }); }, after);
  const seqSum = async () => Number((await tip('SELECT SUM(currentnext) AS n FROM ad_sequence'))[0].n);
  // a write compared by meaning: synthetic ids (negative / op refs), uuids and wall-clock stamps differ between two runs by design
  const norm = (o) => { const f = o.fields || o.changes || {}; return o.table + '|' + Object.keys(f).filter(k => !/_uu$|^created|^updated/i.test(k)).sort().map(k => { let v = f[k]; if (v && typeof v === 'object') v = ('new' in v) ? v.new : '#id'; if (v && typeof v === 'object') v = '#id'; if (typeof v === 'number' && v < 0) v = '#id'; if (typeof v === 'string' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(v) && !/ 00:00:00$/.test(v)) v = '#now'; return k.toLowerCase() + '=' + v; }).join(','); };
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
    const k0 = await kmax(), q0 = await seqSum(), c00 = await nOrders(), nPv = PAGELOG.length;
    const pv = await page.evaluate(() => new Promise(r => window.__crud.previewInline(x => r(JSON.parse(JSON.stringify({ ok: x.ok, reason: x.reason, error: x.error, ops: x.ops || [] }))))));
    const k1 = await kmax(), q1 = await seqSum(), c01 = await nOrders();
    console.log('§FOPS preview (shipped seam, plain order): ' + (PAGELOG.slice(nPv).filter(l => /§SAVE-PREVIEW/.test(l)).pop() || 'NO §SAVE-PREVIEW LINE'));
    verdict('F7', 'Preview commits nothing: kernel_ops ' + k0 + '->' + k1 + ', pp_order ' + c00 + '->' + c01 + ', AD_Sequence sum ' + q0 + '->' + q1, pv.ok && k0 === k1 && c00 === c01 && q0 === q1, { pv: { ok: pv.ok, reason: pv.reason, error: pv.error }, k0, k1, c00, c01, q0, q1 });
    const nP0 = PAGELOG.length, c0 = await nOrders(); gReset();
    await click(SAVEB); for (let i = 0; i < 60 && (await nOrders()) === c0; i++) await hold(200); await hold(1500);
    const saved = (await kops(k1)).filter(o => /^CRUD_/.test(o.t) && o.table !== 'ad_recentitem'), savedModel = saved.slice(1, saved.length && saved[saved.length - 1].table === 'ad_sequence' && saved.filter(o => o.table === 'ad_sequence').length > pv.ops.filter(o => o.table === 'ad_sequence').length ? -1 : undefined);   // drop only the host's own DocumentNo bump (commitCrud appends it last; the preview stops before it) and the window's AD_RecentItem (written after the save, as legacy's window does, not part of the model save)
    const pN = pv.ops.map(norm), sN = savedModel.map(norm), pd = pN.findIndex((x, i) => x !== sN[i]);
    verdict('F6', 'Preview == Save: the ' + pN.length + ' rows the preview showed are the rows Save then wrote (tables ' + JSON.stringify(pv.ops.reduce((m, x) => { m[x.table] = (m[x.table] || 0) + 1; return m; }, {})) + ')', pN.length === sN.length && pd < 0,
      { previewN: pN.length, savedN: sN.length, firstDiff: pd < 0 ? null : { at: pd, preview: pN[pd], saved: sN[pd] }, savedTables: saved.map(o => o.table) }, !pN.length);
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
    let panel = null;
    if (lensBtns.indexOf('friendly-ops:preview') >= 0) { await click('[data-lens-action="friendly-ops:preview"]', false); await page.waitForSelector('[data-save-preview]', { timeout: 10000 }).catch(() => {});
      panel = await page.evaluate(() => { const b = document.querySelector('[data-save-preview]'); return b ? { state: b.getAttribute('data-save-preview'), tables: [...b.querySelectorAll('[data-preview-table]')].map(h => h.getAttribute('data-preview-table') + ':' + h.textContent), text: b.textContent.replace(/\s+/g, ' ').slice(0, 500) } : null; });
      console.log('§FOPS lens preview panel: ' + JSON.stringify(panel)); await click('[data-preview-close]', false); }
    verdict('F6b', 'the lens Preview button draws the same tables as the seam preview', !!panel && panel.state === 'ok' && JSON.stringify(panel.tables.map(t => t.split(':')[0]).sort()) === JSON.stringify([...new Set(pv.ops.map(o => o.table))].sort()), { panel, pvTables: [...new Set(pv.ops.map(o => o.table))] });
    // F2/F3/F4/F8 (Save & Complete, related form, gesture count, related counts) RETIRED 2026-10-17 (ERP_FRIENDLY_OPS_LENS.md §42): legacy has the gear DocAction submenu, the detail tabs and Zoom Across.
    // F9 refusal seen in the preview == Save's refusal
    await click('#idmp-toolbar [data-tb="ignore"]', false).catch(() => {}); await hold(800);   // leave the Preview-only order form (the retired Save & Complete used to end it)
    await openMenuById(53055, false); await page.waitForSelector(NEWB, { timeout: 20000 }); await hold(600);
    await fillOrder({ start: '2007-01-01' });
    const k9 = await kmax(), c9 = await nOrders(), n9 = PAGELOG.length;
    await click('[data-lens-action="friendly-ops:preview"]', false); await page.waitForSelector('[data-save-preview]', { timeout: 10000 }).catch(() => {});
    const pr = await page.evaluate(() => { const b = document.querySelector('[data-save-preview]'); return b ? { state: b.getAttribute('data-save-preview'), text: (b.querySelector('[data-preview-refusal]') || {}).textContent || '' } : null; });
    await click('[data-preview-close]', false).catch(() => {});
    const kA = await kmax(), cA = await nOrders(), nS9 = PAGELOG.length;
    await click(SAVEB, false); await hold(3000);
    const saveRef = PAGELOG.slice(nS9).filter(l => /§MODEL-SAVE-ROLLBACK|§MODEL-AFTER-SAVE .*refused/.test(l)).pop() || '';
    const why = (/(?:nothing sealed: |refused: )(.*)$/.exec(saveRef) || [])[1] || '';
    console.log('§FOPS refusal preview=' + JSON.stringify(pr) + ' save=' + JSON.stringify(saveRef.slice(0, 300)));
    verdict('F9', 'Preview shows the refusal Save gives ("' + why.slice(0, 90) + '"), and neither writes', !!pr && pr.state === 'refused' && !!why && pr.text.indexOf(why.slice(0, 60)) >= 0 && k9 === kA && c9 === cA && (await nOrders()) === c9, { pr, why, k9, kA, c9, cA }, !why);
    await click('#idmp-toolbar [data-tb="ignore"]', false).catch(() => {});
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const firstDiff = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return { at: i, plain: a.slice(Math.max(0, i - 2), i + 3), lens: b.slice(Math.max(0, i - 2), i + 3) }; return null; };
    const errs = PAGELOG.filter(l => /^PAGEERR/.test(l)); verdict('F0', 'no page errors', !errs.length, errs.slice(0, 3));
  } catch (e) { fails++; console.log('§FOPS ERROR ' + (e && e.stack || e)); }
  fs.writeFileSync(path.join(require('os').tmpdir(), 'witness_friendly_ops.page.log'), PAGELOG.join('\n'));
  console.log('§FOPS_VERDICT ' + (fails ? 'RED' : 'GREEN') + ' judged=' + judged + ' failed=' + fails + (BREAK ? ' break=' + BREAK : '') + ' pagelog=' + path.join(require('os').tmpdir(), 'witness_friendly_ops.page.log'));
  await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})();
