// S284d — prove viewer-side _getWebIfcWasmBytes() (import.js) across 3 states, both browsers.
//   V1 online           → returns 1303940 bytes (§IFC_WASM_FROM_NET/CACHE)
//   V2 offline + cached  → returns 1303940 bytes (caches.match, offline-safe)
//   V3 offline + blocked → rejects with the CLEAR message (§IFC_ENGINE_UNAVAILABLE), no cryptic abort
const pw = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const VIEWER = 'http://localhost:8080/bim-ootb/viewer/viewer.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function load(ctx){
  const page = await ctx.newPage();
  const logs = []; page.on('console', m => logs.push(m.text()));
  await page.goto(VIEWER, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof _getWebIfcWasmBytes === 'function', { timeout: 15000 });
  // ensure SW active so caches.match has the precache
  await page.evaluate(async ()=>{ try{ const reg=await navigator.serviceWorker.getRegistration('./'); const sw=reg&&(reg.active||reg.waiting||reg.installing); if(sw&&sw.state!=='activated') await new Promise(r=>sw.addEventListener('statechange',()=>sw.state==='activated'&&r())); }catch(e){} });
  return { page, logs };
}
const getLen = page => page.evaluate(async () => { try { const b = await _getWebIfcWasmBytes(); return { ok:true, len: b.byteLength }; } catch(e){ return { ok:false, err: e.message }; } });

(async () => {
  const rows = [];
  for (const [ename, etype] of [['chromium', pw.chromium], ['firefox', pw.firefox]]){
    const browser = await etype.launch({ headless: true });

    // V1 online
    let ctx = await browser.newContext(); let { page } = await load(ctx);
    let r = await getLen(page); rows.push({ engine:ename, name:'V1 online', pass: r.ok && r.len===1303940, info: JSON.stringify(r) });
    await ctx.close();

    // V2 offline + cached (warm by fetching first, then go offline)
    ctx = await browser.newContext(); ({ page } = await load(ctx));
    await page.evaluate(async ()=>{ try{ const c=await caches.open('bim-ifc-engine-test'); const r=await fetch('lib/web-ifc.wasm'); await c.put('lib/web-ifc.wasm', r.clone()); }catch(e){} });
    // also confirm SW precache present
    for (let i=0;i<30;i++){ if (await page.evaluate(()=>caches.match('lib/web-ifc.wasm').then(x=>!!x))) break; await sleep(1000); }
    await ctx.setOffline(true);
    r = await getLen(page); rows.push({ engine:ename, name:'V2 offline cached', pass: r.ok && r.len===1303940, info: JSON.stringify(r) });
    await ctx.setOffline(false); await ctx.close();

    // V3 offline + blocked + evicted → clear error
    ctx = await browser.newContext();
    await ctx.route('**/web-ifc.wasm', route => route.abort());
    ({ page } = await load(ctx));
    const logs3 = page; // capture via closure below
    await page.evaluate(async ()=>{ const ks=await caches.keys(); for(const k of ks){ const c=await caches.open(k); await c.delete('lib/web-ifc.wasm'); await c.delete('http://localhost:8080/bim-ootb/viewer/lib/web-ifc.wasm'); } });
    await ctx.setOffline(true);
    r = await getLen(page);
    const clearErr = !r.ok && /not available offline/.test(r.err || '');
    rows.push({ engine:ename, name:'V3 offline blocked', pass: clearErr, info: JSON.stringify(r) });
    await ctx.setOffline(false); await ctx.close();

    await browser.close();
  }
  console.log('\n========= S284d VIEWER HELPER =========');
  let all = true;
  for (const r of rows){ all = all && r.pass; console.log(`  ${r.pass?'✓':'✗'} [${r.engine}] ${r.name}  ${r.info}`); }
  console.log(all ? '\n✓ ALL PASS' : '\n✗ SOME FAILED');
  process.exit(all ? 0 : 1);
})();
