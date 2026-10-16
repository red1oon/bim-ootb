#!/usr/bin/env node
// viewer/tests/fixtures/progress_fixture.js — the subject under test for
// viewer/tests/witness_progress_flush.js. Spec: bim-compiler
// prompts/WITNESS_INTERFACE_FRAMEWORK.md §W_PROGRESS.
//
// ⚠ NOT A WITNESS. It asserts nothing. It exists to be KILLED: it reproduces, in miniature and in
// about two seconds, the exact shape that produced the 0-byte log — a real puppeteer browser, a real
// page, and ONE long `await page.evaluate(...)` that would otherwise print nothing until it returns.
// The witness runs it twice (progress ON and, as the red control, `W_PROGRESS=0`), SIGKILLs both,
// and reads the two logs.
//
// It deliberately loads `about:blank` and no building: the claim under test is about the HARNESS's
// ability to narrate a long wait, not about anything the viewer computes. Coupling it to a building
// load would make a fast, always-runnable check into a slow, flaky one and would test the wrong thing.
//
// Env: RUN_MS  how long the in-page loop runs before the fixture would exit on its own (default
//              120000 — long enough that the witness's kill always lands INSIDE the evaluate).
//      W_PROGRESS=0            red control: disables every progress write.
//      W_PROGRESS_BEAT_MS      heartbeat interval, so the witness can observe one in seconds.
//      BROWSER_PID_FILE        where to record chrome's pid, so the killer can reap it — see below.
//
// ⚠ WHY THE PID FILE EXISTS. Puppeteer spawns chrome `detached`, i.e. in its OWN process group, so
// SIGKILLing this process's group does NOT take chrome with it — measured here, 3 orphaned chrome
// trees left behind on the first run of the acceptance witness. The pid is written OUTSIDE the
// progress channel on purpose: the red-control arm runs with W_PROGRESS=0 and would otherwise leave
// an unreapable browser precisely because the reporting is off.
'use strict';
const fs = require('fs');
const path = require('path');
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const Progress = require(path.join(__dirname, '..', '..', '..', 'witness_kit', 'progress.js'));

const RUN_MS = +(process.env.RUN_MS || 120000);

process.on('unhandledRejection', (e) => { console.error('UNHANDLED: ' + ((e && e.stack) || e)); process.exit(1); });

(async () => {
  const pr = Progress('PROGRESS_FIXTURE');

  pr.stage('launch-browser');
  const b = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    protocolTimeout: 1800000,
  });

  const bp = b.process && b.process();
  if (process.env.BROWSER_PID_FILE && bp && bp.pid) {
    try { fs.writeFileSync(process.env.BROWSER_PID_FILE, String(bp.pid)); } catch (e) { /* reaper will report */ }
  }

  pr.stage('open-page');
  const p = await b.newPage();
  // The SAME hook every cinema/aim witness already installs, kept here so the fixture exercises the
  // real mechanism: product lines are collected, progress lines are forwarded and NOT collected.
  const logs = [];
  const { isProgress } = pr.attach(p);
  p.on('console', (m) => { const t = m.text(); if (!isProgress(t)) logs.push(t); });
  await p.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 60000 });

  pr.stage('long-evaluate');
  // ONE long evaluate — the shape that goes silent. The page narrates itself through console.log;
  // puppeteer delivers those events while this await is still pending, which is the whole claim.
  await p.evaluate(async (runMs, prefix) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const t0 = Date.now();
    let i = 0;
    // A product-shaped line too, so the witness can prove progress lines are separated from the
    // product §-log rather than polluting it.
    console.log('§FIXTURE_PRODUCT_LINE this is not progress');
    while (Date.now() - t0 < runMs) {
      i++;
      console.log(prefix + 'in-page-step-' + i);
      await sleep(1000);
    }
    return i;
  }, RUN_MS, Progress.pageLine(''));

  pr.stage('teardown');
  await p.close(); await b.close();
  pr.end(`productLines=${logs.length}`);
})();
