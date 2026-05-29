// ⚠ S284d — PWA offline web-ifc WASM robustness. Proves the fix for:
//   "wasm streaming compile failed: NetworkError" → "both async and sync fetching of the wasm failed".
// Each scenario NAMES the issue it proves. §-logs are the proof. Runs chromium + firefox.
//   S1 online golden      — import works online, wasm via net/cache         (W-284d-4)
//   S2 offline after warm — wasm warmed to page cache, import works offline  (W-284d-1, W-284d-2)
//   S3 offline never-cached — wasm in NO cache + offline → CLEAR error,      (W-284d-3)
//                              NOT the cryptic "both async and sync" abort
const playwright = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const path = require('path');

const BASE = 'http://localhost:8080/bim-ootb';
const IFC = path.resolve('/home/red1/bim-ootb/tests/fixtures/Vogel_Gesamt_upgraded.ifc');
const KEY = 'Vogel_Gesamt_upgraded.ifc';
const WASM_URL = BASE + '/viewer/lib/web-ifc.wasm';
const SQLWASM_URL = BASE + '/viewer/lib/sql-wasm.wasm';

function mk() { const logs = []; return { logs,
  attach(page){ page.on('console', m => logs.push(m.text())); page.on('pageerror', e => logs.push('PAGEERR ' + e.message)); },
  has(t){ return logs.some(l => l.includes(t)); },
  find(t){ return logs.find(l => l.includes(t)); } }; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(L, preds, timeoutMs=60000){ const t0=Date.now(); while(Date.now()-t0<timeoutMs){ if(preds.some(p=>L.has(p))) return true; await sleep(500);} return false; }

async function freshCtx(browser){ const c = await browser.newContext(); return c; }

// S1 — online golden path
async function s1(browser){
  const ctx = await freshCtx(browser); const page = await ctx.newPage(); const L = mk(); L.attach(page);
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForSelector('#import-file-input', { state: 'attached' });
  await page.evaluate(async (k)=>{ if (typeof deleteProject==='function'){ try{await deleteProject(k);}catch(e){} } }, KEY);
  await page.locator('#import-file-input').setInputFiles(IFC);
  const ok = await waitFor(L, ['IMPORT_SAVED'], 90000);
  const wasmSrc = L.find('§IFC_WASM_FROM_NET') || L.find('§IFC_WASM_FROM_CACHE') || L.find('§IFC_WASM_FROM_B64');
  const locate = L.find('§WASM_LOCATE');
  await ctx.close();
  return { name:'S1 online golden', ok, detail:[wasmSrc, locate, L.find('IMPORT_SAVED')].filter(Boolean),
           bad: L.has('both async and sync') || L.has('IMPORT_FATAL') };
}

// S2 — offline after the engine warmed to the page cache
async function s2(browser){
  const ctx = await freshCtx(browser); const page = await ctx.newPage(); const L = mk(); L.attach(page);
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForSelector('#import-file-input', { state: 'attached' });
  // wait for SW active so sql-wasm precaches, and for the page-cache warm of web-ifc.wasm
  await page.evaluate(async ()=>{ const reg = await navigator.serviceWorker.getRegistration('viewer/'); const sw = reg && (reg.active||reg.waiting||reg.installing); if (sw && sw.state!=='activated') await new Promise(r=>sw.addEventListener('statechange',()=>sw.state==='activated'&&r())); });
  let warm=false, sqlc=false;
  for (let i=0;i<60;i++){
    warm = await page.evaluate(async ()=>{ try{ return !!(await (await caches.open('bim-ifc-engine')).match('viewer/lib/web-ifc.wasm')); }catch(e){ return false; } });
    sqlc = await page.evaluate(u=>caches.match(u).then(r=>!!r), SQLWASM_URL);
    if (warm && sqlc) break; await sleep(1000);
  }
  await page.evaluate(async (k)=>{ if (typeof deleteProject==='function'){ try{await deleteProject(k);}catch(e){} } }, KEY);
  await ctx.setOffline(true);
  await page.locator('#import-file-input').setInputFiles(IFC);
  const ok = await waitFor(L, ['IMPORT_SAVED','both async and sync','IMPORT_FATAL'], 90000) && L.has('IMPORT_SAVED');
  await ctx.setOffline(false);
  const r = { name:'S2 offline after warm', ok, detail:[`warm=${warm} sqlCached=${sqlc}`, L.find('§IFC_WASM_FROM_CACHE'), L.find('§WASM_LOCATE'), L.find('IMPORT_SAVED')].filter(Boolean),
              bad: L.has('both async and sync') || L.has('IMPORT_FATAL') };
  await ctx.close(); return r;
}

// S3 — offline AND wasm never cached anywhere → must be a CLEAR error, not the cryptic abort
async function s3(browser){
  const ctx = await freshCtx(browser); const page = await ctx.newPage(); const L = mk(); L.attach(page);
  // Block the wasm at the network from the very start so it never enters any cache.
  await ctx.route('**/web-ifc.wasm', route => route.abort());
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForSelector('#import-file-input', { state: 'attached' });
  // ensure SW active (sql-wasm precached) but web-ifc.wasm blocked → not cached
  await page.evaluate(async ()=>{ const reg = await navigator.serviceWorker.getRegistration('viewer/'); const sw = reg && (reg.active||reg.waiting||reg.installing); if (sw && sw.state!=='activated') await new Promise(r=>sw.addEventListener('statechange',()=>sw.state==='activated'&&r())); });
  // hard-evict web-ifc.wasm from every cache layer just in case
  await page.evaluate(async ()=>{ const ks=await caches.keys(); for(const k of ks){ const c=await caches.open(k); await c.delete('viewer/lib/web-ifc.wasm'); await c.delete('http://localhost:8080/bim-ootb/viewer/lib/web-ifc.wasm'); } });
  await page.evaluate(async (k)=>{ if (typeof deleteProject==='function'){ try{await deleteProject(k);}catch(e){} } }, KEY);
  await ctx.setOffline(true);
  await page.locator('#import-file-input').setInputFiles(IFC);
  // wait for either the clear error OR (regression) the cryptic abort
  await waitFor(L, ['§IFC_ENGINE_UNAVAILABLE','both async and sync','IMPORT_FATAL','IMPORT_SAVED'], 45000);
  await sleep(1500);
  const status = await page.evaluate(()=>{ const el=document.querySelector('#import-status, .import-status, #status'); return el?el.textContent:'(no status el)'; }).catch(()=>'(eval failed)');
  await ctx.setOffline(false);
  const clearError = L.has('§IFC_ENGINE_UNAVAILABLE');
  const crypticAbort = L.has('both async and sync') || L.has('IMPORT_FATAL');
  const r = { name:'S3 offline never-cached', ok: clearError && !crypticAbort,
              detail:[L.find('§IFC_ENGINE_UNAVAILABLE'), 'status="'+(status||'').slice(0,80)+'"'].filter(Boolean),
              bad: crypticAbort };
  await ctx.close(); return r;
}

(async () => {
  const engines = [['chromium', playwright.chromium], ['firefox', playwright.firefox]];
  const grid = [];
  for (const [ename, etype] of engines){
    const browser = await etype.launch({ headless: true });
    for (const fn of [s1, s2, s3]){
      let res; try { res = await fn(browser); } catch(e){ res = { name: fn.name, ok:false, detail:['THREW '+e.message], bad:true }; }
      res.engine = ename; grid.push(res);
      console.log(`\n[${ename}] ${res.name}: ${res.ok?'PASS':'FAIL'}${res.bad?' (cryptic-abort present!)':''}`);
      res.detail.forEach(d => console.log('    ' + d));
    }
    await browser.close();
  }
  console.log('\n================ S284d MATRIX ================');
  let allPass = true;
  for (const r of grid){ const ok = r.ok && !r.bad; allPass = allPass && ok; console.log(`  ${ok?'✓':'✗'} [${r.engine}] ${r.name}`); }
  console.log(allPass ? '\n✓ ALL PASS' : '\n✗ SOME FAILED');
  process.exit(allPass ? 0 : 1);
})();
