#!/usr/bin/env node
// witness_cpe_buildup_arm_gate.js — W-ARM-GATE
// Implementing bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_BUILDUP_ARM_GATE
//
// THE ISSUE THIS WITNESS PROVES OR DISPROVES:
//   The Alt+C rehearsal armed its buildup onto a timeline that was not loaded yet — `_ops` held one
//   stale BUILDING_OPEN kernel op and the epoch was still 0/0 — so every frame asked for the SAME
//   cursor and the building never built (user's Hospital run: `§CPE_PREVIEW_BUILDUP armed ops=1
//   placed=0`, then 497 frames of `§PERF_TRAVERSE span=0h`).
//   A witness that only asserts "the arm resolved true" would PASS on the broken build — the arm DID
//   resolve true. So the assertion here is the NUMBER the film actually consumes: the cursor
//   `projectStart + u*(projectEnd-projectStart)` at u=0, 0.5, 1 must be three DIFFERENT values.
//
// HOW IT FALSIFIES: the same harness runs twice — once against the shipped `origin/main` source
// (must FAIL G-ARM-1) and once against the working tree (must PASS all). A run where both sources
// pass is not evidence; it means the RED case stopped reproducing and the witness is blind.
//
// Virtual clock: setInterval/setTimeout inside the sandbox are driven by this file, so the 60x500ms
// poll costs no wall-clock time and the "timeline lands 2.4s later" ordering is exact, not a race.
//
// Run (from the repo root):  node witness_cpe_buildup_arm_gate.js
// Read the log, not the exit code.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');

const TM = path.join(__dirname, 'viewer', 'time_machine.js');
const workingSrc = fs.readFileSync(TM, 'utf8');
const shippedSrc = cp.execFileSync('git', ['show', 'origin/main:viewer/time_machine.js'],
  { cwd: __dirname, maxBuffer: 1 << 28 }).toString();

// ── slice a top-level assignment/declaration out of the module by brace matching ───────────────
function slice(src, marker, optional) {
  const idx = src.indexOf(marker);
  if (idx < 0) {
    if (optional) return '';
    throw new Error('marker not found: ' + marker);
  }
  let depth = 0, seen = false, i = idx;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; seen = true; }
    else if (src[i] === '}') { depth--; if (seen && depth === 0) break; }
  }
  return src.slice(idx, i + 1) + ';';
}

// ── one sandboxed Time Machine, with only the module state these two verbs touch ───────────────
// `loadAfterTicks` reproduces the real ordering: activate() kicks an async load and the 63,415-op
// timeline (with its real epoch) only lands some polls later.
function makeTM(src, opts) {
  const logs = [];
  const timers = [];           // virtual clock: {id, fn, everyTicks, nextAt, cleared}
  let now = 0, nextId = 1;
  const ctx = {
    _ops: opts.opsAtArm.slice(),
    _active: opts.activeAtArm,
    _projectStart: opts.startAtArm,
    _projectEnd: opts.endAtArm,
    activateCalls: 0,
    console: {
      log: (m) => logs.push(String(m)),
      warn: (m) => logs.push(String(m)),
    },
    setInterval: (fn, ms) => {
      const t = { id: nextId++, fn, every: ms, next: now + ms, cleared: false };
      timers.push(t); return t.id;
    },
    clearInterval: (id) => { const t = timers.find(t => t.id === id); if (t) t.cleared = true; },
    // tmFollowTimeline's collaborators — stubbed to the shape the real ones return.
    A: () => ({ dbQuery: () => opts.geomGuids.map(g => [g]) }),
  };
  ctx.window = ctx;            // the module assigns onto `window`; bare reads hit the same object
  ctx.window.tmScheduleSource = () => ({ source: 'timeline', leafTasks: 35, capOps: 0,
                                         capActive: false, covered: 0, total: ctx._ops.length, pct: 0 });
  ctx.activate = function () {
    ctx.activateCalls++;
    if (opts.loadAfterMs != null) ctx._loadAt = now + opts.loadAfterMs;
  };
  vm.createContext(ctx);
  vm.runInContext([
    slice(src, 'function _bakeTimelineReady()', true),
    slice(src, 'window.tmActivateForBake = function'),
    slice(src, 'window.tmFollowTimeline = function'),
  ].join('\n'), ctx);

  // Drive the virtual clock. `await null` between steps lets the Promise continuation run.
  async function run(maxMs) {
    while (now <= maxMs) {
      if (ctx._loadAt != null && now >= ctx._loadAt) {
        ctx._ops = opts.opsAfterLoad.slice();
        ctx._projectStart = opts.startAfterLoad;
        ctx._projectEnd = opts.endAfterLoad;
        ctx._active = true;
        ctx._loadAt = null;
      }
      const due = timers.filter(t => !t.cleared && t.next <= now);
      for (const t of due) { t.next = now + t.every; t.fn(); }
      for (let k = 0; k < 20; k++) await null;     // flush microtasks (promise resolutions)
      if (ctx._armDone) break;
      now += 100;
    }
  }
  return { ctx, logs, run, armAt: () => ctx._armedAtMs };
}

// The film's own per-frame cursor expression (cinema_path_editor.js `_previewFly` fallback):
//   bkMs = projectStart + u * (projectEnd - projectStart)
function cursorSeries(bk) {
  if (!bk) return null;
  return [0, 0.5, 1].map(u => bk.projectStart + u * (bk.projectEnd - bk.projectStart));
}

