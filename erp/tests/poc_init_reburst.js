// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for the init-bubble "jumping / reburst on refresh" report.
//   The "init bubble" = the initbubble.json constellation/globe (erp.html Phase-1, ad_ui._renderHomeGraph
//   → ADGraph.initFromBubbles). User report: "jumping or reburst of the initbubble during refresh."
//
//   This test SEPARATES the two hypotheses and NAMES which is real (§-log first — READ the log):
//     (1) REBURST — initFromBubbles fires >1× per load (a true second burst). FALSIFIER if burstCount>1.
//     (2) JUMP    — the globe paints at the initial canvas size, then the 100ms auto-maximize
//                   (setTimeout(_resizeGraph(true),100)) re-lays-out the sphere → node positions leap.
//                   Measured as maxDelta(px) of node screen positions between first-paint and settle.
//
//   PROVES/DISPROVES: "the init-bubble jumps/reburst on every load (incl. refresh)."
//   PASS = burstCount==1 per load (no reburst) AND positional jump ≤ JUMP_TOL px (settled-on-first-paint).
//   A FAIL with burst==1 + large jump localises the cause to the deferred auto-maximize, NOT a reburst.
//   cold = fresh context (no SW/IDB). warm = 2nd load same context (the "every refresh" the user feels).
// Run:  node tests/poc_init_reburst.js 2>&1 | tee tests/poc_init_reburst.log   (cwd = bim-ootb/erp)
'use strict';
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html','.js':'text/javascript','.json':'application/json','.db':'application/octet-stream','.wasm':'application/wasm','.css':'text/css','.png':'image/png' };
const JUMP_TOL = 40;   // px — a settled first paint should not move nodes more than this after paint.

const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/erp.html';
  fs.readFile(path.join(ROOT, p), (e, b) => {
    if (e) { r.writeHead(404); r.end('404'); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b);
  });
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Precise jump metric = the CANVAS DIMENSIONS at first paint vs settle. A deferred auto-maximize changes
// canvas.width/height AFTER the globe paints → the visible size/position jump. The intended fly-in (nodes
// easing from centre) does NOT change canvas dims, so this isolates the JUMP from the animation.
function canvasDims(pg) {
  return pg.evaluate(() => {
    const c = document.querySelector('#content canvas, canvas');
    return c ? { w: c.width, h: c.height } : null;
  });
}

async function measure(pg, port, label) {
  let burst = 0;
  // count EVERY initFromBubbles (the burst) across the whole load — installed before navigation so the
  // very first call is counted; catches the fullscreen-resize fallback + nav-home re-renders too.
  await pg.evaluateOnNewDocument(() => {
    window.__burst = 0;
    let _g; Object.defineProperty(window, 'ADGraph', {
      configurable: true,
      get() { return _g; },
      set(v) {
        if (v && v.initFromBubbles && !v.__wrapped) {
          const o = v.initFromBubbles;
          v.initFromBubbles = function () { window.__burst++; return o.apply(this, arguments); };
          v.__wrapped = true;
        }
        _g = v;
      }
    });
  });
  await pg.goto(`http://localhost:${port}/erp.html`, { waitUntil: 'domcontentloaded' });
  // wait for first paint (loading overlay gone), sample EARLY (before the 100ms auto-max), then settle.
  await pg.waitForFunction(() => { const l = document.getElementById('loading'); return !l || getComputedStyle(l).display === 'none'; }, { timeout: 20000 }).catch(() => {});
  await sleep(55); const cEarly = await canvasDims(pg);     // first paint, pre auto-maximize
  await sleep(2000); const cLate = await canvasDims(pg);    // settled (auto-max done)
  burst = await pg.evaluate(() => window.__burst || 0);
  const resized = (cEarly && cLate) ? (cEarly.w !== cLate.w || cEarly.h !== cLate.h) : true;
  console.log(`§INIT-REBURST[${label}] burstCount=${burst} canvasFirstPaint=${JSON.stringify(cEarly)} canvasSettled=${JSON.stringify(cLate)} resizedAfterPaint=${resized ? 'Y' : 'N'}`);
  return { burst, resized };
}

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const errs = [];

  const ctxColdPg = await br.newPage();
  ctxColdPg.on('pageerror', e => errs.push('[cold] ' + e.message));
  const cold = await measure(ctxColdPg, port, 'cold');
  await ctxColdPg.close();

  // warm: reuse a page across two loads so SW/IDB are primed → the "every refresh" path.
  const warmPg = await br.newPage();
  warmPg.on('pageerror', e => errs.push('[warm] ' + e.message));
  await measure(warmPg, port, 'warm-1(prime)');
  await sleep(600);
  const warm = await measure(warmPg, port, 'warm(refresh)');
  await warmPg.close();

  await br.close(); server.close();

  const noReburst = cold.burst === 1 && warm.burst === 1;
  const settled = !cold.resized && !warm.resized;     // canvas not resized after first paint = no jump
  const pass = noReburst && settled && errs.length === 0;
  console.log(`§INIT-REBURST burst(cold=${cold.burst},warm=${warm.burst}) resizedAfterPaint(cold=${cold.resized ? 'Y' : 'N'},warm=${warm.resized ? 'Y' : 'N'}) reburst=${noReburst ? 'none' : 'PRESENT'} pageErrors=${errs.length ? errs.join('|') : 0}`);
  console.log(`§INIT-REBURST-RESULT ${pass ? 'PASS' : 'FAIL'} — ${noReburst ? 'no reburst (initFromBubbles once/load)' : 'REBURST: initFromBubbles fired >1×'}; ${settled ? 'globe paints at final size (no jump)' : 'JUMP: canvas resized after first paint (deferred auto-maximize)'}`);
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('FATAL ' + e.message); process.exit(2); });
