#!/usr/bin/env node
// ⚠ DO NOT REMOVE — SCOPE: WITNESS W-RO, "reorder: exchange two bars' places" (guarantee G-B, Gantt editor lane step 5).
// Spec: bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.19.1 (G-B), §Q.19.11 (written before this file). Read the log.
//
// ISSUE THIS PROVES OR DISPROVES (owner, 2026-11-18: "user when choosing the unlock to edit button can reorder to
// correct certain arrangement"): the planner could not change the ORDER of two bars. The verb must exchange their
// places atomically, carry their elements along, reverse a direct link, refuse with a named reason when another link
// forbids it, be undone by one Undo, and leave "can this order be built?" to the lock gate.
//
// Everything runs through the SHIPPED code (tests/_gantt_edit_fixture.js): ScheduleAuthor.swapTasks, the Time Machine's
// swapGanttBars, the commit pipeline, undoLastGanttEdit and the lock gate's verifyGanttIntegrity, on a real building.
//
//   RO-1  after a committed swap: B starts where A started, A ends where B ended (or later, when the verb says it was
//         held back by a predecessor), durations kept, each bar's element set unchanged, every element inside its
//         bar's new window.
//   RO-2  a direct link is reversed (same type, lag) and no other link row changes; an unlinked pair changes none.
//   RO-3  each refusal — bars that overlap, blocked by another predecessor, the same bar — names its reason (and the
//         blocker), writes nothing and leaves the undo record alone.
//   RO-4  one Undo restores tasks, links and element times exactly.
//   RO-5  the lock gate, from the edit-start baseline: every committed reorder is judged; a physically worse one is
//         refused with offenders named; after Undo the gate passes again.
//   RO-6  wiring: Shift-drop calls swapGanttBars; it takes the edit lock before the verb and commits through
//         _tmCommitEdit with undo:; dry runs wrote nothing.
//   RO-R  red control: an element pushed out of its swapped bar fails the RO-1 check.
// An empty population prints INCONCLUSIVE, never PASS.
//
// Command: node viewer/tests/witness_gantt_reorder.js        RO_BLD=<building> (default Duplex)
'use strict';
const FX = require('./_gantt_edit_fixture.js');
const FN = FX.FN, stripComments = FX.stripComments;
const BLD = process.env.RO_BLD || 'Duplex';

let pass = 0, fail = 0, inconclusive = 0;
function claim(id, pop, bad, detail) {
  const v = pop === 0 ? 'INCONCLUSIVE' : (bad === 0 ? 'PASS' : 'FAIL');
  if (v === 'PASS') pass++; else if (v === 'FAIL') fail++; else inconclusive++;
  console.log('§W_RO ' + id.padEnd(6) + v.padEnd(13) + 'judged=' + String(pop).padEnd(5) + 'bad=' + String(bad).padEnd(4) + (detail || ''));
}
function finish() {
  console.log('§W_RO_SUMMARY pass=' + pass + ' fail=' + fail + ' inconclusive=' + inconclusive);
  if (fail) { console.error('FAIL — ' + fail + ' claim(s) failed'); process.exit(1); }
  if (!pass || inconclusive) { console.log('INCONCLUSIVE — ' + inconclusive + ' claim(s) judged nothing'); process.exit(2); }
  console.log('PASS — two bars exchange places atomically, their elements follow, one Undo takes it back, the lock gate judges the result');
}

