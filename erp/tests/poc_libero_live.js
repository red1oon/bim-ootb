// ⚠ DO NOT REMOVE — W-LIBERO-LIVE (Libero bundle slice 1; spec prompts/mfg/LIBERO_BUNDLE_SLICE1_SPEC.md). READ THE LOG: §LIBERO-LIVE lines carry the evidence.
// THE ISSUE it proves/disproves, in a REAL browser through the page's own paths: the Libero bundle (plugins/libero_manufacturing.mjs) installed + STARTED lazily survives a reload as STARTING with its menu rows staged at boot, so the
//   "Manufacturing Order" leaf is in the tree although NO code has run; clicking the leaf ACTIVATES the bundle (before the window renders); a PP_Order committed through the commit funnel (__crud.applyOp) then gets its BOM
//   explosion + MRP rows written by the bundle's model classes (host route: AFTER_SAVE); 0 page errors.
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.db': 'application/octet-stream' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/erp/idempiere.html'; const f = path.join(ROOT, p);
  fs.stat(f, (e, s) => { if (e || s.isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }); });
let fails = 0; const ok = (n, c, i) => { if (!c) fails++; console.log('  §LIBERO-LIVE ' + n + ' ' + (c ? 'PASS' : 'FAIL') + (c ? '' : ' ' + JSON.stringify(i))); };
(async () => {
  await new Promise(r => srv.listen(0, r)); const port = srv.address().port, base = `http://localhost:${port}/erp/idempiere.html?seed=ad_seed.db&login=GardenAdmin&lang=en_US`;
  const browser = await chromium.launch({ args: ['--no-sandbox'] }); const pg = await (await browser.newContext()).newPage();
  const logs = [], errs = []; pg.on('console', m => logs.push(m.text())); pg.on('pageerror', e => errs.push(e.message));
  const boot = async () => { await pg.goto(base, { waitUntil: 'networkidle' });
    await pg.waitForSelector('#idmp-tree', { timeout: 20000 }).catch(async () => { const u = await pg.$('#idmp-login-users .idmp-login-user:not(.disabled)'); if (u) { await u.click(); const o = await pg.$('#idmp-login-ok'); if (o) await o.click(); } await pg.waitForSelector('#idmp-tree', { timeout: 15000 }).catch(() => {}); });
    await pg.waitForFunction(() => !!window.__idmpDb && !!window.PluginEngine, null, { timeout: 30000 }); await pg.waitForTimeout(1500); };
  const leaf = () => pg.evaluate(() => !!document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="53055"]'));
  const st = () => pg.evaluate(() => { const r = window.PluginEngine._reg(), x = r.get('org.idempiere.mfg'); return { state: x ? x.state : null, model: !!(window.ModelLayer && window.ModelLayer.MODEL.pp_order) }; });
  await boot();
  ok('V0 before install: no Manufacturing Order leaf, no bundle, no pp_order model class', !(await leaf()) && (await st()).state === null && !(await st()).model, await st());
  await pg.evaluate(async (u) => { const r = window.PluginEngine._reg(); await r.installBundle(u); await r.startBundle('org.idempiere.mfg');
    await new Promise((res, rej) => { const rq = indexedDB.open('fold_plugins', 1); rq.onupgradeneeded = () => rq.result.createObjectStore('kv'); rq.onsuccess = () => { const tx = rq.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put(r.list(), 'bundles'); tx.oncomplete = res; tx.onerror = rej; }; rq.onerror = rej; }); }, `http://localhost:${port}/erp/plugins/libero_manufacturing.mjs`);
  console.log('§LIBERO-LIVE-1 after START: ' + JSON.stringify(await st()));
  await boot();
  const s2 = await st(), l2 = await leaf();
  console.log('§LIBERO-LIVE-2 after RELOAD: ' + JSON.stringify(s2) + ' leaf53055InTree=' + l2);
  ok('V1 after a plain reload the bundle is STARTING (restored at boot), NO pp_order model class yet, and the menu leaf is in the tree (2Pack rows staged at boot)', s2.state === 'STARTING' && !s2.model && l2, { s2, l2 });
  // scene 2: the OPENING SCREEN (Home) of the reloaded page, bundle still STARTING (no code run), already carries the Manufacturing indicator + goal from the bundle's dictionary rows
  const dg = logs.filter(l => /§DASH-GADGET/.test(l)), ds = dg.filter(l => /docstatus indicators/.test(l)).pop() || '', pf = dg.filter(l => /performance goals/.test(l)).pop() || '';   // the LAST ones = the reloaded page
  console.log('§LIBERO-LIVE-2b opening screen: ' + ds.slice(0, 260) + ' || ' + pf.slice(0, 260));
  ok('V1b the opening screen shows "Manufacturing Orders to complete=<n>" on the Activities gadget and "Manufacturing Output: <pct>%" on the Performance gadget while the bundle is only STARTING', /Manufacturing Orders to complete=\d+/.test(ds) && /Manufacturing Output: \d+%/.test(pf) && s2.state === 'STARTING', { ds: ds.slice(0, 200), pf: pf.slice(0, 200) });
  const m3 = logs.length; await pg.evaluate(() => document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="53055"]').click()); await pg.waitForTimeout(3500);
  const l3 = logs.slice(m3), iAct = l3.findIndex(l => /§PLUGIN-ACTIVATE id=org.idempiere.mfg/.test(l)), iWin = l3.findIndex(l => /§IDEMPIERE window=Manufacturing Order\(53009\)/.test(l)), s3 = await st();
  console.log('§LIBERO-LIVE-3 after clicking the leaf: ' + JSON.stringify(s3) + ' activate@' + iAct + ' windowOpen@' + iWin);
  ok('V2 clicking the menu leaf ACTIVATED the bundle before the window rendered (ACTIVE, model class registered)', s3.state === 'ACTIVE' && s3.model && iAct >= 0 && iWin > iAct, { s3, iAct, iWin });
  // the host commit funnel: a PP_Order through applyOp -> sidecar; the bundle's model classes explode the BOM + write MRP
  const out = await pg.evaluate(async () => {
    const f = { ad_client_id: 11, ad_org_id: 50006, documentno: 'LIVE-1', m_product_id: 136, pp_product_bom_id: 50004, qtyordered: 100, m_warehouse_id: 50002, c_uom_id: 100, ad_workflow_id: 50017, qtybatchsize: 100,
      datestartschedule: '2008-08-16 00:00:00', datefinishschedule: '2008-08-17 00:00:00', datepromised: '2008-08-17 00:00:00', docstatus: 'DR', docaction: 'CO', isactive: 'Y' };
    window.__crud.applyOp({ op_type: 'CRUD_CREATE', key: 'pp_order', table: 'pp_order', verb: 'create', fields: f }); await new Promise(r => setTimeout(r, 4000));
    const k = window.__crud.kernelDb && window.__crud.kernelDb(); if (!k) return { noKernel: true };
    const rows = (k.exec('SELECT * FROM kernel_ops ORDER BY 1')[0] || { values: [] }).values.map(v => { try { const o = JSON.parse(v[4]); o.op_type = v[3]; return o; } catch (e) { return null; } }).filter(o => o && o.table && /^pp_/.test(o.table));
    const by = {}, upd = {}; rows.forEach(o => { const m = o.op_type === 'CRUD_CREATE' ? by : upd; m[o.table] = (m[o.table] || 0) + 1; });
    return { by, upd, lines: rows.filter(o => o.table === 'pp_order_bomline').map(o => [o.fields.line, o.fields.m_product_id, o.fields.qtyrequiered, o.fields.qtyreserved]), mrp: rows.filter(o => o.table === 'pp_mrp').map(o => [o.fields.typemrp, o.fields.qty]) };
  });
  console.log('§LIBERO-LIVE-4 funnel result: ' + JSON.stringify(out));
  const mas = logs.filter(l => /§MODEL-AFTER-SAVE table=pp_order /.test(l)).pop() || '';
  console.log('§LIBERO-LIVE-5 shipped log line: ' + mas);
  ok('V3 a PP_Order committed through the funnel is sealed with 1 BOM header + 2 lines (5050.51 / 100, reserved = required) + MRP 1 supply + 2 demand + 1 routing workflow (+ 1 update setting its start node) + 1 routing node, all written by the bundle (op log + the shipped §MODEL-AFTER-SAVE line agree)', !out.noKernel && out.by.pp_order === 1 && out.by.pp_order_bom === 1 && out.by.pp_order_bomline === 2 && out.by.pp_mrp === 3 && out.by.pp_order_workflow === 1 && out.by.pp_order_node === 1 && out.upd.pp_order_workflow === 1 && Number(out.lines[0][2]) === 5050.51 && Number(out.lines[1][2]) === 100 && /"pp_order_bom":1,"pp_order_bomline":2,"pp_mrp":3/.test(mas), out);
  // V5 PO.save semantics: an order whose afterSave REFUSES (no routing) must not be sealed at all (rollback), not sealed-with-a-log-line
  const mR = logs.length;
  const nr = await pg.evaluate(async () => {
    const f = { ad_client_id: 11, ad_org_id: 50006, documentno: 'LIVE-NOROUTE', m_product_id: 136, pp_product_bom_id: 50004, qtyordered: 10, m_warehouse_id: 50002, c_uom_id: 100, datestartschedule: '2008-08-16 00:00:00', datepromised: '2008-08-17 00:00:00', docstatus: 'DR', docaction: 'CO', isactive: 'Y' };
    window.__crud.applyOp({ op_type: 'CRUD_CREATE', key: 'pp_order', table: 'pp_order', verb: 'create', fields: f }); await new Promise(r => setTimeout(r, 3000));
    const k = window.__crud.kernelDb(); const rows = (k.exec('SELECT * FROM kernel_ops ORDER BY 1')[0] || { values: [] }).values.map(v => { try { return JSON.parse(v[4]); } catch (e) { return null; } }).filter(Boolean);
    return rows.filter(o => o.fields && o.fields.documentno === 'LIVE-NOROUTE').length;
  });
  const lr = logs.slice(mR);
  console.log('§LIBERO-LIVE-6 refused order: sealed rows named LIVE-NOROUTE=' + nr + ' | ' + lr.filter(l => /MODEL-AFTER-SAVE|MODEL-SAVE-ROLLBACK/.test(l)).join(' || ').slice(0, 300));
  ok('V5 an order refused by the model (no routing) is ROLLED BACK: nothing sealed, §MODEL-SAVE-ROLLBACK logged (legacy PO.save: afterSave false => the trx rolls back)', nr === 0 && lr.some(l => /§MODEL-SAVE-ROLLBACK table=pp_order/.test(l)), { nr, lr: lr.slice(0, 4) });
  const cls = await pg.evaluate(() => ({ cc: !!window.ModelLayer.MODEL.pp_cost_collector, ccDoc: !!window.ModelLayer.docActionFor('pp_cost_collector'), orderDoc: !!window.ModelLayer.docActionFor('pp_order'), trade: !!window.ModelTrade, cost: !!window.ModelCost, master: !!window.ModelMaster }));
  console.log('§LIBERO-LIVE-7 cost side in the real page: ' + JSON.stringify(cls));
  ok('V6 the cost side is live in the real page: PP_Cost_Collector model + DocAction, the PP_Order DocAction, and the core ports the chunks reuse (ModelTrade / ModelCost / ModelMaster) are all present', cls.cc && cls.ccDoc && cls.orderDoc && cls.trade && cls.cost && cls.master, cls);
  ok('V4 zero page errors', errs.length === 0, errs.slice(0, 3));
  console.log('§LIBERO-LIVE-VERDICT ' + (fails ? 'FAIL' : 'PASS') + ' failed=' + fails); await browser.close(); srv.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('§LIBERO-LIVE-VERDICT FAIL harness: ' + e.stack); process.exit(2); });
