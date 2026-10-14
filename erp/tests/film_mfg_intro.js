// SPDX-License-Identifier: GPL-2.0-only
// ⚠ DO NOT REMOVE — Libero Manufacturing intro film: RAW take (no narration, no cards; cards/voice are added in POST per the film standing rules, prompts/mfg/INTRO_FILM_SCRIPT.md).
// ONE take, CPU only, English UI, real mouse/keyboard on the real page. Every fact is a §ERP_FILM_FACT read from the live in-browser DB/DOM. READ <out>/erp_film.log and <out>/erp_film.page.log before any conclusion; exit code is not evidence.
// Run: [DRY=1] [REPO=<worktree root>] node erp/tests/film_mfg_intro.js <outDir>      (DRY=1: no screencast / no ffmpeg, same steps, for proving the beats with §-logs first - PRIMAL LAW)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const REPO = process.env.REPO || path.join(__dirname, '..', '..'), DRY = !!process.env.DRY;
const OUT = path.resolve(process.argv[2] || '.'); const FR = path.join(OUT, 'frames'); fs.mkdirSync(FR, { recursive: true });
const LOG = [], PAGELOG = []; const say = (s) => { LOG.push(s); console.log(s); };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.sql': 'text/plain' };
const server = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); const fp = path.join(REPO, p);
  fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { res.writeHead(404); res.end('404 ' + p); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': st.size }); fs.createReadStream(fp).pipe(res); }); });
const CURSOR = `(() => { const go = () => { if (document.getElementById('__fc')) return;
  const c = document.createElement('div'); c.id = '__fc';
  c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;margin:-3px 0 0 -3px;z-index:2147483647;pointer-events:none;background:url("data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2222%22 height=%2222%22><path d=%22M3 2 L3 18 L7.5 14 L10.5 20.5 L13 19.4 L10.1 13 L16 13 Z%22 fill=%22white%22 stroke=%22black%22 stroke-width=%221.4%22/></svg>") no-repeat';
  document.documentElement.appendChild(c);
  const at = (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; };
  addEventListener('mousemove', at, true);
  addEventListener('mousedown', (e) => { at(e); const r = document.createElement('div');
    r.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;border:3px solid #ffb400;border-radius:50%;width:10px;height:10px;left:' + (e.clientX - 5) + 'px;top:' + (e.clientY - 5) + 'px;transition:all .45s ease-out;opacity:1';
    document.documentElement.appendChild(r); requestAnimationFrame(() => { r.style.transform = 'scale(4)'; r.style.opacity = '0'; }); setTimeout(() => r.remove(), 600); }, true); };
  if (document.documentElement) go(); else addEventListener('DOMContentLoaded', go); })();`;
(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port, base = 'http://localhost:' + port + '/erp';
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3 }); await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();
  page.on('console', m => PAGELOG.push(m.text())); page.on('pageerror', e => PAGELOG.push('PAGEERR ' + e)); page.on('dialog', async d => { PAGELOG.push('DIALOG ' + d.message()); await d.accept(); });
  const fact = (k, v) => say('§ERP_FILM_FACT ' + k + '=' + String(v).replace(/\s+/g, ' ').slice(0, 400));
  const lastLog = (n, re) => PAGELOG.slice(n).filter(l => re.test(l)).pop() || '';
  const sql = async (s) => { const r = await page.evaluate(q => { try { const r = window.__idmpDb.exec(q); return r.length ? r[0].values : []; } catch (e) { return 'ERR ' + e.message; } }, s); return r; };
  const hold = (ms) => page.waitForTimeout(ms);

  // ── screencast (skipped in DRY) ──
  const frames = []; let T0 = null, cdp = null;
  async function cast() {
    if (DRY) return; cdp = await ctx.newCDPSession(page); const me = cdp;
    me.on('Page.screencastFrame', async f => { const fn = path.join(FR, String(frames.length).padStart(6, '0') + '.jpg'); fs.writeFileSync(fn, Buffer.from(f.data, 'base64')); frames.push({ fn, ts: f.metadata.timestamp }); if (T0 === null) T0 = f.metadata.timestamp; me.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
    await me.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  }
  const nowT = () => (T0 === null ? 0 : Date.now() / 1000 - T0);
  const beat = (id, note) => say('§ERP_FILM_BEAT id=' + id + ' t=' + nowT().toFixed(2) + ' ' + (note || ''));
  async function glide(sel) { const loc = page.locator(sel).first(); await loc.scrollIntoViewIfNeeded().catch(() => {}); const b = await loc.boundingBox(); if (!b) throw new Error('no box for ' + sel); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: DRY ? 3 : 22 }); await hold(DRY ? 40 : 160); }
  let clicks = 0, cursorOk = 0;
  async function hclick(sel) { await glide(sel); const c = await page.evaluate(() => { const e = document.getElementById('__fc'); return e ? [parseFloat(e.style.left), parseFloat(e.style.top)] : null; }); const b = await page.locator(sel).first().boundingBox();
    clicks++; if (c && b && Math.abs(c[0] - (b.x + b.width / 2)) < 2 && Math.abs(c[1] - (b.y + b.height / 2)) < 2) cursorOk++; await page.mouse.down(); await hold(60); await page.mouse.up(); await hold(DRY ? 150 : 280); }
  const htype = async (sel, text) => { await glide(sel); await page.click(sel); await page.fill(sel, ''); await page.type(sel, text, { delay: DRY ? 5 : 80 }); await hold(DRY ? 60 : 350); };
  const pace = (ms) => hold(DRY ? Math.min(ms, 120) : ms);

  await page.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
  await page.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('erp_cache'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  await page.evaluate(() => new Promise(r => { const q = indexedDB.deleteDatabase('fold_plugins'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  await page.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__idmpDb && !!window.PluginRelease, null, { timeout: 30000 });
  await page.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 20000 });
  await hold(1200); await cast(); await page.mouse.move(720, 500); await hold(DRY ? 100 : 800);
  try {
    // ═══ B1 the plugin panel (Felix style): Install and start, lazy ═══
    beat('b1', 'Plugins & Releases panel');
    await hclick('#idmp-release-link'); await page.waitForSelector('#pr-osgi table.oc-t', { timeout: 10000 }); await pace(1500);
    const rowsOf = () => page.evaluate(() => [...document.querySelectorAll('#pr-osgi table.oc-t > tbody > tr:not(.oc-d)')].map(tr => ({ id: tr.cells[0].textContent.trim(), name: tr.cells[1].textContent.trim(), status: tr.cells[3].textContent.trim() })));
    const sum = () => page.$eval('#pr-osgi .oc-sum', e => e.textContent).catch(() => '');
    const r0 = await rowsOf(); fact('console.before', r0.length + ' bundles; ' + await sum());
    await hclick('#pr-osgi [data-oc-installtoggle]'); await page.waitForSelector('#pr-osgi [data-oc-url]'); await pace(500);
    const n1 = PAGELOG.length; await htype('#pr-osgi [data-oc-url]', 'plugins/libero_manufacturing.mjs'); await hclick('#pr-osgi [data-oc-doinstall]'); await hold(DRY ? 1500 : 2200);
    const r1 = await rowsOf(), mfg = r1.find(r => /Libero|mfg/i.test(r.name));
    fact('console.after', JSON.stringify(mfg) + ' | ' + await sum()); fact('startLog', lastLog(n1, /§PLUGIN-START/));
    await hclick('#pr-osgi a.oc-nm[data-oc-name="' + mfg.id + '"]'); await pace(2500);
    fact('detail', (await page.evaluate(() => (document.querySelector('#pr-osgi tr.oc-d') || {}).textContent || '')).replace(/\s+/g, ' ').slice(0, 380));
    await hclick('#pr-root [data-pr-close]'); await hold(500);

    // ═══ B2 login, the opening screen carries the plugin's indicator + goal while it is only STARTING ═══
    beat('b2', 'login then Home');
    await hclick("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await page.waitForSelector('#idmp-login-step1:visible'); await hold(300);
    await hclick("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await page.waitForSelector('#idmp-login-step2:visible'); await hold(300);
    const n2 = PAGELOG.length; await hclick('#idmp-login-ok'); await page.waitForSelector('#idmp-home', { timeout: 20000 }).catch(() => {}); await pace(2500);
    fact('home.docstatus', lastLog(n2, /§DASH-GADGET docstatus/)); fact('home.performance', lastLog(n2, /§DASH-GADGET performance/));
    fact('plugin.state.atHome', await page.evaluate(() => window.PluginEngine._reg().get('org.idempiere.mfg').state));
    await pace(2500);
    fact('home.mfgIndicatorDom', await page.evaluate(() => { const d = [...document.querySelectorAll('#idmp-home .ds')].find(x => /Manufacturing/.test(x.textContent)); return d ? d.textContent.replace(/\s+/g, ' ') : 'NOT IN DOM'; }));

    // ═══ B3 menu -> window: the plugin activates before the window draws ═══
    beat('b3', 'menu to Manufacturing Order');
    async function openMenuById(menuId) {
      const chain = await page.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); if (!leaf) return null; const out = []; let n = leaf.parentElement.parentElement;
        while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, menuId);
      if (!chain) throw new Error('menu id not in tree: ' + menuId);
      for (const id of chain) { const open = await page.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id); if (!open) await hclick('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
      await hold(400); await hclick('#idmp-tree .idmp-row.leaf[data-menu-id="' + menuId + '"]');
    }
    const n3 = PAGELOG.length; await openMenuById(53055); await page.waitForSelector('#idmp-toolbar [data-tb="new"]', { timeout: 20000 }); await pace(1500);
    const act = PAGELOG.slice(n3).findIndex(l => /§PLUGIN-ACTIVATE id=org.idempiere.mfg/.test(l)), win = PAGELOG.slice(n3).findIndex(l => /§IDEMPIERE window=Manufacturing Order\(53009\)/.test(l));
    fact('activate.order', 'activate@' + act + ' windowOpen@' + win + ' (activate must come first) state=' + await page.evaluate(() => window.PluginEngine._reg().get('org.idempiere.mfg').state));
    fact('window.tabs', JSON.stringify(await page.$$eval('#idmp-tabstrip .idmp-adtab', e => e.map(x => x.textContent.trim()))));
    await hold(DRY ? 200 : 2500);

    // ═══ helpers for the order / collector beats ═══
    const NEWB = '#idmp-toolbar [data-tb="new"]', SAVEB = '#idmp-toolbar [title^="Save"]', F = (c, t) => '#idmp-inline-mount ' + (t || 'input') + '[data-col="' + c + '"]';
    const optBy = async (col, re) => { const o = (await page.$$eval('#idmp-inline-mount select[data-col="' + col + '"] option', os => os.map(x => ({ v: x.value, t: x.text })))).find(x => x.v && re.test(x.t)); if (!o) throw new Error('no option ' + col + ' ' + re); return o; };
    const hselect = async (sel, val) => { await glide(sel); await page.selectOption(sel, val); await hold(DRY ? 60 : 500); };
    const tip = (q) => page.evaluate(x => window.__crud.withModelTrx(f => f(x)), q);
    const TAB = (table) => '#idmp-tabstrip .idmp-adtab[title$="· ' + table + '"]';
    const GRIDROWS = () => page.$$eval('.idmp-grid tbody tr', e => e.length);

    // ═══ B4 prerequisite, OFF CAMERA (announced on the card as "set up for this demonstration"): Standard Costing, standard prices, on-hand ═══
    const fx = await page.evaluate(() => { const db = window.__idmpDb; const run = (s) => db.run(s);
      const cats = db.exec("SELECT DISTINCT m_product_category_id FROM m_product WHERE m_product_id IN (50007,50008,50014)")[0].values.map(r => r[0]);
      cats.forEach(c => run("UPDATE m_product_category_acct SET costingmethod='S' WHERE m_product_category_id=" + c));
      run("UPDATE m_cost SET currentcostprice=2.5 WHERE m_product_id=50008 AND m_costelement_id=100 AND c_acctschema_id=101 AND m_costtype_id=100 AND ad_org_id=0");
      run("UPDATE m_cost SET currentcostprice=0.4 WHERE m_product_id=50014 AND m_costelement_id=100 AND c_acctschema_id=101 AND m_costtype_id=100 AND ad_org_id=0");
      run("DELETE FROM m_storageonhand WHERE m_product_id IN (50007,50008,50014)");
      run("INSERT INTO m_storageonhand (ad_client_id, ad_org_id, isactive, m_locator_id, m_product_id, m_attributesetinstance_id, qtyonhand, datematerialpolicy, m_storageonhand_uu) VALUES (11,50006,'Y',50001,50008,0,10000,'2026-01-01 00:00:00','film-kg'),(11,50006,'Y',50001,50014,0,500,'2026-01-01 00:00:00','film-bag')");
      return { cats: cats, method: db.exec("SELECT costingmethod FROM m_product_category_acct WHERE m_product_category_id IN (" + cats.join(',') + ") AND c_acctschema_id=101")[0].values.map(r => r[0]) }; });
    fact('prerequisite.offCamera', JSON.stringify(fx) + ' standard price KG=2.5 BAG=0.4 on-hand KG=10000 BAG=500');

    // ═══ B5 a Manufacturing Order, typed in the real form ═══
    beat('b5', 'New Manufacturing Order');
    await hclick(NEWB); await page.waitForSelector('#idmp-inline-mount .cfrow', { timeout: 10000 }); await pace(900);
    await hselect(F('c_doctypetarget_id', 'select'), (await optBy('c_doctypetarget_id', /^Manufacturing Order/)).v);
    await hselect(F('ad_org_id', 'select'), (await optBy('ad_org_id', /^Fertilizer \(/)).v);
    await hselect(F('m_warehouse_id', 'select'), (await optBy('m_warehouse_id', /^Fertilizer \(/)).v);
    await hselect(F('s_resource_id', 'select'), (await optBy('s_resource_id', /Fertilizer Plant/)).v);
    await hselect(F('m_product_id', 'select'), (await optBy('m_product_id', /Fertilizer #70/)).v); await hold(DRY ? 300 : 1500);
    fact('order.productCallout', JSON.stringify(await page.evaluate(() => ['ad_workflow_id', 'pp_product_bom_id', 'c_uom_id', 'qtybatchsize'].map(c => { const e = document.querySelector('#idmp-inline-mount [data-col="' + c + '"]'); return c + '=' + (e ? (e.tagName === 'SELECT' ? e.options[e.selectedIndex].text : e.value) : 'absent'); }))));
    await page.waitForTimeout(DRY ? 100 : 1200);
    await hselect(F('priorityrule', 'select'), (await optBy('priorityrule', /Medium/)).v); await htype(F('qtyentered'), '100'); await hold(DRY ? 200 : 800); fact('order.formQty', JSON.stringify(await page.evaluate(() => ['qtyentered', 'qtyordered', 'c_uom_id'].map(c => { const e = document.querySelector('#idmp-inline-mount [data-col="' + c + '"]'); return c + '=' + (e ? e.value + (e.offsetParent ? '' : '(hidden)') : 'absent'); }))));
    await page.fill(F('datestartschedule'), '2008-08-16'); await page.fill(F('datepromised'), '2008-08-17'); await page.fill(F('datefinishschedule'), '2008-08-17'); await pace(700);
    const nS = PAGELOG.length, cnt0 = (await tip('SELECT COUNT(*) AS n FROM pp_order'))[0].n; await hclick(SAVEB);
    for (let i = 0; i < 60 && (await tip('SELECT COUNT(*) AS n FROM pp_order'))[0].n === cnt0; i++) await page.waitForTimeout(200);
    await hold(DRY ? 600 : 2500);
    fact('order.afterSave', lastLog(nS, /§MODEL-AFTER-SAVE table=pp_order/)); fact('order.refusal', lastLog(nS, /refused|MODEL-SAVE-ROLLBACK/));
    const ord = (await tip("SELECT pp_order_id AS id, documentno, qtyordered, qtyreserved, docstatus FROM pp_order WHERE pp_order_id<0 ORDER BY pp_order_id DESC LIMIT 1"))[0];   // the new order carries a synthetic NEGATIVE key until the sidecar is folded
    fact('order.row', JSON.stringify(ord));
    fact('order.dbg3', JSON.stringify({ wfN: await tip('SELECT COUNT(*) AS n FROM pp_order_workflow'), ndN: await tip('SELECT COUNT(*) AS n FROM pp_order_node'), ndNew: await tip('SELECT pp_order_node_id AS id, pp_order_id AS o FROM pp_order_node ORDER BY pp_order_node_id LIMIT 3'), ops: await page.evaluate(() => { const k = window.__crud.kernelDb(); return k.exec('SELECT * FROM kernel_ops ORDER BY 1')[0].values.map(v => { const o = JSON.parse(v[4]); return [v[3], o.table, o.fields && o.fields.pp_order_id, o.fields && o.fields.pp_order_workflow_id]; }).filter(x => /workflow|node/.test(x[1])); }) }));
    fact('order.dbg2', JSON.stringify({ wf: await tip('SELECT pp_order_workflow_id AS id, pp_order_id AS o, pp_order_node_id AS n FROM pp_order_workflow WHERE pp_order_id<0'), nd: await tip('SELECT pp_order_node_id AS id, pp_order_id AS o, pp_order_workflow_id AS w FROM pp_order_node WHERE pp_order_id<0 OR pp_order_workflow_id<0') }));
    fact('order.children', JSON.stringify({ bom: (await tip("SELECT COUNT(*) AS n FROM pp_order_bom WHERE pp_order_id=" + ord.id))[0].n, lines: (await tip("SELECT line, m_product_id, qtyrequiered, qtyreserved FROM pp_order_bomline WHERE pp_order_id=" + ord.id + " ORDER BY pp_order_bomline_id")), nodes: (await tip("SELECT COUNT(*) AS n FROM pp_order_node WHERE pp_order_id=" + ord.id))[0].n, mrp: (await tip("SELECT typemrp, qty FROM pp_mrp WHERE pp_order_id=" + ord.id + " ORDER BY typemrp DESC")) }));
    // the order's child tabs, read from the grid the user sees
    const ensureGrid = async () => { if (!(await page.locator('.idmp-grid tbody tr').count())) { await hclick('#idmp-toolbar [data-tb="toggle"]'); await hold(700); } };
    for (const [lbl, tbl] of [['Order Parent Product', 'PP_Order_BOM'], ['Components', 'PP_Order_BOMLine'], ['Workflow', 'PP_Order_Workflow'], ['Order Activity', 'PP_Order_Node'], ['Cost', 'PP_Order_Cost']]) {
      const sel = '#idmp-tabstrip .idmp-adtab[title$="· ' + tbl + '"]'; if (!(await page.locator(sel).count())) { fact('tab.' + tbl, 'no tab'); continue; }
      await hclick(sel); await pace(1300); fact('tab.' + lbl, (await page.$$eval('.idmp-grid tbody tr', e => e.length)) + ' rows in the grid');
    }
    // ═══ B5b complete the order (DocAction CO) ═══
    beat('b5b', 'Complete the order');
    await hclick('#idmp-tabstrip .idmp-adtab[title="TabLevel 0 · PP_Order"]'); await pace(1000);
    if (!(await page.locator('#idmp-inline-mount [data-col]').count())) { await hclick('#idmp-toolbar [data-tb="toggle"]'); await pace(900); }
    fact('order.docActions', JSON.stringify(await page.$$eval('[data-doc-action]', e => e.map(x => x.getAttribute('data-doc-action')))));
    fact('order.docstatusSelect', await page.$eval('#idmp-inline-mount select[data-col="docstatus"]', e => e.value + ' disabled=' + e.disabled).catch(() => 'absent'));

    const nC = PAGELOG.length; await hclick('[data-doc-action="CO"]'); await page.waitForTimeout(DRY ? 3500 : 4500);
    fact('order.complete', lastLog(nC, /§MODEL-DOCACTION table=pp_order/)); fact('order.completeRefusal', lastLog(nC, /refused|rolled|NOT|DEFERRED|MODEL-ERR/));
    const o2 = (await tip("SELECT docstatus, docaction, isapproved, qtyreserved FROM pp_order WHERE pp_order_id<0 ORDER BY pp_order_id DESC LIMIT 1"))[0];
    fact('order.afterComplete', JSON.stringify(o2) + ' PP_Order_Cost rows=' + (await tip("SELECT COUNT(*) AS n FROM pp_order_cost WHERE pp_order_id<0"))[0].n);
    fact('order.docActionsAfter', JSON.stringify(await page.$$eval('[data-doc-action]', e => e.map(x => x.getAttribute('data-doc-action'))))); await hold(DRY ? 200 : 2000);
    await hold(DRY ? 200 : 1500);

    // ═══ B6 stock before: Info Product (the toolbar Product Info window) for the two components and the finished product ═══
    beat('b6', 'Info Product: on hand before');
    async function infoProduct(label, valueText, key) {
      if (!(await page.$('#idmp-infowin'))) { await hclick('#idmp-toolbar [data-tb="productinfo"]'); await page.waitForSelector('#idmp-infowin'); await pace(600); }
      await htype('#idmp-infowin-crit input[data-col="Value"]', valueText);
      await hselect('#idmp-infowin-crit select[data-col="M_Warehouse_ID"]', '50002');
      await hclick('#idmp-infowin [data-act="refresh"]'); await pace(1100);
      const cell = (c) => page.$eval('#idmp-infowin tbody tr[data-key="' + key + '"] td[data-col="' + c + '"]', e => e.getAttribute('data-v')).catch(() => null);
      const o = { onhand: await cell('QtyOnHand'), reserved: await cell('QtyReserved'), available: await cell('QtyAvailable') };
      fact('infoProduct.' + label, JSON.stringify(o)); await pace(1800); return o;
    }
    const ip0 = { kg: await infoProduct('kg.before', 'Fertilizer', 50008), bag: await infoProduct('bag.before', 'Bag70', 50014), fg: await infoProduct('fg.before', 'Fertilizer#70', 50007) };

    // ═══ B6b Component Issues: the page's own commit funnel (the legacy Receipt & Issue form is a custom ZK form and is not ported; the SAME DocAction path completes the collector) ═══
    beat('b6b', 'Component Issues through the funnel');
    const ordId = (await tip("SELECT pp_order_id AS id FROM pp_order WHERE pp_order_id<0 ORDER BY pp_order_id DESC LIMIT 1"))[0].id;
    async function collector(type, bomLineId, productId, qty, label) {
      const n0 = PAGELOG.length;
      await page.evaluate(({ ordId, type, bomLineId, productId, qty }) => {
        const db = window.__idmpDb, o = window.__crud.withModelTrx(q => q('SELECT * FROM pp_order WHERE pp_order_id=' + ordId))[0];
        const wf = window.__crud.withModelTrx(q => q('SELECT pp_order_workflow_id AS id FROM pp_order_workflow WHERE pp_order_id=' + ordId + ' ORDER BY pp_order_workflow_id DESC'))[0];
        const f = { ad_client_id: 11, ad_org_id: o.ad_org_id, pp_order_id: ordId, pp_order_workflow_id: wf ? wf.id : null, m_warehouse_id: o.m_warehouse_id, s_resource_id: o.s_resource_id, m_product_id: productId, c_uom_id: bomLineId ? null : o.c_uom_id,
          pp_order_bomline_id: bomLineId || null, m_locator_id: 50001, costcollectortype: type, c_doctypetarget_id: 50013, c_doctype_id: 50013, movementdate: '2026-10-15', dateacct: '2026-10-15', movementqty: qty, scrappedqty: 0, qtyreject: 0, docstatus: 'DR', docaction: 'CO', isactive: 'Y', processed: 'N', posted: 'N' };
        window.__crud.applyOp({ op_type: 'CRUD_CREATE', key: 'pp_cost_collector', table: 'pp_cost_collector', verb: 'create', fields: f });
      }, { ordId, type, bomLineId, productId, qty });
      for (let i = 0; i < 60 && !(await tip("SELECT 1 AS x FROM pp_cost_collector WHERE pp_cost_collector_id<0 AND costcollectortype='" + type + "' AND movementqty=" + qty))[0]; i++) await page.waitForTimeout(200);
      const cc = (await tip("SELECT pp_cost_collector_id AS id, documentno FROM pp_cost_collector WHERE pp_cost_collector_id<0 AND costcollectortype='" + type + "' AND movementqty=" + qty + " ORDER BY pp_cost_collector_id DESC"))[0];
      fact('collector.' + label + '.created', JSON.stringify(cc) + ' ' + lastLog(n0, /§MODEL-AFTER-SAVE table=pp_cost_collector|MODEL-SAVE-ROLLBACK/));
      const n1 = PAGELOG.length; await page.evaluate(({ id }) => window.__crud.process('PP_Cost_Collector', id, 'CO', { from: 'DR', to: 'CO' }), { id: cc.id }); await page.waitForTimeout(DRY ? 3500 : 4500);
      fact('collector.' + label + '.complete', lastLog(n1, /§MODEL-DOCACTION table=pp_cost_collector/) + ' ' + lastLog(n1, /refused|rolled|DEFERRED|MODEL-ERR|not supported/));
      return cc;
    }
    const lines = await tip("SELECT pp_order_bomline_id AS id, m_product_id AS p, qtyrequiered AS q FROM pp_order_bomline WHERE pp_order_id=" + ordId + " ORDER BY line");
    const kgLine = lines.find(l => l.p === 50008), bagLine = lines.find(l => l.p === 50014);
    await collector('110', kgLine.id, 50008, 7070.71, 'issue.kg'); await pace(1500); await collector('110', bagLine.id, 50014, 100, 'issue.bag'); await pace(1500);
    fact('costDetails.issues', JSON.stringify(await tip("SELECT pp_cost_collector_id AS cc, c_acctschema_id AS s, m_costelement_id AS e, amt, qty FROM m_costdetail WHERE pp_cost_collector_id<0 AND c_acctschema_id=101 AND m_costelement_id=100 ORDER BY m_costdetail_id")));
    fact('storage.kg.afterIssue', JSON.stringify(await tip('SELECT m_locator_id AS l, m_attributesetinstance_id AS a, qtyonhand AS q, substr(datematerialpolicy,1,10) AS d FROM m_storageonhand WHERE m_product_id=50008')));
    beat('b6c', 'Info Product: on hand after the issues');
    const ip1 = { kg: await infoProduct('kg.afterIssue', 'Fertilizer', 50008), bag: await infoProduct('bag.afterIssue', 'Bag70', 50014) };

    // ═══ B7 Material Receipts: 40 then 60 ═══
    beat('b7', 'Material Receipts');
    await collector('100', null, 50007, 40, 'receipt.40'); await pace(1500); await collector('100', null, 50007, 60, 'receipt.60'); await pace(1500);
    fact('costDetails.receipts', JSON.stringify(await tip("SELECT pp_cost_collector_id AS cc, amt, qty FROM m_costdetail WHERE pp_cost_collector_id<0 AND c_acctschema_id=101 AND m_costelement_id=100 AND qty>0 ORDER BY m_costdetail_id")));
    fact('order.afterReceipts', JSON.stringify((await tip("SELECT qtyordered, qtydelivered, qtyreserved, datestart, datefinish FROM pp_order WHERE pp_order_id=" + ordId))[0]));
    const ip2 = { fg: await infoProduct('fg.afterReceipts', 'Fertilizer#70', 50007) };

    // ═══ B8 the Cost Collector window lists what was just created ═══
    beat('b8', 'Cost Collector window');
    await page.waitForTimeout(300); await hclick('#infowin-close, #idmp-infowin button[title="Close"]').catch(() => {}); await pace(500);
    await openMenuById(53082); await page.waitForSelector(NEWB, { timeout: 20000 }); await pace(1800);
    fact('cc.grid', (await page.$$eval('.idmp-grid tbody tr', e => e.length)) + ' collectors listed (4 created above + any seeded)'); await pace(2500);
    await hclick('#idmp-tabstrip .idmp-adtab[title$="· PP_Cost_Collector"]').catch(() => {}); await pace(800);

    // ═══ B9 a refusal: an order with no routing is refused and rolled back (nothing saved) ═══
    beat('b9', 'Refusal and rollback');
    await hclick('.idmp-wintab:has(.lbl:text-is("Manufacturing Order"))'); await pace(1000);
    await hclick('#idmp-tabstrip .idmp-adtab[title="TabLevel 0 · PP_Order"]'); await pace(800);
    if (!(await page.locator('.idmp-grid tbody tr').count())) { await hclick('#idmp-toolbar [data-tb="toggle"]'); await pace(700); }
    const cntB = (await tip('SELECT COUNT(*) AS n FROM pp_order'))[0].n;
    await hclick(NEWB); await page.waitForSelector('#idmp-inline-mount .cfrow', { timeout: 10000 }); await pace(900);
    await hselect(F('c_doctypetarget_id', 'select'), (await optBy('c_doctypetarget_id', /^Manufacturing Order/)).v);
    await hselect(F('ad_org_id', 'select'), (await optBy('ad_org_id', /^Fertilizer \(/)).v);
    await hselect(F('m_warehouse_id', 'select'), (await optBy('m_warehouse_id', /^Fertilizer \(/)).v);
    await hselect(F('s_resource_id', 'select'), (await optBy('s_resource_id', /Fertilizer Plant/)).v);
    await hselect(F('m_product_id', 'select'), (await optBy('m_product_id', /Fertilizer #70/)).v); await pace(900);
    await hselect(F('priorityrule', 'select'), (await optBy('priorityrule', /Medium/)).v); await htype(F('qtyentered'), '10');
    await page.fill(F('datestartschedule'), '2007-01-01'); await page.fill(F('datepromised'), '2008-08-17'); await pace(600);   // the order starts BEFORE the BOM is valid (ValidFrom 2007-09-22)
    const nR = PAGELOG.length; await hclick(SAVEB); await hold(DRY ? 2500 : 3500);
    fact('refusal.log', lastLog(nR, /§MODEL-SAVE-ROLLBACK|§CRUD validate.*REJECT/) || lastLog(nR, /refused/));
    fact('refusal.rows', 'pp_order count ' + cntB + ' -> ' + (await tip('SELECT COUNT(*) AS n FROM pp_order'))[0].n); await hold(DRY ? 200 : 2500);
    await hclick('#idmp-toolbar [title^="Ignore"]').catch(() => {}); await pace(600);

    // ═══ B10 stop the plugin from the panel: the opening screen returns to the baseline, the data stays ═══
    beat('b10', 'Stop the plugin');
    await page.evaluate(() => window.PluginRelease.open()); await page.waitForSelector('#pr-osgi table.oc-t', { timeout: 10000 }); await pace(1200);
    const mfgRow = (await rowsOf()).find(r => /Libero|mfg/i.test(r.name)); fact('panel.beforeStop', JSON.stringify(mfgRow));
    await hclick('#pr-osgi [data-oc-stop="org.idempiere.mfg"]'); await pace(1500);
    fact('panel.afterStop', JSON.stringify((await rowsOf()).find(r => /Libero|mfg/i.test(r.name))));
    fact('afterStop', JSON.stringify({ menuLeaf53055: await page.locator('#idmp-tree .idmp-row.leaf[data-menu-id="53055"]').count(), indicatorRow: await sql("SELECT COUNT(*) FROM pa_documentstatus WHERE pa_documentstatus_id=53201"), orderRows: (await tip('SELECT COUNT(*) AS n FROM pp_order'))[0].n, modelClass: await page.evaluate(() => !!window.ModelLayer.MODEL.pp_order) }));
    await hold(DRY ? 200 : 2500);
    await hclick('#pr-root [data-pr-close]'); await pace(500);
    beat('b10b', 'Reload: the opening screen without the plugin');
    await page.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__idmpDb && !!window.PluginRelease, null, { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 20000 }); await pace(900);
    await hclick("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await page.waitForSelector('#idmp-login-step1:visible'); await hold(300);
    await hclick("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await page.waitForSelector('#idmp-login-step2:visible'); await hold(300);
    const nB = PAGELOG.length; await hclick('#idmp-login-ok'); await page.waitForSelector('#idmp-home', { timeout: 20000 }).catch(() => {}); await pace(2500);
    fact('home.afterStop.docstatus', lastLog(nB, /§DASH-GADGET docstatus/)); fact('home.afterStop.performance', lastLog(nB, /§DASH-GADGET performance/));
    fact('home.afterStop.plugin', await page.evaluate(() => { const r = window.PluginEngine._reg().get('org.idempiere.mfg'); return r ? r.state : 'absent'; }) + ' menuLeaf53055=' + await page.locator('#idmp-tree .idmp-row.leaf[data-menu-id="53055"]').count());
    await hold(DRY ? 200 : 3500);
    say('§ERP_FILM_CURSOR clicks=' + clicks + ' cursorOnTarget=' + cursorOk + (clicks === cursorOk ? ' OK' : ' WRONG'));
  } catch (e) { say('§ERP_FILM_ERROR ' + String(e.stack || e.message).split('\n').slice(0, 3).join(' | ')); }
  if (cdp) await cdp.send('Page.stopScreencast').catch(() => {}); await page.waitForTimeout(300).catch(() => {});
  fs.writeFileSync(path.join(OUT, 'erp_film.page.log'), PAGELOG.join('\n') + '\n');
  const errs = PAGELOG.filter(l => /^PAGEERR/.test(l)); say('§ERP_FILM_PAGEERRORS ' + errs.length + ' ' + errs.slice(0, 2).join(' | '));
  if (!DRY && frames.length) {
    const endTs = Date.now() / 1000, lines = [];
    frames.forEach((f, i) => { const d = (i + 1 < frames.length ? frames[i + 1].ts : endTs) - f.ts; lines.push(`file '${f.fn}'`, `duration ${Math.max(d, 0.001).toFixed(4)}`); }); lines.push(`file '${frames[frames.length - 1].fn}'`);
    fs.writeFileSync(path.join(OUT, 'frames.txt'), lines.join('\n') + '\n'); const mp4 = path.join(OUT, 'mfg_intro_raw.mp4');
    try { execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'frames.txt'), '-vf', 'fps=24,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', mp4]); say('§ERP_FILM_DONE frames=' + frames.length + ' dur=' + (endTs - T0).toFixed(2) + ' out=' + mp4); } catch (e) { say('§ERP_FILM_ERROR ffmpeg ' + String(e.message).split('\n')[0]); }
  }
  fs.writeFileSync(path.join(OUT, 'erp_film.log'), LOG.join('\n') + '\n'); await browser.close(); server.close();
})();
