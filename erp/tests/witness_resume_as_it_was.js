// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — Scope guard
// W-RESUME-AS-IT-WAS — bim-compiler prompts/TEAMWORK_FRAMEWORK.md §52.1 / §52.1a.
// ISSUE IT PROVES OR DISPROVES: "after a crash the ERP comes back exactly as it was — same window, same record, the
//   half-typed text in its field, marked unsaved, no dialog". Before §52.1a nothing buffered typing until a leave event
//   and nothing remembered the open record, so a crash lost the text (R6 MUTANT reproduces that state).
// Instrument: REAL Chromium (Playwright's build) spawned by this script and killed with SIGKILL (a crash, not a close);
//   the SAME profile directory reopened; the real erp/idempiere.html served from this tree on ONE fixed port (the
//   localStorage origin must be the same on reopen). GardenAdmin, Business Partner window 123, record 117.
//   R1a  type Description, wait 1 s, SIGKILL, reopen → same record, text back, Save lit, 0 new kernel ops
//   R1b  same with 6 s before the kill (separates "the browser had not written localStorage yet" from a resume defect)
//   R2   Save after resume → exactly +1 kernel op, the draft gone
//   R3   §LIMIT type, SIGKILL after 100 ms (inside the 400 ms pause) → measured, not judged
//   R4   CONTROL deliberate leave: type, "Close without saving", graceful browser close, reopen → nothing auto-applied;
//        deep-link the record → saved tip shown + Item 1 amber pip offered
//   R5   drift: the draft's snapshot says the record moved meanwhile → reopen applies nothing, reason=drift, pip offered
//   R6   MUTANT quiet buffer removed from the served crud_overlay.js (must prove it applied) → text lost on reopen
//   R7   0 pageerrors across every run
// Verdict INCONCLUSIVE when the edit form never mounted (nothing judged). READ the log, not the exit code:
//   node erp/tests/witness_resume_as_it_was.js > build-log 2>&1   (needs ~/bim-ootb/tests npm install for playwright)
'use strict';
const PW = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), net = require('net');

const ROOT = path.join(__dirname, '..'), SERVE = path.join(ROOT, '..');   // serve the repo root: the page loads ../common/*
const WIN = 123, REC = 117, COL = 'description';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.db': 'application/octet-stream',
  '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
let MUTANT = false, mutantHits = -1;
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  fs.readFile(path.join(SERVE, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    if (MUTANT && p === '/erp/crud_overlay.js') {
      let s = buf.toString('utf8'); const re = / _scheduleQuietBuffer\(\);/g; mutantHits = (s.match(re) || []).length;
      buf = Buffer.from(s.replace(re, ' /*MUTANT*/'));
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(buf);
  });
});
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let PORT = 0, pageErrors = [];
const BASE = () => 'http://localhost:' + PORT + '/erp/idempiere.html?seed=ad_seed.db&login=GardenAdmin';

