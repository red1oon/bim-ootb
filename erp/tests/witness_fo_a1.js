// ⚠ DO NOT REMOVE — W-FO-A1 (bim-compiler prompts/ERP_FRIENDLY_OPS_LENS.md §29). READ THE LOG; exit code is not evidence.
// ISSUE it proves/disproves: with the friendly-ops lens installed, entering a Sales order with one line takes strictly FEWER gestures than the plain path, through the SAME
//   save chain: identical §EVENT_SEQ, identical saved rows, and Complete succeeds. Lens not installed = no lens bar (twin untouched). INCONCLUSIVE (never PASS) if an event trace is empty.
// Run: [FOPS_BREAK=noclimb] node erp/tests/witness_fo_a1.js > <log>      (RED control: "Add line" skips the save)
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
  await pick('c_doctypetarget_id', /^POS Order/); await pick('c_bpartner_id', /Joe Block/); await pick('ad_org_id', /^HQ/);
  const lensBtn = async (re) => { const t = await pg.$$eval('#idmp-lensbar button', b => b.map(x => [x.getAttribute('data-lens-action'), x.innerText])); const h = t.find(x => re.test(x[1])); if (!h) throw new Error('no lens button ' + re + ' in ' + JSON.stringify(t)); await hc('#idmp-lensbar button[data-lens-action="' + h[0] + '"]'); await pg.waitForTimeout(2200); };
  if (lens) await lensBtn(/^Add /);
  else { await hc('#idmp-toolbar [title^="Save"]'); await pg.waitForTimeout(1800); await hc('#idmp-tabstrip .idmp-adtab[title="TabLevel 1 · C_OrderLine"]'); await pg.waitForTimeout(1200); await hc(NEWB); await pg.waitForTimeout(900); }
  await pick('m_product_id', /Mulch/); await pg.waitForTimeout(800);
  GT.type++; await pg.fill(F('qtyentered'), '1'); await pg.locator(F('qtyentered')).first().blur().catch(() => {}); await pg.waitForTimeout(600);
  if (lens) await lensBtn(/^Save & back/);
  else { await hc('#idmp-toolbar [title^="Save"]'); await pg.waitForTimeout(2000); await hc('#idmp-tabstrip .idmp-adtab[title="TabLevel 0 · C_Order"]'); await pg.waitForTimeout(1000); }
  const n1 = logs.length; await hc('[data-doc-action="CO"]'); await pg.waitForTimeout(4500);
  const co = logs.slice(n1).filter(l => /§MODEL-DOCACTION table=c_order/.test(l)).pop() || '';
  const ev = logs.slice(n0).map(l => /^§EVENT_SEQ n=\d+ table=(\S+) event=(\S+)/.exec(l)).filter(Boolean).map(m => m[2] + '@' + m[1]);
  const head = await tip("SELECT COUNT(*) AS n, SUM(CASE WHEN docstatus='CO' THEN 1 ELSE 0 END) AS co, SUM(grandtotal) AS g FROM c_order WHERE c_bpartner_id IS NOT NULL AND c_order_id < 0");
  const line = await tip("SELECT COUNT(*) AS n, SUM(qtyordered) AS q, SUM(linenetamt) AS a FROM c_orderline WHERE m_product_id=137 AND c_orderline_id < 0");
  return { lens, gestures: GT.click + GT.select + GT.type, GT, barOff, ev, co, head: JSON.stringify(head), line: JSON.stringify(line) };
}
(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://localhost:' + srv.address().port + '/erp';
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const off = await run(base, browser, false); console.log('§FOA1 off done g=' + off.gestures); const on = await run(base, browser, true);
    console.log('§FOA1 off=' + JSON.stringify({ g: off.GT, ev: off.ev.length }) + ' on=' + JSON.stringify({ g: on.GT, ev: on.ev.length }));
    J('A1', 'lens not installed: no lens bar on the Sales Order window (the twin\'s toolbar)', off.barOff === false);
    if (!off.ev.length || !on.ev.length) { incon++; console.log('  INCONCLUSIVE empty event trace off=' + off.ev.length + ' on=' + on.ev.length); }
    J('A', 'lens ON takes strictly fewer gestures than the plain path (' + on.gestures + ' < ' + off.gestures + ')', on.gestures < off.gestures);
    J('B', '§EVENT_SEQ equal event for event (' + off.ev.length + ' vs ' + on.ev.length + ')', off.ev.length > 0 && JSON.stringify(off.ev) === JSON.stringify(on.ev), off.ev.length === on.ev.length ? '' : 'first diff at ' + off.ev.findIndex((e, i) => e !== on.ev[i]));
    J('C', 'saved header and line equal', off.head === on.head && off.line === on.line && /"n":1/.test(on.line) && /"co":1/.test(on.head), 'off ' + off.head + off.line + ' on ' + on.head + on.line);
    J('D', 'ON order completes: §MODEL-DOCACTION ok=true status=CO', /ok=true status=CO/.test(on.co), on.co.slice(0, 120));
  } catch (e) { console.log('§FOA1 HARNESS-FAIL ' + e.message); fails++; }
  await browser.close(); srv.close();
  console.log('§FOA1_VERDICT ' + (incon ? 'INCONCLUSIVE' : fails ? 'RED' : 'GREEN') + ' judged=' + judged + ' failed=' + fails + (BREAK ? ' break=' + BREAK : ''));
  process.exit(fails || incon ? 1 : 0);
})();
