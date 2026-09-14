#!/usr/bin/env node
// WITNESS — W-S7-INJECT-PERSIST — viewer/schedule_inject.js's persist leg, in a REAL browser.
// Spec: bim-compiler prompts/TM_4D5D_VARIANCE_LANE.md §S7-INJECT-WHERE / §S7-INJECT-WITNESS.
//
// ISSUE THIS PROVES OR DISPROVES: §S7-INJECT-WHERE measured (Node, `db.export()` only) that
// persistDb's IndexedDB write is PREDICTED to ABORT over Chrome's ~127MiB single-value cap on
// Hospital (~260MB export) and JKR (~196MB) — but the actual browser IndexedDB write was, by the
// spec's own words, "the ONLY remaining unknown". This witness is that confirmation, and — MEASURED
// on this run's real Chromium (Chrome/147.x) — the prediction did NOT reproduce: Duplex, JKR AND
// Hospital all persisted=true (see the NOTE lines this file prints and the session report for the
// per-building numbers). What this witness actually asserts is the CONTRACT, not a guessed
// direction: whichever way persistDb resolves, §SCHED_INJECT_RESULT is logged (never silent), the
// UI message matches that exact boolean (never "saved" on an abort or vice-versa), and
// `windowForGuid` resolves a real construction window afterwards regardless — because the in-memory
// materialize already succeeded independently of whether the save survived. Getting THAT wrong —
// the message disagreeing with the boolean, or the panel depending on the save — would misreport or
// break the ONE thing §S7-INJECT says the persist outcome is allowed to change: the schedule's
// LIFETIME, never whether the feature works.
//
// POPULATION: Duplex_extracted.db (9.6MB, real building, schedules=0), JKR_extracted.db (~196MB)
// and Hospital_extracted.db (~252MB) — §S7-INJECT-WHERE's own three reference points either side of
// its predicted cap. All three are real fleet DBs per prompts/TM_4D5D_VARIANCE_LANE.md's TEST DATA
// section, none fabricated. (Whether any of them ACTUALLY aborts is an empirical fact about the
// Chromium build this runs against, not something this witness assumes going in.)
//
// THIS WITNESS NEEDS A REAL CHROMIUM (real IndexedDB — sql.js's Node build has none to test against,
// which is exactly why §S7-INJECT-WHERE could only measure export() and had to leave the real write
// as owed). If puppeteer/Chromium cannot launch here, this SKIPS loudly — never silently treated as
// a pass (same convention as witness_s7_gate.js Part B).
//
// Command: node viewer/tests/witness_s7_inject_persist.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

let pass = 0, fail = 0, skipped = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }
function skip(msg) { skipped++; console.log('  SKIP ' + msg); }

const BLD_DIR = process.env.BLD_DIR || path.join(os.homedir(), 'bim-ootb', 'buildings');
const REPO = path.join(__dirname, '..', '..');
const BLD_ROOT = path.dirname(BLD_DIR);

// ⚠ expectPersist is NOT asserted as a pass/fail criterion — see the long note where it is used
// below. It is kept only as the §S7-INJECT-WHERE PREDICTION, logged for contrast against what this
// witness actually measures, because the prediction and the measurement disagreeing is itself the
// finding this witness exists to surface (see this file's own report).
const ALL_CASES = [
  { label: 'Duplex_extracted.db (9.6MB, under ~127MiB cap)', file: 'Duplex_extracted.db', expectPersist: true },
  { label: 'JKR_extracted.db (~196MB, over ~127MiB cap)', file: 'JKR_extracted.db', expectPersist: false },
  { label: 'Hospital_extracted.db (~252MB, over ~127MiB cap)', file: 'Hospital_extracted.db', expectPersist: false }
];
// Optional dev/CI narrowing, e.g. `node witness_s7_inject_persist.js Duplex` — same convention as
// witness_gantt_native_generate.js's process.argv[2]. Omit for the full fleet (the real run this
// witness's PASS/FAIL claim is about).
const CASES = process.argv[2] ? ALL_CASES.filter(c => c.file.indexOf(process.argv[2]) === 0) : ALL_CASES;

