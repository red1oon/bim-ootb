#!/usr/bin/env node
// probe_gantt_drag_outliers.js — Implementing bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S7
// step 1 (measure, don't assume): drive the REAL commitGanttDrag path headless (window.__tmGanttDrag
// test hook) on a large-outlier task and read §RETIME_OUTLIER_AUDIT — how many of the task's ops sat
// outside its OLD drawn window (M2 Tukey outliers) and what duration _retimeSpan hands them back.
// A move (+5d) and a resizeR (-30%) are both committed, each on a fresh page load so the second
// gesture never operates on the first one's already-retimed ops. Read the log after every run.
'use strict';
const { spawn } = require('child_process');
const puppeteer = require(process.env.PUPPETEER || 'puppeteer');
const PORT = 8126;
const BLD = process.env.BLD || 'Terminal_extracted';
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`;

async function gesture(browser, label, pick, drag) {
  const page = await browser.newPage();
  const lines = [];
  page.on('console', m => { const t = m.text(); if (t.indexOf('§') >= 0) lines.push(t); });
  page.on('pageerror', e => console.log('[pageerror] ' + String(e).slice(0, 300)));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof window.toggleTimeMachine === 'function', { timeout: 180000 });
  await page.waitForFunction(() => window.APP && window.APP.db, { timeout: 240000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 15000));
  await page.evaluate(() => window.toggleTimeMachine());
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    if (lines.some(l => l.indexOf('§TIME_MACHINE ON') >= 0)) break;
    await new Promise(r => setTimeout(r, 200));
  }
  // open the Gantt drawer — _ganttTasks is computed by drawGanttMini, which only runs visible
  await page.evaluate(() => {
    const btn = document.getElementById('tm-gantt');
    if (btn) btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 4000));
  const diag = await page.evaluate(() => ({
    tm: typeof window.toggleTimeMachine, bars: typeof window.__tmGanttWindows,
    drag: typeof window.__tmGanttDrag, zone: typeof window.__tmZoneProbe,
    loadFail: (window.__loadFails || null) }));
  console.log('DIAG ' + JSON.stringify(diag));
  lines.filter(l => /LOAD_FAIL/.test(l)).forEach(l => console.log('[loadfail] ' + l));
  const bars = await page.evaluate(() => window.__tmGanttWindows ? window.__tmGanttWindows() : null);
  if (!bars) { console.log('ERR __tmGanttBars missing'); await page.close(); return; }
  const bar = pick(bars);
  if (!bar) {
    console.log('ERR no matching bar — bars dump follows (' + bars.length + ')');
    bars.slice(0, 40).forEach(b => console.log('  BAR taskId=' + b.taskId + ' phase=' + b.phase +
      ' storey=' + b.storey + ' n=' + b.n));
    await page.close(); return;
  }
  console.log('GESTURE ' + label + ' task=' + bar.taskId + ' n=' + bar.n +
    ' window=[' + new Date(bar.startTs).toISOString().slice(0, 10) + '..' +
    new Date(bar.endTs).toISOString().slice(0, 10) + ']');
  const before = lines.length;
  const okDrag = await page.evaluate((tid, mode, dd) => window.__tmGanttDrag(tid, mode, dd),
    bar.taskId, drag.mode, drag.deltaDays(bar));
  await new Promise(r => setTimeout(r, 2000));
  console.log('DRAG ok=' + okDrag + ' mode=' + drag.mode);
  lines.slice(before).filter(l => /§(GANTT_RETIME|RETIME_OUTLIER_AUDIT|GANTT_DRAG)/.test(l))
    .forEach(l => console.log('[drag] ' + l));
  await page.close();
}

async function main() {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory',
    process.env.SERVE_ROOT || '/tmp/s7-serve'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500));
  const browser = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  // the S2/S6 lane's named large-outlier population: biggest Superstructure task
  const pickBig = bars => bars.filter(b => b.taskId && /Superstructure/.test(b.taskId))
    .sort((a, b) => b.n - a.n)[0];
  await gesture(browser, 'MOVE+5d', pickBig, { mode: 'move', deltaDays: () => 5 });
  await gesture(browser, 'RESIZE-30pct', pickBig, {
    mode: 'resizeR',
    deltaDays: bar => -Math.max(1, Math.round(0.3 * (bar.endTs - bar.startTs) / 86400000)) });
  await browser.close(); server.kill(); process.exit(0);
}
main().catch(e => { console.error('ERR ' + (e && e.stack || e)); process.exit(2); });
