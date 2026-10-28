// ⚠ DO NOT REMOVE — W-FRIENDLY-ROWS (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §42; replaces the Ship/Invoice half of W-FO-A2). READ THE LOG; exit code is not evidence.
// ISSUE it proves/disproves: with the friendly-ops lens, a COMPLETED Standard Order offers Ship and Invoice buttons that run the SAME dictionary processes (InOutGenerate, InvoiceGenerate) with the
//   order's values preset: strictly fewer gestures than the plain chain (menu -> parameters -> Run, twice), identical §EVENT_SEQ of the two process runs, identical shipment and invoice rows.
//   Lens not installed: no Ship/Invoice buttons. INCONCLUSIVE (never PASS) if an event trace is empty or the order never reached CO.
// Run: [FR_BREAK=noctx|nosql] node erp/tests/witness_friendly_rows.js > <log>
// W-PLUGIN-ROLE: this install/start/stop is SETUP, not the behaviour under test - done through reg.system (the host's own boot-restore path; a real user's bundle was installed earlier by the System Administrator). Who may write is judged in witness_plugin_role.js.
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), BREAK = process.env.FR_BREAK || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.db': 'application/octet-stream', '.sql': 'text/plain', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': s.size }); fs.createReadStream(f).pipe(r); }); });
let DBG = [], PGX = null; let judged = 0, fails = 0, incon = 0;
const J = (id, name, cond, d) => { judged++; if (!cond) fails++; console.log('  ' + (cond ? '✅ ' : '❌ ') + id + ' ' + name + (d ? ' — ' + String(d).slice(0, 220) : '')); };

