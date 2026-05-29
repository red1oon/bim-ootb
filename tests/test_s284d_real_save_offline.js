// REAL end-to-end: click "Save Offline Copy" in the browser → capture the downloaded
// BIM-OOTB.html → open it from file:// with ALL network BLOCKED → drop an IFC → import.
// This is the actual "Offline downloader" the user reported, on the fix branch.
const pw = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const BASE = 'http://localhost:8080/bim-ootb';
const IFC = path.resolve('/home/red1/bim-ootb/tests/fixtures/Vogel_Gesamt_upgraded.ifc');
const OUT = '/tmp/BIM-OOTB-real.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await pw.chromium.launch({ headless: true });

  // ── Phase 1: package via the real button (online — packager fetches web-ifc from CDN) ──
  const ctx1 = await browser.newContext({ acceptDownloads: true });
  const page1 = await ctx1.newPage();
  const plog = []; page1.on('console', m => plog.push(m.text()));
  console.log('→ load landing online, click "Save Offline Copy"...');
  await page1.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page1.waitForSelector('#import-zone', { timeout: 20000 });
  const dlPromise = page1.waitForEvent('download', { timeout: 180000 });
  await page1.evaluate(() => packageLandingPage());
  const dl = await dlPromise;
  await dl.saveAs(OUT);
  const sz = fs.statSync(OUT).size;
  const wasmFetched = plog.find(l => l.includes('WASM_FETCHED'));
  const packDl = plog.find(l => l.includes('PACK_DOWNLOAD'));
  console.log('   saved ' + OUT + ' size=' + (sz/1024/1024).toFixed(1) + 'MB');
  console.log('   ' + (wasmFetched || '(no WASM_FETCHED)'));
  console.log('   ' + (packDl || '(no PACK_DOWNLOAD)'));
  // sanity: the embedded wasm base64 must be present in the file
  const head = fs.readFileSync(OUT, 'utf8');
  const hasB64 = /_WEBIFC_WASM_B64\s*=\s*"/.test(head);
  console.log('   embedded _WEBIFC_WASM_B64 present: ' + hasB64);
  await ctx1.close();

  // ── Phase 2: open from file:// with ALL network blocked, import an IFC ──
  const ctx2 = await browser.newContext();
  // Block EVERY non-file request — true zero-network. file:// loads are not routed.
  await ctx2.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith('file://')) return route.continue();
    return route.abort();
  });
  const page2 = await ctx2.newPage();
  const logs = []; const netErrs = [];
  page2.on('console', m => logs.push(m.text()));
  page2.on('pageerror', e => logs.push('PAGEERR ' + e.message));
  page2.on('requestfailed', r => { if (!r.url().startsWith('file://')) netErrs.push(r.url()); });
  const has = t => logs.some(l => l.includes(t));
  const find = t => logs.find(l => l.includes(t));

  console.log('\n→ open file://' + OUT + ' with ALL network BLOCKED...');
  await page2.goto('file://' + OUT, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page2.waitForSelector('#import-file-input', { state: 'attached', timeout: 20000 });
  await page2.evaluate(async (k)=>{ if (typeof deleteProject==='function'){ try{await deleteProject(k);}catch(e){} } }, 'Vogel_Gesamt_upgraded.ifc');

  console.log('→ drop IFC...');
  await page2.locator('#import-file-input').setInputFiles(IFC);
  for (let i=0;i<60;i++){ if (has('IMPORT_SAVED')||has('both async and sync')||has('IMPORT_FATAL')) break; await sleep(1000); }

  console.log('\n=== STANDALONE file:// RESULT ===');
  ['§STANDALONE','§IFC_WASM_FROM_B64','§WASM_LOCATE','§WASM_INIT done','IMPORT_SAVED','both async and sync','IMPORT_FATAL'].forEach(t=>{const l=find(t); if(l) console.log('  '+l);});
  // network attempts to anything but the local IFC would be a CDN leak
  const cdnLeak = netErrs.filter(u => /unpkg|jsdelivr|sql\.js\.org|githubusercontent|red1oon\.github/.test(u));
  console.log('  blocked non-file requests observed: ' + netErrs.length + (cdnLeak.length ? ('  CDN LEAK: '+cdnLeak.slice(0,3).join(',')) : '  (no CDN leak)'));

  const ok = has('IMPORT_SAVED') && !has('both async and sync') && !has('IMPORT_FATAL') && cdnLeak.length===0 && hasB64;
  await ctx2.close(); await browser.close();
  console.log(ok ? '\n✓ PASS — real saved HTML imports IFC fully offline (zero network, embedded wasm)'
                 : '\n✗ FAIL — see above');
  process.exit(ok ? 0 : 1);
})();
