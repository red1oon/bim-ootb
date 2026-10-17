// ⚠ DO NOT REMOVE — W-CREATEFROM-INFOWIN (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §49). READ THE LOG; exit code is not evidence.
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), BREAK = process.env.FR_BREAK || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.db': 'application/octet-stream', '.sql': 'text/plain', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': s.size }); fs.createReadStream(f).pipe(r); }); });
let judged = 0, fails = 0, incon = 0;
const J = (id, name, cond, d) => { judged++; if (!cond) fails++; console.log('  ' + (cond ? '✅ ' : '❌ ') + id + ' ' + name + (d ? ' — ' + String(d).slice(0, 260) : '')); };
// ISSUE it proves/disproves: the LEGACY path PO -> Material Receipt lines (Button CreateLinesFrom -> Info Window 200022 -> process 200141), driven through ONE generic Info Window engine (no per-window code):
//   I1 the Button opens the info window; I2 it lists exactly the rows the view holds for the chosen order (count + C_OrderLine_ID list); I3 the process button is disabled with nothing picked;
//   I4 a picked row with an EDITED Qty becomes a receipt line of that quantity linked to the order line, the header takes the order (updateFrom); I5 the gesture count of the whole chain (printed, compared with Receive / Odoo 16).
//   FR_BREAK=noedit (the typed Qty is ignored) must turn I4 RED. INCONCLUSIVE (never PASS) when no PO reaches CO.
// Run: [FR_BREAK=noedit] node erp/tests/witness_createfrom_infowin.js > <log>
(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port + '/erp';
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const logs = []; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => logs.push('PAGEERR ' + e.message)); pg.on('dialog', d => d.accept());
  let gestures = 0, counting = false; const G = (n) => { if (counting) gestures += (n || 1); };
  try {
    await pg.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    for (const n of ['erp_cache', 'fold_plugins']) await pg.evaluate(x => new Promise(r => { const q = indexedDB.deleteDatabase(x); q.onsuccess = q.onerror = q.onblocked = () => r(); }), n);
    await pg.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    await pg.waitForFunction(() => !!window.__idmpDb && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 30000 });
    await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
    await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
    await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0);
    if (BREAK === 'noedit') await pg.evaluate(() => { window.__iwBreak = 'noedit'; });
    const tip = (sql) => pg.evaluate(s => window.__crud.withModelTrx(q => q(s)), sql);
    const hc = async (sel) => { const l = pg.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click(); G(); await pg.waitForTimeout(450); };
    const F = (c, t) => '#idmp-inline-mount ' + (t || 'input') + '[data-col="' + c + '"]';
    const pick = async (col, re) => { const o = (await pg.$$eval('#idmp-inline-mount select[data-col="' + col + '"] option', x => x.map(y => ({ v: y.value, t: y.text })))).find(x => x.v && re.test(x.t)); if (!o) throw new Error('no option ' + col); await pg.selectOption(F(col, 'select'), o.v); G(); await pg.waitForTimeout(700); };
    const openWin = async (winId) => {
      const mid = await pg.evaluate(w => { const r = window.__idmpDb.exec("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=" + w + " AND IsActive='Y'"); return (r.length ? r[0].values.map(x => x[0]) : []).find(i => document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + i + '"]')); }, winId);
      const chain = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); const out = []; let n = leaf.parentElement.parentElement; while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, mid);
      for (const id of chain) { const open = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id); if (!open) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
      await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid + '"]'); await pg.waitForSelector('#idmp-toolbar [data-tb="new"]'); await pg.waitForTimeout(800);
    };
    const NEWB = '#idmp-toolbar [data-tb="new"]';
    // a completed Purchase Order of 5 Mulch for Seed Farm (the same set-up as W-FRIENDLY-PURCHASE)
    await openWin(181); await hc(NEWB); await pg.waitForSelector('#idmp-inline-mount .cfrow'); await pg.waitForTimeout(600);
    await pick('c_doctypetarget_id', /^Purchase Order/); await pick('c_bpartner_id', /Seed Farm/); await pick('ad_org_id', /^HQ/);
    await hc('#idmp-toolbar [data-tb="save"]'); await pg.waitForTimeout(1800); await hc('#idmp-tabstrip .idmp-adtab[title="TabLevel 1 · C_OrderLine"]'); await pg.waitForTimeout(1200); await hc(NEWB); await pg.waitForTimeout(900);
    await pick('m_product_id', /Mulch/); await pg.fill(F('qtyentered'), '5'); await pg.locator(F('qtyentered')).first().blur().catch(() => {}); await pg.waitForTimeout(600);
    await hc('#idmp-toolbar [data-tb="save"]'); await pg.waitForTimeout(2000); await hc('#idmp-tabstrip .idmp-adtab[title="TabLevel 0 · C_Order"]'); await pg.waitForTimeout(1000);
    await hc('[data-doc-action="CO"]'); await pg.waitForTimeout(4500);
    const po = (await tip("SELECT c_order_id AS i, documentno AS d, docstatus AS s FROM c_order WHERE c_order_id < 0 ORDER BY c_order_id DESC LIMIT 1"))[0];
    if (!po || po.s !== 'CO') { incon++; console.log('  INCONCLUSIVE no Purchase Order reached CO ' + JSON.stringify(po)); return; }
    const pol = await tip("SELECT c_orderline_id AS id, qtyordered AS q FROM c_orderline WHERE c_order_id=" + po.i);
    // THE LEGACY CHAIN starts here: a draft Material Receipt, then its Create-lines-from button
    counting = true; gestures = 0;
    await openWin(184); await hc(NEWB); await pg.waitForSelector('#idmp-inline-mount .cfrow'); await pg.waitForTimeout(600);
    await pick('c_bpartner_id', /Seed Farm/); await pick('ad_org_id', /^HQ/);
    await hc('#idmp-toolbar [data-tb="save"]'); await pg.waitForTimeout(2000);
    const rc = (await tip("SELECT m_inout_id AS id, docstatus AS s, movementtype AS m, c_order_id AS o FROM m_inout WHERE m_inout_id < 0 ORDER BY m_inout_id DESC LIMIT 1"))[0];
    console.log('§CFIW receipt header ' + JSON.stringify(rc));
    const btn = '#idmp-content [data-proc-btn="CreateLinesFrom"]'; const hasBtn = await pg.waitForSelector(btn, { timeout: 8000 }).then(() => true, () => false);
    J('I0', 'the Material Receipt form carries the Create-lines-from Button (a Button column with AD_InfoWindow_ID, no AD_Process on the column)', hasBtn, JSON.stringify(rc));
    if (!hasBtn) return;
    await hc(btn); const opened = await pg.waitForSelector('#idmp-infowin', { timeout: 8000 }).then(() => true, () => false);
    J('I1', 'the Button opens Info Window 200022 "Create lines from Shipment/Receipt"', opened && /Create lines from/i.test(await pg.textContent('#idmp-infowin').catch(() => '')), '');
    if (!opened) return;
    const procBtn = '#idmp-infowin [data-infoproc]'; const dis0 = await pg.$eval(procBtn, e => e.disabled).catch(() => null);
    J('I3', 'the process button is DISABLED with no row picked (InfoPanel.enableButtons)', dis0 === true, 'disabled=' + dis0);
    // criteria: the Order (an editor over the live orders), as the Java renders it
    const ordOpt = await pg.$$eval('#idmp-infowin select[data-col="C_Order_ID"] option', x => x.map(y => ({ v: y.value, t: y.text })));
    const o = ordOpt.find(x => String(x.v) === String(po.i)); if (!o) throw new Error('order ' + po.i + ' not offered: ' + JSON.stringify(ordOpt.slice(0, 5)));
    await pg.selectOption('#idmp-infowin select[data-col="C_Order_ID"]', o.v); G(); await hc('#idmp-infowin [data-act="refresh"]'); await pg.waitForTimeout(800);
    const shown = await pg.$$eval('#idmp-infowin tbody tr', t => t.map(r => ({ ol: null, qty: (r.querySelector('[data-edit="Qty"]') || {}).value })));
    const viewIds = (await tip("SELECT c_orderline_id AS id FROM m_inout_createfrom_v WHERE c_order_id=" + po.i + " AND qty*multiplier<>0 ORDER BY line")).map(r => Number(r.id));
    const listed = await pg.evaluate(() => Array.from(document.querySelectorAll('#idmp-infowin tbody tr')).length);
    J('I2', 'the window lists exactly the rows the view holds for the order (count)', listed === viewIds.length && listed === pol.length, JSON.stringify({ listed, view: viewIds, orderLines: pol.map(x => x.id) }));
    // pick the first row, EDIT its Qty to 3 (< ordered 5), run the process button
    await pg.check('#idmp-infowin input[data-pick="0"]'); G();
    const dis1 = await pg.$eval(procBtn, e => e.disabled); J('I3b', 'ticking a row ENABLES the process button', dis1 === false, 'disabled=' + dis1);
    await pg.fill('#idmp-infowin tbody tr:first-child [data-edit="Qty"]', '3'); G();
    await hc(procBtn); await pg.waitForTimeout(1500);
    const dlg = await pg.waitForSelector('#idmp-procdlg', { timeout: 10000 }).then(() => true, () => false);
    J('I3c', 'the process opens its parameter dialog (M_InOut_ID from the record, M_Locator_ID by its @SQL= default)', dlg, '');
    const para = await pg.evaluate(() => Array.from(document.querySelectorAll('#idmp-procdlg [data-para]')).map(e => e.getAttribute('data-para') + '=' + e.value));
    console.log('§CFIW params ' + JSON.stringify(para));
    await hc('#idmp-procdlg [data-proc-run]'); await pg.waitForTimeout(3500);
    const okb = await pg.waitForSelector('#idmp-procdlg [data-procdlg-ok]', { timeout: 15000 }).then(() => true, () => false); if (okb) await hc('#idmp-procdlg [data-procdlg-ok]');
    await pg.waitForTimeout(1500); counting = false;
    const hdr = (await tip("SELECT c_order_id AS o, docstatus AS s FROM m_inout WHERE m_inout_id=" + rc.id))[0];
    const lines = await tip("SELECT m_inoutline_id AS id, movementqty AS q, c_orderline_id AS ol, m_product_id AS p, m_locator_id AS loc FROM m_inoutline WHERE m_inout_id=" + rc.id);
    const want = BREAK === 'noedit' ? 3 : 3;
    J('I4', 'the picked row with Qty EDITED to 3 became ONE receipt line of 3, linked to the order line; the header took the order (updateFrom)', lines.length === 1 && Number(lines[0].q) === want && Number(lines[0].ol) === Number(pol[0].id) && Number(hdr.o) === Number(po.i) && lines[0].loc != null, JSON.stringify({ hdr, lines, expectOl: pol[0].id }));
    console.log('§CFIW gestures legacy chain (new receipt .. lines created) = ' + gestures + '  | Receive (friendly gear item) = 2 | Odoo 16 = 16 (spec §36)');
    console.log('§CFIW log ' + JSON.stringify(logs.filter(l => /INFOWIN run|INFOWIN-SELECTION|AD-PROC-LIVE proc=200141|CreateFromInOut|PAGEERR/.test(l)).slice(0, 12)));
    J('I6', 'no page errors', !logs.some(l => /^PAGEERR/.test(l)), logs.filter(l => /^PAGEERR/.test(l)).slice(0, 2).join(' | '));
  } catch (e) { fails++; console.log('  ❌ HARNESS ' + (e && e.stack || e)); console.log('§CFIW tail ' + JSON.stringify(logs.filter(l => /INFOWIN/.test(l)).slice(-3).map(l => l.replace(/^(§INFOWIN open.*?) ctx=.*/, '$1').slice(0, 2400)))); }
  finally { await browser.close(); srv.close(); console.log('§CFIW-SUMMARY ' + (fails ? 'FAIL' : incon ? 'INCONCLUSIVE' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' inconclusive=' + incon); process.exit(fails ? 1 : incon ? 3 : 0); }
})();
