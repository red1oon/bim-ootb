#!/usr/bin/env node
// PROBE — live-fire the SA-not-loaded / natural-precondition refusal cluster named in
// 4D_GANTT_TM_REFACTOR.md §S72 gap 3 ("nothing checks that it still refuses"). Same contract as
// probe_gantt_gestures.js: reports by §-log, gates on exit code, real browser, real DOM/pointer
// events — never a source-text slice (that class of witness has gone stale twice in this lane:
// G-COH-6, witness_gantt_lock_integrity).
//
//   SERVE_ROOT must be the REPO ROOT (../erp/bigdecimal.js, ../erp/ad_seed.db) — §S72's lesson.
'use strict';
const { spawn } = require('child_process');
const puppeteer = require(process.env.PUPPETEER || 'puppeteer');
const PORT = Number(process.env.PORT || 8146);
const ROOT = process.env.SERVE_ROOT || __dirname + '/..';
const BLD = process.env.BLD || 'Duplex_extracted';
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`;

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('  PASS ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  ' + detail : '')); }
};

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500));
  const browser = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  const lines = [], errs = [];
  page.on('console', m => { const t = m.text(); if (t.indexOf('§') >= 0) lines.push(t); });
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  const since = n => lines.slice(n);
  const has = (n, re) => since(n).some(l => re.test(l));
  const grab = (n, re) => (since(n).filter(l => re.test(l)).pop() || '');

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof window.toggleTimeMachine === 'function', { timeout: 180000 });
  await page.waitForFunction(() => window.APP && window.APP.db, { timeout: 240000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 12000));
  check('G0 page loads with no JS error', errs.length === 0, errs.length ? errs[0] : '(0 page errors)');

  await page.evaluate(() => window.toggleTimeMachine());
  await new Promise(r => setTimeout(r, 15000));
  await page.evaluate(() => { const g = document.getElementById('tm-gantt'); g && g.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await new Promise(r => setTimeout(r, 6000));
  await page.evaluate(() => { const l = document.getElementById('tm-gantt-editlock'); l && l.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await new Promise(r => setTimeout(r, 4000));
  const barCount = await page.evaluate(() => (window.__tmGanttBars || []).filter(b => b.taskId).length);
  check('G1 gantt drawer open and editing enabled', lines.some(l => /§GANTT_EDIT_LOCK editable=true/.test(l)) && barCount > 1, 'bars=' + barCount);

  // ── R1: undo with nothing to undo — natural state right after drawer opens, no SA tampering ────
  let mark = lines.length;
  await page.evaluate(() => { const b = document.getElementById('tm-undo'); b && b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await new Promise(r => setTimeout(r, 1500));
  check('R1 §GANTT_EDIT_UNDO_REJECT fires on undo-with-nothing-to-undo', has(mark, /§GANTT_EDIT_UNDO_REJECT reason=nothing_to_undo/), grab(mark, /§GANTT_EDIT_UNDO_REJECT/));

  // ── Null window.ScheduleAuthor — simulates a load-order failure, the shared precondition for the
  //    §GANTT_DRAG_REJECT / §GANTT_SET_BASELINE_REJECT / §GANTT_LINK_REJECT ScheduleAuthor_not_loaded
  //    branches. Snapshot first so it can be restored.
  await page.evaluate(() => { window.__savedSA = window.ScheduleAuthor; window.ScheduleAuthor = undefined; });

  // ── R2: drag with SA missing, via the __tmGanttDrag hook (§S73 fixed this hook to report honestly) ─
  mark = lines.length;
  const taskId = await page.evaluate(() => (window.__tmGanttBars || []).find(b => b.taskId).taskId);
  const dragRes = await page.evaluate(tid => window.__tmGanttDrag(tid, 'move', 1), taskId);
  await new Promise(r => setTimeout(r, 1000));
  check('R2 §GANTT_DRAG_REJECT fires when ScheduleAuthor is missing',
    has(mark, /§GANTT_DRAG_REJECT reason=ScheduleAuthor_not_loaded/) && dragRes !== true,
    grab(mark, /§GANTT_DRAG_REJECT/) + '  hookReturned=' + dragRes);

  // ── R3: set-baseline with SA missing, real click ─────────────────────────────────────────────
  mark = lines.length;
  await page.evaluate(() => { const b = document.getElementById('tm-baseline'); b && b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await new Promise(r => setTimeout(r, 1500));
  check('R3 §GANTT_SET_BASELINE_REJECT fires when ScheduleAuthor is missing', has(mark, /§GANTT_SET_BASELINE_REJECT reason=ScheduleAuthor_not_loaded/), grab(mark, /§GANTT_SET_BASELINE_REJECT/));

  // ── R4: link gesture (bar→bar drag, ≥14px vertical travel — the real recognition rule per §S73)
  //    with SA missing. Mirrors probe_gantt_gestures.js G7's exact shape (picks a target bar on a
  //    different row, ≥20px away, not just "the next bar" which could be too close to register).
  mark = lines.length;
  await page.evaluate(() => {
    const rects = (window.__tmGanttBars || []).filter(b => b.taskId);
    const c = document.getElementById('tm-gantt-canvas'), r = c.getBoundingClientRect();
    const a = rects[0], z = rects.find(x => Math.abs(x.midY - a.midY) >= 20) || rects[1];
    const ev = (ty, x, y) => c.dispatchEvent(new PointerEvent(ty, { bubbles: true, clientX: r.left + x, clientY: r.top + y, pointerId: 1, isPrimary: true, button: 0, buttons: 1 }));
    ev('pointerdown', a.midX, a.midY); ev('pointermove', a.midX + 2, a.midY + 8); ev('pointermove', z.midX, z.midY); ev('pointerup', z.midX, z.midY);
  });
  await new Promise(r => setTimeout(r, 3000));
  // KNOWN_UNRESOLVED (2026-08-23): the positive control (link succeeding, SA present, fresh state,
  // isolated probe) ALSO produces zero §GANTT_LINK/§GANTT_EDIT_CYCLE_BLOCKED output in this harness —
  // ruled out: _tmEditLocked (not busy), SA presence, viewport size, event-construction pattern
  // (byte-identical to probe_gantt_gestures.js's own working G7). Not claimed as a product defect —
  // the positive case failing too points at the harness, not the guard. See doc section for detail.
  check('R4 §GANTT_LINK_REJECT fires when ScheduleAuthor is missing (KNOWN_UNRESOLVED — harness, not proven product)', has(mark, /§GANTT_LINK_REJECT reason=ScheduleAuthor_not_loaded/), grab(mark, /§GANTT_LINK_REJECT|§GANTT_EDIT_CYCLE_BLOCKED/) || '(no link/cycle line — even the positive control fails the same way, see KNOWN_UNRESOLVED note)');

  // ── Restore ScheduleAuthor, prove no lasting corruption: the same drag now succeeds ─────────────
  await page.evaluate(() => { window.ScheduleAuthor = window.__savedSA; });
  mark = lines.length;
  const dragRes2 = await page.evaluate(tid => window.__tmGanttDrag(tid, 'move', 1), taskId);
  await new Promise(r => setTimeout(r, 1500));
  check('R5 drag SUCCEEDS after ScheduleAuthor is restored (guard is transient, not corrupting)',
    dragRes2 === true && has(mark, /§GANTT_RETIME|§GANTT_DRAG_REJECT_ABSENT_CHECK|§GANTT_EDIT_MOVE/),
    'hookReturned=' + dragRes2 + '  ' + grab(mark, /§GANTT_(RETIME|EDIT_MOVE)/));

  // ── R6: persist-skip reason=cache_disabled — real precondition, SA present, app._cacheDisabled set
  mark = lines.length;
  await page.evaluate(() => { window.APP && (window.APP._cacheDisabled = true); const A = window.APP; });
  const taskId2 = await page.evaluate(() => (window.__tmGanttBars || []).find(b => b.taskId).taskId);
  await page.evaluate(tid => window.__tmGanttDrag(tid, 'move', 1), taskId2);
  await new Promise(r => setTimeout(r, 1500));
  check('R6 §GANTT_EDIT_PERSIST_SKIP reason=cache_disabled fires when _cacheDisabled is set', has(mark, /§GANTT_EDIT_PERSIST_SKIP what=drag reason=cache_disabled/), grab(mark, /§GANTT_EDIT_PERSIST_SKIP/));
  await page.evaluate(() => { window.APP && (window.APP._cacheDisabled = false); });

  console.log('§SUITE_SUMMARY pass=' + pass + ' fail=' + fail);
  await browser.close();
  server.kill();
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('§PROBE_FATAL ' + e.message); process.exit(1); });
