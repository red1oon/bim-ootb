#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-FROM-SCRATCH (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.38; owner F-27: "From-scratch witness, then guide").
// Read the log after every run: exit code is not evidence. Verdict line: §FROM_SCRATCH … verdict=PASS|FAIL|INCONCLUSIVE.
// ISSUE THIS PROVES OR DISPROVES: "a newcomer who downloads the project (GitHub's Download ZIP) and follows Developer Guide §3 gets the three apps
//   and Code Facts running" — or, step by step, exactly where they get stuck. Every problem is a §FROM_SCRATCH_GAP line, never hidden.
// HOW: S1 prerequisites · S2 `git archive origin/main` (= the ZIP: tracked files only, no .git, LFS files as pointers) into an empty temp folder ·
//   S3 `python3 -m http.server` there (Guide §3 step 3) · S4 the three pages headless (Playwright's Chromium already on this machine): HTTP failures,
//   console errors, outside hosts, the first words a newcomer sees · S5 `node scripts/setup.js` in the download (§F.39: deps, the 3 dev tools, Code Facts packed + installed into a THROWAWAY
//   --extensions-dir (never the owner's VS Code profile). No second clone (one clone per repo). No screenshot is evidence here: text and numbers only.
// Verdict: PASS = every step RAN (gaps are reported, they are the guide's to-do list) · INCONCLUSIVE = a step could not run on this machine.
// Command: node scripts/tests/witness_from_scratch.js [--keep]   (~2 min; --keep leaves the temp folder for a look)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), net = require('net');
const ROOT = path.join(__dirname, '..', '..'), P = require(path.join(ROOT, 'witness_kit', 'paths.js')), say = s => process.stdout.write(s + '\n');
const gaps = [], ran = {}, gap = (step, what) => { gaps.push({ step, what }); say(`  §FROM_SCRATCH_GAP step=${step} what=${JSON.stringify(what)}`); };
const sh = (cmd, args, o) => { const r = cp.spawnSync(cmd, args, Object.assign({ encoding: 'utf8', maxBuffer: 1 << 28 }, o)); return { ok: r.status === 0, out: ((r.stdout || '') + (r.stderr || '')).trim(), status: r.status, err: r.error }; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w-from-scratch-')), DL = path.join(tmp, 'bim-ootb-main');

(async () => {
  // S1 prerequisites
  const pre = {};
  for (const [k, c, a] of [['node', 'node', ['--version']], ['python3', 'python3', ['--version']], ['git', 'git', ['--version']], ['code', 'code', ['--version']]]) { const r = sh(c, a); pre[k] = r.ok ? r.out.split('\n')[0] : null; if (!r.ok) gap('S1', k + ' not found on PATH'); }
  let pw = null; try { pw = require(P.nodeModule('playwright')); } catch (e) { gap('S1', 'no Playwright/Chromium on this machine (the S4 page checks need one)'); }
  say(`  §FROM_SCRATCH_S1 node=${pre.node} python3=${pre.python3} git=${pre.git} code=${pre.code} chromium=${pw ? 'Y' : 'N'}`); ran.S1 = true;

  // S2 the download
  fs.mkdirSync(DL);
  const ar = cp.spawnSync('bash', ['-c', `git -C "${ROOT}" archive --format=tar origin/main | tar -x -C "${DL}"`], { encoding: 'utf8' });
  if (ar.status !== 0) { gap('S2', 'git archive failed: ' + (ar.stderr || '').slice(0, 160)); }
  else {
    let files = 0, bytes = 0, lfs = [];
    (function walk(d) { for (const n of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, n.name); if (n.isDirectory()) walk(p); else { files++; const st = fs.statSync(p); bytes += st.size; if (st.size < 400) { const head = fs.readFileSync(p, 'utf8').slice(0, 40); if (head.startsWith('version https://git-lfs')) lfs.push(path.relative(DL, p)); } } } })(DL);
    say(`  §FROM_SCRATCH_S2 files=${files} mb=${(bytes / 1048576).toFixed(0)} lfs_pointer_files=${lfs.length}${lfs.length ? ' e.g. ' + lfs.slice(0, 4).join(',') : ''}`);
    if (lfs.length) gap('S2', `${lfs.length} files are Git LFS pointers in the download, not data (e.g. ${lfs.slice(0, 3).join(', ')}); the guide must say where the real files come from`);
    const blds = fs.existsSync(path.join(DL, 'buildings')) ? fs.readdirSync(path.join(DL, 'buildings')).filter(f => /\.db$/.test(f)).length : 0;
    say(`  §FROM_SCRATCH_S2_DATA buildings_db_files_in_download=${blds}`);
    ran.S2 = true;
  }

  // S3 serve
  const port = await new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  const srv = cp.spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: DL, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
  const up = await fetchStatus(`http://127.0.0.1:${port}/`);
  say(`  §FROM_SCRATCH_S3 serve=python3 -m http.server port=${port} root_status=${up}`); if (up !== 200) gap('S3', 'the folder does not serve (status ' + up + ')'); else ran.S3 = true;

  // S4 the three pages
  if (pw && ran.S3) {
    const browser = await pw.chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--disable-gpu'] });
    for (const page of ['viewer/viewer.html', 'erp/idempiere.html', 'modeller/modeller.html']) {
      const ctx = await browser.newContext(), pg = await ctx.newPage(), bad = [], errs = [], hosts = new Set();
      pg.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().replace(`http://127.0.0.1:${port}/`, '')); });
      pg.on('requestfailed', r => { const u = r.url(); if (!/^data:|^blob:/.test(u)) bad.push('failed ' + u.replace(`http://127.0.0.1:${port}/`, '')); });
      pg.on('request', r => { try { const h = new URL(r.url()).host; if (h && !/^127\.0\.0\.1/.test(h)) hosts.add(h); } catch (e) { /* data: */ } });
      pg.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
      pg.on('pageerror', e => errs.push('pageerror ' + String(e.message).slice(0, 140)));
      let status = 0;
      try { const r = await pg.goto(`http://127.0.0.1:${port}/${page}`, { waitUntil: 'load', timeout: 60000 }); status = r ? r.status() : 0; } catch (e) { errs.push('goto ' + e.message.slice(0, 100)); }
      await pg.waitForTimeout(8000);
      const seen = await pg.evaluate(() => (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').trim().slice(0, 160)).catch(() => '');
      const title = await pg.title().catch(() => '');
      say(`  §FROM_SCRATCH_S4 page=${page} status=${status} http_fail=${bad.length} console_errors=${errs.length} outside_hosts=[${[...hosts].join(',')}] title=${JSON.stringify(title)} first_words=${JSON.stringify(seen)}`);
      [...new Set(bad)].slice(0, 6).forEach(b => say(`    §FROM_SCRATCH_S4_FAIL page=${page} ${b}`));
      [...new Set(errs)].slice(0, 6).forEach(b => say(`    §FROM_SCRATCH_S4_ERR page=${page} ${JSON.stringify(b)}`));
      if (status !== 200) gap('S4', page + ' did not load (status ' + status + ')');
      if (bad.length) gap('S4', `${page}: ${bad.length} request(s) failed, e.g. ${[...new Set(bad)].slice(0, 2).join(' ; ')}`);
      if (errs.length) gap('S4', `${page}: ${errs.length} console error(s), e.g. ${JSON.stringify(errs[0])}`);
      await ctx.close();
    }
    await browser.close(); ran.S4 = true;
  }
  srv.kill();

  // S5 the setup script from the download (§F.39): deps, the three dev tools, Code Facts packed + installed into a throwaway folder (no --install: the owner's profile is not touched)
  if (ran.S2) {
    if (!fs.existsSync(path.join(DL, 'scripts', 'setup.js'))) gap('S5', 'scripts/setup.js is not in the download');
    else {
      const su = sh('node', ['scripts/setup.js'], { cwd: DL, timeout: 600000 }), vs = (/§SETUP_VSC .*/.exec(su.out) || [''])[0], fin = (/§SETUP steps=.*/.exec(su.out) || [''])[0];
      say(`  §FROM_SCRATCH_S5_SETUP exit=${su.status} ${fin}`); say(`  ${vs}`);
      (su.out.match(/§SETUP_GAP .*/g) || []).forEach(g => say('    ' + g));
      if (!/verdict=PASS/.test(fin)) gap('S5', 'node scripts/setup.js did not end PASS: ' + (fin || su.out.slice(-160)));
      else if (!pre.code) gap('S5', 'VS Code (`code`) is not on this machine: Code Facts install not exercised'); else ran.S5 = true;
    }
  }

  const steps = ['S1', 'S2', 'S3', 'S4', 'S5'], done = steps.filter(s => ran[s]).length;
  const verdict = done === steps.length ? 'PASS' : 'INCONCLUSIVE';
  say(`§FROM_SCRATCH steps_ran=${done}/${steps.length} gaps=${gaps.length} by_step=${steps.map(s => s + ':' + gaps.filter(g => g.step === s).length).join(',')} verdict=${verdict}`);
  if (!process.argv.includes('--keep')) fs.rmSync(tmp, { recursive: true, force: true }); else say('  kept ' + tmp);
  process.exit(verdict === 'PASS' ? 0 : 1);
})().catch(e => { say('§FROM_SCRATCH verdict=INCONCLUSIVE error=' + JSON.stringify(e.message)); process.exit(1); });

function fetchStatus(u) { return new Promise(res => { require('http').get(u, r => { r.resume(); res(r.statusCode); }).on('error', () => res(0)); }); }
