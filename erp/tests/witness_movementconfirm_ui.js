// ⚠ DO NOT REMOVE — W-MOVEMENTCONFIRM-UI (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §70). READ THE LOG; exit code is not evidence.
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..'), BREAK = process.env.MCU_BREAK || '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.db': 'application/octet-stream', '.sql': 'text/plain', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': s.size }); fs.createReadStream(f).pipe(r); }); });
let judged = 0, fails = 0, incon = 0;
const J = (id, name, cond, d) => { judged++; if (!cond) fails++; console.log('  ' + (cond ? '✅ ' : '❌ ') + id + ' ' + name + (d ? ' — ' + String(d).slice(0, 300) : '')); };
// ISSUES it proves/disproves (found while filming the in-transit move, 2026-10-23): the §61 port (MMovementConfirm) could be driven by code but NOT from the screen:
//   U1 the Move Confirmation window offered no Complete (M_MovementConfirm, ad_table 738, was not in the DocAction family list of ad_docfsm.js);
//   U2 a Confirmed Qty typed on the confirm line never stored the Difference: the update op skipped every read-only column, including what the model's beforeSave derives into one
//      (MMovementLineConfirm.beforeSave :170-172, Difference = Target - Confirmed) - generic crud_core.buildOp, not a movement special case.
//   Everything after is judged as accounting invariants (§62: legacy is never touched, no oracle): stock out of the source = stock into the target + what left as inventory documents;
//   the Difference document sits at the SOURCE locator, the Scrapped one at the TARGET (MMovementConfirm.createDifferenceDoc :497-591); every fact set balances per schema.
// Negative controls (MUST turn red): MCU_BREAK=nofam (family 738 removed -> U1), MCU_BREAK=noderived (buildOp ignores ctx.derived -> U2 and the Difference document).
// Run: [MCU_BREAK=nofam|noderived] node erp/tests/witness_movementconfirm_ui.js > <log>     Zero judged prints INCONCLUSIVE.
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
    // twin-only fixture (§62: the pilot has no in-transit doctype and legacy config is not changed): a copy of Material Movement with IsInTransit=Y
    await pg.evaluate(() => { const db = window.__idmpDb; const cols = db.exec('PRAGMA table_info(c_doctype)')[0].values.map(r => r[1]).filter(c => c !== 'c_doctype_id' && c !== 'c_doctype_uu');
      db.run('INSERT INTO c_doctype (c_doctype_id,' + cols.join(',') + ') SELECT 9100143,' + cols.join(',') + ' FROM c_doctype WHERE c_doctype_id=143');
      db.run("UPDATE c_doctype SET isintransit='Y', name='Inventory Move (in transit)' WHERE c_doctype_id=9100143"); });
    await pg.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await pg.waitForSelector('#idmp-login-step1:visible');
    await pg.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await pg.waitForSelector('#idmp-login-step2:visible'); await pg.click('#idmp-login-ok');
    await pg.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0);
    if (BREAK === 'nofam') await pg.evaluate(() => { delete window.AdDocFsm.DOC_FAMILY[738]; });
    if (BREAK === 'noderived') await pg.evaluate(() => { const o = window.CrudCore.buildOp; window.CrudCore.buildOp = function (v, e, vals, orig, ctx) { return o.call(this, v, e, vals, orig, Object.assign({}, ctx, { derived: null })); }; });
    const tip = (sql) => pg.evaluate(s => window.__crud.withModelTrx(q => q(s)), sql);
    const F = (c, t) => '#idmp-inline-mount ' + (t || 'input') + '[data-col="' + c + '"]';
    const click = async (sel) => { const l = pg.locator(sel).first(); await l.scrollIntoViewIfNeeded().catch(() => {}); await l.click(); await pg.waitForTimeout(450); };
    const pick = async (col, re) => { const o = (await pg.$$eval('#idmp-inline-mount select[data-col="' + col + '"] option', x => x.map(y => ({ v: y.value, t: y.text })))).find(x => x.v && re.test(x.t)); if (!o) throw new Error('no option ' + col + ' ' + re); await pg.selectOption(F(col, 'select'), o.v); await pg.waitForTimeout(600); };
    const openWin = async (w) => { const mid = await pg.evaluate(w => { const r = window.__idmpDb.exec("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=" + w + " AND IsActive='Y'"); return (r.length ? r[0].values.map(x => x[0]) : []).find(i => document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + i + '"]')); }, w);
      await pg.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); let n = leaf.parentElement; while (n && n.id !== 'idmp-tree') { if (n.classList && n.classList.contains('idmp-node')) n.classList.add('open'); n = n.parentElement; } leaf.click(); }, mid);
      await pg.waitForSelector('#idmp-toolbar [data-tb="new"]', { state: 'attached', timeout: 20000 }); await pg.waitForTimeout(900); };
    const PROD = 124, SRC = 101, TGT = 102, OUTQ = 10, GOT = 8, SCRAP = 1;
    const oh = async (loc) => Number((await tip('SELECT COALESCE(SUM(qtyonhand),0) AS q FROM m_storageonhand WHERE m_product_id=' + PROD + ' AND m_locator_id=' + loc))[0].q);
    const s0 = { src: await oh(SRC), tgt: await oh(TGT) };
    // the in-transit Inventory Move, typed on the screen: header (HQ Warehouse -> Store Central), one line of 10 Elm Tree, Complete -> In Progress + a Move Confirm
    await openWin(170); await click('#idmp-toolbar [data-tb="new"]'); await pg.waitForSelector('#idmp-inline-mount .cfrow'); await pg.waitForTimeout(600);
    await pick('c_doctype_id', /in transit/i); await pick('ad_org_id', /^HQ/); await pick('m_warehouse_id', /HQ Warehouse/); await pick('m_warehouseto_id', /Store Central/);
    await click('#idmp-toolbar [data-tb="save"]'); await pg.waitForTimeout(1800);
    await click('#idmp-tabstrip .idmp-adtab[title="TabLevel 1 · M_MovementLine"]'); await pg.waitForTimeout(1000); await click('#idmp-toolbar [data-tb="new"]'); await pg.waitForTimeout(1000);
    // the locators are CHOSEN from the Locator lookups (W-LOCATOR-LOOKUP), not typed
    await pick('m_product_id', /Elm Tree/); await pg.selectOption(F('m_locator_id', 'select'), String(SRC)); await pg.selectOption(F('m_locatorto_id', 'select'), String(TGT)); await pg.fill(F('qtyentered'), String(OUTQ)); await pg.locator(F('qtyentered')).first().blur().catch(() => {}); await pg.waitForTimeout(500);
    await click('#idmp-toolbar [data-tb="save"]'); await pg.waitForTimeout(2000);
    await click('#idmp-tabstrip .idmp-adtab[title="TabLevel 0 · M_Movement"]'); await pg.waitForSelector('[data-doc-action="CO"]'); await click('[data-doc-action="CO"]'); await pg.waitForTimeout(3500);
    const mv = (await tip('SELECT m_movement_id AS i, docstatus AS s FROM m_movement WHERE m_movement_id<0 ORDER BY m_movement_id LIMIT 1'))[0];
    const cf = (await tip('SELECT m_movementconfirm_id AS i, docstatus AS s FROM m_movementconfirm WHERE m_movement_id=' + (mv && mv.i)))[0];
    if (!mv || mv.s !== 'IP' || !cf) { incon++; console.log('  INCONCLUSIVE the in-transit move did not reach In Progress with a confirm ' + JSON.stringify({ mv, cf })); return; }
    console.log('§MCU move ' + JSON.stringify(mv) + ' confirm ' + JSON.stringify(cf) + ' stock before ' + JSON.stringify(s0));
    // the Move Confirmation window, from the menu
    await openWin(333); if (await pg.locator('#idmp-find-ov').count()) { await click('#idmp-find-ov [data-find-ok]'); await pg.waitForTimeout(1000); }
    await click('#idmp-toolbar [data-tb="toggle"]'); await pg.waitForTimeout(800);
    if (!(await pg.locator('.idmp-grid tbody tr').count())) { await click('#idmp-toolbar [data-tb="toggle"]'); await pg.waitForTimeout(800); }
    await click('#idmp-toolbar [data-tb="toggle"]'); await pg.waitForTimeout(800);   // form view of the (only) confirm
    const acts = await pg.$$eval('[data-doc-action]', e => e.map(x => x.getAttribute('data-doc-action')));
    J('U1', 'the Move Confirmation window offers Complete on a Drafted confirm (M_MovementConfirm in the DocAction family, MMovementConfirm = generic getValidActions)', acts.indexOf('CO') >= 0, 'actions=' + JSON.stringify(acts));
    if (acts.indexOf('CO') < 0) return;
    // the line: 8 of 10 arrived, 1 scrapped; the stored Difference must be Target - Confirmed = 2 (legacy beforeSave), typed values only
    await click('#idmp-tabstrip .idmp-adtab[title="TabLevel 1 · M_MovementLineConfirm"]'); await pg.waitForTimeout(1200);
    if (await pg.locator('.idmp-grid tbody tr').count()) { await click('#idmp-toolbar [data-tb="toggle"]'); await pg.waitForTimeout(800); }
    await pg.fill(F('confirmedqty'), String(GOT)); await pg.locator(F('confirmedqty')).first().blur(); await pg.waitForTimeout(400);
    await pg.fill(F('scrappedqty'), String(SCRAP)); await pg.locator(F('scrappedqty')).first().blur(); await pg.waitForTimeout(400);
    await click('#idmp-toolbar [data-tb="save"]'); await pg.waitForTimeout(1800);
    const cl = (await tip('SELECT targetqty AS t, confirmedqty AS c, scrappedqty AS s, differenceqty AS d FROM m_movementlineconfirm WHERE m_movementconfirm_id=' + cf.i))[0];
    J('U2', 'a Confirmed Qty saved on the screen stores Difference = Target - Confirmed (the model-derived value on a read-only column is written)', Number(cl.d) === OUTQ - GOT && Number(cl.c) === GOT && Number(cl.s) === SCRAP, JSON.stringify(cl));
    await click('#idmp-tabstrip .idmp-adtab[title="TabLevel 0 · M_MovementConfirm"]'); await pg.waitForSelector('[data-doc-action="CO"]'); await click('[data-doc-action="CO"]'); await pg.waitForTimeout(5000);
    const cf1 = (await tip('SELECT docstatus AS s, m_inventory_id AS inv FROM m_movementconfirm WHERE m_movementconfirm_id=' + cf.i))[0], mv1 = (await tip('SELECT docstatus AS s FROM m_movement WHERE m_movement_id=' + mv.i))[0];
    J('U3', 'Complete on the confirm completes it AND its Inventory Move (MMovementConfirm.completeIt -> runDocumentActionWorkflow(move, CO))', cf1.s === 'CO' && mv1.s === 'CO', JSON.stringify({ cf1, mv1 }));
    const invs = await tip('SELECT i.m_inventory_id AS id, i.docstatus AS s, i.m_warehouse_id AS w, l.m_locator_id AS loc, l.qtybook AS b, l.qtycount AS c FROM m_inventory i JOIN m_inventoryline l ON l.m_inventory_id=i.m_inventory_id WHERE i.m_inventory_id<0 ORDER BY i.m_inventory_id');
    const dSrc = invs.filter(x => Number(x.loc) === SRC), dTgt = invs.filter(x => Number(x.loc) === TGT);
    J('U4', 'Difference 2 became a completed inventory document at the SOURCE locator, Scrapped 1 one at the TARGET locator (createDifferenceDoc :501-587)',
      dSrc.length === 1 && dTgt.length === 1 && dSrc[0].s === 'CO' && dTgt[0].s === 'CO' && Number(dSrc[0].b) - Number(dSrc[0].c) === OUTQ - GOT && Number(dTgt[0].b) - Number(dTgt[0].c) === SCRAP, JSON.stringify(invs));
    const s1 = { src: await oh(SRC), tgt: await oh(TGT) };
    // qty conserved: what left the source = what the target gained + what the target scrapped (leaves as an I- line at the target) ; the 2 'difference' units leave the source as an I- line
    J('U5', 'stock is conserved: source -(confirmed + difference) = -10, target +confirmed - scrapped = +7 (the 3 lost units are exactly the two inventory documents)', s1.src - s0.src === -OUTQ && s1.tgt - s0.tgt === GOT - SCRAP, JSON.stringify({ before: s0, after: s1 }));
    const bad = await tip('SELECT c_acctschema_id AS s, ad_org_id AS o, ROUND(SUM(amtacctdr)-SUM(amtacctcr),2) AS d FROM fact_acct WHERE record_id<0 GROUP BY 1,2 HAVING ABS(SUM(amtacctdr)-SUM(amtacctcr))>0.005');
    const nf = Number((await tip('SELECT COUNT(*) AS n FROM fact_acct WHERE record_id<0'))[0].n);
    J('U6', 'every fact set of this session balances per schema and per organisation (and some were written)', nf > 0 && bad.length === 0, 'facts=' + nf + ' unbalanced=' + JSON.stringify(bad));
    J('U7', 'no page errors', !logs.some(l => /^PAGEERR/.test(l)), logs.filter(l => /^PAGEERR/.test(l)).slice(0, 2).join(' | '));
  } catch (e) { fails++; console.log('  ❌ HARNESS ' + (e && e.stack || e)); }
  finally { await browser.close(); srv.close(); console.log('§MCU-SUMMARY ' + (fails ? 'FAIL' : (judged === 0 || incon) ? 'INCONCLUSIVE' : 'PASS') + ' judged=' + judged + ' fails=' + fails + ' inconclusive=' + incon + (BREAK ? ' break=' + BREAK : '')); process.exit(fails ? 1 : (judged === 0 || incon) ? 3 : 0); }
})();
