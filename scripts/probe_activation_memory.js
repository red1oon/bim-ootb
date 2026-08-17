#!/usr/bin/env node
// probe_activation_memory.js (§S15/item2, bim-compiler prompts/4D_GANTT_TM_REFACTOR.md 🏁 RESUME) —
// fresh JS-heap measurement across Time Machine activation, replacing the stale pre-#1399 "+390MB"
// figure that predates S1/S4/S6/S9-S13's changes to this same path. Uses Puppeteer's own
// page.metrics() (Chrome DevTools Performance domain, JSHeapUsedSize) at three points: page-loaded
// baseline, immediately after `§TIME_MACHINE ON` fires, and after a settle window (catches any
// post-activation growth the seam's own async work still does). Numbers only, no eyeballing.
'use strict';
const { spawn } = require('child_process');
const puppeteer = require(process.env.PUPPETEER || 'puppeteer');
const PORT = 8126;
const BLD = process.env.BLD || 'Hospital_extracted';
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}.db`;
const MB = 1024 * 1024;

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

  const mBaseline = await page.metrics();
  console.log('§ACT_MEM_BASELINE BLD=' + BLD + ' JSHeapUsedMB=' + (mBaseline.JSHeapUsedSize / MB).toFixed(1) +
    ' JSHeapTotalMB=' + (mBaseline.JSHeapTotalSize / MB).toFixed(1));

  const _t0 = Date.now();
  await page.evaluate(() => window.toggleTimeMachine());
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    if (lines.some(l => l.indexOf('§TIME_MACHINE ON') >= 0)) break;
    await new Promise(r => setTimeout(r, 200));
  }
  const actMs = Date.now() - _t0;
  const mPostActivation = await page.metrics();
  console.log('§ACT_MEM_POST_ACTIVATION BLD=' + BLD + ' activationMs=' + actMs +
    ' JSHeapUsedMB=' + (mPostActivation.JSHeapUsedSize / MB).toFixed(1) +
    ' JSHeapTotalMB=' + (mPostActivation.JSHeapTotalSize / MB).toFixed(1) +
    ' deltaFromBaselineMB=' + ((mPostActivation.JSHeapUsedSize - mBaseline.JSHeapUsedSize) / MB).toFixed(1));

  // settle window — catches async post-activation growth (e.g. kernel_ops write loop tail,
  // §WRITE_LOOP_TIMING) the ON-event fires before.
  await new Promise(r => setTimeout(r, 20000));
  const mSettled = await page.metrics();
  console.log('§ACT_MEM_SETTLED BLD=' + BLD +
    ' JSHeapUsedMB=' + (mSettled.JSHeapUsedSize / MB).toFixed(1) +
    ' JSHeapTotalMB=' + (mSettled.JSHeapTotalSize / MB).toFixed(1) +
    ' deltaFromBaselineMB=' + ((mSettled.JSHeapUsedSize - mBaseline.JSHeapUsedSize) / MB).toFixed(1) +
    ' deltaFromPostActivationMB=' + ((mSettled.JSHeapUsedSize - mPostActivation.JSHeapUsedSize) / MB).toFixed(1));

  await browser.close(); server.kill(); process.exit(0);
}
main().catch(e => { console.error('ERR ' + (e && e.stack || e)); process.exit(2); });
