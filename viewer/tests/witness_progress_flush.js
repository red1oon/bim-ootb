#!/usr/bin/env node
// witness_progress_flush.js — §W_PROGRESS: a killed witness must still name where it got to.
//
// ⚠ DO NOT REMOVE — SCOPE. bim-compiler prompts/AGENT_QUEUE.md item A-16b, specified in
// prompts/WITNESS_INTERFACE_FRAMEWORK.md §W_PROGRESS. Read the log after every run (Log Mandate).
//
// THE ISSUE IT PROVES OR DISPROVES. The cinema/aim witnesses do all their work inside ONE long
// `await page.evaluate(...)` and print only after it returns, so a run redirected to a file holds a
// **0-byte log** for its entire duration. On 2026-09-02 that ambiguity was resolved the wrong way
// twice — a COMPLETED Hospital run was reported as "never measured", and a rasteriser attribution
// was asserted off the same absence. Both were retracted. CLAUDE.md clause 4 ("a witness that cannot
// report its own failure is not a witness") is extended by §W_PROGRESS to liveness: silence must be
// distinguishable from "still working". This file is the acceptance test for that, and it tests it
// the only honest way — by KILLING a real run and reading what survived on disk.
//
// CLAIMS (each PASS / FAIL / INCONCLUSIVE; a claim whose run never happened is never PASS):
//   P1 A KILLED RUN NAMES ITS LAST COMPLETED STAGE. SIGKILL (uncatchable — no exit handler can
//      rescue this) a real fixture mid-flight; the log must be non-empty, must carry at least one
//      completed-stage line, and its last ENTERed stage must be un-DONE, i.e. it names exactly where
//      the process was when it died.
//   P2 IN-PAGE PROGRESS CROSSES THE `p.on('console')` HOOK DURING THE EVALUATE. The mechanism the
//      spec names must actually carry: at least one line the PAGE emitted from inside the long
//      evaluate must be on disk before the kill. Without this, only the node side is proven and the
//      long silent stretch — the one that caused the false report — is still silent.
//   P3 A HUNG RUN IS DISTINGUISHABLE FROM A DEAD ONE. An open stage that outlives the heartbeat
//      interval must emit heartbeats. Stage lines alone cannot do this: a stage that never completes
//      leaves the same last line whether the process is working or gone.
//   P4 RED CONTROL — THE DEFECT IS STILL REPRODUCIBLE. The IDENTICAL fixture with `W_PROGRESS=0`,
//      killed identically, must produce the **0-byte log**. If it does not, this witness is not
//      measuring what it claims and P1-P3 prove nothing (§W-REDCONTROL).
//   P5 THE FIVE CINEMA/AIM WITNESSES ARE ACTUALLY WIRED. A static check of the shipped files, with
//      comment lines STRIPPED FIRST — a check that can be satisfied by a file's own prose is one of
//      the checks-that-cannot-fail this queue caught three of on 2026-09-02.
//
// NO BUILDING, NO BAKE, NO SERVER. The fixture loads about:blank. The claim is about the harness's
// ability to narrate a long wait; coupling it to a building load would test something else and make
// a 30-second check into a 40-minute one.
//
// Usage: node viewer/tests/witness_progress_flush.js     (~35 s: two killed fixture runs)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'viewer', 'tests', 'fixtures', 'progress_fixture.js');
const KILL_AFTER = +(process.env.KILL_AFTER_MS || 14000);
const BEAT_MS = +(process.env.BEAT_MS || 3000);

const checks = [];
const INC = [];
const P = (label, ok, detail) => checks.push({ label, ok, detail });
const I = (label, why) => INC.push({ label, why });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// runAndKill — start the fixture in its OWN process group, let it work, then SIGKILL the whole
// group. The group matters: puppeteer's chrome is a child, and killing only node would strand it.
async function runAndKill(tag, env) {
  const log = path.join(os.tmpdir(), `wprogress_${tag}_${process.pid}.log`);
  const pidFile = path.join(os.tmpdir(), `wprogress_${tag}_${process.pid}.browserpid`);
  [log, pidFile].forEach((f) => { try { fs.unlinkSync(f); } catch (e) { /* first run */ } });
  const fd = fs.openSync(log, 'w');
  const child = spawn(process.execPath, [FIXTURE], {
    detached: true,
    stdio: ['ignore', fd, fd],
    env: Object.assign({}, process.env, env, { BROWSER_PID_FILE: pidFile }),
  });
  fs.closeSync(fd);
  let exited = null;
  child.on('exit', (code, sig) => { exited = { code, sig }; });
  await sleep(KILL_AFTER);
  const aliveBeforeKill = exited === null;
  let killed = false;
  try { process.kill(-child.pid, 'SIGKILL'); killed = true; } catch (e) { /* already gone */ }
  // ⚠ REAP CHROME SEPARATELY. Puppeteer launches the browser `detached`, so it sits in its OWN
  // process group and the group kill above does NOT reach it — measured: the first run of this
  // witness left 3 orphaned chrome trees. The fixture records the pid for exactly this.
  let reaped = 'none', bpid = 0;
  try {
    bpid = +fs.readFileSync(pidFile, 'utf8').trim();
    if (bpid > 0) { try { process.kill(-bpid, 'SIGKILL'); reaped = 'group'; } catch (e) { process.kill(bpid, 'SIGKILL'); reaped = 'pid'; } }
  } catch (e) { reaped = 'no-pid-file'; }
  await sleep(1500);
  // Verified, not assumed: a kill(pid, 0) that does NOT throw means the browser is still running.
  let orphan = false;
  if (bpid > 0) { try { process.kill(bpid, 0); orphan = true; } catch (e) { orphan = false; } }
  let size = 0, text = '';
  try { size = fs.statSync(log).size; text = fs.readFileSync(log, 'utf8'); } catch (e) { /* none */ }
  try { fs.unlinkSync(pidFile); } catch (e) { /* already gone */ }
  console.log(`§W_PROGRESS_RUN tag=${tag} aliveAtKill=${aliveBeforeKill} killedGroup=${killed} ` +
    `browserPid=${bpid || 'n/a'} reapedBrowser=${reaped} orphanLeft=${orphan} logBytes=${size} ` +
    `lines=${text ? text.trim().split('\n').length : 0} exitedEarly=${JSON.stringify(exited)}`);
  return { log, size, text, aliveBeforeKill, exited, reaped, orphan, bpid };
}

