// ⚠ DO NOT REMOVE — W-PLUGIN-PACKS (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §22). READ THE LOG after every run: the §WPP lines carry the evidence, exit code is not.
// THE ISSUE it proves/disproves: a bundle's 2Packs go in at plugin Start the legacy way (Incremental2PackActivator), STAY as dictionary data after Stop and across reloads
//   (the twin's dictionary DB is rebuilt from the seed every load, so the kept packs must be put back BEFORE the bundles restore), and the Libero callouts keep working after
//   Libero's own 1.0.2 nulls the AD_Column callouts (legacy: IColumnCallout extensions).
//   K1 Start on a fresh profile: AD_Package_Imp 1.0.0..1.0.3 Completed; AD_Form 53007 -> org.libero; the 1.0.3 process + button exist by UU with a sequence id (not the
//      pack-less 1000100); AD_Process_Access for the new process == the roles IsManual='N' (MProcess.afterSave), compared to the same SELECT
//   K2 reload: §PACKIN-REPLAY mode=delta, the same rows read back; the restore's Start applies 0 packs
//   K3 Stop: the rows stay, the form descriptor is gone; reload with the bundle stopped: rows replayed, still there, bundle not running (restore() brings a stopped bundle back INSTALLED, as OSGi)
//   K4 the kept fingerprint made stale: reload -> mode=full, the same rows
//   K5 negative: a pack that cannot resolve a reference -> Start refused, state INSTALLED, its records absent, 'Import Failed' recorded, no pack bytes kept
//   K6 negative (§PACKIN-CHECK): a bundle with packs that registers a form classname no AD_Form row carries -> Start refused
//   K7 New Manufacturing Order: AD_Column.Callout of PP_Order.M_Product_ID / QtyEntered is NULL, yet the product pick fills routing / BOM / UOM / batch size through
//      org.libero.callouts.Callout_PP_Order (fired count), values == the same pick on the pre-pack twin (AD_Column path, the film's recorded fact)
//   A comparison over nothing prints INCONCLUSIVE.
// Run: [WPP_BREAK=noreplay] node erp/tests/witness_plugin_packs.js > <log>
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const REPO = process.env.REPO || path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.sql': 'text/plain', '.zip': 'application/zip', '.svg': 'image/svg+xml', '.png': 'image/png' };
// negative-control packs, built here (never shipped): served under /__wpp/
const FIX = fs.mkdtempSync(path.join(os.tmpdir(), 'wpp-'));
function mkPack(dir, version, body) {
  const d = path.join(FIX, dir, '2Pack_' + version, 'dict'); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'PackOut.xml'), '<?xml version="1.0" encoding="UTF-8"?><idempiere Name="' + dir + '" Version="' + version + '" UpdateDictionary="false" Client="0-SYSTEM-System">' + body + '</idempiere>');
  execFileSync('zip', ['-qr', path.join(FIX, dir, '2Pack_' + version + '.zip'), '2Pack_' + version], { cwd: path.join(FIX, dir) });
}
const msg = (v, uu) => '<AD_Message type="table"><AD_Client_ID>0</AD_Client_ID><AD_Org_ID>0</AD_Org_ID><Value>' + v + '</Value><MsgText>wpp</MsgText><MsgType>I</MsgType><EntityType>U</EntityType><AD_Message_UU>' + uu + '</AD_Message_UU></AD_Message>';
mkPack('bad', '1.0.0', msg('WPP_NEG_1', '00000000-0000-4000-8000-00000000a001') + '<AD_Process type="table"><AD_Client_ID>0</AD_Client_ID><AD_Org_ID>0</AD_Org_ID><Value>WPP_NEG_P</Value><Name>WPP negative</Name><AccessLevel>3</AccessLevel><EntityType>U</EntityType><AD_Form_ID reference="uuid" reference-key="AD_Form">00000000-0000-4000-8000-00000000dead</AD_Form_ID><AD_Process_UU>00000000-0000-4000-8000-00000000a002</AD_Process_UU></AD_Process>');
mkPack('noform', '1.0.0', msg('WPP_NOFORM_1', '00000000-0000-4000-8000-00000000b001'));
const server = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); const fp = p.startsWith('/__wpp/') ? path.join(FIX, p.slice(7)) : path.join(REPO, p);
  fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(fp).pipe(res); }); });
