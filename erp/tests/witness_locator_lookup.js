// ⚠ DO NOT REMOVE — W-LOCATOR-LOOKUP (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §71). READ THE LOG; exit code is not evidence.
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), BREAK = process.env.WLL_BREAK || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.db': 'application/octet-stream', '.sql': 'text/plain', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p); fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': s.size }); fs.createReadStream(f).pipe(r); }); });
let judged = 0, fails = 0, incon = 0;
const J = (id, name, cond, d) => { judged++; if (!cond) fails++; console.log('  ' + (cond ? '✅ ' : '❌ ') + id + ' ' + name + (d ? ' — ' + String(d).slice(0, 320) : '')); };
// ISSUE it proves/disproves (found while documenting the in-transit move, 2026-10-23): DisplayType 31 (Locator) was mapped to a plain text box by crud_core.mapRefDisplayType, so a user had to TYPE a locator's numeric id
//   on an Inventory Move line (a recorder then "worked around" it by typing 101 / 102). Legacy: WLocatorEditor over MLocatorLookup (M_Locator), narrowed by the column's AD_Val_Rule. 47 dictionary columns carry DisplayType 31.
//   L1 the Locator and Locator To fields of the Move line are SELECTS; L2 the Locator list = exactly the active locators the column's AD_Val_Rule admits (M_MovementLine.M_Locator_ID: warehouses of the header's organisation)
//   and Locator To = every active locator of the client (no rule); L3 a locator CHOSEN from the list (nothing typed) is stored on the saved line; L4 the mapping is the generic one: every DisplayType-31 column of the dictionary
//   (N printed) maps to a lookup on M_Locator, whatever the column is called (M_LocatorTo_ID included).
//   Negative control (MUST turn red): WLL_BREAK=text (the mapping restored to 'string') -> L1.  Zero judged prints INCONCLUSIVE.
// Run: [WLL_BREAK=text] node erp/tests/witness_locator_lookup.js > <log>
(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port + '/erp';
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 810 } })).newPage();
  const logs = []; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => logs.push('PAGEERR ' + e.message)); pg.on('dialog', d => d.accept());
  try {
    await pg.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    for (const n of ['erp_cache', 'fold_plugins']) await pg.evaluate(x => new Promise(r => { const q = indexedDB.deleteDatabase(x); q.onsuccess = q.onerror = q.onblocked = () => r(); }), n);
    if (BREAK === 'text') await pg.addInitScript(() => { const iv = setInterval(() => { if (window.CrudCore && window.CrudCore.mapRefDisplayType) { const o = window.CrudCore.mapRefDisplayType; window.CrudCore.mapRefDisplayType = (r) => Number(r) === 31 ? 'string' : o(r); clearInterval(iv); } }, 1); });
    await pg.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    await pg.waitForFunction(() => !!window.__idmpDb && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 30000 });
    await pg.evaluate(() => { const db = window.__idmpDb; const cols = db.exec('PRAGMA table_info(c_doctype)')[0].values.map(r => r[1]).filter(c => c !== 'c_doctype_id' && c !== 'c_doctype_uu');
      db.run('INSERT INTO c_doctype (c_doctype_id,' + cols.join(',') + ') SELECT 9100143,' + cols.join(',') + ' FROM c_doctype WHERE c_doctype_id=143'); db.run("UPDATE c_doctype SET isintransit='Y', name='Inventory Move (in transit)' WHERE c_doctype_id=9100143"); });
    await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
    await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
    await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0);
    const tip = (sql) => pg.evaluate(s => window.__crud.withModelTrx(q => q(s)), sql), db = (sql) => pg.evaluate(s => { const r = window.__idmpDb.exec(s); return r.length ? r[0].values : []; }, sql);
    const F = (c, t) => '#idmp-inline-mount ' + (t || 'input') + '[data-col="' + c + '"]';
    const click = async (sel) => { const l = pg.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click(); await pg.waitForTimeout(450); };
    const pick = async (col, re) => { const o = (await pg.$$eval('#idmp-inline-mount select[data-col="' + col + '"] option', x => x.map(y => ({ v: y.value, t: y.text })))).find(x => x.v && re.test(x.t)); if (!o) throw new Error('no option ' + col + ' ' + re); await pg.selectOption(F(col, 'select'), o.v); await pg.waitForTimeout(600); return o; };
    const mid = await pg.evaluate(() => { const r = window.__idmpDb.exec("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=170 AND IsActive='Y'"); return r[0].values.map(x => x[0]).find(i => document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + i + '"]')); });
    await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); let n = leaf.parentElement; while (n && n.id !== 'idmp-tree') { if (n.classList && n.classList.contains('idmp-node')) n.classList.add('open'); n = n.parentElement; } leaf.click(); }, mid);
    await pg.waitForSelector('#idmp-toolbar [data-tb="new"]', { state: 'attached' }); await pg.waitForTimeout(900); await click('#idmp-toolbar [data-tb="new"]'); await pg.waitForSelector('#idmp-inline-mount .cfrow'); await pg.waitForTimeout(600);
    await pick('c_doctype_id', /in transit/i); await pick('ad_org_id', /^HQ/); await pick('m_warehouse_id', /HQ Warehouse/); await pick('m_warehouseto_id', /Store Central/);
    await click('#idmp-toolbar [data-tb="save"]'); await pg.waitForTimeout(1800);
    await click('#idmp-tabstrip .idmp-adtab[title="TabLevel 1 · M_MovementLine"]'); await pg.waitForTimeout(900); await click('#idmp-toolbar [data-tb="new"]'); await pg.waitForTimeout(1200);
    const tag = (c) => pg.$eval('#idmp-inline-mount [data-col="' + c + '"]:not(span)', e => e.tagName.toLowerCase()).catch(() => null);
    const t1 = await tag('m_locator_id'), t2 = await tag('m_locatorto_id');
    J('L1', 'Locator and Locator To on the Move line are lookups (select), not text boxes', t1 === 'select' && t2 === 'select', 'm_locator_id=' + t1 + ' m_locatorto_id=' + t2);
    if (t1 !== 'select') return;
    await pick('m_product_id', /Elm Tree/);
    const opts = async (c) => (await pg.$$eval(F(c, 'select') + ' option', o => o.filter(x => x.value).map(x => Number(x.value)))).sort((a, b) => a - b);
    const o1 = await opts('m_locator_id'), o2 = await opts('m_locatorto_id');
    const e1 = (await db("SELECT m_locator_id FROM m_locator WHERE isactive='Y' AND ad_client_id IN (0,11) AND m_warehouse_id IN (SELECT m_warehouse_id FROM m_warehouse WHERE isactive='Y' AND ad_org_id=11) ORDER BY 1")).map(r => Number(r[0]));
    const e2 = (await db("SELECT m_locator_id FROM m_locator WHERE isactive='Y' AND ad_client_id IN (0,11) ORDER BY 1")).map(r => Number(r[0]));
    J('L2', 'Locator = the active locators its AD_Val_Rule admits (warehouses of the header organisation); Locator To = every active locator of the client', e1.length > 0 && e2.length > e1.length && JSON.stringify(o1) === JSON.stringify(e1) && JSON.stringify(o2) === JSON.stringify(e2), 'locator=' + o1.length + '/' + e1.length + ' locatorTo=' + o2.length + '/' + e2.length);
    const from = (await pg.$$eval(F('m_locator_id', 'select') + ' option', o => o.filter(x => x.value).map(x => ({ v: x.value, t: x.text })))).find(x => /Default HQ/i.test(x.t)), to = (await pg.$$eval(F('m_locatorto_id', 'select') + ' option', o => o.filter(x => x.value).map(x => ({ v: x.value, t: x.text })))).find(x => /Default Store/i.test(x.t));
    if (!from || !to) { incon++; console.log('  INCONCLUSIVE no Default HQ / Default Store locator in the lists ' + JSON.stringify({ from, to })); return; }
    await pg.selectOption(F('m_locator_id', 'select'), from.v); await pg.selectOption(F('m_locatorto_id', 'select'), to.v); await pg.fill(F('qtyentered'), '2'); await pg.locator(F('qtyentered')).first().blur().catch(() => {}); await pg.waitForTimeout(500);
    await click('#idmp-toolbar [data-tb="save"]'); await pg.waitForTimeout(2000);
    const line = (await tip('SELECT m_locator_id AS a, m_locatorto_id AS b, movementqty AS q FROM m_movementline WHERE m_movementline_id<0'))[0];
    J('L3', 'locators CHOSEN from the lists (nothing typed) are stored on the saved line', line && String(line.a) === from.v && String(line.b) === to.v && Number(line.q) === 2, JSON.stringify({ chosen: [from.t, to.t], stored: line }));
    const n31 = Number((await db('SELECT COUNT(*) FROM ad_column WHERE ad_reference_id=31'))[0][0]), mapped = await pg.evaluate(() => window.CrudCore.mapRefDisplayType(31));
    J('L4', 'the mapping is generic: DisplayType 31 -> lookup for all ' + n31 + ' dictionary columns that carry it', n31 > 0 && mapped === 'fk', 'columns=' + n31 + ' mapRefDisplayType(31)=' + mapped);
    J('L5', 'no page errors', !logs.some(l => /^PAGEERR/.test(l)), logs.filter(l => /^PAGEERR/.test(l)).slice(0, 2).join(' | '));
  } catch (e) { fails++; console.log('  ❌ HARNESS ' + (e && e.stack || e)); }
  finally { await browser.close(); srv.close(); console.log('§WLL-SUMMARY ' + (fails ? 'FAIL' : (judged === 0 || incon) ? 'INCONCLUSIVE' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' inconclusive=' + incon + (BREAK ? ' break=' + BREAK : '')); process.exit(fails ? 1 : (judged === 0 || incon) ? 3 : 0); }
})();
