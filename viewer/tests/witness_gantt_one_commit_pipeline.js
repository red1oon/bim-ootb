#!/usr/bin/env node
// ⚠ DO NOT REMOVE — SCOPE: WITNESS W-OCP, "one commit pipeline" for every Gantt edit (Gantt editor lane, step 3).
// Spec: bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.19.7 (written before this file). Read the log after every run.
//
// ISSUE THIS PROVES OR DISPROVES: the edit commit pipeline (re-time elements -> undo record -> resync -> CPM annotate ->
// persist -> invalidate -> day ladder -> redraw -> render) was typed out in eight places in tm_gantt_edit.js and the
// copies had already drifted (link re-synced only when a bar moved; unlink never rendered). One owner, or it drifts again.
//
//   OCP-1  each pipeline step has ONE caller: retimeTaskElements is called only by _tmCommitEdit; _tmPersistEdit only
//          by _tmEditRefresh (and the import, which is the refold path); _tmResyncAfterRetime only by _tmEditRefresh
//          (and the exception recovery).
//   OCP-2  every function that takes the edit lock (derived from the source: `_tmEditLocked('`) reaches the pipeline once
//          per lock it takes (`_tmCommitEdit(` / `_tmEditRefresh(`), or is a refold path (rebuilds the 4D from the tasks
//          table), and calls none of the refresh steps itself.
//   OCP-3  on a real building, each gesture — move, resize, ruler shift, group shift, link (no move), link (forces a
//          move), pull-back, undo — runs the refresh steps in the ONE canonical order, recorded by instrumented steps.
//   OCP-4  equivalence: after each gesture the tasks rows, element ops, links and the undo record are printed as a hash
//          on a `§W_OCP_STATE` line. Diff those lines between main and a branch: equal = the refactor moved nothing.
//          (This file prints them; the comparison is run across revisions, see OCP_EXPECT.)
//   OCP-R  red control: a lock-taking body with its pipeline call removed fails OCP-2.
// An empty population prints INCONCLUSIVE, never PASS.
//
// Command: node viewer/tests/witness_gantt_one_commit_pipeline.js
//          OCP_BLD=<building> (default Duplex);  OCP_EXPECT=<file of §W_OCP_STATE lines> makes OCP-4 a claim.
'use strict';
const fs = require('fs'), path = require('path');
const FX = require('./_gantt_edit_fixture.js');   // the building, its ops and the shipped verbs in a vm context
const FN = FX.FN, tmSrc = FX.tmSrc, stripComments = FX.stripComments;
const BLD = process.env.OCP_BLD || 'Duplex';
const DAY = 86400000;
const CANON = ['resync', 'annotate', 'persist', 'invalidate', 'computeDays', 'draw', 'render'];