async function gearItems(pg) { const on = await pg.$eval('#idmp-toolbar [data-tb="process"]', e => !e.disabled).catch(() => false); if (!on) return []; await pg.click('#idmp-toolbar [data-tb="process"]'); await pg.waitForSelector('#idmp-proc-ov', { timeout: 5000 }).catch(() => {}); const r = await pg.$$eval('#idmp-proc-ov [data-tbb]', e => e.map(x => x.getAttribute('data-tbb'))); await pg.evaluate(() => { const o = document.getElementById('idmp-proc-ov'); if (o) o.remove(); }); return r; }   // 2026-10-17 §45: process shortcuts live in the gear (Process) popup
async function run(base, browser, lens) {
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 810 } })).newPage();
  const logs = []; DBG = logs; PGX = pg; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => logs.push('PAGEERR ' + e.message)); pg.on('dialog', d => d.accept());
  const GT = { click: 0, select: 0, type: 0 };
  await pg.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
  for (const n of ['erp_cache', 'fold_plugins']) await pg.evaluate(x => new Promise(r => { const q = indexedDB.deleteDatabase(x); q.onsuccess = q.onerror = q.onblocked = () => r(); }), n);
  await pg.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
  await pg.waitForFunction(() => !!window.__idmpDb && !!window.PluginEngine && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 30000 });
  await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
  await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
  await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0);
  if (lens) await pg.evaluate(async (a) => { if (a.brk) window.__frBreak = a.brk; const r = window.PluginEngine._reg().system; await r.installBundle(a.u); await r.startBundle('org.kernel.friendly-ops'); }, { u: base + '/plugins/friendly_ops.mjs', brk: BREAK });
  await pg.evaluate(() => { window.__eventSeq = true; });
  const tip = (sql) => pg.evaluate(s => window.__crud.withModelTrx(q => q(s)), sql);
  const hc = async (sel) => { GT.click++; const l = pg.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click(); await pg.waitForTimeout(450); };
  const F = (c, t) => '#idmp-inline-mount ' + (t || 'input') + '[data-col="' + c + '"]';
  const pick = async (col, re) => { GT.select++; const o = (await pg.$$eval('#idmp-inline-mount select[data-col="' + col + '"] option', x => x.map(y => ({ v: y.value, t: y.text })))).find(x => x.v && re.test(x.t)); if (!o) throw new Error('no option ' + col); await pg.selectOption(F(col, 'select'), o.v); await pg.waitForTimeout(450); };
  const mid = await pg.evaluate(() => { const r = window.__idmpDb.exec("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=143 AND IsActive='Y'"); return (r.length ? r[0].values.map(x => x[0]) : []).find(i => document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + i + '"]')); });
  const chain = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); const out = []; let n = leaf.parentElement.parentElement; while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, mid);
  for (const id of chain) { const open = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id); if (!open) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
  await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid + '"]');
  const NEWB = '#idmp-toolbar [data-tb="new"]'; await pg.waitForSelector(NEWB); await pg.waitForTimeout(800);
  const barOff = await pg.evaluate(() => !!document.getElementById('idmp-lensbar'));
  const n0 = logs.length;
  await hc(NEWB); await pg.waitForSelector('#idmp-inline-mount .cfrow'); await pg.waitForTimeout(600);
  await pick('c_doctypetarget_id', /^Standard Order/); await pick('c_bpartner_id', /Joe Block/); await pick('ad_org_id', /^HQ/);
  const lensBtn = async (re) => { const t = await pg.$$eval('#idmp-lensbar button', b => b.map(x => [x.getAttribute('data-lens-action'), x.innerText])); const h = t.find(x => re.test(x[1])); if (!h) throw new Error('no lens button ' + re + ' in ' + JSON.stringify(t)); await hc('#idmp-lensbar button[data-lens-action="' + h[0] + '"]'); await pg.waitForTimeout(2200); };
  { await hc('#idmp-toolbar [data-tb="save"]'); await pg.waitForTimeout(1800); await hc('#idmp-tabstrip .idmp-adtab[title="TabLevel 1 · C_OrderLine"]'); await pg.waitForTimeout(1200); await hc(NEWB); await pg.waitForTimeout(900); }
  await pick('m_product_id', /Mulch/); await pg.waitForTimeout(800);
  GT.type++; await pg.fill(F('qtyentered'), '1'); await pg.locator(F('qtyentered')).first().blur().catch(() => {}); await pg.waitForTimeout(600);
  { await hc('#idmp-toolbar [data-tb="save"]'); await pg.waitForTimeout(2000); await hc('#idmp-tabstrip .idmp-adtab[title="TabLevel 0 · C_Order"]'); await pg.waitForTimeout(1000); }
  await hc('[data-doc-action="CO"]'); await pg.waitForTimeout(4500);
  const nChain = logs.length, g0 = GT.click + GT.select + GT.type;
  const openMenu = async (mid2) => {
    const ch = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); const out = []; let n = leaf.parentElement.parentElement; while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, mid2);
    for (const id of ch) { const open = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id); if (!open) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
    await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid2 + '"]'); };
  const oo = (await tip('SELECT c_order_id AS i, m_warehouse_id AS w, c_bpartner_id AS b FROM c_order WHERE c_order_id < 0 ORDER BY c_order_id DESC LIMIT 1'))[0];
  const bar0 = await gearItems(pg);
  const procLine = (id, from) => logs.slice(from).filter(l => new RegExp('§AD-PROC-LIVE proc=(' + id + '|' + (id === 118 ? 53401 : 53402) + ') .*dispatched=').test(l)).pop() || '';
  let formShip = null, formInv = null, barAfter = [], ok1 = '', ok2 = '', payForm = null, payDa = '', barPay = [];
  const payMenuId = await pg.evaluate(() => { const r = window.__idmpDb.exec("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=195 AND IsActive='Y'"); return (r.length ? r[0].values.map(x => x[0]) : []).find(i => document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + i + '"]')); });

  if (lens) {
    for (const [comp, id] of [['FO_Order_Ship', 118], ['FO_Order_Invoice', 119]]) {
      const sel = '#idmp-proc-ov [data-tbb="' + comp + '"]'; await hc('#idmp-toolbar [data-tb="process"]'); await pg.waitForSelector(sel, { timeout: 8000 }).catch(() => {});
      const from = logs.length; await hc(sel); await pg.waitForSelector('[data-proc-param]', { timeout: 15000 }).catch(() => {}); await pg.waitForTimeout(600);
      if (id === 118) formShip = await pg.evaluate(() => ({ w: (document.querySelector('[data-proc-param="M_Warehouse_ID"]') || {}).value, b: (document.querySelector('[data-proc-param="C_BPartner_ID"]') || {}).value }));
      else formInv = await pg.evaluate(() => ({ o: (document.querySelector('[data-proc-param="C_Order_ID"]') || {}).value, g: (document.querySelector('[data-proc-param="AD_Org_ID"]') || {}).value }));
      await hc('[data-proc-run]'); await pg.waitForTimeout(6000);
      (id === 118 ? (ok1 = procLine(id, from)) : (ok2 = procLine(id, from)));
      const okb = await pg.waitForSelector('#idmp-procdlg [data-procdlg-ok]', { timeout: 20000 }).then(() => true, () => false);
      if (okb) { await hc('#idmp-procdlg [data-procdlg-ok]'); await pg.waitForTimeout(1200); }
    }
    barAfter = await gearItems(pg);
    barPay = await pg.evaluate(() => Array.from(document.querySelectorAll('#idmp-lensbar button')).map(b => b.getAttribute('data-lens-action')));
    // FO-A4: Receive payment (a Payment record preset with the invoice), then the lens's own Save & Complete
    { const sel = '#idmp-lensbar button[data-lens-action="friendly-ops:next:pay"]'; await pg.waitForSelector(sel, { timeout: 8000 }).catch(() => {});
      const from = logs.length; await hc(sel);
      await pg.waitForFunction(() => { const e = document.querySelector('#idmp-inline-mount [data-col="c_invoice_id"]'); return e && e.value; }, null, { timeout: 40000 }).catch(() => {}); await pg.waitForTimeout(3000);
      payForm = await pg.evaluate(() => ({ inv: (document.querySelector('#idmp-inline-mount [data-col="c_invoice_id"]') || {}).value, amt: (document.querySelector('#idmp-inline-mount [data-col="payamt"]') || {}).value }));
      await hc('#idmp-toolbar [title^="Save"]'); await pg.waitForTimeout(2000); await hc('[data-doc-action="CO"]'); await pg.waitForTimeout(5000);
      payDa = logs.slice(from).filter(l => /§MODEL-DOCACTION table=c_payment/.test(l)).pop() || ''; }
  } else {
    for (const [mn, id] of [[193, 118], [192, 119]]) {
      await openMenu(mn); await pg.waitForSelector('[data-proc-param]', { timeout: 15000 }); await pg.waitForTimeout(800);
      const setP = async (name, v) => { const t2 = await pg.$eval('[data-proc-param="' + name + '"]', e => e.tagName).catch(() => null); if (!t2) return; GT.type++;
        if (t2 === 'SELECT') await pg.evaluate(([n, val]) => { const e = document.querySelector('[data-proc-param="' + n + '"]'); if (!Array.from(e.options).some(o => o.value === String(val))) { const o = document.createElement('option'); o.value = String(val); o.text = String(val); e.appendChild(o); } e.value = String(val); }, [name, v]);
        else await pg.fill('[data-proc-param="' + name + '"]', String(v)); };
      if (id === 118) { await setP('M_Warehouse_ID', oo.w); await setP('C_BPartner_ID', oo.b); } else { await setP('AD_Org_ID', 11); await setP('C_Order_ID', oo.i); }
      const from = logs.length; await hc('[data-proc-run]'); await pg.waitForTimeout(6000);
      (id === 118 ? (ok1 = procLine(id, from)) : (ok2 = procLine(id, from)));
    }
    { await openMenu(payMenuId); await pg.waitForSelector(NEWB, { timeout: 15000 }); await pg.waitForTimeout(800); await hc(NEWB); await pg.waitForSelector('#idmp-inline-mount .cfrow'); await pg.waitForTimeout(800);
      await pick('ad_org_id', /^HQ/); await pick('c_bpartner_id', /Joe Block/);
      const io = (await pg.$$eval('#idmp-inline-mount select[data-col="c_invoice_id"] option', x => x.map(y => ({ v: y.value, t: y.text })))).find(x => x.v && Number(x.v) < 0);
      GT.select++; await pg.selectOption(F('c_invoice_id', 'select'), io.v); await pg.waitForTimeout(2500);
      payForm = await pg.evaluate(() => ({ inv: (document.querySelector('#idmp-inline-mount [data-col="c_invoice_id"]') || {}).value, amt: (document.querySelector('#idmp-inline-mount [data-col="payamt"]') || {}).value }));
      await hc('#idmp-toolbar [title^="Save"]'); await pg.waitForTimeout(2000); const from = logs.length; await hc('[data-doc-action="CO"]'); await pg.waitForTimeout(5000);
      payDa = logs.slice(from).filter(l => /§MODEL-DOCACTION table=c_payment/.test(l)).pop() || ''; }
  }
  const chainGestures = GT.click + GT.select + GT.type - g0;
  const ev = logs.slice(nChain).map(l => /^§EVENT_SEQ n=\d+ table=(\S+) event=(\S+)/.exec(l)).filter(Boolean).map(m => m[2] + '@' + m[1]);
  const shr = await tip("SELECT docstatus AS s, c_doctype_id AS t, movementtype AS m, m_warehouse_id AS w FROM m_inout WHERE m_inout_id < 0");
  const ivr = await tip("SELECT docstatus AS s, c_doctypetarget_id AS t, grandtotal AS g, c_order_id AS o FROM c_invoice WHERE c_invoice_id < 0");
  const pay = await tip("SELECT docstatus AS s, payamt AS a, discountamt AS d, isreceipt AS r FROM c_payment WHERE c_payment_id < 0");
  const inp = await tip("SELECT ispaid AS p FROM c_invoice WHERE c_invoice_id < 0");
  const ord = await tip("SELECT SUM(qtydelivered) AS d, SUM(qtyinvoiced) AS i FROM c_orderline WHERE c_order_id < 0");
  const rowsLive = await pg.evaluate(() => { const q = t => { const r = window.__idmpDb.exec(t); return r.length ? Number(r[0].values[0][0]) : 0; }; return q('SELECT COUNT(*) FROM ad_toolbarbutton WHERE ad_toolbarbutton_id IN (53431,53432)') + q('SELECT COUNT(*) FROM ad_process WHERE ad_process_id IN (53401,53402)') + q('SELECT COUNT(*) FROM ad_process_para WHERE ad_process_id IN (53401,53402)') + q('SELECT COUNT(*) FROM ad_process_access WHERE ad_process_id IN (53401,53402)'); });
  let rowsStopped = null; if (lens) { await pg.evaluate(async () => { await window.PluginEngine._reg().system.stopBundle('org.kernel.friendly-ops'); }); await pg.waitForTimeout(500); rowsStopped = await pg.evaluate(() => { const q = t => { const r = window.__idmpDb.exec(t); return r.length ? Number(r[0].values[0][0]) : 0; }; return q('SELECT COUNT(*) FROM ad_toolbarbutton WHERE ad_toolbarbutton_id IN (53431,53432)') + q('SELECT COUNT(*) FROM ad_process WHERE ad_process_id IN (53401,53402)') + q('SELECT COUNT(*) FROM ad_process_para WHERE ad_process_id IN (53401,53402)') + q('SELECT COUNT(*) FROM ad_process_access WHERE ad_process_id IN (53401,53402)'); }); }
  return { lens, formShip, formInv, barAfter, rowsLive, rowsStopped, oo, chainGestures, ev, bar0, barPay, ok1, ok2, payForm: JSON.stringify(payForm), payDa, books: JSON.stringify({ shr, ivr, ord, pay, inp }) };
}
(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port + '/erp';
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const off = await run(base, browser, false), on = await run(base, browser, true);
    console.log('§FOA2 off=' + JSON.stringify({ g: off.chainGestures, ev: off.ev.length }) + ' on=' + JSON.stringify({ g: on.chainGestures, ev: on.ev.length, bar: on.bar0 }));
    J('A1', 'plugin not installed: no dictionary rows, no Ship/Invoice toolbar buttons', off.rowsLive === 0 && !off.bar0.some(x => /^FO_Order_/.test(x)), 'rows ' + off.rowsLive + ' bar ' + off.bar0);
    J('A2', 'plugin active: 18 dictionary rows staged and the Order tab shows Ship and Invoice as toolbar buttons at DocStatus CO', on.rowsLive === 18 && ['FO_Order_Ship', 'FO_Order_Invoice'].every(x => on.bar0.includes(x)), 'rows ' + on.rowsLive + ' bar ' + on.bar0);
    J('A3', '@SQL= DisplayLogic: once shipped and invoiced neither button is offered', !on.barAfter.some(x => /^FO_Order_/.test(x)), 'bar after ' + on.barAfter);
    J('A4', 'window-context defaults: the Ship form opens with the order\'s warehouse and partner, the Invoice form with its org and order', on.formShip && String(on.formShip.w) === String(on.oo.w) && String(on.formShip.b) === String(on.oo.b) && on.formInv && String(on.formInv.o) === String(on.oo.i) && String(on.formInv.g) === '11', JSON.stringify([on.formShip, on.formInv, on.oo]));
    J('A5', 'Stop removes every row', on.rowsStopped === 0, 'rows after stop ' + on.rowsStopped);
    if (!off.ev.length || !on.ev.length) { incon++; console.log('  INCONCLUSIVE empty event trace'); }
    J('B', 'chain gestures strictly fewer with the lens (' + on.chainGestures + ' < ' + off.chainGestures + ')', on.chainGestures < off.chainGestures);
    J('C', '§EVENT_SEQ of the two processes equal event for event (' + off.ev.length + ' vs ' + on.ev.length + ')', off.ev.length > 0 && JSON.stringify(off.ev) === JSON.stringify(on.ev), 'first diff ' + off.ev.findIndex((e, i) => e !== on.ev[i]));
    J('D', 'shipment, invoice and order quantities equal', off.books === on.books && /"s":"CO"/.test(on.books), 'off ' + off.books + ' on ' + on.books);
    J('E', 'both process runs ok=Y on the lens path', /ok=Y/.test(on.ok1) && /ok=Y/.test(on.ok2), on.ok1.slice(0, 120) + ' | ' + on.ok2.slice(0, 120));
    J('F', 'Receive payment: the preset payment completes (status CO) and the invoice is paid, identical to the plain Payment window', /ok=true status=CO/.test(on.payDa) && /ok=true status=CO/.test(off.payDa) && /"p":"Y"/.test(on.books) && JSON.parse(on.payForm).amt === JSON.parse(off.payForm).amt && Number(JSON.parse(on.payForm).amt) > 0, 'on ' + on.payForm + ' off ' + off.payForm + ' | ' + on.payDa.slice(0, 90));
  } catch (e) { console.log('§FOA2 HARNESS-FAIL ' + e.message); try { console.log('§DBG order ' + JSON.stringify(await PGX.evaluate(() => window.__crud.withModelTrx(q => ({ o: q('SELECT c_order_id,docstatus FROM c_order WHERE c_order_id<0'), j: q("SELECT 1 AS x FROM C_Order o JOIN C_OrderLine ol ON ol.C_Order_ID=o.C_Order_ID WHERE o.C_Order_ID=-2 AND o.DocStatus='CO'"), k: q("SELECT 1 AS x FROM C_Order o JOIN C_OrderLine ol ON ol.C_Order_ID=o.C_Order_ID WHERE o.C_Order_ID=-2 AND o.DocStatus='CO' AND ol.M_Product_ID IS NOT NULL AND ol.QtyOrdered<>ol.QtyDelivered"), l: q('SELECT c_order_id,m_product_id,qtyordered,qtydelivered FROM c_orderline WHERE c_order_id<0') }))))); } catch (e2) { console.log('§DBG fail ' + e2.message); } console.log(DBG.filter(l => /sqllogic/.test(l)).slice(-1).join('')); console.log(DBG.filter(l => /AD-TBB|PLUGIN|ERROR|PAGEERR|Error/.test(l)).slice(-25).join('\n')); fails++; }
  await browser.close(); srv.close();
  console.log('§FOA2_VERDICT ' + (incon ? 'INCONCLUSIVE' : fails ? 'RED' : 'GREEN') + ' judged=' + judged + ' failed=' + fails);
  process.exit(fails || incon ? 1 : 0);
})();