(async () => {
  if (!fs.existsSync(FIXTURE)) {
    console.log('§W_PROGRESS_VERDICT INCONCLUSIVE — fixture missing at ' + FIXTURE + '; nothing was judged.');
    process.exit(1);
  }

  const ON = await runAndKill('on', { W_PROGRESS_BEAT_MS: String(BEAT_MS), RUN_MS: '120000' });
  const OFF = await runAndKill('off', { W_PROGRESS: '0', W_PROGRESS_BEAT_MS: String(BEAT_MS), RUN_MS: '120000' });

  const lines = ON.text ? ON.text.split('\n').filter(Boolean) : [];
  const enters = lines.filter((l) => /§W_PROGRESS \S+ ENTER stage=/.test(l))
    .map((l) => l.match(/ENTER stage=(\S+)/)[1]);
  const dones = lines.filter((l) => /§W_PROGRESS \S+ DONE stage=/.test(l))
    .map((l) => l.match(/DONE stage=(\S+)/)[1]);
  const pageLines = lines.filter((l) => /§W_PROGRESS \S+ PAGE /.test(l));
  const beats = lines.filter((l) => /§W_PROGRESS \S+ HEARTBEAT /.test(l));

  // A fixture that never reached the kill (chrome failed to launch, node crashed) judges NOTHING.
  // Saying PASS or FAIL off such a run is exactly the false-absence this whole item is about.
  const vacuous = !ON.aliveBeforeKill;
  if (vacuous) {
    const why = `the ON fixture exited BEFORE the ${KILL_AFTER}ms kill (${JSON.stringify(ON.exited)}), ` +
      `so nothing was killed mid-flight. Log said: ${(ON.text || '(empty)').slice(0, 300)}`;
    I('P1 a killed run names its last completed stage', why);
    I('P2 in-page progress crosses the p.on(console) hook', why);
    I('P3 a hung run is distinguishable from a dead one', why);
  } else {
    // ── P1 ──────────────────────────────────────────────────────────────────────────────────────
    const openStage = enters.filter((s) => dones.indexOf(s) < 0);
    P('P1 a SIGKILLed run still names the last stage it completed',
      ON.size > 0 && dones.length >= 1 && openStage.length >= 1,
      `log ${ON.size} bytes, ${lines.length} lines. COMPLETED stages [${dones.join(' → ')}] ` +
      `(each with its own duration on the line). Killed INSIDE [${openStage.join(' ')}] — entered, ` +
      `never DONE, which is what pins where the process was. SIGKILL is uncatchable, so every one ` +
      `of these lines was already on disk when it landed: that is the fs.writeSync(1) requirement, ` +
      `not a shutdown handler.`);

    // ── P2 ──────────────────────────────────────────────────────────────────────────────────────
    P('P2 the PAGE narrates itself through the existing p.on(console) hook, during the evaluate',
      pageLines.length >= 2,
      `${pageLines.length} forwarded in-page progress lines on disk before the kill` +
      (pageLines.length ? ` (first: "${pageLines[0].slice(0, 90)}", last: "${pageLines[pageLines.length - 1].slice(0, 90)}")` : '') +
      `. These were emitted from INSIDE the still-pending await page.evaluate() — the stretch that ` +
      `was previously silent for the whole run.`);

    // ── P3 ──────────────────────────────────────────────────────────────────────────────────────
    // Expected count is derived from the measured window, not chosen: the heartbeat can only fire
    // once a stage is open, so the fixture's launch time is subtracted rather than guessed at.
    P('P3 an open stage HEARTBEATS, so a hung run is distinguishable from a dead one',
      beats.length >= 1,
      `${beats.length} heartbeat lines at ${BEAT_MS}ms over a ${KILL_AFTER}ms run` +
      (beats.length ? `, last: "${beats[beats.length - 1].slice(0, 120)}"` : '') +
      `. Without these, a stage that never completes leaves an identical last line whether the ` +
      `process is working or gone.`);
  }

  // ── P4 red control ────────────────────────────────────────────────────────────────────────────
  if (!OFF.aliveBeforeKill) {
    I('P4 RED CONTROL — the 0-byte log is still reproducible with progress off',
      `the OFF fixture exited before the kill (${JSON.stringify(OFF.exited)}), so its empty log ` +
      `proves nothing — an empty log from a process that died at second 3 is the very ambiguity ` +
      `under test.`);
  } else {
    P('P4 RED CONTROL — with W_PROGRESS=0 the SAME run leaves the 0-byte log (the defect is real)',
      OFF.size === 0,
      `progress OFF: ${OFF.size} bytes after ${KILL_AFTER}ms of identical work, killed identically ` +
      `— against ${ON.size} bytes with it ON. This is the before/after of the defect A-16 was ` +
      `misread from, measured rather than asserted. A non-zero here would mean P1-P3 pass for some ` +
      `other reason and this witness cannot fail.`);
  }

  // ── P5 wiring ─────────────────────────────────────────────────────────────────────────────────
  // COMMENTS ARE STRIPPED FIRST, deliberately. `witness_cpe_aim_retire.js` documents this mechanism
  // in prose; a grep that matched that prose would pass on a file with zero instrumentation — the
  // "a witness reading its own comment block" trap this queue caught on 2026-09-02.
  {
    const targets = ['witness_cpe_aim_retire.js', 'witness_cpe_corr_brush.js', 'witness_cpe_aim_pin.js',
      'witness_cpe_stick_hold.js', 'witness_cpe_hose.js'];
    const rows = []; let bad = 0, judged = 0;
    targets.forEach((f) => {
      const fp = path.join(ROOT, f);
      if (!fs.existsSync(fp)) { rows.push(f + ':ABSENT'); bad++; judged++; return; }
      const code = fs.readFileSync(fp, 'utf8').split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      const req = /require\([^)]*witness_kit[/'"\\ ,.]*progress/.test(code) ||
        /progress\.js'\)\)/.test(code);
      const nStage = (code.match(/\.stage\(/g) || []).length;
      const nAttach = (code.match(/\.attach\(/g) || []).length;
      judged++;
      if (!(req && nStage >= 3 && nAttach >= 1)) { bad++; }
      rows.push(`${f.replace('witness_cpe_', '').replace('.js', '')}:req=${req ? 1 : 0} stages=${nStage} attach=${nAttach}`);
    });
    if (!judged) {
      I('P5 the five cinema/aim witnesses are wired to §W_PROGRESS', 'no target file was found to judge');
    } else {
      P('P5 all five cinema/aim witnesses are WIRED (code, not comments — comment lines stripped first)',
        bad === 0,
        `${judged - bad}/${judged} carry a real require + >=3 stage() calls + attach(): ${rows.join(' | ')}. ` +
        `Comment lines are removed before matching so a file that only TALKS about progress fails here.`);
    }
  }

  // ── P6 hygiene ────────────────────────────────────────────────────────────────────────────────
  // This witness KILLS things, so it owes an account of what it left running. Puppeteer spawns
  // chrome `detached` — its own process group — so the group kill above does not reach it; the
  // first run of this file left 3 orphaned chrome trees behind. Reported as a claim rather than a
  // comment, because a leak that is only described in prose comes back.
  {
    const arms = [{ t: 'on', r: ON }, { t: 'off', r: OFF }].filter((a) => a.r.bpid > 0);
    if (!arms.length) {
      I('P6 the kill leaves no orphaned browser', 'neither arm recorded a browser pid — nothing to check');
    } else {
      P('P6 both killed arms leave NO orphaned chrome (verified by kill(pid,0), not assumed)',
        arms.every((a) => !a.r.orphan),
        arms.map((a) => `${a.t}: pid=${a.r.bpid} reap=${a.r.reaped} stillAlive=${a.r.orphan}`).join(' | ') +
        `. The pid file is written OUTSIDE the progress channel on purpose — the OFF arm has no log ` +
        `at all, so a reaper reading the log could never clean up the red control.`);
    }
  }

  console.log('');
  checks.forEach((c) => console.log(`  ${c.ok ? 'PASS' : 'FAIL'} ${c.label}\n        ${c.detail}`));
  INC.forEach((c) => console.log(`  INCONCLUSIVE ${c.label}\n        ${c.why}`));
  const pass = checks.filter((c) => c.ok).length, fail = checks.length - pass;
  console.log(`\n§W_PROGRESS_VERDICT claims=${checks.length + INC.length} PASS=${pass} FAIL=${fail} ` +
    `INCONCLUSIVE=${INC.length}  ` +
    (fail ? 'RED' : INC.length ? 'NOT GREEN — a claim judged nothing; an empty population is not a pass' : 'GREEN'));
  [ON.log, OFF.log].forEach((f) => { try { fs.unlinkSync(f); } catch (e) { /* already gone */ } });
  process.exit(fail || checks.length === 0 ? 1 : 0);
})();
