// ⚠ DO NOT REMOVE — WITNESS W-LAZY-ROWS (2026-11-28, bim-compiler prompts/MOBILE_PERF.md WO-3 + DESIGN REVIEW point 2)
// ISSUE THIS PROVES OR DISPROVES: APP.lazy(name) (viewer/main.js, table _LAZY) was written for ONE file per row. A row with many files
// (a) fetched them one after another (38 files = 38 round trips), (b) re-inserted EVERY file on a retry, so files that already ran ran twice,
// (c) had no init step, so a module needing its setupX(APP) could not be a row. A row is three small fixture files (viewer/tests/fixtures/
// lazy_row_{a,b,c}.js) served here with fixed delays a=400 b=200 c=50 ms; the witness adds the test rows through APP.lazy.rows.
//   L1 the three requests ARRIVE at the server before the first response has ENDED (parallel; server-side clock)
//   L2 they EXECUTE in list order a,b,c although c answers first (async=false)
//   L3 b answers 500 once: first call rejects, second resolves, a and c each executed exactly once, b once (retry inserts only b)
//   L4 init ran once, after the last file and before the promise resolved; a throwing init rejects and a retry runs init again, files not again
//   L5 the existing row still works: viewer/tests/witness_boot_cpe_lazy.js (unchanged) prints PASS
//   R1 RED CONTROL: the pre-change sequential APP.lazy body (git OLD_REF) spliced into main.js, served to a fresh page -> L1 must FAIL there
// §-log first — READ viewer/tests/witness_lazy_rows.log after every run. Run: node viewer/tests/witness_lazy_rows.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..'), OLD_REF = process.env.OLD_REF || '03f67130';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.sql': 'text/plain',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const DELAY = { a: 400, b: 200, c: 50 }, T0 = Date.now(), hits = [], failed = {};
let mainOverride = null;
const server = http.createServer((req, res) => {
  const u = req.url.split('?'), q = u[1] || '', p = decodeURIComponent(u[0]) === '/' ? '/viewer/viewer.html' : decodeURIComponent(u[0]);
  const fx = /\/fixtures\/lazy_row_([abc])\.js$/.exec(p);
  if (fx) {   // fixture: delayed; b answers 500 once per query that carries failb=1
    const f = fx[1], h = { f, q, arrive: Date.now() - T0, end: null, status: 200 }; hits.push(h);
    let status = 200; if (f === 'b' && /failb=1/.test(q) && !failed[q]) { failed[q] = true; status = 500; }
    h.status = status;
    setTimeout(() => { const body = status === 200 ? fs.readFileSync(path.join(ROOT, p)) : 'boom';
      res.writeHead(status, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); res.end(body, () => { h.end = Date.now() - T0; }); }, DELAY[f]);
    return;
  }
  if (mainOverride && /\/viewer\/main\.js$/.test(p)) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(mainOverride); return; }
  fs.readFile(path.join(ROOT, p), (e, buf) => { if (e) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
});
const log = []; let fails = 0, judged = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { judged++; if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rowSrc = tag => ['a', 'b', 'c'].map(f => 'tests/fixtures/lazy_row_' + f + '.js?r=' + tag);
// add a test row in the page; ready() = all three fixture files ran (their entry is in window.__lazyOrder)
const ADD_ROW = (name, tag, withInit) => `(function(){ var n = ${JSON.stringify(name)}, t = ${JSON.stringify(tag)};
  APP.lazy.rows[n] = { src: ${JSON.stringify(rowSrc(tag))}, ready: function() { var o = window.__lazyOrder || []; return ['a','b','c'].every(function(f) { return o.indexOf(f + '?r=' + t) >= 0; }); } };
  ${withInit === 'ok' ? "APP.lazy.rows[n].init = function() { window.__lazyOrder.push('init:' + t); };" : ''}
  ${withInit === 'throw1' ? "var k = 0; APP.lazy.rows[n].init = function() { window.__lazyOrder.push('init:' + t); if (++k === 1) throw new Error('init-boom'); };" : ''} })()`;
const runs = (order, e) => order.filter(x => x === e).length;
const arrivals = tag => hits.filter(h => h.q === 'r=' + tag || h.q.indexOf('r=' + tag + '&') === 0);

async function bootPage(browser) {
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage(), errs = [], cons = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 160))); page.on('console', m => cons.push(m.text()));
  await page.goto('http://127.0.0.1:' + server.address().port + '/viewer/viewer.html?db=buildings/Duplex_extracted.db', { waitUntil: 'domcontentloaded' });
  let ready = false;   // APP.lazy is assigned at the END of initViewer
  for (let i = 0; i < 120 && !ready; i++) { await sleep(1000); ready = await page.evaluate(() => !!(window.APP && typeof APP.lazy === 'function' && APP.lazy.rows)).catch(() => false); }
  return { page, errs, cons, ready };
}
const parallel = tag => { const hs = arrivals(tag); if (hs.length !== 3 || hs.some(h => h.end == null)) return { ok: false, d: 'hits=' + hs.length + ' ' + JSON.stringify(hs) };
  const lastArrive = Math.max(...hs.map(h => h.arrive)), firstEnd = Math.min(...hs.map(h => h.end));
  return { ok: lastArrive < firstEnd, d: 'last_arrive_ms=' + lastArrive + ' first_end_ms=' + firstEnd + ' (' + hs.map(h => h.f + ':' + h.arrive + '-' + h.end).join(' ') + ')' }; };

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  // ---- shipped main.js
  const A = await bootPage(browser);
  S('§LAZY_ROWS_BOOT ready=' + A.ready + ' pageerrors=' + JSON.stringify(A.errs));
  if (!A.ready) { verdict(false, 'boot: APP.lazy and APP.lazy.rows exist', 'the viewer never published them'); }
  else {
    // L1 + L2
    await A.page.evaluate(ADD_ROW('lz1', '1'));
    const c0 = A.cons.length, r1 = await A.page.evaluate(() => APP.lazy('lz1').then(v => 'resolved:' + v, e => 'rejected:' + e.message));
    const o1 = await A.page.evaluate(() => window.__lazyOrder.slice()), P = parallel('1'), lg = A.cons.slice(c0).find(t => /^§LAZY name=lz1 /.test(t)) || '';
    S('§LAZY_PARALLEL ' + P.d); S('§LAZY_LOG "' + lg + '"');
    verdict(P.ok && r1 === 'resolved:true', 'L1 the three requests all arrive before the first response ends (parallel fetch)', r1 + ' ' + P.d);
    verdict(JSON.stringify(o1) === JSON.stringify(['a?r=1', 'b?r=1', 'c?r=1']) && /files=3 fetched=3 .*ok=true/.test(lg), 'L2 they execute in list order a,b,c (c answers first) and §LAZY logs files=3 fetched=3 ok=true', 'order=' + JSON.stringify(o1) + ' "' + lg + '"');
    // L3
    await A.page.evaluate(ADD_ROW('lz3', '3&failb=1'));
    const rr = await A.page.evaluate(async () => { const x = await APP.lazy('lz3').then(v => 'resolved:' + v, e => 'rejected:' + e.message);
      const mid = window.__lazyOrder.filter(e => /r=3/.test(e)); const y = await APP.lazy('lz3').then(v => 'resolved:' + v, e => 'rejected:' + e.message);
      return { first: x, second: y, mid: mid, all: window.__lazyOrder.filter(e => /r=3/.test(e)) }; });
    const h3 = arrivals('3&failb=1').map(h => h.f + ':' + h.status);
    S('§LAZY_RETRY first=' + rr.first + ' second=' + rr.second + ' ran_after_first=' + JSON.stringify(rr.mid) + ' ran_final=' + JSON.stringify(rr.all) + ' server=' + JSON.stringify(h3));
    verdict(/^rejected:/.test(rr.first) && rr.second === 'resolved:true' && runs(rr.all, 'a?r=3&failb=1') === 1 && runs(rr.all, 'b?r=3&failb=1') === 1 && runs(rr.all, 'c?r=3&failb=1') === 1
      && h3.filter(x => x.startsWith('a:')).length === 1 && h3.filter(x => x.startsWith('c:')).length === 1 && h3.filter(x => x.startsWith('b:')).length === 2,
      'L3 b answers 500 once: first call rejects, second resolves; a and c ran exactly once, b ran once; a and c fetched once, only b again', rr.first + ' / ' + rr.second);
    // L4: init
    await A.page.evaluate(ADD_ROW('lz4', '4', 'ok')); await A.page.evaluate(ADD_ROW('lz4t', '5', 'throw1'));
    const r4 = await A.page.evaluate(async () => { const a = await APP.lazy('lz4').then(v => { window.__lazyOrder.push('resolved:4'); return 'resolved:' + v; }, e => 'rejected:' + e.message);
      await APP.lazy('lz4');   // second call: ready already true, init not run again
      const b1 = await APP.lazy('lz4t').then(v => 'resolved:' + v, e => 'rejected:' + e.message); const b2 = await APP.lazy('lz4t').then(v => 'resolved:' + v, e => 'rejected:' + e.message);
      return { a: a, b1: b1, b2: b2, order: window.__lazyOrder.slice() }; });
    const o = r4.order, iInit = o.indexOf('init:4'), iLast = Math.max(o.indexOf('a?r=4'), o.indexOf('b?r=4'), o.indexOf('c?r=4')), iRes = o.indexOf('resolved:4');
    S('§LAZY_INIT ok_row=' + r4.a + ' throwing_row first=' + r4.b1 + ' second=' + r4.b2 + ' init_runs_ok=' + runs(o, 'init:4') + ' init_runs_throwing=' + runs(o, 'init:5') + ' files_5=' + ['a', 'b', 'c'].map(f => runs(o, f + '?r=5')));
    verdict(r4.a === 'resolved:true' && runs(o, 'init:4') === 1 && iLast >= 0 && iInit > iLast && iRes > iInit
      && /^rejected:init-boom/.test(r4.b1) && r4.b2 === 'resolved:true' && runs(o, 'init:5') === 2 && ['a', 'b', 'c'].every(f => runs(o, f + '?r=5') === 1),
      'L4 init ran once after the last file and before the promise resolved; a throwing init rejects, the retry runs init again and no file again', 'order=' + JSON.stringify(o));
  }
  const errsA = A.errs.slice();
  // ---- R1 red control: the pre-change sequential body spliced into this main.js
  const oldMain = cp.execSync('git show ' + OLD_REF + ':viewer/main.js', { cwd: ROOT, maxBuffer: 1 << 28 }).toString(), cur = fs.readFileSync(path.join(ROOT, 'viewer', 'main.js'), 'utf8');
  const sig = '  APP.lazy = function(name) {', oi = oldMain.indexOf(sig), oe = oldMain.indexOf('    return _lazyP[name];\n  };\n', oi) + '    return _lazyP[name];\n  };\n'.length;
  const ci = cur.indexOf(sig), ce = cur.indexOf('    return _lazyP[name];\n  };\n', ci) + '    return _lazyP[name];\n  };\n'.length;
  let redMsg = 'splice failed', redP = { ok: true, d: '' }, redReady = false;
  if (oi > 0 && ci > 0 && oe > oi && ce > ci) {
    mainOverride = cur.slice(0, ci) + oldMain.slice(oi, oe) + cur.slice(ce);
    const B = await bootPage(browser); redReady = B.ready;
    if (B.ready) { await B.page.evaluate(ADD_ROW('lzr', 'R1'));
      const rr = await B.page.evaluate(() => APP.lazy('lzr').then(v => 'resolved:' + v, e => 'rejected:' + e.message)); redP = parallel('R1'); redMsg = rr + ' ' + redP.d; }
    else redMsg = 'red page never booted';
    mainOverride = null;
  }
  S('§LAZY_RED old_body_ref=' + OLD_REF + ' booted=' + redReady + ' parallel_ok=' + redP.ok + ' ' + redMsg);
  const redDetected = redReady && redP.ok === false;
  S('§LAZY_RED_CONTROL ' + (redDetected ? 'the old sequential body FAILS L1, as required' : 'NOT detected (old body passed L1 or never ran)'));
  await browser.close(); server.close();
  // ---- L5: the existing row's own witness, unchanged
  const w5 = path.join(__dirname, 'witness_boot_cpe_lazy.js'); let out5 = '', code5 = -1;
  try { out5 = cp.execSync('node ' + JSON.stringify(w5) + ' 2>&1', { cwd: ROOT, maxBuffer: 1 << 26, timeout: 400000 }).toString(); code5 = 0; } catch (e) { out5 = String(e.stdout || '') + String(e.stderr || ''); code5 = e.status; }
  const v5 = (out5.split('\n').filter(l => /^§WITNESS_BOOT_CPE_LAZY /.test(l)).pop() || '(no verdict line)');
  S('§LAZY_L5 ' + v5);
  verdict(/^§WITNESS_BOOT_CPE_LAZY PASS /.test(v5) && code5 === 0, 'L5 the existing row (cpe) still works: witness_boot_cpe_lazy.js unchanged and green', v5);
  verdict(errsA.length === 0, 'no page error on the shipped page', JSON.stringify(errsA));
  const v = !redDetected ? (fails ? 'FAIL' : 'INCONCLUSIVE') : fails ? 'FAIL' : 'PASS';
  S(`§W-LAZY-ROWS checks=${judged - 1} fail=${fails} verdict=${v}` + (redDetected ? '' : ' red_control=not-detected'));
  fs.writeFileSync(path.join(__dirname, 'witness_lazy_rows.log'), log.join('\n') + '\n'); process.exit(v === 'PASS' ? 0 : 1);
})().catch(e => { S('§W-LAZY-ROWS FAIL fatal=' + (e && e.stack || e)); fs.writeFileSync(path.join(__dirname, 'witness_lazy_rows.log'), log.join('\n') + '\n'); process.exit(1); });