let pass = 0, fail = 0, inconclusive = 0;
function claim(id, pop, bad, detail) {
  const v = pop === 0 ? 'INCONCLUSIVE' : (bad === 0 ? 'PASS' : 'FAIL');
  if (v === 'PASS') pass++; else if (v === 'FAIL') fail++; else inconclusive++;
  console.log('§W_OCP ' + id.padEnd(7) + v.padEnd(13) + 'judged=' + String(pop).padEnd(5) + 'bad=' + String(bad).padEnd(4) + (detail || ''));
}
const has = n => !!FN[n];
function callers(token) {   // functions whose own code (comments stripped, nested named functions excluded) calls token
  const out = [];
  Object.keys(FN).forEach(n => {
    let body = stripComments(FN[n]).replace(/^function \w+\(/, '(');
    Object.keys(FN).forEach(k => { if (k !== n && FN[n].indexOf(FN[k]) > 0) body = body.replace(stripComments(FN[k]), ''); });
    const c = body.split(token).length - 1;
    if (c) out.push(n + (c > 1 ? 'x' + c : ''));
  });
  return out.sort();
}

// ── OCP-1: one caller per step ────────────────────────────────────────────────────────────────
{
  const want = { 'retimeTaskElements(': ['_tmCommitEdit'], '_tmPersistEdit(': ['_tmEditRefresh', 'tmImportForeign'],
    '_tmResyncAfterRetime(': ['_tmEditExceptionRecover', '_tmEditRefresh'] };
  let bad = 0; const parts = [];
  Object.keys(want).forEach(tok => { const got = callers(tok); const ok = JSON.stringify(got) === JSON.stringify(want[tok].slice().sort());
    if (!ok) bad++; parts.push(tok + ' <- [' + got.join(', ') + ']' + (ok ? '' : ' WANT [' + want[tok].join(', ') + ']')); });
  claim('OCP-1', 3, bad, parts.join(' | '));
}

// ── OCP-2: every lock taker reaches the pipeline ──────────────────────────────────────────────
const STEP_TOKENS = ['_tmResyncAfterRetime(', '_tmAnnotateCpm(', '_tmPersistEdit(', 'retimeTaskElements('];
const REFOLD = /tmRefoldSchedule\(|refoldSchedule\(|materializeZones\(/;
function judgeLockTaker(name, body) {
  const code = stripComments(body);
  const locks = code.split("_tmEditLocked('").length - 1;
  const pipe = (code.split('_tmCommitEdit(').length - 1) + (code.split('_tmEditRefresh(').length - 1);
  const own = STEP_TOKENS.filter(t => code.indexOf(t) >= 0);
  if (REFOLD.test(code)) return { ok: own.length === 0 || name === 'tmImportForeign', kind: 'refold', locks, pipe, own };
  return { ok: pipe >= locks && own.length === 0, kind: 'pipeline', locks, pipe, own };
}
{
  const takers = Object.keys(FN).filter(n => n !== '_tmEditLocked' && stripComments(FN[n]).indexOf("_tmEditLocked('") >= 0)
    .filter(n => !Object.keys(FN).some(k => k !== n && FN[k].indexOf(FN[n]) > 0 && false));
  let bad = 0; const rows = [];
  takers.forEach(n => { const j = judgeLockTaker(n, FN[n]); if (!j.ok) bad++;
    rows.push(n + ':' + j.kind + ' locks=' + j.locks + ' pipe=' + j.pipe + (j.own.length ? ' OWN_STEPS=' + j.own.join('+') : '') + (j.ok ? '' : ' ✗')); });
  claim('OCP-2', takers.length, bad, rows.join(' | '));
  // OCP-R: remove the pipeline call from a real lock taker's body
  const victim = takers.filter(n => judgeLockTaker(n, FN[n]).kind === 'pipeline' && judgeLockTaker(n, FN[n]).ok)[0];
  if (!victim) claim('OCP-R', 0, 0, 'no passing lock taker to mutate (expected on a revision where OCP-2 is red)');
  else { const mut = FN[victim].replace(/_tmCommitEdit\(/g, '_noop(').replace(/_tmEditRefresh\(/g, '_noop(');
    claim('OCP-R', 1, judgeLockTaker(victim, mut).ok ? 1 : 0, 'red control: ' + victim + ' with its pipeline call removed is refused'); }
}

// ── OCP-3 / OCP-4: the gestures, on a real building ───────────────────────────────────────────
(async () => {
  const fx = await FX.make({ bld: BLD });
  if (fx.missing || fx.failed) { claim('OCP-3', 0, 0, 'no fixture: ' + (fx.missing || fx.failed)); return finish(); }
  const db = fx.db, SA = fx.SA, sb = fx.sb, steps = fx.steps, logs = fx.logs, ops = fx.ops, rebuildBars = fx.rebuildBars, sha = FX.sha;
  function state() {
    const le = sb.__lastEdit(), p = fx.parts();
    return 'tasks=' + p.tasks + ' opsDb=' + p.opsDb + ' opsMem=' + p.opsMem + ' links=' + p.links +
      ' undo=' + (le ? le.mode + ':' + Object.keys(le.tasksBefore || {}).length + ':' + sha(JSON.stringify(Object.keys(le.opsBefore || {}).sort().map(g => [g, le.opsBefore[g].start_ts, le.opsBefore[g].end_ts]))) : 'none');
  }
  const out = []; let badOrder = 0, ran = 0;
  function gesture(name, fn, expectSteps) {
    const bars = rebuildBars(); steps.length = 0; logs.length = 0;
    let ret; try { ret = fn(bars); } catch (e) { ret = 'THREW ' + e.message; }
    const commit = logs.filter(l => /_COMMIT |§GANTT_EDIT_LINK|§GANTT_EDIT_UNDO |_REJECT|§TM_EDIT_EXCEPTION|§GANTT_EDIT_CYCLE/.test(l)).map(l => l.split(' ').slice(0, 1)[0]).join(',') || '-';
    const retimed = (logs.filter(l => l.indexOf('§GANTT_RETIME ') === 0)[0] || '').replace('§GANTT_RETIME ', '').replace(/ ms=.*/, '') || 'none';
    const line = '§W_OCP_STATE ' + name.padEnd(22) + ' ret=' + String(ret).padEnd(9) + ' ' + state() + ' retime=[' + retimed + '] log=' + commit;
    out.push(line); console.log(line + ' steps=' + steps.join('>'));
    if (expectSteps) { ran++; if (steps.join('>') !== CANON.join('>')) { badOrder++; console.log('§W_OCP_ORDER ' + name + ' ran ' + (steps.join('>') || '(nothing)') + ' — canonical is ' + CANON.join('>')); } }
  }
  const last = bars => bars.slice().sort((a, b) => b.endTs - a.endTs || (a.taskId < b.taskId ? -1 : 1))[0];
  const big = bars => bars.slice().sort((a, b) => b.count - a.count || (a.taskId < b.taskId ? -1 : 1))[0];
  gesture('move +5d last bar', bars => sb.__v.drag(last(bars), 'move', 5), true);
  gesture('resize +2d largest', bars => sb.__v.drag(big(bars), 'resizeR', 2), true);
  gesture('ruler shift +3d', () => sb.__v.shift(3), true);
  gesture('group shift +2d', bars => sb.__v.group([bars[0].taskId, bars[1].taskId], 2), true);
  gesture('undo (group shift)', () => sb.__v.undo(), true);
  gesture('link first->last', bars => sb.__v.link(bars[0], bars[bars.length - 1]), true);
  {   // a link whose successor currently starts before its new predecessor ends: the verb must move it
    let pair = null; const b0 = rebuildBars();
    for (let i = 0; i < b0.length && !pair; i++) for (let j = 0; j < b0.length && !pair; j++)
      if (i !== j && b0[j].startTs < b0[i].endTs && !SA.wouldCycle(db, b0[i].taskId, b0[j].taskId)) pair = [b0[i].taskId, b0[j].taskId];
    if (!pair) console.log('§W_OCP_STATE link forcing a move: no legal pair on ' + BLD + ' — not run');
    else gesture('link forcing a move', bars => sb.__v.link(bars.filter(b => b.taskId === pair[0])[0], bars.filter(b => b.taskId === pair[1])[0]), true);
  }
  gesture('pull back', () => sb.__v.asap(), true);
  gesture('undo (pull back)', () => sb.__v.undo(), true);
  gesture('undo again (nothing)', () => sb.__v.undo(), false);
  claim('OCP-3', ran, badOrder, 'gestures whose refresh steps ran in the canonical order ' + CANON.join('>') + ' (' + BLD + ', ' + ops.length + ' elements)');
  if (process.env.OCP_EXPECT) {
    const want = fs.readFileSync(process.env.OCP_EXPECT, 'utf8').split('\n').filter(l => l.indexOf('§W_OCP_STATE') === 0).map(l => l.replace(/ steps=.*/, ''));
    let diff = 0, first = ''; out.forEach((l, i) => { if (l !== want[i]) { diff++; if (!first) first = l + '   WANT   ' + want[i]; } });
    claim('OCP-4', want.length === out.length ? out.length : 0, diff, 'state after each gesture equals ' + path.basename(process.env.OCP_EXPECT) + (first ? ' — first difference: ' + first : ''));
  } else console.log('§W_OCP OCP-4 not judged in this run: set OCP_EXPECT=<log of another revision> to compare the §W_OCP_STATE lines');
  db.close(); finish();
})().catch(e => { console.error('§W_OCP_ERROR ' + (e && e.stack || e)); process.exit(3); });

function finish() {
  console.log('§W_OCP_SUMMARY pass=' + pass + ' fail=' + fail + ' inconclusive=' + inconclusive);
  if (fail) { console.error('FAIL — ' + fail + ' claim(s) failed'); process.exit(1); }
  if (!pass || inconclusive) { console.log('INCONCLUSIVE — ' + inconclusive + ' claim(s) judged nothing'); process.exit(2); }
  console.log('PASS — every Gantt edit commits through the one pipeline, in one order');
}
