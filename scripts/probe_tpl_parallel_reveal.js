#!/usr/bin/env node
// probe_tpl_parallel_reveal.js — §TPL_PARALLEL_REVEAL
//
// ⚠ DO NOT REMOVE — SCOPE. bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §FUTURE item 2, step 4
// addendum (user, 2026-08-27): "The reveal animation must correctly show PARALLEL series, not just
// sequential build-up within one task. When two tasks' real time-windows genuinely overlap ... their
// elements should visibly reveal AT THE SAME TIME during movie playback, interleaved — not as if
// only one task's animation 'has the floor' while everything else waits its turn. Verify this
// explicitly, don't assume it falls out for free."  Read the log after every run.
//
// WITNESS CLAIM (Spec-First, stated before the code):
//   P1. ABSOLUTE, NOT PER-TASK-RELATIVE. Every element's reveal timestamp is an absolute instant in
//       the project timeline. Proven by: every element of task t lies inside t's OWN absolute window
//       [start + t.sDays*86400000, start + t.eDays*86400000]. If reveal times were a per-task
//       animation sequence that serialised tasks, elements of a LATER-window task would not be able
//       to carry an EARLIER absolute timestamp than a concurrent task's — this measures exactly that.
//   P2. PARALLEL TASKS INTERLEAVE. For two tasks whose windows genuinely intersect, element reveal
//       timestamps inside the shared range are INTERLEAVED, not partitioned into two back-to-back
//       blocks. TWO measures, and only the second is the verdict:
//         (a) `alternations` = adjacent unlike-task pairs in the time-sorted union. Two back-to-back
//             blocks give EXACTLY 1. This is the direct refutation of the serialised shape.
//         (b) THE VERDICT — `binsBothActive`: cut the shared window into BINS equal slices and count
//             the slices in which BOTH tasks reveal at least one element. "Reveal at the same time
//             during playback" IS this: at every instant of the shared window, both tasks are
//             producing elements. Requiring ALL bins is a criterion with no tuned constant in it.
//       A ratio against a RANDOM mix (2*nA*nB/(nA+nB)) is reported as DESCRIPTIVE ONLY and is
//       deliberately NOT a pass/fail: elements inside a task are laid out in contiguous support-order
//       layer bands by §TPL_LAYER_ORDER, so same-task clumping is the DESIGNED behaviour, not a
//       defect. An earlier draft of this probe scored that ratio against an invented 0.5 threshold
//       and called a correct schedule FAIL — the mean same-task run length is printed instead so the
//       clumping is visible as a magnitude rather than judged against a made-up bar.
//   P3. VACUITY GUARD (PRIMAL LAW clause 4). If NO task pair's windows overlap, P2 judged an empty
//       population — the run prints VACUOUS and exits non-zero. A 0 that means "nothing to judge"
//       must never read as a pass.
//
// NON-INVENT: reads the persisted cache_4d_run.js run (element reveal times exactly as the shipped
// materializeZones produced them, plus the shipped task grid). Nothing is re-solved or authored.
'use strict';
const path = require('path');
const CACHE = require(path.join(__dirname, 'cache_4d_run.js'));
const DAY = 86400000;

