#!/usr/bin/env node
// probe_gantt_axis_fit.js — 4D_GANTT_TM_REFACTOR.md, the axis near-duplicate fix. Reads the REAL
// rendered axis (window.__tmGanttAxis) and the REAL rendered bars (window.__tmGanttBarsRaw), via a
// real browser click on the panel toggle, and checks whether any bar's true end exceeds the axis
// it's actually drawn/scaled against — the "data-correct, draw-wrong" failure mode: a bar's per-
// element times can be perfectly correct and still render squashed/pushed off-panel if the axis
// qualifying them is too short.
'use strict';
const { spawn } = require('child_process');
const puppeteer = require(process.env.PUPPETEER || 'puppeteer');
const PORT = process.env.PORT ? Number(process.env.PORT) : 8130;
const BLD = process.env.BLD || 'Terminal_extracted';
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`;
const D = 86400000;

async function main() {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', process.env.SERVE_ROOT || '/tmp/serve-after'], { stdio: 'ignore' });
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
  const clicked = await page.evaluate(() => {
    const btn = document.getElementById('tm-gantt');
    if (!btn) return false;
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return true;
  });
  const deadline2 = Date.now() + 30000;
  let bars = null, axis = null;
  while (Date.now() < deadline2) {
    bars = await page.evaluate(() => window.__tmGanttBarsRaw || null);
    axis = await page.evaluate(() => window.__tmGanttAxis || null);
    if (bars && bars.length && axis) break;
    await new Promise(r => setTimeout(r, 300));
  }
  await browser.close(); server.kill();
  if (!bars || !bars.length || !axis) {
    console.log('§GANTT_AXIS_FIT BLD=' + BLD + ' ERROR clicked=' + clicked + ' bars=' + (bars ? bars.length : null) + ' axis=' + JSON.stringify(axis));
    process.exit(2);
  }

  const axisSpanDays = (axis.axisEnd - axis.axisStart) / D;
  const trueSpanDays = (axis.projectEnd - axis.axisStart) / D;
  const overflow = bars.filter(b => b.endTs > axis.axisEnd + 1);   // +1ms float-compare slack
  const worstOverflowDays = overflow.length ? Math.max.apply(null, overflow.map(b => (b.endTs - axis.axisEnd) / D)) : 0;
  console.log('§GANTT_AXIS_FIT BLD=' + BLD + ' axisN=' + axis.n +
    ' axisSpanDays=' + axisSpanDays.toFixed(1) + ' trueSpanDays=' + trueSpanDays.toFixed(1) +
    ' qualifiedFraction=' + (trueSpanDays > 0 ? (axisSpanDays / trueSpanDays).toFixed(3) : '1') +
    ' bars=' + bars.length + ' overflowBars=' + overflow.length +
    ' worstOverflowDays=' + worstOverflowDays.toFixed(1) +
    ' overflowDetail=' + JSON.stringify(overflow.slice(0, 5).map(b => (b.taskId || b.storey + '|' + b.phase) +
      ' n=' + b.count + ' endTs=' + ((b.endTs - axis.axisStart) / D).toFixed(1) + 'd axisEnd=' + axisSpanDays.toFixed(1) + 'd')) +
    ' ' + (overflow.length === 0 ? 'PASS' : 'FAIL'));
  process.exit(overflow.length === 0 ? 0 : 1);
}
main().catch(e => { console.error('ERR ' + (e && e.stack || e)); process.exit(2); });
