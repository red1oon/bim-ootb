// ⚠ DO NOT REMOVE — W-GEN-TIPREAD (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §32). READ THE LOG; exit code is not evidence.
// ISSUE it proves/disproves: an order CREATED and COMPLETED in this session (a signed op-log row, IsSOTrx defaulted by the model at write) can be shipped and invoiced through
//   Generate Shipments / Generate Invoices. Before: the process gates read the order through the raw fold, which lacks the model's defaults -> "Order is not a Sales Order" (ok=N).
//   G1 shipment process ok=Y rows>=1   G2 invoice process ok=Y rows>=1   G3 an M_InOut and a C_Invoice row exist for the order   INCONCLUSIVE if the order never reached CO.
// Run: [REPO=<tree>] node erp/tests/witness_gen_tipread.js > <log>
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = process.env.REPO || path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': s.size }); fs.createReadStream(f).pipe(r); }); });
let pass = 0, fail = 0, inconclusive = 0;
const ok = (id, name, cond, detail) => { console.log((cond ? '  ✅ ' : '  ❌ ') + id + ' ' + name + (detail ? ' — ' + detail : '')); cond ? pass++ : fail++; };

(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 810 } })).newPage();
  const logs = [], errs = []; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('http://localhost:' + srv.address().port + '/erp/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
  await pg.waitForFunction(() => !!window.__idmpDb, null, { timeout: 30000 });
  await pg.waitForFunction(() => document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0);
  await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
  await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
  await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0);
  const tip = (sql) => pg.evaluate(s => window.__crud.withModelTrx(q => q(s)), sql);   // tip-shadowed read: bundle + this session's signed ops
  const GT={click:0,select:0,type:0}; const hc = async (sel) => { GT.click++; const l = pg.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click(); await pg.waitForTimeout(350); };
  const opts = (col) => pg.$$eval('#idmp-inline-mount select[data-col="' + col + '"] option', o => o.map(x => ({ v: x.value, t: x.text }))).catch(() => []);
  const F = (c, t) => '#idmp-inline-mount ' + (t || 'input') + '[data-col="' + c + '"]';
  const pick = async (col, re) => { GT.select++; const o = (await opts(col)).find(x => x.v && re.test(x.t)); if (!o) throw new Error('no option ' + col + ' ' + re); await pg.selectOption(F(col, 'select'), o.v); await pg.waitForTimeout(450); return o.t; };
  const PROD = 137;   // Mulch — costed (the pilot posts its shipment; Oak Tree's is Posted=E there, see ERP_DEPTH_FILM.md §6)
  const onhand = async () => (await tip('SELECT COALESCE(SUM(qtyonhand),0) AS n FROM m_storageonhand WHERE m_product_id=' + PROD))[0].n;

  // open Sales Order (window 143) through the menu
  const mid = await pg.evaluate(() => { const r = window.__idmpDb.exec("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=143 AND IsActive='Y'");
    return (r.length ? r[0].values.map(x => x[0]) : []).find(i => document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + i + '"]')); });
  const chain = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); const out = []; let n = leaf.parentElement.parentElement;
    while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, mid);
  for (const id of chain) { const open = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id);
    if (!open) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
  await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid + '"]');
  const NEWB = '#idmp-toolbar [data-tb="new"]'; await pg.waitForSelector(NEWB); await pg.waitForTimeout(800);

  const G0={...GT}; const oh0 = await onhand(), tx0 = (await tip('SELECT COUNT(*) AS n FROM m_transaction'))[0].n;
  console.log('§TWIN_MENU clicks='+GT.click); console.log('§DEPTH before onhand(' + PROD + ')=' + oh0 + ' m_transaction=' + tx0);

  // ── D1 · New POS Order, number left as shown
  await hc(NEWB); await pg.waitForSelector('#idmp-inline-mount .cfrow'); await pg.waitForTimeout(600);
  await pick('c_doctypetarget_id', new RegExp('^Standard Order')); await pick('c_bpartner_id', /Joe Block/); await pick('ad_org_id', /^HQ/);
  const docnoShown = await pg.$eval(F('documentno'), e => e.value);
  let n0 = logs.length; await hc('#idmp-toolbar [title^="Save"]'); await pg.waitForTimeout(1800);
  const s1 = logs.slice(n0);
  ok('D1', 'a New order saved with the preview number ("' + docnoShown + '") is NOT rejected by the numeric pin',
    !s1.some(l => /§CRUD validate key=c_order verb=create REJECT/.test(l)) && s1.some(l => /§CRUD validate key=c_order verb=create ok/.test(l)),
    (s1.filter(l => /§CRUD validate key=c_order verb=create/.test(l)).pop() || 'no validate line').slice(0, 120));
  ok('D1b', 'the sequence number is allocated at save (PO.saveNew)', s1.some(l => /§DOCNO table=c_order docno=\d+ .*via=ModelTrade\.MSequence/.test(l)), (s1.filter(l => /§DOCNO /.test(l)).pop() || '').slice(0, 130));

  // line: Mulch × 1
  await hc('#idmp-tabstrip .idmp-adtab[title="TabLevel 1 · C_OrderLine"]'); await pg.waitForTimeout(1200);
  await hc(NEWB); await pg.waitForTimeout(900);
  await pick('m_product_id', /Mulch/); await pg.waitForTimeout(800);
  GT.type++; await pg.fill(F('qtyentered'), '1'); await pg.locator(F('qtyentered')).first().blur().catch(() => {}); await pg.waitForTimeout(600);
  await hc('#idmp-toolbar [title^="Save"]'); await pg.waitForTimeout(2000);
  await hc('#idmp-tabstrip .idmp-adtab[title="TabLevel 0 · C_Order"]'); await pg.waitForTimeout(1000);
 

  // ── D2/D3 · Complete
  n0 = logs.length; await hc('[data-doc-action="CO"]'); await pg.waitForTimeout(4500);
  const c = logs.slice(n0), da = c.filter(l => /§MODEL-DOCACTION table=c_order/.test(l)).pop() || '';
  ok('D2', 'Complete on an order typed this session reaches the model layer and succeeds (not "no lines")', /ok=true status=CO/.test(da), da.slice(0, 160));
  const tables = (da.match(/tables=(\{.*?\})(?: msg|$)/) || [])[1] || '', has = t => new RegExp('"' + t + ':CREATE"').test(tables) || new RegExp('"' + t + ':UPDATE"').test(tables);
  ok('D3b', 'the group is signed and chain-verified', c.some(l => /§CRUD process committed key=c_order viaGroup=Y .*verifyChain=ok/.test(l)));
  const openMenu = async (mid2) => {
    const ch = await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); const out = []; let n = leaf.parentElement.parentElement; while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, mid2);
    for (const id of ch) { const open = await pg.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id); if (!open) await hc('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
    await hc('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid2 + '"]'); };
  const ordSt = (await tip('SELECT docstatus AS s FROM c_order WHERE c_order_id < 0'));
  if (!ordSt.length || ordSt[0].s !== 'CO') { inconclusive++; console.log('§GTR INCONCLUSIVE the session order never reached CO: ' + JSON.stringify(ordSt)); }
  const res = {};
  for (const [mn, attr, tag] of [[193, 'data-genship-order', 'G1'], [192, 'data-geninv-order', 'G2']]) {
    await openMenu(mn); await pg.waitForSelector('select[' + attr + ']', { timeout: 15000 }); await pg.waitForTimeout(800);
    const o = (await pg.$$eval('select[' + attr + '] option', x => x.map(y => ({ v: y.value, t: y.text })))).filter(x => x.v && Number(x.v) < 0).pop();
    if (!o) { ok(tag, 'the session order is offered by the picker', false, 'no negative-id option'); continue; }
    await pg.selectOption('select[' + attr + ']', o.v); const nn = logs.length;
    await hc('[data-proc-run]'); await pg.waitForTimeout(2500); await hc('[data-genprocess-confirm]').catch(() => {}); await pg.waitForTimeout(4000);
    const line = logs.slice(nn).filter(l => /§AD-PROC-LIVE proc=\d+ .*dispatched=/.test(l)).pop() || '';
    ok(tag, (tag === 'G1' ? 'Generate Shipments' : 'Generate Invoices') + ' on the session-made order: ok=Y rows>=1', /ok=Y/.test(line) && /rows=[1-9]/.test(line), line.slice(0, 260));
  }
  const io = await tip('SELECT COUNT(*) AS n FROM m_inout WHERE m_inout_id < 0'), iv = await tip('SELECT COUNT(*) AS n FROM c_invoice WHERE c_invoice_id < 0');
  ok('G3', 'an M_InOut and a C_Invoice row now exist for it', Number(io[0].n) >= 1 && Number(iv[0].n) >= 1, 'inout=' + io[0].n + ' invoice=' + iv[0].n);
  console.log('§GTR_VERDICT ' + (inconclusive ? 'INCONCLUSIVE' : fail ? 'RED' : 'GREEN') + ' pass=' + pass + ' fail=' + fail);
  await browser.close(); srv.close(); process.exit(fail || inconclusive ? 1 : 0);
})().catch(e => { console.log('§GTR HARNESS-FAIL ' + e.message); process.exit(2); });
