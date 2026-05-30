// S284f — standalone file:// VIEWER hand-off renders in-place (Chrome + Firefox).
// PROVES: dead-end #4's collapse was the </script> escaping NO-OP. After the split fix,
// the file:// iframe.contentDocument.write parses correctly → classic scripts run →
// loader.js dynamic import() of data: URIs boots THREE → canvas renders.
//
// Issue each assertion proves:
//   W-284f-1/2  drop→view renders (Chrome/FF): canvas px>0 + §S277b_RENDERER + §DLOD_FLUSH
//               in the viewer iframe, NO blob:null / "from script denied" / parse-collapse.
//   W-284f-3    openProject (auto-open after import) routes through _openViewerBlob file:// branch:
//               §STANDALONE_INPLACE (params from window.name) fires.
//   W-284f-6    file:// IFC import not regressed: §WASM_LOCATE data: + §IMPORT_SAVED.
//
// NOT proof: §IMPORT_SAVED alone (fires BEFORE hand-off). Must see the VIEWER render.
const pw = require('/home/red1/bim-ootb/tests/node_modules/playwright');
const fs = require('fs'); const path = require('path');
const BASE = 'http://localhost:8080/bim-ootb';
const IFC = path.resolve('/home/red1/bim-ootb/tests/fixtures/Vogel_Gesamt_upgraded.ifc');
const OUT = '/tmp/BIM-OOTB-s284f.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function packageOnce() {
  const browser = await pw.firefox.launch({ headless: true });
  const c = await browser.newContext({ acceptDownloads: true });
  const p = await c.newPage();
  await p.goto(BASE + '/index.html', { waitUntil: 'load' });
  await p.waitForSelector('#import-zone', { timeout: 20000 });
  const dlP = p.waitForEvent('download', { timeout: 180000 });
  await p.evaluate(() => packageLandingPage());
  const dl = await dlP; await dl.saveAs(OUT);
  await browser.close();
  console.log('packaged ' + (fs.statSync(OUT).size / 1024 / 1024).toFixed(1) + 'MB → ' + OUT);
}

async function runBrowser(kind) {
  const browser = await pw[kind].launch({ headless: true });
  const ctx = await browser.newContext();
  // Hard network block — ONLY file:// allowed. Proves zero CDN/online dependency.
  await ctx.route('**/*', r => r.request().url().startsWith('file://') ? r.continue() : r.abort());
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERR ' + e.message));
  const has = t => logs.some(l => l.includes(t));
  const find = t => logs.find(l => l.includes(t));

  await page.goto('file://' + OUT, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#import-file-input', { state: 'attached', timeout: 20000 });
  await page.locator('#import-file-input').setInputFiles(IFC);

  // Wait for import → auto-open → viewer boot → geometry stream.
  // §CONTRACT_CHECK = meshes built+streamed (fires for ALL model sizes; §DLOD_FLUSH only fires
  // for >5000 elements — this fixture is 130, so DLOD is correctly skipped).
  for (let i = 0; i < 90; i++) {
    if (has('§CONTRACT_CHECK') || has('INPLACE_FAIL') || has('IMPORT_FATAL') || has('§INIT_VIEWER_ERROR')) break;
    await sleep(1000);
  }
  await sleep(1500);

  // Find the viewer iframe (name = the ?db=&lib= query stashed by _openViewerBlob).
  // Measure the ACTUAL render canvas (#canvas), not the first <canvas> (site-cam markup precedes it).
  let canvasPx = 0, frameFound = false;
  for (const fr of page.frames()) {
    const nm = fr.name() || '';
    if (nm.charAt(0) === '?' || nm.indexOf('db=') >= 0) {
      frameFound = true;
      canvasPx = await fr.evaluate(() => {
        const c = document.getElementById('canvas');
        return c ? (c.width * c.height) : 0;
      }).catch(() => 0);
      break;
    }
  }

  // streamed=N from §CONTRACT_CHECK proves geometry actually reached the scene
  const cc = find('§CONTRACT_CHECK') || '';
  const streamed = (cc.match(/streamed=(\d+)/) || [])[1] | 0;
  const blocked = has('blob:null') || has('Not allowed to load local resource') ||
                  has('from script denied') || has('INPLACE_FAIL') || has('§INIT_VIEWER_ERROR');

  console.log('\n=== ' + kind + ' file:// viewer hand-off ===');
  ['§WASM_LOCATE', '§IMPORT_SAVED', '§IMPORT_AUTO_OPEN', '§S284e_B VIEWER_INPLACE',
   '§STANDALONE_INPLACE', '§S277b_RENDERER', '§DB_LOADED', '§CONTRACT_CHECK'].forEach(t => {
    const l = find(t); console.log('  ' + (l ? '✓ ' + l.slice(0, 100) : '✗ MISSING ' + t));
  });
  console.log('  iframe found=' + frameFound + '  #canvas px=' + canvasPx + '  streamed=' + streamed + '  blocked=' + blocked);

  await browser.close();

  const pass = has('§IMPORT_SAVED') && has('§STANDALONE_INPLACE') &&
               has('§S277b_RENDERER') && streamed > 0 &&
               frameFound && canvasPx > 100000 && !blocked;
  return { kind, pass, canvasPx, streamed };
}

(async () => {
  await packageOnce();
  const results = [];
  for (const kind of ['chromium', 'firefox']) {
    try { results.push(await runBrowser(kind)); }
    catch (e) { console.log('\n✗ ' + kind + ' THREW ' + e.message); results.push({ kind, pass: false }); }
  }
  console.log('\n=== SUMMARY ===');
  results.forEach(r => console.log('  ' + r.kind + ': ' + (r.pass ? 'PASS #canvas=' + r.canvasPx + ' streamed=' + r.streamed : 'FAIL')));
  const allPass = results.length === 2 && results.every(r => r.pass);
  process.exit(allPass ? 0 : 1);
})();
