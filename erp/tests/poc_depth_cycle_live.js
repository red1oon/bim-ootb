// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness W-DEPTH-CYCLE (bim-compiler prompts/ERP_DEPTH_FILM.md §5). READ tests/poc_depth_cycle_live.log
//   before any conclusion — exit code is not evidence.
// THE ISSUES this proves/disproves (each assertion names its own):
//   D1  a New Sales Order left with the document-number PREVIEW can be saved (was REJECT regex:docno_numeric — PO.saveNew:3571 treats
//       "<n>"/the issued preview as empty and allocates at save)                      → §DOCNO … via=ModelTrade.MSequence, no REJECT
//   D2  Complete on an order typed in THIS session reaches the model layer (was refused "Cannot complete an order with no lines":
//       MOrder.hasLines read 0 because the model path hands the hook ctx.trx, not lineCount)   → §MODEL-DOCACTION ok=true
//   D3  a POS Order (DocSubTypeSO=WR) generates Shipment + Invoice + stock move + postings in ONE signed group (MOrder.completeIt:2181-2200)
//   D4  Zoom Across from the order lists the documents it just generated (was destinations=0: counted the bare bundle, not the tip)
//   D5  drilling into the generated Shipment opens it filtered to this order, Completed, with a Posted button
//   D6  StorageOnHand of the sold product moved by exactly −qty and an M_Transaction C- of −qty exists; Fact_Acct of each generated
//       document balances (ΣDR = ΣCR)
//   Verdict INCONCLUSIVE (never PASS) when the order never completed or the before/after stock reads are identical (a no-op).
// Run: node tests/poc_depth_cycle_live.js 2>&1 | tee tests/poc_depth_cycle_live.log        (cwd = bim-ootb/erp)
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
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
  const hc = async (sel) => { const l = pg.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click(); await pg.waitForTimeout(350); };
  const opts = (col) => pg.$$eval('#idmp-inline-mount select[data-col="' + col + '"] option', o => o.map(x => ({ v: x.value, t: x.text }))).catch(() => []);
  const F = (c, t) => '#idmp-inline-mount ' + (t || 'input') + '[data-col="' + c + '"]';
  const pick = async (col, re) => { const o = (await opts(col)).find(x => x.v && re.test(x.t)); if (!o) throw new Error('no option ' + col + ' ' + re); await pg.selectOption(F(col, 'select'), o.v); await pg.waitForTimeout(450); return o.t; };
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

  const oh0 = await onhand(), tx0 = (await tip('SELECT COUNT(*) AS n FROM m_transaction'))[0].n;
  console.log('§DEPTH before onhand(' + PROD + ')=' + oh0 + ' m_transaction=' + tx0);

  // ── D1 · New POS Order, number left as shown
  await hc(NEWB); await pg.waitForSelector('#idmp-inline-mount .cfrow'); await pg.waitForTimeout(600);
  await pick('c_doctypetarget_id', /^POS Order/); await pick('c_bpartner_id', /Joe Block/); await pick('ad_org_id', /^HQ/);
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
  await pg.fill(F('qtyentered'), '1'); await pg.locator(F('qtyentered')).first().blur().catch(() => {}); await pg.waitForTimeout(600);
  await hc('#idmp-toolbar [title^="Save"]'); await pg.waitForTimeout(2000);
  await hc('#idmp-tabstrip .idmp-adtab[title="TabLevel 0 · C_Order"]'); await pg.waitForTimeout(1000);
  await hc('#idmp-toolbar [data-tb="toggle"]'); await pg.waitForTimeout(900);

  // ── D2/D3 · Complete
  n0 = logs.length; await hc('[data-doc-action="CO"]'); await pg.waitForTimeout(4500);
  const c = logs.slice(n0), da = c.filter(l => /§MODEL-DOCACTION table=c_order/.test(l)).pop() || '';
  ok('D2', 'Complete on an order typed this session reaches the model layer and succeeds (not "no lines")', /ok=true status=CO/.test(da), da.slice(0, 160));
  const tables = (da.match(/tables=(\{.*?\})(?: msg|$)/) || [])[1] || '', has = t => new RegExp('"' + t + ':CREATE"').test(tables) || new RegExp('"' + t + ':UPDATE"').test(tables);
  ok('D3', 'ONE group wrote shipment + invoice + stock + transaction + postings', ['m_inout', 'c_invoice', 'm_storageonhand', 'm_transaction', 'fact_acct'].every(has), tables.slice(0, 220));
  ok('D3b', 'the group is signed and chain-verified', c.some(l => /§CRUD process committed key=c_order viaGroup=Y .*verifyChain=ok/.test(l)));

  // ── D4 · Zoom Across
  n0 = logs.length; await hc('#idmp-toolbar [title^="Zoom Across"]'); await pg.waitForTimeout(1800);
  const z = logs.slice(n0).filter(l => /§ZOOM-ACROSS table=C_Order/.test(l)).pop() || '';
  ok('D4', 'Zoom Across lists the generated Shipment (Customer) and Sales Invoice', /Shipment \(Customer\)\(1\)/.test(z) && /Sales Invoice and Credit\/Debit Note\(1\)/.test(z), z.slice(0, 200));
  // ── D5 · drill into the Shipment
  await pg.locator('#idmp-zoom-ov >> text=Shipment (Customer)').first().click(); await pg.waitForTimeout(2000);
  const st = await pg.$eval('#idmp-status', e => e.innerText).catch(() => ''), row = await pg.$$eval('.idmp-grid tbody tr[data-ad-record]', e => e.map(x => x.innerText.replace(/\s+/g, ' ')));
  ok('D5', 'the Shipment window opens filtered to this order: 1 record, Completed, Posted button', /Shipment \(Customer\)/.test(st) && row.length === 1 && /Completed/.test(row[0]) && /Posted/.test(row[0]), st + ' | ' + (row[0] || '').slice(0, 90));

  // ── D7 · the Posted button on the generated Shipment shows its books (was source=none coverage=absent: readPostings folds the older POST journal)
  await pg.locator('.idmp-posted-btn.is-posted').first().click(); await pg.waitForTimeout(1800);
  const pv = await pg.evaluate(() => ({ lines: [...document.querySelectorAll('#posted-overlay .posted-line')].map(x => x.innerText.replace(/\s+/g, ' ')),
    bal: (document.querySelector('#posted-overlay .posted-balance') || {}).innerText, cov: (document.querySelector('#posted-overlay .posted-cov-chip') || {}).innerText }));
  ok('D7', 'Posted on the generated Shipment: COGS Dr 2.70 / Inventory asset Cr 2.70, Balanced, coverage complete',
    pv.lines.some(l => /^51100 .*2\.70 *0?\.?0*$|^51100 .* 2\.70 0\.00$/.test(l) || /51100.*2\.70 0\.00/.test(l)) && pv.lines.some(l => /14120.*0\.00 2\.70/.test(l)) && pv.bal === 'Balanced' && pv.cov === 'complete', JSON.stringify(pv));

  // ── D6 · stock + books
  const oh1 = await onhand(), tx = await tip("SELECT movementtype,movementqty FROM m_transaction WHERE m_product_id=" + PROD + " AND m_transaction_id<0");
  console.log('§DEPTH after onhand(' + PROD + ')=' + oh1 + ' newTransactions=' + JSON.stringify(tx));
  if (oh1 === oh0) { console.log('§DEPTH INCONCLUSIVE stock read identical before/after — a no-op, nothing judged'); inconclusive++; }
  ok('D6a', 'StorageOnHand moved by exactly −1', oh1 - oh0 === -1, 'before=' + oh0 + ' after=' + oh1);
  ok('D6b', 'an M_Transaction C- of −1 exists for the product', tx.some(t => t.movementtype === 'C-' && Number(t.movementqty) === -1), JSON.stringify(tx));
  const bal = await tip("SELECT ad_table_id,record_id,c_acctschema_id,ROUND(SUM(amtacctdr),2) dr,ROUND(SUM(amtacctcr),2) cr FROM fact_acct WHERE fact_acct_id<0 OR record_id<0 GROUP BY ad_table_id,record_id,c_acctschema_id");
  ok('D6c', 'every generated document balances in every schema (ΣDR = ΣCR) and there is at least one', bal.length > 0 && bal.every(b => b.dr === b.cr), JSON.stringify(bal).slice(0, 260));
  ok('D0', '0 page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  const verdict = fail ? 'FAIL' : (inconclusive ? 'INCONCLUSIVE' : 'PASS');
  console.log('\n§DEPTH-CYCLE ' + verdict + ' pass=' + pass + ' fail=' + fail + ' inconclusive=' + inconclusive);
  await browser.close(); srv.close(); process.exit(fail || inconclusive ? 1 : 0);
})().catch(e => { console.log('§DEPTH-CYCLE HARNESS-FAIL ' + e.message); process.exit(2); });