// ── RO-6 (source half) ────────────────────────────────────────────────────────────────────────
let wiringBad = 0; const wiring = [];
{
  const body = stripComments(FN.swapGanttBars || ''), drag = stripComments(FN.wireGanttDrag || '');
  const checks = [
    ['swapGanttBars defined', !!FN.swapGanttBars],
    ['lock taken before the verb', body.indexOf("_tmEditLocked('swapGanttBars')") >= 0 && body.indexOf("_tmEditLocked('swapGanttBars')") < body.indexOf('.swapTasks(')],
    ['commits through _tmCommitEdit with undo:', /_tmCommitEdit\(\{[\s\S]*?\bundo:/.test(body)],
    ['calls no pipeline step itself', !/_tmResyncAfterRetime\(|_tmPersistEdit\(|retimeTaskElements\(/.test(body)],
    ['Shift-drop calls swapGanttBars', /if \(e\.shiftKey\) swapGanttBars\(d\.bar, drop\.bar\)/.test(drag)],
    ['engine verb exported', typeof require('../schedule_author.js').swapTasks === 'function'],
  ];
  checks.forEach(c => { if (!c[1]) wiringBad++; wiring.push(c[0] + '=' + c[1]); });
}

(async () => {
  if (!FN.swapGanttBars) { claim('RO-6', 6, wiringBad, wiring.join(' | ')); claim('RO-1', 0, 0, 'no swapGanttBars on this revision — nothing to drive'); return finish(); }
  const fx = await FX.make({ bld: BLD, extraNames: ['swapGanttBars'], lockGate: true });
  if (fx.missing || fx.failed) { claim('RO-1', 0, 0, 'no fixture: ' + (fx.missing || fx.failed)); return finish(); }
  const sb = fx.sb, SA = fx.SA, db = fx.db, schedId = fx.schedId, logs = fx.logs, q = fx.q;
  const key = p => p.tasks + '/' + p.links + '/' + p.opsDb + '/' + p.opsMem;
  const taskRow = id => { const r = q('SELECT schedule_start, schedule_finish, schedule_duration FROM tasks WHERE task_id=?', [id])[0]; return { s: r[0], f: r[1], d: r[2] }; };
  const linkRows = () => q('SELECT predecessor_id, successor_id, sequence_type, lag_days FROM task_sequences ORDER BY 1, 2').map(r => r.join('|'));
  const guidsOf = () => { const m = {}; q('SELECT task_id, guid FROM task_elements ORDER BY 1, 2').forEach(r => { (m[r[0]] = m[r[0]] || []).push(r[1]); }); return m; };
  const barOf = (bars, id) => bars.filter(b => b.taskId === id)[0];
  const quiet = fn => { const l = console.log; console.log = () => {}; try { return fn(); } finally { console.log = l; } };   // the engine's dry-run lines only (hundreds); every committed line is printed

  // ── every ordered pair, in dry run: what does the engine say? ───────────────────────────────
  const bars0 = fx.rebuildBars(), before0 = fx.parts(), pairs = [], tally = {};
  for (let i = 0; i < bars0.length; i++) for (let j = i + 1; j < bars0.length; j++) {
    const r = quiet(() => SA.swapTasks(db, schedId, bars0[i].taskId, bars0[j].taskId, { dryRun: true }));
    const k = r.ok ? (r.reversedLink ? 'ok_linked' : 'ok_unlinked') : r.reason; tally[k] = (tally[k] || 0) + 1;
    pairs.push({ a: bars0[i].taskId, b: bars0[j].taskId, r: r, k: k });
  }
  const dryWrote = key(fx.parts()) !== key(before0);
  console.log('§W_RO_PAIRS ' + BLD + ' bars=' + bars0.length + ' pairs=' + pairs.length + ' ' + Object.keys(tally).sort().map(k => k + '=' + tally[k]).join(' ') + ' dryRunsWrote=' + dryWrote);
  claim('RO-6', 7, wiringBad + (dryWrote ? 1 : 0), wiring.join(' | ') + ' | dry runs wrote nothing=' + !dryWrote);

  // elements inside their bar, for the two swapped tasks (bars rebuilt by the shipped model)
  function outsideOf(ids) {
    const bars = fx.rebuildBars(), by = {}; sb._ops.forEach(o => { by[o.output_guid] = o; }); let n = 0, tot = 0;
    ids.forEach(id => { const b = barOf(bars, id); (b ? b.guids : []).forEach(g => { tot++; const o = by[g]; if (!(b.startTs <= o.start_ts && o.start_ts < o.end_ts && o.end_ts <= b.endTs)) n++; }); });
    return { n: n, tot: tot };
  }
  // ── RO-1 / RO-2 / RO-4 / RO-R on one unlinked and one directly linked pair ────────────────────
  let j1 = 0, b1 = 0, j2 = 0, b2 = 0, j4 = 0, b4 = 0, redOk = null; const notes = [];
  ['ok_unlinked', 'ok_linked'].forEach(kind => {
    const p = pairs.filter(x => x.k === kind)[0];
    if (!p) { notes.push(kind + ': no such pair on ' + BLD); return; }
    const bars = fx.rebuildBars(), stBefore = fx.parts(), A0 = taskRow(p.r.a.id), B0 = taskRow(p.r.b.id), L0 = linkRows(), G0 = guidsOf();
    logs.length = 0;
    const ret = sb.__v.swapGanttBars(barOf(bars, p.a), barOf(bars, p.b));
    const commit = logs.filter(l => l.indexOf('§GANTT_REORDER_COMMIT') === 0)[0] || '(no commit line)';
    const A1 = taskRow(p.r.a.id), B1 = taskRow(p.r.b.id), L1 = linkRows(), G1 = guidsOf(), out = outsideOf([p.r.a.id, p.r.b.id]);
    const le = sb.__lastEdit();
    const c = [
      ['committed', ret === true], ['B starts where A started', B1.s === A0.s],
      ['A ends where B ended' + (p.r.clamped ? ' or later (held back)' : ''), p.r.clamped ? A1.f >= B0.f : A1.f === B0.f],
      ['durations kept', A1.d === A0.d && B1.d === B0.d], ['element sets unchanged', JSON.stringify(G1) === JSON.stringify(G0)],
      ['elements inside their bars (' + out.tot + ')', out.tot > 0 && out.n === 0], ['undo record is this reorder', !!le && le.mode === 'reorder'],
    ];
    c.forEach(x => { j1++; if (!x[1]) { b1++; notes.push(kind + ' FAILED: ' + x[0]); } });
    const gone = L0.filter(x => L1.indexOf(x) < 0), added = L1.filter(x => L0.indexOf(x) < 0);
    j2++;
    const linkOk = kind === 'ok_linked'
      ? gone.length === 1 && added.length === 1 && gone[0].indexOf(p.r.a.id + '|' + p.r.b.id + '|') === 0 && added[0] === p.r.b.id + '|' + p.r.a.id + '|' + gone[0].split('|').slice(2).join('|')
      : gone.length === 0 && added.length === 0;
    if (!linkOk) { b2++; notes.push(kind + ' links: gone=[' + gone.join(',') + '] added=[' + added.join(',') + ']'); }
    console.log('§W_RO_SWAP ' + kind.padEnd(11) + ' ' + p.r.a.id + ' [' + A0.s + '..' + A0.f + '] ⇄ ' + p.r.b.id + ' [' + B0.s + '..' + B0.f + ']  ->  ' + p.r.b.id + ' [' + B1.s + '..' + B1.f + '] then ' +
      p.r.a.id + ' [' + A1.s + '..' + A1.f + ']  links -' + gone.length + ' +' + added.length + '  elements=' + out.tot + ' outside=' + out.n + ' | ' + commit);
    if (redOk === null) {   // RO-R, once: push one element of the swapped bar out, the check must see it; then put it back
      const b = barOf(fx.rebuildBars(), p.r.b.id), op = sb._ops.filter(o => o.output_guid === b.guids[0])[0], keep = op.end_ts;
      op.end_ts = b.endTs + 3600000; redOk = outsideOf([p.r.b.id]).n >= 1; op.end_ts = keep;
    }
    fx.rebuildBars(); sb.__v.undo();
    j4++; if (key(fx.parts()) !== key(stBefore)) { b4++; notes.push(kind + ': NOT restored by one Undo'); }
  });
  claim('RO-1', j1, b1, 'exchange holds on ' + (j1 / 7) + ' committed swap(s)' + (notes.length ? ' — ' + notes.join('; ') : ''));
  claim('RO-2', j2, b2, 'link rows: a direct link reversed with its type and lag, nothing else changed');
  claim('RO-4', j4, b4, 'one Undo restores tasks, links and element times');
  claim('RO-R', redOk === null ? 0 : 1, redOk ? 0 : 1, 'red control: an element pushed 1 h past its swapped bar is counted');

  // ── RO-3 refusals, through the Time Machine verb ────────────────────────────────────────────
  {
    const bars = fx.rebuildBars(); sb.__v.drag(bars[bars.length - 1], 'move', 1); const le = sb.__lastEdit();   // a previous record to protect
    let judged = 0, bad = 0; const said = [];
    [['bars_overlap', pairs.filter(x => x.k === 'bars_overlap')[0]], ['blocked', pairs.filter(x => x.k === 'blocked')[0]], ['same_task', { a: bars0[0].taskId, b: bars0[0].taskId }]].forEach(([reason, p]) => {
      if (!p) { said.push(reason + ': no such pair'); return; }
      const b = fx.rebuildBars(), st = fx.parts(); logs.length = 0;
      const ret = sb.__v.swapGanttBars(barOf(b, p.a), barOf(b, p.b));
      const line = logs.filter(l => l.indexOf('§GANTT_REORDER_REJECT') === 0)[0] || '';
      const ok = ret === undefined && line.indexOf('reason=' + reason) > 0 && (reason !== 'blocked' || /blockedBy=\S+/.test(line)) && key(fx.parts()) === key(st) && sb.__lastEdit() === le;
      judged++; if (!ok) bad++; said.push(reason + ': ' + (line.replace('§GANTT_REORDER_REJECT ', '') || 'NO REJECT LINE') + (ok ? '' : ' ✗'));
    });
    claim('RO-3', judged, bad, said.join(' | '));
    fx.rebuildBars(); sb.__v.undo();
  }

  // ── RO-5 the lock gate judges every committed reorder ───────────────────────────────────────
  {
    fx.rebuildBars(); sb.__gate.capture();
    const base = quiet(() => sb.__gate.verify());
    const cands = pairs.filter(x => x.r.ok);
    let judged = 0, worse = 0, worseNamed = 0, backOk = 0, first = '';
    cands.forEach(p => {
      const bars = fx.rebuildBars();
      if (quiet(() => sb.__v.swapGanttBars(barOf(bars, p.a), barOf(bars, p.b))) !== true) return;
      fx.rebuildBars(); const v = quiet(() => sb.__gate.verify());
      judged++;
      if (!v.ok) { worse++; if (v.guids && v.guids.length) worseNamed++;
        if (!first) first = p.r.b.id + ' before ' + p.r.a.id + ': floating +' + v.dFloating + ' midair +' + v.dMidair + ' e.g. ' + (v.guids || []).slice(0, 2).join(','); }
      fx.rebuildBars(); quiet(() => sb.__v.undo());
      fx.rebuildBars(); if (quiet(() => sb.__gate.verify()).ok) backOk++;
    });
    console.log('§W_RO_GATE ' + BLD + ' baseline ok=' + base.ok + ' floating=' + base.floating + ' midair=' + base.midair + ' judged=' + base.total +
      ' | committed reorders=' + judged + ' refusedAtLock=' + worse + ' acceptedAtLock=' + (judged - worse) + ' gatePassesAfterUndo=' + backOk + (first ? ' | first refused: ' + first : ''));
    claim('RO-5', worse ? judged + worse : 0, (worse - worseNamed) + (judged - backOk) + (base.ok ? 0 : 1),
      'committed reorders judged by the lock gate=' + judged + '; physically worse and refused=' + worse + ' (offenders named on ' + worseNamed + '); the gate passes again after Undo on ' + backOk + ' of ' + judged +
      (worse ? '' : ' — no physically worse reorder was found, so the refusal was never exercised'));
  }
  db.close(); finish();
})().catch(e => { console.error('§W_RO_ERROR ' + (e && e.stack || e)); process.exit(3); });
