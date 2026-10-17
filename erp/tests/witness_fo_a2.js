// ⚠ DO NOT REMOVE — W-FO-A2 (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §35). READ THE LOG; exit code is not evidence.
// ISSUE it proves/disproves: with the friendly-ops lens, a COMPLETED Standard Order offers Ship and Invoice buttons that run the SAME dictionary processes (InOutGenerate, InvoiceGenerate) with the
//   order's values preset: strictly fewer gestures than the plain chain (menu -> parameters -> Run, twice), identical §EVENT_SEQ of the two process runs, identical shipment and invoice rows.
//   Lens not installed: no Ship/Invoice buttons. INCONCLUSIVE (never PASS) if an event trace is empty or the order never reached CO.
// Run: node erp/tests/witness_fo_a2.js > <log>
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), BREAK = process.env.FOPS_BREAK || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.db': 'application/octet-stream', '.sql': 'text/plain', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': s.size }); fs.createReadStream(f).pipe(r); }); });
let judged = 0, fails = 0, incon = 0;
const J = (id, name, cond, d) => { judged++; if (!cond) fails++; console.log('  ' + (cond ? '✅ ' : '❌ ') + id + ' ' + name + (d ? ' — ' + String(d).slice(0, 220) : '')); };

async function run(base, browser, lens) {
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 810 } })).newPage();
  const logs = []; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => logs.push('PAGEERR ' + e.message)); pg.on('dialog', d => d.accept());
  const GT = { click: 0, select: 0, type: 0 };
  await pg.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
  for (const n of ['erp_cache', 'fold_plugins']) await pg.evaluate(x => new Promise(r => { const q = indexedDB.deleteDatabase(x); q.onsuccess = q.onerror = q.onblocked = () => r(); }), n);
  await pg.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
  await pg.waitForFunction(() => !!window.__idmpDb && !!window.PluginEngine && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 30000 });
  await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
  await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
  await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0);
  if (lens) await pg.evaluate(async (a) => { if (a.brk) globalThis.__FOPS_BREAK = a.brk; const r = window.PluginEngine._reg(); await r.installBundle(a.u); await r.startBundle('org.kernel.friendly-ops'); }, { u: base + '/plugins/friendly_ops.mjs', brk: BREAK });
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
  { await hc('#idmp-toolbar [title^="Save"]'); await pg.waitForTimeout(1800); await hc('#idmp-tabstrip .idmp-adtab[title="TabLevel 1 · C_OrderLine"]'); await pg.waitForTimeout(1200); await hc(NEWB); await pg.waitForTimeout(900); }
  await pick('m_product_id', /Mulch/); await pg.waitForTimeout(800);
  GT.type++; await pg.fill(F('qtyentered'), '1'); await pg.locator(F('qtyentered')).first().blur().catch(() => {}); await pg.waitForTimeout(600);
  { await hc('#idmp-toolbar [title^="Save"]'); await pg.waitForTimeout(2000); await hc('#idmp-tabstrip .idmp-adtab[title="TabLevel 0 · C_Order"]'); await pg.waitForTimeout(1000); }
  await hc('[data-doc-action="CO"]'); await pg.waitForTimeout(4500);
  const nChain = logs.length, g0 = GT.click + GT.select + GT.type;
  const openMenu = async (mid2) => {
    const ch = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); const out = []; let n = leaf.parentElement.parentElement; while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, mid2);
    for (const id of ch) { const open = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id); if (!open) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
    await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid2 + '"]'); };
  const oo = (await tip('SELECT c_order_id AS i, m_warehouse_id AS w, c_bpartner_id AS b FROM c_order WHERE c_order_id < 0 ORDER BY c_order_id DESC LIMIT 1'))[0];
  const bar0 = await pg.evaluate(() => Array.from(document.querySelectorAll('#idmp-lensbar button')).map(b => b.getAttribute('data-lens-action')));
  const procLine = (id, from) => logs.slice(from).filter(l => new RegExp('§AD-PROC-LIVE proc=' + id + ' .*dispatched=').test(l)).pop() || '';
  let ok1 = '', ok2 = '';
  if (lens) {
    for (const [act, id] of [['friendly-ops:next:ship', 118], ['friendly-ops:next:invoice', 119]]) {
      const sel = '#idmp-lensbar button[data-lens-action="' + act + '"]'; await pg.waitForSelector(sel, { timeout: 8000 }).catch(() => {});
      const from = logs.length; await hc(sel); await pg.waitForTimeout(6000);
      (id === 118 ? (ok1 = procLine(id, from)) : (ok2 = procLine(id, from)));
      const okb = await pg.waitForSelector('#idmp-procdlg [data-procdlg-ok]', { timeout: 20000 }).then(() => true, () => false);
      if (okb) { await hc('#idmp-procdlg [data-procdlg-ok]'); await pg.waitForTimeout(1200); }   // the result dialog's OK (a real gesture, counted)
    }
    // the order window is still on screen: refresh state for the second button
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
  }
  const chainGestures = GT.click + GT.select + GT.type - g0;
  const ev = logs.slice(nChain).map(l => /^§EVENT_SEQ n=\d+ table=(\S+) event=(\S+)/.exec(l)).filter(Boolean).map(m => m[2] + '@' + m[1]);
  const shr = await tip("SELECT docstatus AS s, c_doctype_id AS t, movementtype AS m, m_warehouse_id AS w FROM m_inout WHERE m_inout_id < 0");
  const ivr = await tip("SELECT docstatus AS s, c_doctypetarget_id AS t, grandtotal AS g, c_order_id AS o FROM c_invoice WHERE c_invoice_id < 0");
  const ord = await tip("SELECT SUM(qtydelivered) AS d, SUM(qtyinvoiced) AS i FROM c_orderline WHERE c_order_id < 0");
  return { lens, chainGestures, ev, bar0, ok1, ok2, books: JSON.stringify({ shr, ivr, ord }) };
}
(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port + '/erp';
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const off = await run(base, browser, false), on = await run(base, browser, true);
    console.log('§FOA2 off=' + JSON.stringify({ g: off.chainGestures, ev: off.ev.length }) + ' on=' + JSON.stringify({ g: on.chainGestures, ev: on.ev.length, bar: on.bar0 }));
    J('A1', 'lens not installed: no Ship/Invoice buttons on the completed order', !off.bar0.some(x => /next:/.test(x)), off.bar0);
    J('A2', 'lens installed: Ship and Invoice are offered on the completed order', ['friendly-ops:next:ship', 'friendly-ops:next:invoice'].every(x => on.bar0.includes(x)), on.bar0);
    if (!off.ev.length || !on.ev.length) { incon++; console.log('  INCONCLUSIVE empty event trace'); }
    J('B', 'chain gestures strictly fewer with the lens (' + on.chainGestures + ' < ' + off.chainGestures + ')', on.chainGestures < off.chainGestures);
    J('C', '§EVENT_SEQ of the two processes equal event for event (' + off.ev.length + ' vs ' + on.ev.length + ')', off.ev.length > 0 && JSON.stringify(off.ev) === JSON.stringify(on.ev), 'first diff ' + off.ev.findIndex((e, i) => e !== on.ev[i]));
    J('D', 'shipment, invoice and order quantities equal', off.books === on.books && /"s":"CO"/.test(on.books), 'off ' + off.books + ' on ' + on.books);
    J('E', 'both process runs ok=Y on the lens path', /ok=Y/.test(on.ok1) && /ok=Y/.test(on.ok2), on.ok1.slice(0, 120) + ' | ' + on.ok2.slice(0, 120));
  } catch (e) { console.log('§FOA2 HARNESS-FAIL ' + e.message); fails++; }
  await browser.close(); srv.close();
  console.log('§FOA2_VERDICT ' + (incon ? 'INCONCLUSIVE' : fails ? 'RED' : 'GREEN') + ' judged=' + judged + ' failed=' + fails);
  process.exit(fails || incon ? 1 : 0);
})();