let fails = 0, judged = 0;
const verdict = (id, claim, cond, info, inconclusive) => { if (inconclusive) { fails++; console.log('§WPP ' + id + ' INCONCLUSIVE ' + claim + ' ' + JSON.stringify(info).slice(0, 900)); return; }
  judged++; if (!cond) fails++; console.log('§WPP ' + id + ' ' + (cond ? 'PASS' : 'FAIL') + ' ' + claim + (cond ? '' : ' ' + JSON.stringify(info).slice(0, 1500))); };
const BUNDLE = 'org.idempiere.mfg', PUU = '6f1f9b8e-1d0a-4c55-9a3e-18c2b1f00a01', BUU = '6f1f9b8e-1d0a-4c55-9a3e-18c2b1f00a02';
(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/erp';
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 810 } });
  // WPP_BREAK=noreplay: the page's replay claims success and writes nothing (test-side only) -> K2 must go RED
  if (process.env.WPP_BREAK === 'noreplay') await context.addInitScript(() => { let v; Object.defineProperty(window, 'PipoPackIn', { configurable: true, get: () => v, set: (x) => { v = x; x.replay = (db, d) => ({ ok: true, statements: d.length }); } }); });
  const page = await context.newPage();
  const PAGELOG = []; page.on('console', m => PAGELOG.push(m.text())); page.on('pageerror', e => PAGELOG.push('PAGEERR ' + e)); page.on('dialog', async d => { PAGELOG.push('DIALOG ' + d.message()); await d.accept(); });
  const hold = (ms) => page.waitForTimeout(ms);
  const load = async () => { await page.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !!window.__idmpDb && !!window.PluginEngine && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0, null, { timeout: 60000 }); await hold(500); };
  const since = (n, re) => PAGELOG.slice(n).filter(l => re.test(l));
  // the rows the packs own, read with stable columns only (no timestamps / generated UUs)
  const snap = () => page.evaluate(({ PUU, BUU, B }) => { const db = window.__idmpDb, q = (s) => { const r = db.exec(s); return r.length ? r[0].values : []; };
    const p = q("SELECT ad_process_id, value, ad_form_id, entitytype, isactive FROM ad_process WHERE ad_process_uu='" + PUU + "'");
    return { imp: q("SELECT pk_version, pk_status FROM ad_package_imp WHERE name='" + B + "' ORDER BY pk_version"), form: q('SELECT classname FROM ad_form WHERE ad_form_id=53007'), process: p,
      button: q("SELECT ad_tab_id, ad_process_id, componentname, action, seqno FROM ad_toolbarbutton WHERE ad_toolbarbutton_uu='" + BUU + "'"),
      access: p.length ? q('SELECT ad_role_id, ad_client_id, ad_org_id, isreadwrite FROM ad_process_access WHERE ad_process_id=' + p[0][0] + ' ORDER BY ad_role_id') : [],
      calloutCols: q("SELECT COUNT(*) FROM ad_column WHERE callout LIKE 'org.eevolution.model%'"), libProcs: q("SELECT COUNT(*) FROM ad_process WHERE classname LIKE 'org.libero%'") }; }, { PUU, BUU, B: BUNDLE });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  try {
    await load();
    for (const n of ['erp_cache', 'fold_plugins']) await page.evaluate(x => new Promise(r => { const d = indexedDB.deleteDatabase(x); d.onsuccess = d.onerror = d.onblocked = () => r(); }), n);
    await load();
    const before = await snap();
    console.log('§WPP before ' + JSON.stringify(before));
    // ── K1 ──
    let n0 = PAGELOG.length;
    await page.evaluate(async (u) => { const r = window.PluginEngine._reg(); await r.installBundle(u); await r.startBundle('org.idempiere.mfg'); await window.PluginEngine.persist(); }, base + '/plugins/libero_manufacturing.mjs');
    const k1 = await snap(), startLine = since(n0, /§PACKIN-START bundle=org.idempiere.mfg/)[0] || '';
    const manualN = await page.evaluate(() => window.__idmpDb.exec("SELECT COUNT(*) FROM ad_role WHERE ismanual='N'")[0].values[0][0]);
    const manualRoles = await page.evaluate(() => window.__idmpDb.exec("SELECT ad_role_id, ad_client_id, ad_org_id FROM ad_role WHERE ismanual='N' ORDER BY ad_role_id")[0].values);
    console.log('§WPP K1 ' + startLine); since(n0, /§PACKIN (pack=|aftersave)/).forEach(l => console.log('§WPP   ' + l.slice(0, 400)));
    console.log('§WPP K1 rows ' + JSON.stringify(k1));
    const pid = k1.process.length ? Number(k1.process[0][0]) : null;
    verdict('K1', 'Start: AD_Package_Imp ' + JSON.stringify(k1.imp) + '; form 53007 ' + JSON.stringify(k1.form) + '; process by UU id=' + pid + ' -> form ' + (k1.process[0] || [])[2] + '; button ' + JSON.stringify(k1.button) +
      '; access rows ' + k1.access.length + ' == roles IsManual=N ' + manualN + ' (role/client/org each); AD_Column eevolution callouts ' + before.calloutCols + ' -> ' + k1.calloutCols,
      same(k1.imp, [['1.0.0', 'Completed successfully'], ['1.0.1', 'Completed successfully'], ['1.0.2', 'Completed successfully'], ['1.0.3', 'Completed successfully']]) && /^org\.libero\.form\.VOrderReceiptIssue$/.test(String(k1.form[0])) &&
      pid != null && pid !== 1000100 && pid > 999999 && Number(k1.process[0][2]) === 53007 && k1.button.length === 1 && Number(k1.button[0][0]) === 53054 && Number(k1.button[0][1]) === pid &&
      same(k1.access.map(r => r.slice(0, 3).map(Number)), manualRoles.map(r => r.map(Number))) && Number(k1.calloutCols[0][0]) === 0 && Number(before.calloutCols[0][0]) > 0 && / ok=true /.test(startLine),
      { k1, manualRoles, startLine }, !startLine);
    // ── K2 reload ──
    n0 = PAGELOG.length; await load();
    const k2 = await snap(), rep2 = since(n0, /§PACKIN-REPLAY bundle=org.idempiere.mfg/)[0] || '', st2 = since(n0, /§PACKIN-START bundle=org.idempiere.mfg/)[0] || '';
    console.log('§WPP K2 ' + rep2 + ' || ' + st2);
    verdict('K2', 'reload: ' + rep2.replace(/^§PACKIN-REPLAY /, '') + '; rows equal K1: ' + same(k2, k1) + '; the restore\'s Start: ' + st2.replace(/^§PACKIN-START /, ''),
      / mode=delta /.test(rep2) && same(k2, k1) && /applied=\[\] ok=true/.test(st2), { k2, rep2, st2 }, !rep2);
    // ── K3 stop, then reload stopped ──
    await page.evaluate(async () => { await window.PluginEngine._reg().stopBundle('org.idempiere.mfg'); await window.PluginEngine.persist(); });
    const k3 = await snap(), desc3 = await page.evaluate(() => !!(window.AdFormGeneric && window.AdFormGeneric.get('org.libero.form.VOrderReceiptIssue')));
    n0 = PAGELOG.length; await load();
    const k3r = await snap(), rep3 = since(n0, /§PACKIN-REPLAY bundle=org.idempiere.mfg/)[0] || '', state3 = await page.evaluate(() => { const b = window.PluginEngine._reg().get('org.idempiere.mfg'); return b ? b.state : null; });
    console.log('§WPP K3 stopped rows ' + JSON.stringify(k3) + ' descriptor=' + desc3 + ' || reload ' + rep3 + ' state=' + state3);
    verdict('K3', 'Stop: rows stay (' + same(k3, k1) + '), form descriptor registered=' + desc3 + '; reload stopped: ' + rep3.replace(/^§PACKIN-REPLAY /, '') + ' rows equal=' + same(k3r, k1) + ' state=' + state3,
      same(k3, k1) && desc3 === false && / mode=delta /.test(rep3) && same(k3r, k1) && (state3 === 'STOPPED' || state3 === 'INSTALLED'), { k3, k3r, rep3, state3 }, !rep3);
    // ── K4 stale fingerprint ──
    await page.evaluate(() => new Promise(res => { const rq = indexedDB.open('fold_plugins', 1); rq.onsuccess = () => { const db = rq.result, os = db.transaction('kv', 'readwrite').objectStore('kv'), g = os.get('packs');
      g.onsuccess = () => { const v = g.result; v['org.idempiere.mfg'].fingerprint = 'stale-by-W-PLUGIN-PACKS'; const p = os.put(v, 'packs'); p.onsuccess = () => res(); p.onerror = () => res(); }; g.onerror = () => res(); }; rq.onerror = () => res(); }));
    n0 = PAGELOG.length; await load();
    const k4 = await snap(), rep4 = since(n0, /§PACKIN-REPLAY bundle=org.idempiere.mfg/)[0] || '';
    console.log('§WPP K4 ' + rep4);
    verdict('K4', 'stale fingerprint: ' + rep4.replace(/^§PACKIN-REPLAY /, '').slice(0, 200) + '; rows equal K1 (stable columns): ' + same(k4, k1), / mode=full reason=fingerprint stale-by-W-PLUGIN-PACKS /.test(rep4) && same(k4, k1), { k4, rep4 }, !rep4);
    n0 = PAGELOG.length; await load(); const rep4b = since(n0, /§PACKIN-REPLAY bundle=org.idempiere.mfg/)[0] || '';
    console.log('§WPP K4b next load after the full re-apply: ' + rep4b);
    verdict('K4b', 'the load after a full re-apply replays the refreshed delta: ' + rep4b.replace(/^§PACKIN-REPLAY /, '').slice(0, 120), / mode=delta /.test(rep4b) && same(await snap(), k1), { rep4b }, !rep4b);
    // ── K5 negative: failing pack ──
    const k5 = await page.evaluate(async (u) => { const r = window.PluginEngine._reg(), q = (s) => window.__idmpDb.exec(s);
      const bundle = { manifest: { id: 'wpp.bad', name: 'WPP bad pack', version: '1.0.0', engineVersion: '*', packs: [u] }, activate: async () => {} };
      await r.installBundle(bundle); let err = null; try { await r.startBundle('wpp.bad'); } catch (e) { err = e.message; }
      const kept = await new Promise(res => { const rq = indexedDB.open('fold_plugins', 1); rq.onsuccess = () => { const g = rq.result.transaction('kv').objectStore('kv').get('packs'); g.onsuccess = () => res(g.result && g.result['wpp.bad'] ? (g.result['wpp.bad'].packs || []).length : 0); g.onerror = () => res(-1); }; });
      const m = q("SELECT COUNT(*) FROM ad_message WHERE value='WPP_NEG_1'")[0].values[0][0], imp = q("SELECT pk_version, pk_status FROM ad_package_imp WHERE name='wpp.bad'"), st = r.get('wpp.bad').state;
      await r.uninstallBundle('wpp.bad'); return { err, kept, m, imp: imp.length ? imp[0].values : [], st }; }, base.replace(/\/erp$/, '') + '/__wpp/bad/2Pack_1.0.0.zip');
    console.log('§WPP K5 ' + JSON.stringify(k5));
    verdict('K5', 'failing pack: Start refused (' + String(k5.err).slice(0, 120) + '), state ' + k5.st + ', its AD_Message rows ' + k5.m + ', recorded ' + JSON.stringify(k5.imp) + ', pack bytes kept ' + k5.kept,
      !!k5.err && /Pack In failed/.test(k5.err) && k5.st === 'INSTALLED' && Number(k5.m) === 0 && k5.imp.length === 1 && /^Import Failed/.test(k5.imp[0][1]) && k5.kept === 0, k5);
    // ── K6 negative: §PACKIN-CHECK ──
    const k6 = await page.evaluate(async (u) => { const r = window.PluginEngine._reg();
      const bundle = { manifest: { id: 'wpp.noform', name: 'WPP form without row', version: '1.0.0', engineVersion: '*', packs: [u] }, activate: async (ctx) => { ctx.form.register('org.wpp.NoSuchForm', { title: 'x', params: [], rows: () => [], run: () => ({ ok: true }) }); } };
      await r.installBundle(bundle); let err = null; try { await r.startBundle('wpp.noform'); } catch (e) { err = e.message; }
      const st = r.get('wpp.noform').state, desc = !!(window.AdFormGeneric && window.AdFormGeneric.get('org.wpp.NoSuchForm')); await r.uninstallBundle('wpp.noform'); return { err, st, desc }; }, base.replace(/\/erp$/, '') + '/__wpp/noform/2Pack_1.0.0.zip');
    console.log('§WPP K6 ' + JSON.stringify(k6) + ' ' + (PAGELOG.filter(l => /§PACKIN-CHECK bundle=wpp.noform/.test(l)).pop() || ''));
    verdict('K6', 'a bundle with packs registering a form no AD_Form row carries: Start refused (' + String(k6.err).slice(0, 120) + '), state ' + k6.st + ', descriptor left registered=' + k6.desc,
      !!k6.err && /PACKIN-CHECK/.test(k6.err) && k6.st === 'INSTALLED' && k6.desc === false, k6);
    // ── K7 callouts after the packs (bundle started again, GardenAdmin) ──
    await page.evaluate(async () => { await window.PluginEngine._reg().startBundle('org.idempiere.mfg'); });
    await page.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await page.waitForSelector('#idmp-login-step1:visible');
    await page.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await page.waitForSelector('#idmp-login-step2:visible');
    await page.click('#idmp-login-ok'); await page.waitForSelector('#idmp-home', { timeout: 20000 }).catch(() => {}); await hold(1500);
    await page.evaluate(() => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="53055"]'); let n = leaf.parentElement; while (n && n.id !== 'idmp-tree') { if (n.classList && n.classList.contains('idmp-node')) n.classList.add('open'); n = n.parentElement; } leaf.click(); });
    await page.waitForSelector('#idmp-toolbar [data-tb="new"]', { timeout: 20000 }); await hold(1500);
    const F = (c, t) => '#idmp-inline-mount ' + (t || 'input') + '[data-col="' + c + '"]';
    const optBy = async (col, re) => { const o = (await page.$$eval('#idmp-inline-mount select[data-col="' + col + '"] option', os => os.map(x => ({ v: x.value, t: x.text })))).find(x => x.v && re.test(x.t)); if (!o) throw new Error('no option ' + col + ' ' + re); return o; };
    const sel = async (c, re) => { await page.selectOption(F(c, 'select'), (await optBy(c, re)).v); await hold(500); };
    const st0 = await page.evaluate(() => window.AdCallout.RUNTIME.stats().fired);
    await page.click('#idmp-toolbar [data-tb="new"]'); await page.waitForSelector('#idmp-inline-mount .cfrow', { timeout: 10000 }); await hold(900);
    await sel('c_doctypetarget_id', /^Manufacturing Order/); await sel('ad_org_id', /^Fertilizer \(/); await sel('m_warehouse_id', /^Fertilizer \(/); await sel('s_resource_id', /Fertilizer Plant/);
    const prod = await optBy('m_product_id', /Fertilizer #70/); await page.selectOption(F('m_product_id', 'select'), prod.v); await hold(1500);
    const read = (cols) => page.evaluate((cs) => { const o = {}; cs.forEach(c => { const e = document.querySelector('#idmp-inline-mount [data-col="' + c + '"]'); o[c] = e ? e.value : 'absent'; }); return o; }, cols);
    const got = await read(['ad_workflow_id', 'pp_product_bom_id', 'c_uom_id', 'qtybatchsize']);
    await page.fill(F('qtyentered'), '100'); await page.locator(F('qtyentered')).dispatchEvent('change'); await hold(1000);
    const gotQ = await read(['qtyentered', 'qtyordered', 'qtybatchs']);
    const st1 = await page.evaluate(() => window.AdCallout.RUNTIME.stats().fired);
    const fired = (st1['org.libero.callouts.Callout_PP_Order'] || 0) - (st0['org.libero.callouts.Callout_PP_Order'] || 0);
    // the oracle: the SAME pick in the pre-pack twin, through the AD_Column callout org.eevolution.model.CalloutOrder.product (the film's recorded fact, bim-compiler
    //   build/erp/logs_odoo_observe/regress2/film_part1_dry.log: ad_workflow_id=Fertilizer Packing Process (50017), pp_product_bom_id=Fertilizer #70 (50005), c_uom_id=Each (100), qtybatchsize=200)
    const want = { ad_workflow_id: 50017, pp_product_bom_id: 50005, c_uom_id: 100, qtybatchsize: 200 };
    const adCallout = await page.evaluate(() => window.__idmpDb.exec("SELECT c.columnname, c.callout FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE t.tablename='PP_Order' AND c.columnname IN ('M_Product_ID','QtyEntered')")[0].values);
    console.log('§WPP K7 adColumnCallout=' + JSON.stringify(adCallout) + ' fired Callout_PP_Order=' + fired + ' product=' + JSON.stringify(got) + ' want=' + JSON.stringify(want) + ' qty=' + JSON.stringify(gotQ));
    const num = (v) => v == null || v === '' ? null : Number(v);
    verdict('K7', 'AD_Column callouts ' + JSON.stringify(adCallout) + '; the column callout org.libero.callouts.Callout_PP_Order fired ' + fired + 'x; product pick filled ' + JSON.stringify(got) + ' == ' + JSON.stringify(want) + ' (pre-pack film oracle)',
      adCallout.length === 2 && adCallout.every(r => r[1] == null) && fired >= 2 && num(got.ad_workflow_id) === num(want.ad_workflow_id) && num(got.pp_product_bom_id) === num(want.pp_product_bom_id) && num(got.c_uom_id) === num(want.c_uom_id) &&
      num(got.qtybatchsize) === want.qtybatchsize, { adCallout, fired, got, want, gotQ });
    const errs = PAGELOG.filter(l => /^PAGEERR/.test(l)); verdict('K0', 'no page errors', !errs.length, errs.slice(0, 3));
  } catch (e) { fails++; console.log('§WPP ERROR ' + (e && e.stack || e)); }
  fs.writeFileSync(path.join(os.tmpdir(), 'witness_plugin_packs.page.log'), PAGELOG.join('\n'));
  console.log('§WPP_VERDICT ' + (fails ? 'RED' : 'GREEN') + ' judged=' + judged + ' failed=' + fails + (process.env.WPP_BREAK ? ' break=' + process.env.WPP_BREAK : ''));
  await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})();