async function main() {
  let puppeteer;
  try { puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer'); }
  catch (e) { try { puppeteer = require('puppeteer'); } catch (e2) { puppeteer = null; } }
  if (!puppeteer) {
    skip('ENTIRE WITNESS skipped — no puppeteer install found (checked project + ~/bim-compiler/node_modules). ' +
      'W-S7-INJECT-PERSIST needs a real browser IndexedDB — there is no honest Node-only substitute for this claim.');
    console.log('§WITNESS_S7_INJECT_PERSIST pass=' + pass + ' fail=' + fail + ' skipped=' + skipped);
    return;
  }
  const missing = CASES.filter(c => !fs.existsSync(path.join(BLD_DIR, c.file)));
  if (missing.length) {
    missing.forEach(c => skip(c.label + ' — file not present at ' + path.join(BLD_DIR, c.file)));
  }

  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.db': 'application/octet-stream' };
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    // Fleet DBs are not git-tracked (§HARD RULES worktree-only note) — serve /buildings/* from the
    // shared checkout's real fleet, everything else (the fixture + the real production JS under
    // test) from THIS worktree. Same split as witness_s7_gate.js's Part B server.
    const root = p.indexOf('/buildings/') === 0 ? BLD_ROOT : REPO;
    fs.readFile(path.join(root, p), (e, buf) => {
      if (e) { res.writeHead(404); res.end('404 ' + p); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const base = 'http://127.0.0.1:' + port;

  let browser;
  try { browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] }); }
  catch (e) {
    skip('ENTIRE WITNESS skipped — Chromium failed to launch (' + e.message + ')');
    server.close();
    console.log('§WITNESS_S7_INJECT_PERSIST pass=' + pass + ' fail=' + fail + ' skipped=' + skipped);
    return;
  }

  const results = [];
  try {
    for (const c of CASES) {
      if (missing.some(m => m.file === c.file)) continue;
      console.log('-- ' + c.label + ' --');
      const page = await browser.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push(String(e)));
      const logs = [];
      page.on('console', (m) => { const t = m.text(); logs.push(t); if (/§SCHED_INJECT|§AUTHOR_TPL|§TPL_MODEL/.test(t)) console.log('    [page] ' + t); });
      await page.goto(base + '/viewer/tests/fixtures/s7_inject_persist_fixture.html', { waitUntil: 'load', timeout: 60000 });

      const dbUrl = base + '/buildings/' + c.file;
      const tplUrl = base + '/viewer/rates/4D_template.json';
      const dbUrlForKey = '../buildings/' + c.file;   // realistic key shape, distinct from the http:// fetch url
      let out;
      try {
        out = await page.evaluate(
          (u, t, k) => window.__runInject(u, t, k),
          dbUrl, tplUrl, dbUrlForKey
        );
      } catch (e) {
        fail++; console.log('  FAIL ' + c.label + ' — page.evaluate threw: ' + (e && e.message));
        await page.close();
        continue;
      }
      console.log('  RESULT ' + JSON.stringify(out.res) + ' wallMs=' + out.wallMs.toFixed(0) +
        ' before=' + JSON.stringify(out.before) + ' after=' + JSON.stringify(out.after));
      console.log('  statusText="' + out.statusText + '"');

      assert(out.before.schedules === 0, c.label + ': verified schedules=0 BEFORE injection (real no-schedule building)');
      assert(!!(out.res && out.res.ok), c.label + ': injection materialized ok (res.ok=' + (out.res && out.res.ok) + ')');
      assert(out.after.schedules === 1 && out.after.tasks > 0, c.label + ': exactly one schedule with real tasks exists AFTER injection (schedules=' + out.after.schedules + ' tasks=' + out.after.tasks + ')');
      // ⚠ NOT asserted against c.expectPersist. §S7-INJECT-WHERE's ~127MiB-single-IDB-value-abort
      // prediction for JKR/Hospital was a Node-side extrapolation (only db.export() was ever timed —
      // its own text calls the real browser write "the ONLY remaining unknown"), not a measurement.
      // MEASURED HERE (real Chromium, this run): it does NOT reproduce — JKR (~196MB) and Hospital
      // (~252MB) both persisted=true. §S7-INJECT's own contract is "the persist outcome changes the
      // LIFETIME and the MESSAGE, never whether the feature works" — so what this witness asserts is
      // that INVARIANT (the boolean and the user-facing message agree with EACH OTHER), not a
      // pre-guessed direction. See the NOTE line below and this run's final report for the contrast.
      const isPersisted = !!(out.res && out.res.persisted);
      assert(!!(out.sample && out.sample.startDate && out.sample.finishDate),
        c.label + ': windowForGuid resolves a REAL construction window after injection regardless of persist outcome (sample=' + JSON.stringify(out.sample) + ')');
      const wantWord = isPersisted ? /saved/i : /kept for this session/i;
      assert(wantWord.test(out.statusText), c.label + ': UI status text (persisted=' + isPersisted + ') honestly matches the outcome ("' + out.statusText + '")');
      if (isPersisted !== c.expectPersist) {
        console.log('  NOTE ' + c.label + ': §S7-INJECT-WHERE PREDICTED persisted=' + c.expectPersist +
          ' (the ~127MiB single-IDB-value abort) — MEASURED persisted=' + isPersisted + ' in this real Chromium. ' +
          'Not a witness failure (the outcome is honestly reported either way) — a spec prediction this run disproves.');
      }
      const sawResultLog = logs.some(l => /§SCHED_INJECT_RESULT persisted=/.test(l));
      assert(sawResultLog, c.label + ': §SCHED_INJECT_RESULT was logged (never a silent abort)');
      assert(errs.length === 0, c.label + ': zero pageerrors (errs=' + errs.join(' | ') + ')');

      results.push({ label: c.label, out });
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log('§WITNESS_S7_INJECT_PERSIST pass=' + pass + ' fail=' + fail + ' skipped=' + skipped);
  results.forEach(r => console.log('  ' + r.label + ' -> persisted=' + r.out.res.persisted +
    ' materializeMs=' + (r.out.res.materializeMs || 0).toFixed(0) +
    ' persistMs=' + (r.out.res.persistMs != null ? r.out.res.persistMs.toFixed(0) : 'n/a') +
    ' wallMs=' + r.out.wallMs.toFixed(0)));
  const anyAborted = results.some(r => !r.out.res.persisted);
  if (fail) { console.error('FAIL — ' + fail + ' check(s) failed'); process.exitCode = 1; }
  else console.log('PASS — for every building tested, the persist outcome (saved vs kept-for-session) is reported honestly and consistently (boolean matches the UI message), and never blocks the in-memory feature. ' +
    (anyAborted ? 'At least one building DID hit the ~127MiB abort this run.' : 'NONE of the buildings tested aborted this run (see NOTE lines above — §S7-INJECT-WHERE\'s ~127MiB-abort prediction for JKR/Hospital was NOT reproduced in this real Chromium).') +
    (skipped ? ' (some cases SKIPPED — see SKIP lines above)' : ''));
}

main().catch((e) => { console.error('§WITNESS_S7_INJECT_PERSIST CRASHED ' + (e && e.stack || e)); process.exitCode = 2; });