async function launch(dir) {
  const port = await freePort(), exe = PW.chromium.executablePath();
  const proc = cp.spawn(exe, ['--headless=new', '--no-sandbox', '--remote-debugging-port=' + port, '--user-data-dir=' + dir, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
  let browser = null; for (let i = 0; i < 60 && !browser; i++) { try { browser = await PW.chromium.connectOverCDP('http://127.0.0.1:' + port); } catch (e) { await sleep(250); } }
  const ctx = browser.contexts()[0], page = ctx.pages()[0] || await ctx.newPage(), logs = [];
  page.on('console', m => logs.push(m.text())); page.on('pageerror', e => pageErrors.push(e.message));
  return { proc, browser, page, logs };
}
const kill = b => new Promise(res => { b.proc.on('exit', () => res()); try { process.kill(b.proc.pid, 'SIGKILL'); } catch (e) { res(); } });
async function closeGraceful(b) {   // CDP Browser.close: a normal quit (storage flushed), the opposite of SIGKILL
  try { const s = await b.browser.newBrowserCDPSession(); await s.send('Browser.close'); } catch (e) {}
  await new Promise(res => { if (b.proc.exitCode != null) return res(); b.proc.on('exit', () => res()); setTimeout(res, 8000); });
}
const field = () => '#idmp-inline-mount [data-col]';
async function formState(page) {
  return page.evaluate((col) => {
    const m = document.getElementById('idmp-inline-mount'), f = document.getElementById('idmp-form');
    const el = m ? Array.from(m.querySelectorAll('[data-col]')).find(x => x.getAttribute('data-col').toLowerCase() === col && /^(INPUT|TEXTAREA|SELECT)$/.test(x.tagName)) : null;
    const save = m ? m.querySelector('.ic-vb[data-v="save"]') : null;
    const c = window.__crud && window.__crud.formCtx ? window.__crud.formCtx() : null;
    return { mounted: !!(m && m.querySelector('.cfrow')), record: f ? f.getAttribute('data-ad-record') : null, table: c && c.table, verb: c && c.verb,
      value: el ? el.value : null, saveEnabled: !!(save && !save.disabled), pip: !!document.querySelector('#idmp-scrub .scrubdraft'),
      draft: localStorage.getItem('erpdraft:c_bpartner:' + (c ? c.id : '')),
      resumeKeys: Object.keys(localStorage).filter(k => k.indexOf('erpresume:') === 0).length };
  }, COL);
}
async function opCount(page) {
  return page.evaluate(() => new Promise(res => { try { window.__crud.withSidecar(function (db) {
    // ops that touch the record under test (the reopen's own login writes AD_Session rows — legacy MSession, not the user's work)
    try { const r = db.exec("SELECT COUNT(*) FROM kernel_ops WHERE lower(COALESCE(parameters,'')) LIKE '%c_bpartner%' AND COALESCE(parameters,'') LIKE '%117%'"); res(r.length ? r[0].values[0][0] : 0); } catch (e) { res(-1); } }); } catch (e) { res(-2); } }));
}
async function openRecord(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('#idmp-inline-mount .cfrow', { timeout: 30000 }).catch(() => {});
  await sleep(800);
}
async function typeDesc(page, text) {
  const sel = await page.evaluate((col) => { const el = Array.from(document.querySelectorAll('#idmp-inline-mount [data-col]')).find(x => x.getAttribute('data-col').toLowerCase() === col && /^(INPUT|TEXTAREA)$/.test(x.tagName));
    if (!el) return null; el.setAttribute('data-wra', '1'); return '[data-wra="1"]'; }, COL);
  if (!sel) return false;
  await page.click(sel); await page.keyboard.type(text, { delay: 20 }); return true;
}
// one crash arm: open record, type, wait waitMs, (doctor), SIGKILL, reopen WITHOUT a deep link, read the state.
async function crashArm(name, text, waitMs, doctor) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wra_' + name + '_'));
  const b = await launch(dir); await openRecord(b.page, BASE() + '&window=' + WIN + '&record=' + REC);
  const before = await formState(b.page);
  if (!before.mounted) { await kill(b); return { dir, mounted: false }; }
  const ops0 = await opCount(b.page);
  const typed = await typeDesc(b.page, text); await sleep(waitMs);
  if (doctor) await b.page.evaluate(doctor);
  const atKill = await formState(b.page);
  await kill(b);
  const b2 = await launch(dir); await openRecord(b2.page, BASE()); await sleep(1500);
  const after = await formState(b2.page), ops1 = await opCount(b2.page);
  const lines = b2.logs.filter(l => /§RESUME|§DRAFT-OFFER/.test(l));
  return { dir, b2, mounted: true, typed, before, atKill, after, ops0, ops1, lines, quietPuts: b.logs.filter(l => /§DRAFT-PUT .*quiet=1/.test(l)).length };
}

let pass = 0, fail = 0, judged = 0;
const ok = (id, cond, label, extra) => { judged++; console.log('§WRA ' + id + ' ' + (cond ? 'PASS' : 'FAIL') + ' ' + label + (extra ? ' — ' + extra : '')); cond ? pass++ : fail++; };
const note = r => JSON.stringify({ typed: r.typed, atKill: r.atKill && { value: r.atKill.value, draft: !!r.atKill.draft, resumeKeys: r.atKill.resumeKeys }, after: r.after && { record: r.after.record, value: r.after.value, save: r.after.saveEnabled, pip: r.after.pip }, ops: [r.ops0, r.ops1], lines: r.lines });
const done = async (r) => { if (r.b2) await kill(r.b2); fs.rmSync(r.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); };

(async () => {
  await new Promise(r => server.listen(0, r)); PORT = server.address().port;
  const head = (cp.spawnSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout || '').trim();
  console.log('§WRA_HEADER W-RESUME-AS-IT-WAS tree=' + path.resolve(ROOT, '..') + ' commit=' + head + ' chromium=' + PW.chromium.executablePath() + ' window=' + WIN + ' record=' + REC + ' col=' + COL);

  // R1a / R1b / R2
  const ONLY = process.env.ONLY || '';
  const r1a = await crashArm('r1a', 'resume-1s', 1000);
  if (!r1a.mounted) { console.log('§WRA_VERDICT INCONCLUSIVE judged=0 (the edit form never mounted on window ' + WIN + ' record ' + REC + ')'); server.close(); process.exit(2); }
  console.log('§WRA R1a detail ' + note(r1a));
  ok('R1a', r1a.after.record === String(REC) && r1a.after.value === 'resume-1s' && r1a.after.saveEnabled && r1a.ops1 === r1a.ops0,
    'kill 1 s after typing → same record, text back, Save lit, 0 new ops', note(r1a));
  await done(r1a);
  const r1b = await crashArm('r1b', 'resume-6s', 6000);
  console.log('§WRA R1b detail ' + note(r1b));
  ok('R1b', r1b.after.record === String(REC) && r1b.after.value === 'resume-6s' && r1b.after.saveEnabled && !r1b.after.pip && r1b.ops1 === r1b.ops0,
    'kill 6 s after typing → same record, text back, Save lit, no pip, 0 new ops', note(r1b));
  if (r1b.after.value === 'resume-6s') {
    const n0 = r1b.b2.logs.length;
    const clicked = await r1b.b2.page.evaluate(() => { const b = document.querySelector('#idmp-inline-mount .ic-vb[data-v="save"]'); if (b && !b.disabled) { b.click(); return true; } return false; }); await sleep(3000);
    console.log('§WRA R2 trace clicked=' + clicked + ' ' + JSON.stringify(r1b.b2.logs.slice(n0).filter(l => /§(CRUD|INPLACE|SAVE|DRAFT|GT|SIDE|KRN|OPLOG)/.test(l)).slice(0, 25)));
    const s2 = await formState(r1b.b2.page), ops2 = await opCount(r1b.b2.page);
    ok('R2', ops2 === r1b.ops1 + 1 && !s2.draft && !s2.saveEnabled, 'Save after resume → +1 kernel op, draft gone, form clean', JSON.stringify({ opsBefore: r1b.ops1, opsAfter: ops2, draft: s2.draft, save: s2.saveEnabled }));
  } else console.log('§WRA R2 VACUOUS (R1b did not resume, nothing to save)');
  await done(r1b);

  if (ONLY === 'r1') { console.log('§WRA_VERDICT INCONCLUSIVE diagnostic ONLY=r1 judged=' + judged + ' fails=' + fail); server.close(); process.exit(2); }
  // R3 §LIMIT
  const r3 = await crashArm('r3', 'resume-100ms', 100);
  console.log('§LIMIT R3 kill 100 ms after typing (inside the 400 ms pause): recovered=' + (r3.after.value === 'resume-100ms') + ' ' + note(r3));
  await done(r3);

  // R4 CONTROL — deliberate leave keeps Item 1
  { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wra_r4_'));
    const b = await launch(dir); await openRecord(b.page, BASE() + '&window=' + WIN + '&record=' + REC);
    await typeDesc(b.page, 'deliberate-leave'); await sleep(1500);
    await b.page.evaluate(() => { const x = document.querySelector('#idmp-wintabs .idmp-wintab.active .x'); if (x) x.click(); });
    await sleep(500);
    const gated = await b.page.evaluate(() => { const ov = document.getElementById('idmp-dirty-ov'); if (!ov) return false; const bt = Array.from(ov.querySelectorAll('button')).find(x => /without saving/i.test(x.textContent)); if (bt) bt.click(); return !!bt; });
    await sleep(800); await closeGraceful(b);
    const b2 = await launch(dir); await openRecord(b2.page, BASE()); await sleep(2500);
    const s0 = await formState(b2.page), resumeLines = b2.logs.filter(l => /§RESUME applied=1/.test(l));
    await openRecord(b2.page, BASE() + '&window=' + WIN + '&record=' + REC); await sleep(1000);
    const s1 = await formState(b2.page), offered = b2.logs.some(l => /§DRAFT-OFFER key=c_bpartner:117/.test(l));
    ok('R4', gated && !s0.mounted && resumeLines.length === 0 && s1.value !== 'deliberate-leave' && !s1.saveEnabled && offered,
      'CONTROL deliberate leave + clean quit → nothing auto-applied; the record opens on its saved tip with the opt-in pip',
      JSON.stringify({ gated, mountedAfterReopen: s0.mounted, resumeApplied: resumeLines.length, deepLinkValue: s1.value, save: s1.saveEnabled, pipOffered: offered, pipShown: s1.pip }));
    await kill(b2); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); }

  // R5 drift — the snapshot the draft was typed over no longer matches the record
  const r5 = await crashArm('r5', 'resume-drift', 6000, () => { const k = Object.keys(localStorage).find(x => x.indexOf('erpdraft:c_bpartner:') === 0); if (!k) return;
    const d = JSON.parse(localStorage.getItem(k)); const sk = Object.keys(d.tipSnapshot || {}).find(c => c.toLowerCase() === 'description'); if (sk) d.tipSnapshot[sk] = 'MOVED-UNDERNEATH'; else (d.tipSnapshot = d.tipSnapshot || {}).Description = 'MOVED-UNDERNEATH';
    window.__crud.durableStore().setItem(k, JSON.stringify(d)); });   // through the durable store: the mirror is what a crash restores
  console.log('§WRA R5 detail ' + note(r5));
  ok('R5', r5.after.value !== 'resume-drift' && !r5.after.saveEnabled && r5.lines.some(l => /§RESUME applied=0 .*reason=drift/.test(l)) && r5.lines.some(l => /§DRAFT-OFFER/.test(l)),
    'record moved since the draft → nothing applied, reason=drift, the opt-in pip offered instead', note(r5));
  await done(r5);

  // R6 MUTANT — no quiet buffer
  MUTANT = true; mutantHits = -1;
  const r6 = await crashArm('r6', 'resume-mutant', 6000);
  MUTANT = false;
  console.log('§WRA R6 detail mutantHits=' + mutantHits + ' quietPuts=' + r6.quietPuts + ' ' + note(r6));
  if (mutantHits !== 2 || r6.quietPuts !== 0) console.log('§WRA R6 VACUOUS mutant did not apply (hits=' + mutantHits + ' quietPuts=' + r6.quietPuts + ')');
  else ok('R6', r6.after.value !== 'resume-mutant', 'MUTANT quiet buffer removed → the typed text is lost (the instrument can see a loss)', note(r6));
  await done(r6);

  ok('R7', pageErrors.length === 0, '0 pageerrors across every run', pageErrors.slice(0, 3).join(' | '));
  console.log('§WRA_VERDICT ' + (fail === 0 ? 'PASS' : 'FAIL') + ' judged=' + judged + ' fails=' + fail);
  server.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); server.close(); process.exit(1); });
