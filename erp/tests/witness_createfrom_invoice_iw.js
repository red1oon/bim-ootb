// ⚠ DO NOT REMOVE — W-CREATEFROM-INVOICE-IW (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §52). READ THE LOG; exit code is not evidence.
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), BREAK = process.env.FR_BREAK || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.db': 'application/octet-stream', '.sql': 'text/plain', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': s.size }); fs.createReadStream(f).pipe(r); }); });
let judged = 0, fails = 0, incon = 0;
const J = (id, name, cond, d) => { judged++; if (!cond) fails++; console.log('  ' + (cond ? '✅ ' : '❌ ') + id + ' ' + name + (d ? ' — ' + String(d).slice(0, 260) : '')); };
// ISSUE it proves/disproves: the hand-built CreateFromInvoice picker (renderCreateFromPicker, deleted) is replaced by the LEGACY path - vendor invoice Button CreateLinesFrom -> Info Window 200024
//   -> process 200143 (verbatim port processes/CreateFromInvoice.js, reading T_Selection keyed by the view key) - through the SAME generic engine as the receipt (no per-window code):
//   V0 the AP Invoice form carries the Button; V1 it opens Info Window 200024; V2 picking the receipt lists exactly the view's rows for it; V3 a picked row with an EDITED Qty becomes ONE invoice line of
//   that qty carrying M_InOutLine_ID + C_OrderLine_ID, header takes the receipt's order (setShipment); V4 completing the invoice books ONE M_MatchInv of that qty (the reason the process exists);
//   V5 no page errors; V6 the gear popup lists a flagged info-window Button and opens its window. FR_BREAK=noedit (typed Qty ignored) must turn V3 RED. INCONCLUSIVE (never PASS) when the PO or the receipt does not reach CO.
// Run: [FR_BREAK=noedit] node erp/tests/witness_createfrom_invoice_iw.js > <log>
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
    // a completed receipt of that PO through the legacy receipt path (W-CREATEFROM-INFOWIN), full qty
    await openWin(184); await hc(NEWB); await pg.waitForSelector('#idmp-inline-mount .cfrow'); await pg.waitForTimeout(600);
    await pick('c_bpartner_id', /Seed Farm/); await pick('ad_org_id', /^HQ/); await hc('#idmp-toolbar [data-tb="save"]'); await pg.waitForTimeout(2000);
    const rc = (await tip("SELECT m_inout_id AS id FROM m_inout WHERE m_inout_id < 0 ORDER BY m_inout_id DESC LIMIT 1"))[0];
    await hc('#idmp-content [data-proc-btn="CreateLinesFrom"]'); await pg.waitForSelector('#idmp-infowin');
    const ordOpt = await pg.$$eval('#idmp-infowin select[data-col="C_Order_ID"] option', x => x.map(y => y.value)); if (ordOpt.indexOf(String(po.i)) < 0) throw new Error('order not offered to the receipt');
    await pg.selectOption('#idmp-infowin select[data-col="C_Order_ID"]', String(po.i)); await hc('#idmp-infowin [data-act="refresh"]'); await pg.waitForTimeout(800);
    await pg.check('#idmp-infowin input[data-pick="0"]'); await hc('#idmp-infowin [data-infoproc]'); await pg.waitForSelector('#idmp-procdlg'); await hc('#idmp-procdlg [data-proc-run]'); await pg.waitForTimeout(3500);
    if (await pg.waitForSelector('#idmp-procdlg [data-procdlg-ok]', { timeout: 15000 }).then(() => true, () => false)) await hc('#idmp-procdlg [data-procdlg-ok]');
    await pg.waitForTimeout(1200); await hc('[data-doc-action="CO"]'); await pg.waitForTimeout(4500);
    const rch = (await tip("SELECT docstatus AS s FROM m_inout WHERE m_inout_id=" + rc.id))[0], rl = await tip("SELECT m_inoutline_id AS id, movementqty AS q, c_orderline_id AS ol FROM m_inoutline WHERE m_inout_id=" + rc.id);
    console.log('§CFINV receipt ' + JSON.stringify({ rc, rch, rl }));
    if (!rch || rch.s !== 'CO' || rl.length !== 1) { incon++; console.log('  INCONCLUSIVE the receipt did not reach CO with one line'); return; }
    // THE LEGACY INVOICE CHAIN: a draft AP Invoice, then its Create-lines-from button
    counting = true; gestures = 0;
    await openWin(183); await hc(NEWB); await pg.waitForSelector('#idmp-inline-mount .cfrow'); await pg.waitForTimeout(600);
    await pick('c_doctypetarget_id', /^AP Invoice/); await pick('c_bpartner_id', /Seed Farm/); await pick('ad_org_id', /^HQ/);
    await hc('#idmp-toolbar [data-tb="save"]'); await pg.waitForTimeout(2000);
    const inv = (await tip("SELECT c_invoice_id AS id, docstatus AS s, c_order_id AS o FROM c_invoice WHERE c_invoice_id < 0 ORDER BY c_invoice_id DESC LIMIT 1"))[0];
    console.log('§CFINV invoice header ' + JSON.stringify(inv));
    const btn = '#idmp-content [data-proc-btn="CreateLinesFrom"]'; const hasBtn = await pg.waitForSelector(btn, { timeout: 8000 }).then(() => true, () => false);
    J('V0', 'the AP Invoice form carries the Create-lines-from Button (column CreateLinesFrom, AD_InfoWindow_ID 200024)', hasBtn && !!inv, JSON.stringify(inv));
    if (!hasBtn || !inv) return;
    await hc(btn); const opened = await pg.waitForSelector('#idmp-infowin', { timeout: 8000 }).then(() => true, () => false);
    J('V1', 'the Button opens Info Window 200024 "Create lines from Invoice"', opened && /Create lines from Invoice/i.test(await pg.textContent('#idmp-infowin').catch(() => '')), '');
    if (!opened) return;
    const ioOpt = await pg.$$eval('#idmp-infowin select[data-col="M_InOut_ID"] option', x => x.map(y => y.value));
    if (ioOpt.indexOf(String(rc.id)) < 0) throw new Error('receipt ' + rc.id + ' not offered: ' + JSON.stringify(ioOpt.slice(0, 6)));
    await pg.selectOption('#idmp-infowin select[data-col="M_InOut_ID"]', String(rc.id)); G();
    if (await pg.$('#idmp-infowin select[data-col="C_Order_ID"]')) await pg.selectOption('#idmp-infowin select[data-col="C_Order_ID"]', '').catch(() => {});
    await hc('#idmp-infowin [data-act="refresh"]'); await pg.waitForTimeout(800);
    const listed = await pg.evaluate(() => Array.from(document.querySelectorAll('#idmp-infowin tbody tr')).map(r => r.getAttribute('data-key')));
    const view = (await tip("SELECT c_invoice_createfrom_v_id AS k FROM c_invoice_createfrom_v WHERE m_inout_id=" + rc.id + " AND qty*multiplier<>0")).map(r => String(r.k));
    J('V2', 'picking the receipt lists exactly the view rows for it, keyed by the view key (= M_InOutLine_ID)', listed.length === view.length && listed.length === 1 && String(listed[0]) === String(rl[0].id), JSON.stringify({ listed, view, receiptLine: rl[0].id }));
    await pg.check('#idmp-infowin input[data-pick="0"]'); G();
    await pg.fill('#idmp-infowin tbody tr:first-child [data-edit="Qty"]', '4'); G();
    await hc('#idmp-infowin [data-infoproc]'); await pg.waitForTimeout(1500);
    const dlg = await pg.waitForSelector('#idmp-procdlg', { timeout: 10000 }).then(() => true, () => false);
    if (dlg) { await hc('#idmp-procdlg [data-proc-run]'); await pg.waitForTimeout(3500); if (await pg.waitForSelector('#idmp-procdlg [data-procdlg-ok]', { timeout: 15000 }).then(() => true, () => false)) await hc('#idmp-procdlg [data-procdlg-ok]'); }
    await pg.waitForTimeout(1500); counting = false;
    const hdr = (await tip("SELECT c_order_id AS o, docstatus AS s FROM c_invoice WHERE c_invoice_id=" + inv.id))[0];
    const lines = await tip("SELECT c_invoiceline_id AS id, qtyinvoiced AS q, m_inoutline_id AS iol, c_orderline_id AS ol, priceactual AS pa FROM c_invoiceline WHERE c_invoice_id=" + inv.id);
    J('V3', 'the picked row with Qty EDITED 5 -> 4 became ONE invoice line of 4 carrying the receipt line + order line; the header took the order (setShipment)', lines.length === 1 && Number(lines[0].q) === 4 && Number(lines[0].iol) === Number(rl[0].id) && Number(lines[0].ol) === Number(rl[0].ol) && Number(hdr.o) === Number(po.i), JSON.stringify({ hdr, lines }));
    await hc('[data-doc-action="CO"]'); await pg.waitForTimeout(4500);
    const ih = (await tip("SELECT docstatus AS s FROM c_invoice WHERE c_invoice_id=" + inv.id))[0];
    const mi = lines.length ? await tip("SELECT qty AS q, m_inoutline_id AS iol FROM m_matchinv WHERE c_invoiceline_id=" + lines[0].id) : [];
    J('V4', 'completing the invoice books ONE M_MatchInv of qty 4 on that receipt line', ih && ih.s === 'CO' && mi.length === 1 && Number(mi[0].q) === 4 && Number(mi[0].iol) === Number(rl[0].id), JSON.stringify({ ih, mi }));
    console.log('§CFINV gestures legacy invoice chain (new invoice .. lines created) = ' + gestures);
    console.log('§CFINV log ' + JSON.stringify(logs.filter(l => /INFOWIN-SELECTION|AD-PROC-LIVE proc=200143|CREATEFROM-INVOICE|PAGEERR/.test(l)).slice(0, 12)));
    // V6 the gear (Process) popup: a Button carrying an info window is listed only when flagged IsToolbarButton Y/B - legacy ships all 3 such Buttons N, so flag one in this page's dictionary copy
    const gear = async () => { await pg.click('#idmp-toolbar [data-tb="process"]'); await pg.waitForTimeout(500); const has = await pg.$('#idmp-proc-ov [data-tbb="CreateLinesFrom"]').then(x => !!x); return has; };
    const before = await gear(); await pg.evaluate(() => { const o = document.getElementById('idmp-proc-ov'); if (o) o.remove(); });
    await pg.evaluate(() => window.__idmpDb.run("UPDATE ad_column SET istoolbarbutton='B' WHERE ad_column_id=215282"));
    const after = await gear(); let iwOpen = false;
    if (after) { await pg.click('#idmp-proc-ov [data-tbb="CreateLinesFrom"]'); iwOpen = await pg.waitForSelector('#idmp-infowin', { timeout: 8000 }).then(() => true, () => false); }
    J('V6', 'gear popup: the info-window Button is absent while flagged N, listed once flagged B, and its click opens Info Window 200024', before === false && after === true && iwOpen, JSON.stringify({ before, after, iwOpen }));
    J('V5', 'no page errors', !logs.some(l => /^PAGEERR/.test(l)), logs.filter(l => /^PAGEERR/.test(l)).slice(0, 2).join(' | '));
  } catch (e) { fails++; console.log('  ❌ HARNESS ' + (e && e.stack || e)); console.log('§CFINV tail ' + JSON.stringify(logs.filter(l => /INFOWIN/.test(l)).slice(-3).map(l => l.replace(/^(§INFOWIN open.*?) ctx=.*/, '$1').slice(0, 2400)))); }
  finally { await browser.close(); srv.close(); console.log('§CFINV-SUMMARY ' + (fails ? 'FAIL' : incon ? 'INCONCLUSIVE' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' inconclusive=' + incon); process.exit(fails ? 1 : incon ? 3 : 0); }
})();
