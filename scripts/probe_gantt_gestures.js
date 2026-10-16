#!/usr/bin/env node
// PROBE (§S73) — drive the Gantt's CANVAS GESTURES in a real browser and verify each one reaches its
// engine verb. Same contract as probe_gantt_drag_outliers.js: reports by §-log. Unlike that one it
// DOES gate — exit 1 on a failed gesture — because these four paths have no node witness and have
// produced three defects between them (§S67 missing resync, §S69 missing bake-lock, §S72 the 1970
// dates). Source wiring is gated separately and cheaply by witness_gantt_gesture_wiring.js; this is
// the half that only a real pointer can prove.
//
// Gestures driven: marquee multi-select → en-bloc group move · dblclick → typed properties → Apply ·
// unlink · link (drag bar→bar). Every one is read back from its own § line, never from a screenshot.
//
//   SERVE_ROOT must be the REPO ROOT, not viewer/ — the page loads ../erp/bigdecimal.js and
//   ../erp/ad_seed.db. Serving viewer/ alone produces 5 spurious "RoundingMode" TypeErrors and two
//   §*_ERR 404s that look like product defects and are not (§S72).
'use strict';
const { spawn } = require('child_process');
const puppeteer = require(process.env.PUPPETEER || 'puppeteer');
const PORT = Number(process.env.PORT || 8145);
const ROOT = process.env.SERVE_ROOT || '/tmp/cpm-serve';
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
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
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
  check('G1 gantt drawer open and editing enabled',
    lines.some(l => /§GANTT_EDIT_LOCK editable=true/.test(l)) && (await page.evaluate(() => Array.isArray(window.__tmGanttBars) && window.__tmGanttBars.filter(b => b.taskId).length)) > 1,
    'bars=' + (await page.evaluate(() => (window.__tmGanttBars || []).filter(b => b.taskId).length)));

  // ── E5 marquee multi-select: drag over empty canvas spanning several rows ───────────────────────
  let mark = lines.length;
  const marq = await page.evaluate(() => {
    const rects = (window.__tmGanttBars || []).filter(b => b.taskId);
    const c = document.getElementById('tm-gantt-canvas'), r = c.getBoundingClientRect();
    const rows = rects.slice(0, 4);
    // Start in EMPTY canvas (left of the leftmost bar in the band), sweep right/down across the rows.
    const x0 = Math.max(2, Math.min.apply(null, rows.map(b => b.x)) - 6);
    const y0 = rows[0].y - 2, x1 = Math.max.apply(null, rows.map(b => b.x + b.w)) + 4;
    const y1 = rows[rows.length - 1].y + rows[rows.length - 1].h + 2;
    const ev = (ty, x, y) => c.dispatchEvent(new PointerEvent(ty, { bubbles: true, clientX: r.left + x, clientY: r.top + y, pointerId: 1, isPrimary: true, button: 0, buttons: 1 }));
    ev('pointerdown', x0, y0); ev('pointermove', (x0 + x1) / 2, (y0 + y1) / 2); ev('pointermove', x1, y1); ev('pointerup', x1, y1);
    return { rows: rows.length, box: [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)] };
  });
  await new Promise(r => setTimeout(r, 2500));
  const selLine = grab(mark, /§GANTT_GROUP_SELECT/);
  const selCount = Number((selLine.match(/count=(\d+)/) || [0, 0])[1]);
  check('G2 marquee selects multiple bars', selCount >= 2,
    'swept ' + JSON.stringify(marq.box) + ' over ' + marq.rows + ' rows → ' + (selLine || '(no §GANTT_GROUP_SELECT)'));

  // ── E5b en-bloc move: drag one SELECTED bar; the whole selection travels ────────────────────────
  mark = lines.length;
  const gdrag = await page.evaluate(sel => {
    const rects = (window.__tmGanttBars || []).filter(b => b.taskId).slice(0, sel);
    const c = document.getElementById('tm-gantt-canvas'), r = c.getBoundingClientRect();
    const t = rects[0];
    const ev = (ty, x, y) => c.dispatchEvent(new PointerEvent(ty, { bubbles: true, clientX: r.left + x, clientY: r.top + y, pointerId: 1, isPrimary: true, button: 0, buttons: 1 }));
    ev('pointerdown', t.midX, t.midY);
    for (let dx = 10; dx <= 90; dx += 20) ev('pointermove', t.midX + dx, t.midY);
    ev('pointerup', t.midX + 90, t.midY);
    return 'dragged ' + t.taskId + ' +90px';
  }, selCount);
  await new Promise(r => setTimeout(r, 5000));
  const gsLine = grab(mark, /§GANTT_GROUP_SHIFT|§SE_SHIFT_TASKS|§GANTT_EDIT_MOVE/);
  check('G3 en-bloc move commits through the group verb',
    has(mark, /§GANTT_GROUP_SHIFT/), gdrag + ' → ' + (gsLine || '(no group-shift § line)'));
  check('G3b the en-bloc move persists', has(mark, /§GANTT_EDIT_PERSIST what=groupShift/),
    grab(mark, /§GANTT_EDIT_PERSIST/) || '(no persist line)');

  // ── E7 typed properties: dblclick → panel → Apply ───────────────────────────────────────────────
  mark = lines.length;
  const panel = await page.evaluate(() => {
    const rects = (window.__tmGanttBars || []).filter(b => b.taskId);
    const c = document.getElementById('tm-gantt-canvas'), r = c.getBoundingClientRect(), t = rects[0];
    c.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: r.left + t.midX, clientY: r.top + t.midY, detail: 2 }));
    return t.taskId;
  });
  await new Promise(r => setTimeout(r, 3000));
  const shown = await page.evaluate(() => { const s = document.getElementById('tmp-s'); return s ? s.value : null; });
  check('G4 dblclick opens the typed panel', has(mark, /§GANTT_PROPS_OPEN/), panel + ' start=' + shown);
  // §S72: the panel must show the task's REAL calendar date, not the TM's near-1970 playback clock.
  const real = await page.evaluate(t => {
    const q = window.APP.db.exec('SELECT schedule_start FROM tasks WHERE task_id=?', [t]);
    return q.length && q[0].values.length ? q[0].values[0][0] : null;
  }, panel);
  check('G4b the panel shows the REAL date (§S72 regression)', shown === real,
    'panel=' + shown + ' tasks.schedule_start=' + real);

  mark = lines.length;
  const applied = await page.evaluate(() => {
    const s = document.getElementById('tmp-s'); if (!s) return 'NO_INPUT';
    const d = new Date(Date.parse(s.value + 'T00:00:00Z') + 4 * 86400000).toISOString().slice(0, 10);
    s.value = d; document.getElementById('tmp-apply').click(); return d;
  });
  await new Promise(r => setTimeout(r, 5000));
  check('G5 Apply commits the typed date', has(mark, /§GANTT_PROPS_APPLY/), 'typed ' + applied + ' → ' + grab(mark, /§GANTT_PROPS_APPLY/));
  check('G5b the typed date is written verbatim, no epoch drift',
    new RegExp('§GANTT_PROPS_APPLY[^\\n]*start=' + applied).test(grab(mark, /§GANTT_PROPS_APPLY/)),
    grab(mark, /§GANTT_EDIT_MOVE|§GANTT_EDIT_RESIZE/));

  // ── E4 unlink ───────────────────────────────────────────────────────────────────────────────────
  mark = lines.length;
  const unl = await page.evaluate(() => { const b = document.querySelector('#tm-gantt-props [data-unlink]'); if (!b) return 'NO_BUTTON'; b.click(); return 'clicked'; });
  await new Promise(r => setTimeout(r, 4000));
  check('G6 unlink removes a dependency', has(mark, /§GANTT_EDIT_UNLINK/), unl + ' → ' + grab(mark, /§GANTT_EDIT_UNLINK/));

  // ── E3 link: drag bar → bar with ≥14px vertical travel ──────────────────────────────────────────
  // Clear the marquee selection FIRST. This is documented precedence, not a workaround: a pointerdown
  // on a bar that is part of a multi-selection starts a GROUP DRAG (time_machine.js ~:6581), so the
  // link gesture is deliberately shadowed while a selection is live. A near-zero marquee on empty
  // canvas is the "click away" that dissolves it (§GANTT_GROUP_SELECT count=0).
  mark = lines.length;
  await page.evaluate(() => {
    const c = document.getElementById('tm-gantt-canvas'), r = c.getBoundingClientRect();
    const ev = (ty, x, y) => c.dispatchEvent(new PointerEvent(ty, { bubbles: true, clientX: r.left + x, clientY: r.top + y, pointerId: 1, isPrimary: true, button: 0, buttons: 1 }));
    ev('pointerdown', 2, 2); ev('pointerup', 2, 2);
  });
  await new Promise(r => setTimeout(r, 2000));
  check('G6b clicking empty canvas clears the selection (so link is reachable again)',
    has(mark, /§GANTT_GROUP_SELECT count=0/), grab(mark, /§GANTT_GROUP_SELECT/) || '(no clear line)');

  mark = lines.length;
  const lnk = await page.evaluate(() => {
    const rects = (window.__tmGanttBars || []).filter(b => b.taskId);
    const c = document.getElementById('tm-gantt-canvas'), r = c.getBoundingClientRect();
    const a = rects[0], z = rects.find(x => Math.abs(x.midY - a.midY) >= 20) || rects[1];
    const ev = (ty, x, y) => c.dispatchEvent(new PointerEvent(ty, { bubbles: true, clientX: r.left + x, clientY: r.top + y, pointerId: 1, isPrimary: true, button: 0, buttons: 1 }));
    ev('pointerdown', a.midX, a.midY); ev('pointermove', a.midX + 2, a.midY + 8); ev('pointermove', z.midX, z.midY); ev('pointerup', z.midX, z.midY);
    return a.taskId + ' → ' + z.taskId;
  });
  await new Promise(r => setTimeout(r, 4000));
  check('G7 link creates a dependency (or refuses on a cycle, loudly)',
    has(mark, /§GANTT_EDIT_LINK|§GANTT_EDIT_CYCLE_BLOCKED/), lnk + ' → ' + grab(mark, /§GANTT_EDIT_LINK|§GANTT_EDIT_CYCLE_BLOCKED/));

  check('G8 no JS error across every gesture', errs.length === 0, errs.length ? errs[0] : '(0 page errors)');
  console.log('§GANTT_GESTURES_SUMMARY pass=' + pass + ' fail=' + fail);
  await browser.close(); server.kill();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR ' + (e && e.stack || e)); process.exit(2); });
