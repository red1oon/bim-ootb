// ⚠ DO NOT REMOVE — Scope: harness lib for W-PILOT-GROUP-RELAY (bim-compiler prompts/ERP_PARALLEL_RUN_PILOT.md §9 Phase A).
// Read the run log after every run; exit code is not evidence. Harness only — no erp/ product file is edited.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const REPO = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream',
  '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function serveRepo() {
  const s = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    fs.readFile(path.join(REPO, p), (e, b) => {
      if (e) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(b);
    });
  });
  return new Promise(r => s.listen(0, () => r(s)));
}
// station = { id, org, wh, page, L (console lines) }
async function openStation(browser, st, base, relayUrl, win) {
  st.ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  st.page = await st.ctx.newPage(); st.L = [];
  st.page.on('console', m => st.L.push(m.text()));
  st.page.on('pageerror', e => st.L.push('PAGEERR ' + e));
  st.page.on('dialog', d => d.accept().catch(() => {}));
  await st.page.goto(base + '/idempiere.html?login=GardenAdmin&window=' + win + '&relay=' + encodeURIComponent(relayUrl), { waitUntil: 'load' });
  await st.page.waitForSelector('#idmp-toolbar button[title^="New record"]', { timeout: 40000 });
  await sleep(900);
}
async function waitLog(st, re, from, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const l = st.L.slice(from).find(x => re.test(x)); if (l) return l; await sleep(150); }
  return null;
}
// One POS-Order sale through the real Sales-Order window UI (the crud_overlay path that relays).
async function ringSale(st, base, relayUrl, qty) {
  const p = st.page, sel = (c) => '#idmp-inline-mount select[data-col="' + c + '"]';
  await p.goto(base + '/idempiere.html?login=GardenAdmin&window=143&relay=' + encodeURIComponent(relayUrl), { waitUntil: 'load' });
  await p.waitForSelector('#idmp-toolbar button[title^="New record"]', { timeout: 40000 }); await sleep(900);
  await p.click('#idmp-toolbar button[title^="New record"]'); await p.waitForSelector('#idmp-inline-mount .cfrow'); await sleep(700);
  await p.selectOption(sel('ad_org_id'), String(st.org)); await sleep(500);
  await p.selectOption(sel('m_warehouse_id'), String(st.wh)); await sleep(300);
  await p.selectOption(sel('c_bpartner_id'), '118'); await sleep(300);
  const dts = await p.$$eval(sel('c_doctypetarget_id') + ' option', o => o.map(x => ({ v: x.value, t: x.text })));
  const dt = dts.find(o => /^POS Order/.test(o.t)); if (!dt) throw new Error('no POS Order doctype');
  await p.selectOption(sel('c_doctypetarget_id'), dt.v);
  let n0 = st.L.length;
  await p.click('#idmp-toolbar button[title^="Save"]'); await sleep(1400);
  const sel1 = st.L.slice(n0).filter(l => /§CRUD-CREATE-SEL table=c_order id=/.test(l)).pop();
  const oid = Number((/id=(-?\d+)/.exec(sel1 || '') || [])[1]);
  await p.click('#idmp-tabstrip >> text=Order Line'); await sleep(900);
  await p.click('#idmp-toolbar button[title^="New record"]'); await p.waitForSelector('#idmp-inline-mount .cfrow'); await sleep(700);
  await p.selectOption(sel('m_product_id'), '123'); await sleep(300);
  const qi = p.locator('#idmp-inline-mount input[data-col="qtyentered"]').first();
  await qi.fill(String(qty)); await qi.blur(); await sleep(300);
  const uom = (await p.$$eval(sel('c_uom_id') + ' option', o => o.map(x => ({ v: x.value, t: x.text })))).find(o => /^Each/.test(o.t));
  const tax = (await p.$$eval(sel('c_tax_id') + ' option', o => o.map(x => ({ v: x.value, t: x.text })))).find(o => /^Standard \(104\)/.test(o.t));
  if (uom) await p.selectOption(sel('c_uom_id'), uom.v); if (tax) await p.selectOption(sel('c_tax_id'), tax.v);
  const pe = p.locator('#idmp-inline-mount input[data-col="priceentered"]').first();
  await pe.fill('61.75'); await pe.blur();
  await p.locator('#idmp-inline-mount input[data-col="priceactual"]').first().fill('61.75').catch(() => {});
  await p.click('#idmp-toolbar button[title^="Save"]'); await sleep(1400);
  await p.click('#idmp-tabstrip .idmp-adtab >> nth=0'); await sleep(900);
  await p.evaluate(i => { const tr = [...document.querySelectorAll('.idmp-grid tbody tr[data-ad-record]')].find(x => Number(x.getAttribute('data-ad-record')) === i); if (tr) tr.click(); }, oid);
  await sleep(900);
  n0 = st.L.length;
  await p.click('[data-doc-action="CO"]', { timeout: 15000 });
  const co = await waitLog(st, /§CRUD process committed key=c_order .*to=CO/, n0, 20000);
  const gl = await waitLog(st, /§GL-POST-COMMIT .*committed=true/, n0, 20000);
  await sleep(1200);   // let the fire-and-forget relay push land
  return { oid, co: !!co, gl: !!gl, coLine: co || '', glLine: gl || '' };
}
async function readRows(page) {
  return page.evaluate(() => {
    const K = window.__crud && window.__crud.kernelDb ? window.__crud.kernelDb() : null; if (!K) return { rows: [] };
    const r = K.exec('SELECT id,op_uuid,timestamp,op_type,parameters,input_guids,output_guid,op_hash,sig,gid,branch_id FROM kernel_ops ORDER BY id');
    const cols = r.length ? r[0].columns : [];
    return { rows: (r.length ? r[0].values : []).map(v => { const o = {}; cols.forEach((c, i) => o[c] = v[i]); return o; }) };
  });
}
module.exports = { serveRepo, openStation, ringSale, readRows, waitLog, sleep, REPO };
