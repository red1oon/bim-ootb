// matrix_landing_live.js — W-MATRIX-LANDING (whitebox §-log witness, headless chrome on the real index.html)
// CLAIM (user decree 2026-06-19): index.html IS the Matrix landing.
//   • first-timer / cleared cache → red/blue gate (#morpheus)
//   • REFRESH (reload) while warm → big round selection (#portal circle)
//   • RETURN (Home/back/nav) while warm → compact ⋯ rail (#desktop + #erp-pillbar)   [not the gate, not the circle]
//   • the trash 'Clear cache' → wipes ONLY building IndexedDB + the mx_entered flag (app/offline caches KEPT),
//     and lands back on the red/blue gate.
// Also screenshots the circle to docs/assets for the User Guide welcome.
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css',
  '.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.wasm':'application/wasm','.ico':'image/x-icon' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  fs.readFile(path.join(ROOT, p), (e, b) => {
    if (e) { r.writeHead(404); return r.end('404 ' + p); }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Access-Control-Allow-Origin':'*' });
    r.end(b);
  });
});

(async () => {
  const port = await new Promise(res => srv.listen(0, () => res(srv.address().port)));
  const base = `http://localhost:${port}`;
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const pg = await browser.newPage();
  await pg.setViewport({ width: 1100, height: 820 });
  const logs = []; pg.on('console', m => logs.push(m.text()));
  pg.on('dialog', d => d.accept());            // auto-accept the trash confirm()
  const wait = ms => pg.evaluate(t => new Promise(r => setTimeout(r, t)), ms);
  const active = id => pg.$eval(id, e => e.classList.contains('active')).catch(() => false);
  const has = re => logs.some(t => re.test(t));
  let pass = 0, fail = 0;
  const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); c ? pass++ : fail++; };

  // 1) COLD first-timer → red/blue gate
  logs.length = 0;
  await pg.goto(base + '/index.html', { waitUntil: 'load' }); await wait(500);
  ok('§1 cold → Morpheus gate', has(/§BOOT cold → Morpheus/) && await active('#morpheus'));

  // mark entered (as taking the red pill would) so the next loads are "warm"
  await pg.evaluate(() => { try { localStorage.setItem('mx_entered', '1'); } catch (e) {} });

  // 2) REFRESH while warm → big round selection (circle); icons drop in (§PORTAL ready ~2.2s)
  logs.length = 0;
  await pg.reload({ waitUntil: 'load' }); await wait(700);   // boot() is async (probeColdWarm opens IDB)
  ok('§2 refresh → matrix circle', has(/§BOOT reload → matrix circle/) && await active('#portal'));
  await wait(2000);
  ok('§2b circle dropped its launcher icons', has(/§PORTAL ready/));

  // screenshot the fully-dropped circle for the User Guide welcome
  try {
    const out = path.join(process.env.HOME, 'bim-compiler', 'docs', 'assets', 'matrix_landing.png');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await pg.screenshot({ path: out });
    console.log('§SHOT matrix_landing.png → ' + out);
  } catch (e) { console.log('§SHOT failed ' + e.message); }

  // 3) RETURN (fresh navigation, as a surface Home button does) → ⋯ rail (dots), not the circle, not the gate
  logs.length = 0;
  await pg.goto(base + '/index.html?home=1', { waitUntil: 'load' }); await wait(600);
  ok('§3 return (nav) → ⋯ rail', has(/§BOOT return \(navigate\) → ⋯ rail/) && await active('#desktop'));
  const railUp = await pg.$('#erp-pillbar') ? true : false;
  ok('§3b ⋯ pill rail mounted on return', railUp);
  ok('§3c return did NOT show the big circle', !(await active('#portal')) && !(await active('#morpheus')));

  // 4) TRASH — clears building IndexedDB + mx_entered, keeps app caches, lands on the gate
  logs.length = 0;
  await pg.evaluate(() => { try { localStorage.setItem('probe_keep', '1'); } catch (e) {} });   // a non-building key must survive
  await Promise.all([
    pg.waitForNavigation({ waitUntil: 'load' }).catch(() => {}),
    pg.evaluate(() => window.clearCache()),
  ]);
  await wait(500);
  const enteredGone = await pg.evaluate(() => { try { return localStorage.getItem('mx_entered') === null; } catch (e) { return false; } });
  const otherKept   = await pg.evaluate(() => { try { return localStorage.getItem('probe_keep') === '1'; } catch (e) { return false; } });
  ok('§4 trash logged building-only wipe (app caches kept)', has(/§CLEAR building IndexedDB.*caches KEPT/));
  ok('§4b trash re-armed the gate (mx_entered removed)', enteredGone);
  ok('§4c trash landed back on red/blue gate', await active('#morpheus'));
  ok('§4d trash kept unrelated storage (no broad wipe)', otherKept);

  // 5) static — surfaces Home → the Matrix; golden-path uses the matrix import ids
  const mod = fs.readFileSync(path.join(ROOT, 'viewer', 'modeller.html'), 'utf8');
  const idmp = fs.readFileSync(path.join(ROOT, 'erp', 'idempiere.html'), 'utf8');
  ok('§5 modeller Home → ../index.html?home', mod.includes("location.href='../index.html?home=1'"));
  ok('§5b idempiere Home → ../index.html?home (not erp.html)',
     idmp.includes("location.href = '../index.html?home=1'") && !/home: function \(\) \{ location\.href = 'erp\.html'/.test(idmp));

  console.log(`\n§W-MATRIX-LANDING ${pass}/${pass + fail} PASS`);
  await browser.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