const HOSPITAL_OPEN_OP = { output_guid: null, input_guids: [], start_ts: 0, end_ts: 0 };
function realOps(n, guids) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ output_guid: guids[i % guids.length], input_guids: [],
               start_ts: 1.7e12 + i * 86400000, end_ts: 1.7e12 + (i + 1) * 86400000 });
  }
  return out;
}

// ── the three gates ────────────────────────────────────────────────────────────────────────────
async function gate(src, label) {
  const out = { label, lines: [] };
  const say = (s) => { out.lines.push(s); console.log(s); };

  // G-ARM-1 — the user's exact state: ONE stale BUILDING_OPEN op, epoch 0/0, real timeline lands later.
  {
    const guids = ['g1', 'g2', 'g3'];
    const tm = makeTM(src, {
      opsAtArm: [HOSPITAL_OPEN_OP], activeAtArm: false, startAtArm: 0, endAtArm: 0,
      loadAfterMs: 2400,
      opsAfterLoad: realOps(12, guids), startAfterLoad: 1.7e12 - 1, endAfterLoad: 1.7e12 + 12 * 86400000,
      geomGuids: guids,
    });
    let armed = null;
    tm.ctx.window.tmActivateForBake().then(ok => { armed = ok; tm.ctx._armDone = true; tm.ctx._armedAtMs = null; });
    await tm.run(40000);
    const bk = armed ? tm.ctx.window.tmFollowTimeline() : null;
    const cur = cursorSeries(bk);
    const moves = !!cur && new Set(cur).size === 3;
    out.g1 = moves;
    say('§ARM_GATE G-ARM-1 ' + label + ' armed=' + armed +
        ' bk=' + (bk ? 'ops=' + bk.ops + ' placed=' + bk.placed + ' span=' + (bk.projectEnd - bk.projectStart) + 'ms' : 'null') +
        ' cursor@u[0,.5,1]=' + (cur ? cur.map(v => Math.round(v)).join(',') : 'n/a') +
        ' → ' + (moves ? 'ADVANCES (PASS)' : 'FROZEN — the film cannot build (FAIL)'));
  }

  // G-ARM-2 — a real, loaded timeline must still arm and still be followed (no false rejection).
  {
    const guids = ['g1', 'g2', 'g3'];
    const tm = makeTM(src, {
      opsAtArm: realOps(9, guids), activeAtArm: true,
      startAtArm: 1.7e12 - 1, endAtArm: 1.7e12 + 9 * 86400000,
      loadAfterMs: null, opsAfterLoad: [], startAfterLoad: 0, endAfterLoad: 0, geomGuids: guids,
    });
    let armed = null;
    tm.ctx.window.tmActivateForBake().then(ok => { armed = ok; tm.ctx._armDone = true; });
    await tm.run(5000);
    const bk = armed ? tm.ctx.window.tmFollowTimeline() : null;
    const cur = cursorSeries(bk);
    const ok = armed === true && !!cur && new Set(cur).size === 3;
    out.g2 = ok;
    say('§ARM_GATE G-ARM-2 ' + label + ' armed=' + armed +
        ' bk=' + (bk ? 'ops=' + bk.ops + ' placed=' + bk.placed : 'null') +
        ' cursor=' + (cur ? cur.map(v => Math.round(v)).join(',') : 'n/a') +
        ' → ' + (ok ? 'usable timeline NOT rejected (PASS)' : 'REGRESSION: a real timeline was refused (FAIL)'));
  }

  // G-ARM-3 — ops that never map to geometry: nothing can appear, so the arm must refuse, not pretend.
  {
    const tm = makeTM(src, {
      opsAtArm: realOps(5, ['ghost1', 'ghost2']), activeAtArm: true,
      startAtArm: 1.7e12 - 1, endAtArm: 1.7e12 + 5 * 86400000,
      loadAfterMs: null, opsAfterLoad: [], startAfterLoad: 0, endAfterLoad: 0,
      geomGuids: ['someone-else'],           // no op guid is present in element_transforms
    });
    tm.ctx._armDone = true;
    await tm.run(0);
    const bk = tm.ctx.window.tmFollowTimeline();
    const ok = bk === null;
    out.g3 = ok;
    say('§ARM_GATE G-ARM-3 ' + label + ' bk=' + (bk ? 'placed=' + bk.placed + ' (returned anyway)' : 'null') +
        ' → ' + (ok ? 'refused, nothing to reveal (PASS)' : 'armed with placed=0 (FAIL)'));
  }
  return out;
}

(async function () {
  console.log('§ARM_GATE W-ARM-GATE — §CPE_BUILDUP_ARM_GATE, two sources, one harness\n');
  const shipped = await gate(shippedSrc, 'SHIPPED(origin/main)');
  console.log('');
  const fixed = await gate(workingSrc, 'FIXED(working-tree)');

  console.log('\n§ARM_GATE_RESULT red=' + (shipped.g1 === false ? 'G-ARM-1 FAILS on origin/main (the bug reproduces)'
    : 'G-ARM-1 PASSES on origin/main — WITNESS IS BLIND, the RED case no longer reproduces'));
  const green = fixed.g1 && fixed.g2 && fixed.g3;
  console.log('§ARM_GATE_RESULT green=' + (green ? 'all gates pass on the fix' : 'FIX INCOMPLETE') +
    ' (G-ARM-1=' + fixed.g1 + ' G-ARM-2=' + fixed.g2 + ' G-ARM-3=' + fixed.g3 + ')');
  const verdict = (shipped.g1 === false) && green;
  console.log('§ARM_GATE_VERDICT ' + (verdict ? 'GREEN — falsifiable and fixed' : 'RED — see gates above'));
  process.exit(verdict ? 0 : 1);
})();
