// ⚠ DO NOT REMOVE — W-FO-OPTIN (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §30). READ THE LOG; exit code is not evidence.
// ISSUE it proves/disproves: the friendly plugin is OFFERED in the Plugin Engine and OFF by default (twin untouched); one Install click turns the lens buttons on, they survive a
//   reload, Stop removes them, Uninstall puts the offer back. INCONCLUSIVE (never PASS) if the Sales Order window never reached a New form.
//   O1 fresh profile: no lens bar on a New Sales Order, bundle not installed, offer row present   O2 Install click: ACTIVE + lens bar   O3 reload: still ACTIVE + bar
//   O4 Stop: no bar; Uninstall: offer back, no bar
// Run: node erp/tests/witness_fo_optin.js > <log>
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');
const REPO = process.env.REPO || path.join(__dirname, '..', '..'), ID = 'org.kernel.friendly-ops';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.sql': 'text/plain' };
const server = http.createServer((req, res) => { const p = decodeURIComponent(req.url.split('?')[0]); const fp = path.join(REPO, p);
  fs.stat(fp, (e, st) => { if (e || st.isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Content-Length': st.size }); fs.createReadStream(fp).pipe(res); }); });
let judged = 0, fails = 0, incon = 0;
const J = (id, claim, cond, info) => { judged++; if (!cond) fails++; console.log('§WFO ' + id + ' ' + (cond ? 'PASS' : 'FAIL') + ' ' + claim + (cond ? '' : ' ' + JSON.stringify(info).slice(0, 600))); };
(async () => {
  await new Promise(r => server.listen(0, r)); const base = 'http://localhost:' + server.address().port + '/erp';
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })).newPage(); const LOG = [];
  page.on('console', m => LOG.push(m.text())); page.on('pageerror', e => LOG.push('PAGEERR ' + e));
  const ready = () => page.waitForFunction(() => !!window.__idmpDb && !!window.PluginEngine && !!window.PluginEngine._reg() && document.querySelector('#idmp-login-clients') && document.querySelector('#idmp-login-clients').children.length > 0 && !!document.getElementById('idmp-pill'), null, { timeout: 60000 });
  const state = () => page.evaluate((id) => { const r = window.PluginEngine._reg().get(id); return r ? r.state : null; }, ID);
  const login = async () => { await page.click("#idmp-login-clients .idmp-login-user:has(.nm:text-is('GardenWorld'))"); await page.waitForSelector('#idmp-login-step1:visible');
    await page.click("#idmp-login-users .idmp-login-user:has(.nm:text-is('GardenAdmin'))"); await page.waitForSelector('#idmp-login-step2:visible'); await page.click('#idmp-login-ok');
    await page.waitForFunction(() => document.querySelector('#idmp-tree') && document.querySelector('#idmp-tree').children.length > 0, null, { timeout: 30000 }); await page.waitForTimeout(1000); };
  // open Sales Order (window 143) and press New; returns whether the New form reached and whether a lens bar is drawn
  const newOrderBar = async () => {
    const mid = await page.evaluate(() => { const r = window.__idmpDb.exec("SELECT AD_Menu_ID FROM AD_Menu WHERE Action='W' AND AD_Window_ID=143 AND IsActive='Y'"); return (r.length ? r[0].values.map(x => x[0]) : []).find(i => document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + i + '"]')); });
    const chain = await page.evaluate(id => { const leaf = document.querySelector('#idmp-tree .idmp-row.leaf[data-menu-id="' + id + '"]'); const out = []; let n = leaf.parentElement.parentElement; while (n && n.id !== 'idmp-tree') { if (n.classList.contains('idmp-node')) out.unshift(n.querySelector(':scope > .idmp-row').getAttribute('data-menu-id')); n = n.parentElement; } return out; }, mid);
    for (const id of chain) { const open = await page.evaluate(i => { const r = document.querySelector('#idmp-tree .idmp-row[data-menu-id="' + i + '"]'); return r && r.parentElement.classList.contains('open'); }, id); if (!open) await page.click('#idmp-tree .idmp-row[data-menu-id="' + id + '"]'); }
    await page.click('#idmp-tree .idmp-row.leaf[data-menu-id="' + mid + '"]'); await page.waitForSelector('#idmp-toolbar [data-tb="new"]'); await page.waitForTimeout(800);
    await page.click('#idmp-toolbar [data-tb="new"]'); const form = await page.waitForSelector('#idmp-inline-mount .cfrow', { timeout: 8000 }).then(() => true, () => false); await page.waitForTimeout(600);
    return { form, bar: await page.evaluate(() => { const b = document.getElementById('idmp-lensbar'); return b ? Array.from(b.querySelectorAll('button')).map(x => x.innerText) : null; }) };
  };
  const openPE = async () => { await page.evaluate(() => { const b = document.getElementById('pill-ninjacreate'); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }); await page.waitForSelector('#pe-ov'); await page.click('#pe-tab-install'); await page.waitForTimeout(400); };
  const offer = () => page.evaluate((id) => !!document.querySelector('#pe-available [data-offer="' + id + '"]'), ID);
  const closePE = () => page.evaluate(() => { const c = document.getElementById('pe-close'); if (c) c.click(); });
  try {
    await page.goto(base + '/idempiere.html?lang=en_US', { waitUntil: 'networkidle' });
    for (const n of ['erp_cache', 'fold_plugins']) await page.evaluate(x => new Promise(r => { const d = indexedDB.deleteDatabase(x); d.onsuccess = d.onerror = d.onblocked = () => r(); }), n);
    await page.reload({ waitUntil: 'networkidle' }); await ready(); await page.waitForTimeout(800); await login();
    const o1 = await newOrderBar(); await openPE(); const of1 = await offer(); const st1 = await state(); await closePE();
    if (!o1.form) { incon++; console.log('§WFO INCONCLUSIVE New Sales Order form never opened'); }
    J('O1', 'fresh profile: no lens bar on a New Sales Order, bundle not installed, offer row present', o1.form && o1.bar === null && st1 === null && of1, { o1, st1, of1 });
    await openPE(); await page.click('#pe-available [data-offer="' + ID + '"] .pe-offer-install'); await page.waitForTimeout(2500); await closePE();
    const st2 = await state(); const o2 = await newOrderBar();
    J('O2', 'Install click: bundle ' + st2 + ', lens bar ' + JSON.stringify(o2.bar), st2 === 'ACTIVE' && o2.form && Array.isArray(o2.bar) && o2.bar.length > 0, { st2, o2 });
    await page.reload({ waitUntil: 'networkidle' }); await ready(); await page.waitForTimeout(800); await login();
    const st3 = await state(), o3 = await newOrderBar();
    J('O3', 'reload: bundle ' + st3 + ', lens bar present', st3 === 'ACTIVE' && o3.form && Array.isArray(o3.bar) && o3.bar.length > 0, { st3, o3 });
    await page.evaluate(async (id) => { const r = window.PluginEngine._reg(); await r.stopBundle(id); await window.PluginEngine.persist(); }, ID);
    const o4 = await newOrderBar();
    await page.evaluate(async (id) => { const r = window.PluginEngine._reg(); await r.uninstallBundle(id); await window.PluginEngine.persist(); }, ID);
    await openPE(); const of4 = await offer(); await closePE();
    J('O4', 'Stop: no lens bar; Uninstall: offer row back', o4.form && o4.bar === null && of4, { o4, of4 });
    // O5 the Plugins & Releases console (the Felix-style Bundles page) offers the same bundle: one click installs and starts it; the offer then disappears
    await page.evaluate(() => window.PluginRelease.open()); await page.waitForSelector('#pr-osgi table.oc-t', { timeout: 10000 }); await page.waitForTimeout(500);
    const of5 = await page.evaluate((id) => !!document.querySelector('[data-oc-offerrow="' + id + '"]'), ID);
    await page.click('[data-oc-offer="' + ID + '"]'); await page.waitForTimeout(2500);
    const st5 = await state(), of5b = await page.evaluate((id) => !!document.querySelector('[data-oc-offerrow="' + id + '"]'), ID);
    await page.evaluate(() => { const c = document.querySelector('[data-pr-close]'); if (c) c.click(); });
    J('O5', 'Plugins & Releases console: offer present, one click -> ' + st5 + ', offer gone', of5 && st5 === 'ACTIVE' && !of5b, { of5, st5, of5b });
  } catch (e) { console.log('§WFO HARNESS-FAIL ' + e.message); fails++; }
  fs.writeFileSync(require('os').tmpdir() + '/witness_fo_optin.page.log', LOG.join('\n'));
  await browser.close(); server.close();
  console.log('§WFO_VERDICT ' + (incon ? 'INCONCLUSIVE' : fails ? 'RED' : 'GREEN') + ' judged=' + judged + ' failed=' + fails);
  process.exit(fails || incon ? 1 : 0);
})();
