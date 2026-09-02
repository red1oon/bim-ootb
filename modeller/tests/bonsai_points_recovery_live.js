// W-BONSAI-POINTS-RECOVERY — DAGeVu modeller: in-progress sketch/route points survive a stray Escape
// (RESUME_MODELLER_POLISH.md #4). Points were transient (not op-log) → Escape lost them all. Now a cancel-exit
// BUFFERS them for the session and re-opening the tool RESTORES them; a commit clears the draft; emptying the points
// then cancelling discards it. Driven via real toolbar clicks + window.Bonsai.sketch.addPoint (reliable, no pointer
// flake). Proves: (R1) buffer+restore across Escape; (R2) commit clears the draft; (R3) empty-then-cancel discards;
// (R4) route mirrors the same _routeDraft buffer/restore (served source — routePts is module-local).
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join(__dirname, '..');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
  '.json': 'application/json', '.css': 'text/css', '.map': 'application/json' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller.html';
  fs.readFile(path.join(VIEWER, p), (e, b) => {
    if (e) { r.writeHead(404); r.end('404 ' + p); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b);
  });
});
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage();
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 200)));
  await pg.goto(`http://localhost:${port}/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction("window.Bonsai && window.Bonsai.sketch && window.Bonsai.library && window.Bonsai.library.ready", { timeout: 30000 }).catch(() => {});
  await pg.evaluate(() => window.Bonsai.library.ready());
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const enterSketchBtn = () => pg.evaluate(() => document.getElementById('b-sketch').click());
  const escape = () => pg.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  const nPts = () => pg.evaluate(() => window.Bonsai.sketch.points.length);
  const addPts = pts => pg.evaluate(p => p.forEach(([x, y]) => window.Bonsai.sketch.addPoint(x, y)), pts);
  let PASS = 0, FAIL = 0;
  const ok = (c, m) => { (c ? PASS++ : FAIL++); console.log('  ' + (c ? '✅' : '❌') + ' ' + m); };
  try {
    // R1 — BUFFER + RESTORE across a stray Escape
    await enterSketchBtn(); await sleep(80);
    await addPts([[0, 0], [3, 0], [3, 2]]); await sleep(40);
    const drew = await nPts();
    await escape(); await sleep(80);                              // stray Escape — used to lose everything
    const afterEsc = await nPts();
    await enterSketchBtn(); await sleep(120);                     // re-open Sketch
    const restored = await nPts();
    ok(drew === 3 && restored === 3, 'R1 BUFFER+RESTORE: drew=' + drew + ' → Escape (pts now ' + afterEsc + ') → re-open restored=' + restored);

    // R2 — COMMIT clears the draft (3 restored points are extruded; re-open is empty)
    await pg.evaluate(() => document.getElementById('b-extrude').click());
    await sleep(900);                                             // async commitExtrude
    await enterSketchBtn(); await sleep(120);
    const afterCommit = await nPts();
    ok(afterCommit === 0, 'R2 COMMIT-CLEARS: after extrude+commit, re-open has ' + afterCommit + ' points (draft discarded)');

    // R3 — empty-then-cancel DISCARDS (Backspace to 0, Escape → no resurrection)
    await addPts([[0, 0], [2, 0]]); await sleep(40);             // (currently in sketch from R2 re-open)
    await escape(); await sleep(60);                              // buffer 2
    await enterSketchBtn(); await sleep(100);                     // restore 2
    const r2pts = await nPts();
    await pg.evaluate(() => { while (window.Bonsai.sketch.points.length) window.Bonsai.sketch.points.pop(); });   // empty them
    await escape(); await sleep(60);                              // cancel with 0 → discard draft
    await enterSketchBtn(); await sleep(100);
    const afterDiscard = await nPts();
    ok(r2pts === 2 && afterDiscard === 0, 'R3 DISCARD-EMPTY: restored=' + r2pts + ' → emptied → cancel → re-open=' + afterDiscard);
    await escape();   // leave sketch clean

    // R4 — route mirrors the same buffer/restore (served source; routePts is module-local so not directly readable)
    const src = await (await fetch(`http://localhost:${port}/modeller.html`)).text();
    const routeMirror = /_routeDraft = routePts\.map\(p => p\.slice\(\)\)/.test(src) &&     // exitRoute buffers
      /routePts = _routeDraft\.map\(p => p\.slice\(\)\)/.test(src) &&                        // enterRoute restores
      /exitRoute\(true\)/.test(src);                                                         // commit clears
    ok(routeMirror, 'R4 ROUTE-MIRROR: enter/exitRoute buffer+restore _routeDraft, commit clears (served source)');
  } catch (e) { console.log('  ERR ' + (e && e.stack || e)); FAIL++; }

  await br.close(); server.close();
  console.log('  §POINTS-RECOVERY VERDICT ' + (FAIL ? 'FAIL' : 'PASS') + ' — ' + PASS + ' PASS / ' + FAIL + ' FAIL');
  process.exit(FAIL ? 1 : 0);
})().catch(e => { console.log('FATAL ' + e); process.exit(1); });
