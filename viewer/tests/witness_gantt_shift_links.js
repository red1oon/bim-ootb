#!/usr/bin/env node
// ⚠ DO NOT REMOVE — SCOPE: WITNESS W-GL, "group shift and ruler shift respect links that cross the selection"
// (Gantt editor lane, step 6). Spec: bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.19.13 (written before this file).
// Read the log after every run.
//
// ISSUE THIS PROVES OR DISPROVES: a marquee selection dragged as a group was translated with NO link check
// (ScheduleAuthor.shiftTasks reads no link). Dragged earlier it could land before a predecessor that was not selected;
// dragged later it could overrun a successor that was not selected. A single drag of the same bar is clamped in the
// first case and pushes the successor in the second.
//
// Everything runs through the SHIPPED verbs (tests/_gantt_edit_fixture.js). "A task sits before its floor" is asked of
// the OWNER: moveTaskCascade(task, its own start, { dryRun }) reports `clamped` when the task is earlier than its
// predecessors allow. No link rule is re-typed here.
//
//   GL-1  a selection shifted EARLIER past an outside predecessor: no task ends up before its floor, the selection moved
//         as one body by the effective days, and the clamp names its blocker.
//   GL-2  a selection shifted LATER into an outside successor: the successor is pushed, no task is before its floor,
//         the selection moved as one body.
//   GL-3  a selection that cannot move earlier at all is refused (blocked, blockedBy), nothing written, undo record kept.
//   GL-4  the ruler shift, both directions: no task before its floor, every leaf moved by exactly the days asked.
//   GL-5  every element stays inside its bar after each committed case, and one Undo restores each.
//   GL-6  both ends of a link selected: both move by the same days and the link between them keeps its gap.
//   GL-R  red control: the raw shiftTasks on GL-1's selection DOES leave a task before its floor.
// An empty population prints INCONCLUSIVE, never PASS.
//
// Command: node viewer/tests/witness_gantt_shift_links.js        GL_BLD=<building> (default Duplex)
'use strict';
const FX = require('./_gantt_edit_fixture.js');
const BLD = process.env.GL_BLD || 'Duplex';
const DAY = 86400000;
let pass = 0, fail = 0, inconclusive = 0;
function claim(id, pop, bad, detail) {
  const v = pop === 0 ? 'INCONCLUSIVE' : (bad === 0 ? 'PASS' : 'FAIL');
  if (v === 'PASS') pass++; else if (v === 'FAIL') fail++; else inconclusive++;
  console.log('§W_GL ' + id.padEnd(6) + v.padEnd(13) + 'judged=' + String(pop).padEnd(5) + 'bad=' + String(bad).padEnd(4) + (detail || ''));
}
function finish() {
  console.log('§W_GL_SUMMARY pass=' + pass + ' fail=' + fail + ' inconclusive=' + inconclusive);
  if (fail) { console.error('FAIL — ' + fail + ' claim(s) failed'); process.exit(1); }
  if (!pass || inconclusive) { console.log('INCONCLUSIVE — ' + inconclusive + ' claim(s) judged nothing'); process.exit(2); }
  console.log('PASS — a group moves as one body, stops at an outside predecessor, pushes an outside successor; the ruler shift crosses no link');
}
(async () => {
  const fx = await FX.make({ bld: BLD });
  if (fx.missing || fx.failed) { claim('GL-1', 0, 0, 'no fixture: ' + (fx.missing || fx.failed)); return finish(); }
  const sb = fx.sb, SA = fx.SA, db = fx.db, schedId = fx.schedId, logs = fx.logs, q = fx.q;
  const key = p => p.tasks + '/' + p.links + '/' + p.opsDb + '/' + p.opsMem;
  const quiet = fn => { const l = console.log; console.log = () => {}; try { return fn(); } finally { console.log = l; } };
  const leaf = () => { const m = {}; q('SELECT task_id, schedule_start, schedule_finish FROM tasks WHERE schedule_id=? AND (is_summary IS NULL OR is_summary=0)', [schedId]).forEach(r => { m[r[0]] = { s: r[1], f: r[2] }; }); return m; };
  const dayOf = s => Date.parse(s + 'T00:00:00Z') / DAY;
  // the OWNER's answer to "is this task earlier than its predecessors allow?"
  const beforeFloor = () => { const L = leaf(); return Object.keys(L).filter(id => quiet(() => SA.moveTaskCascade(db, schedId, id, L[id].s, { dryRun: true })).clamped).sort(); };
  function outside() { const bars = fx.rebuildBars(), by = {}; sb._ops.forEach(o => { by[o.output_guid] = o; }); let n = 0, tot = 0;
    bars.forEach(b => b.guids.forEach(g => { tot++; const o = by[g]; if (!(b.startTs <= o.start_ts && o.start_ts < o.end_ts && o.end_ts <= b.endTs)) n++; })); return { n: n, tot: tot }; }
  const last = bars => bars.slice().sort((a, b) => b.endTs - a.endTs || (a.taskId < b.taskId ? -1 : 1))[0];
  const deltas = (L0, L1, ids) => ids.map(id => dayOf(L1[id].s) - dayOf(L0[id].s));
  const base = beforeFloor();
  console.log('§W_GL_BASE ' + BLD + ' bars=' + fx.rebuildBars().length + ' links=' + q('SELECT COUNT(*) FROM task_sequences')[0][0] + ' tasksBeforeTheirFloor=' + base.length);
  let j5 = 0, b5 = 0; const notes5 = [];
  function elementsAndUndo(name, stBefore) {
    const o = outside(); j5++; if (!(o.tot > 0 && o.n === 0)) { b5++; notes5.push(name + ': ' + o.n + ' of ' + o.tot + ' elements outside their bar'); }
    fx.rebuildBars(); quiet(() => sb.__v.undo()); j5++; if (key(fx.parts()) !== key(stBefore)) { b5++; notes5.push(name + ': not restored by one Undo'); }
  }
  const lineOf = re => (logs.filter(l => re.test(l))[0] || '(no line)');

  // ── GL-1: earlier, past an outside predecessor. PREP: the last bar is first moved 5 days later, so there is room.
  let gl1sel = null;
  {
    quiet(() => sb.__v.drag(last(fx.rebuildBars()), 'move', 5));
    const bars = fx.rebuildBars(), b = last(bars), sel = [b.taskId]; gl1sel = sel;
    const st = fx.parts(), L0 = leaf(); logs.length = 0;
    sb.__v.group(sel, -8);
    const L1 = leaf(), d = deltas(L0, L1, sel), viol = beforeFloor().filter(x => base.indexOf(x) < 0);
    const line = lineOf(/^§GANTT_GROUP_SHIFT_(COMMIT|REJECT)/), clampSaid = /clamped=true/.test(line) && /blockedBy=\S+/.test(line);
    console.log('§W_GL_CASE earlier   selection=[' + sel.join(',') + '] asked=-8d moved=' + d.join(',') + 'd newTasksBeforeFloor=' + viol.length + (viol.length ? ' [' + viol.join(',') + ']' : '') + ' | ' + line);
    claim('GL-1', 3, (viol.length ? 1 : 0) + (d.every(x => x === d[0]) && d[0] < 0 && d[0] > -8 ? 0 : 1) + (clampSaid ? 0 : 1),
      'tasks newly before their floor=' + viol.length + '; selection moved ' + d[0] + 'd as one body (asked -8, room 5); clamp reported with its blocker=' + clampSaid);
    if (key(fx.parts()) !== key(st)) elementsAndUndo('earlier', st); else notes5.push('earlier: nothing committed');
    // GL-R on the same selection, with the raw primitive
    const stR = fx.parts(); quiet(() => SA.shiftTasks(db, sel, -8)); const violR = beforeFloor().filter(x => base.indexOf(x) < 0);
    claim('GL-R', 1, violR.length ? 0 : 1, 'red control: raw shiftTasks(-8d) on the same selection leaves ' + violR.length + ' task(s) before their floor');
    quiet(() => SA.shiftTasks(db, sel, 8));
    if (key(fx.parts()) !== key(stR)) console.log('§W_GL_NOTE the red control did not put the fixture back exactly');
  }
  // ── GL-3: cannot move earlier at all (a bar sitting on its floor)
  {
    const bars = fx.rebuildBars(), L = leaf();
    const tight = bars.filter(b => { const r = quiet(() => SA.moveTaskCascade(db, schedId, b.taskId, new Date((dayOf(L[b.taskId].s) - 1) * DAY).toISOString().slice(0, 10), { dryRun: true })); return r.ok && r.clamped && r.start === L[b.taskId].s; })[0];
    if (!tight) claim('GL-3', 0, 0, 'no bar sits exactly on its floor on ' + BLD);
    else { const st = fx.parts(), le = sb.__lastEdit(); logs.length = 0; sb.__v.group([tight.taskId], -3);
      const line = lineOf(/^§GANTT_GROUP_SHIFT_(COMMIT|REJECT)/), refused = /^§GANTT_GROUP_SHIFT_REJECT/.test(line) && /reason=blocked/.test(line) && /blockedBy=\S+/.test(line);
      console.log('§W_GL_CASE blocked   selection=[' + tight.taskId + '] asked=-3d | ' + line);
      claim('GL-3', 3, (refused ? 0 : 1) + (key(fx.parts()) === key(st) ? 0 : 1) + (sb.__lastEdit() === le ? 0 : 1), 'refused with blocked + blockedBy=' + refused + '; nothing written=' + (key(fx.parts()) === key(st)) + '; undo record kept=' + (sb.__lastEdit() === le));
      if (key(fx.parts()) !== key(st)) { fx.rebuildBars(); quiet(() => sb.__v.undo()); } }
  }
  // ── GL-2: later, into an outside successor
  {
    const bars = fx.rebuildBars(), deps = SA.listDependencies(db, schedId);
    const d0 = deps.filter(x => bars.some(b => b.taskId === x.predId) && bars.some(b => b.taskId === x.succId))[0];
    if (!d0) claim('GL-2', 0, 0, 'no link between two bars on ' + BLD);
    else { const sel = [d0.predId], st = fx.parts(), L0 = leaf(); logs.length = 0;
      sb.__v.group(sel, 4);
      const L1 = leaf(), d = deltas(L0, L1, sel), viol = beforeFloor().filter(x => base.indexOf(x) < 0), succMoved = dayOf(L1[d0.succId].s) - dayOf(L0[d0.succId].s);
      const line = lineOf(/^§GANTT_GROUP_SHIFT_(COMMIT|REJECT)/);
      console.log('§W_GL_CASE later     selection=[' + sel.join(',') + '] asked=+4d moved=' + d.join(',') + 'd outsideSuccessor=' + d0.succId + ' moved=' + succMoved + 'd newTasksBeforeFloor=' + viol.length + (viol.length ? ' [' + viol.slice(0, 4).join(',') + ']' : '') + ' | ' + line);
      claim('GL-2', 3, (viol.length ? 1 : 0) + (d[0] === 4 ? 0 : 1) + (succMoved > 0 ? 0 : 1), 'tasks newly before their floor=' + viol.length + '; selection moved +' + d[0] + 'd; the outside successor was pushed ' + succMoved + 'd');
      if (key(fx.parts()) !== key(st)) elementsAndUndo('later', st); }
  }
  // ── GL-6: both ends of a link selected — the link is INSIDE the body and must keep its slack
  {
    const bars = fx.rebuildBars(), deps = SA.listDependencies(db, schedId);
    const d0 = deps.filter(x => bars.some(b => b.taskId === x.predId) && bars.some(b => b.taskId === x.succId))[0];
    if (!d0) claim('GL-6', 0, 0, 'no link between two bars on ' + BLD);
    else { const sel = [d0.predId, d0.succId], st = fx.parts(), L0 = leaf(); logs.length = 0;
      sb.__v.group(sel, 4);
      const L1 = leaf(), d = deltas(L0, L1, sel), viol = beforeFloor().filter(x => base.indexOf(x) < 0);
      const gap0 = dayOf(L0[d0.succId].s) - dayOf(L0[d0.predId].f), gap1 = dayOf(L1[d0.succId].s) - dayOf(L1[d0.predId].f);
      console.log('§W_GL_CASE two-bar   selection=[' + sel.join(',') + '] asked=+4d moved=' + d.join(',') + 'd insideLinkGap ' + gap0 + 'd -> ' + gap1 + 'd newTasksBeforeFloor=' + viol.length + ' | ' + lineOf(/^§GANTT_GROUP_SHIFT_(COMMIT|REJECT)/));
      claim('GL-6', 3, (d[0] === 4 && d[1] === 4 ? 0 : 1) + (gap0 === gap1 ? 0 : 1) + (viol.length ? 1 : 0), 'both selected bars moved +4d (' + d.join(',') + '); the link between them kept its gap (' + gap0 + 'd -> ' + gap1 + 'd); tasks newly before their floor=' + viol.length);
      if (key(fx.parts()) !== key(st)) elementsAndUndo('two-bar', st); }
  }
  // ── GL-4: the ruler shift
  {
    let bad = 0, n = 0; const said = [];
    [3, -2].forEach(k => { fx.rebuildBars(); const st = fx.parts(), L0 = leaf(); logs.length = 0; sb.__v.shift(k);
      const L1 = leaf(), ids = Object.keys(L0), d = deltas(L0, L1, ids), viol = beforeFloor().filter(x => base.indexOf(x) < 0);
      n += 2; if (viol.length) bad++; if (!d.every(x => x === k)) bad++;
      said.push((k > 0 ? '+' : '') + k + 'd: ' + ids.length + ' leaves all moved ' + k + 'd=' + d.every(x => x === k) + ', newly before floor=' + viol.length);
      if (key(fx.parts()) !== key(st)) elementsAndUndo('ruler ' + k, st); });
    claim('GL-4', n, bad, 'ruler shift ' + said.join(' | '));
  }
  claim('GL-5', j5, b5, 'elements inside their bars and one Undo restores, over the committed cases (' + (j5 / 2) + ')' + (notes5.length ? ' — ' + notes5.join('; ') : ''));
  db.close(); finish();
})().catch(e => { console.error('§W_GL_ERROR ' + (e && e.stack || e)); process.exit(3); });
