// W-MPLATE — MORPHEUS_PLATE_REBUILD wiring witness.
// CLAIM: cold boot → Morpheus gate → red pill → round01 vortex (the loader) → the 7 SAME Lucide
//   launchers DROP into the hole one-by-one (audio cue each) → pick the centre (Buildings/IFC) →
//   it docks to the ⋯ rail (all 7) and the hub renders REAL building cards from manifest.json.
// Whitebox §-log + DOM probe. Run: node viewer/tests/morpheus_plate_live.js
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = '/tmp/wt-mplate';
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.wasm':'application/wasm',
  '.json':'application/json', '.css':'text/css', '.db':'application/octet-stream', '.jpg':'image/jpeg', '.png':'image/png' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index2.html';
  fs.readFile(path.join(ROOT, p), (e, b) => {
    if (e) { r.writeHead(404); r.end('404 ' + p); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Access-Control-Allow-Origin':'*' }); r.end(b);
  });
});
let pass = 0, fail = 0;
function ck(name, ok) { console.log((ok ? '  PASS ' : '  FAIL ') + name); ok ? pass++ : fail++; }
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--window-size=1100,820'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1100, height: 820 });
  const logs = [];
  pg.on('console', m => { const t = m.text(); if (/§/.test(t)) logs.push(t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 200)));
  // intercept window.open so a building card click is observable without a popup
  await pg.evaluateOnNewDocument(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return { focus(){} }; }; });

  await pg.goto(`http://localhost:${port}/index2.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForSelector('#morpheus.active', { timeout: 15000 }).catch(() => {});
  ck('cold boot → Morpheus gate', await pg.$('#morpheus.active') != null);

  // red pill
  await pg.evaluate(() => takeRed());
  await pg.waitForSelector('#portal.active', { timeout: 8000 }).catch(() => {});
  ck('red → portal vortex shown', await pg.$('#portal.active') != null);
  ck('vortex element uses round01.jpg', await pg.evaluate(() => /round01/.test(getComputedStyle(document.getElementById('portal-vortex')).backgroundImage)));

  // wait for all 8 icons to drop
  await pg.waitForFunction(() => document.querySelectorAll('#portal-stage .por-ic.drop').length === 8, { timeout: 12000 }).catch(() => {});
  const nIcons = await pg.evaluate(() => document.querySelectorAll('#portal-stage .por-ic').length);
  const nDropped = await pg.evaluate(() => document.querySelectorAll('#portal-stage .por-ic.drop').length);
  ck('8 launcher icons in the hole', nIcons === 8);
  ck('all 8 dropped (drop class)', nDropped === 8);
  ck('§ICON_DROP logged x8', logs.filter(l => /§ICON_DROP/.test(l)).length === 8);
  ck('clear-cache is the 8th launcher (trash)', await pg.evaluate(() => !!document.getElementById('por-clear') && !!window.ICONS.trash));
  ck('only flag+video newly extracted (others reuse existing keys)',
     await pg.evaluate(() => ['grid','bonsaiTree','barChart','lightbulb','circleHelp','trash'].every(k => window.ICONS[k]) && !!window.ICONS.flag && !!window.ICONS.video && !window.ICONS.mapPin && !window.ICONS.globe));

  // pick the centre (Buildings/IFC) → dock + hub
  await pg.evaluate(() => document.getElementById('por-gps').click());
  await pg.waitForFunction(() => document.querySelector('#erp-pillbar') && document.querySelector('#hub.active'), { timeout: 8000 }).catch(() => {});
  ck('picked → ⋯ rail mounted (all 8 launchers)', await pg.evaluate(() => document.querySelectorAll('#erp-pill button').length === 8));
  ck('§DOCK logged', logs.some(l => /§DOCK rail mounted/.test(l)));
  ck('hub opened', await pg.$('#hub.active') != null);

  // hub building cards from manifest
  await pg.waitForFunction(() => document.querySelectorAll('#hub .hub-card').length > 5, { timeout: 8000 }).catch(() => {});
  const nCards = await pg.evaluate(() => document.querySelectorAll('#hub .hub-card').length);
  ck('hub rendered real building cards (>20 from manifest)', nCards > 20);
  ck('§HUB_CARDS logged', logs.some(l => /§HUB_CARDS rendered/.test(l)));

  // click a card → viewer URL with db + ghost
  await pg.evaluate(() => document.querySelector('#hub .hub-card').click());
  await new Promise(r => setTimeout(r, 200));
  const opened = await pg.evaluate(() => window.__opened);
  ck('card click → viewer.html?db=...&ghost=1', opened.some(u => /viewer\/viewer\.html\?db=.*_extracted\.db&ghost=1/.test(u)));

  // watch-demo opens the youtu.be link in a plain new tab (like index.html's <a target="_blank">),
  // NOT window.open with a 'noopener' features string (that yields a blank popup window).
  await pg.evaluate(() => { window.__opened = []; openTab('https://youtu.be/hnLYNcRihzs'); });
  ck('watch-demo → plain new tab youtu.be/hnLYNcRihzs',
     await pg.evaluate(() => window.__opened.length === 1 && window.__opened[0] === 'https://youtu.be/hnLYNcRihzs'));

  // reload with the entered flag set → gate SKIPPED, straight to the circle (only Clear Cache re-arms it)
  ck('entered flag persisted (localStorage)', await pg.evaluate(() => localStorage.getItem('mx_entered') === '1'));
  await pg.reload({ waitUntil: 'load', timeout: 30000 });
  await pg.waitForSelector('#portal.active', { timeout: 8000 }).catch(() => {});
  ck('refresh after red → circle (gate NOT shown again)', await pg.evaluate(() => !!document.querySelector('#portal.active') && !document.querySelector('#morpheus.active')));

  console.log('\n  §W-MPLATE ' + pass + '/' + (pass + fail) + (fail ? ' (FAIL)' : ' PASS'));
  console.log('  sample logs:'); logs.slice(0, 14).forEach(l => console.log('    ' + l));
  await br.close(); server.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
