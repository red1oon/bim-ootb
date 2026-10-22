// ⚠ DO NOT REMOVE — W-PROCPARA-DYNAMIC (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §70). READ THE LOG; exit code is not evidence.
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), BREAK = process.env.RPD_BREAK || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.db': 'application/octet-stream', '.sql': 'text/plain', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': s.size }); fs.createReadStream(f).pipe(r); }); });
let judged = 0, fails = 0, incon = 0;
const J = (id, name, cond, d) => { judged++; if (!cond) fails++; console.log('  ' + (cond ? '✅ ' : '❌ ') + id + ' ' + name + (d ? ' — ' + String(d).slice(0, 300) : '')); };
// ISSUE it proves/disproves (found while filming the Replenish Report, 2026-10-23): the generic process-parameter panel judged DisplayLogic ONCE, against the defaults, and rendered a parameter whose
//   AD_Val_Rule names another parameter (C_DocType.DocBaseType='@ReplenishmentCreate@') as a bare number box. So "Create = Purchase Order" never asked for the Document Type and the report could not create anything from the screen.
//   Legacy: ProcessParameterPanel.valueChange :1078-1094 -> processDependencies + dynamicDisplay :1240-1283 (every parameter shown/hidden by its DisplayLogic against the CURRENT values).
//   P1 Document Type is hidden while Create is blank and shown once Create = Purchase Order; P2 its list is exactly the doctypes whose DocBaseType is that value (re-filtered when Create changes to Inventory Movement);
//   P3 hidden again for Production (DisplayLogic !'PRD'); P4 Run creates purchase orders whose lines equal the report rows' Qty To Order (T_Replenish), a Draft document each; P5 no page errors.
//   Negative controls (MUST turn red): RPD_BREAK=alwayshow (the evaluator says visible) -> P1; RPD_BREAK=norule (the parameter loses its AD_Val_Rule) -> P2.
// Run: [RPD_BREAK=alwayshow|norule] node erp/tests/witness_procpara_dynamic.js > <log>     Zero judged prints INCONCLUSIVE.
(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port + '/erp';
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 810 } })).newPage();
  const logs = []; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => logs.push('PAGEERR ' + e.message)); pg.on('dialog', d => d.accept());
  try {
    await pg.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    for (const n of ['erp_cache', 'fold_plugins']) await pg.evaluate(x => new Promise(r => { const q = indexedDB.deleteDatabase(x); q.onsuccess = q.onerror = q.onblocked = () => r(); }), n);
    await pg.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    await pg.waitForFunction(() => !!window.__idmpDb && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 30000 });
    if (BREAK === 'norule') await pg.evaluate(() => window.__idmpDb.run('UPDATE ad_process_para SET ad_val_rule_id=NULL WHERE ad_process_id=53267 AND columnname=\'C_DocType_ID\''));
    await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
    await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
    await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0);
    if (BREAK === 'alwayshow') await pg.evaluate(() => { window.AdEvaluator.evaluate = () => true; });
    const q = (sql) => pg.evaluate(s => window.__crud.withModelTrx(x => x(s)), sql);
    await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); let n = leaf.parentElement; while (n && n.id !== 'idmp-tree') { if (n.classList && n.classList.contains('idmp-node')) n.classList.add('open'); n = n.parentElement; } leaf.click(); }, 53354);
    await pg.waitForSelector('#idmp-content [data-proc-run]', { timeout: 15000 }); await pg.waitForTimeout(800);
    const P = (c) => '#idmp-content [data-proc-param="' + c + '"]';
    const shown = (c) => pg.locator(P(c)).first().isVisible().catch(() => false);
    const docOpts = () => pg.$$eval(P('C_DocType_ID') + ' option', o => o.filter(x => x.value).map(x => x.value + '=' + x.text));
    const dbDocs = async (base) => (await q("SELECT c_doctype_id AS i, name AS n FROM c_doctype WHERE docbasetype='" + base + "' AND isactive='Y' AND ad_client_id IN (0,11) ORDER BY name")).map(r => r.i + '=' + r.n);
    const h0 = await shown('C_DocType_ID');
    await pg.selectOption(P('ReplenishmentCreate'), 'POO'); await pg.waitForTimeout(600);
    const h1 = await shown('C_DocType_ID'), o1 = await docOpts(), e1 = await dbDocs('POO');
    J('P1', 'Document Type is hidden while Create is blank and shown once Create = Purchase Order (dynamicDisplay on change)', h0 === false && h1 === true, 'blank=' + h0 + ' POO=' + h1);
    J('P2', 'its list is exactly the Purchase Order doctypes (AD_Val_Rule C_DocType Replenish Report, re-queried on change) and follows Create to Inventory Movement',
      e1.length > 0 && JSON.stringify(o1.slice().sort()) === JSON.stringify(e1.slice().sort()) && await (async () => { await pg.selectOption(P('ReplenishmentCreate'), 'MMM'); await pg.waitForTimeout(500); const o2 = await docOpts(), e2 = await dbDocs('MMM'); return e2.length > 0 && JSON.stringify(o2.slice().sort()) === JSON.stringify(e2.slice().sort()); })(), 'POO=' + JSON.stringify(o1) + ' expected=' + JSON.stringify(e1));
    await pg.selectOption(P('ReplenishmentCreate'), 'PRD'); await pg.waitForTimeout(500);
    J('P3', 'Document Type is hidden again for Production (DisplayLogic @ReplenishmentCreate@!\'PRD\')', (await shown('C_DocType_ID')) === false, '');
    await pg.selectOption(P('ReplenishmentCreate'), 'POO'); await pg.waitForTimeout(500);
    if (!(await docOpts()).length) { incon++; console.log('  INCONCLUSIVE no purchase-order document type is offered'); return; }
    await pg.selectOption(P('M_Warehouse_ID'), '103'); const o = (await docOpts())[0].split('=')[0]; await pg.selectOption(P('C_DocType_ID'), o); await pg.waitForTimeout(300);
    await pg.click('#idmp-content [data-proc-run]'); await pg.waitForFunction(() => /OK #|Failed/.test((document.querySelector('#idmp-content') || {}).innerText || ''), null, { timeout: 60000 }).catch(() => {}); await pg.waitForTimeout(1500);
    console.log('§RPD result ' + (await pg.evaluate(() => (document.querySelector('#idmp-content') || {}).innerText.replace(/\s+/g, ' ').slice(0, 200))));
    const rep = await q('SELECT m_product_id AS p, qtytoorder AS q FROM t_replenish WHERE qtytoorder>0 ORDER BY m_product_id');
    const lines = await q('SELECT l.m_product_id AS p, SUM(l.qtyordered) AS q FROM c_orderline l JOIN c_order o ON o.c_order_id=l.c_order_id WHERE o.c_order_id<0 GROUP BY l.m_product_id ORDER BY l.m_product_id');
    const hdr = await q('SELECT docstatus AS s, issotrx AS so FROM c_order WHERE c_order_id<0');
    J('P4', 'Run creates Draft purchase orders whose product quantities equal the report rows\' Qty To Order', rep.length > 0 && JSON.stringify(rep.map(r => r.p + ':' + Number(r.q))) === JSON.stringify(lines.map(r => r.p + ':' + Number(r.q))) && hdr.length > 0 && hdr.every(h => h.s === 'DR' && h.so === 'N'), 'report=' + JSON.stringify(rep) + ' lines=' + JSON.stringify(lines) + ' headers=' + JSON.stringify(hdr));
    J('P5', 'no page errors', !logs.some(l => /^PAGEERR/.test(l)), logs.filter(l => /^PAGEERR/.test(l)).slice(0, 2).join(' | '));
  } catch (e) { fails++; console.log('  ❌ HARNESS ' + (e && e.stack || e)); }
  finally { await browser.close(); srv.close(); console.log('§RPD-SUMMARY ' + (fails ? 'FAIL' : (judged === 0 || incon) ? 'INCONCLUSIVE' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' inconclusive=' + incon + (BREAK ? ' break=' + BREAK : '')); process.exit(fails ? 1 : (judged === 0 || incon) ? 3 : 0); }
})();
