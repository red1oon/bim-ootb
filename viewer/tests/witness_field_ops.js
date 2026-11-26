// ⚠ DO NOT REMOVE — Scope guard
// Scope: W-FIELD-OPS — bim-compiler prompts/MOBILE_PERF.md §P5 SPEC F1 + F2 (owner GO 2026-11-27).
// Issues this witness proves or disproves, phone emulation, Duplex:
//   F1a starting Walk did not turn X-Ray on → it does (`§WALK_XRAY_AUTO on`), and stopping restores Off.
//   F1b the user must be able to turn it off from the menu during the walk → two taps on Inspect "X-Ray / Bbox"
//       (X-Ray → Bbox → Off) leave it off, and stopping keeps the user's choice.
//   F1c a user who already had X-Ray on is not overridden (no auto line, still on after stop).
//   F2a walk steps were not logged → start / every 5th step / turn ≥ 30° / stop become 'walk' events in the op-log
//       (history bar), distinct labels, increasing i, positions moving WALK_STEP_DISTANCE per step.
//   F2b replay = scrub: jumpTo an early walk event puts the camera back within 1 cm of its logged position.
//   F2c the trace states where its geo came from (gps | site | model) — never a guessed position.
//   RED control: ?walktrace=0 → 0 walk events → F2a must go RED.
// §-log first — READ viewer/tests/witness_field_ops.log after every run before any conclusion.
// Run:  node viewer/tests/witness_field_ops.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.sql': 'text/plain',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});
const PHONE = { viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Mobile Safari/537.36' };

const log = []; let fails = 0, judged = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { judged++; if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); return ok; }

