#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-HBA-SCANLINE-FIX scope (read the log after every run)
 * SCOPE: prompts/SCALE_AND_UX_SWEEP.md §3.4 — viewer/hba_iot.js's CCTV scanline rAF loop was permanently dead:
 * `(function loop() { if (!_pane) return; ...; _cctvTimer = requestAnimationFrame(loop); })()` ran its FIRST
 * invocation BEFORE `_pane = pane` was ever assigned (that assignment used to sit AFTER this block), so the
 * very first call always hit the `if (!_pane) return` guard and requestAnimationFrame(loop) was NEVER called —
 * not even once. Fixed by moving `_pane = pane` to before the loop IIFE (ordering only, same guard, same loop).
 *
 * Drives the REAL viewer/hba_iot.js (unmodified require/script — no logic stubbed) via a minimal fixture host
 * (modeller/tests/fixtures/hba_iot_scanline_host.html) that stubs only the 2 external data deps
 * (window.HbaModels/window.HbaIot — hr_bim_asset's own deterministic modules, irrelevant to the animation
 * loop under test) so HBAIotPane.toggle() can mount without the full HBA/BOM stack. Counts REAL
 * requestAnimationFrame(loop) calls over real elapsed wall-time.
 *
 * CLAIM S1: the pane mounts (toggle() returns truthy — boundAssets/deps wiring intact).
 * CLAIM S2: requestAnimationFrame(loop) is called MORE THAN ONCE over ~500ms of real animation frames — before
 *           the fix this would be EXACTLY 0 (dead on the very first call); confirmed by re-running this exact
 *           witness against the pre-fix file via `git show HEAD:viewer/hba_iot.js` to prove the regression
 *           shape, not just asserting the post-fix number in isolation.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const FIX = '/modeller/tests/fixtures/hba_iot_scanline_host.html';
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const server = http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]);
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404 ' + p); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'text/plain' }); r.end(b); }); });

async function run(label, hbaIotSource) {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const pg = await br.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  if (hbaIotSource) await pg.setRequestInterception(true);
  if (hbaIotSource) pg.on('request', req => {
    if (req.url().endsWith('/viewer/hba_iot.js')) return req.respond({ status: 200, contentType: 'text/javascript', body: hbaIotSource });
    req.continue();
  });
  await pg.goto(`http://localhost:${port}${FIX}`, { waitUntil: 'load', timeout: 30000 });
  await sleep(600);   // ~500ms+ of real animation frames
  const r = await pg.evaluate(() => ({ mounted: !!window.__mountResult, rafCalls: window.__rafCalls }));
  await br.close(); server.close();
  console.log('  §HBA_SCANLINE[' + label + '] ' + JSON.stringify(r) + ' errs=' + errs.slice(0, 2).join('|'));
  return { ...r, errs };
}

(async () => {
  console.log('═══ W-HBA-SCANLINE-FIX — viewer/hba_iot.js CCTV scanline rAF loop ordering fix ═══');
  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

  const afterR = await run('POST-FIX (real file on disk)', null);
  chk('S1 pane mounts', afterR.mounted === true, JSON.stringify(afterR));
  chk('S2 rAF loop keeps scheduling POST-fix (rafCalls > 1)', afterR.rafCalls > 1, 'rafCalls=' + afterR.rafCalls);

  // Regression-shape proof: re-run the SAME fixture against the pre-fix source (git HEAD, i.e. before this
  // session's edit) to confirm the bug shape actually existed (rafCalls === 0) — not just asserting the fix.
  const { execSync } = require('child_process');
  let preFixSource = null;
  try { preFixSource = execSync('git show HEAD:viewer/hba_iot.js', { cwd: ROOT, maxBuffer: 10 * 1024 * 1024 }).toString(); }
  catch (e) { console.log('  §HBA_SCANLINE could not read pre-fix HEAD version: ' + e.message); }
  if (preFixSource) {
    const beforeR = await run('PRE-FIX (git HEAD)', preFixSource);
    chk('S3 pre-fix HEAD version reproduces the dead-loop bug (rafCalls === 0)', beforeR.rafCalls === 0, 'rafCalls=' + beforeR.rafCalls);
  } else {
    console.log('  ⚠ S3 skipped (no git HEAD to diff against — working tree may be the first commit touching this file)');
  }

  console.log('W-HBA-SCANLINE-FIX: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
