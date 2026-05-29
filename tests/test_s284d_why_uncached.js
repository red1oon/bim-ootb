// WHY does web-ifc.wasm "never cache"? Prove the precache is best-effort + non-retrying:
// a single failed cache.add at install is swallowed and NOT retried on reload (only on a
// CACHE_VERSION bump). So a transient miss becomes permanent.
const pw = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const BASE = 'http://localhost:8080/bim-ootb';
const WASM = 'http://localhost:8080/bim-ootb/viewer/lib/web-ifc.wasm';
const SQL  = 'http://localhost:8080/bim-ootb/viewer/lib/sql-wasm.wasm';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function swActive(page){
  await page.evaluate(async ()=>{ const reg=await navigator.serviceWorker.getRegistration('viewer/'); const sw=reg&&(reg.active||reg.waiting||reg.installing); if(sw&&sw.state!=='activated') await new Promise(r=>sw.addEventListener('statechange',()=>sw.state==='activated'&&r())); });
}
const cached = (page,u) => page.evaluate(x=>caches.match(x).then(r=>!!r), u);

(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  // Block ONLY the wasm during install — simulate a transient fetch failure on that one file.
  let blockWasm = true;
  await ctx.route('**/web-ifc.wasm', route => blockWasm ? route.abort() : route.continue());
  const page = await ctx.newPage();
  const logs = []; page.on('console', m => logs.push(m.text()));

  console.log('→ fresh load, SW installs, web-ifc.wasm fetch BLOCKED (transient failure)...');
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await swActive(page);
  await sleep(4000); // let precache settle
  const wasm1 = await cached(page, WASM), sql1 = await cached(page, SQL);
  console.log(`   after install: sql-wasm cached=${sql1}  web-ifc.wasm cached=${wasm1}  (other files OK, wasm skipped)`);

  console.log('→ network restored; RELOAD page (same SW version → NO re-install, NO re-precache)...');
  blockWasm = false;
  await page.reload({ waitUntil: 'load' });
  await swActive(page);
  await sleep(4000);
  const wasm2 = await cached(page, WASM);
  console.log(`   after reload (wasm now reachable): web-ifc.wasm cached=${wasm2}`);

  console.log('\n=== WHY IT STAYS UNCACHED ===');
  const proven = (sql1 === true) && (wasm1 === false) && (wasm2 === false);
  console.log(`  • one file fails at install, others succeed:            ${sql1===true && wasm1===false ? 'CONFIRMED' : 'no'}`);
  console.log(`  • reload does NOT retry the skipped file (same version): ${wasm2===false ? 'CONFIRMED' : 'no'}`);
  console.log(`  • §SW logs mention skip? ${logs.filter(l=>/PRECACHE_SKIP|SW_/.test(l)).slice(0,3).join(' | ') || '(SW logs not surfaced to page console)'}`);
  await ctx.close(); await browser.close();
  console.log(proven ? '\n✓ PROVEN: best-effort precache + no runtime retry = permanent miss until CACHE_VERSION bump'
                     : '\n? not cleanly reproduced (timing) — see values above');
  process.exit(0);
})();