async function open(browser, query) {
  const ctx = await browser.newContext(PHONE); const page = await ctx.newPage(); const cons = [];
  page.on('console', m => { const t = m.text(); cons.push(t); if (/§(WALK_XRAY_AUTO|WALK_TRACE)/.test(t)) log.push('  [console] ' + t); });
  page.on('pageerror', e => log.push('  [pageerror] ' + String(e.message).slice(0, 200)));
  await page.goto('http://127.0.0.1:' + server.address().port + '/viewer/viewer.html?db=buildings/Duplex_extracted.db' + query, { waitUntil: 'domcontentloaded' });
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) { await page.waitForTimeout(1000);
    ready = await page.evaluate(() => !!(window.APP && APP.guidMap && Object.keys(APP.guidMap).length && APP.streaming === false && APP.setWalkAnchor && window.UniversalHistory)).catch(() => false); }
  return { ctx, page, cons, ready };
}
const xray = page => page.evaluate(() => ({ xray: !!APP.xrayOn, ghost: !!(window.ghostXrayOn && window.ghostXrayOn()) }));
const since = (cons, mark, re) => cons.slice(mark).filter(t => re.test(t));
// a simulated walk: n steps, a camera turn of `turnDeg` before step `turnAt`
async function walk(page, n, turnAt, turnDeg) {
  await page.evaluate(([n, turnAt, turnDeg]) => { APP.setWalkAnchor(); for (let k = 1; k <= n; k++) {
    if (k === turnAt) APP.camera.rotateY(turnDeg * Math.PI / 180); APP.walkStepCount = (APP.walkStepCount || 0) + 1; APP.advanceWalkStep(); }
    APP.stopWalkMode(); }, [n, turnAt, turnDeg]);
  await page.waitForTimeout(400);
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch();

  S('── PHONE, Duplex ──');
  const { ctx, page, cons, ready } = await open(browser, '');
  verdict(ready, 'Duplex loaded, Walk + op-log present');
  if (ready) {
    // F1a
    let m = cons.length; await page.evaluate(() => { APP.walkStepCount = 0; APP.setWalkAnchor(); }); await page.waitForTimeout(300);
    const onWalk = await xray(page); await page.evaluate(() => APP.stopWalkMode()); await page.waitForTimeout(300); const afterStop = await xray(page);
    verdict(onWalk.xray && afterStop.xray === false && since(cons, m, /^§WALK_XRAY_AUTO on/).length === 1 && since(cons, m, /restored off/).length === 1,
      'F1a Walk turns X-Ray on, stop restores Off', 'during=' + JSON.stringify(onWalk) + ' after=' + JSON.stringify(afterStop));
    // F1b — the menu row, as a phone user reaches it
    m = cons.length; await page.evaluate(() => APP.setWalkAnchor()); await page.waitForTimeout(300);
    const tapRow = () => page.evaluate(() => { const pn = document.getElementById('inspect-drawer-panel');
      const r = pn && [...pn.querySelectorAll('button')].find(b => (b.innerText || '').trim().startsWith('X-Ray')); if (!r) return false;
      r.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return true; });
    await page.evaluate(() => { if (window.toggleMobilePill) window.toggleMobilePill(); document.getElementById('pill-inspect').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
    await page.waitForTimeout(500);
    // two QUICK taps (no wait): the lazy Bbox module may still be loading on the second tap — the §XRAY_CYCLE_PENDING race
    const t1 = await tapRow(); await page.waitForTimeout(50);
    const t2 = await tapRow(); await page.waitForTimeout(4000); const mid = { ghost: true }; const off = await xray(page);
    await page.evaluate(() => APP.stopWalkMode()); await page.waitForTimeout(300); const kept = await xray(page);
    verdict(t1 && t2 && mid.ghost && !off.xray && !off.ghost && !kept.xray && !kept.ghost && since(cons, m, /kept user_changed=true/).length === 1,
      'F1b two quick taps on Inspect "X-Ray / Bbox" turn it off mid-walk (lazy Bbox race); stop keeps the choice', 'settled_after_2_taps=' + JSON.stringify(off) + ' after_stop=' + JSON.stringify(kept));
    await page.evaluate(() => { const pn = document.getElementById('inspect-drawer-panel'); if (pn) pn.style.display = 'none'; });
    // F1c
    m = cons.length; await page.evaluate(() => { APP.toggleXray(); APP.setWalkAnchor(); APP.stopWalkMode(); }); await page.waitForTimeout(300);
    const stillOn = await xray(page);
    verdict(stillOn.xray && since(cons, m, /^§WALK_XRAY_AUTO/).length === 0, 'F1c X-Ray already on: not overridden', JSON.stringify(stillOn));
    await page.evaluate(() => APP.toggleXray());

    // F2 — 23 steps, a 45° turn before step 12
    m = cons.length; const l0 = (await page.evaluate(() => UniversalHistory.list())).length;
    await page.evaluate(() => { APP.walkStepCount = 0; });
    await walk(page, 23, 12, 45);
    const tr = since(cons, m, /^§WALK_TRACE /).map(t => { const g = k => (t.match(new RegExp(k + '=(\\S+)')) || [])[1];
      return { i: +g('i'), why: g('why'), steps: +g('steps'), p: g('p').split(',').map(Number), geo: g('geo') }; });
    const list = (await page.evaluate(() => UniversalHistory.list())).slice(l0);
    const walkEv = list.filter(e => /^Walk · /.test(e.label || ''));
    const labels = new Set(walkEv.map(e => e.label));
    const incr = tr.every((x, k) => k === 0 || x.i === tr[k - 1].i + 1);
    const D = await page.evaluate(() => APP.WALK_STEP_DISTANCE);
    // straight segments: distance between consecutive marks == Δsteps × stride (the turn is a heading change only)
    const yawOf = t => +(t.match(/yaw=(-?\d+)/) || [])[1];
    const yaws = since(cons, m, /^§WALK_TRACE /).map(yawOf);
    const straight = tr.slice(1).map((x, k) => ({ a: tr[k], b: x, same: yaws[k] === yaws[k + 1] })).filter(s => s.same && s.b.steps > s.a.steps);
    const segOk = straight.length >= 3 && straight.every(({ a, b }) => { const dd = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]);
      return Math.abs(dd - (b.steps - a.steps) * D) <= 0.02; });
    verdict(tr.length >= 6 && walkEv.length === tr.length && labels.size === walkEv.length && incr && segOk && tr.some(x => x.why === 'turn'),
      'F2a the walk is in the op-log: start / every 5 steps / turn / stop', 'events=' + walkEv.length + ' trace_lines=' + tr.length + ' distinct_labels=' + labels.size +
      ' whys=' + tr.map(x => x.why + '@' + x.steps).join(',') + ' stride=' + D + ' straight_segments=' + straight.length + ' segments_ok=' + segOk);
    // F2b — scrub back to the 3rd walk event and compare the camera with its logged position
    const target = walkEv[2], want = tr[2];
    const cam = await page.evaluate(i => { UniversalHistory.jumpTo(i); const p = APP.camera.position; return [p.x, p.y, p.z]; }, l0 + list.indexOf(target));
    const err = Math.hypot(cam[0] - want.p[0], cam[1] - want.p[1], cam[2] - want.p[2]);
    verdict(!!target && err <= 0.01 + 0.005, 'F2b scrubbing to a walk event puts the camera back where it was', 'event="' + (target && target.label) + '" logged_p=' + want.p.join(',') + ' camera=' + cam.map(v => v.toFixed(2)).join(',') + ' err_m=' + err.toFixed(4));
    verdict(tr.every(x => /^(gps|site|model)$/.test(x.geo)), 'F2c every trace point states its geo source', 'sources=' + [...new Set(tr.map(x => x.geo))].join(','));
  }
  await ctx.close();

  S('\n── RED CONTROL: ?walktrace=0 — the same walk must leave no walk events ──');
  const R = await open(browser, '&walktrace=0');
  if (R.ready) {
    const m = R.cons.length; await R.page.evaluate(() => { APP.walkStepCount = 0; }); await walk(R.page, 23, 12, 45);
    const n = since(R.cons, m, /^§WALK_TRACE /).length;
    judged++; if (n !== 0) fails++;
    S('   ' + (n === 0 ? '🟢 red control went RED as required (0 walk events)' : '🔴 red control did NOT go red — walk events=' + n));
  } else { judged++; fails++; S('   🔴 red run did not load'); }
  await R.ctx.close();

  await browser.close(); server.close();
  const outcome = judged <= 1 ? 'INCONCLUSIVE' : (fails === 0 ? 'PASS' : 'FAIL');
  S('\n§WITNESS_FIELD_OPS ' + outcome + ' judged=' + judged + ' fails=' + fails);
  fs.writeFileSync(path.join(__dirname, 'witness_field_ops.log'), log.join('\n') + '\n');
  process.exit(outcome === 'PASS' ? 0 : 1);
})();