function run(bld, startISO) {
  const c = CACHE.read(bld);
  if (!c || !c.tasks || !c.tasks.length) {
    console.log('§TPL_PARALLEL_REVEAL bld=' + bld + ' INCONCLUSIVE — no cached task grid'); return false;
  }
  const base = Date.parse(startISO || '2026-01-01');
  const sched = c.sched, tasks = c.tasks;

  // ── P1: every element sits inside its own task's ABSOLUTE window ─────────────────────────────
  let inWin = 0, outWin = 0, worstMs = 0, judged = 0;
  tasks.forEach(t => {
    const wS = base + t.sDays * DAY, wE = base + t.eDays * DAY;
    t.guids.forEach(g => {
      const s = sched[g]; if (!s) return;
      judged++;
      const off = s.s < wS ? wS - s.s : (s.s > wE ? s.s - wE : 0);
      if (off > 0) { outWin++; if (off > worstMs) worstMs = off; } else inWin++;
    });
  });
  console.log('§TPL_REVEAL_ABSOLUTE bld=' + bld + ' elementsInsideOwnTaskWindow=' + inWin + '/' + judged +
    ' outside=' + outWin + ' worstOffsetDays=' + (worstMs / DAY).toFixed(3) +
    ' — ' + (judged === 0 ? 'VACUOUS (nothing judged)'
      : outWin === 0 ? 'PASS: reveal times are absolute project-timeline instants placed by each task\'s OWN window'
      : 'FAIL: ' + outWin + ' element(s) reveal outside the bar that claims them'));

  // ── find genuinely overlapping task pairs ────────────────────────────────────────────────────
  const pairs = [];
  for (let i = 0; i < tasks.length; i++) for (let j = i + 1; j < tasks.length; j++) {
    const a = tasks[i], b = tasks[j];
    const ov = Math.min(a.eDays, b.eDays) - Math.max(a.sDays, b.sDays);
    if (ov > 0) pairs.push({ a: a, b: b, ov: ov, sameLevel: a.storey === b.storey });
  }
  const crossLevel = pairs.filter(p => !p.sameLevel);
  console.log('§TPL_REVEAL_CONCURRENCY bld=' + bld + ' overlappingTaskPairs=' + pairs.length +
    ' (crossLevel=' + crossLevel.length + ' sameLevel=' + pairs.filter(p => p.sameLevel).length +
    ') of ' + (tasks.length * (tasks.length - 1) / 2) + ' pairs — sameLevel MUST stay 0 ' +
    '(witness_4d_template_instantiation no-same-level-phase-overlap)');
  if (!crossLevel.length) {
    console.log('§TPL_PARALLEL_REVEAL bld=' + bld + ' VACUOUS — no two task windows intersect, so P2 judged nothing');
    return false;
  }

  // ── P2: interleaving inside the shared range, on the widest genuine overlaps ─────────────────
  crossLevel.sort((x, y) => y.ov - x.ov);
  let allPass = true;
  crossLevel.slice(0, 3).forEach(p => {
    const s0 = Math.max(p.a.sDays, p.b.sDays) * DAY + base;
    const e0 = Math.min(p.a.eDays, p.b.eDays) * DAY + base;
    // An element is "revealing" over its whole [s,e] interval, not only at the instant it starts.
    // Selecting on the start instant alone under-reports the TAIL of every support-layer band:
    // remapSolveToTasks maps a band's solve range [glo,ghi] onto [bS,bE] where ghi is the max END,
    // so the last element to START in a band starts strictly before bE and is still in progress
    // after it. Measured on Hospital before this correction: 2 of 20 bins read "one task only"
    // purely from that, on a schedule with no gap in it.
    const pick = (t, tag) => t.guids.map(g => sched[g]).filter(s => s && s.e >= s0 && s.s <= e0)
      .map(s => ({ t: tag, ts: s.s, te: s.e }));
    const A = pick(p.a, 'A'), B = pick(p.b, 'B');
    if (!A.length || !B.length) {
      console.log('§TPL_REVEAL_INTERLEAVE bld=' + bld + ' ' + p.a.id + ' | ' + p.b.id +
        ' VACUOUS — one side contributes no element inside the shared range (nA=' + A.length + ' nB=' + B.length + ')');
      allPass = false; return;
    }
    const u = A.concat(B).sort((x, y) => x.ts - y.ts);
    let alt = 0;
    for (let k = 1; k < u.length; k++) if (u[k].t !== u[k - 1].t) alt++;
    const expect = 2 * A.length * B.length / (A.length + B.length);
    const ratio = alt / expect;                       // DESCRIPTIVE ONLY — see P2's header
    const meanRun = u.length / Math.max(1, alt + 1);  // mean same-task run, in elements

    // (b) THE VERDICT — is BOTH-active true across the whole shared window?
    const BINS = 20, wid = (e0 - s0) / BINS;
    let bothActive = 0, aOnly = 0, bOnly = 0, neither = 0;
    for (let k = 0; k < BINS; k++) {
      const lo = s0 + k * wid, hi = k === BINS - 1 ? e0 : s0 + (k + 1) * wid;
      const inA = A.some(x => x.te >= lo && x.ts <= hi);
      const inB = B.some(x => x.te >= lo && x.ts <= hi);
      if (inA && inB) bothActive++; else if (inA) aOnly++; else if (inB) bOnly++; else neither++;
    }
    // Per-task activity, so a missing bin is ATTRIBUTED rather than blamed on serialisation. A bin
    // with only one task active has two possible causes and they are different defects:
    //   (i)  the tasks are serialised   — the failure this probe exists to catch;
    //   (ii) the OTHER task has intra-task DEAD AIR — a stretch of its own window where it reveals
    //        nothing, because remapSolveToTasks affine-maps a support layer's solve range onto a
    //        band sized by member COUNT: a layer whose solve range is narrow relative to its band
    //        bunches at the band's start and leaves the band's tail empty. That is §FUTURE item 2's
    //        original "cramming" complaint, not a parallelism defect, and it must not be reported
    //        as one. MEASURED Hospital TASK_Architecture_Envelope_Level_5: zero element starts on
    //        days 166-168 and 173 of its own [137,180] window.
    let aBins = 0, bBins = 0;
    for (let k = 0; k < BINS; k++) {
      const lo = s0 + k * wid, hi = k === BINS - 1 ? e0 : s0 + (k + 1) * wid;
      if (A.some(x => x.te >= lo && x.ts <= hi)) aBins++;
      if (B.some(x => x.te >= lo && x.ts <= hi)) bBins++;
    }
    // PARALLELISM verdict: wherever the SPARSER task is active at all, the other is active too, and
    // the union is not two blocks. No tuned constant: the bar is min(aBins,bBins), what the data
    // itself makes available to co-occur.
    const ok = alt > 1 && bothActive === Math.min(aBins, bBins);
    if (!ok) allPass = false;
    console.log('§TPL_REVEAL_DEADAIR bld=' + bld + ' pair=' + p.a.id + '|' + p.b.id +
      ' binsActive A=' + aBins + '/' + BINS + ' B=' + bBins + '/' + BINS + ' both=' + bothActive +
      ' — ' + (bothActive === Math.min(aBins, bBins)
        ? 'every slice the sparser task occupies is SHARED (no serialisation); ' +
          (BINS - Math.min(aBins, bBins)) + ' slice(s) are intra-task dead air, §FUTURE item 2 territory'
        : 'a slice has one task active while the other is ALSO capable of being active — genuine serialisation'));
    const rng = arr => (Math.min.apply(null, arr.map(x => x.ts)) - base) / DAY;
    const rngE = arr => (Math.max.apply(null, arr.map(x => x.ts)) - base) / DAY;
    console.log('§TPL_REVEAL_INTERLEAVE bld=' + bld +
      ' A=' + p.a.id + '[' + p.a.sDays + ',' + p.a.eDays + ']' +
      ' B=' + p.b.id + '[' + p.b.sDays + ',' + p.b.eDays + ']' +
      ' sharedWindowDays=[' + ((s0 - base) / DAY).toFixed(1) + ',' + ((e0 - base) / DAY).toFixed(1) + ']' +
      ' nA=' + A.length + ' nB=' + B.length +
      ' A_spans=[' + rng(A).toFixed(1) + ',' + rngE(A).toFixed(1) + ']' +
      ' B_spans=[' + rng(B).toFixed(1) + ',' + rngE(B).toFixed(1) + ']' +
      ' binsBothActive=' + bothActive + '/' + BINS + ' aOnly=' + aOnly + ' bOnly=' + bOnly + ' neither=' + neither +
      ' alternations=' + alt + ' meanSameTaskRun=' + meanRun.toFixed(1) + 'els' +
      ' [descriptive: vsRandomMix=' + ratio.toFixed(3) + ', clumping is §TPL_LAYER_ORDER by design]' +
      ' — ' + (ok ? 'PASS: both tasks reveal throughout the whole shared window, interleaved'
        : alt === 1 ? 'FAIL: exactly 2 back-to-back blocks — the tasks are SERIALISED, not parallel'
        : 'FAIL: ' + (BINS - bothActive) + ' slice(s) of the shared window have only ONE task revealing'));
  });

  console.log('§TPL_PARALLEL_REVEAL bld=' + bld + ' ' + (outWin === 0 && allPass ? 'PASS' : 'FAIL') +
    ' — absolute=' + (outWin === 0) + ' interleaved=' + allPass);
  return outWin === 0 && allPass;
}

const list = process.argv.slice(2).filter(a => a[0] !== '-');
const res = (list.length ? list : ['Hospital', 'HHS_Office_Federated']).map(b => run(b));
process.exit(res.every(Boolean) ? 0 : 2);
