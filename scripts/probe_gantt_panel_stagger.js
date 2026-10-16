#!/usr/bin/env node
// probe_gantt_panel_stagger.js — 4D_GANTT_TM_REFACTOR.md stage 2 acceptance. Measures the ACTUAL
// rendered Gantt panel (window.__tmGanttBarsRaw, populated by drawGanttMini() from the real
// _ganttTasks array) via a real browser click on the panel toggle button — NOT a SQL query against
// the `tasks` table. That SQL-proxy gap is exactly what let 22 prior stages ship green while the
// panel itself stayed broken.
'use strict';
const { spawn } = require('child_process');
const puppeteer = require(process.env.PUPPETEER || 'puppeteer');
const PORT = process.env.PORT ? Number(process.env.PORT) : 8127;
const BLD = process.env.BLD || 'Terminal_extracted';
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`;
const D = 86400000;

async function main() {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', process.env.SERVE_ROOT || '/tmp/cpm-serve'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500));
  const browser = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  const lines = [];
  page.on('console', m => { const t = m.text(); if (t.indexOf('§') >= 0) lines.push(t); });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof window.toggleTimeMachine === 'function', { timeout: 180000 });
  await page.waitForFunction(() => window.APP && window.APP.db, { timeout: 240000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 15000));
  await page.evaluate(() => window.toggleTimeMachine());
  const deadline1 = Date.now() + 300000;
  while (Date.now() < deadline1) {
    if (lines.some(l => l.indexOf('§TIME_MACHINE ON') >= 0)) break;
    await new Promise(r => setTimeout(r, 200));
  }

  // Real click on the Gantt panel toggle — this is what actually triggers drawGanttMini(), the
  // ONLY thing that populates window.__tmGanttBarsRaw. A synthetic internal call would not prove
  // the real UI path executed.
  const clicked = await page.evaluate(() => {
    const btn = document.getElementById('tm-gantt');
    if (!btn) return false;
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return true;
  });
  console.log('§GANTT_PANEL_CLICK BLD=' + BLD + ' ok=' + clicked);
  const deadline2 = Date.now() + 30000;
  let bars = null;
  while (Date.now() < deadline2) {
    bars = await page.evaluate(() => window.__tmGanttBarsRaw || null);
    if (bars && bars.length) break;
    await new Promise(r => setTimeout(r, 300));
  }
  await browser.close(); server.kill();
  if (!bars || !bars.length) {
    console.log('§GANTT_PANEL_STAGGER BLD=' + BLD + ' ERROR no __tmGanttBarsRaw populated');
    process.exit(2);
  }

  const t0 = Math.min.apply(null, bars.map(b => b.startTs));
  const total = Math.max.apply(null, bars.map(b => b.endTs)) - t0;
  const items = bars.map(b => ({ storey: b.storey, phase: b.phase, taskId: b.taskId,
    s: (b.startTs - t0) / D, e: (b.endTs - t0) / D, n: b.count }));
  items.forEach(t => console.log('BAR ' + (t.taskId || (t.storey + '|' + t.phase)) +
    ' s=' + t.s.toFixed(1) + ' e=' + t.e.toFixed(1) + ' n=' + t.n));

  const totalDays = total / D;
  // The exact reported symptom: "one pile, full project length" — a bar whose OWN span covers most
  // of the whole project, for a group with real element mass (n>=20 — the old cliff's own threshold,
  // reused here only as "not a single-element edge case", not as a new rule).
  const FULL_LENGTH_FRAC = 0.8;
  const fullLength = items.filter(t => t.n >= 20 && (t.e - t.s) >= FULL_LENGTH_FRAC * totalDays);
  const sameStartDay = {};
  items.forEach(t => { const d = Math.round(t.s); (sameStartDay[d] = sameStartDay[d] || []).push(t); });
  const maxCluster = Math.max.apply(null, Object.values(sameStartDay).map(a => a.length));
  const thinBig = items.filter(t => t.n >= 1000 && (t.e - t.s) < 2);

  console.log('§GANTT_PANEL_STAGGER BLD=' + BLD + ' bars=' + items.length +
    ' totalDays=' + totalDays.toFixed(1) +
    ' fullLengthBars=' + fullLength.length + '/' + items.length +
    ' fullLengthDetail=' + JSON.stringify(fullLength.slice(0, 5).map(t => (t.taskId || t.storey + '|' + t.phase) + ' n=' + t.n + ' span=' + (t.e - t.s).toFixed(1) + 'd')) +
    ' maxSameStartCluster=' + maxCluster +
    ' thinBigBars=' + thinBig.length);
  process.exit(0);
}
main().catch(e => { console.error('ERR ' + (e && e.stack || e)); process.exit(2); });
