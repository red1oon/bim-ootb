#!/usr/bin/env node
// PROBE — §GANTT_RESCHEDULE_ASAP live round-trip: push a real task late, pull the schedule back
// through the REAL commit path (__tmRescheduleAsap → rescheduleGanttAsap → ScheduleAuthor verb →
// retime → persist), reload, and prove the compressed dates came back from the cache slot.
// Same contract as probe_gantt_gestures.js: verdicts read from §-log lines and SQL values, never a
// screenshot. The node witness (witness_gantt_reschedule_asap.js) is the hard gate for the verb's
// semantics; THIS is the half only a real browser proves — the 7-step pipeline against a real
// building db, and §S70 persistence across a reload.
//
//   SERVE_ROOT must be the REPO ROOT, not viewer/ — the page loads ../erp/bigdecimal.js; serving
//   viewer/ alone manufactures spurious "RoundingMode" errors (§S72 lesson).
//   PUPPETEER=<path to a puppeteer install> if not resolvable; CHROME=<executable> to pin a build
//   (older bundled Chromiums have failed WebGL2 creation on this box — use ~152).
'use strict';
const { spawn } = require('child_process');
const puppeteer = require(process.env.PUPPETEER || 'puppeteer');
const fs = require('fs');
const PORT = Number(process.env.PORT || 8149);
const ROOT = process.env.SERVE_ROOT || process.cwd();
const BLD = process.env.BLD || 'Duplex_extracted';
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`;
const CHROME = process.env.CHROME ||
  (fs.existsSync('/home/red1/.cache/puppeteer/chrome/linux-152.0.7977.42/chrome-linux64/chrome')
    ? '/home/red1/.cache/puppeteer/chrome/linux-152.0.7977.42/chrome-linux64/chrome' : undefined);

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('  PASS ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  ' + detail : '')); }
};

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500));
  const browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  const lines = [], errs = [];
  page.on('console', m => { const t = m.text(); if (t.indexOf('§') >= 0) lines.push(t); });
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  const has = (n, re) => lines.slice(n).some(l => re.test(l));
  const grab = (n, re) => (lines.slice(n).filter(l => re.test(l)).pop() || '');

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof window.toggleTimeMachine === 'function', { timeout: 180000 });
  await page.waitForFunction(() => window.APP && window.APP.db, { timeout: 240000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 12000));
  check('P0 page loads with no JS error', errs.length === 0, errs.length ? errs[0] : '(0 page errors)');

  await page.evaluate(() => window.toggleTimeMachine());
  await new Promise(r => setTimeout(r, 15000));
  await page.evaluate(() => { const g = document.getElementById('tm-gantt'); g && g.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await new Promise(r => setTimeout(r, 6000));
  const bars = await page.evaluate(() => (window.__tmGanttWindows ? window.__tmGanttWindows() : []).filter(b => b.taskId).length);
  check('P1 gantt drawer open with real task bars', bars > 1, 'bars=' + bars);
  check('P1b the transport row carries the new button', await page.evaluate(() => !!document.getElementById('tm-reschedule-asap')), '#tm-reschedule-asap');

  // Pick a LATE task that HAS predecessors (a root would anchor and never move), then push it +30d
  // with the real drag verb so the schedule provably carries closable float.
  const victim = await page.evaluate(() => {
    const q = window.APP.db.exec(
      'SELECT t.task_id, t.schedule_start, t.schedule_finish FROM tasks t ' +
      'WHERE t.task_id IN (SELECT successor_id FROM task_sequences) ' +
      'AND (t.is_summary IS NULL OR t.is_summary=0) ORDER BY t.schedule_finish DESC LIMIT 1');
    return q.length && q[0].values.length ? { id: q[0].values[0][0], start: q[0].values[0][1], finish: q[0].values[0][2] } : null;
  });
  check('P2 found a successor task to push late', !!victim, victim ? victim.id + ' @ ' + victim.start : '(none)');

  let mark = lines.length;
  const dragged = await page.evaluate(id => window.__tmGanttDrag(id, 'move', 30), victim.id);
  await new Promise(r => setTimeout(r, 5000));
  check('P3 real drag pushed it +30d (§GANTT_DRAG_COMMIT)', dragged === true && has(mark, /§GANTT_DRAG_COMMIT/),
    grab(mark, /§GANTT_DRAG_COMMIT/) || '(no commit line)');

  // ── The feature: pull back through the REAL commit path ─────────────────────────────────────────
  mark = lines.length;
  const pulled = await page.evaluate(() => window.__tmRescheduleAsap());
  await new Promise(r => setTimeout(r, 6000));
  const asapLine = grab(mark, /§GANTT_RESCHEDULE_ASAP schedule=/);
  const movedN = Number((asapLine.match(/moved=(\d+)/) || [0, 0])[1]);
  check('P4 pull-back committed through the real path', pulled === true && movedN >= 1, asapLine || '(no § line)');
  check('P4b the victim was pulled back off its pushed position', await page.evaluate(v => {
    const q = window.APP.db.exec('SELECT schedule_start FROM tasks WHERE task_id=?', [v.id]);
    const now = q.length && q[0].values.length ? q[0].values[0][0] : null;
    window.__probePulledStart = now;
    return now !== null && now <= v.start;   // back at (or before — pre-existing float) its pre-drag start
  }, victim), 'preDrag=' + victim.start + ' afterPull=' + await page.evaluate(() => window.__probePulledStart));
  check('P5 the edit persisted (§GANTT_EDIT_PERSIST what=rescheduleAsap ok=true)',
    /what=rescheduleAsap[^\n]*ok=true/.test(grab(mark, /§GANTT_EDIT_PERSIST /)), grab(mark, /§GANTT_EDIT_PERSIST /));
  const pulledStart = await page.evaluate(() => window.__probePulledStart);

  // ── §S70 round trip: reload, the compressed date must come back from the cache ─────────────────
  mark = lines.length;
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.db, { timeout: 240000 });
  await new Promise(r => setTimeout(r, 8000));
  check('P6 reload served from cache (§CACHE_HIT)', has(mark, /§CACHE_HIT/), grab(mark, /§CACHE_HIT/) || '(no cache-hit line)');
  const afterReload = await page.evaluate(id => {
    const q = window.APP.db.exec('SELECT schedule_start FROM tasks WHERE task_id=?', [id]);
    return q.length && q[0].values.length ? q[0].values[0][0] : null;
  }, victim.id);
  check('P7 the pulled-back date SURVIVED the reload', afterReload === pulledStart,
    'afterPull=' + pulledStart + ' afterReload=' + afterReload);

  check('P8 no JS error across the whole cycle', errs.length === 0, errs.length ? errs[0] : '(0 page errors)');
  console.log('§GANTT_RESCHEDULE_ASAP_PROBE_SUMMARY pass=' + pass + ' fail=' + fail);
  await browser.close(); server.kill();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR ' + (e && e.stack || e)); process.exit(2); });
