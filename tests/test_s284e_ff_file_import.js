// Package via the real button, then open from file:// in FIREFOX (null-origin), drop IFC,
// check whether the wasm now initializes (data: URL fix) — isolates the wasm bug from the
// viewer-handoff bug. We assert §WASM_INIT done + §PARSE_OK, NOT viewer open.
const pw = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const BASE = 'http://localhost:8080/bim-ootb';
const IFC = path.resolve('/home/red1/bim-ootb/tests/fixtures/Vogel_Gesamt_upgraded.ifc');
const OUT = '/tmp/BIM-OOTB-ff.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await pw.firefox.launch({ headless: true });
  // Phase 1: package (chromium would be fine, but use FF end-to-end). Needs network for unpkg.
  const c1 = await browser.newContext({ acceptDownloads: true });
  const p1 = await c1.newPage();
  await p1.goto(BASE + '/index.html', { waitUntil: 'load' });
  await p1.waitForSelector('#import-zone', { timeout: 20000 });
  const dlP = p1.waitForEvent('download', { timeout: 180000 });
  await p1.evaluate(() => packageLandingPage());
  const dl = await dlP; await dl.saveAs(OUT);
  console.log('packaged ' + (fs.statSync(OUT).size/1024/1024).toFixed(1) + 'MB');
  await c1.close();

  // Phase 2: open file:// in FF, network fully blocked, import
  const c2 = await browser.newContext();
  await c2.route('**/*', r => r.request().url().startsWith('file://') ? r.continue() : r.abort());
  const p2 = await c2.newPage();
  const logs = []; p2.on('console', m => logs.push(m.text())); p2.on('pageerror', e => logs.push('PAGEERR '+e.message));
  const has = t => logs.some(l => l.includes(t)); const find = t => logs.find(l => l.includes(t));
  await p2.goto('file://' + OUT, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p2.waitForSelector('#import-file-input', { state: 'attached', timeout: 20000 });
  await p2.locator('#import-file-input').setInputFiles(IFC);
  for (let i=0;i<60;i++){ if (has('§PARSE_OK')||has('both async and sync')||has('IMPORT_FATAL')||has('IMPORT_SAVED')) break; await sleep(1000); }

  console.log('\n=== FF file:// wasm result ===');
  ['§WASM_LOCATE','§WASM_INIT done','§PARSE_OK','§IMPORT_SAVED','both async and sync','IMPORT_FATAL'].forEach(t=>{const l=find(t); if(l) console.log('  '+l);});
  const wasmOk = has('§WASM_INIT done') && !has('both async and sync') && !has('IMPORT_FATAL');
  await c2.close(); await browser.close();
  console.log(wasmOk ? '\n✓ wasm initializes in FF file:// (data: URL fix works)' : '\n✗ wasm still failing in FF file://');
  process.exit(wasmOk ? 0 : 1);
})();
